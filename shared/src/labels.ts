import { situacaoDa } from "./revisao";
import type { Clima, Inspection, Mark, Severity, Tipologia } from "./types";

export function titleCasePt(value: string) {
  const lower = value.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}

export function blockLabel(id: string, nome: string) {
  if (id === "2.2") return "Piso e paredes";
  return titleCasePt(nome);
}

export function markLabel(mark: Mark) {
  if (mark === "C") return "Conforme";
  if (mark === "NC") return "Não conforme";
  return "Não se aplica";
}

export function severityLabel(severity: Severity) {
  if (severity === "L") return "Leve";
  if (severity === "M") return "Média";
  return "Crítica";
}

export function climaLabel(clima: Clima) {
  if (clima === "sol") return "Sol";
  if (clima === "nublado") return "Nublado";
  return "Chuva";
}

export function tipologiaLabel(tipologia: Tipologia) {
  if (tipologia === "apartamento") return "Apartamento";
  if (tipologia === "casa") return "Casa";
  return "Sobrado";
}

export const PAVIMENTOS = [
  { id: "1", nome: "Primeiro pavimento" },
  { id: "2", nome: "Segundo pavimento" },
  { id: "3", nome: "Terceiro pavimento" },
  { id: "4", nome: "Quarto pavimento" },
] as const;

export function nomePavimento(pavimento?: string) {
  return PAVIMENTOS.find((item) => item.id === pavimento)?.nome || "";
}

export function unitTitle(inspection: Pick<Inspection, "tipologia" | "bloco" | "unidade" | "escopo" | "pavimento">) {
  if (inspection.escopo === "escada") {
    const bloco = inspection.bloco ? `Bloco ${inspection.bloco}` : "Bloco";
    const piso = nomePavimento(inspection.pavimento);
    return piso ? `${bloco} · ${piso}` : `${bloco} · Escada e hall`;
  }
  if (inspection.tipologia === "apartamento") {
    const bloco = inspection.bloco ? `Bloco ${inspection.bloco}` : "Bloco";
    return `${bloco} · Apto ${inspection.unidade}`;
  }
  const kind = tipologiaLabel(inspection.tipologia);
  const bloco = inspection.bloco ? ` · ${inspection.bloco}` : "";
  return `${kind} ${inspection.unidade}${bloco}`;
}

export function dataDaVistoria(valor?: string) {
  const dia = (valor || "").slice(0, 10);
  const [ano, mes, d] = dia.split("-");
  if (ano && mes && d && ano.length === 4) return `${d}/${mes}/${ano}`;
  return "";
}

export function horarioDaVistoria(inicio?: string, fim?: string) {
  const hora = (valor?: string) => {
    const texto = (valor || "").slice(0, 5);
    return /^\d{2}:\d{2}$/.test(texto) ? texto : "";
  };
  const a = hora(inicio);
  const b = hora(fim);
  if (a && b && a !== b) return `${a}–${b}`;
  return a || b;
}

export function quandoDaVistoria(data?: string, inicio?: string, fim?: string) {
  return [dataDaVistoria(data), horarioDaVistoria(inicio, fim)].filter(Boolean).join(" · ");
}

export function quandoAssinou(valor: string) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  const dia = data.toLocaleDateString("pt-BR");
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} às ${hora}`;
}

export function statusLabel(status: Inspection["status"], parecer?: Inspection["parecer"], assinatura = "", situacao = "") {
  void status;
  void assinatura;
  const atual = situacaoDa({ parecer, situacao });
  if (atual === "aprovado") return "Aprovado";
  if (atual === "liberado") return "Liberado";
  if (atual === "obra") return "Obra";
  return "Vistoria";
}
