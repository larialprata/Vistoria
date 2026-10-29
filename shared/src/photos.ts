import { useSyncExternalStore } from "react";
import type { FotoSalva } from "./types";

const FALHAS = "dime.vistoria.fotos.falhas";
const ouvintesFalhas = new Set<() => void>();
const FALHAS_VAZIAS: string[] = [];
let falhasAtuais: string[] = FALHAS_VAZIAS;
let falhasBrutas = "";

function lerFalhas() {
  if (typeof localStorage === "undefined") return FALHAS_VAZIAS;
  const bruto = localStorage.getItem(FALHAS) || "[]";
  if (bruto === falhasBrutas) return falhasAtuais;
  falhasBrutas = bruto;
  try {
    const json = JSON.parse(bruto) as unknown;
    const lista = Array.isArray(json) ? json.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
    falhasAtuais = lista.length ? lista : FALHAS_VAZIAS;
  } catch {
    falhasAtuais = FALHAS_VAZIAS;
  }
  return falhasAtuais;
}

function gravarFalhas(lista: string[]) {
  if (typeof localStorage === "undefined") return;
  const unicas = [...new Set(lista)];
  falhasAtuais = unicas.length ? unicas : FALHAS_VAZIAS;
  falhasBrutas = JSON.stringify(unicas);
  localStorage.setItem(FALHAS, falhasBrutas);
  ouvintesFalhas.forEach((ouvinte) => ouvinte());
}

export function fotosParadas() {
  return lerFalhas();
}

export function marcarFotoFalhou(path: string) {
  if (!path || path.startsWith("blob:") || path.startsWith("data:")) return;
  const atuais = lerFalhas();
  if (atuais.includes(path)) return;
  gravarFalhas([...atuais, path]);
}

export function marcarFotoEnviada(path: string) {
  const atuais = lerFalhas();
  if (!atuais.includes(path)) return;
  gravarFalhas(atuais.filter((item) => item !== path));
}

export function usarFotosParadas() {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintesFalhas.add(ouvinte);
      return () => ouvintesFalhas.delete(ouvinte);
    },
    lerFalhas,
    lerFalhas,
  );
}

/** Em desenvolvimento o Vite encaminha /fotos. No site publicado usa o /api do mesmo endereço. */
export function apiBase() {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";
  if (import.meta.env.DEV && typeof location !== "undefined" && location.origin) return location.origin;
  if (typeof location === "undefined" || !location.origin) return configured;
  try {
    if (configured && new URL(configured).hostname === location.hostname) return configured;
  } catch {
    return `${location.origin}/api`;
  }
  return `${location.origin}/api`;
}

export type PhotoUploadResult = {
  sharepointPath: string;
  previewUrl: string;
};

type FotoBruta = { sharepointPath?: string; previewUrl?: string; observacao?: string } | string;

