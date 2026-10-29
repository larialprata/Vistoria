import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = import.meta.dirname;

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@shared": path.resolve(root, "../shared/src"),
    },
  },
  server: {
    port: 5174,
    host: true,
    proxy: {
      "/estado": "http://127.0.0.1:8787",
      "/entrar": "http://127.0.0.1:8787",
      "/eu": "http://127.0.0.1:8787",
      "/pessoas": "http://127.0.0.1:8787",
      "/senha": "http://127.0.0.1:8787",
      "/fotos": "http://127.0.0.1:8787",
      "/vistorias": {
        target: "http://127.0.0.1:8787",
        bypass(req) {
          if (req.headers.accept?.includes("text/html")) return "/index.html";
        },
      },
      "/health": "http://127.0.0.1:8787",
    },
  },
});
