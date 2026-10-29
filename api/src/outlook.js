import { createHash, randomBytes } from "node:crypto";

const pendencias = new Map();

function limpar() {
  const agora = Date.now();
  for (const [chave, item] of pendencias) {
    if (item.expira < agora) pendencias.delete(chave);
  }
}

function desafio(verificador) {
  return createHash("sha256").update(verificador).digest("base64url");
}

function credenciais(config) {
  return {
    clientId: config?.outlookClientId || config?.clientId || "",
    clientSecret: config?.outlookClientSecret || config?.clientSecret || "",
  };
}

export function criarLoginOutlook(config, { onde, voltar, redirectUri }) {
  limpar();
  const { clientId, clientSecret } = credenciais(config);
  if (!config?.tenantId || !clientId || !clientSecret) {
    return { error: "O login do Outlook ainda não está configurado.", status: 503 };
  }
  const state = randomBytes(24).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  pendencias.set(state, { onde, voltar, redirectUri, verifier, expira: Date.now() + 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "openid profile email",
    state,
    code_challenge: desafio(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { url: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?${params}` };
}

function emailDoToken(idToken) {
  const parte = String(idToken || "").split(".")[1];
  if (!parte) return { email: "", nome: "" };
  try {
    const json = JSON.parse(Buffer.from(parte, "base64url").toString("utf8"));
    const email = String(json.email || json.preferred_username || json.upn || "").trim().toLowerCase();
    const nome = String(json.name || "").trim();
    return { email, nome };
  } catch {
    return { email: "", nome: "" };
  }
}

export function encerrarLoginOutlook(state) {
  const guardado = pendencias.get(state);
  if (guardado) pendencias.delete(state);
  return guardado?.voltar || "";
}

export async function concluirLoginOutlook(config, { code, state }) {
  const guardado = pendencias.get(state);
  pendencias.delete(state);
  if (!guardado || guardado.expira < Date.now()) {
    return { error: "A entrada pelo Outlook expirou. Tente de novo.", status: 400 };
  }
  const { clientId, clientSecret } = credenciais(config);
  const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: guardado.redirectUri,
      code_verifier: guardado.verifier,
      scope: "openid profile email",
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const codigo = String(json.error || "");
    const mensagem = codigo === "invalid_client" || String(json.error_description || "").includes("AADSTS50011")
      ? "O Outlook ainda não aceita o endereço de retorno deste login."
      : "Não foi possível entrar com o Outlook.";
    return { error: mensagem, status: 502, onde: guardado.onde, voltar: guardado.voltar };
  }
  const conta = emailDoToken(json.id_token);
  if (!conta.email) return { error: "O Outlook não informou o e-mail.", status: 502, onde: guardado.onde, voltar: guardado.voltar };
  return { ...conta, onde: guardado.onde, voltar: guardado.voltar };
}

export function retornoDoOutlook(voltar, host = "") {
  const destino = voltaPermitida(typeof voltar === "string" ? voltar : "");
  if (destino) {
    const url = new URL(destino);
    if (url.hostname === "vistoria.dimensionalengenharia.com") {
      return "https://vistoria.dimensionalengenharia.com/api/entrar/outlook/retorno";
    }
    return `${url.origin}/entrar/outlook/retorno`;
  }
  if (host === "vistoria.dimensionalengenharia.com") {
    return "https://vistoria.dimensionalengenharia.com/api/entrar/outlook/retorno";
  }
  return "";
}

export function voltaPermitida(valor) {
  try {
    const url = new URL(valor);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (local && (url.port === "5178" || url.port === "5174" || url.port === "8787")) return url.origin + url.pathname;
    if (url.hostname === "vistoria.dimensionalengenharia.com") return url.origin + url.pathname;
    return "";
  } catch {
    return "";
  }
}