export function fotosDaResposta(answer: { sharepointPath?: string; previewUrl?: string; fotos?: FotoBruta[] }): FotoSalva[] {
  const brutas = Array.isArray(answer.fotos) ? answer.fotos : [];
  const lista = brutas
    .map((foto) => {
      if (typeof foto === "string") return { sharepointPath: foto, previewUrl: "", observacao: "" };
      return {
        sharepointPath: String(foto?.sharepointPath || ""),
        previewUrl: String(foto?.previewUrl || ""),
        observacao: String(foto?.observacao || ""),
      };
    })
    .filter((foto) => foto.sharepointPath || foto.previewUrl);
  const vistas = new Set<string>();
  const unicas = lista.filter((foto) => {
    const chave = foto.sharepointPath || foto.previewUrl;
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
  if (unicas.length) return unicas;
  if (answer.sharepointPath || answer.previewUrl) {
    return [{ sharepointPath: answer.sharepointPath || "", previewUrl: answer.previewUrl || "", observacao: "" }];
  }
  return [];
}

type RespostaComFoto = {
  inspectionId: string;
  codigo: string;
  sharepointPath?: string;
  previewUrl?: string;
  fotos?: FotoBruta[];
};

/** O app antigo copiava o mesmo conjunto de fotos para cada cômodo do item. */
export function soltarFotosCopiadas<T extends RespostaComFoto>(answers: T[]): T[] {
  const grupos = new Map<string, T[]>();
  for (const answer of answers) {
    const chave = `${answer.inspectionId}:${answer.codigo}`;
    const lista = grupos.get(chave);
    if (lista) lista.push(answer);
    else grupos.set(chave, [answer]);
  }
  const limpar = new Set<T>();
  for (const linhas of grupos.values()) {
    const porAssinatura = new Map<string, T[]>();
    for (const linha of linhas) {
      const caminhos = fotosDaResposta(linha)
        .map((foto) => foto.sharepointPath)
        .filter(Boolean)
        .sort();
      if (!caminhos.length) continue;
      const assinatura = caminhos.join("|");
      const iguais = porAssinatura.get(assinatura);
      if (iguais) iguais.push(linha);
      else porAssinatura.set(assinatura, [linha]);
    }
    for (const iguais of porAssinatura.values()) {
      if (iguais.length < 2) continue;
      for (const linha of iguais.slice(1)) limpar.add(linha);
    }
  }
  if (limpar.size === 0) return answers;
  return answers.map((answer) => (limpar.has(answer) ? { ...answer, fotos: [], sharepointPath: "", previewUrl: "" } : answer));
}

export function fotosDoItem(linhas: { sharepointPath?: string; previewUrl?: string; fotos?: FotoBruta[] }[]) {
  const vistas = new Set<string>();
  const fotos: FotoSalva[] = [];
  for (const linha of linhas) {
    for (const foto of fotosDaResposta(linha)) {
      const chave = foto.sharepointPath || foto.previewUrl;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      fotos.push(foto);
    }
  }
  return fotos;
}

/**
 * Contrato da foto.
 * Sem VITE_API_URL, a imagem fica só neste navegador e o caminho já sai no padrão do SharePoint.
 * Com a API (como no abastecimento), o POST /fotos envia o arquivo ao Graph e devolve o mesmo caminho.
 */
const FOTO_DB = "dime.vistoria.fotos";
const FOTO_STORE = "fotos";

function openFotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FOTO_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FOTO_STORE)) request.result.createObjectStore(FOTO_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalPhoto(key: string, blob: Blob) {
  if (!key) return;
  const db = await openFotoDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FOTO_STORE, "readwrite");
    tx.objectStore(FOTO_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadLocalPhoto(key: string): Promise<Blob | null> {
  if (!key || typeof indexedDB === "undefined") return null;
  const db = await openFotoDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(FOTO_STORE, "readonly");
    const request = tx.objectStore(FOTO_STORE).get(key);
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("formato"));
    };
    image.src = url;
  });
}

async function compressPhoto(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  const image = await loadImage(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
  if (!blob || blob.size < 1) return file;
  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}

/** Lê a foto na hora. No celular, um input escondido devolve o arquivo vazio se a gente esperar. */
export async function arquivoDaCamera(input: HTMLInputElement): Promise<File | null> {
  const raw = input.files?.[0];
  if (!raw || raw.size < 1) {
    input.value = "";
    return null;
  }
  try {
    const bytes = await raw.arrayBuffer();
    const file = new File([bytes], raw.name || "foto.jpg", { type: raw.type || "image/jpeg" });
    input.value = "";
    return file.size > 0 ? file : null;
  } catch {
    input.value = "";
    return null;
  }
}

export async function stagePhoto(file: File, sharepointPath: string): Promise<PhotoUploadResult & { warning?: string }> {
  const prepared = await Promise.race([
    compressPhoto(file).catch(() => file),
    new Promise<File>((resolve) => setTimeout(() => resolve(file), 12000)),
  ]);
  const jpgPath = sharepointPath.replace(/\.[a-z0-9]+$/i, ".jpg");
  const guardada = saveLocalPhoto(jpgPath, prepared).catch(() => {});
  const previewUrl = URL.createObjectURL(prepared);
  const api = apiBase();
  if (!api) {
    await guardada;
    marcarFotoFalhou(jpgPath);
    return { sharepointPath: jpgPath, previewUrl, warning: "Sem conexão com o servidor. A foto ficou neste aparelho." };
  }
  const body = new FormData();
  body.set("path", jpgPath);
  body.set("file", prepared, "foto.jpg");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    let response = await fetch(`${api}/fotos`, { method: "POST", body, signal: controller.signal });
    if (!response.ok && response.status !== 400 && response.status !== 413) {
      const outra = new FormData();
      outra.set("path", jpgPath);
      outra.set("file", prepared, "foto.jpg");
      response = await fetch(`${api}/fotos`, { method: "POST", body: outra, signal: controller.signal });
    }
    if (!response.ok) {
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error || "Não foi possível enviar a foto para o SharePoint.");
    }
    await response.json().catch(() => ({}));
    marcarFotoEnviada(jpgPath);
    return { sharepointPath: jpgPath, previewUrl };
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? "O envio da foto demorou demais."
        : error instanceof Error && error.message
          ? error.message
          : "Não foi possível falar com o servidor.";
    marcarFotoFalhou(jpgPath);
    return { sharepointPath: jpgPath, previewUrl, warning: `${message} A foto ficou salva neste aparelho.` };
  } finally {
    clearTimeout(timer);
  }
}
