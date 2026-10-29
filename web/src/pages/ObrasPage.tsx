import { nomeDoEmpreendimento } from "@shared/catalog";
import { localDaUnidade, statusVistoria, tituloDaVistoria } from "@shared/painel";
import { situacaoDa } from "@shared/revisao";
import { Link } from "react-router-dom";
import { DecisaoDaVistoria } from "../components/DecisaoDaVistoria";
import { ExcluirVistoria } from "../components/ExcluirVistoria";
import { usePainel } from "../data";

export function ObrasPage() {
  const { data, loading } = usePainel();
  if (loading || !data) return <main className="canvas"><p className="lead">Carregando o Supabase...</p></main>;
  if (data.error) return <main className="canvas"><h1>Obras</h1><section className="empty-card"><h2>Não foi possível ler o Supabase</h2><p>{data.error}</p></section></main>;

  return (
    <main className="canvas">
      <h1>Obras</h1>
      <p className="lead">Blocos e apartamentos de cada condomínio.</p>
      {data.condominios.length === 0 ? (
        <section className="empty-card">
          <h2>Nenhum condomínio visível</h2>
          <p>A tabela de condomínios respondeu sem linhas para esta chave. Inclua os locais no Supabase para eles aparecerem aqui e no aplicativo.</p>
        </section>
      ) : null}
      {data.condominios.map((condominio) => {
        const blocos = data.blocos
          .filter((bloco) => bloco.condominio_id === condominio.id)
          .sort((a, b) => a.numero.localeCompare(b.numero, "pt", { numeric: true }));
        const unidades = data.unidades.filter((unidade) => blocos.some((bloco) => bloco.id === unidade.bloco_id));
        const vistorias = data.vistorias.filter((vistoria) => {
          const local = localDaUnidade(data, vistoria.unidade_id);
          if (local.condominio) return local.condominio.id === condominio.id;
          return nomeDoEmpreendimento(vistoria.empreendimento || "") === nomeDoEmpreendimento(condominio.nome);
        });
        const ids = new Set(vistorias.map((vistoria) => vistoria.id));
        const respostas = data.respostas.filter((item) => ids.has(item.vistoria_id));
        const conformes = respostas.filter((item) => item.marca.toUpperCase() === "C").length;
        const naoConformes = respostas.filter((item) => item.marca.toUpperCase() === "NC").length;
        return (
          <section key={condominio.id} className="sheet" style={{ marginBottom: 12 }}>
            <header>
              <h2>{condominio.nome}</h2>
              <Link to={`/unidades?condominio=${condominio.id}`} className="open">
                {unidades.length} apartamentos
              </Link>
            </header>
            <p className="obra-contas">
              <span>{conformes} conformes</span>
              <span>{naoConformes} não conformes</span>
              <span>{vistorias.filter((item) => situacaoDa(item) === "aprovado").length} aprovadas</span>
              <span>{vistorias.filter((item) => situacaoDa(item) === "obra").length} na obra</span>
            </p>
            <div className="block-row">
              {blocos.length === 0 ? <p className="empty">Sem blocos neste condomínio.</p> : null}
              {blocos.map((bloco) => {
                const count = data.unidades.filter((unidade) => unidade.bloco_id === bloco.id).length;
                return (
                  <Link key={bloco.id} to={`/unidades?condominio=${condominio.id}&bloco=${bloco.id}`}>
                    Bloco {bloco.numero}
                    <small>{count} aptos</small>
                  </Link>
                );
              })}
            </div>
            {vistorias.length === 0 ? <p className="empty">Nenhuma vistoria nesta obra.</p> : null}
            {vistorias.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>UNIDADE</th>
                    <th>CERTO / ERRADO</th>
                    <th>SITUAÇÃO</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {vistorias.map((vistoria) => {
                    const place = tituloDaVistoria(data, vistoria);
                    const status = statusVistoria(vistoria.status, vistoria.parecer, vistoria.assinatura, vistoria.situacao);
                    const itens = data.respostas.filter((item) => item.vistoria_id === vistoria.id);
                    const certos = itens.filter((item) => item.marca.toUpperCase() === "C").length;
                    const errados = itens.filter((item) => item.marca.toUpperCase() === "NC").length;
                    return (
                      <tr key={vistoria.id}>
                        <td>
                          <Link to={`/unidades/${vistoria.id}`}>{place.titulo}</Link>
                          <div className="muted">{vistoria.vistoriador || "Sem vistoriador"}</div>
                        </td>
                        <td>{certos} conformes · {errados} não conformes</td>
                        <td><span className={`tag ${status.tone}`}>{status.label}</span></td>
                        <td className="row-actions">
                          <DecisaoDaVistoria id={vistoria.id} parecer={vistoria.parecer} situacao={vistoria.situacao} responsavel={vistoria.responsavelObra} assinatura={vistoria.assinatura} />
                          <ExcluirVistoria id={vistoria.id} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </section>
        );
      })}
    </main>
  );
}
