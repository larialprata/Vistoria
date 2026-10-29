import { decidirVistoria } from "@shared/accounts";
import { nomeDoEmpreendimento } from "@shared/catalog";
import { modeloDe } from "@shared/checklist";
import { quandoAssinou, statusLabel, unitTitle } from "@shared/labels";
import { baixarPdf } from "@shared/pdf";
import { rotuloRevisao, situacaoDa } from "@shared/revisao";
import { podeAssinarObra, podeAssinarVistoria, useAccount, veSomenteObra } from "@shared/session";
import { inspectionStats } from "@shared/stats";
import { useStore, upsertInspection } from "@shared/store";
import { publishInspection } from "@shared/sync";
import { BotaoTema } from "@shared/theme";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { MarcaNome } from "../components/Marca";
import "../phone.css";
import "./home.css";

type Escolha = "aprovada" | "reprovada" | "liberado" | "finalizar";

export function DecisaoPage() {
  const { id = "" } = useParams();
  const conta = useAccount();
  const store = useStore();
  const navigate = useNavigate();
  const inspection = store.inspections.find((item) => item.id === id);
  const [escolha, setEscolha] = useState<Escolha | "">("");
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);

  const podeVistoria = podeAssinarVistoria(conta);
  const podeObra = podeAssinarObra(conta);
  if (!podeVistoria && !podeObra) return <Navigate to="/vistorias" replace />;
  if (inspection && veSomenteObra(conta) && situacaoDa(inspection) !== "obra") return <Navigate to="/vistorias" replace />;
  if (!inspection) {
    return (
      <div>
        <header className="phone-bar">
          <button type="button" className="sheet-exit" onClick={() => navigate("/vistorias")}>
            Voltar
          </button>
        </header>
        <div className="phone-body">
          <p className="sync">Essa vistoria não está neste celular.</p>
        </div>
      </div>
    );
  }

  const revisao = rotuloRevisao(inspection.revisao);
  const stats = inspectionStats(store, inspection.id);
  const assinada = Boolean(inspection.assinatura);
  const atual = situacaoDa(inspection);

  async function gerar() {
    setGerando(true);
    setErro("");
    try {
      const atual = inspection!;
      const escopo = atual.escopo === "escada" ? "escada" : "unidade";
      const modelo = modeloDe(escopo);
      const respostas = store.answers
        .filter((item) => item.inspectionId === atual.id)
        .map((item) => ({
          codigo: item.codigo,
          comodo: item.comodo,
          marca: item.mark,
          observacao: item.observacao,
          fotos: [
            ...(item.fotos || []).map((foto) => foto.sharepointPath || foto.previewUrl),
            ...(item.fotos?.length ? [] : [item.sharepointPath || item.previewUrl]),
          ].filter((caminho): caminho is string => Boolean(caminho)),
          anotacoes: (item.fotos || []).map((foto) => foto.observacao || ""),
        }));
      const blocos = modelo.disciplinas
        .map((disciplina) => ({
          nome: disciplina.nome,
          itens: disciplina.itens
            .filter((item) => modelo.comodos.some((comodo) => marcaAceita(respostaDoComodo(respostas, item.codigo, comodo)?.marca || "")))
            .map((item) => ({
              texto: item.texto,
              criterio: item.criterio,
              salas: modelo.comodos.map((comodo) => {
                const sala = respostaDoComodo(respostas, item.codigo, comodo);
                if (!marcaAceita(sala?.marca || "")) return { texto: "", fotos: [] };
                return { texto: textoDaCelula(sala), fotos: fotosDaCelula(sala), nc: sala?.marca.toUpperCase() === "NC" };
              }),
            })),
        }))
        .filter((bloco) => bloco.itens.length > 0);
      const unidade = unitTitle(atual);
      const situacao = statusLabel(atual.status, atual.parecer, atual.assinatura, atual.situacao);
      const decisao = atual.parecer === "aprovada" ? "Aprovada" : atual.parecer === "reprovada" ? "Reprovada" : "";
      const quando = quandoAssinou(atual.assinadoEm || "");
      const horario = [atual.horaInicio, atual.horaFim].filter(Boolean).join(" – ");
      const celular = window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(display-mode: standalone)").matches;
      await baixarPdf({
        arquivo: `${unidade.replace(/[^\w]+/g, "-")}-Rev-${revisao || atual.revisao || "00"}.pdf`,
        compartilhar: celular,
        comodos: modelo.comodos.map((comodo) => comodo.nome),
        campos: [
          ["Empreendimento", nomeDoEmpreendimento(atual.empreendimento) || "—"],
          ["Data de vistoria", dataCurta(atual.data)],
          ["Realizado por", atual.vistoriador || "—"],
          ["Horário", horario || "—"],
          ["Unidade", unidade],
          ["Revisão", revisao || atual.revisao || "00"],
          ["Situação", situacao],
          ["Decisão", decisao ? [decisao, quando, atual.assinante].filter(Boolean).join(" · ") : "—"],
          ["Responsável", atual.responsavelObra || "—"],
        ],
        assinatura: atual.assinatura,
        blocos,
      });
    } catch {
      setErro("Não foi possível gerar o PDF.");
    } finally {
      setGerando(false);
    }
  }

  async function concluir(assinatura: string) {
    if (!escolha) return;
    setBusy(escolha);
    setErro("");
    try {
      await publishInspection(inspection!.id);
      await decidirVistoria(inspection!.id, escolha, assinatura, escolha === "liberado" || escolha === "finalizar" ? conta?.nome || "" : "");
      const assinadoEm = new Date().toISOString();
      const daObra = escolha === "liberado" || escolha === "finalizar";
      upsertInspection({
        ...inspection!,
        status: "concluida",
        parecer: escolha === "liberado" ? "reprovada" : escolha === "finalizar" ? "aprovada" : escolha,
        situacao: escolha === "aprovada" || escolha === "reprovada" ? "obra" : escolha === "finalizar" ? "aprovado" : "liberado",
        responsavelObra: daObra ? conta?.nome || inspection!.responsavelObra : inspection!.responsavelObra,
        assinatura: daObra ? inspection!.assinatura : assinatura,
        assinante: daObra ? inspection!.assinante : conta?.nome || "",
        assinadoEm: daObra ? inspection!.assinadoEm : assinadoEm,
        updatedAt: assinadoEm,
      });
      setEscolha("");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível concluir a vistoria.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <header className="phone-bar">
        <button type="button" className="sheet-exit" onClick={() => navigate("/vistorias")}>
          Voltar
        </button>
        <MarcaNome>
          <strong>DIMENSIONAL</strong>
          <small>Decisão da vistoria</small>
        </MarcaNome>
        <div className="phone-tools">
          <BotaoTema />
        </div>
      </header>
      <div className="phone-body">
        <h2>{unitTitle(inspection)}</h2>
        <p className="sync">
          {nomeDoEmpreendimento(inspection.empreendimento)}
          {revisao ? ` · vistoria ${revisao}` : ""}
          {inspection.vistoriador ? ` · ${inspection.vistoriador}` : ""}
        </p>
        <p className="sync">
          {stats.marked} de {stats.total} itens marcados
          {stats.nc ? ` · ${stats.nc} não conforme` : ""}
        </p>
        <p className={`pill ${inspection.parecer === "reprovada" ? "bad" : inspection.parecer === "aprovada" ? "ok" : "warn"}`}>
          {statusLabel(inspection.status, inspection.parecer, inspection.assinatura, inspection.situacao)}
        </p>
        <div className="decisao-acoes">
          <button type="button" className="nova" disabled={gerando} onClick={() => void gerar()}>
            {gerando ? "Gerando PDF..." : "Gerar PDF"}
          </button>
          {atual === "vistoria" && podeVistoria && !assinada ? (
            <>
              <button type="button" disabled={busy !== ""} onClick={() => setEscolha("aprovada")}>
                Aprovar
              </button>
              <button type="button" className="reprovar" disabled={busy !== ""} onClick={() => setEscolha("reprovada")}>
                Reprovar
              </button>
            </>
          ) : null}
          {atual === "obra" && podeObra && inspection.parecer === "aprovada" ? (
            <button type="button" disabled={busy !== ""} onClick={() => setEscolha("finalizar")}>
              Finalizar vistoria
            </button>
          ) : null}
          {atual === "obra" && podeObra && inspection.parecer !== "aprovada" ? (
            <button type="button" disabled={busy !== ""} onClick={() => setEscolha("liberado")}>
              Enviar para nova vistoria
            </button>
          ) : null}
        </div>
        {assinada && inspection.assinatura?.startsWith("data:image") ? (
          <figure className="assinatura-pronta">
            <img src={inspection.assinatura} alt="Assinatura de quem concluiu a vistoria" />
            <figcaption>
              {inspection.assinante || "Assinatura registrada"}
              {inspection.assinadoEm ? ` · ${quandoAssinou(inspection.assinadoEm)}` : ""}
            </figcaption>
          </figure>
        ) : null}
        {escolha ? (
          <Assinatura
            titulo={escolha === "aprovada" ? "Assine para aprovar" : escolha === "reprovada" ? "Assine para reprovar" : escolha === "finalizar" ? "Assine para finalizar" : "Assine para enviar a nova vistoria"}
            busy={busy === escolha}
            onCancel={() => setEscolha("")}
            onConfirm={(valor) => void concluir(valor)}
          />
        ) : null}
        {erro ? <p className="pending-photo">{erro}</p> : null}
        {atual === "obra" && inspection.parecer === "aprovada" ? <p className="sync">Obra. O responsável da obra assina para finalizar.</p> : null}
        {atual === "obra" && inspection.parecer !== "aprovada" ? <p className="sync">Obra. O responsável da obra assina para enviar a uma nova vistoria.</p> : null}
        {atual === "liberado" ? <p className="sync">Liberado para uma nova vistoria.</p> : null}
        {atual === "aprovado" ? <p className="sync">Aprovado. Não há nova revisão.</p> : null}
      </div>
    </div>
  );
}

