import { contaComToken, enderecoDoOutlook, entrar } from "@shared/accounts";
import { enterSession, leaveSession } from "@shared/session";
import { BotaoTema } from "@shared/theme";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Marca } from "../components/Marca";
import "../phone.css";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [salvar, setSalvar] = useState(true);

  useEffect(() => {
    const aviso = new URLSearchParams(window.location.search).get("erro");
    const token = new URLSearchParams(window.location.hash.slice(1)).get("entrada");
    if (aviso) setErro(aviso);
    if (!token) return;
    const manter = sessionStorage.getItem("dime.outlook.salvar") !== "0";
    window.history.replaceState(null, "", window.location.pathname);
    contaComToken(token).then((conta) => {
      if (!conta) {
        setErro("Não foi possível concluir a entrada pelo Outlook.");
        return;
      }
      enterSession(conta, manter);
      navigate("/", { replace: true });
    });
  }, [navigate]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");
    setBusy(true);
    try {
      const conta = await entrar(email, senha, "app");
      enterSession(conta, salvar);
      navigate("/", { replace: true });
    } catch (error) {
      leaveSession();
      setErro(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell shell-login">
      <div className="login-topo">
        <BotaoTema />
      </div>
      <form className="phone-body login-form" onSubmit={onSubmit}>
        <div className="login-marca">
          <Marca destaque />
          <strong>DIMENSIONAL</strong>
          <span>Vistoria</span>
        </div>
        <h1 className="hello">Entrar</h1>
        <p className="login-note">Entre com o Outlook da empresa.</p>
        <label className="login-keep">
          <input type="checkbox" checked={salvar} onChange={(event) => setSalvar(event.target.checked)} />
          Salvar login neste celular
        </label>
        <button
          className="login-go"
          type="button"
          onClick={() => {
            sessionStorage.setItem("dime.outlook.salvar", salvar ? "1" : "0");
            window.location.assign(enderecoDoOutlook("app"));
          }}
        >
          Entrar com Outlook
        </button>
        <label>
          E-mail
          <input className="search" type="email" autoComplete="username" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Senha
          <input className="search" type="password" autoComplete="current-password" value={senha} onChange={(event) => setSenha(event.target.value)} required />
        </label>
        {erro ? <p className="login-erro">{erro}</p> : null}
        <button className="login-go" type="submit" disabled={busy}>
          {busy ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
