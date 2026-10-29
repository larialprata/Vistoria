import { useSyncExternalStore } from "react";
import type { RemotePlace } from "@shared/catalog";

const KEY = "dime.vistoria.obra";

export const OBRAS = [
  { nome: "Mangueira IBGE", nomes: ["Mangueira IBGE", "Condomínio IBGE", "Condominio IBGE"] },
  { nome: "Mangueira - Cond II", nomes: ["Mangueira - Cond II", "Mangueira II", "Condomínio II", "Condominio II"] },
  { nome: "Igaratá", nomes: ["Igaratá", "Igarata"] },
  { nome: "Comunidade do Aço", nomes: ["Comunidade do Aço", "Comunidade do Aco"] },
] as const;

let atual = ler();
const ouvintes = new Set<() => void>();

function ler() {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

function avisar() {
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function obraAtual() {
  return atual;
}

export function escolherObra(nome: string) {
  atual = nome;
  try {
    sessionStorage.setItem(KEY, nome);
  } catch {
    /* A escolha vale nesta abertura mesmo se o navegador bloquear o armazenamento. */
  }
  avisar();
}

export function limparObra() {
  atual = "";
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* Segue sem a obra guardada. */
  }
  avisar();
}

export function useObra() {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    obraAtual,
  );
}

export function nomesDaObra(obra: string) {
  const texto = obra.trim().toLocaleLowerCase("pt-BR");
  const item = OBRAS.find((linha) => linha.nomes.some((nome) => nome.toLocaleLowerCase("pt-BR") === texto));
  return item ? [...item.nomes] : obra ? [obra] : [];
}

export function mesmaObra(empreendimento: string, obra: string) {
  const texto = empreendimento.trim().toLocaleLowerCase("pt-BR");
  return nomesDaObra(obra).some((nome) => nome.toLocaleLowerCase("pt-BR") === texto);
}

export function placeDaObra(places: RemotePlace[], obra: string) {
  const nomes = new Set(nomesDaObra(obra).map((nome) => nome.toLocaleLowerCase("pt-BR")));
  return places.find((place) => nomes.has(place.nome.toLocaleLowerCase("pt-BR")));
}
