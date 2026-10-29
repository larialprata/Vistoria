import { useEffect, useState } from "react";
import { Camera } from "lucide-react";

type Props = {
  codigo: string;
  path: string;
  previewUrl?: string;
  compact?: boolean;
};

export function PhotoFrame({ codigo, path, previewUrl, compact = false }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative block w-full overflow-hidden rounded-2xl text-left ${compact ? "aspect-[4/3]" : "aspect-[16/10]"}`}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={`Foto do item ${codigo}`} className="h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(159,47,56,0.55),transparent_42%),linear-gradient(155deg,#4a3530,#1a1412)]" />
        )}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 text-white">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
            <Camera className="h-3 w-3" />
            SharePoint
          </span>
          <span className="mt-1 block truncate font-mono text-[11px] text-white/90">{path}</span>
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="panel w-full max-w-3xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Foto ${codigo}`}
          >
            {previewUrl ? (
              <img src={previewUrl} alt={`Foto do item ${codigo}`} className="max-h-[70vh] w-full object-contain bg-stone-950" />
            ) : (
              <div className="flex aspect-video items-end bg-[radial-gradient(circle_at_25%_20%,rgba(159,47,56,0.55),transparent_42%),linear-gradient(155deg,#4a3530,#1a1412)] p-6 text-white">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/70">Item {codigo}</p>
                  <p className="mt-2 max-w-xl font-mono text-sm leading-relaxed text-white/90">{path}</p>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="truncate font-mono text-xs text-stone-500">{path}</p>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
