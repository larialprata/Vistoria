import { excluirVistoria } from "@shared/accounts";
import { useAccount } from "@shared/session";
import { useState } from "react";
import { usePainel } from "../data";

export function ExcluirVistoria({ id, onDeleted }: { id: string; onDeleted?: () => void }) {
  const conta = useAccount();
  const { reload } = usePainel();
  const [pedindo, setPedindo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  if (!conta?.administrador) return null;

  async function confirmar() {
    setBusy(true);
    setErro("");
    try {
      await excluirVistoria(id);
      await reload();
      onDeleted?.();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível excluir a vistoria.");
      setBusy(false);
    }
  }

  if (!pedindo) {
    return (
      <button type="button" className="open" onClick={() => setPedindo(true)}>
        Excluir
      </button>
    );
  }

  return (
    <span className="row-actions">
      <button type="button" className="open" disabled={busy} onClick={() => confirmar()}>
        {busy ? "Excluindo..." : "Confirmar"}
      </button>
      <button
        type="button"
        className="open"
        disabled={busy}
        onClick={() => {
          setPedindo(false);
          setErro("");
        }}
      >
        Cancelar
      </button>
      {erro ? <span className="muted">{erro}</span> : null}
    </span>
  );
}
