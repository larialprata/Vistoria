import { useSyncExternalStore } from "react";

const KEY = "dime.vistoria.tema";
export type Tema = "claro" | "escuro";

const listeners = new Set<() => void>();
let tema: Tema = "claro";

function read(): Tema | null {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "escuro" || saved === "claro") return saved;
  } catch {
    return null;
  }
  return null;
}

function paint(next: Tema) {
  document.documentElement.dataset.theme = next === "escuro" ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", next === "escuro" ? "#09090b" : "#f4f4f5");
}

export function applyTheme(next: Tema) {
  tema = next;
  if (typeof document !== "undefined") paint(next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* navegador sem armazenamento */
  }
  listeners.forEach((listener) => listener());
}

export function toggleTheme() {
  applyTheme(tema === "escuro" ? "claro" : "escuro");
}

export function useTheme() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => tema,
    () => "claro" as Tema,
  );
}

export function BotaoTema(props: { className?: string }) {
  const atual = useTheme();
  const escuro = atual === "escuro";
  return (
    <button
      type="button"
      className={props.className ?? "theme-toggle"}
      aria-pressed={escuro}
      onClick={toggleTheme}
    >
      {escuro ? "Modo claro" : "Modo escuro"}
    </button>
  );
}

if (typeof document !== "undefined") {
  const saved = read();
  if (saved) {
    tema = saved;
    paint(saved);
  } else if (document.documentElement.dataset.theme === "dark") {
    tema = "escuro";
  }
}
