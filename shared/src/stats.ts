import { celulaBloqueada, escopoDa, itensDo, modelos } from "./checklist";
import { fotosDaResposta } from "./photos";
import type { Store } from "./types";

function modelosDa(store: Store, inspectionId: string) {
  const escopo = escopoDa(store.inspections.find((item) => item.id === inspectionId)?.escopo);
  return escopo ? modelos.filter((modelo) => modelo.id === escopo) : modelos;
}

export function celulasAbertas(store: Store, inspectionId: string) {
  const answers = store.answers.filter((answer) => answer.inspectionId === inspectionId);
  return modelosDa(store, inspectionId).flatMap((modelo) =>
    modelo.disciplinas.flatMap((disciplina) =>
      disciplina.itens.flatMap((item) =>
        modelo.comodos
          .filter((comodo) => {
            const answer = answers.find((row) => row.codigo === item.codigo && row.comodo === comodo.id);
            return !celulaBloqueada(item, comodo.id) || Boolean(answer);
          })
          .map((comodo) => ({
            codigo: item.codigo,
            comodo: comodo.id,
            disciplinaId: disciplina.id,
            answer: answers.find((row) => row.codigo === item.codigo && row.comodo === comodo.id),
          })),
      ),
    ),
  );
}

export function inspectionStats(store: Store, inspectionId: string) {
  const cells = celulasAbertas(store, inspectionId);
  const marked = cells.filter((cell) => cell.answer?.mark === "C" || cell.answer?.mark === "NC" || cell.answer?.mark === "NA");
  const nc = marked.filter((cell) => cell.answer?.mark === "NC");
  const pendingPhotos = cells.filter(
    (cell) => cell.answer?.mark === "NC" && fotosDaResposta(cell.answer).length === 0,
  ).length;
  return {
    total: cells.length,
    marked: marked.length,
    conforme: marked.filter((cell) => cell.answer?.mark === "C").length,
    na: marked.filter((cell) => cell.answer?.mark === "NA").length,
    nc: nc.length,
    critical: 0,
    pendingPhotos,
    progress: cells.length === 0 ? 0 : marked.length / cells.length,
  };
}

export function disciplinaStats(store: Store, inspectionId: string, disciplinaId: string) {
  const cells = celulasAbertas(store, inspectionId).filter((cell) => cell.disciplinaId === disciplinaId);
  const marked = cells.filter((cell) => cell.answer?.mark === "C" || cell.answer?.mark === "NC" || cell.answer?.mark === "NA");
  return {
    total: cells.length,
    marked: marked.length,
    nc: marked.filter((cell) => cell.answer?.mark === "NC").length,
    complete: marked.length === cells.length && cells.length > 0,
  };
}

export function itensDoEscopo(escopo?: Parameters<typeof itensDo>[0]) {
  return itensDo(escopo);
}
