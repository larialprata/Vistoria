import { contaComToken, enderecoDoOutlook, entrar } from "@shared/accounts";
import { enterSession, leaveSession } from "@shared/session";
import { BotaoTema } from "@shared/theme";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../vision.css";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const aviso = new URLSearchParams(window.location.search).get("erro");
    const token = new URLSearchParams(window.location.hash.slice(1)).get("entrada");
    if (aviso) setErro(aviso);
    if (!token) return;
    window.history.replaceState(null, "", window.location.pathname);
    contaComToken(token).then((conta) => {
      if (!conta) {
        setErro("Não foi possível concluir a entrada pelo Outlook.");
        return;
      }
      enterSession(conta);
      navigate("/", { replace: true });
    });
  }, [navigate]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");
    setBusy(true);
    try {
      const conta = await entrar(email, senha, "web");
      enterSession(conta);
      navigate("/", { replace: true });
    } catch (error) {
      leaveSession();
      setErro(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <BotaoTema className="theme-toggle login-theme" />
      <form onSubmit={onSubmit} className="login-card">
        <p className="login-kicker">Dimensional</p>
        <h1>Entrar no painel</h1>
        <p>Entre com o Outlook da empresa. O e-mail precisa estar liberado por um administrador.</p>
        <button className="btn-primary mt-6 w-full" type="button" onClick={() => window.location.assign(enderecoDoOutlook("web"))}>
          Entrar com Outlook
        </button>
        <label>
          E-mail
          <input className="field" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Senha
          <input className="field" type="password" autoComplete="current-password" value={senha} onChange={(event) => setSenha(event.target.value)} required />
        </label>
        {erro ? <p className="login-erro">{erro}</p> : null}
        <button className="btn-primary mt-6 w-full" type="submit" disabled={busy}>
          {busy ? "Aguarde..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
