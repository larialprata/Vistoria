import { nomeDoEmpreendimento } from "@shared/catalog";
import { quandoAssinou, statusLabel, unitTitle } from "@shared/labels";
import { rotuloRevisao, situacaoDa } from "@shared/revisao";
import { podeAssinarObra, podeAssinarVistoria, useAccount, veSomenteObra } from "@shared/session";
import { BotaoTema } from "@shared/theme";
import { inspectionStats } from "@shared/stats";
import { sincronizarVistorias } from "@shared/sync";
import { useStore } from "@shared/store";
import type { Inspection } from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MarcaNome } from "../components/Marca";
import { mesmaObra, useObra } from "../obra";
import "../phone.css";

function dataCurta(valor: string) {
  const dia = (valor || "").slice(0, 10);
  const [ano, mes, d] = dia.split("-");
  if (ano && mes && d && ano.length === 4) return `${d}/${mes}/${ano}`;
  return valor || "";
}

function horaCurta(valor: string) {
  const hora = (valor || "").slice(0, 5);
  return /^\d{2}:\d{2}$/.test(hora) ? hora : "";
}

type Lista = "ativas" | "concluidas" | "pendencias";

const TITULO_LISTA: Record<Lista, string> = {
  ativas: "Ativas",
  concluidas: "Concluídas",
  pendencias: "Pendências",
};

function listaPedida(valor: string | null): Lista | "" {
  if (valor === "ativas" || valor === "concluidas" || valor === "pendencias") return valor;
  return "";
}

function entraNaLista(store: ReturnType<typeof useStore>, item: Inspection, lista: Lista) {
  if (lista === "ativas") return item.status === "em_andamento";
  if (lista === "concluidas") return item.status === "concluida";
  return inspectionStats(store, item.id).nc > 0;
}

