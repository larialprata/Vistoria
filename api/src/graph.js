import { graphItemPath } from "./path.js";

const SIMPLE_LIMIT = 4 * 1024 * 1024;
const CHUNK = 320 * 1024 * 10;

let tokenCache = { value: "", expiresAt: 0 };
let siteCache = "";

export function resetGraphCache() {
  tokenCache = { value: "", expiresAt: 0 };
  siteCache = "";
}

export async function graphToken(config) {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error_description || "Falha ao autenticar no Microsoft Graph.");
  }
  tokenCache = {
    value: json.access_token,
    expiresAt: Date.now() + Math.max(30_000, (Number(json.expires_in) - 60) * 1000),
  };
  return tokenCache.value;
}

export async function siteId(config, token) {
  if (siteCache) return siteCache;
  const response = await fetch(`https://graph.microsoft.com/v1.0/sites/${config.hostname}:${config.sitePath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error?.message || "Não foi possível abrir o site do SharePoint.");
  }
  siteCache = json.id;
  return siteCache;
}

async function graphGet(url, token, tentativa = 0) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if ((response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) && tentativa < 2) {
    await new Promise((resolve) => setTimeout(resolve, 500 * (tentativa + 1)));
    return graphGet(url, token, tentativa + 1);
  }
  return response;
}

export async function photoExists(config, fullPath) {
  const token = await graphToken(config);
  const site = await siteId(config, token);
  const response = await graphGet(
    `https://graph.microsoft.com/v1.0/sites/${site}/drive/root:/${graphItemPath(fullPath)}?$select=id`,
    token,
  );
  return response.ok;
}

export async function downloadFromSharePoint(config, fullPath) {
  const token = await graphToken(config);
  const site = await siteId(config, token);
  const response = await graphGet(
    `https://graph.microsoft.com/v1.0/sites/${site}/drive/root:/${graphItemPath(fullPath)}:/content`,
    token,
  );
  if (!response.ok) {
    throw new Error("Foto não encontrada no SharePoint.");
  }
  return {
    contentType: response.headers.get("content-type") || "image/jpeg",
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

export function warmGraph(config) {
  return graphToken(config).then((token) => siteId(config, token));
}

export async function uploadToSharePoint(config, fullPath, file) {
  const token = await graphToken(config);
  const site = await siteId(config, token);
  const encoded = graphItemPath(fullPath);
  if (file.buffer.length < SIMPLE_LIMIT) {
    return putSmallFile(token, site, encoded, file);
  }
  return putLargeFile(token, site, encoded, fullPath, file);
}

async function putSmallFile(token, site, encoded, file) {
  const response = await fetch(`https://graph.microsoft.com/v1.0/sites/${site}/drive/root:/${encoded}:/content`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": file.mimetype || "application/octet-stream",
    },
    body: file.buffer,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error?.message || "Não foi possível gravar a foto no SharePoint.");
  }
  return json;
}

async function putLargeFile(token, site, encoded, fullPath, file) {
  const sessionResponse = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site}/drive/root:/${encoded}:/createUploadSession`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        item: {
          "@microsoft.graph.conflictBehavior": "replace",
          name: fullPath.split("/").at(-1),
        },
      }),
    },
  );
  const session = await sessionResponse.json();
  if (!sessionResponse.ok) {
    throw new Error(session.error?.message || "Não foi possível abrir o envio da foto.");
  }

  const size = file.buffer.length;
  let start = 0;
  let result = {};
  while (start < size) {
    const end = Math.min(start + CHUNK, size);
    const chunk = file.buffer.subarray(start, end);
    const response = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${start}-${end - 1}/${size}`,
      },
      body: chunk,
    });
    const text = await response.text();
    if (!response.ok && response.status !== 202) {
      throw new Error("Falha ao enviar a foto em partes.");
    }
    if ((response.status === 200 || response.status === 201) && text) {
      result = JSON.parse(text);
    }
    start = end;
  }
  return result;
}
