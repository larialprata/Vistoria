import { itemByCode } from "@shared/checklist";
import { nomePavimento } from "@shared/labels";
import { localDaUnidade, statusVistoria, type RespostaRemota } from "@shared/painel";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FotoDaVistoria } from "../components/FotoDaVistoria";
import { DecisaoDaVistoria } from "../components/DecisaoDaVistoria";
import { ExcluirVistoria } from "../components/ExcluirVistoria";
import { usePainel } from "../data";

const MARCA: Record<string, string> = {
  C: "Conforme",
  NC: "Não conforme",
  NA: "Não se aplica",
};

function textoDoItem(codigo: string, itens: { codigo: string; texto: string }[]) {
  return itens.find((item) => item.codigo === codigo)?.texto || itemByCode(codigo)?.texto || "Item sem texto no checklist";
}

export function UnitPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, loading } = usePainel();
  if (loading || !data) return <main className="canvas"><p className="lead">Carregando o Supabase...</p></main>;

  const vistoria = data.vistorias.find((item) => item.id === id);
  if (!vistoria) {
    return (
      <main className="canvas">
        <section className="empty-card">
          <h2>Vistoria não encontrada</h2>
          <p>Esse registro não está no Supabase.</p>
          <Link to="/unidades" className="open">Voltar às vistorias</Link>
        </section>
      </main>
    );
  }

  const { unidade, bloco, condominio } = localDaUnidade(data, vistoria.unidade_id);
  const status = statusVistoria(vistoria.status, vistoria.parecer, vistoria.assinatura, vistoria.situacao);
  const respostas = data.respostas
    .filter((item) => item.vistoria_id === vistoria.id)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt", { numeric: true }));
  const nc = respostas.filter((item) => item.marca.toUpperCase() === "NC");

  return (
    <main className="canvas">
      <Link to="/unidades" className="back">
        <ArrowLeft size={16} />
        Vistorias
      </Link>
      <header className="sheet dossier-head">
        <div>
          <p className="kicker">{condominio?.nome || "Sem condomínio"}</p>
          <h1>{vistoria.escopo === "escada" ? `${bloco ? `Bloco ${bloco.numero}` : vistoria.bloco ? `Bloco ${vistoria.bloco}` : "Bloco"} · ${nomePavimento(vistoria.pavimento) || "Escada e hall"}` : `${bloco ? `Bloco ${bloco.numero}` : "Bloco"} · ${unidade ? `Apto ${unidade.numero}` : "Unidade"}`}</h1>
          <p className="lead">
            <span className={`tag ${status.tone}`}>{status.label}</span>
            {vistoria.vistoriador ? ` · ${vistoria.vistoriador}` : ""}
            {vistoria.revisao ? ` · revisão ${vistoria.revisao}` : ""}
          </p>
        </div>
        <div className="dossier-actions no-print">
          <div className="mini-metrics">
            <article><strong>{respostas.length}</strong><span>Respostas</span></article>
            <article><strong>{nc.length}</strong><span>Não conformes</span></article>
          </div>
          <Link to={`/unidades/${vistoria.id}/relatorio`} className="btn-primary">Relatório</Link>
          <ExcluirVistoria id={vistoria.id} onDeleted={() => navigate("/unidades")} />
        </div>
      </header>
      <DecisaoDaVistoria id={vistoria.id} parecer={vistoria.parecer} situacao={vistoria.situacao} responsavel={vistoria.responsavelObra} assinatura={vistoria.assinatura} />
      <section className="sheet" style={{ marginTop: 16 }}>
        <header><h2>Itens da vistoria</h2></header>
        {respostas.length === 0 ? <p className="empty">Nenhum item preenchido nesta vistoria.</p> : null}
        {respostas.length > 0 ? (
          <div className="vistoria-itens">
            {respostas.map((resposta) => (
              <ItemDaVistoria key={resposta.id} resposta={resposta} descricao={textoDoItem(resposta.codigo, data.itens)} />
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ItemDaVistoria({ resposta, descricao }: { resposta: RespostaRemota; descricao: string }) {
  const marca = resposta.marca.toUpperCase();
  return (
    <article className="vistoria-item">
      <div>
        <strong>{resposta.codigo}{resposta.comodo ? ` · ${resposta.comodo}` : ""}</strong>
        <span className={`tag ${marca === "NC" ? "bad" : "ok"}`}>{MARCA[marca] || marca}</span>
      </div>
      <p>{descricao}</p>
      {resposta.observacao ? <p className="obs">{resposta.observacao}</p> : null}
      {marca === "NC" && resposta.gravidade ? <p className="muted">Gravidade {resposta.gravidade}</p> : null}
      {(resposta.fotos?.length ? resposta.fotos : resposta.sharepoint_path ? [resposta.sharepoint_path] : []).map((caminho, indice) => (
        <figure key={caminho}>
          <FotoDaVistoria path={caminho} />
          {resposta.anotacoes?.[indice] ? <figcaption className="foto-nota">{resposta.anotacoes[indice]}</figcaption> : null}
        </figure>
      ))}
    </article>
  );
}
