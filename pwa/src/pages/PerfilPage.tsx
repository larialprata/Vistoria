import { trocarSenha } from "@shared/accounts";
import { currentAccount, leaveSession } from "@shared/session";
import { BotaoTema } from "@shared/theme";
import { FormEvent, useState } from "react";
import { MarcaNome } from "../components/Marca";
import { limparObra } from "../obra";
import "../phone.css";

export function PerfilPage() {
  const conta = currentAccount();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");
    setMensagem("");
    try {
      await trocarSenha(senhaAtual, senhaNova);
      setSenhaAtual("");
      setSenhaNova("");
      setMensagem("Senha alterada.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível trocar a senha.");
    }
  }

  return (
    <div>
      <header className="phone-bar">
        <MarcaNome>
          <strong>DIMENSIONAL</strong>
          <small>Perfil</small>
        </MarcaNome>
        <div className="phone-tools">
          <BotaoTema />
        </div>
      </header>
      <div className="phone-body">
        <h1 className="hello">{conta?.nome}</h1>
        <p className="sync">{conta?.email}</p>
        <form className="phone-body" onSubmit={onSubmit} style={{ padding: 0 }}>
          <label>
            Senha atual
            <input className="search" type="password" autoComplete="current-password" value={senhaAtual} onChange={(event) => setSenhaAtual(event.target.value)} required />
          </label>
          <label>
            Nova senha
            <input className="search" type="password" autoComplete="new-password" value={senhaNova} onChange={(event) => setSenhaNova(event.target.value)} required />
          </label>
          {mensagem ? <p className="sync">{mensagem}</p> : null}
          {erro ? <p className="pending-photo">{erro}</p> : null}
          <button className="nova" type="submit">
            Trocar senha
          </button>
        </form>
        <button
          type="button"
          className="sign-out-block"
          onClick={() => {
            limparObra();
            leaveSession();
            window.location.assign(import.meta.env.BASE_URL || "/");
          }}
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
}
