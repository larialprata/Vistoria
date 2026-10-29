import { apiBase, loadLocalPhoto } from "@shared/photos";
import { currentAccount } from "@shared/session";
import { useEffect, useState } from "react";

export function FotoDoCampo({
  path,
  previewUrl,
  className,
  textoClassName,
}: {
  path: string;
  previewUrl?: string;
  className: string;
  textoClassName: string;
}) {
  const [url, setUrl] = useState(previewUrl || "");
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (previewUrl) {
      setUrl(previewUrl);
      setFalhou(false);
      return;
    }
    setUrl("");
    setFalhou(false);
    if (!path) {
      setFalhou(true);
      return;
    }
    const api = apiBase();
    const token = currentAccount()?.token;
    const controller = new AbortController();
    let objectUrl = "";
    let cancelado = false;
    const local = loadLocalPhoto(path)
      .then((blob) => {
        if (cancelado || !blob) return false;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setFalhou(false);
        return true;
      })
      .catch(() => false);
    const remoto =
      !api || !token
        ? Promise.resolve(false)
        : fetch(`${api}/fotos?path=${encodeURIComponent(path)}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          })
            .then(async (response) => {
              if (!response.ok) return false;
              const blob = await response.blob();
              if (cancelado || blob.size < 1) return false;
              if (objectUrl) URL.revokeObjectURL(objectUrl);
              objectUrl = URL.createObjectURL(blob);
              setUrl(objectUrl);
              setFalhou(false);
              return true;
            })
            .catch(() => false);
    void Promise.all([local, remoto]).then(([temLocal, temRemota]) => {
      if (!cancelado && !temLocal && !temRemota) setFalhou(true);
    });
    return () => {
      cancelado = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, previewUrl]);

  if (url) return <img className={className} alt="" src={url} />;
  if (falhou) return <p className={textoClassName}>A foto não pôde ser aberta.</p>;
  return <p className={textoClassName}>Carregando a foto...</p>;
}
