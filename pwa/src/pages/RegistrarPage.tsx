import { loadRemotePlaces, nomeDoEmpreendimento, type RemotePlace } from "@shared/catalog";
import { celulaBloqueada, disciplinasDaVistoria, itemByCode, nomeDoComodo, type ItemCampo } from "@shared/checklist";
import { sharePointPhotoPath } from "@shared/paths";
import { arquivoDaCamera, fotosDaResposta, marcarFotoEnviada, marcarFotoFalhou, stagePhoto, usarFotosParadas } from "@shared/photos";
import { nomePavimento, PAVIMENTOS } from "@shared/labels";
import { mesmoLugar, portaDaNovaRevisao, rotuloRevisao, situacaoDa } from "@shared/revisao";
import { currentUser } from "@shared/session";
import { celulasAbertas, disciplinaStats, inspectionStats } from "@shared/stats";
import { answersDoItem, getStore, setAnswer, upsertInspection, useStore } from "@shared/store";
import type { Escopo, FotoSalva, Inspection, Mark } from "@shared/types";
import { Camera } from "lucide-react";
import { FotoDoCampo } from "../components/FotoDoCampo";
import { NotaCampo } from "../components/NotaCampo";
import { Marca } from "../components/Marca";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { obraAtual, placeDaObra, useObra } from "../obra";
import "./home.css";

const MARKS: { id: Mark; short: string }[] = [
  { id: "C", short: "C" },
  { id: "NC", short: "NC" },
  { id: "NA", short: "NA" },
];

