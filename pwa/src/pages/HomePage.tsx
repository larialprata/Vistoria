import { quandoDaVistoria, statusLabel, unitTitle } from "@shared/labels";
import { currentUser, leaveSession, useAccount, veSomenteObra } from "@shared/session";
import { situacaoDa } from "@shared/revisao";
import { BotaoTema } from "@shared/theme";
import { inspectionStats } from "@shared/stats";
import { useStore } from "@shared/store";
import { Link, useNavigate } from "react-router-dom";
import { MarcaNome } from "../components/Marca";
import { limparObra, mesmaObra, useObra } from "../obra";
import "../phone.css";

export function HomePage() {
  const store = useStore();
  const navigate = useNavigate();
  const name = currentUser() || "Equipe de campo";
  const soObra = veSomenteObra(useAccount());
  const obra = useObra();
  const daObra = store.inspections.filter((item) => mesmaObra(item.empreendimento, obra) && (!soObra || situacaoDa(item) === "obra"));
  const recent = [...daObra].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  const ativas = daObra.filter((item) => item.status === "em_andamento").length;
  const concluidas = daObra.filter((item) => item.status === "concluida").length;
  const pendencias = daObra.filter((item) => inspectionStats(store, item.id).nc > 0).length;

  return (
    <div>
      <header className="phone-bar">
        <MarcaNome>
          <strong>DIMENSIONAL</strong>
          <button type="button" className="trocar-obra" onClick={() => limparObra()}>
            {obra}
            <span>Trocar</span>
          </button>
        </MarcaNome>
        <div className="phone-tools">
          <BotaoTema />
          <button
            type="button"
            className="sign-out"
            onClick={() => {
              limparObra();
              leaveSession();
              window.location.assign(import.meta.env.BASE_URL || "/");
            }}
          >
            Sair
          </button>
        </div>
      </header>
      <div className="phone-body">
        <h1 className="hello">Olá, {name}</h1>
        <p className="sync">Neste aparelho</p>
        {soObra ? null : (
          <Link to="/registrar" className="start">
            <strong>Iniciar nova vistoria</strong>
            <small>Selecione o local e o apartamento</small>
          </Link>
        )}
        <div className="stat-row">
          {(
            [
              ["ativas", ativas, "Ativas"],
              ["concluidas", concluidas, "Concluídas"],
              ["pendencias", pendencias, "Pendências"],
            ] as const
          ).map(([lista, total, nome]) => (
            <button key={lista} type="button" onClick={() => navigate(`/vistorias?lista=${lista}`)} aria-label={`${nome}: ${total}`}>
              <strong>{total}</strong>
              <span>{nome}</span>
            </button>
          ))}
        </div>
        <div className="phone-head">
          <h2>Vistorias recentes</h2>
          <Link to="/vistorias">Ver todas</Link>
        </div>
        {recent.map((item) => {
          const row = inspectionStats(store, item.id);
          const tone = item.parecer === "reprovada" ? "bad" : item.parecer === "aprovada" || item.status === "concluida" ? "ok" : row.critical ? "bad" : "warn";
          return (
            <button
              key={item.id}
              type="button"
              className="visit-card"
              onClick={() => (soObra ? navigate(`/vistorias/${item.id}`) : navigate("/registrar", { state: { inspectionId: item.id } }))}
            >
              <strong>{unitTitle(item)}</strong>
              <span>{quandoDaVistoria(item.data, item.horaInicio, item.horaFim) || "Sem data"}</span>
              <span>
                {row.marked} de {row.total} itens marcados
                {row.critical ? ` · ${row.critical} crítico` : ""}
              </span>
              <em className={`pill ${tone}`}>{statusLabel(item.status, item.parecer, item.assinatura, item.situacao)}</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}
