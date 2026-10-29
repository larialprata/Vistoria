import { cadastrarPessoa, excluirPessoa, listarPessoas, salvarPermissoes, type Pessoa } from "@shared/accounts";
import { currentAccount, enterSession, leaveSession, PAGINAS, type Acesso, type Pagina } from "@shared/session";
import { FormEvent, useEffect, useState } from "react";

const ACESSO: { id: Acesso; label: string }[] = [
  { id: "web", label: "Só o painel" },
  { id: "app", label: "Só o aplicativo" },
  { id: "ambos", label: "Painel e aplicativo" },
];

function initial(nome: string) {
  return (nome.trim()[0] || "?").toUpperCase();
}

export function UsuariosPage() {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [acesso, setAcesso] = useState<Acesso>("ambos");
  const [administrador, setAdministrador] = useState(false);
  const [visualizar, setVisualizar] = useState(false);
  const [assinarVistoria, setAssinarVistoria] = useState(false);
  const [assinarObra, setAssinarObra] = useState(false);
  const [editando, setEditando] = useState<Pessoa | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const contaAtual = currentAccount();
  const podeCadastrar = Boolean(contaAtual?.administrador);

  function paginasMarcadas(): Pagina[] {
    if (administrador || acesso === "app") return PAGINAS.map((item) => item.id);
    if (visualizar || assinarVistoria || assinarObra) return ["painel", "vistorias", "obras"];
    return [];
  }

  async function load() {
    setPessoas(await listarPessoas());
  }

  useEffect(() => {
    if (!podeCadastrar) return;
    load().catch((error) => {
      const message = error instanceof Error ? error.message : "Não foi possível carregar os usuários.";
      if (message.toLowerCase().includes("entre")) {
        leaveSession();
        return;
      }
      setErro(message);
      setPessoas([]);
    });
  }, [podeCadastrar]);

  function abrir(pessoa: Pessoa) {
    setEditando(pessoa);
    setAcesso(pessoa.acesso);
    setAdministrador(Boolean(pessoa.administrador));
    setVisualizar(pessoa.visualizar ?? Boolean(pessoa.administrador || pessoa.paginas?.some((id) => id !== "configuracoes")));
    setAssinarVistoria(pessoa.assinarVistoria ?? Boolean(pessoa.administrador));
    setAssinarObra(pessoa.assinarObra ?? Boolean(pessoa.administrador));
    setErro("");
    setOk("");
  }

  function limparCadastro() {
    setNome("");
    setEmail("");
    setSenha("");
    setAcesso("ambos");
    setAdministrador(false);
    setVisualizar(false);
    setAssinarVistoria(false);
    setAssinarObra(false);
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setErro("");
    setOk("");
    setBusy(true);
    try {
      await cadastrarPessoa({ nome, email, senha, acesso, administrador, paginas: paginasMarcadas(), visualizar, assinarVistoria, assinarObra });
      limparCadastro();
      setOk("Usuário cadastrado.");
      await load();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível cadastrar.");
    } finally {
      setBusy(false);
    }
  }

  function podeExcluir(pessoa: Pessoa) {
    return pessoa.email !== "admin@exemplo.com" && pessoa.email !== contaAtual?.email;
  }

  async function onDelete(pessoa: Pessoa) {
    setErro("");
    setOk("");
    setBusy(true);
    try {
      await excluirPessoa(pessoa.id);
      if (editando?.id === pessoa.id) setEditando(null);
      setExcluindo(null);
      setOk("Usuário excluído.");
      await load();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      setBusy(false);
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!editando) return;
    setErro("");
    setOk("");
    setBusy(true);
    try {
      const salva = await salvarPermissoes({ id: editando.id, acesso, administrador, paginas: paginasMarcadas(), visualizar, assinarVistoria, assinarObra });
      const conta = currentAccount();
      if (conta && conta.email === salva.email) {
        enterSession({
          ...conta,
          acesso: salva.acesso,
          administrador: salva.administrador,
          paginas: salva.paginas,
          visualizar: salva.visualizar,
          assinarVistoria: salva.assinarVistoria,
          assinarObra: salva.assinarObra,
        });
      }
      setOk("Permissões salvas.");
      setEditando(salva);
      await load();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  const campos = (
    <>
      <label>
        Onde pode entrar
        <select className="field" value={acesso} onChange={(event) => setAcesso(event.target.value as Acesso)}>
          {ACESSO.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={administrador} onChange={(event) => setAdministrador(event.target.checked)} />
        Administrador
      </label>
      {administrador ? <p className="hint">O administrador visualiza, assina e altera tudo. As permissões abaixo valem para as outras pessoas.</p> : null}
      {acesso === "app" ? <p className="hint">Quem usa só o aplicativo não abre as páginas do painel.</p> : null}
      <fieldset className="perm-grid">
        <legend>Permissões</legend>
        <label className="check">
          <input type="checkbox" checked={visualizar} onChange={(event) => setVisualizar(event.target.checked)} />
          Visualização
        </label>
        <label className="check">
          <input type="checkbox" checked={assinarVistoria} onChange={(event) => setAssinarVistoria(event.target.checked)} />
          Assinar a vistoria
        </label>
        <label className="check">
          <input type="checkbox" checked={assinarObra} onChange={(event) => setAssinarObra(event.target.checked)} />
          Responsável da obra
        </label>
      </fieldset>
      <p className="hint">Quem assina a vistoria aprova ou reprova. O status vai para obra. O responsável da obra só vê e só assina o status Obra: finaliza se foi aprovada, ou envia para uma nova vistoria se foi reprovada.</p>
      {erro ? <p className="note bad">{erro}</p> : null}
      {ok ? <p className="note ok">{ok}</p> : null}
    </>
  );

  return (
    <main className="canvas">
      <h1>Usuários</h1>
      <p className="lead">
        {podeCadastrar
          ? "O administrador mexe em tudo. Para as outras pessoas, marque visualização, assinatura da vistoria ou responsável da obra."
          : "Só um administrador pode cadastrar usuários."}
      </p>
      {podeCadastrar ? (
        <div className="people users">
          {editando ? (
            <form className="sheet" onSubmit={onSave}>
              <header>
                <h2>Permissões</h2>
                <button type="button" className="open" onClick={() => setEditando(null)}>
                  Novo
                </button>
              </header>
              <div className="person">
                <span className="avatar">{initial(editando.nome)}</span>
                <div>
                  {editando.nome}
                  <small>{editando.email}</small>
                </div>
              </div>
              {campos}
              <div className="actions">
                <button className="btn-primary" type="submit" disabled={busy}>
                  {busy && !excluindo ? "Salvando..." : "Salvar permissões"}
                </button>
              </div>
            </form>
          ) : (
            <form className="sheet" onSubmit={onCreate}>
              <header>
                <h2>Novo usuário</h2>
              </header>
              <label>
                Nome
                <input className="field" value={nome} onChange={(event) => setNome(event.target.value)} required />
              </label>
              <label>
                E-mail
                <input className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <label>
                Senha inicial
                <input className="field" type="password" autoComplete="new-password" value={senha} onChange={(event) => setSenha(event.target.value)} required minLength={6} />
              </label>
              {campos}
              <div className="actions">
                <button className="btn-primary" type="submit" disabled={busy}>
                  {busy && !excluindo ? "Cadastrando..." : "Cadastrar"}
                </button>
              </div>
            </form>
          )}
          <section className="sheet">
            <header>
              <h2>Usuários</h2>
              <span className="open">{pessoas.length}</span>
            </header>
            {pessoas.length === 0 ? <p className="empty">Nenhum usuário cadastrado.</p> : null}
            {pessoas.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>PESSOA</th>
                    <th>ACESSO</th>
                    <th>PERMISSÕES</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pessoas.map((pessoa) => (
                    <tr key={pessoa.id} className={editando?.id === pessoa.id ? "is-picked" : ""}>
                      <td>
                        <div className="person">
                          <span className="avatar">{initial(pessoa.nome)}</span>
                          <div>
                            {pessoa.nome}
                            <small>{pessoa.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`tag ${pessoa.administrador ? "bad" : "ok"}`}>
                          {pessoa.administrador ? "Administrador" : ACESSO.find((item) => item.id === pessoa.acesso)?.label}
                        </span>
                      </td>
                      <td className="muted">
                        {pessoa.administrador
                          ? "Tudo"
                          : [pessoa.visualizar ? "Visualização" : "", pessoa.assinarVistoria ? "Assina vistoria" : "", pessoa.assinarObra ? "Responsável da obra" : ""].filter(Boolean).join(" · ") || "Sem permissão"}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="open" onClick={() => abrir(pessoa)}>
                            Permissões
                          </button>
                          {podeExcluir(pessoa) && excluindo === pessoa.id ? (
                            <>
                              <button type="button" className="open" disabled={busy} onClick={() => onDelete(pessoa)}>
                                {busy ? "Excluindo..." : "Confirmar"}
                              </button>
                              <button type="button" className="open" disabled={busy} onClick={() => setExcluindo(null)}>
                                Cancelar
                              </button>
                            </>
                          ) : null}
                          {podeExcluir(pessoa) && excluindo !== pessoa.id ? (
                            <button type="button" className="open" onClick={() => setExcluindo(pessoa.id)}>
                              Excluir
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
