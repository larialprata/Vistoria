import { statusVistoria, tituloDaVistoria } from "@shared/painel";
import { situacaoDa } from "@shared/revisao";
import { useAccount, veSomenteObra } from "@shared/session";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExcluirVistoria } from "../components/ExcluirVistoria";
import { usePainel } from "../data";

export function UnitsPage() {
  const { data, loading } = usePainel();
  const soObra = veSomenteObra(useAccount());
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const condominioId = params.get("condominio") || "todos";
  const blocoId = params.get("bloco") || "todos";
  const situacao = params.get("situacao") || "todas";

  const rows = useMemo(() => {
    if (!data) return [];
    return data.vistorias.filter((item) => {
      const place = tituloDaVistoria(data, item);
      const local = data.unidades.find((unidade) => unidade.id === item.unidade_id);
      const bloco = data.blocos.find((entry) => entry.id === local?.bloco_id);
      const text = `${place.titulo} ${place.lugar} ${item.vistoriador}`.toLocaleLowerCase("pt-BR");
      const matchesQuery = text.includes(query.trim().toLocaleLowerCase("pt-BR"));
      const matchesCondo = condominioId === "todos" || bloco?.condominio_id === condominioId;
      const matchesBloco = blocoId === "todos" || bloco?.id === blocoId;
      const matchesSituacao = situacao === "todas" || situacaoDa(item) === situacao;
      return matchesQuery && matchesCondo && matchesBloco && matchesSituacao;
    });
  }, [data, query, condominioId, blocoId, situacao]);

  if (loading || !data) return <main className="canvas"><p className="lead">Carregando o Supabase...</p></main>;
  if (data.error) return <main className="canvas"><h1>Vistorias</h1><section className="empty-card"><h2>Não foi possível ler o Supabase</h2><p>{data.error}</p></section></main>;

  const blocos = data.blocos
    .filter((bloco) => condominioId === "todos" || bloco.condominio_id === condominioId)
    .sort((a, b) => a.numero.localeCompare(b.numero, "pt", { numeric: true }));

  const titulo = soObra || situacao === "obra" ? "Na obra" : situacao === "aprovado" ? "Aprovadas" : situacao === "liberado" ? "Liberadas" : "Vistorias";

  function setFilter(key: "condominio" | "bloco" | "situacao", value: string) {
    const next = new URLSearchParams(params);
    if (value === "todos" || value === "todas") next.delete(key);
    else next.set(key, value);
    if (key === "condominio") next.delete("bloco");
    setParams(next);
  }

  return (
    <main className="canvas">
      <h1>{titulo}</h1>
      <p className="lead">Vistorias enviadas pelo aplicativo, ligadas ao apartamento, ao bloco e ao condomínio.</p>
      <section className="sheet">
        <div className="filters">
          <input placeholder="Buscar unidade ou inspetor" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={condominioId} onChange={(event) => setFilter("condominio", event.target.value)}>
            <option value="todos">Todos os condomínios</option>
            {data.condominios.map((item) => (
              <option key={item.id} value={item.id}>{item.nome}</option>
            ))}
          </select>
          <select value={blocoId} onChange={(event) => setFilter("bloco", event.target.value)}>
            <option value="todos">Todos os blocos</option>
            {blocos.map((item) => (
              <option key={item.id} value={item.id}>Bloco {item.numero}</option>
            ))}
          </select>
          {soObra ? null : (
            <select value={situacao} onChange={(event) => setFilter("situacao", event.target.value)}>
              <option value="todas">Todas as situações</option>
              <option value="aprovado">Aprovado</option>
              <option value="obra">Obra</option>
              <option value="liberado">Liberado</option>
              <option value="vistoria">Vistoria</option>
            </select>
          )}
        </div>
        {rows.length === 0 ? <p className="empty">Nenhuma vistoria chegou do aplicativo ainda. Abra o app uma vez, com a mesma conta, para ela ser enviada.</p> : null}
        {rows.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>UNIDADE</th>
                <th>INSPETOR</th>
                <th>STATUS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const place = tituloDaVistoria(data, item);
                const status = statusVistoria(item.status, item.parecer, item.assinatura, item.situacao);
                return (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/unidades/${item.id}`}>{place.titulo}</Link>
                      <div className="muted">{place.lugar}</div>
                    </td>
                    <td>{item.vistoriador || "—"}</td>
                    <td><span className={`tag ${status.tone}`}>{status.label}</span></td>
                    <td className="row-actions">
                      <Link to={`/unidades/${item.id}/relatorio`} className="open">Relatório</Link>
                      <Link to={`/unidades/${item.id}`} className="open">Abrir</Link>
                      <ExcluirVistoria id={item.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </section>
    </main>
  );
}
