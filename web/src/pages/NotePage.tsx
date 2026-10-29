import { usePainel } from "../data";

export function ConfigPage() {
  const { data, loading } = usePainel();
  const lines = data
    ? [
        ["Condomínios", data.condominios.length],
        ["Blocos", data.blocos.length],
        ["Unidades", data.unidades.length],
        ["Vistorias", data.vistorias.length],
        ["Respostas", data.respostas.length],
        ["Itens do checklist", data.itens.length],
      ]
    : [];

  return (
    <main className="canvas">
      <h1>Configurações</h1>
      <p className="lead">O painel lê o Supabase. As fotos seguem para a pasta Teste/Vistoria no SharePoint quando a API de fotos está ligada.</p>
      <section className="sheet">
        <header><h2>O que o Supabase devolveu</h2></header>
        {loading ? <p className="empty">Carregando...</p> : null}
        {data?.error ? <p className="empty">{data.error}</p> : null}
        {!loading && data && !data.error ? (
          <table>
            <tbody>
              {lines.map(([label, count]) => (
                <tr key={String(label)}>
                  <td>{label}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </main>
  );
}

export function NotePage(props: { title: string; text: string }) {
  return (
    <main className="canvas">
      <h1>{props.title}</h1>
      <p className="lead">{props.text}</p>
    </main>
  );
}
