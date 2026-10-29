async function callDatabase(config, name, body, fallback = "Não foi possível salvar o usuário no banco.") {
  if (!config?.supabaseUrl || !config?.supabaseKey) return false;
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    let message = fallback;
    try {
      const parsed = JSON.parse(detail);
      if (parsed.message) message = String(parsed.message);
    } catch {
      if (detail) message = detail.slice(0, 240);
    }
    throw new Error(message);
  }
  return true;
}

export function registerAdminSession(config, email, senha, token) {
  return callDatabase(config, "registrar_sessao", {
    p_email: email,
    p_senha: senha,
    p_token: token,
  });
}

export function savePersonInDatabase(config, token, person, senha) {
  return callDatabase(config, "salvar_pessoa", {
    p_token: token,
    payload: {
      nome: person.nome,
      email: person.email,
      senha,
      acesso: person.acesso,
      administrador: person.administrador,
      paginas: person.paginas,
    },
  });
}

export function updatePersonInDatabase(config, token, person) {
  return callDatabase(config, "atualizar_pessoa", {
    p_token: token,
    payload: {
      email: person.email,
      acesso: person.acesso,
      administrador: person.administrador,
      paginas: person.paginas,
    },
  });
}

export async function listPeopleInDatabase(config) {
  if (!config?.supabaseUrl || !config?.supabaseKey) return [];
  const response = await fetch(
    `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/perfis?select=id,nome,email,acesso,admin,paginas&order=nome.asc`,
    {
      headers: {
        apikey: config.supabaseKey,
        Authorization: `Bearer ${config.supabaseKey}`,
      },
    },
  );
  if (!response.ok) return [];
  const rows = await response.json();
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    id: String(row.id || ""),
    nome: String(row.nome || ""),
    email: String(row.email || "").toLowerCase(),
    acesso: row.acesso === "web" || row.acesso === "app" || row.acesso === "ambos" ? row.acesso : "ambos",
    administrador: Boolean(row.admin),
    paginas: Array.isArray(row.paginas) ? row.paginas : ["painel", "vistorias", "obras", "configuracoes"],
  }));
}

export function deletePersonInDatabase(config, token, person) {
  return callDatabase(
    config,
    "excluir_pessoa",
    { p_token: token, payload: { email: person.email } },
    "Não foi possível excluir o usuário no banco.",
  );
}
