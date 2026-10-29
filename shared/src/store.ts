import { useSyncExternalStore } from "react";
import { adaptarRespostas } from "./legado";
import { fotosDaResposta, soltarFotosCopiadas } from "./photos";
import { comRevisoesZeradas, mesmoLugar } from "./revisao";
import { createSeed } from "./seed";
import type { Answer, BlockApproval, FotoSalva, Inspection, Parecer, Store } from "./types";

export type { Answer, BlockApproval, Inspection, Store };

const KEY = "dime.vistoria.v2";

let fotosMigradas = false;
let gravarAoAbrir = false;
let state: Store = load();
if (fotosMigradas || gravarAoAbrir) persist();
const listeners = new Set<() => void>();

function load(): Store {
  fotosMigradas = false;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createSeed();
    const parsed = JSON.parse(raw) as Store;
    if (!parsed.inspections || !parsed.answers || !parsed.approvals) return createSeed();
    const normalizadas = parsed.answers.map((answer) => {
      const fotos = fotosDaResposta(answer).map((foto) => ({ sharepointPath: foto.sharepointPath, previewUrl: "", observacao: foto.observacao || "" }));
      return {
        ...answer,
        comodo: answer.comodo || "",
        previewUrl: "",
        fotos,
        sharepointPath: fotos[0]?.sharepointPath || answer.sharepointPath || "",
      };
    });
    const soltas = soltarFotosCopiadas(normalizadas);
    fotosMigradas = soltas !== normalizadas;
    parsed.answers = soltas;
    const antigas = new Set(
      parsed.inspections
        .filter((item) => {
          const dia = String(item.data || "").slice(0, 10);
          return /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia < "2026-10-25";
        })
        .map((item) => item.id),
    );
    if (antigas.size) {
      gravarAoAbrir = true;
      parsed.inspections = parsed.inspections.filter((item) => !antigas.has(item.id));
      parsed.answers = parsed.answers.filter((item) => !antigas.has(item.inspectionId));
      parsed.approvals = parsed.approvals.filter((item) => !antigas.has(item.inspectionId));
    }
    return parsed;
  } catch {
    return createSeed();
  }
}

function persist() {
  const slim: Store = {
    ...state,
    answers: state.answers.map((answer) => {
      const fotos: FotoSalva[] = fotosDaResposta(answer)
        .filter((foto) => foto.sharepointPath)
        .map((foto) => ({ sharepointPath: foto.sharepointPath, previewUrl: "", observacao: foto.observacao || "" }));
      return { ...answer, previewUrl: "", fotos, sharepointPath: fotos[0]?.sharepointPath || "" };
    }),
  };
  localStorage.setItem(KEY, JSON.stringify(slim));
}

let afterChange: (id: string) => void = () => {};

export function watchInspections(listener: (id: string) => void) {
  afterChange = listener;
}

function emit(id?: string) {
  persist();
  if (id) afterChange(id);
  listeners.forEach((listener) => listener());
}

export function getStore() {
  return state;
}