function newId() {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* No celular, pelo IP da rede, o navegador não oferece randomUUID. */
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

type Preset = { inspectionId?: string };

export function RegistrarPage() {
  const store = useStore();
  const navigate = useNavigate();
  const obra = useObra();
  const preset = (useLocation().state ?? null) as Preset | null;
  const opened = store.inspections.find((item) => item.id === preset?.inspectionId);
  const [remotePlaces, setRemotePlaces] = useState<RemotePlace[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingPlaces, setLoadingPlaces] = useState(true);
  const [localId, setLocalId] = useState("");
  const [blocoId, setBlocoId] = useState("");
  const [apartmentKey, setApartmentKey] = useState("");
  const [pavimento, setPavimento] = useState(opened?.escopo === "escada" ? opened.pavimento || "" : "");
  const [inspectionId, setInspectionId] = useState(opened?.id ?? "");
  const [escopo, setEscopo] = useState<Escopo | "">(opened?.escopo === "escada" ? "escada" : opened ? "unidade" : "");
  const disciplinas = disciplinasDaVistoria(escopo || undefined);
  const [disciplinaId, setDisciplinaId] = useState(disciplinas[0]?.id ?? "");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [trava, setTrava] = useState("");
  const [pendentes, setPendentes] = useState<string[]>([]);
  const sheetRef = useRef<HTMLDivElement>(null);

  const inspection = store.inspections.find((item) => item.id === inspectionId);
  const disciplina = disciplinas.find((item) => item.id === disciplinaId) ?? disciplinas[0];

  const stats = inspection ? inspectionStats(store, inspection.id) : null;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("vistoria-view", { detail: true }));
    function onSair() {
      navigate("/");
    }
    window.addEventListener("vistoria-sair", onSair);
    return () => {
      window.removeEventListener("vistoria-sair", onSair);
      window.dispatchEvent(new CustomEvent("vistoria-view", { detail: false }));
    };
  }, [navigate]);

  const place = remotePlaces.find((item) => item.id === localId);
  const blocks = [...new Set((place?.apartments ?? []).map((item) => item.bloco))].sort((a, b) =>
    a.localeCompare(b, "pt", { numeric: true }),
  );
  const apartments = (place?.apartments ?? []).filter((item) => item.bloco === blocoId);

  useEffect(() => {
    let active = true;
    const snapshot = opened;
    loadRemotePlaces().then((result) => {
      if (!active) return;
      setRemotePlaces(result.places);
      setLoadError(result.error);
      setLoadingPlaces(false);
      const daObra = placeDaObra(result.places, obraAtual());
      if (!snapshot) {
        if (daObra) setLocalId(daObra.id);
        return;
      }
      const match = result.places.find((item) => nomeDoEmpreendimento(item.nome) === nomeDoEmpreendimento(snapshot.empreendimento))
        || (snapshot.empreendimento && daObra && placeDaObra([daObra], snapshot.empreendimento) ? daObra : undefined);
      if (!match) return;
      setLocalId(match.id);
      if (snapshot.escopo === "escada") {
        setBlocoId(snapshot.bloco);
        setPavimento(snapshot.pavimento || "");
        return;
      }
      const apartment = match.apartments.find(
        (item) => item.bloco === snapshot.bloco && item.unidade === snapshot.unidade,
      );
      if (!apartment) return;
      setBlocoId(apartment.bloco);
      setApartmentKey(apartment.key);
    });
    return () => {
      active = false;
    };
  }, [opened?.id]);

  useEffect(() => {
    if (!escopo) return;
    const lista = disciplinasDaVistoria(escopo);
    if (!lista.some((item) => item.id === disciplinaId)) setDisciplinaId(lista[0]?.id ?? "");
  }, [escopo, disciplinaId]);

  function alvoSelecionado() {
    if (!place || !escopo || !blocoId) return null;
    if (escopo === "escada") {
      if (!pavimento) return null;
      return {
        empreendimento: place.nome,
        bloco: blocoId,
        unidade: "",
        escopo: "escada" as const,
        pavimento,
      };
    }
    const apartment = place.apartments.find((item) => item.key === apartmentKey);
    if (!apartment || apartment.bloco !== blocoId) return null;
    return {
      empreendimento: place.nome,
      bloco: apartment.bloco,
      unidade: apartment.unidade,
      escopo: "unidade" as const,
      pavimento: "",
    };
  }

  function iniciar() {
    const alvo = alvoSelecionado();
    if (!place || !alvo) return;
    const mesmas = getStore().inspections.filter((item) => mesmoLugar(item, alvo));
    const found = mesmas.find((item) => item.status === "em_andamento" && situacaoDa(item) === "vistoria");
    if (found) {
      setTrava("");
      setInspectionId(found.id);
      return;
    }
    const porta = portaDaNovaRevisao(mesmas);
    if (!porta.ok) {
      setTrava(porta.motivo);
      return;
    }
    const id = newId();
    const now = new Date();
    setTrava("");
    setInspectionId(id);
    upsertInspection({
      id,
      empreendimento: place.nome,
      endereco: "",
      bloco: alvo.bloco,
      unidade: alvo.unidade,
      tipologia: "apartamento",
      quartos: "2",
      escopo: alvo.escopo,
      pavimento: alvo.pavimento,
      data: now.toISOString().slice(0, 10),
      horaInicio: now.toTimeString().slice(0, 5),
      horaFim: "",
      clima: "",
      vistoriador: currentUser() || "Equipe de campo",
      cargo: "Vistoriador",
      responsavelTecnico: "",
      registroTecnico: "",
      revisao: porta.revisao,
      leituraAgua: "",
      leituraEnergia: "",
      status: "em_andamento",
      updatedAt: now.toISOString(),
    });
  }

  useEffect(() => {
    const alvo = alvoSelecionado();
    if (!alvo) return;
    const mesmas = getStore().inspections.filter((item) => mesmoLugar(item, alvo));
    const found = mesmas.find((item) => item.status === "em_andamento" && situacaoDa(item) === "vistoria");
    if (found) {
      setTrava("");
      if (found.escopo !== alvo.escopo) upsertInspection({ ...found, escopo: alvo.escopo, updatedAt: new Date().toISOString() });
      if (found.id !== inspectionId) setInspectionId(found.id);
      return;
    }
    if (opened && mesmoLugar(opened, alvo)) {
      setTrava("");
      if (opened.id !== inspectionId) setInspectionId(opened.id);
      return;
    }
    const porta = portaDaNovaRevisao(mesmas);
    if (!porta.ok) {
      setTrava(porta.motivo);
      if (inspectionId) setInspectionId("");
      return;
    }
    setTrava("");
    const atual = inspectionId ? getStore().inspections.find((item) => item.id === inspectionId) : null;
    if (atual && mesmoLugar(atual, alvo)) return;
    if (inspectionId) setInspectionId("");
  }, [apartmentKey, place, inspectionId, escopo, pavimento, blocoId, opened]);

  useEffect(() => {
    if (!inspection) return;
    sheetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [inspection?.id]);

  const disciplinaConta = useMemo(() => {
    if (!inspection || !disciplina) return { marked: 0, total: 0 };
    return disciplinaStats(store, inspection.id, disciplina.id);
  }, [inspection, disciplina, store]);

  function chooseBlock(bloco: string) {
    setBlocoId(bloco);
    const mesma = opened && place && nomeDoEmpreendimento(place.nome) === nomeDoEmpreendimento(opened.empreendimento) && opened.bloco === bloco && (opened.escopo || "unidade") === (escopo || "unidade");
    if (mesma && opened?.escopo === "escada") {
      setPavimento(opened.pavimento || "");
      setInspectionId(opened.id);
      return;
    }
    const apartment = place?.apartments.find(
      (item) => mesma && item.bloco === bloco && item.unidade === opened?.unidade,
    );
    if (apartment && opened) {
      setApartmentKey(apartment.key);
      setInspectionId(opened.id);
      return;
    }
    setApartmentKey("");
    setInspectionId("");
  }

  function apartamentoConfere(alvo = inspection) {
    if (!alvo || !escopo || (alvo.escopo || "unidade") !== escopo) return false;
    if (!place) return true;
    if (escopo === "escada") {
      if (!pavimento) return true;
      return alvo.bloco === blocoId && (alvo.pavimento || "") === pavimento;
    }
    if (!apartmentKey) return true;
    const apartment = place.apartments.find((item) => item.key === apartmentKey);
    return Boolean(apartment && alvo.bloco === apartment.bloco && alvo.unidade === apartment.unidade);
  }

  function chooseApartment(key: string) {
    setApartmentKey(key);
    const apartment = place?.apartments.find((item) => item.key === key);
    const mesma =
      inspection &&
      apartment &&
      (inspection.escopo || "unidade") === "unidade" &&
      inspection.bloco === apartment.bloco &&
      inspection.unidade === apartment.unidade;
    if (!mesma) setInspectionId("");
  }

  function choosePavimento(value: string) {
    setPavimento(value);
    const mesma = inspection?.escopo === "escada" && inspection.bloco === blocoId && (inspection.pavimento || "") === value;
    if (!value || !mesma) setInspectionId("");
  }

  function chooseEscopo(value: Escopo) {
    setEscopo(value);
    if ((inspection?.escopo || "unidade") !== value) setInspectionId("");
  }

  function saveMark(item: ItemCampo, comodo: string, mark: Mark | "") {
    if (!inspection || !apartamentoConfere() || inspection.assinatura?.startsWith("data:image")) return;
    const irmaos = answersDoItem(getStore(), inspection.id, item.codigo);
    const atual = irmaos.find((row) => row.comodo === comodo);
    const nota = irmaos.find((row) => row.observacao)?.observacao || "";
    const fotos = fotosDaResposta(atual ?? {});
    setAnswer({
      inspectionId: inspection.id,
      codigo: item.codigo,
      comodo,
      mark,
      observacao: nota,
      gravidade: "",
      fotos,
      sharepointPath: fotos[0]?.sharepointPath || "",
      previewUrl: fotos[0]?.previewUrl || "",
    });
  }

  function patchNota(codigo: string, observacao: string) {
    if (!inspection || !apartamentoConfere() || inspection.assinatura?.startsWith("data:image")) return;
    const linhas = answersDoItem(getStore(), inspection.id, codigo);
    for (const linha of linhas) {
      setAnswer({ ...linha, observacao, previewUrl: linha.previewUrl || "" });
    }
  }

  function aplicarFotos(vistoriaId: string, codigo: string, comodo: string, fotos: FotoSalva[]) {
    const atual = getStore().inspections.find((item) => item.id === vistoriaId);
    if (!atual || atual.assinatura?.startsWith("data:image")) return;
    const linha = answersDoItem(getStore(), vistoriaId, codigo).find((row) => row.comodo === comodo);
    setAnswer({
      inspectionId: vistoriaId,
      codigo,
      comodo,
      mark: linha?.mark === "NC" || linha?.mark === "NA" ? linha.mark : "C",
      observacao: linha?.observacao || "",
      gravidade: linha?.gravidade || "",
      fotos,
      sharepointPath: fotos[0]?.sharepointPath || "",
      previewUrl: fotos[0]?.previewUrl || "",
    });
  }

  function onPhoto(item: ItemCampo, comodo: string, file: File) {
    if (!inspection || !apartamentoConfere()) return;
    const apartment = place?.apartments.find((item) => item.key === apartmentKey);
    const vistoria = escopo === "unidade" && apartment ? { ...inspection, bloco: apartment.bloco, unidade: apartment.unidade, escopo: "unidade" as const } : inspection;
    const vistoriaId = inspection.id;
    setPhotoError(null);
    const linha = answersDoItem(getStore(), vistoriaId, item.codigo).find((row) => row.comodo === comodo);
    const atuais = fotosDaResposta(linha ?? {});
    const extra = atuais.length === 0 ? "" : String(Date.now());
    const path = sharePointPhotoPath(vistoria, item.disciplinaId, item.codigo, "jpg", extra, comodo, item.disciplinaNome);
    const previewUrl = URL.createObjectURL(file);
    aplicarFotos(vistoriaId, item.codigo, comodo, [...atuais, { sharepointPath: path, previewUrl, observacao: "" }]);
    setPendentes((lista) => [...lista, path]);
    void stagePhoto(file, path)
      .then((uploaded) => {
        const agora = fotosDaResposta(answersDoItem(getStore(), vistoriaId, item.codigo).find((row) => row.comodo === comodo) ?? {});
        const proximas = agora.map((foto) =>
          foto.sharepointPath === path || foto.previewUrl === previewUrl
            ? { ...foto, sharepointPath: uploaded.sharepointPath, previewUrl: uploaded.previewUrl || foto.previewUrl }
            : foto,
        );
        const ficou = proximas.some((foto) => foto.sharepointPath === uploaded.sharepointPath);
        aplicarFotos(
          vistoriaId,
          item.codigo,
          comodo,
          ficou ? proximas : [...proximas, { sharepointPath: uploaded.sharepointPath, previewUrl: uploaded.previewUrl, observacao: "" }],
        );
        if (uploaded.warning) setPhotoError(uploaded.warning);
      })
      .catch((error: unknown) => {
        marcarFotoFalhou(path);
        setPhotoError(error instanceof Error ? error.message : "Falha ao guardar a foto.");
      })
      .finally(() => setPendentes((lista) => lista.filter((itemPath) => itemPath !== path)));
  }

  function anotarFoto(codigo: string, comodo: string, caminho: string, observacao: string) {
    if (!inspection || !apartamentoConfere()) return;
    const vistoriaId = inspection.id;
    const linha = answersDoItem(getStore(), vistoriaId, codigo).find((row) => row.comodo === comodo);
    const fotos = fotosDaResposta(linha ?? {}).map((foto) => (foto.sharepointPath === caminho ? { ...foto, observacao } : foto));
    aplicarFotos(vistoriaId, codigo, comodo, fotos);
  }

  function onRemovePhoto(codigo: string, comodo: string, caminho: string) {
    if (!inspection || !apartamentoConfere()) return;
    const vistoriaId = inspection.id;
    const linha = answersDoItem(getStore(), vistoriaId, codigo).find((row) => row.comodo === comodo);
    const atuais = fotosDaResposta(linha ?? {});
    marcarFotoEnviada(caminho);
    aplicarFotos(vistoriaId, codigo, comodo, atuais.filter((foto) => foto.sharepointPath !== caminho));
  }

  return (
    <div className="desk">
      <header className="mast">
        <div className="mast-mark">
          <Marca />
        </div>
        <div>
          <p className="mast-kicker">Dimensional · campo</p>
          <h1>Registrar</h1>
          <p>Escolha a vistoria, o local, o bloco e o apartamento ou o pavimento.</p>
        </div>
      </header>

      <div className="choices">
        <div className="choice">
          <span>Vistoria</span>
          <div className="kind">
            <button type="button" className={escopo === "unidade" ? "is-on" : ""} onClick={() => chooseEscopo("unidade")}>
              Unidade
            </button>
            <button type="button" className={escopo === "escada" ? "is-on" : ""} onClick={() => chooseEscopo("escada")}>
              Escada e hall
            </button>
          </div>
        </div>
        <label>
          Obra
          <input className="field" value={obra} readOnly />
        </label>
        {!loadingPlaces && !place ? <p className="pending-photo">Esta obra ainda não tem blocos cadastrados.</p> : null}
        <label>
          Bloco
          <select className="field" value={blocoId} onChange={(event) => chooseBlock(event.target.value)} disabled={!place}>
            <option value="">Escolher</option>
            {blocks.map((item) => (
              <option key={item} value={item}>
                Bloco {item}
              </option>
            ))}
          </select>
        </label>
        {escopo === "escada" ? (
          <label>
            Pavimento
            <select className="field" value={pavimento} onChange={(event) => choosePavimento(event.target.value)} disabled={!blocoId}>
              <option value="">Escolher</option>
              {PAVIMENTOS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Apartamento
            <select className="field" value={apartmentKey} onChange={(event) => chooseApartment(event.target.value)} disabled={!blocoId}>
              <option value="">Escolher</option>
              {apartments.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {loadError ? <p className="pending-photo">{loadError}</p> : null}
        {trava ? <p className="pending-photo">{trava}</p> : null}
        {place && escopo && blocoId && (escopo === "escada" ? pavimento : apartmentKey) && !trava && !(inspection && apartamentoConfere()) ? (
          <button type="button" className="iniciar-vistoria" onClick={iniciar}>
            Iniciar
          </button>
        ) : null}
      </div>

      {inspection && disciplina && stats && escopo && apartamentoConfere() ? (
        <div ref={sheetRef}>
        <Sheet
          inspection={inspection}
          escopo={escopo}
          disciplinaId={disciplina.id}
          onDisciplina={setDisciplinaId}
          stats={stats}
          disciplinaMarked={disciplinaConta.marked}
          disciplinaTotal={disciplinaConta.total}
          storeAnswers={store.answers}
          photoError={photoError}
          pendentes={pendentes}
          onLeave={() => window.dispatchEvent(new Event("vistoria-sair"))}
          onMark={saveMark}
          onPatch={patchNota}
          onPhoto={onPhoto}
          onPhotoError={() => setPhotoError("O celular não entregou a foto. Tente outra vez.")}
          onRemovePhoto={onRemovePhoto}
          onNotePhoto={anotarFoto}
          onFinish={() => {
            if (inspection.assinatura?.startsWith("data:image")) return;
            const now = new Date();
            upsertInspection({
              ...inspection,
              status: "concluida",
              parecer: "",
              horaFim: now.toTimeString().slice(0, 5),
              updatedAt: now.toISOString(),
            });
          }}
        />
        </div>
      ) : null}
    </div>
  );
}

function Sheet(props: {
  inspection: Inspection;
  escopo: Escopo;
  disciplinaId: string;
  onDisciplina: (id: string) => void;
  stats: { marked: number; total: number; nc: number; critical: number; progress: number };
  disciplinaMarked: number;
  disciplinaTotal: number;
  storeAnswers: ReturnType<typeof useStore>["answers"];
  photoError: string | null;
  pendentes: string[];
  onLeave: () => void;
  onMark: (item: ItemCampo, comodo: string, mark: Mark | "") => void;
  onPatch: (codigo: string, observacao: string) => void;
  onPhoto: (item: ItemCampo, comodo: string, file: File) => void;
  onPhotoError: () => void;
  onRemovePhoto: (codigo: string, comodo: string, caminho: string) => void;
  onNotePhoto: (codigo: string, comodo: string, caminho: string, observacao: string) => void;
  onFinish: () => void;
}) {
  const fotosParadas = usarFotosParadas();
  const disciplinas = disciplinasDaVistoria(props.escopo);
  const disciplina = disciplinas.find((item) => item.id === props.disciplinaId) ?? disciplinas[0];
  const percent = props.disciplinaTotal ? Math.round((props.disciplinaMarked / props.disciplinaTotal) * 100) : 0;
  const answers = props.storeAnswers.filter((answer) => answer.inspectionId === props.inspection.id);
  const abertas = celulasAbertas({ inspections: [props.inspection], answers, approvals: [] }, props.inspection.id);
  const missingMarks = abertas.filter((cell) => cell.answer?.mark !== "C" && cell.answer?.mark !== "NC" && cell.answer?.mark !== "NA").length;
  const missingPhotos = abertas.filter(
    (cell) => cell.answer?.mark === "NC" && fotosDaResposta(cell.answer ?? {}).length === 0,
  ).length;
  const canFinish = missingMarks === 0 && missingPhotos === 0;
  const finished = props.inspection.status === "concluida";
  const assinada = Boolean(props.inspection.assinatura?.startsWith("data:image"));
  const [mostraFaltas, setMostraFaltas] = useState(false);
  const faltas = abertas
    .filter((cell) => cell.answer?.mark !== "C" && cell.answer?.mark !== "NC" && cell.answer?.mark !== "NA")
    .map((cell) => ({
      codigo: cell.codigo,
      texto: itemByCode(cell.codigo)?.texto || "",
      comodo: nomeDoComodo(cell.comodo, props.escopo),
      disciplinaId: cell.disciplinaId,
    }));

  return (
    <section className="sheet">
      <div className="sheet-bar">
        <button type="button" className="sheet-exit" onClick={props.onLeave}>
          Sair
        </button>
      </div>
      <div className="cartouche">
        <div>
          <span>Empreendimento</span>
          <strong>{nomeDoEmpreendimento(props.inspection.empreendimento)}</strong>
        </div>
        <div>
          <span>Bloco</span>
          <strong>{props.inspection.bloco}</strong>
        </div>
        <div>
          <span>{props.inspection.escopo === "escada" ? "Pavimento" : "Apto"}</span>
          <strong>{props.inspection.escopo === "escada" ? nomePavimento(props.inspection.pavimento) : props.inspection.unidade}</strong>
        </div>
        {rotuloRevisao(props.inspection.revisao) ? (
          <div>
            <span>Vistoria</span>
            <strong>{rotuloRevisao(props.inspection.revisao)}</strong>
          </div>
        ) : null}
      </div>
      <p className="path-line">Marque C, NC ou NA em cada cômodo. O traço é um cômodo em que o item não existe; toque para avaliar mesmo assim.</p>
      {assinada ? <p className="pending-photo">Vistoria assinada. Nada mais pode ser alterado.</p> : null}
      {props.photoError ? <p className="pending-photo">{props.photoError}</p> : null}
      <div className="legend">
        <i><span className="dot c" /> C conforme</i>
        <i><span className="dot nc" /> NC não conforme</i>
        <i><span className="dot na" /> NA não se aplica</i>
      </div>
      <p className="tab-grupo">{disciplinas[0]?.modeloNome}</p>
      <div className="tabs">
        {disciplinas.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === disciplina?.id ? "is-on" : ""}
            onClick={() => props.onDisciplina(item.id)}
          >
            {item.nome.replace(/^\d+\.\s*/, "")}
          </button>
        ))}
      </div>
      <div className="progress-row">
        <span>
          {props.disciplinaMarked}/{props.disciplinaTotal} nesta disciplina · {props.stats.nc} NC
        </span>
        <span>{percent}%</span>
      </div>
      <div className="bar">
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="block-head">
        <h2>{disciplina?.nome}</h2>
      </div>
      {disciplina?.itens.map((item) => {
        const campo = itemByCode(item.codigo);
        if (!campo) return null;
        const linhas = answers.filter((row) => row.codigo === item.codigo);
        const nota = linhas.find((row) => row.observacao)?.observacao || "";
        const temNc = linhas.some((row) => row.mark === "NC");
        return (
          <article key={item.codigo} className={`item ${temNc ? "is-nc" : ""}`}>
            <div>
              <div className="item-code">{item.codigo.replace(/^E/, "")}</div>
              <p>{item.texto}</p>
              <p className="folder">{item.criterio}</p>
            </div>
            {disciplina?.comodos.map((comodo) => {
              const bloqueada = celulaBloqueada(item, comodo.id);
              const answer = linhas.find((row) => row.comodo === comodo.id);
              const aberta = !bloqueada || Boolean(answer);
              const fotos = fotosDaResposta(answer ?? {});
              const pedeFoto = answer?.mark === "C" || answer?.mark === "NC";
              return (
                <div key={comodo.id} className="room-block">
                  <div className="room-line">
                    <span>{comodo.nome}</span>
                    {aberta ? (
                      <div className="marks">
                        {MARKS.map((mark) => (
                          <button
                            key={mark.id}
                            type="button"
                            className={answer?.mark === mark.id ? `on-${mark.id.toLowerCase()}` : ""}
                            disabled={assinada}
                            onClick={() => props.onMark(campo, comodo.id, mark.id)}
                          >
                            {mark.short}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button type="button" className="room-lock" disabled={assinada} onClick={() => props.onMark(campo, comodo.id, "")}>
                        —
                      </button>
                    )}
                  </div>
                  {pedeFoto ? (
                    <div className="nc-box">
                      {fotos.length > 0 ? (
                        <div className="shots">
                          {fotos.map((foto) => (
                            <figure key={foto.sharepointPath || foto.previewUrl} className="shot-card">
                              <FotoDoCampo path={foto.sharepointPath} previewUrl={foto.previewUrl} className="shot" textoClassName="pending-photo" />
                              {props.pendentes.includes(foto.sharepointPath) ? (
                                <p className="pending-photo">Enviando para a pasta</p>
                              ) : fotosParadas.includes(foto.sharepointPath) ? (
                                <p className="pending-photo">Falta enviar para a pasta</p>
                              ) : null}
                              <NotaCampo
                                className="shot-note"
                                placeholder="Observação"
                                value={foto.observacao}
                                readOnly={assinada}
                                onChange={(texto) => props.onNotePhoto(item.codigo, comodo.id, foto.sharepointPath, texto)}
                              />
                              <button type="button" className="remove-photo" disabled={assinada} onClick={() => props.onRemovePhoto(item.codigo, comodo.id, foto.sharepointPath)}>
                                Remover
                              </button>
                            </figure>
                          ))}
                        </div>
                      ) : null}
                      {fotos.length === 0 && !assinada ? (
                        <label className="photo-btn">
                          <Camera className="h-4 w-4" />
                          Tirar foto
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="photo-file"
                            disabled={assinada}
                            onChange={(event) => {
                              const input = event.currentTarget;
                              void arquivoDaCamera(input).then((file) => {
                                if (file) props.onPhoto(campo, comodo.id, file);
                                else props.onPhotoError();
                              });
                            }}
                          />
                        </label>
                      ) : null}
                      {fotos.length > 0 && !assinada ? (
                        <label className="add-photo">
                          +
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="photo-file"
                            onChange={(event) => {
                              const input = event.currentTarget;
                              void arquivoDaCamera(input).then((file) => {
                                if (file) props.onPhoto(campo, comodo.id, file);
                                else props.onPhotoError();
                              });
                            }}
                          />
                        </label>
                      ) : null}
                      {answer?.mark === "NC" && fotos.length === 0 ? <p className="pending-photo">Foto obrigatória neste cômodo.</p> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {temNc ? (
              <div className="nc-box">
                <NotaCampo
                  placeholder="Cômodo e descrição do problema"
                  value={nota}
                  readOnly={assinada}
                  onChange={(texto) => props.onPatch(item.codigo, texto)}
                />
              </div>
            ) : null}
          </article>
        );
      })}
      {props.photoError ? <p className="pending-photo">{props.photoError}</p> : null}
      <div className="finish">
        {props.inspection.parecer === "reprovada" ? (
          <p className="pending-photo">Esta vistoria está com a obra. A próxima revisão abre quando ela for liberada.</p>
        ) : null}
        {finished ? (
          <p>Vistoria finalizada.</p>
        ) : (
          <>
            {missingMarks > 0 ? (
              <button type="button" className="finish-faltas" onClick={() => setMostraFaltas((aberto) => !aberto)}>
                Falta marcar {missingMarks} {missingMarks === 1 ? "item" : "itens"} com C, NC ou NA.
              </button>
            ) : (
              <p>Todos os itens estão marcados.</p>
            )}
            {missingPhotos > 0 ? (
              <p>
                Falta a foto em {missingPhotos} {missingPhotos === 1 ? "cômodo" : "cômodos"}.
              </p>
            ) : null}
            {mostraFaltas && faltas.length > 0 ? (
              <ul className="faltas">
                {faltas.map((falta) => (
                  <li key={`${falta.codigo}:${falta.comodo}`}>
                    <button type="button" onClick={() => props.onDisciplina(falta.disciplinaId)}>
                      <strong>{falta.codigo.replace(/^E/, "")}</strong> {falta.texto}
                      <small>{falta.comodo}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
        <button type="button" className="finish-go" disabled={!canFinish || finished || assinada} onClick={props.onFinish}>
          {finished ? "Vistoria finalizada" : "Finalizar vistoria"}
        </button>
      </div>
      <button type="button" className="to-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        Subir ao topo
      </button>
    </section>
  );
}
