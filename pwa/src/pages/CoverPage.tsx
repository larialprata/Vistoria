import { currentUser } from "@shared/session";
import { upsertInspection } from "@shared/store";
import type { Clima, Tipologia } from "@shared/types";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

const CLIMAS: { id: Clima; label: string }[] = [
  { id: "sol", label: "Sol" },
  { id: "nublado", label: "Nublado" },
  { id: "chuva", label: "Chuva" },
];

export function CoverPage() {
  const navigate = useNavigate();
  const [empreendimento, setEmpreendimento] = useState("238 e 239");
  const [endereco, setEndereco] = useState("");
  const [bloco, setBloco] = useState("1");
  const [unidade, setUnidade] = useState("");
  const [tipologia, setTipologia] = useState<Tipologia>("apartamento");
  const [quartos, setQuartos] = useState<"2" | "3">("2");
  const [data, setData] = useState("2026-09-30");
  const [horaInicio, setHoraInicio] = useState("");
  const [clima, setClima] = useState<Clima | "">("sol");
  const [leituraAgua, setLeituraAgua] = useState("");
  const [leituraEnergia, setLeituraEnergia] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const id = crypto.randomUUID();
    upsertInspection({
      id,
      empreendimento: empreendimento.trim(),
      endereco: endereco.trim(),
      bloco: bloco.trim(),
      unidade: unidade.trim(),
      tipologia,
      quartos,
      data,
      horaInicio,
      horaFim: "",
      clima,
      vistoriador: currentUser() || "Equipe de campo",
      cargo: "Vistoriador",
      responsavelTecnico: "",
      registroTecnico: "",
      revisao: "00",
      leituraAgua: leituraAgua.trim(),
      leituraEnergia: leituraEnergia.trim(),
      status: "em_andamento",
      updatedAt: new Date().toISOString(),
    });
    navigate(`/vistoria/${id}`, { replace: true });
  }

  const canSave = empreendimento.trim() && unidade.trim() && data;

  return (
    <form onSubmit={onSubmit} className="space-y-4 px-4 pt-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Capa</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Nova vistoria</h1>
      </header>

      <label className="block text-sm font-medium">
        Empreendimento
        <input className="field mt-1.5" value={empreendimento} onChange={(event) => setEmpreendimento(event.target.value)} />
      </label>
      <label className="block text-sm font-medium">
        Endereço
        <input className="field mt-1.5" value={endereco} onChange={(event) => setEndereco(event.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">
          Bloco
          <input className="field mt-1.5" value={bloco} onChange={(event) => setBloco(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Unidade
          <input
            className="field mt-1.5"
            inputMode="numeric"
            placeholder="203"
            value={unidade}
            onChange={(event) => setUnidade(event.target.value)}
            required
          />
        </label>
      </div>

      <div>
        <p className="text-sm font-medium">Tipologia</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {(
            [
              ["apartamento", "Apto"],
              ["casa", "Casa"],
              ["sobrado", "Sobrado"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTipologia(id)}
              className={`rounded-2xl border px-2 py-3 text-sm font-semibold ${
                tipologia === id ? "border-accent bg-accent text-white" : "border-stone-200 bg-white text-stone-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium">Quartos</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {(["2", "3"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setQuartos(value)}
              className={`rounded-2xl border px-2 py-3 text-sm font-semibold ${
                quartos === value ? "border-accent bg-accent text-white" : "border-stone-200 bg-white text-stone-600"
              }`}
            >
              {value} quartos
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">
          Data
          <input className="field mt-1.5" type="date" value={data} onChange={(event) => setData(event.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Início
          <input className="field mt-1.5" type="time" value={horaInicio} onChange={(event) => setHoraInicio(event.target.value)} />
        </label>
      </div>

      <div>
        <p className="text-sm font-medium">Clima</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {CLIMAS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setClima(item.id)}
              className={`rounded-2xl border px-2 py-3 text-sm font-semibold ${
                clima === item.id ? "border-accent bg-accent text-white" : "border-stone-200 bg-white text-stone-600"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">
          Água (m³)
          <input className="field mt-1.5" inputMode="decimal" value={leituraAgua} onChange={(event) => setLeituraAgua(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Energia / gás
          <input
            className="field mt-1.5"
            inputMode="decimal"
            value={leituraEnergia}
            onChange={(event) => setLeituraEnergia(event.target.value)}
          />
        </label>
      </div>

      <button className="btn-primary w-full" type="submit" disabled={!canSave}>
        Começar checklist
      </button>
    </form>
  );
}
