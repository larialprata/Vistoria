import { apiBase } from "@shared/photos";
import { currentAccount } from "@shared/session";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function FotoDaVistoria({ path }: { path: string }) {
  const [url, setUrl] = useState("");
  const [falhou, setFalhou] = useState(false);
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    const api = apiBase();
    const token = currentAccount()?.token;
    if (!path || !api || !token) {
      setFalhou(true);
      return;
    }
    setFalhou(false);
    const controller = new AbortController();
    let objectUrl = "";
    let ativo = true;
    fetch(`${api}/fotos?path=${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const final = response.ok
          ? response
          : await fetch(`${api}/fotos?path=${encodeURIComponent(path)}`, {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal,
            });
        if (!final.ok) throw new Error("sem foto");
        objectUrl = URL.createObjectURL(await final.blob());
        if (ativo) setUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (!ativo || (error instanceof Error && error.name === "AbortError")) return;
        setFalhou(true);
      });
    return () => {
      ativo = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  useEffect(() => {
    if (!aberta) return;
    function fechar(event: KeyboardEvent) {
      if (event.key === "Escape") setAberta(false);
    }
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberta]);

  if (url) {
    return (
      <>
        <button type="button" className="foto-abrir" onClick={() => setAberta(true)}>
          <img src={url} alt="Foto do item vistoriado" />
        </button>
        {aberta
          ? createPortal(
              <button type="button" className="foto-vista" onClick={() => setAberta(false)} aria-label="Fechar a foto">
                <img src={url} alt="Foto do item vistoriado" />
              </button>,
              document.body,
            )
          : null}
      </>
    );
  }
  if (falhou) return <p className="muted">A foto não pôde ser aberta.</p>;
  return <p className="muted">Carregando a foto...</p>;
}
