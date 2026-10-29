import { useSyncExternalStore } from "react";

export type Acesso = "web" | "app" | "ambos";
export type Pagina = "painel" | "vistorias" | "obras" | "configuracoes";

export const PAGINAS: { id: Pagina; label: string }[] = [
  { id: "painel", label: "Painel" },
  { id: "vistorias", label: "Vistorias" },
  { id: "obras", label: "Obras" },
  { id: "configuracoes", label: "Configurações" },
];

export type Conta = {
  nome: string;
  email: string;
  acesso: Acesso;
  administrador?: boolean;
  paginas?: Pagina[];
  visualizar?: boolean;
  assinarVistoria?: boolean;
  assinarObra?: boolean;
  token: string;
};

export function podeAssinarVistoria(conta: Conta | null) {
  if (!conta) return false;
  if (conta.administrador) return true;
  return Boolean(conta.assinarVistoria);
}

export function podeAssinarObra(conta: Conta | null) {
  if (!conta) return false;
  if (conta.administrador) return true;
  return Boolean(conta.assinarObra);
}

export function podeVisualizar(conta: Conta | null) {
  if (!conta || conta.acesso === "app") return false;
  if (conta.administrador) return true;
  return Boolean(conta.visualizar || conta.assinarVistoria || conta.assinarObra);
}

export function veSomenteObra(conta: Conta | null) {
  if (!conta || conta.administrador) return false;
  return Boolean(conta.assinarObra) && !conta.assinarVistoria;
}

const SAVED = "dime.vistoria.conta";
const TEMP = "dime.vistoria.conta.sessao";
const listeners = new Set<() => void>();

function read(storage: Storage): Conta | null {
  try {
    const raw = storage.getItem(storage === localStorage ? SAVED : TEMP);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Conta;
    if (!parsed?.token || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function load(): Conta | null {
  return read(localStorage) || read(sessionStorage);
}

let snapshot = load();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeAccount(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentAccount(): Conta | null {
  return snapshot;
}

export function useAccount() {
  return useSyncExternalStore(subscribeAccount, currentAccount, currentAccount);
}

export function currentUser() {
  return currentAccount()?.nome || "";
}

export function enterSession(conta: Conta, salvar = true) {
  const raw = JSON.stringify(conta);
  if (salvar) {
    localStorage.setItem(SAVED, raw);
    sessionStorage.removeItem(TEMP);
  } else {
    sessionStorage.setItem(TEMP, raw);
    localStorage.removeItem(SAVED);
  }
  snapshot = conta;
  emit();
}

export function leaveSession() {
  localStorage.removeItem(SAVED);
  sessionStorage.removeItem(TEMP);
  snapshot = null;
  emit();
}

export function podeEntrar(acesso: Acesso, onde: "web" | "app") {
  if (acesso === "ambos") return true;
  return acesso === onde;
}

export function podeVerPagina(conta: Conta | null, pagina: Pagina | "usuarios") {
  if (!conta || conta.acesso === "app") return false;
  if (conta.administrador) return true;
  if (pagina === "usuarios" || pagina === "configuracoes") return false;
  if (podeVisualizar(conta)) return pagina === "painel" || pagina === "vistorias" || pagina === "obras";
  return Boolean(conta.paginas?.includes(pagina));
}
