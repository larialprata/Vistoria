import { useEffect, useState } from "react";
import { fotosParadas, usarFotosParadas } from "./photos";

function subirAgora() {
  return import("./fotos-subida").then((modulo) => modulo.forcarSubidaDasFotos());
}

/** Aviso fixo enquanto alguma foto deste aparelho ainda não chegou na pasta. */
export function AvisoFotos() {
  const falhas = usarFotosParadas();
  const [enviando, setEnviando] = useState(false);
  const [recado, setRecado] = useState("");

  useEffect(() => {
    if (!fotosParadas().length) return;
    const timer = window.setInterval(() => {
      void subirAgora();
    }, 25000);
    return () => window.clearInterval(timer);
  }, [falhas.length]);

  if (!falhas.length && !enviando) return null;

  async function enviar() {
    setEnviando(true);
    setRecado("");
    try {
      const resultado = await subirAgora();
      if (resultado.faltam && resultado.semArquivo >= resultado.faltam) {
        setRecado("Abra o aparelho em que a foto foi tirada para enviar.");
      } else if (resultado.faltam) {
        setRecado("Ainda falta enviar. Confira a internet e toque de novo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  const quantidade = falhas.length;
  const texto =
    quantidade === 1 ? "1 foto falta na pasta." : `${quantidade} fotos faltam na pasta.`;

  return (
    <div className="aviso-fotos no-print" role="status">
      <div>
        <p>{texto}</p>
        {recado ? <small>{recado}</small> : null}
      </div>
      <button type="button" disabled={enviando} onClick={() => void enviar()}>
        {enviando ? "Enviando..." : "Enviar agora"}
      </button>
    </div>
  );
}
