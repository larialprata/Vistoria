import { builtInPlaces, nomeDoEmpreendimento } from "./catalog";
import { adaptarRespostas } from "./legado";
import { nomePavimento } from "./labels";
import { detalheDaSituacao, situacaoDa } from "./revisao";
import { veSomenteObra, type Conta } from "./session";
import { listarVistoriasEnviadas, listarVistoriasExcluidas } from "./sync";
import { supabase } from "./supabase";

export type Condominio = { id: string; nome: string };
export type Bloco = { id: string; condominio_id: string; numero: string };
export type Unidade = { id: string; bloco_id: string; numero: string; tipologia: string };
export type VistoriaRemota = {
  id: string;
  unidade_id: string;
  status: string;
  vistoriador: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  clima: string;
  revisao: string;
  leitura_agua: string;
  leitura_energia: string;
  cargo: string;
  responsavel_tecnico: string;
  registro_tecnico: string;
  created_at: string;
  updated_at: string;
  cliente_id?: string;
  empreendimento?: string;
  bloco?: string;
  apartamento?: string;
  parecer?: string;
  parecerEm?: string;
  situacao?: string;
  responsavelObra?: string;
  assinatura?: string;
  assinante?: string;
  assinaturaObra?: string;
  assinanteObra?: string;
  obraEm?: string;
  escopo?: string;
  pavimento?: string;
};
export type RespostaRemota = {
  id: string;
  vistoria_id: string;
  codigo: string;
  comodo?: string;
  marca: string;
  observacao: string;
  gravidade: string;
  sharepoint_path: string;
  fotos?: string[];
  anotacoes?: string[];
};
export type ItemRemoto = { id: string; codigo: string; texto: string; grupo: string; ordem: number };

export type PainelData = {
  condominios: Condominio[];
  blocos: Bloco[];
  unidades: Unidade[];
  vistorias: VistoriaRemota[];
  respostas: RespostaRemota[];
  itens: ItemRemoto[];
  error: string | null;
};

function text(value: unknown) {
  return value == null ? "" : String(value);
}

function detalhesDaFoto(principal: string, fotos?: (string | { sharepointPath?: string; observacao?: string })[]) {
  const pares: { path: string; observacao: string }[] = [];
  for (const item of fotos || []) {
    const path = text(typeof item === "string" ? item : item?.sharepointPath);
    if (!path || pares.some((foto) => foto.path === path)) continue;
    pares.push({ path, observacao: typeof item === "string" ? "" : text(item?.observacao) });
  }
  if (principal && !pares.some((foto) => foto.path === principal)) pares.unshift({ path: principal, observacao: "" });
  return pares;
}

function locaisConhecidos() {
  const condominios: Condominio[] = [];
  const blocos: Bloco[] = [];
  const unidades: Unidade[] = [];
  for (const place of builtInPlaces) {
    condominios.push({ id: place.id, nome: place.nome });
    const vistos = new Set<string>();
    for (const apto of place.apartments) {
      const blocoId = `${place.id}:${apto.bloco}`;
      if (!vistos.has(blocoId)) {
        vistos.add(blocoId);
        blocos.push({ id: blocoId, condominio_id: place.id, numero: apto.bloco });
      }
      unidades.push({ id: apto.key, bloco_id: blocoId, numero: apto.unidade, tipologia: "apartamento" });
    }
  }
  return { condominios, blocos, unidades };
}

export function painelDaConta(data: PainelData | null, conta: Conta | null): PainelData | null {
  if (!data || !veSomenteObra(conta)) return data;
  const vistorias = data.vistorias.filter((item) => situacaoDa(item) === "obra");
  const ids = new Set(vistorias.map((item) => item.id));
  const unidadeIds = new Set(vistorias.map((item) => item.unidade_id).filter(Boolean));
  const unidades = data.unidades.filter((item) => unidadeIds.has(item.id));
  const blocoIds = new Set(unidades.map((item) => item.bloco_id));
  const blocos = data.blocos.filter((item) => blocoIds.has(item.id));
  const condominioIds = new Set(blocos.map((item) => item.condominio_id));
  const nomes = new Set(vistorias.map((item) => nomeDoEmpreendimento(item.empreendimento || "")));
  return {
    ...data,
    condominios: data.condominios.filter((item) => condominioIds.has(item.id) || nomes.has(nomeDoEmpreendimento(item.nome))),
    blocos,
    unidades,
    vistorias,
    respostas: data.respostas.filter((item) => ids.has(item.vistoria_id)),
  };
}

