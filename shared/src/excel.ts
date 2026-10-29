import { descricaoDoItem, escopoDa, modelos, nomeDoComodo } from "@shared/checklist";
import type { Escopo } from "@shared/types";
import { currentAccount } from "@shared/session";
import { apiBase } from "./photos";
import ExcelJS from "exceljs";
import topoUrl from "./marca/topo-logo.jpg";
import rodapeUrl from "./marca/rodape.jpg";

export type LinhaPlanilha = {
  codigo: string;
  comodo?: string;
  marca: string;
  observacao: string;
  gravidade: string;
  foto: string;
  fotos?: string[];
  anotacoes?: string[];
  texto?: string;
};

type Planilha = {
  empreendimento: string;
  data: string;
  vistoriador: string;
  horario: string;
  unidade: string;
  revisao: string;
  situacao: string;
  decisao?: string;
  responsavelObra?: string;
  assinatura?: string;
  assinante?: string;
  escopo?: Escopo;
  marcas?: ("C" | "NC" | "NA")[];
  respostas: LinhaPlanilha[];
};

const FONTE = "Calibri";
const VERMELHO = "FFEA2628";
const PRETO = "FF141416";
const VERMELHO_CLARO = "FFFFB4B4";
const CINZA_CLARO = "FFF2F3F5";
const TINTA = "FF3A3A42";
const BRANCO = "FFFFFFFF";
const CINZA = "FF6E6E76";
const NEVE = "FFF6F6F7";
const LINHA = "FFE4E4E8";
const NC = "FFFDECEE";
const BLOQUEADO = "FFF3F3F5";

const BORDA: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: LINHA } },
  left: { style: "thin", color: { argb: LINHA } },
  bottom: { style: "thin", color: { argb: LINHA } },
  right: { style: "thin", color: { argb: LINHA } },
};

const LARGURA_COMODO = 30;
const LARGURA_IMAGEM = 180;
const ALTURA_IMAGEM = 132;

function carregarImagem(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("foto"));
    };
    image.src = url;
  });
}

