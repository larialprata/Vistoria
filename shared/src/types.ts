export type Mark = "C" | "NC" | "NA";
export type Severity = "L" | "M" | "C";
export type Tipologia = "apartamento" | "casa" | "sobrado";
export type Clima = "sol" | "nublado" | "chuva";
export type InspectionStatus = "em_andamento" | "concluida";
export type Parecer = "" | "aprovada" | "reprovada";

export type Escopo = "unidade" | "escada";

export type ChecklistItem = {
  codigo: string;
  texto: string;
  criterio: string;
  bloqueados: string[];
};

export type Disciplina = {
  id: string;
  nome: string;
  itens: ChecklistItem[];
};

export type ModeloVistoria = {
  id: Escopo;
  nome: string;
  comodos: { id: string; nome: string }[];
  disciplinas: Disciplina[];
};

export type Inspection = {
  id: string;
  empreendimento: string;
  endereco: string;
  bloco: string;
  unidade: string;
  tipologia: Tipologia;
  quartos: "2" | "3";
  escopo?: Escopo;
  pavimento?: string;
  proprietario?: string;
  construtora?: string;
  numeroVistoria?: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  clima: Clima | "";
  tipoVistoria?: "sim" | "nao";
  vistoriador: string;
  cargo: string;
  responsavelTecnico: string;
  registroTecnico: string;
  revisao: string;
  leituraAgua: string;
  leituraEnergia: string;
  status: InspectionStatus;
  parecer?: Parecer;
  /** vistoria em andamento, obra depois da reprovação, liberado para a revisão seguinte, aprovado sem nova revisão. */
  situacao?: "vistoria" | "obra" | "liberado" | "aprovado";
  responsavelObra?: string;
  assinatura?: string;
  assinante?: string;
  assinadoEm?: string;
  updatedAt: string;
};

export type FotoSalva = {
  sharepointPath: string;
  /** Só neste navegador. Não entra no banco. */
  previewUrl: string;
  observacao: string;
};

/** Uma linha do checklist. O caminho da foto é o que o SharePoint vai receber. */
export type Answer = {
  inspectionId: string;
  codigo: string;
  comodo: string;
  mark: Mark | "";
  observacao: string;
  gravidade: Severity | "";
  sharepointPath: string;
  /** Só neste navegador. Não entra no banco. */
  previewUrl: string;
  fotos?: FotoSalva[];
};

export type BlockApproval = {
  inspectionId: string;
  blockId: string;
  aprovado: boolean;
};

export type Store = {
  inspections: Inspection[];
  answers: Answer[];
  approvals: BlockApproval[];
};