export async function loadPainel(): Promise<PainelData> {
  const empty: PainelData = {
    condominios: [],
    blocos: [],
    unidades: [],
    vistorias: [],
    respostas: [],
    itens: [],
    error: null,
  };
  if (!supabase) return { ...empty, error: "O Supabase não está configurado neste painel." };

  const [condominios, blocos, unidades, vistorias, respostas, itens] = await Promise.all([
    supabase.from("condominios").select("id, nome").order("nome"),
    supabase.from("blocos").select("id, condominio_id, numero"),
    supabase.from("unidades").select("id, bloco_id, numero, tipologia"),
    supabase.from("vistorias").select("id, unidade_id, status, parecer, parecer_em, situacao, assinatura, assinante, responsavel_obra, assinatura_obra, assinante_obra, obra_em, vistoriador, data, hora_inicio, hora_fim, clima, revisao, leitura_agua, leitura_energia, cargo, responsavel_tecnico, registro_tecnico, created_at, updated_at, cliente_id").order("updated_at", { ascending: false }),
    supabase.from("vistoria_respostas").select("id, vistoria_id, codigo, marca, observacao, gravidade, sharepoint_path").limit(20000),
    supabase.from("checklist_itens").select("id, codigo, texto, grupo, ordem").order("ordem"),
  ]);

  const [enviadas, excluidas] = await Promise.all([listarVistoriasEnviadas(), listarVistoriasExcluidas()]);
  const ocultas = new Set(excluidas);
  const failed = [condominios, blocos, unidades, vistorias, respostas, itens].find((result) => result.error);
  if (failed?.error && enviadas.length === 0) return { ...empty, error: failed.error.message };

  const lidos = {
    condominios: (condominios.data ?? []).map((row) => ({ id: text(row.id), nome: nomeDoEmpreendimento(text(row.nome)) })),
    blocos: (blocos.data ?? []).map((row) => ({ id: text(row.id), condominio_id: text(row.condominio_id), numero: text(row.numero) })),
    unidades: (unidades.data ?? []).map((row) => ({
      id: text(row.id),
      bloco_id: text(row.bloco_id),
      numero: text(row.numero),
      tipologia: text(row.tipologia),
    })),
  };
  const locais = !failed?.error && lidos.condominios.length > 0 ? lidos : locaisConhecidos();

  function nomeDoCondominio(nome: string) {
    return nomeDoEmpreendimento(nome);
  }

  function mesmoNumero(atual: string, esperado: string) {
    const limpo = (valor: string) => valor.replace(/^0+(?=\d)/, "");
    return limpo(atual) === limpo(esperado);
  }

  function unidadeId(empreendimento: string, blocoNumero: string, apartamento: string) {
    const condominio = locais.condominios.find((item) => item.nome === nomeDoCondominio(empreendimento));
    const bloco = locais.blocos.find((item) => item.condominio_id === condominio?.id && mesmoNumero(item.numero, blocoNumero));
    return locais.unidades.find((item) => item.bloco_id === bloco?.id && mesmoNumero(item.numero, apartamento))?.id || "";
  }

  const remotoPorId = new Map<string, Record<string, unknown>>();
  for (const row of vistorias.data ?? []) {
    remotoPorId.set(text(row.cliente_id), row);
    remotoPorId.set(text(row.id), row);
  }

  function imagem(valor: string) {
    return valor.startsWith("data:image");
  }

  const doAplicativo = enviadas.filter((row) => !ocultas.has(text(row.id))).map((row) => {
    const remoto = remotoPorId.get(text(row.id));
    const parecer = text(row.parecer) || text(remoto?.parecer);
    const situacao = text(row.situacao) || text(remoto?.situacao);
    const assinaturaLocal = text(row.assinatura);
    const assinaturaObraLocal = text(row.assinaturaObra);
    return {
    id: text(row.id),
    unidade_id: unidadeId(text(row.empreendimento), text(row.bloco), text(row.unidade)),
    status: parecer ? "concluida" : text(row.status),
    parecer,
    parecerEm: text(row.parecerEm) || text(remoto?.parecer_em),
    situacao,
    responsavelObra: text(row.responsavelObra) || text(remoto?.responsavel_obra),
    assinatura: imagem(assinaturaLocal) ? assinaturaLocal : text(remoto?.assinatura) || assinaturaLocal,
    assinante: text(row.assinante) || text(remoto?.assinante),
    assinaturaObra: imagem(assinaturaObraLocal) ? assinaturaObraLocal : text(remoto?.assinatura_obra) || assinaturaObraLocal,
    assinanteObra: text(row.assinanteObra) || text(remoto?.assinante_obra),
    obraEm: text(row.obraEm) || text(remoto?.obra_em),
    vistoriador: text(row.vistoriador),
    data: text(row.data),
    hora_inicio: text(row.horaInicio),
    hora_fim: text(row.horaFim),
    clima: text(row.clima),
    revisao: text(row.revisao),
    leitura_agua: "",
    leitura_energia: "",
    cargo: "",
    responsavel_tecnico: "",
    registro_tecnico: "",
    created_at: text(row.updatedAt),
    updated_at: text(row.updatedAt),
    empreendimento: text(row.empreendimento),
    bloco: text(row.bloco),
    apartamento: text(row.unidade),
    escopo: text(row.escopo) || "unidade",
    pavimento: text(row.pavimento),
  };
  });
  const ids = new Set(doAplicativo.map((item) => item.id));
  const doSupabase = failed?.error
    ? []
    : (vistorias.data ?? [])
        .map((row) => ({
          id: text(row.id),
          unidade_id: text(row.unidade_id),
          status: text(row.parecer) ? "concluida" : text(row.status),
          parecer: text(row.parecer),
          parecerEm: text(row.parecer_em),
          situacao: text(row.situacao),
          responsavelObra: text(row.responsavel_obra),
          assinatura: text(row.assinatura),
          assinante: text(row.assinante),
          assinaturaObra: text(row.assinatura_obra),
          assinanteObra: text(row.assinante_obra),
          obraEm: text(row.obra_em),
          vistoriador: text(row.vistoriador),
          data: text(row.data),
          hora_inicio: text(row.hora_inicio),
          hora_fim: text(row.hora_fim),
          clima: text(row.clima),
          revisao: text(row.revisao),
          leitura_agua: text(row.leitura_agua),
          leitura_energia: text(row.leitura_energia),
          cargo: text(row.cargo),
          responsavel_tecnico: text(row.responsavel_tecnico),
          registro_tecnico: text(row.registro_tecnico),
          created_at: text(row.created_at),
          updated_at: text(row.updated_at),
          cliente_id: text(row.cliente_id),
        }))
        .filter((item) => !ids.has(item.id) && !ids.has(text(item.cliente_id)) && !ocultas.has(item.id) && !ocultas.has(text(item.cliente_id)));

  const vistoriasVisiveis = [...doAplicativo, ...doSupabase];
  const presentes = new Set(vistoriasVisiveis.map((item) => item.id));
  const idNaTela = new Map<string, string>();
  for (const row of vistorias.data ?? []) {
    const numerico = text(row.id);
    const cliente = text(row.cliente_id);
    if (cliente && presentes.has(cliente)) idNaTela.set(numerico, cliente);
    else if (presentes.has(numerico)) idNaTela.set(numerico, numerico);
  }

  function codigoDaResposta(bruto: string) {
    const corte = bruto.indexOf("::");
    return {
      codigo: corte < 0 ? bruto : bruto.slice(0, corte),
      comodo: corte < 0 ? "" : bruto.slice(corte + 2),
    };
  }

  return {
    condominios: locais.condominios,
    blocos: locais.blocos,
    unidades: locais.unidades,
    vistorias: vistoriasVisiveis,
    respostas: adaptarRespostas(
      [
        ...enviadas.flatMap((row) =>
          (row.answers ?? []).map((answer) => {
            const separado = codigoDaResposta(text(answer.codigo));
            const comodo = text(answer.comodo) || separado.comodo;
            return {
              id: `${row.id}:${separado.codigo}:${comodo}`,
              vistoria_id: text(row.id),
              codigo: separado.codigo,
              comodo,
              marca: text(answer.mark),
              observacao: text(answer.observacao),
              gravidade: text(answer.gravidade),
              sharepoint_path: detalhesDaFoto(text(answer.sharepointPath), answer.fotos)[0]?.path || "",
              fotos: detalhesDaFoto(text(answer.sharepointPath), answer.fotos).map((foto) => foto.path),
              anotacoes: detalhesDaFoto(text(answer.sharepointPath), answer.fotos).map((foto) => foto.observacao),
            };
          }),
        ),
        ...(failed?.error
          ? []
          : (respostas.data ?? []).map((row) => {
                const separado = codigoDaResposta(text(row.codigo));
                const comodo = text((row as { comodo?: string }).comodo) || separado.comodo;
                const vistoriaId = idNaTela.get(text(row.vistoria_id)) || text(row.vistoria_id);
                return {
                id: text(row.id),
                vistoria_id: vistoriaId,
                codigo: separado.codigo,
                comodo,
                marca: text(row.marca),
                observacao: text(row.observacao),
                gravidade: text(row.gravidade),
                sharepoint_path: text(row.sharepoint_path),
                fotos: text(row.sharepoint_path) ? [text(row.sharepoint_path)] : [],
                };
              })),
      ].filter((item) => presentes.has(item.vistoria_id)),
    ).map((item) => ({ ...item, id: `${item.vistoria_id}:${item.codigo}:${item.comodo || ""}` })),
    itens: failed?.error
      ? []
      : (itens.data ?? []).map((row) => ({
          id: text(row.id),
          codigo: text(row.codigo),
          texto: text(row.texto),
          grupo: text(row.grupo),
          ordem: Number(row.ordem) || 0,
        })),
    error: null,
  };
}