type LinhaPdf = {
  codigo: string;
  comodo: string;
  marca: string;
  observacao: string;
  fotos: string[];
  anotacoes: string[];
};

function dataCurta(valor: string) {
  const dia = valor.slice(0, 10);
  const [ano, mes, d] = dia.split("-");
  if (ano && mes && d && ano.length === 4) return `${d}/${mes}/${ano}`;
  return valor || "—";
}

function respostaDoComodo(respostas: LinhaPdf[], codigo: string, comodo: { id: string; nome: string }) {
  return respostas.find((item) => {
    if (item.codigo !== codigo) return false;
    const texto = (item.comodo || "").trim().toLocaleLowerCase("pt-BR");
    return texto === comodo.id || texto === comodo.nome.toLocaleLowerCase("pt-BR");
  });
}

function fotosDaCelula(resposta?: LinhaPdf) {
  return [...new Set((resposta?.fotos || []).map((item) => item.trim()).filter(Boolean))];
}

function textoDaCelula(resposta?: LinhaPdf) {
  if (!resposta) return "";
  const marca = resposta.marca.toUpperCase();
  const notas = [resposta.observacao, ...resposta.anotacoes].map((item) => item.trim()).filter(Boolean);
  const unicas = [...new Set(notas)];
  if (marca === "NC") return unicas.join("\n") || "NC";
  if (marca === "C" || marca === "NA") return marca;
  return "";
}

