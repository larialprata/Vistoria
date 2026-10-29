import { decidirVistoria } from "@shared/accounts";
import { situacaoDa } from "@shared/revisao";
import { podeAssinarObra, podeAssinarVistoria, useAccount } from "@shared/session";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { usePainel } from "../data";

export function DecisaoDaVistoria({
  id,
  parecer,
  situacao = "",
  responsavel = "",
  assinatura = "",
}: {
  id: string;
  parecer?: string;
  situacao?: string;
  responsavel?: string;
  assinatura?: string;
}) {
  const conta = useAccount();
  const { reload } = usePainel();
  const atual = situacaoDa({ parecer, situacao });
  const assinada = assinatura.startsWith("data:image");
  const aprovadaNaVistoria = (parecer || "").toLowerCase() === "aprovada";
  const [pedido, setPedido] = useState<"" | "aprovada" | "reprovada" | "liberado" | "finalizar">("");
  const [busy, setBusy] = useState<"" | "aprovada" | "reprovada" | "liberado" | "finalizar">("");
  const [erro, setErro] = useState("");
  const podeVistoria = podeAssinarVistoria(conta);
  const podeObra = podeAssinarObra(conta);
  if (!podeVistoria && !podeObra) return null;

  async function decidir(valor: "aprovada" | "reprovada" | "liberado" | "finalizar", imagem = "") {
    setBusy(valor);
    setErro("");
    try {
      const nome = valor === "liberado" || valor === "finalizar" ? conta?.nome || responsavel : responsavel;
      await decidirVistoria(id, valor, imagem, nome);
      setPedido("");
      await reload();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível registrar a decisão.");
    } finally {
      setBusy("");
    }
  }

  const titulo =
    pedido === "aprovada"
      ? "Assine para aprovar"
      : pedido === "reprovada"
        ? "Assine para reprovar"
        : pedido === "finalizar"
          ? "Assine para finalizar"
          : "Assine para enviar a nova vistoria";

  return (
    <div className="decisao no-print">
      {atual === "aprovado" && assinada ? <p>Assinada. Esta revisão não pode mais ser alterada.</p> : null}
      {pedido ? (
        <AssinaturaDaDecisao
          titulo={titulo}
          busy={busy === pedido}
          onCancel={() => setPedido("")}
          onConfirm={(imagem) => void decidir(pedido, imagem)}
        />
      ) : (
        <div className="decisao-botoes">
          {!assinada && atual === "vistoria" && podeVistoria ? (
            <button type="button" className="btn-primary" disabled={busy !== ""} onClick={() => setPedido("aprovada")}>
              Aprovar
            </button>
          ) : null}
          {!assinada && atual === "vistoria" && podeVistoria ? (
            <button type="button" className="btn-ghost decisao-nao" disabled={busy !== ""} onClick={() => setPedido("reprovada")}>
              Reprovar
            </button>
          ) : null}
          {atual === "obra" && podeObra && aprovadaNaVistoria ? (
            <button type="button" className="btn-primary" disabled={busy !== ""} onClick={() => setPedido("finalizar")}>
              Finalizar vistoria
            </button>
          ) : null}
          {atual === "obra" && podeObra && !aprovadaNaVistoria ? (
            <button type="button" className="btn-primary" disabled={busy !== ""} onClick={() => setPedido("liberado")}>
              Enviar para nova vistoria
            </button>
          ) : null}
        </div>
      )}
      {atual === "obra" && aprovadaNaVistoria ? <p>Obra. O responsável da obra assina para finalizar.</p> : null}
      {atual === "obra" && !aprovadaNaVistoria ? <p>Obra. O responsável da obra assina para enviar a uma nova vistoria.</p> : null}
      {atual === "liberado" ? <p>Liberado para uma nova vistoria.</p> : null}
      {atual === "aprovado" ? <p>Aprovado. Não há nova revisão.</p> : null}
      {erro ? <p>{erro}</p> : null}
    </div>
  );
}

function AssinaturaDaDecisao({
  titulo,
  busy,
  onCancel,
  onConfirm,
}: {
  titulo: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (assinatura: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [vazia, setVazia] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const escala = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * escala));
    canvas.height = Math.max(1, Math.round(rect.height * escala));
    const contexto = canvas.getContext("2d");
    if (!contexto) return;
    contexto.scale(escala, escala);
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, rect.width, rect.height);
    contexto.strokeStyle = "#111111";
    contexto.lineWidth = 2.4;
    contexto.lineCap = "round";
    contexto.lineJoin = "round";
  }, []);

  function ponto(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function iniciar(event: PointerEvent<HTMLCanvasElement>) {
    const contexto = canvasRef.current?.getContext("2d");
    if (!contexto) return;
    const atual = ponto(event);
    contexto.beginPath();
    contexto.moveTo(atual.x, atual.y);
    desenhando.current = true;
    setVazia(false);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* O traço continua mesmo se o navegador não capturar o toque. */
    }
  }

  function mover(event: PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const contexto = canvasRef.current?.getContext("2d");
    if (!contexto) return;
    const atual = ponto(event);
    contexto.lineTo(atual.x, atual.y);
    contexto.stroke();
  }

  return (
    <div className="assinatura-pad">
      <strong>{titulo}</strong>
      <canvas
        ref={canvasRef}
        onPointerDown={iniciar}
        onPointerMove={mover}
        onPointerUp={() => {
          desenhando.current = false;
        }}
        onPointerCancel={() => {
          desenhando.current = false;
        }}
      />
      <div className="assinatura-acoes">
        <button
          type="button"
          onClick={() => {
            const canvas = canvasRef.current;
            const contexto = canvas?.getContext("2d");
            if (!canvas || !contexto) return;
            const rect = canvas.getBoundingClientRect();
            contexto.fillStyle = "#ffffff";
            contexto.fillRect(0, 0, rect.width, rect.height);
            contexto.strokeStyle = "#111111";
            setVazia(true);
          }}
        >
          Limpar
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={vazia || busy}
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas || vazia) return;
            onConfirm(canvas.toDataURL("image/jpeg", 0.7));
          }}
        >
          {busy ? "Salvando..." : "Concluir com a assinatura"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
