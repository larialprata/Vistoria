import { forcarSubidaDasFotos } from "./fotos-subida";
import { apiBase, fotosDaResposta } from "./photos";
import { currentAccount } from "./session";
import { absorbDecisions, dropInspections, getStore, substituirPelaRemota, watchInspections } from "./store";

const DEMO = new Set(["insp-203", "insp-204", "insp-casa-15"]);

const fila = new Map<string, ReturnType<typeof setTimeout>>();
const geracao = new Map<string, number>();
let sequencia = 0;

export async function publishInspection(id: string, marca?: number) {
  if (DEMO.has(id)) return;
  const base = apiBase();
  const token = currentAccount()?.token;
  const inspection = getStore().inspections.find((item) => item.id === id);
  if (!base || !token || !inspection) return;
  const enviadoEm = inspection.updatedAt;
  const answers = getStore()
    .answers.filter((answer) => answer.inspectionId === id)
    .map((answer) => ({
      codigo: answer.codigo,
      comodo: answer.comodo,
      mark: answer.mark,
      observacao: answer.observacao,
      gravidade: answer.gravidade,
      sharepointPath: answer.sharepointPath,
      fotos: fotosDaResposta(answer)
        .filter((foto) => foto.sharepointPath)
        .map((foto) => ({ sharepointPath: foto.sharepointPath, observacao: foto.observacao || "" })),
    }));
  const response = await fetch(`${base}/vistorias`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...inspection, answers }),
  });
  if (response.status === 409) {
    dropInspections([id]);
    return;
  }
  if (!response.ok) return;
  const salvo = (await response.json().catch(() => null)) as VistoriaEnviada | null;
  if (marca != null && geracao.get(id) !== marca) return;
  const atual = getStore().inspections.find((item) => item.id === id);
  if (atual && atual.updatedAt !== enviadoEm) return;
  if (salvo?.id) substituirPelaRemota(salvo);
}

export async function publishStoredInspections() {
  const ids = getStore().inspections.map((item) => item.id).filter((id) => !DEMO.has(id));
  for (const id of ids) {
    try {
      await publishInspection(id);
    } catch {
      /* A próxima abertura tenta de novo. */
    }
  }
}

export async function sincronizarVistorias() {
  dropInspections(await listarVistoriasExcluidas());
  const rows = await listarVistoriasEnviadas();
  absorbDecisions(rows, Boolean(currentAccount()?.administrador));
  await publishStoredInspections();
  try {
    await forcarSubidaDasFotos();
  } catch {
    /* A próxima abertura tenta de novo. */
  }
}

function agendarPublicacao(id: string) {
  const marca = ++sequencia;
  geracao.set(id, marca);
  const anterior = fila.get(id);
  if (anterior) clearTimeout(anterior);
  fila.set(
    id,
    setTimeout(() => {
      fila.delete(id);
      if (geracao.get(id) !== marca) return;
      publishInspection(id, marca).catch(() => {});
    }, 700),
  );
}

watchInspections((id) => {
  agendarPublicacao(id);
});

export type VistoriaEnviada = {
  id: string;
  empreendimento: string;
  bloco: string;
  unidade: string;
  status: string;
  vistoriador: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  clima: string;
  revisao: string;
  escopo?: string;
  pavimento?: string;
  updatedAt: string;
  parecer?: string;
  parecerEm?: string;
  situacao?: string;
  responsavelObra?: string;
  assinatura?: string;
  assinante?: string;
  assinaturaObra?: string;
  assinanteObra?: string;
  obraEm?: string;
  answers: { codigo: string; comodo?: string; mark: string; observacao: string; gravidade: string; sharepointPath: string; fotos?: (string | { sharepointPath?: string; observacao?: string })[] }[];
};

export async function listarVistoriasExcluidas(): Promise<string[]> {
  const base = apiBase();
  const token = currentAccount()?.token;
  if (!base || !token) return [];
  const response = await fetch(`${base}/vistorias/excluidas`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return [];
  const json = (await response.json()) as string[];
  return Array.isArray(json) ? json.filter((id) => typeof id === "string") : [];
}

export async function listarVistoriasEnviadas(): Promise<VistoriaEnviada[]> {
  const base = apiBase();
  const token = currentAccount()?.token;
  if (!base || !token) return [];
  const response = await fetch(`${base}/vistorias`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return [];
  const json = (await response.json()) as VistoriaEnviada[];
  return Array.isArray(json) ? json : [];
}
