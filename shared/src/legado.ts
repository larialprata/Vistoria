import mapa from "./legado.json";

type Destino = { codigo: string; comodo: string };
const destinos = mapa as Record<string, Destino>;

type FotoLinha = string | { sharepointPath?: string; observacao?: string };

export type LinhaLegada = {
  codigo: string;
  comodo?: string;
  mark?: string;
  marca?: string;
  observacao?: string;
  gravidade?: string;
  sharepointPath?: string;
  sharepoint_path?: string;
  fotos?: FotoLinha[];
  anotacoes?: string[];
};

function marcaDe(linha: LinhaLegada) {
  const valor = (linha.mark || linha.marca || "").toUpperCase();
  return valor === "C" || valor === "NC" || valor === "NA" ? valor : "";
}

function pesoMarca(marca: string) {
  if (marca === "NC") return 3;
  if (marca === "C") return 2;
  if (marca === "NA") return 1;
  return 0;
}

function pesoGravidade(valor: string) {
  if (valor === "C") return 3;
  if (valor === "M") return 2;
  if (valor === "L") return 1;
  return 0;
}

function caminhos(linha: LinhaLegada) {
  const lista = [
    ...(linha.fotos || []).map((foto) => (typeof foto === "string" ? foto : foto?.sharepointPath || "")),
    linha.sharepointPath || "",
    linha.sharepoint_path || "",
  ];
  return [...new Set(lista.map((item) => item.trim()).filter(Boolean))];
}

export function adaptarRespostas<T extends LinhaLegada>(linhas: T[]): T[] {
  const saida = new Map<string, T>();
  for (const linha of linhas) {
    const destino = destinos[linha.codigo];
    const codigo = destino?.codigo || linha.codigo;
    const comodo = destino?.comodo || linha.comodo || "";
    const vistoria = String((linha as { vistoria_id?: string }).vistoria_id || "");
    const chave = `${vistoria}\n${codigo}\n${comodo}`;
    const nova = { ...linha, codigo, comodo };
    const atual = saida.get(chave);
    saida.set(chave, atual ? juntar(atual, nova) : nova);
  }
  return [...saida.values()];
}

function juntar<T extends LinhaLegada>(atual: T, nova: T): T {
  const marca = pesoMarca(marcaDe(nova)) > pesoMarca(marcaDe(atual)) ? marcaDe(nova) : marcaDe(atual);
  const gravidade =
    pesoGravidade(nova.gravidade || "") > pesoGravidade(atual.gravidade || "") ? nova.gravidade || "" : atual.gravidade || "";
  const observacao = [...new Set([atual.observacao, nova.observacao].map((item) => (item || "").trim()).filter(Boolean))].join("\n");
  const fotos = caminhos(atual)
    .concat(caminhos(nova))
    .filter((caminho, indice, lista) => lista.indexOf(caminho) === indice);
  const principal = fotos[0] || "";
  return {
    ...atual,
    codigo: atual.codigo,
    comodo: atual.comodo || "",
    mark: "mark" in atual || "mark" in nova ? marca : atual.mark,
    marca: "marca" in atual || "marca" in nova ? marca : atual.marca,
    observacao,
    gravidade,
    sharepointPath: "sharepointPath" in atual || "sharepointPath" in nova ? principal : atual.sharepointPath,
    sharepoint_path: "sharepoint_path" in atual || "sharepoint_path" in nova ? principal : atual.sharepoint_path,
    fotos: fotos.map((caminho) => {
      const nota = [...(atual.fotos || []), ...(nova.fotos || [])].find((foto) =>
        typeof foto === "string" ? foto === caminho : foto?.sharepointPath === caminho,
      );
      return typeof nota === "string" || !nota ? caminho : { sharepointPath: caminho, observacao: nota.observacao || "" };
    }),
  };
}
