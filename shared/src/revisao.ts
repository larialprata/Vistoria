import { nomeDoEmpreendimento } from "./catalog";
import type { Inspection } from "./types";

export type SituacaoVistoria = "vistoria" | "obra" | "liberado" | "aprovado";

export function situacaoDa(item: { parecer?: string; situacao?: string }): SituacaoVistoria {
  if (item.situacao === "liberado") return "liberado";
  if (item.situacao === "aprovado") return "aprovado";
  if (item.situacao === "obra") return "obra";
  if (item.parecer === "aprovada") return "aprovado";
  if (item.parecer === "reprovada") return "obra";
  return "vistoria";
}

export function detalheDaSituacao(situacao: SituacaoVistoria, parecer = "") {
  if (situacao === "aprovado") return "Sem nova revisão";
  if (situacao === "liberado") return "Para nova vistoria";
  if (situacao === "obra") return parecer === "aprovada" ? "Aguardando finalização" : "Aguardando o responsável da obra";
  return "Em andamento";
}

type Lugar = Pick<Inspection, "empreendimento" | "bloco" | "unidade" | "escopo" | "pavimento">;

export function mesmoLugar(item: Lugar, alvo: Lugar) {
  if (nomeDoEmpreendimento(item.empreendimento) !== nomeDoEmpreendimento(alvo.empreendimento) || item.bloco !== alvo.bloco) return false;
  if ((alvo.escopo || "unidade") === "escada") {
    return item.escopo === "escada" && (item.pavimento || "") === (alvo.pavimento || "");
  }
  return (item.escopo || "unidade") === "unidade" && item.unidade === alvo.unidade;
}

export function portaDaNovaRevisao(anteriores: Pick<Inspection, "parecer" | "revisao" | "updatedAt" | "situacao" | "status">[]) {
  if (anteriores.length === 0) return { ok: true as const, revisao: "00" };
  const ultima = [...anteriores].sort((a, b) => (Number(b.revisao) || 0) - (Number(a.revisao) || 0) || (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0];
  const situacao = situacaoDa(ultima);
  if (situacao === "aprovado") return { ok: false as const, motivo: "Esta unidade está aprovada. Não há nova revisão." };
  if (situacao === "obra") return { ok: false as const, motivo: "A obra ainda não liberou a nova vistoria." };
  if (situacao === "liberado") {
    const maior = anteriores.reduce((maximo, item) => Math.max(maximo, Number(item.revisao) || 0), 0);
    return { ok: true as const, revisao: String(maior + 1).padStart(3, "0") };
  }
  return { ok: false as const, motivo: "Esta vistoria ainda está em andamento." };
}

export function revisaoNaOrdem(indice: number) {
  return indice === 0 ? "00" : String(indice).padStart(3, "0");
}

export function comRevisoesZeradas<T extends { id: string; revisao?: string; updatedAt?: string }>(itens: T[]): T[] {
  const ordenadas = [...itens].sort(
    (a, b) => (Number(a.revisao) || 0) - (Number(b.revisao) || 0) || (a.updatedAt || "").localeCompare(b.updatedAt || "") || a.id.localeCompare(b.id),
  );
  const numeros = new Map(ordenadas.map((item, indice) => [item.id, revisaoNaOrdem(indice)]));
  return itens.map((item) => {
    const revisao = numeros.get(item.id);
    return revisao && item.revisao !== revisao ? { ...item, revisao } : item;
  });
}

export function rotuloRevisao(revisao?: string) {
  const valor = (revisao || "").trim();
  if (!valor || valor === "00" || valor === "000" || Number(valor) === 0) return "00";
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return String(numero).padStart(3, "0");
}
