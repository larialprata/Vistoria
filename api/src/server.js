import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { uploadToSharePoint, warmGraph } from "./graph.js";
import { joinSharePointPath } from "./path.js";
import { attachInspections } from "./inspections.js";
import { attachPeople, createPeopleStore } from "./people.js";

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, "..", ".env"), override: true });

const MAX_BYTES = 25 * 1024 * 1024;

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 8787),
    tenantId: env.AZURE_TENANT_ID || env.SHAREPOINT_TENANT_ID || "5710dcf3-3139-412f-870d-5fac2a1c045a",
    clientId: env.SHAREPOINT_CLIENT_ID || "",
    clientSecret: env.SHAREPOINT_CLIENT_SECRET || "",
    outlookClientId: env.AZURE_CLIENT_ID && env.AZURE_CLIENT_SECRET ? env.AZURE_CLIENT_ID : env.SHAREPOINT_CLIENT_ID || "",
    outlookClientSecret: env.AZURE_CLIENT_ID && env.AZURE_CLIENT_SECRET ? env.AZURE_CLIENT_SECRET : env.SHAREPOINT_CLIENT_SECRET || "",
    hostname: env.SHAREPOINT_HOSTNAME || "dimensionaleng.sharepoint.com",
    sitePath: env.SHAREPOINT_SITE_PATH || "/sites/TI895",
    basePath: env.SHAREPOINT_BASE_PATH || "Teste/Vistoria",
    corsOrigin: env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174,http://localhost:5178",
    supabaseUrl: env.SUPABASE_URL || "",
    supabaseKey: env.SUPABASE_ANON_KEY || "",
    avisoPara: env.AVISO_OBRA_PARA || "timemangueira@dimensionalengenharia.com",
    avisoDe: env.AVISO_OBRA_DE || "timemangueira@dimensionalengenharia.com",
  };
}

export function missingKeys(config) {
  return [
    ["SHAREPOINT_TENANT_ID", config.tenantId],
    ["SHAREPOINT_CLIENT_ID", config.clientId],
    ["SHAREPOINT_CLIENT_SECRET", config.clientSecret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

function origemPermitida(origin, allowed) {
  if (allowed.includes("*") || allowed.includes(origin)) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    const portaDeTeste = url.port === "5173" || url.port === "5174" || url.port === "5178";
    const redeLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    return portaDeTeste && redeLocal;
  } catch {
    return false;
  }
}

export function createApp(config = loadConfig()) {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES },
  });
  const allowed = config.corsOrigin
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origemPermitida(origin, allowed)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json());
  const people = createPeopleStore(join(here, "..", "data", "pessoas.json"));
  attachPeople(app, people, config);
  attachInspections(app, people, join(here, "..", "data", "vistorias.json"), config);

  app.get("/health", (_req, res) => {
    const missing = missingKeys(config);
    res.json({
      ok: missing.length === 0,
      site: `${config.hostname}${config.sitePath}`,
      pasta: config.basePath,
      missing,
    });
  });

  app.post("/fotos", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Arquivo ausente." });
        return;
      }
      const sharepointPath = joinSharePointPath(config.basePath, req.body?.path);
      const missing = missingKeys(config);
      if (missing.length) {
        res.status(503).json({ error: `Faltam as chaves: ${missing.join(", ")}.` });
        return;
      }
      await uploadToSharePoint(config, sharepointPath, req.file);
      res.json({ sharepointPath });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao guardar a foto.";
      console.error("Falha ao guardar a foto:", message);
      const status = message.includes("inválido") ? 400 : 502;
      res.status(status).json({ error: message });
    }
  });

  app.use((error, _req, res, next) => {
    if (!error) {
      next();
      return;
    }
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "A foto passou de 25 MB." });
      return;
    }
    res.status(500).json({ error: "Falha ao receber a foto." });
  });

  return app;
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isMain) {
  const config = loadConfig();
  createApp(config).listen(config.port, "0.0.0.0", () => {
    const missing = missingKeys(config);
    console.log(`API de fotos em http://localhost:${config.port}`);
    console.log(config.supabaseUrl ? "Supabase ligado para vistorias e usuários." : "Supabase ainda sem endereço.");
    console.log(`Pasta: ${config.basePath}`);
    if (missing.length) console.log(`Ainda faltam: ${missing.join(", ")}`);
    else warmGraph(config).catch((error) => console.error(error instanceof Error ? error.message : "Falha ao preparar o SharePoint."));
  });
}