async function fotoNaCelula(path: string) {
  const api = apiBase();
  const token = currentAccount()?.token;
  if (!path || !api || !token) return null;
  const response = await fetch(`${api}/fotos?path=${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const bitmap = await createImageBitmap(await response.blob(), { resizeWidth: 240, resizeQuality: "medium" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const contexto = canvas.getContext("2d");
  if (!contexto) {
    bitmap.close();
    return null;
  }
  contexto.drawImage(bitmap, 0, 0);
  bitmap.close();
  const arquivo = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.55));
  return arquivo ? arquivo.arrayBuffer() : null;
}

function solido(cell: ExcelJS.Cell, fill: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
}

function pintar(cell: ExcelJS.Cell, fill?: string, fonte?: Partial<ExcelJS.Font>) {
  cell.border = BORDA;
  cell.alignment = { vertical: "middle", wrapText: true, horizontal: "left" };
  cell.font = { name: FONTE, size: 11, color: { argb: PRETO }, ...fonte };
  if (fill) solido(cell, fill);
}

function risco(aba: ExcelJS.Worksheet, linha: number, colunas: number) {
  aba.getRow(linha).height = 5;
  for (let coluna = 1; coluna <= colunas; coluna += 1) {
    const cell = aba.getCell(linha, coluna);
    solido(cell, VERMELHO_CLARO);
    cell.border = {};
  }
}

function faixa(aba: ExcelJS.Worksheet, linha: number, colunas: number, fill: string, fonte: Partial<ExcelJS.Font>, altura: number) {
  aba.getRow(linha).height = altura;
  for (let coluna = 1; coluna <= colunas; coluna += 1) {
    const cell = aba.getCell(linha, coluna);
    solido(cell, fill);
    cell.font = { name: FONTE, ...fonte };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: fill } },
      left: { style: "thin", color: { argb: fill } },
      right: { style: "thin", color: { argb: fill } },
      bottom: { style: "medium", color: { argb: fill === CINZA_CLARO ? "FFFF9A9A" : fill } },
    };
  }
}

export async function baixarPlanilha(entrada: Planilha) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dimensional";
  workbook.created = new Date();
  const [topoBytes, rodapeBytes] = await Promise.all([fetch(topoUrl), fetch(rodapeUrl)].map(async (pedido) => new Uint8Array(await (await pedido).arrayBuffer())));
  const topoId = workbook.addImage({ buffer: topoBytes as unknown as ExcelJS.Buffer, extension: "jpeg" });
  const rodapeId = workbook.addImage({ buffer: rodapeBytes as unknown as ExcelJS.Buffer, extension: "jpeg" });

  function colunaNoPixel(larguras: number[], pixelAlvo: number) {
    const pixel = 8;
    let percorrido = 0;
    for (let indice = 0; indice < larguras.length; indice += 1) {
      const coluna = larguras[indice] * pixel;
      if (percorrido + coluna >= pixelAlvo) return indice + (pixelAlvo - percorrido) / coluna;
      percorrido += coluna;
    }
    return Math.max(0, larguras.length - 1);
  }

  function colunaDireita(larguras: number[], imagem: number) {
    const total = larguras.reduce((soma, item) => soma + item, 0) * 8;
    return colunaNoPixel(larguras, Math.max(0, total - imagem));
  }

  function colunaCentral(larguras: number[], imagem: number) {
    const total = larguras.reduce((soma, item) => soma + item, 0) * 8;
    return colunaNoPixel(larguras, Math.max(0, (total - imagem) / 2));
  }

  function timbrar(aba: ExcelJS.Worksheet, larguras: number[], ultimaLinha: number, aoLado?: [string, string][]) {
    const alturaTopo = 62;
    const larguraTopo = Math.round(alturaTopo * (1024 / 322));
    aba.getRow(1).height = 78;
    if (aoLado?.length) {
      aoLado.slice(0, 3).forEach(([rotulo, valor], indice) => {
        const cell = aba.getCell(1, indice + 1);
        cell.value = {
          richText: [
            { font: { name: FONTE, bold: true, size: 9, color: { argb: CINZA } }, text: `${rotulo}\n` },
            { font: { name: FONTE, bold: true, size: 14, color: { argb: PRETO } }, text: valor || "—" },
          ],
        };
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
      });
    } else {
      const marca = aba.getCell(1, 1);
      marca.value = "DIMENSIONAL";
      marca.font = { name: FONTE, bold: true, size: 20, color: { argb: TINTA } };
      marca.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    }
    aba.addImage(topoId, {
      tl: { col: colunaDireita(larguras, larguraTopo), row: 0.12 },
      ext: { width: larguraTopo, height: alturaTopo },
      editAs: "oneCell",
    });
    risco(aba, ultimaLinha + 1, larguras.length);
    const rodape = ultimaLinha + 2;
    const larguraRodape = Math.min(560, Math.max(360, larguras.reduce((soma, item) => soma + item, 0) * 6));
    const alturaRodape = Math.round(larguraRodape * (121 / 1024));
    aba.getRow(rodape).height = Math.round(alturaRodape * 0.8) + 8;
    aba.addImage(rodapeId, {
      tl: { col: colunaCentral(larguras, larguraRodape), row: rodape - 1 + 0.2 },
      ext: { width: larguraRodape, height: alturaRodape },
      editAs: "oneCell",
    });
    aba.pageSetup = {
      ...aba.pageSetup,
      printTitlesRow: "1:1",
    };
  }

  const capa = workbook.addWorksheet("Identificação");
  capa.properties.tabColor = { argb: "FFFF9A9A" };
  capa.views = [{ showGridLines: false }];
  capa.columns = [{ width: 28 }, { width: 54 }];
  capa.getRow(1).height = 78;
  risco(capa, 2, 2);
  capa.mergeCells("A3:B3");
  faixa(capa, 3, 2, CINZA_CLARO, { bold: true, size: 18, color: { argb: TINTA } }, 34);
  capa.getCell("A3").value = "RELATÓRIO DE VISTORIA";
  risco(capa, 4, 2);
  const campos: [string, string, boolean][] = [
    ["Empreendimento", entrada.empreendimento || "—", false],
    ["Data da realização", entrada.data || "—", true],
    ["Realizada por", entrada.vistoriador || "—", true],
    ["Horário", entrada.horario || "—", false],
    ["Unidade", entrada.unidade || "—", false],
    ["Revisão", entrada.revisao || "00", false],
    ["Situação", entrada.situacao || "—", false],
    ["Decisão", entrada.decisao || "—", false],
    ["Responsável", entrada.responsavelObra || "—", false],
  ];
  campos.forEach(([rotulo, valor, destaque], indice) => {
    const linha = indice + 6;
    const rotuloCell = capa.getCell(linha, 1);
    const valorCell = capa.getCell(linha, 2);
    rotuloCell.value = rotulo.toUpperCase();
    valorCell.value = valor;
    pintar(rotuloCell, CINZA_CLARO, { bold: true, size: 10, color: { argb: TINTA } });
    pintar(valorCell, destaque ? VERMELHO_CLARO : BRANCO, { bold: destaque, size: destaque ? 16 : 12, color: { argb: TINTA } });
    rotuloCell.border = { ...BORDA, left: { style: "medium", color: { argb: "FFFF9A9A" } } };
    capa.getRow(linha).height = destaque ? 30 : 24;
  });

  let ultimaCapa = 5 + campos.length;
  if (entrada.assinatura?.startsWith("data:image")) {
    const imagem = await fetch(entrada.assinatura);
    const bytes = new Uint8Array(await imagem.arrayBuffer());
    const desenho = await carregarImagem(new Blob([bytes]));
    const id = workbook.addImage({ buffer: bytes as unknown as ExcelJS.Buffer, extension: entrada.assinatura.includes("image/png") ? "png" : "jpeg" });
    const linhaNome = ultimaCapa + 2;
    const linhaAssinatura = linhaNome + 2;
    const rotulo = capa.getCell(linhaNome, 1);
    const nome = capa.getCell(linhaNome, 2);
    rotulo.value = "ASSINADO POR";
    nome.value = entrada.assinante || "—";
    pintar(rotulo, CINZA_CLARO, { bold: true, size: 10, color: { argb: TINTA } });
    pintar(nome, BRANCO, { bold: true, size: 14, color: { argb: PRETO } });
    capa.getRow(linhaNome).height = 26;
    const proporcao = Math.max(1.2, (desenho.naturalWidth || 320) / Math.max(1, desenho.naturalHeight || 120));
    const larguraAssinatura = Math.min(300, Math.round(92 * proporcao));
    const alturaAssinatura = Math.round(larguraAssinatura / proporcao);
    capa.getRow(linhaAssinatura).height = Math.round(alturaAssinatura * 0.8) + 16;
    capa.addImage(id, {
      tl: { col: 1.15, row: linhaAssinatura - 1 + 0.12 },
      ext: { width: larguraAssinatura, height: alturaAssinatura },
      editAs: "oneCell",
    });
    ultimaCapa = linhaAssinatura;
  }
  timbrar(capa, [28, 54], ultimaCapa);

  const fotos = new Map<string, ArrayBuffer | null>();
  const ids = new Map<string, number>();
  const caminhosDaLinha = (row: LinhaPlanilha) => {
    const lista = [...(row.fotos || []), row.foto || ""].map((item) => item.trim()).filter(Boolean);
    return [...new Set(lista)];
  };
  const marcaSalva = (marca: string) => {
    const valor = marca.toUpperCase();
    return valor === "C" || valor === "NC" || valor === "NA" ? valor : "";
  };
  const escolhidas = new Set((entrada.marcas ?? ["C", "NC", "NA"]).map((marca) => marca.toUpperCase()));
  const marcaAceita = (marca: string) => {
    const valor = marcaSalva(marca);
    return valor && escolhidas.has(valor) ? valor : "";
  };
  const temFoto = (row: LinhaPlanilha) => caminhosDaLinha(row).length > 0;
  const linhaEntra = (row?: LinhaPlanilha) => {
    if (!row || escolhidas.size === 0) return false;
    const marca = marcaSalva(row.marca);
    if (marca) return escolhidas.has(marca);
    return temFoto(row);
  };
  function legendasDaLinha(row: LinhaPlanilha) {
    return caminhosDaLinha(row)
      .map((_, indice) => (row.anotacoes?.[indice] || "").trim())
      .filter(Boolean);
  }

  async function idDaFoto(caminho: string) {
    const pronto = ids.get(caminho);
    if (pronto != null) return pronto;
    if (!fotos.has(caminho)) {
      try {
        fotos.set(caminho, await fotoNaCelula(caminho));
      } catch {
        fotos.set(caminho, null);
      }
    }
    const bytes = fotos.get(caminho);
    if (!bytes) return null;
    const id = workbook.addImage({ buffer: new Uint8Array(bytes) as unknown as ExcelJS.Buffer, extension: "jpeg" });
    ids.set(caminho, id);
    return id;
  }

  const ALTURA_FOTO = 108;

  function textoDoComodo(marca: string, notas: string[], legenda = "") {
    const observacao = marca === "NC" ? [...new Set(notas.map((nota) => nota.trim()).filter(Boolean))].join("\n") : "";
    const letra = marca === "C" || marca === "NA" || marca === "NC" ? marca : "";
    if (legenda) return [legenda, letra, observacao].filter(Boolean).join("\n");
    if (observacao) return observacao;
    return letra;
  }

  function pixelsDoComodo(qtdFotos: number, texto: string) {
    const linhas = texto ? Math.min(6, texto.split("\n").filter(Boolean).length) : 0;
    const fotos = qtdFotos ? 8 + qtdFotos * (ALTURA_FOTO + 6) : 0;
    const legenda = linhas ? 8 + linhas * 16 : qtdFotos ? 6 : 28;
    return Math.min(520, fotos + legenda);
  }

  async function imagensDoComodo(caminhos: string[]) {
    const imagens: number[] = [];
    for (const caminho of [...new Set(caminhos)]) {
      const id = await idDaFoto(caminho);
      if (id != null) imagens.push(id);
    }
    return imagens;
  }

  function desenharComodo(
    aba: ExcelJS.Worksheet,
    linha: number,
    coluna: number,
    imagens: number[],
    texto: string,
    alturaPontos: number,
    embaixo: boolean,
  ) {
    const cell = aba.getCell(linha, coluna + 1);
    cell.value = texto;
    cell.font = texto === "NA" || texto === "C" || texto === "NC"
      ? { name: FONTE, bold: true, size: 12, color: { argb: PRETO } }
      : { name: FONTE, size: 9, color: { argb: CINZA } };
    cell.alignment = {
      horizontal: "center",
      vertical: imagens.length && embaixo ? "bottom" : "middle",
      wrapText: true,
    };
    if (!imagens.length) return;
    const alturaPx = Math.max(1, alturaPontos * (96 / 72));
    imagens.forEach((id, indice) => {
      const topo = 6 + indice * (ALTURA_FOTO + 6);
      aba.addImage(id, {
        tl: { col: coluna + 0.12, row: linha - 1 + topo / alturaPx },
        ext: { width: 148, height: ALTURA_FOTO },
        editAs: "oneCell",
      });
    });
  }

  async function montarLinha(
    aba: ExcelJS.Worksheet,
    linha: number,
    salas: { marca: string; caminhos: string[]; notas: string[]; legenda?: string; coluna: number }[],
  ) {
    const desenhos = [];
    for (const sala of salas) {
      const imagens = await imagensDoComodo(sala.caminhos);
      const texto = textoDoComodo(sala.marca, sala.notas, sala.legenda);
      desenhos.push({ ...sala, imagens, texto, embaixo: imagens.length > 0 && Boolean(texto) });
    }
    const pontos = Math.max(28, Math.round((Math.max(...desenhos.map((item) => pixelsDoComodo(item.imagens.length, item.texto))) * 72) / 96));
    aba.getRow(linha).height = pontos;
    for (const desenho of desenhos) {
      desenharComodo(aba, linha, desenho.coluna, desenho.imagens, desenho.texto, pontos, desenho.embaixo);
    }
  }

  const compararCodigoPlanilha = (a: string, b: string) => {
    const esquerda = a.split(".").map((parte) => Number(parte) || 0);
    const direita = b.split(".").map((parte) => Number(parte) || 0);
    const tamanho = Math.max(esquerda.length, direita.length);
    for (let indice = 0; indice < tamanho; indice += 1) {
      const diff = (esquerda[indice] || 0) - (direita[indice] || 0);
      if (diff) return diff;
    }
    return a.localeCompare(b, "pt-BR");
  };
  const grades = escopoDa(entrada.escopo) ? modelos.filter((modelo) => modelo.id === entrada.escopo) : modelos;
  const cabeNaGrade = (row: LinhaPlanilha) => {
    const texto = (row.comodo || "").trim().toLocaleLowerCase("pt-BR");
    if (!texto || !linhaEntra(row)) return false;
    return grades.some((modelo) =>
      modelo.disciplinas.some((disciplina) =>
        disciplina.itens.some(
          (item) => item.codigo === row.codigo && modelo.comodos.some((comodo) => texto === comodo.id || texto === comodo.nome.toLocaleLowerCase("pt-BR")),
        ),
      ),
    );
  };
  const temGrade = entrada.respostas.some(cabeNaGrade);

  function respostaDoItem(codigo: string, comodo: { id: string; nome: string }) {
    return entrada.respostas.find((row) => {
      if (row.codigo !== codigo) return false;
      const texto = (row.comodo || "").trim().toLocaleLowerCase("pt-BR");
      return texto === comodo.id || texto === comodo.nome.toLocaleLowerCase("pt-BR");
    });
  }
  function itemEntraNaPlanilha(codigo: string, comodos: { id: string; nome: string }[]) {
    return comodos.some((comodo) => linhaEntra(respostaDoItem(codigo, comodo)));
  }

  const filaDeFotos = [...new Set(entrada.respostas.filter((row) => linhaEntra(row)).flatMap((row) => caminhosDaLinha(row)))];
  let proximaFoto = 0;
  async function baixarProxima() {
    while (proximaFoto < filaDeFotos.length) {
      const caminho = filaDeFotos[proximaFoto];
      proximaFoto += 1;
      try {
        fotos.set(caminho, await fotoNaCelula(caminho));
      } catch {
        fotos.set(caminho, null);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, filaDeFotos.length) }, () => baixarProxima()));

  if (temGrade) for (const modelo of grades) {
  if (!modelo.disciplinas.some((disciplina) => disciplina.itens.some((item) => itemEntraNaPlanilha(item.codigo, modelo.comodos)))) continue;
  const aba = workbook.addWorksheet(modelo.nome.slice(0, 31));
  aba.properties.tabColor = { argb: "FFFF9A9A" };
  const colunas = 2 + modelo.comodos.length;
  aba.columns = [{ width: 40 }, { width: 34 }, ...modelo.comodos.map(() => ({ width: LARGURA_COMODO }))];
  aba.getRow(1).height = 78;
  let linha = 2;
  for (const disciplina of modelo.disciplinas) {
    const itensVisiveis = disciplina.itens.filter((item) => itemEntraNaPlanilha(item.codigo, modelo.comodos));
    if (!itensVisiveis.length) continue;
    faixa(aba, linha, colunas, CINZA_CLARO, { bold: true, size: 12, color: { argb: TINTA } }, 26);
    aba.mergeCells(linha, 1, linha, colunas);
    aba.getCell(linha, 1).value = disciplina.nome;
    linha += 1;
    const cabecalho = ["Item a verificar", "Critério", ...modelo.comodos.map((comodo) => comodo.nome)];
    aba.getRow(linha).height = 22;
    cabecalho.forEach((texto, coluna) => {
      const cell = aba.getCell(linha, coluna + 1);
      cell.value = texto.toUpperCase();
      pintar(cell, VERMELHO_CLARO, { bold: true, size: 9, color: { argb: TINTA } });
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFFF9A9A" } },
        left: { style: "thin", color: { argb: "FFFF9A9A" } },
        right: { style: "thin", color: { argb: "FFFF9A9A" } },
        bottom: { style: "thin", color: { argb: "FFFF9A9A" } },
      };
    });
    linha += 1;
    for (const [ordem, item] of itensVisiveis.entries()) {
      const salas = modelo.comodos.map((comodo) => {
        const salva = respostaDoItem(item.codigo, comodo);
        const letra = marcaAceita(salva?.marca || "");
        const entra = linhaEntra(salva);
        return {
          salva,
          marca: letra,
          bloqueada: !entra && item.bloqueados.includes(comodo.id),
          fotos: entra && salva ? caminhosDaLinha(salva) : [],
        };
      });
      const temNc = salas.some((sala) => sala.marca === "NC");
      const base = temNc ? NC : ordem % 2 ? NEVE : BRANCO;
      const itemCell = aba.getCell(linha, 1);
      const criterioCell = aba.getCell(linha, 2);
      itemCell.value = item.texto;
      criterioCell.value = item.criterio;
      pintar(itemCell, base, { bold: true, size: 11, color: { argb: PRETO } });
      pintar(criterioCell, base, { size: 9, color: { argb: CINZA } });
      itemCell.alignment = { horizontal: "left", vertical: "top", wrapText: true, indent: 1 };
      criterioCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
      salas.forEach((sala, indice) => {
        const cell = aba.getCell(linha, indice + 3);
        const fundo = sala.marca === "NC" ? NC : sala.bloqueada ? BLOQUEADO : base;
        pintar(cell, fundo);
      });
      await montarLinha(
        aba,
        linha,
        salas.map((sala, indice) => ({
          marca: sala.marca,
          caminhos: sala.fotos,
          notas: sala.marca === "NC" && sala.salva
            ? [...new Set([(sala.salva.observacao || "").trim(), ...legendasDaLinha(sala.salva)].filter(Boolean))]
            : [],
          coluna: indice + 2,
        })),
      );
      linha += 1;
    }
    aba.getRow(linha).height = 12;
    linha += 1;
  }
  aba.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  aba.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, paperSize: 9, printTitlesRow: "1:1" };
  timbrar(aba, [40, 34, ...modelo.comodos.map(() => LARGURA_COMODO)], linha - 1, [
    ["DATA DA REALIZAÇÃO", entrada.data || "—"],
    ["REALIZADA POR", entrada.vistoriador || "—"],
    ["UNIDADE", entrada.unidade || "—"],
  ]);
  }

  const soltas = entrada.respostas
    .filter((row) => linhaEntra(row) && !cabeNaGrade(row))
    .sort((a, b) => compararCodigoPlanilha(a.codigo, b.codigo));
  if (soltas.length > 0) {
    const fora = workbook.addWorksheet(temGrade ? "Itens marcados" : "Checklist");
    fora.properties.tabColor = { argb: "FFFF9A9A" };
    fora.views = [{ showGridLines: false, state: "frozen", ySplit: 2 }];
    fora.columns = [{ width: 72 }, { width: LARGURA_COMODO }];
    fora.getRow(1).height = 78;
    ["Item a verificar", "Cômodo"].forEach((texto, coluna) => {
      const cell = fora.getCell(2, coluna + 1);
      cell.value = texto.toUpperCase();
      pintar(cell, VERMELHO_CLARO, { bold: true, size: 9, color: { argb: TINTA } });
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    fora.getRow(2).height = 22;
    for (const [indice, row] of soltas.entries()) {
      const linha = indice + 3;
      const marca = marcaAceita(row.marca);
      const descricao = descricaoDoItem(row.codigo);
      const nome = row.texto || descricao.texto;
      const item = [row.codigo, nome].filter(Boolean).join("  ");
      const cell = fora.getCell(linha, 1);
      cell.value = descricao.criterio
        ? { richText: [
            { text: item, font: { name: FONTE, bold: true, size: 11, color: { argb: PRETO } } },
            { text: `\n${descricao.criterio}`, font: { name: FONTE, size: 9, color: { argb: CINZA } } },
          ] }
        : item;
      const fundo = marca === "NC" ? NC : indice % 2 ? NEVE : BRANCO;
      pintar(cell, fundo);
      cell.alignment = { vertical: "top", wrapText: true, indent: 1 };
      pintar(fora.getCell(linha, 2), fundo);
      const notas = marca === "NC" ? [...new Set([(row.observacao || "").trim(), ...legendasDaLinha(row)].filter(Boolean))] : [];
      await montarLinha(fora, linha, [{
        marca,
        caminhos: caminhosDaLinha(row),
        notas,
        legenda: nomeDoComodo(row.comodo || "", entrada.escopo),
        coluna: 1,
      }]);
    }
    fora.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, paperSize: 9, printTitlesRow: "1:1" };
    timbrar(fora, [72, LARGURA_COMODO], soltas.length + 2, [
      ["DATA DA REALIZAÇÃO", entrada.data || "—"],
      ["REALIZADA POR", entrada.vistoriador || "—"],
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const nome = `Relatorio ${entrada.unidade} ${entrada.data}`.replace(/[\\/:*?"<>|]/g, "-");
  link.href = url;
  link.download = `${nome}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
