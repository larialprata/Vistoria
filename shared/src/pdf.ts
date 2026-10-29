import { apiBase, loadLocalPhoto } from "@shared/photos";
import { currentAccount } from "@shared/session";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import rodapeUrl from "@shared/marca/rodape.jpg";
import topoUrl from "@shared/marca/topo-logo.jpg";

type SalaPdf = { texto: string; fotos: string[]; nc?: boolean };
type ItemPdf = { texto: string; criterio: string; salas: SalaPdf[] };
type BlocoPdf = { nome: string; itens: ItemPdf[] };

export type PdfDaRevisao = {
  arquivo: string;
  campos: [string, string][];
  comodos: string[];
  blocos: BlocoPdf[];
  assinatura?: string;
  /** No celular, abre a folha de compartilhar para salvar o PDF. */
  compartilhar?: boolean;
};

const LARGURA = 841.89;
const ALTURA = 595.28;
const MARGEM_X = 22;
const MARGEM_TOPO = 18;
const MARGEM_BASE = 36;
const TINTA = rgb(0.08, 0.08, 0.1);
const CINZA = rgb(0.35, 0.35, 0.38);
const LINHA = rgb(0.78, 0.78, 0.8);
const FUNDO = rgb(0.95, 0.95, 0.96);
const NC = rgb(1, 0.96, 0.96);
const FOTO_LARGURA = 64;
const FOTO_ALTURA = 48;

function limpavel(valor: string) {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function seguro(fonte: PDFFont, texto: string) {
  const valor = texto || "";
  try {
    fonte.encodeText(valor);
    return valor;
  } catch {
    return limpavel(valor);
  }
}

function quebrar(fonte: PDFFont, texto: string, tamanho: number, largura: number) {
  const linhas: string[] = [];
  const blocos = (texto || "").split("\n");
  for (const bloco of blocos) {
    const palavras = seguro(fonte, bloco).split(/\s+/).filter(Boolean);
    if (!palavras.length) continue;
    let atual = "";
    const encaixar = (pedaco: string) => {
      const tentativa = atual ? `${atual} ${pedaco}` : pedaco;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) {
        atual = tentativa;
        return;
      }
      if (atual) linhas.push(atual);
      atual = pedaco;
    };
    for (const palavra of palavras) {
      if (fonte.widthOfTextAtSize(palavra, tamanho) <= largura) {
        encaixar(palavra);
        continue;
      }
      let resto = palavra;
      while (resto) {
        let corte = resto.length;
        while (corte > 1 && fonte.widthOfTextAtSize(resto.slice(0, corte), tamanho) > largura) corte -= 1;
        encaixar(resto.slice(0, corte));
        resto = resto.slice(corte);
        if (atual && fonte.widthOfTextAtSize(atual, tamanho) > largura) {
          linhas.push(atual);
          atual = "";
        }
      }
    }
    if (atual) linhas.push(atual);
  }
  return linhas.slice(0, 6);
}

function bytesDeBase64(base: string) {
  const binario = atob(base);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function ehJpeg(bytes: Uint8Array) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

async function converterParaJpeg(bytes: Uint8Array, tipo = "") {
  if (typeof document === "undefined") return ehJpeg(bytes) ? bytes : null;
  const blob = new Blob([bytes.slice()], { type: tipo || "image/jpeg" });
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("foto"));
      img.src = url;
    });
    const maximo = 480;
    const escala = Math.min(1, maximo / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * escala));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * escala));
    const contexto = canvas.getContext("2d");
    if (!contexto) return null;
    contexto.drawImage(image, 0, 0, canvas.width, canvas.height);
    const saida = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
    if (!saida || saida.size < 1) return null;
    return new Uint8Array(await saida.arrayBuffer());
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function normalizarFoto(bytes: Uint8Array, tipo = "") {
  if (ehJpeg(bytes)) return bytes;
  return converterParaJpeg(bytes, tipo);
}

