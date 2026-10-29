import { celulaBloqueada, disciplinaPorId, itemByCode } from "@shared/checklist";
import { extFromFile, sharePointPhotoPath } from "@shared/paths";
import { arquivoDaCamera, fotosDaResposta, marcarFotoEnviada, marcarFotoFalhou, stagePhoto, usarFotosParadas } from "@shared/photos";
import { answerOf, answersDoItem, getStore, setAnswer, useStore } from "@shared/store";
import type { Mark } from "@shared/types";
import { Camera, ChevronLeft } from "lucide-react";
import { FotoDoCampo } from "../components/FotoDoCampo";
import { NotaCampo } from "../components/NotaCampo";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const MARKS: Mark[] = ["C", "NC", "NA"];

export function ChecklistPage() {
  const { id = "", ambienteId = "" } = useParams();
  const navigate = useNavigate();
  const store = useStore();
  const inspection = store.inspections.find((item) => item.id === id);
  const disciplina = disciplinaPorId(ambienteId);
  const [erro, setErro] = useState("");
  const fotosParadas = usarFotosParadas();

  if (!inspection || !disciplina) {
    return (
      <div className="px-4 pt-8">
        <p>Disciplina não encontrada.</p>
        <Link to="/" className="btn-primary mt-4">Voltar</Link>
      </div>
    );
  }

  const vistoria = inspection;
  const bloco = disciplina;
  const assinada = Boolean(inspection.assinatura?.startsWith("data:image"));

  function marcar(codigo: string, comodo: string, mark: Mark | "") {
    if (assinada) return;
    const irmaos = answersDoItem(getStore(), inspection!.id, codigo);
    const atual = irmaos.find((row) => row.comodo === comodo);
    const nota = irmaos.find((row) => row.observacao)?.observacao || "";
    const fotos = fotosDaResposta(atual ?? {});
    setAnswer({
      inspectionId: inspection!.id,
      codigo,
      comodo,
      mark,
      observacao: nota,
      gravidade: "",
      fotos,
      sharepointPath: fotos[0]?.sharepointPath || "",
      previewUrl: fotos[0]?.previewUrl || "",
    });
  }

  return (
    <div className="space-y-3 px-4 pt-4">
      <button type="button" onClick={() => navigate(`/vistoria/${inspection.id}`)} className="inline-flex items-center gap-1 text-sm font-medium text-stone-500">
        <ChevronLeft className="h-4 w-4" />
        Disciplinas
      </button>
      <h1 className="text-2xl font-semibold">{disciplina.nome}</h1>
      {assinada ? <p className="text-sm font-semibold text-accent">Vistoria assinada. Nada mais pode ser alterado.</p> : null}
      {disciplina.itens.map((item) => {
        const campo = itemByCode(item.codigo);
        return (
          <article key={item.codigo} className="card space-y-2 p-4">
            <p className="font-mono text-[11px] font-semibold text-accent">{item.codigo.replace(/^E/, "")}</p>
            <p>{item.texto}</p>
            <p className="text-sm text-stone-500">{item.criterio}</p>
            {disciplina.comodos.map((comodo) => {
              const answer = answerOf(store, inspection.id, item.codigo, comodo.id);
              const aberta = !celulaBloqueada(item, comodo.id) || Boolean(answer);
              const fotos = fotosDaResposta(answer ?? {});
              const pedeFoto = answer?.mark === "C" || answer?.mark === "NC";
              function guardar(file: File) {
                if (!campo || assinada) return;
                const linhaInicial = answersDoItem(getStore(), vistoria.id, item.codigo).find((row) => row.comodo === comodo.id);
                const atuais = fotosDaResposta(linhaInicial ?? {});
                const extra = atuais.length === 0 ? "" : String(Date.now());
                const path = sharePointPhotoPath(vistoria, bloco.id, item.codigo, extFromFile(file), extra, comodo.id, bloco.nome);
                const previewUrl = URL.createObjectURL(file);
                const base = linhaInicial ?? {
                  inspectionId: vistoria.id,
                  codigo: item.codigo,
                  comodo: comodo.id,
                  mark: "C" as const,
                  observacao: "",
                  gravidade: "" as const,
                  sharepointPath: "",
                  previewUrl: "",
                };
                const imediatas = [...atuais, { sharepointPath: path, previewUrl, observacao: "" }];
                setAnswer({ ...base, fotos: imediatas, sharepointPath: imediatas[0]?.sharepointPath || "", previewUrl: imediatas[0]?.previewUrl || "" });
                stagePhoto(file, path)
                  .then((uploaded) => {
                    const linha = answersDoItem(getStore(), vistoria.id, item.codigo).find((row) => row.comodo === comodo.id);
                    const baseLinha = linha ?? base;
                    const proximas = fotosDaResposta(baseLinha)
                      .map((foto) =>
                        foto.sharepointPath === path || foto.previewUrl === previewUrl
                          ? { ...foto, sharepointPath: uploaded.sharepointPath, previewUrl: uploaded.previewUrl || foto.previewUrl }
                          : foto,
                      );
                    const ficou = proximas.some((foto) => foto.sharepointPath === uploaded.sharepointPath);
                    const fotos = ficou
                      ? proximas
                      : [...proximas, { sharepointPath: uploaded.sharepointPath, previewUrl: uploaded.previewUrl, observacao: "" }];
                    setAnswer({
                      ...baseLinha,
                      fotos,
                      sharepointPath: fotos[0]?.sharepointPath || "",
                      previewUrl: fotos[0]?.previewUrl || "",
                    });
                    if (uploaded.warning) setErro(uploaded.warning);
                  })
                  .catch((error: unknown) => {
                    marcarFotoFalhou(path);
                    setErro(error instanceof Error ? error.message : "Falha ao guardar a foto.");
                  });
              }
              return (
                <div key={comodo.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">{comodo.nome}</span>
                    {aberta ? (
                      <div className="flex gap-1">
                        {MARKS.map((mark) => (
                          <button key={mark} type="button" className="rounded-xl border px-3 py-1 text-sm font-bold" disabled={assinada} onClick={() => marcar(item.codigo, comodo.id, mark)}>
                            {answer?.mark === mark ? `• ${mark}` : mark}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button type="button" className="text-sm text-stone-400" disabled={assinada} onClick={() => campo && marcar(item.codigo, comodo.id, "")}>—</button>
                    )}
                  </div>
                  {pedeFoto ? (
                    <div className="space-y-2">
                      {fotos.map((foto) => (
                        <div key={foto.sharepointPath || foto.previewUrl} className="space-y-1">
                          <FotoDoCampo path={foto.sharepointPath} previewUrl={foto.previewUrl} className="w-full rounded-xl object-cover" textoClassName="text-sm text-stone-500" />
                          {fotosParadas.includes(foto.sharepointPath) ? <p className="text-sm font-semibold text-accent">Falta enviar para a pasta</p> : null}
                          <NotaCampo
                            rows={2}
                            className="field w-full"
                            placeholder="Observação"
                            value={foto.observacao}
                            readOnly={assinada}
                            onChange={(texto) => {
                              if (assinada) return;
                              const linha = answersDoItem(getStore(), vistoria.id, item.codigo).find((row) => row.comodo === comodo.id);
                              if (!linha) return;
                              const fotosNota = fotosDaResposta(linha).map((itemFoto) =>
                                itemFoto.sharepointPath === foto.sharepointPath ? { ...itemFoto, observacao: texto } : itemFoto,
                              );
                              setAnswer({
                                ...linha,
                                fotos: fotosNota,
                                sharepointPath: fotosNota[0]?.sharepointPath || "",
                                previewUrl: fotosNota[0]?.previewUrl || "",
                              });
                            }}
                          />
                          <button
                            type="button"
                            className="text-sm font-semibold text-accent"
                            disabled={assinada}
                            onClick={() => {
                              if (assinada) return;
                              const linha = answersDoItem(getStore(), inspection.id, item.codigo).find((row) => row.comodo === comodo.id);
                              if (!linha) return;
                              marcarFotoEnviada(foto.sharepointPath);
                              const restantes = fotosDaResposta(linha).filter((itemFoto) => itemFoto.sharepointPath !== foto.sharepointPath);
                              setAnswer({
                                ...linha,
                                fotos: restantes,
                                sharepointPath: restantes[0]?.sharepointPath || "",
                                previewUrl: restantes[0]?.previewUrl || "",
                              });
                            }}
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                      {fotos.length === 0 && !assinada ? (
                        <label className="btn-primary relative w-full overflow-hidden">
                          <Camera className="h-4 w-4" /> Tirar foto
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            onChange={(event) => {
                              const input = event.currentTarget;
                              void arquivoDaCamera(input).then((file) => {
                                if (file) guardar(file);
                                else setErro("O celular não entregou a foto. Tente outra vez.");
                              });
                            }}
                          />
                        </label>
                      ) : null}
                      {fotos.length > 0 && !assinada ? (
                        <label className="relative flex h-11 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed text-2xl">
                          +
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            onChange={(event) => {
                              const input = event.currentTarget;
                              void arquivoDaCamera(input).then((file) => {
                                if (file) guardar(file);
                                else setErro("O celular não entregou a foto. Tente outra vez.");
                              });
                            }}
                          />
                        </label>
                      ) : null}
                      {answer?.mark === "NC" && fotos.length === 0 ? <p className="text-sm font-semibold text-accent">Foto obrigatória neste cômodo.</p> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </article>
        );
      })}
      {erro ? <p className="text-sm text-accent">{erro}</p> : null}
    </div>
  );
}
