import { quandoDaVistoria } from "@shared/labels";
import { statusVistoria, tituloDaVistoria } from "@shared/painel";
import { situacaoDa } from "@shared/revisao";
import { currentUser, useAccount, veSomenteObra } from "@shared/session";
import { Building2, CheckCircle2, Clock3, Home, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { ExcluirVistoria } from "../components/ExcluirVistoria";
import { usePainel } from "../data";

function formatWhen(data: string, inicio: string, fim: string) {
  return quandoDaVistoria(data, inicio, fim) || "Sem data";
}

export function DashboardPage() {
  const { data, loading } = usePainel();
  const soObra = veSomenteObra(useAccount());
  if (loading || !data) return <main className="canvas"><p className="lead">Carregando o Supabase...</p></main>;
  if (data.error) return <main className="canvas"><h1>Painel</h1><section className="empty-card"><h2>Não foi possível ler o Supabase</h2><p>{data.error}</p></section></main>;

  const recent = data.vistorias.slice(0, 8);
  const aprovadas = data.vistorias.filter((item) => situacaoDa(item) === "aprovado").length;
  const reprovadas = data.vistorias.filter((item) => situacaoDa(item) === "obra").length;
  const liberadas = data.vistorias.filter((item) => situacaoDa(item) === "liberado").length;
  const emVistoria = data.vistorias.filter((item) => situacaoDa(item) === "vistoria").length;

  const name = currentUser() || "equipe";
  const total = data.vistorias.length || 1;
  const faixas = soObra
    ? [{ label: "Obra", valor: reprovadas }]
    : [
        { label: "Vistoria", valor: emVistoria },
        { label: "Obra", valor: reprovadas },
        { label: "Liberado", valor: liberadas },
        { label: "Aprovado", valor: aprovadas },
      ];
  const cartoes = soObra
    ? [{ to: "/unidades", nome: "Obra", total: reprovadas, tom: "red", icone: <XCircle size={20} /> }]
    : [
        { to: "/obras", nome: "Condomínios", total: data.condominios.length, tom: "blue", icone: <Building2 size={20} /> },
        { to: "/unidades", nome: "Unidades", total: data.unidades.length, tom: "teal", icone: <Home size={20} /> },
        { to: "/unidades?situacao=aprovado", nome: "Aprovado", total: aprovadas, tom: "green", icone: <CheckCircle2 size={20} /> },
        { to: "/unidades?situacao=obra", nome: "Obra", total: reprovadas, tom: "red", icone: <XCircle size={20} /> },
        { to: "/unidades?situacao=liberado", nome: "Liberado", total: liberadas, tom: "amber", icone: <Clock3 size={20} /> },
      ];

  return (
    <main className="canvas">
      <section className="dash-top">
        <section className="welcome">
          <p>Painel</p>
          <h1>Olá, {name}</h1>
          <span>{soObra ? "Aqui estão as vistorias com status Obra, para você assinar." : "Que bom ver você de novo. As vistorias, os blocos e os apartamentos estão neste painel."}</span>
          <Link to="/unidades">Abrir vistorias</Link>
        </section>
        <section className="pulse">
          <h2>Andamento</h2>
          {faixas.map((faixa) => (
            <div key={faixa.label} className="pulse-row">
              <span>{faixa.label}</span>
              <div className="pulse-track"><i style={{ width: `${Math.round((faixa.valor / total) * 100)}%` }} /></div>
              <span>{faixa.valor}</span>
            </div>
          ))}
        </section>
      </section>
      <section className="metrics">
        {cartoes.map((cartao) => (
          <Link key={cartao.nome} to={cartao.to}>
            <div>
              <span>{cartao.nome}</span>
              <strong>{cartao.total}</strong>
            </div>
            <span className={`metric-icon ${cartao.tom}`}>{cartao.icone}</span>
          </Link>
        ))}
      </section>
      <section className="dash-grid">
      <section className="sheet recentes">
        <header>
          <h2>Vistorias recentes</h2>
          <Link to="/unidades" className="open">Ver todas</Link>
        </header>
        {recent.length === 0 ? (
          <p className="empty">Nenhuma vistoria no Supabase ainda. Quando uma unidade for vistoriada, ela aparece aqui.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>UNIDADE</th>
                <th>DATA</th>
                <th>INSPETOR</th>
                <th className="col-status">STATUS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((item) => {
                const place = tituloDaVistoria(data, item);
                const status = statusVistoria(item.status, item.parecer, item.assinatura, item.situacao);
                return (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/unidades/${item.id}`}>{place.titulo}</Link>
                      <div className="muted">{place.lugar}</div>
                    </td>
                    <td>{formatWhen(item.data || item.updated_at, item.hora_inicio, item.hora_fim)}</td>
                    <td>{item.vistoriador || "—"}</td>
                    <td className="col-status"><span className={`tag ${status.tone}`}>{status.label}</span></td>
                    <td className="row-actions">
                      <Link to={`/unidades/${item.id}`} className="open">Abrir</Link>
                      <ExcluirVistoria id={item.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <section className="sheet timeline">
        <header>
          <h2>Últimos registros</h2>
        </header>
        {recent.length === 0 ? <p className="empty">Nada por aqui ainda.</p> : (
          <ol>
            {recent.slice(0, 6).map((item) => {
              const place = tituloDaVistoria(data, item);
              const status = statusVistoria(item.status, item.parecer, item.assinatura, item.situacao);
              return (
                <li key={item.id}>
                  <i />
                  <div>
                    <Link to={`/unidades/${item.id}`}>{place.titulo}</Link>
                    <small>{place.lugar} · {formatWhen(item.data || item.updated_at, item.hora_inicio, item.hora_fim)} · {status.label}</small>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      </section>
    </main>
  );
}