async function bytesDaFoto(path: string) {
  if (path.startsWith("data:image/jpeg") || path.startsWith("data:image/jpg")) {
    return normalizarFoto(bytesDeBase64(path.split(",")[1] || ""));
  }
  if (path.startsWith("blob:") || path.startsWith("data:image/")) {
    const local = await fetch(path);
    if (!local.ok) return null;
    return normalizarFoto(new Uint8Array(await local.arrayBuffer()), local.headers.get("content-type") || "");
  }
  const guardada = await loadLocalPhoto(path).catch(() => null);
  if (guardada && guardada.size > 0) {
    return normalizarFoto(new Uint8Array(await guardada.arrayBuffer()), guardada.type);
  }
  const api = apiBase();
  const token = currentAccount()?.token;
  if (!path || !api || !token) return null;
  let response = await fetch(`${api}/fotos?path=${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    response = await fetch(`${api}/fotos?path=${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  if (!response.ok) return null;
  return normalizarFoto(new Uint8Array(await response.arrayBuffer()), response.headers.get("content-type") || "");
}

async function arquivo(url: string) {
  const response = await fetch(url);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

export async function baixarPdf(entrada: PdfDaRevisao) {
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const forte = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [topoBytes, rodapeBytes] = await Promise.all([arquivo(topoUrl), arquivo(rodapeUrl)]);
  const topo = topoBytes ? await pdf.embedJpg(topoBytes).catch(() => null) : null;
  const rodape = rodapeBytes ? await pdf.embedJpg(rodapeBytes).catch(() => null) : null;
  const fotos = await embutirFotos(pdf, entrada);

  const comodos = entrada.comodos.length ? entrada.comodos : ["Geral"];
  const util = LARGURA - MARGEM_X * 2;
  const itemW = Math.min(148, util * 0.2);
  const critW = Math.min(108, util * 0.14);
  const salaW = (util - itemW - critW) / comodos.length;
  const colunas = [itemW, critW, ...comodos.map(() => salaW)];

  let pagina = pdf.addPage([LARGURA, ALTURA]);
  let y = MARGEM_TOPO;

  function baseDoTexto(topo: number, tamanho: number) {
    return ALTURA - topo - tamanho;
  }

  function escrever(texto: string, x: number, topo: number, tamanho: number, negrito = false, cor = TINTA) {
    const usada = negrito ? forte : fonte;
    pagina.drawText(seguro(usada, texto), { x, y: baseDoTexto(topo, tamanho), size: tamanho, font: usada, color: cor });
  }

  function caixa(x: number, topo: number, w: number, h: number, fill = rgb(1, 1, 1)) {
    pagina.drawRectangle({
      x,
      y: ALTURA - topo - h,
      width: w,
      height: h,
      color: fill,
      borderColor: LINHA,
      borderWidth: 0.6,
    });
  }

  function cabecalho() {
    y = MARGEM_TOPO;
    escrever("Dimensional · Relatório de vistoria de unidades", MARGEM_X, y, 9, true);
    const unidade = entrada.campos.find(([rotulo]) => rotulo === "Unidade")?.[1] || "";
    const revisao = entrada.campos.find(([rotulo]) => rotulo === "Revisão")?.[1] || "";
    const direita = [unidade, revisao ? `Revisão ${revisao.replace(/^Revisão\s+/i, "")}` : ""].filter(Boolean).join("   ");
    if (topo) {
      const h = 26;
      const w = h * (topo.width / topo.height);
      pagina.drawImage(topo, { x: LARGURA - MARGEM_X - w, y: ALTURA - y - h, width: w, height: h });
    }
    if (direita) {
      const larguraTexto = forte.widthOfTextAtSize(seguro(forte, direita), 9);
      const limite = topo ? LARGURA - MARGEM_X - 28 * (topo.width / topo.height) - 12 : LARGURA - MARGEM_X;
      escrever(direita, Math.max(MARGEM_X + 280, limite - larguraTexto), y, 9, true);
    }
    y += 20;
    pagina.drawLine({
      start: { x: MARGEM_X, y: ALTURA - y },
      end: { x: LARGURA - MARGEM_X, y: ALTURA - y },
      thickness: 0.8,
      color: LINHA,
    });
    y += 10;
  }

  function novaPagina() {
    pagina = pdf.addPage([LARGURA, ALTURA]);
    cabecalho();
  }

  function cabeEspaco(alturaBloco: number) {
    if (y + alturaBloco <= ALTURA - MARGEM_BASE) return;
    novaPagina();
  }

  cabecalho();
  escrever("Resumo da revisão", MARGEM_X, y, 14, true);
  y += 20;
  desenharFicha();
  if (entrada.assinatura?.startsWith("data:image")) await desenharAssinatura(entrada.assinatura);

  for (const bloco of entrada.blocos) {
    const titulo = 18;
    const cabeca = alturaCabeca();
    const primeira = bloco.itens[0] ? alturaLinha(bloco.itens[0]) : 24;
    cabeEspaco(titulo + cabeca + primeira);
    y += 6;
    escrever(bloco.nome, MARGEM_X, y, 11, true);
    y += titulo;
    desenharCabeca();
    for (const item of bloco.itens) {
      const alturaItem = alturaLinha(item);
      if (y + alturaItem > ALTURA - MARGEM_BASE) {
        novaPagina();
        desenharCabeca();
      }
      desenharLinha(item, alturaItem);
    }
  }

  const folhas = pdf.getPages();
  folhas.forEach((folha, indice) => {
    if (rodape) {
      const h = 16;
      const w = Math.min(220, h * (rodape.width / rodape.height));
      folha.drawImage(rodape, { x: (LARGURA - w) / 2, y: 12, width: w, height: h });
    }
    const numero = `${indice + 1} / ${folhas.length}`;
    folha.drawText(numero, {
      x: LARGURA - MARGEM_X - fonte.widthOfTextAtSize(numero, 8),
      y: 16,
      size: 8,
      font: fonte,
      color: CINZA,
    });
  });

  const bytes = await pdf.save();
  const blob = new Blob([bytes.slice().buffer], { type: "application/pdf" });
  const arquivoPdf = new File([blob], entrada.arquivo, { type: "application/pdf" });
  if (entrada.compartilhar && navigator.canShare?.({ files: [arquivoPdf] })) {
    try {
      await navigator.share({ files: [arquivoPdf], title: entrada.arquivo.replace(/\.pdf$/i, "") });
      return;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = entrada.arquivo;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);

  function desenharFicha() {
    const campos = entrada.campos.filter(([, valor]) => valor);
    const colunasFicha = 3;
    const larguraCampo = util / colunasFicha;
    const alturaCampo = 28;
    for (let indice = 0; indice < campos.length; indice += 1) {
      const coluna = indice % colunasFicha;
      if (coluna === 0 && indice > 0) y += alturaCampo;
      const [rotulo, valor] = campos[indice];
      const x = MARGEM_X + coluna * larguraCampo;
      escrever(rotulo, x, y, 7, false, CINZA);
      const linhas = quebrar(forte, valor, 10, larguraCampo - 12);
      escrever(linhas[0] || "—", x, y + 10, 10, true);
    }
    y += 36;
  }

  async function desenharAssinatura(dataUrl: string) {
    const imagem = await embutirData(pdf, dataUrl);
    if (!imagem) return;
    const h = 32;
    const w = Math.min(140, h * (imagem.width / imagem.height));
    cabeEspaco(h + 8);
    pagina.drawImage(imagem, { x: MARGEM_X, y: ALTURA - y - h, width: w, height: h });
    y += h + 8;
  }

  function alturaCabeca() {
    const linhas = comodos.map((nome) => quebrar(forte, nome, 7, salaW - 6).length);
    return Math.max(18, 8 + Math.max(1, ...linhas, 1) * 9);
  }

  function fotosDaSala(sala: SalaPdf) {
    return sala.fotos.flatMap((caminho) => {
      const imagem = fotos.get(caminho);
      return imagem ? [imagem] : [];
    });
  }

  function medidaFoto(sala: SalaPdf) {
    const imagens = fotosDaSala(sala);
    if (!imagens.length) return { lado: false, w: 0, h: 0, total: 0 };
    const lado = salaW >= 150 && imagens.length > 1;
    const w = Math.min(FOTO_LARGURA, lado ? (salaW - 12) / 2 : salaW - 8);
    const h = Math.min(FOTO_ALTURA, ...imagens.map((imagem) => (w * imagem.height) / imagem.width));
    const total = lado ? h : imagens.length * h + (imagens.length - 1) * 3;
    return { lado, w, h, total };
  }

  function alturaLinha(item: ItemPdf) {
    const itemH = 8 + quebrar(forte, item.texto, 8, itemW - 8).length * 10;
    const critH = 8 + quebrar(fonte, item.criterio, 7, critW - 8).length * 9;
    const salas = comodos.map((_, indice) => item.salas[indice] || { texto: "", fotos: [] });
    const salasH = salas.map((sala) => {
      const foto = medidaFoto(sala);
      const texto = quebrar(fonte, sala.texto, 7, salaW - 6);
      const textoH = texto.length ? texto.length * 8 + 2 : 0;
      return 8 + foto.total + (foto.total && textoH ? 3 : 0) + textoH;
    });
    return Math.max(22, itemH, critH, ...salasH, 22);
  }

  function desenharCabeca() {
    const h = alturaCabeca();
    let x = MARGEM_X;
    const titulos = ["Item a verificar", "Critério", ...comodos];
    titulos.forEach((titulo, indice) => {
      const w = colunas[indice];
      caixa(x, y, w, h, FUNDO);
      const linhas = quebrar(forte, titulo, 7, w - 6);
      linhas.forEach((linha, ordem) => {
        const larguraTexto = forte.widthOfTextAtSize(seguro(forte, linha), 7);
        escrever(linha, x + Math.max(3, (w - larguraTexto) / 2), y + 4 + ordem * 9, 7, true);
      });
      x += w;
    });
    y += h;
  }

  function desenharLinha(item: ItemPdf, h: number) {
    let x = MARGEM_X;
    const nc = item.salas.some((sala) => sala.nc);
    const textos = [item.texto, item.criterio];
    textos.forEach((texto, indice) => {
      const w = colunas[indice];
      caixa(x, y, w, h, nc && indice === 0 ? NC : rgb(1, 1, 1));
      const tamanho = indice === 0 ? 8 : 7;
      const usada = indice === 0 ? forte : fonte;
      const linhas = quebrar(usada, texto, tamanho, w - 8);
      linhas.forEach((linha, ordem) => escrever(linha, x + 4, y + 4 + ordem * (tamanho + 2), tamanho, indice === 0));
      x += w;
    });
    const salas = comodos.map((_, indice) => item.salas[indice] || { texto: "", fotos: [] });
    salas.forEach((sala, indice) => {
      const w = colunas[indice + 2] || salaW;
      caixa(x, y, w, h, sala.nc ? NC : rgb(1, 1, 1));
      const imagens = fotosDaSala(sala);
      const medida = medidaFoto(sala);
      let cursor = y + 4;
      if (imagens.length && medida.lado) {
        const totalW = imagens.length * medida.w + (imagens.length - 1) * 4;
        let fotoX = x + (w - totalW) / 2;
        imagens.forEach((imagem) => {
          const ih = Math.min(medida.h, medida.w * (imagem.height / imagem.width));
          const iw = ih * (imagem.width / imagem.height);
          pagina.drawImage(imagem, { x: fotoX, y: ALTURA - cursor - ih, width: iw, height: ih });
          fotoX += medida.w + 4;
        });
        cursor += medida.total + 3;
      } else {
        imagens.forEach((imagem) => {
          const ih = Math.min(medida.h, medida.w * (imagem.height / imagem.width));
          const iw = ih * (imagem.width / imagem.height);
          pagina.drawImage(imagem, { x: x + (w - iw) / 2, y: ALTURA - cursor - ih, width: iw, height: ih });
          cursor += ih + 3;
        });
      }
      const linhas = quebrar(fonte, sala.texto, 7, w - 6);
      linhas.forEach((linha, ordem) => {
        const larguraTexto = fonte.widthOfTextAtSize(seguro(fonte, linha), 7);
        const negrito = sala.texto === "NA" || sala.texto === "C" || sala.texto === "NC";
        const usada = negrito ? forte : fonte;
        const larguraUsada = usada.widthOfTextAtSize(seguro(usada, linha), 7);
        pagina.drawText(seguro(usada, linha), {
          x: x + Math.max(3, (w - (negrito ? larguraUsada : larguraTexto)) / 2),
          y: baseDoTexto(cursor + ordem * 8, 7),
          size: 7,
          font: usada,
          color: negrito ? TINTA : CINZA,
        });
      });
      x += w;
    });
    y += h;
  }
}

async function embutirFotos(pdf: PDFDocument, entrada: PdfDaRevisao) {
  const caminhos = [...new Set(entrada.blocos.flatMap((bloco) => bloco.itens.flatMap((item) => item.salas.flatMap((sala) => sala.fotos))))];
  const mapa = new Map<string, PDFImage>();
  const baixadas = new Map<string, Uint8Array>();
  const fila = [...caminhos];
  async function baixar() {
    while (fila.length) {
      const caminho = fila.shift();
      if (!caminho || baixadas.has(caminho)) continue;
      const bytes = await bytesDaFoto(caminho).catch(() => null);
      if (bytes) baixadas.set(caminho, bytes);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, caminhos.length) }, () => baixar()));
  for (const [caminho, bytes] of baixadas) {
    let imagem = await pdf.embedJpg(bytes).catch(() => null);
    if (!imagem) {
      const convertido = await converterParaJpeg(bytes).catch(() => null);
      if (convertido) imagem = await pdf.embedJpg(convertido).catch(() => null);
    }
    if (imagem) mapa.set(caminho, imagem);
  }
  return mapa;
}

async function embutirData(pdf: PDFDocument, dataUrl: string) {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!match) return null;
  const binario = atob(match[2]);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  if (match[1] === "png") return pdf.embedPng(bytes).catch(() => null);
  return pdf.embedJpg(bytes).catch(() => null);
}
