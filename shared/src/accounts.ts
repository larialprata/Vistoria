import { apiBase } from "./photos";
import { currentAccount, leaveSession, type Acesso, type Conta, type Pagina } from "./session";

async function send(path: string, body?: unknown, token?: string) {
  const base = apiBase();
  if (!base) throw new Error("A API de contas não está configurada.");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const auth = token ?? currentAccount()?.token;
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const response = await fetch(`${base}${path}`, {
    method: body === undefined && path !== "/entrar" && path !== "/pessoas" && path !== "/senha" ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as { error?: string; primeiro?: boolean };
  if (!response.ok) {
    const error = new Error(json.error || "Não foi possível concluir.");
    if (json.primeiro) (error as Error & { primeiro?: boolean }).primeiro = true;
    throw error;
  }
  return json;
}

export async function cadastroVazio() {
  const base = apiBase();
  if (!base) return false;
  const response = await fetch(`${base}/estado`);
  if (!response.ok) return false;
  const json = (await response.json()) as { vazio?: boolean };
  return Boolean(json.vazio);
}

export async function entrar(email: string, senha: string, onde: "web" | "app") {
  return (await send("/entrar", { email, senha, onde }, "")) as Conta;
}

export function enderecoDoOutlook(onde: "web" | "app") {
  const base = apiBase();
  const voltar = typeof location === "undefined" ? "" : `${location.origin}${location.pathname}`;
  return `${base}/entrar/outlook?onde=${onde}&voltar=${encodeURIComponent(voltar)}`;
}

export async function contaComToken(token: string) {
  const base = apiBase();
  if (!base || !token) return null;
  const response = await fetch(`${base}/eu`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  return (await response.json()) as Conta;
}

export type Pessoa = {
  id: string;
  nome: string;
  email: string;
  acesso: Acesso;
  administrador?: boolean;
  paginas?: Pagina[];
  visualizar?: boolean;
  assinarVistoria?: boolean;
  assinarObra?: boolean;
};

export async function cadastrarPessoa(input: {
  nome: string;
  email: string;
  senha: string;
  acesso: Acesso;
  administrador?: boolean;
  paginas?: Pagina[];
  visualizar?: boolean;
  assinarVistoria?: boolean;
  assinarObra?: boolean;
}) {
  return send("/pessoas", input);
}

export async function excluirPessoa(id: string) {
  await send("/pessoas/excluir", { id });
}

export async function salvarPermissoes(input: {
  id: string;
  acesso: Acesso;
  administrador: boolean;
  paginas: Pagina[];
  visualizar: boolean;
  assinarVistoria: boolean;
  assinarObra: boolean;
}) {
  return (await send("/pessoas/permissoes", input)) as Pessoa;
}

export async function minhaConta() {
  const base = apiBase();
  const token = currentAccount()?.token;
  if (!base || !token) return null;
  const response = await fetch(`${base}/eu`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) {
    leaveSession();
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Conta;
}

export async function listarPessoas() {
  const base = apiBase();
  const token = currentAccount()?.token;
  if (!base || !token) throw new Error("Entre de novo para ver os usuários.");
  const response = await fetch(`${base}/pessoas`, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await response.json().catch(() => [])) as Pessoa[] | { error?: string };
  if (!response.ok) {
    const error = !Array.isArray(json) ? json.error : "";
    throw new Error(error || "Não foi possível carregar os usuários.");
  }
  return Array.isArray(json) ? json : [];
}

export async function decidirVistoria(id: string, parecer: "aprovada" | "reprovada" | "liberado" | "finalizar", assinatura = "", responsavelObra = "") {
  await send("/vistorias/parecer", { id, parecer, assinatura, responsavelObra });
}

export async function excluirVistoria(id: string) {
  await send("/vistorias/excluir", { id });
}

export async function gravarFotosDaCelula(id: string, celula: { codigo: string; comodo: string; mark: string; observacao: string; fotos: { sharepointPath: string; observacao?: string }[] }) {
  await send("/vistorias/fotos", { id, ...celula });
}

export async function trocarSenha(senhaAtual: string, senhaNova: string) {
  await send("/senha", { senhaAtual, senhaNova });
}
