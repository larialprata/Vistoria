export function joinSharePointPath(base, relative) {
  const cleanBase = trimSlashes(base);
  const cleanRelative = normalizeRelative(relative);
  return [cleanBase, cleanRelative].filter(Boolean).join("/");
}

function trimSlashes(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function normalizeRelative(relative) {
  const raw = String(relative || "").replace(/\\/g, "/").trim();
  if (!raw || raw.includes("\0") || raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) {
    throw new Error("Caminho da foto inválido.");
  }
  const parts = raw.split("/").filter((part) => part.length > 0);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Caminho da foto inválido.");
  }
  if (parts.some((part) => /[<>:"|?*]/.test(part))) {
    throw new Error("Caminho da foto inválido.");
  }
  return parts.join("/");
}

export function graphItemPath(fullPath) {
  return fullPath.split("/").map((part) => encodeURIComponent(part)).join("/");
}

export function resolvePhotoPath(base, requested) {
  const cleanBase = trimSlashes(base);
  const raw = String(requested || "").replace(/\\/g, "/").trim().replace(/^\/+/, "");
  if (cleanBase && (raw === cleanBase || raw.startsWith(`${cleanBase}/`))) {
    return joinSharePointPath(cleanBase, raw.slice(cleanBase.length).replace(/^\/+/, ""));
  }
  return joinSharePointPath(cleanBase, raw);
}
