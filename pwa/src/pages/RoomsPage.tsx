import { escopoDa, modelos } from "@shared/checklist";
import { disciplinaStats } from "@shared/stats";
import { unitTitle } from "@shared/labels";
import { useStore } from "@shared/store";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useParams } from "react-router-dom";

export function RoomsPage() {
  const { id = "" } = useParams();
  const store = useStore();
  const inspection = store.inspections.find((item) => item.id === id);
  if (!inspection) {
    return (
      <div className="px-4 pt-8">
        <p>Vistoria não encontrada.</p>
        <Link to="/" className="btn-primary mt-4">Voltar</Link>
      </div>
    );
  }
  return (
    <div className="space-y-4 px-4 pt-5">
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-stone-500">
        <ChevronLeft className="h-4 w-4" />
        Sair
      </Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{inspection.escopo === "escada" ? "Escada e hall" : "Unidade"}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{unitTitle(inspection)}</h1>
      </header>
      {(escopoDa(inspection.escopo) ? modelos.filter((modelo) => modelo.id === inspection.escopo) : modelos).map((modelo) => (
        <section key={modelo.id} className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{modelo.nome}</p>
          {modelo.disciplinas.map((disciplina) => {
            const stats = disciplinaStats(store, inspection.id, disciplina.id);
            return (
              <Link key={disciplina.id} to={`/vistoria/${inspection.id}/${disciplina.id}/itens`} className="card flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{disciplina.nome}</p>
                  <p className="mt-1 text-sm text-stone-500">{stats.marked}/{stats.total}{stats.nc ? ` · ${stats.nc} NC` : ""}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-stone-300" />
              </Link>
            );
          })}
        </section>
      ))}
    </div>
  );
}
