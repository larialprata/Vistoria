function text(value) {
  return value == null ? "" : String(value).trim();
}

function nomeDoLugar(nome) {
  const baixo = text(nome).toLocaleLowerCase("pt-BR");
  if (["condomínio ii", "condominio ii", "mangueira ii", "mangueira - cond ii"].includes(baixo)) return "Mangueira - Cond II";
  if (["condomínio ibge", "condominio ibge", "ibge", "mangueira ibge"].includes(baixo)) return "Mangueira IBGE";
  return text(nome);
}

export function contarNc(answers) {
  return (answers || []).filter((item) => text(item?.mark || item?.marca).toUpperCase() === "NC").length;
}

export function textoDoAviso(row) {
  const assinante = text(row?.assinante) || "Alguém";
  const aprovada = row?.parecer === "aprovada";
  const resultado = aprovada ? "aprovada" : "reprovada";
  const pedido = aprovada
    ? "Necessário assinatura do responsável da obra para finalizar a vistoria."
    : "Necessário assinatura do responsável da obra para nova vistoria.";
  const nc = contarNc(row?.answers);
  const lugar = [nomeDoLugar(row?.empreendimento), text(row?.bloco) ? `bloco ${text(row.bloco)}` : "", text(row?.unidade) ? `apartamento ${text(row.unidade)}` : ""]
    .filter(Boolean)
    .join(", ");
  const onde = lugar ? ` de ${lugar}` : "";
  return {
    assunto: lugar ? `Vistoria em obra: ${lugar}` : "Vistoria em obra",
    corpo: `${assinante} assinou a vistoria${onde}.\nResultado: ${resultado}.\nNC: ${nc}.\n\n${pedido}`,
  };
}

let tokenCache = { value: "", expiresAt: 0 };

async function tokenDeAviso(config) {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;
  const body = new URLSearchParams({
    client_id: config.outlookClientId,
    client_secret: config.outlookClientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Não foi possível autenticar o aviso da obra.");
  tokenCache = {
    value: json.access_token,
    expiresAt: Date.now() + Math.max(30_000, (Number(json.expires_in) - 60) * 1000),
  };
  return tokenCache.value;
}

export async function enviarAvisoDeObra(config, row) {
  const para = text(config?.avisoPara) || "timemangueira@dimensionalengenharia.com";
  const de = text(config?.avisoDe) || para;
  if (!config?.tenantId || !config?.outlookClientId || !config?.outlookClientSecret) {
    throw new Error("O aviso por e-mail ainda não está configurado.");
  }
  const aviso = textoDoAviso(row);
  const token = await tokenDeAviso(config);
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(de)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: aviso.assunto,
        body: { contentType: "Text", content: aviso.corpo },
        toRecipients: [{ emailAddress: { address: para } }],
      },
      saveToSentItems: false,
    }),
  });
  if (response.status === 202) return;
  const json = await response.json().catch(() => ({}));
  const codigo = text(json.error?.code);
  if (response.status === 403 || codigo === "ErrorAccessDenied" || codigo === "Authorization_RequestDenied") {
    throw new Error("O aplicativo Vistoria fotos ainda não pode enviar e-mail. Em API permissions, adicione Mail.Send e conceda o consentimento do administrador.");
  }
  throw new Error(text(json.error?.message) || "Não foi possível enviar o aviso da obra.");
}