function marcaAceita(marca: string) {
  const valor = marca.toUpperCase();
  return valor === "C" || valor === "NC" || valor === "NA";
}

function Assinatura({
  titulo,
  busy,
  onCancel,
  onConfirm,
}: {
  titulo: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (assinatura: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [vazia, setVazia] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const escala = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * escala));
    canvas.height = Math.max(1, Math.round(rect.height * escala));
    const contexto = canvas.getContext("2d");
    if (!contexto) return;
    contexto.scale(escala, escala);
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, rect.width, rect.height);
    contexto.strokeStyle = "#111111";
    contexto.lineWidth = 2.4;
    contexto.lineCap = "round";
    contexto.lineJoin = "round";
  }, []);

  function ponto(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function iniciar(event: PointerEvent<HTMLCanvasElement>) {
    const contexto = canvasRef.current?.getContext("2d");
    if (!contexto) return;
    const atual = ponto(event);
    contexto.beginPath();
    contexto.moveTo(atual.x, atual.y);
    desenhando.current = true;
    setVazia(false);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* O traço continua mesmo se o navegador não capturar o toque. */
    }
  }

  function mover(event: PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const contexto = canvasRef.current?.getContext("2d");
    if (!contexto) return;
    const atual = ponto(event);
    contexto.lineTo(atual.x, atual.y);
    contexto.stroke();
  }

  function soltar() {
    desenhando.current = false;
  }

  function limpar() {
    const canvas = canvasRef.current;
    const contexto = canvas?.getContext("2d");
    if (!canvas || !contexto) return;
    const rect = canvas.getBoundingClientRect();
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, rect.width, rect.height);
    contexto.strokeStyle = "#111111";
    contexto.lineWidth = 2.4;
    contexto.lineCap = "round";
    setVazia(true);
  }

  return (
    <section className="assinatura">
      <strong>{titulo}</strong>
      <canvas
        ref={canvasRef}
        onPointerDown={iniciar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      />
      <div className="decisao-acoes">
        <button type="button" onClick={limpar}>
          Limpar
        </button>
        <button
          type="button"
          className="nova"
          disabled={vazia || busy}
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas || vazia) return;
            onConfirm(canvas.toDataURL("image/jpeg", 0.7));
          }}
        >
          {busy ? "Concluindo..." : "Concluir com a assinatura"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </section>
  );
}