export function subscribeStore(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore() {
  return useSyncExternalStore(subscribeStore, getStore, getStore);
}

export function resetDemo() {
  state = createSeed();
  emit();
}

export function dropInspections(ids: string[]) {
  const gone = new Set(ids.filter(Boolean));
  const removidas = state.inspections.filter((item) => gone.has(item.id));
  if (!removidas.length) return;
  let inspections = state.inspections.filter((item) => !gone.has(item.id));
  const vistas = new Set<string>();
  for (const removida of removidas) {
    const chave = `${removida.empreendimento}|${removida.bloco}|${removida.escopo || "unidade"}|${removida.escopo === "escada" ? removida.pavimento : removida.unidade}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    const ajustadas = new Map(comRevisoesZeradas(inspections.filter((item) => mesmoLugar(item, removida))).map((item) => [item.id, item]));
    inspections = inspections.map((item) => ajustadas.get(item.id) || item);
  }
  state = {
    ...state,
    inspections,
    answers: state.answers.filter((item) => !gone.has(item.inspectionId)),
    approvals: state.approvals.filter((item) => !gone.has(item.inspectionId)),
  };
  persist();
  listeners.forEach((listener) => listener());
}

function jaAssinada(id: string) {
  return state.inspections.some((item) => item.id === id && item.assinatura?.startsWith("data:image"));
}

export function upsertInspection(inspection: Inspection) {
  if (jaAssinada(inspection.id)) return;
  const exists = state.inspections.some((item) => item.id === inspection.id);
  state = {
    ...state,
    inspections: exists
      ? state.inspections.map((item) => (item.id === inspection.id ? inspection : item))
      : [inspection, ...state.inspections],
  };
  emit(inspection.id);
}

export function setAnswer(answer: Answer) {
  if (jaAssinada(answer.inspectionId)) return;
  const rest = state.answers.filter(
    (item) =>
      !(item.inspectionId === answer.inspectionId && item.codigo === answer.codigo && item.comodo === answer.comodo),
  );
  state = {
    ...state,
    answers: [...rest, answer],
    inspections: state.inspections.map((inspection) =>
      inspection.id === answer.inspectionId ? { ...inspection, updatedAt: new Date().toISOString() } : inspection,
    ),
  };
  emit(answer.inspectionId);
}

export function setApproval(approval: BlockApproval) {
  const rest = state.approvals.filter(
    (item) => !(item.inspectionId === approval.inspectionId && item.blockId === approval.blockId),
  );
  state = { ...state, approvals: [...rest, approval] };
  emit();
}

export function answersOf(store: Store, inspectionId: string) {
  return store.answers.filter((answer) => answer.inspectionId === inspectionId);
}

export function answerOf(store: Store, inspectionId: string, codigo: string, comodo = "") {
  return store.answers.find(
    (answer) => answer.inspectionId === inspectionId && answer.codigo === codigo && answer.comodo === comodo,
  );
}

export function answersDoItem(store: Store, inspectionId: string, codigo: string) {
  return store.answers.filter((answer) => answer.inspectionId === inspectionId && answer.codigo === codigo);
}

export function approvalOf(store: Store, inspectionId: string, blockId: string) {
  return store.approvals.find((item) => item.inspectionId === inspectionId && item.blockId === blockId);
}

export type DecisaoRemota = {
  id: string;
  parecer?: string;
  parecerEm?: string;
  empreendimento?: string;
  bloco?: string;
  unidade?: string;
  vistoriador?: string;
  data?: string;
  horaInicio?: string;
  horaFim?: string;
  clima?: string;
  revisao?: string;
  escopo?: string;
  pavimento?: string;
  updatedAt?: string;
  status?: string;
  assinatura?: string;
  assinante?: string;
  situacao?: string;
  responsavelObra?: string;
  answers?: { codigo: string; comodo?: string; mark: string; observacao: string; gravidade: string; sharepointPath: string; fotos?: (string | { sharepointPath?: string; observacao?: string })[] }[];
};

const DEMO = new Set(["insp-203", "insp-204", "insp-casa-15"]);

function parecerDe(valor?: string): Parecer {
  return valor === "aprovada" || valor === "reprovada" ? valor : "";
}

function respostasImportadas(row: DecisaoRemota, inspectionId = row.id) {
  return soltarFotosCopiadas(
    adaptarRespostas(row.answers || []).flatMap((answer) => {
      const mark = answer.mark === "C" || answer.mark === "NC" || answer.mark === "NA" ? answer.mark : "";
      if (!mark) return [];
      const gravidade = answer.gravidade === "L" || answer.gravidade === "M" || answer.gravidade === "C" ? answer.gravidade : "";
      return [
        {
          inspectionId,
          codigo: answer.codigo,
          comodo: answer.comodo || "",
          mark,
          observacao: answer.observacao || "",
          gravidade,
          sharepointPath: answer.sharepointPath || "",
          previewUrl: "",
          fotos: (answer.fotos || []).flatMap((foto) => {
            const caminho = typeof foto === "string" ? foto : foto?.sharepointPath || "";
            if (!caminho) return [];
            return [{ sharepointPath: caminho, previewUrl: "", observacao: typeof foto === "string" ? "" : foto.observacao || "" }];
          }),
        } satisfies Answer,
      ];
    }),
  );
}

function vistoriaImportada(row: DecisaoRemota): Inspection {
  const clima = row.clima === "sol" || row.clima === "nublado" || row.clima === "chuva" ? row.clima : "";
  const parecer = parecerDe(row.parecer);
  return {
    id: row.id,
    empreendimento: row.empreendimento || "",
    endereco: "",
    bloco: row.bloco || "",
    unidade: row.unidade || "",
    tipologia: "apartamento",
    quartos: "2",
    data: row.data || "",
    horaInicio: row.horaInicio || "",
    horaFim: row.horaFim || "",
    clima,
    vistoriador: row.vistoriador || "",
    cargo: "",
    responsavelTecnico: "",
    registroTecnico: "",
    revisao: row.revisao || "00",
    escopo: row.escopo === "escada" || row.escopo === "unidade" ? row.escopo : "unidade",
    pavimento: row.pavimento || "",
    leituraAgua: "",
    leituraEnergia: "",
    status: row.assinatura || parecer === "aprovada" || row.status === "concluida" ? "concluida" : "em_andamento",
    parecer,
    assinatura: row.assinatura || "",
    assinante: row.assinante || "",
    assinadoEm: row.parecerEm || "",
    situacao: row.situacao === "liberado" || row.situacao === "obra" || row.situacao === "aprovado" ? row.situacao : parecer === "aprovada" ? "aprovado" : parecer === "reprovada" ? "obra" : "vistoria",
    responsavelObra: row.responsavelObra || "",
    updatedAt: row.updatedAt || row.parecerEm || new Date().toISOString(),
  };
}

function chaveResposta(answer: { codigo: string; comodo?: string }) {
  return `${answer.codigo}|${answer.comodo || ""}`;
}

function marcaPreenchida(mark?: string) {
  return mark === "C" || mark === "NC" || mark === "NA";
}

function juntarRespostas(base: Answer[], porCima: Answer[]) {
  const mapa = new Map(base.map((item) => [chaveResposta(item), item]));
  for (const item of porCima) {
    const atual = mapa.get(chaveResposta(item));
    if (atual && marcaPreenchida(atual.mark) && !marcaPreenchida(item.mark)) continue;
    mapa.set(chaveResposta(item), item);
  }
  return [...mapa.values()];
}

function lugarDaVistoria(item: { empreendimento?: string; bloco?: string; unidade?: string; escopo?: string; pavimento?: string; data?: string; revisao?: string }) {
  const escopo = item.escopo === "escada" ? "escada" : "unidade";
  const alvo = escopo === "escada" ? item.pavimento || "" : item.unidade || "";
  return [item.empreendimento || "", item.bloco || "", escopo, alvo, item.revisao || "00"].join("|");
}

export function substituirPelaRemota(row: DecisaoRemota) {
  if (!row?.id || DEMO.has(row.id)) return;
  const imported = Array.isArray(row.answers) ? respostasImportadas(row) : null;
  const atual = state.inspections.find((item) => item.id === row.id);
  const remota = vistoriaImportada(row);
  const vistoria = atual
    ? {
        ...atual,
        status: remota.status || atual.status,
        vistoriador: remota.vistoriador || atual.vistoriador,
        data: remota.data || atual.data,
        horaInicio: remota.horaInicio || atual.horaInicio,
        horaFim: remota.horaFim || atual.horaFim,
        revisao: remota.revisao || atual.revisao,
        parecer: remota.parecer || atual.parecer,
        situacao: remota.situacao || atual.situacao,
        responsavelObra: remota.responsavelObra || atual.responsavelObra,
        assinatura: remota.assinatura || atual.assinatura,
        assinante: remota.assinante || atual.assinante,
        assinadoEm: remota.assinadoEm || atual.assinadoEm,
        updatedAt: remota.updatedAt || atual.updatedAt,
      }
    : remota;
  state = {
    ...state,
    inspections: atual ? state.inspections.map((item) => (item.id === row.id ? vistoria : item)) : [vistoria, ...state.inspections],
    answers: imported ? [...state.answers.filter((item) => item.inspectionId !== row.id), ...imported] : state.answers,
  };
  persist();
  listeners.forEach((listener) => listener());
}

export function absorbDecisions(rows: DecisaoRemota[], todas = false) {
  let next = state;
  let changed = false;
  for (const row of rows) {
    const parecer = parecerDe(row.parecer);
    if (DEMO.has(row.id)) continue;
    const current = next.inspections.find((item) => item.id === row.id);
    const lugar = lugarDaVistoria(row);
    const irma = current ? undefined : next.inspections.find((item) => lugarDaVistoria(item) === lugar);
    if (irma) {
      const imported = respostasImportadas(row, irma.id);
      const locais = next.answers.filter((item) => item.inspectionId === irma.id);
      const marcasRemotas = imported.filter((item) => marcaPreenchida(item.mark)).length;
      const marcasLocais = locais.filter((item) => marcaPreenchida(item.mark)).length;
      if (marcasRemotas > marcasLocais) {
        next = {
          ...next,
          answers: [...next.answers.filter((item) => item.inspectionId !== irma.id), ...juntarRespostas(imported, locais)],
          inspections: next.inspections.map((item) =>
            item.id === irma.id
              ? {
                  ...item,
                  status: row.status === "concluida" || parecer === "aprovada" ? "concluida" : item.status,
                  parecer: parecer || item.parecer,
                  vistoriador: item.vistoriador || row.vistoriador || "",
                  data: item.data || row.data || "",
                  horaInicio: item.horaInicio || row.horaInicio || "",
                  horaFim: item.horaFim || row.horaFim || "",
                }
              : item,
          ),
        };
        changed = true;
      }
      continue;
    }
    const vazias = current
      ? next.inspections.filter((item) => item.id !== row.id && lugarDaVistoria(item) === lugar && !next.answers.some((answer) => answer.inspectionId === item.id && marcaPreenchida(answer.mark)))
      : [];
    if (vazias.length && (row.answers || []).some((item) => marcaPreenchida(item.mark))) {
      const ids = new Set(vazias.map((item) => item.id));
      next = {
        ...next,
        inspections: next.inspections.filter((item) => !ids.has(item.id)),
        answers: next.answers.filter((item) => !ids.has(item.inspectionId)),
      };
      changed = true;
    }
    if (!current && !todas && !parecer) continue;
    if (!current) {
      const imported = respostasImportadas(row);
      next = {
        ...next,
        inspections: [vistoriaImportada(row), ...next.inspections],
        answers: [...next.answers.filter((item) => item.inspectionId !== row.id), ...imported],
      };
      changed = true;
      continue;
    }
    if (parecer && !(current.updatedAt > (row.parecerEm || ""))) {
      const assinada = Boolean(row.assinatura || current.assinatura);
      const status = assinada || parecer === "aprovada" || row.status === "concluida" ? "concluida" : current.status;
      const situacao = row.situacao === "liberado" || row.situacao === "obra" || row.situacao === "aprovado" ? row.situacao : parecer === "aprovada" ? "aprovado" : "obra";
      if (current.parecer !== parecer || current.status !== status || current.situacao !== situacao || (row.assinatura && current.assinatura !== row.assinatura) || (row.responsavelObra && current.responsavelObra !== row.responsavelObra)) {
        next = {
          ...next,
          inspections: next.inspections.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  status,
                  parecer,
                  situacao,
                  responsavelObra: row.responsavelObra || item.responsavelObra,
                  assinatura: row.assinatura || item.assinatura,
                  assinante: row.assinante || item.assinante,
                  assinadoEm: row.parecerEm || item.assinadoEm || "",
                  revisao: row.revisao || item.revisao,
                }
              : item,
          ),
        };
        changed = true;
      }
    }
    const remota = row.situacao === "liberado" || row.situacao === "obra" || row.situacao === "aprovado" ? row.situacao : "";
    const gravada = next.inspections.find((item) => item.id === row.id);
    if (gravada && remota && gravada.situacao !== remota) {
      next = {
        ...next,
        inspections: next.inspections.map((item) =>
          item.id === row.id ? { ...item, situacao: remota, responsavelObra: row.responsavelObra || item.responsavelObra } : item,
        ),
      };
      changed = true;
    }
    const assinada = next.inspections.find((item) => item.id === row.id);
    if (assinada && (row.parecerEm || row.assinante) && (!assinada.assinadoEm || !assinada.assinante)) {
      const assinadoEm = assinada.assinadoEm || row.parecerEm || "";
      const assinante = assinada.assinante || row.assinante || "";
      if (assinadoEm !== (assinada.assinadoEm || "") || assinante !== (assinada.assinante || "")) {
        next = {
          ...next,
          inspections: next.inspections.map((item) => (item.id === row.id ? { ...item, assinadoEm, assinante } : item)),
        };
        changed = true;
      }
    }
    const imported = respostasImportadas(row);
    if (current && imported.length) {
      const locais = next.answers.filter((item) => item.inspectionId === row.id);
      const servidorMaisNovo = (row.updatedAt || "") > (current.updatedAt || "");
      const juntos = servidorMaisNovo ? juntarRespostas(locais, imported) : juntarRespostas(imported, locais);
      const antes = locais.map((item) => `${chaveResposta(item)}:${item.mark}:${item.observacao}`).sort().join(";");
      const depois = juntos.map((item) => `${chaveResposta(item)}:${item.mark}:${item.observacao}`).sort().join(";");
      if (antes !== depois) {
        next = {
          ...next,
          answers: [...next.answers.filter((item) => item.inspectionId !== row.id), ...juntos],
        };
        changed = true;
      }
      if (servidorMaisNovo && (row.updatedAt || "") !== (current.updatedAt || "")) {
        next = {
          ...next,
          inspections: next.inspections.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  updatedAt: row.updatedAt || item.updatedAt,
                  horaFim: row.horaFim || item.horaFim,
                  horaInicio: row.horaInicio || item.horaInicio,
                  status: row.status === "concluida" ? "concluida" : item.status,
                }
              : item,
          ),
        };
        changed = true;
      }
    } else if (!next.answers.some((item) => item.inspectionId === row.id) && imported.length) {
      next = { ...next, answers: [...next.answers, ...imported] };
      changed = true;
    }
    const atual = next.inspections.find((item) => item.id === row.id);
    if (atual) {
      const preenchido = {
        vistoriador: atual.vistoriador || row.vistoriador || "",
        data: atual.data || row.data || "",
        horaInicio: atual.horaInicio || row.horaInicio || "",
        horaFim: atual.horaFim || row.horaFim || "",
      };
      if (
        preenchido.vistoriador !== atual.vistoriador ||
        preenchido.data !== atual.data ||
        preenchido.horaInicio !== atual.horaInicio ||
        preenchido.horaFim !== atual.horaFim
      ) {
        next = {
          ...next,
          inspections: next.inspections.map((item) => (item.id === row.id ? { ...item, ...preenchido } : item)),
        };
        changed = true;
      }
    }
  }
  if (!changed) return;
  state = next;
  persist();
  listeners.forEach((listener) => listener());
}
