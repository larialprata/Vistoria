import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const arquivo = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "supabase-sessao.json");

function ler() {
  try {
    const json = JSON.parse(readFileSync(arquivo, "utf8"));
    return typeof json?.refresh_token === "string" ? json.refresh_token : "";
  } catch {
    return "";
  }
}

function gravar(refreshToken) {
  if (!refreshToken) return;
  mkdirSync(dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, JSON.stringify({ refresh_token: refreshToken }));
}

async function pedirToken(config, body) {
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=${body.grant_type}`, {
    method: "POST",
    headers: { apikey: config.supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  const json = await response.json();
  if (!json?.access_token) return null;
  gravar(json.refresh_token);
  return json.access_token;
}

export async function guardarSessaoSupabase(config, email, senha) {
  if (!config?.supabaseUrl || !config?.supabaseKey || !email || !senha) return;
  await pedirToken(config, { grant_type: "password", email, password: senha });
}

export async function tokenDoSupabase(config) {
  if (!config?.supabaseUrl || !config?.supabaseKey) return "";
  const refresh = ler();
  if (!refresh) return "";
  return (await pedirToken(config, { grant_type: "refresh_token", refresh_token: refresh })) || "";
}