export function VistoriasPage() {
  const store = useStore();
  const conta = useAccount();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [bloco, setBloco] = useState("todos");
  const [params, setParams] = useSearchParams();
  const lista = listaPedida(params.get("lista"));
  const obra = useObra();
  const podeDecidir = podeAssinarVistoria(conta) || podeAssinarObra(conta);
  const soObra = veSomenteObra(conta);
  const daObra = store.inspections.filter((item) => mesmaObra(item.empreendimento, obra) && (!soObra || situacaoDa(item) === "obra"));
  const blocos = [...new Set(daObra.map((item) => item.bloco).filter(Boolean))];

  useEffect(() => {
    if (podeDecidir) void sincronizarVistorias();
  }, [podeDecidir]);

  const { rows, assinadas, daLista } = useMemo(() => {
    const filtradas = daObra.filter((item) => {
      const text = `${unitTitle(item)} ${item.empreendimento} ${item.vistoriador} ${item.assinante || ""}`.toLocaleLowerCase("pt-BR");
      const matchesQuery = text.includes(query.trim().toLocaleLowerCase("pt-BR"));
      const matchesBloco = bloco === "todos" || item.bloco === bloco;
      const matchesLista = !lista || entraNaLista(store, item, lista);
      return matchesQuery && matchesBloco && matchesLista;
    });
    const assinadasDaObra = filtradas
      .filter((item) => item.assinatura)
      .sort((a, b) => (b.assinadoEm || b.updatedAt).localeCompare(a.assinadoEm || a.updatedAt));
    const abertas = filtradas
      .filter((item) => {
        if (item.assinatura) return false;
        const aguardando = item.parecer !== "aprovada";
        return !podeDecidir || aguardando;
      })
      .sort((a, b) => Number(b.status === "em_andamento") - Number(a.status === "em_andamento") || b.updatedAt.localeCompare(a.updatedAt));
    const daLista = [...filtradas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { rows: abertas, assinadas: assinadasDaObra, daLista };
  }, [daObra, query, bloco, lista, store, podeDecidir]);

  function abrir(item: Inspection) {
    if (podeDecidir) {
      navigate(`/vistorias/${item.id}`);
      return;
    }
    navigate("/registrar", { state: { inspectionId: item.id } });
  }

  return (
    <div>
      <header className="phone-bar">
        <MarcaNome>
          <strong>DIMENSIONAL</strong>
          <small>Vistorias / Locais</small>
        </MarcaNome>
        <div className="phone-tools">
          <BotaoTema />
        </div>
      </header>
      <div className="phone-body">
        <div className="phone-head">
          <h2>{lista ? TITULO_LISTA[lista] : soObra ? "Na obra" : podeDecidir ? "Vistorias em andamento" : "Locais e vistorias"}</h2>
          {lista ? (
            <button type="button" onClick={() => setParams({})}>
              Ver todas
            </button>
          ) : null}
        </div>
        <p className="sync">{obra}</p>
        <input
          className="search"
          placeholder="Buscar por bloco ou apto"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="chips">
          <button type="button" className={bloco === "todos" ? "is-on" : ""} onClick={() => setBloco("todos")}>
            Todos
          </button>
          {blocos.map((item) => (
            <button key={item} type="button" className={bloco === item ? "is-on" : ""} onClick={() => setBloco(item)}>
              Bloco {item}
            </button>
          ))}
        </div>
        {lista ? (
          <>
            {daLista.map((item) => (
              <CartaoVistoria key={item.id} item={item} onOpen={abrir} assinada={Boolean(item.assinatura)} />
            ))}
            {daLista.length === 0 ? <p className="sync">Nenhuma vistoria nesta lista.</p> : null}
          </>
        ) : soObra ? (
          <>
            {daLista.map((item) => (
              <CartaoVistoria key={item.id} item={item} onOpen={abrir} assinada={Boolean(item.assinatura)} />
            ))}
            {daLista.length === 0 ? <p className="sync">Nenhuma vistoria com status Obra.</p> : null}
          </>
        ) : (
          <>
            {rows.map((item) => (
              <CartaoVistoria key={item.id} item={item} onOpen={abrir} />
            ))}
            {rows.length === 0 ? <p className="sync">{podeDecidir ? "Nenhuma vistoria em andamento." : "Nenhuma vistoria com esse filtro."}</p> : null}
            <div className="phone-head seguinte">
              <h2>Assinadas</h2>
            </div>
            {assinadas.map((item) => (
              <CartaoVistoria key={item.id} item={item} onOpen={abrir} assinada />
            ))}
            {assinadas.length === 0 ? <p className="sync">Nenhuma vistoria assinada nesta obra.</p> : null}
          </>
        )}
        {soObra ? null : (
          <Link to="/registrar" className="nova">
            Nova vistoria
          </Link>
        )}
      </div>
    </div>
  );
}

function CartaoVistoria({
  item,
  assinada = false,
  onOpen,
}: {
  item: Inspection;
  assinada?: boolean;
  onOpen: (item: Inspection) => void;
}) {
  const store = useStore();
  const stats = inspectionStats(store, item.id);
  const tone = item.parecer === "reprovada" ? "bad" : item.parecer === "aprovada" || item.status === "concluida" ? "ok" : stats.nc ? "warn" : "bad";
  const revisao = rotuloRevisao(item.revisao);
  const conclusao = horaCurta(item.horaFim);
  const quando = [item.vistoriador, dataCurta(item.data), conclusao ? `concluída às ${conclusao}` : ""].filter(Boolean).join(" · ");
  const momento = quandoAssinou(item.assinadoEm || item.updatedAt);
  return (
    <button type="button" className="filter-card" onClick={() => onOpen(item)}>
      <strong>
        {unitTitle(item)}
        {revisao ? ` · ${revisao}` : ""}
      </strong>
      <span>
        {nomeDoEmpreendimento(item.empreendimento)}
        {stats.nc ? ` · ${stats.nc} não conforme` : ""}
      </span>
      {assinada ? (
        <>
          <span>Assinado por {item.assinante || "—"}</span>
          {momento ? <span>{momento}</span> : null}
        </>
      ) : quando ? (
        <span>{quando}</span>
      ) : null}
      <em className={`pill ${tone}`}>{statusLabel(item.status, item.parecer, item.assinatura, item.situacao)}</em>
    </button>
  );
}
