import data from "./checklist.json";
import anteriores from "./itens-anteriores.json";
import type { ChecklistItem, Escopo, ModeloVistoria } from "./types";

export const modelos = data as ModeloVistoria[];

export type ItemCampo = ChecklistItem & {
  disciplinaId: string;
  disciplinaNome: string;
  escopo: Escopo;
};

export type DisciplinaCampo = {
  id: string;
  nome: string;
  itens: ChecklistItem[];
  escopo: Escopo;
  modeloNome: string;
  comodos: { id: string; nome: string }[];
};

export function modeloDe(escopo?: Escopo) {
  return modelos.find((modelo) => modelo.id === (escopo || "unidade")) ?? modelos[0];
}

export function escopoDa(valor?: string): Escopo | undefined {
  return valor === "unidade" || valor === "escada" ? valor : undefined;
}

export function disciplinasDaVistoria(escopo?: Escopo): DisciplinaCampo[] {
  const lista = escopo ? modelos.filter((modelo) => modelo.id === escopo) : modelos;
  return lista.flatMap((modelo) =>
    modelo.disciplinas.map((disciplina) => ({
      ...disciplina,
      escopo: modelo.id,
      modeloNome: modelo.nome,
      comodos: modelo.comodos,
    })),
  );
}

export function disciplinaPorId(id: string) {
  return disciplinasDaVistoria().find((disciplina) => disciplina.id === id);
}

export function itensDo(escopo?: Escopo): ItemCampo[] {
  const lista = escopo ? modelos.filter((modelo) => modelo.id === escopo) : modelos;
  return lista.flatMap((modelo) =>
    modelo.disciplinas.flatMap((disciplina) =>
      disciplina.itens.map((item) => ({
        ...item,
        disciplinaId: disciplina.id,
        disciplinaNome: disciplina.nome,
        escopo: modelo.id,
      })),
    ),
  );
}

const itensAnteriores = anteriores as { codigo: string; texto: string; criterio: string; disciplina: string }[];

export function descricaoDoItem(codigo: string) {
  const atual = itemByCode(codigo);
  if (atual) return { texto: atual.texto, criterio: atual.criterio, disciplina: atual.disciplinaNome };
  const antigo = itensAnteriores.find((item) => item.codigo === codigo);
  if (antigo) return { texto: antigo.texto, criterio: antigo.criterio, disciplina: antigo.disciplina };
  return { texto: "", criterio: "", disciplina: "" };
}

export function nomeDoComodo(id: string, escopo?: string) {
  const texto = (id || "").trim().toLocaleLowerCase("pt-BR");
  if (!texto) return "";
  const lista = escopo ? modelos.filter((modelo) => modelo.id === escopo) : modelos;
  for (const modelo of lista) {
    const sala = modelo.comodos.find(
      (comodo) => comodo.id === texto || comodo.nome.toLocaleLowerCase("pt-BR") === texto,
    );
    if (sala) return sala.nome;
  }
  return id.trim();
}

export function itemByCode(codigo: string) {
  for (const modelo of modelos) {
    for (const disciplina of modelo.disciplinas) {
      const item = disciplina.itens.find((linha) => linha.codigo === codigo);
      if (item) {
        return {
          ...item,
          disciplinaId: disciplina.id,
          disciplinaNome: disciplina.nome,
          escopo: modelo.id,
        } satisfies ItemCampo;
      }
    }
  }
  return undefined;
}

export function celulaBloqueada(item: ChecklistItem, comodo: string) {
  return item.bloqueados.includes(comodo);
}
