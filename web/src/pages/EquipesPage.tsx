import { cadastrarPessoa, listarPessoas } from "@shared/accounts";
import { currentAccount, type Acesso } from "@shared/session";
import { FormEvent, useEffect, useState } from "react";

type Pessoa = { id: string; nome: string; email: string; acesso: Acesso; administrador?: boolean };

const ACESSO: { id: Acesso; label: string }[] = [
  { id: "web", label: "Só o painel" },
  { id: "app", label: "Só o aplicativo" },
  { id: "ambos", label: "Painel e aplicativo" },
];

function initial(nome: string) {
  return (nome.trim()[0] || "?").toUpperCase();
}

export function EquipesPage() {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [acesso, setAcesso] = useState<Acesso>("app");
  const [administrador, setAdministrador] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const podeCadastrar = Boolean(currentAccount()?.administrador);

  async function load() {
    setPessoas(await listarPessoas());
  }

  useEffect(() => {
    if (!podeCadastrar) return;
    load().catch(() => setPessoas([]));
  }, [podeCadastrar]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");
    setOk("");
    setBusy(true);
    try {
      await cadastrarPessoa({ nome, email, senha, acesso, administrador });
      setNome("");
      setEmail("");
      setSenha("");
      setAcesso("app");
      setAdministrador(false);
      setOk("Pessoa cadastrada.");
      await load();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível cadastrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="canvas">
      <h1>Equipes e usuários</h1>
      <p className="lead">
        {podeCadastrar
          ? "O administrador cadastra quem entra no painel, no aplicativo ou nos dois."
          : "Só um administrador pode cadastrar pessoas."}
      </p>
      {podeCadastrar ? (
        <div className="people">
          <form className="sheet" onSubmit={onSubmit}>
            <header>
              <h2>Nova pessoa</h2>
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
              <input className="field" type="password" autoComplete="new-password" value={senha} onChange={(event) => setSenha(event.target.value)} required />
            </label>
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
              Também é administrador
            </label>
            {erro ? <p className="note bad">{erro}</p> : null}
            {ok ? <p className="note ok">{ok}</p> : null}
            <div className="actions">
              <button className="btn-primary" type="submit" disabled={busy}>
                {busy ? "Cadastrando..." : "Cadastrar"}
              </button>
            </div>
          </form>
          <section className="sheet">
            <header>
              <h2>Pessoas cadastradas</h2>
              <span className="open">{pessoas.length}</span>
            </header>
            {pessoas.length === 0 ? <p className="empty">Nenhuma pessoa cadastrada ainda.</p> : null}
            {pessoas.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>PESSOA</th>
                    <th>ACESSO</th>
                    <th>PAPEL</th>
                  </tr>
                </thead>
                <tbody>
                  {pessoas.map((pessoa) => (
                    <tr key={pessoa.id}>
                      <td>
                        <div className="person">
                          <span className="avatar">{initial(pessoa.nome)}</span>
                          <div>
                            {pessoa.nome}
                            <small>{pessoa.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>{ACESSO.find((item) => item.id === pessoa.acesso)?.label}</td>
                      <td>
                        <span className={`tag ${pessoa.administrador ? "bad" : "ok"}`}>
                          {pessoa.administrador ? "Administrador" : "Usuário"}
                        </span>
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