export function localDaUnidade(data: PainelData, unidadeId: string) {
  const unidade = data.unidades.find((item) => item.id === unidadeId);
  const bloco = data.blocos.find((item) => item.id === unidade?.bloco_id);
  const condominio = data.condominios.find((item) => item.id === bloco?.condominio_id);
  return { unidade, bloco, condominio };
}

export function tituloDaVistoria(data: PainelData, vistoria: VistoriaRemota) {
  const { unidade, bloco, condominio } = localDaUnidade(data, vistoria.unidade_id);
  if (vistoria.escopo === "escada") {
    const numero = bloco?.numero || vistoria.bloco;
    const piso = nomePavimento(vistoria.pavimento);
    return {
      titulo: `${numero ? `Bloco ${numero}` : "Bloco"}${piso ? ` · ${piso}` : " · Escada e hall"}`,
      lugar: nomeDoEmpreendimento(condominio?.nome || vistoria.empreendimento || "Sem condomínio"),
    };
  }
  if (unidade || bloco || condominio) {
    const partes = [bloco ? `Bloco ${bloco.numero}` : "", unidade ? `Apto ${unidade.numero}` : "Unidade"].filter(Boolean);
    const titulo = partes.join(" · ");
    return {
      titulo: vistoria.escopo === "escada" ? `${titulo} · Escada e hall` : titulo,
      lugar: nomeDoEmpreendimento(condominio?.nome || vistoria.empreendimento || "Sem condomínio"),
    };
  }
  const partes = [vistoria.bloco ? `Bloco ${vistoria.bloco}` : "", vistoria.apartamento ? `Apto ${vistoria.apartamento}` : "Unidade"].filter(Boolean);
  const titulo = partes.join(" · ");
  return {
    titulo: vistoria.escopo === "escada" ? `${titulo} · Escada e hall` : titulo,
    lugar: nomeDoEmpreendimento(vistoria.empreendimento || "Sem condomínio"),
  };
}

export function statusVistoria(status: string, parecer = "", assinatura = "", situacao = "") {
  void status;
  void assinatura;
  const atual = situacaoDa({ parecer, situacao });
  const aguardandoFinal = atual === "obra" && parecer === "aprovada";
  return {
    label: atual === "aprovado" ? "Aprovado" : atual === "liberado" ? "Liberado" : atual === "obra" ? "Obra" : "Vistoria",
    detalhe: detalheDaSituacao(atual, parecer),
    tone: atual === "aprovado" || atual === "liberado" ? "ok" as const : aguardandoFinal ? "warn" as const : atual === "obra" ? "bad" as const : "warn" as const,
  };
}
