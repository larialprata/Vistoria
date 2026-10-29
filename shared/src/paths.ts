import type { Inspection } from "./types";

/** Mesma ideia do abastecimento: o Postgres guarda este caminho, o arquivo fica na pasta. */
export function sanitizeSegment(raw: string) {
  const base = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "sem-nome";
}

export function empreendimentoFolder(value: string) {
  return sanitizeSegment(value.replace(/\s+e\s+/gi, "-"));
}

const AMBIENTE_FOLDER: Record<string, string> = {
  sala: "Sala",
  cozinha: "Cozinha",
  "area-servico": "Area-de-servico",
  banheiro: "Banheiro",
  quartos: "Quartos",
};

export function ambienteFolder(ambienteId: string) {
  return AMBIENTE_FOLDER[ambienteId] ?? sanitizeSegment(ambienteId);
}

export function unitFolders(inspection: Pick<Inspection, "tipologia" | "bloco" | "unidade" | "escopo" | "pavimento">) {
  if (inspection.escopo === "escada") {
    return {
      bloco: `Bloco-${sanitizeSegment(inspection.bloco || "s-n")}`,
      unidade: `Pavimento-${sanitizeSegment(inspection.pavimento || "s-n")}`,
    };
  }
  if (inspection.tipologia === "apartamento") {
    return {
      bloco: `Bloco-${sanitizeSegment(inspection.bloco || "s-n")}`,
      unidade: `Apto-${sanitizeSegment(inspection.unidade)}`,
    };
  }
  const kind = inspection.tipologia === "sobrado" ? "Sobrado" : "Casa";
  return {
    bloco: inspection.bloco ? sanitizeSegment(inspection.bloco) : kind,
    unidade: `${kind}-${sanitizeSegment(inspection.unidade)}`,
  };
}

export function revisionFolder(data: string, revisao: string) {
  const day = data || "sem-data";
  const rev = sanitizeSegment(revisao || "00").padStart(2, "0");
  return `${day}_rev-${rev}`;
}

export function sharePointFolder(
  inspection: Pick<Inspection, "empreendimento" | "tipologia" | "bloco" | "unidade" | "data" | "revisao" | "escopo" | "pavimento">,
  ambienteId?: string,
) {
  const unit = unitFolders(inspection);
  const parts = [
    "Vistorias",
    empreendimentoFolder(inspection.empreendimento),
    unit.bloco,
    unit.unidade,
    revisionFolder(inspection.data, inspection.revisao),
  ];
  if (ambienteId) parts.push(ambienteFolder(ambienteId));
  return parts.join("/");
}

export function pastaCategoria(nome: string) {
  return sanitizeSegment(nome.replace(/^\d+\.\s*/, ""));
}

export function sharePointPhotoPath(
  inspection: Pick<Inspection, "empreendimento" | "tipologia" | "bloco" | "unidade" | "data" | "revisao" | "escopo" | "pavimento">,
  ambienteId: string,
  codigo: string,
  ext = "jpg",
  extra = "",
  comodo = "",
  categoria = "",
) {
  const cleanExt = ext.replace(/^\./, "").toLowerCase() || "jpg";
  const base = comodo ? `${codigo}-${sanitizeSegment(comodo)}` : codigo;
  const nome = extra ? `${base}-${extra}` : base;
  const pasta = sharePointFolder(inspection);
  const grupo = categoria ? pastaCategoria(categoria) : ambienteId ? ambienteFolder(ambienteId) : "";
  return `${grupo ? `${pasta}/${grupo}` : pasta}/${nome}.${cleanExt}`;
}

export function extFromFile(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  if (file.type.includes("png")) return "png";
  if (file.type.includes("webp")) return "webp";
  return "jpg";
}
