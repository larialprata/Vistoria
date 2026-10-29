import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { enviarAvisoDeObra } from "./aviso-obra.js";
import { downloadFromSharePoint, photoExists } from "./graph.js";
import { resolvePhotoPath } from "./path.js";
import { tokenDoSupabase } from "./supabase-sessao.js";

const CORTE_VISTORIA = "2026-10-25";

function text(value) {
  return value == null ? "" : String(value);
}

function anteriorAoCorte(valor) {
  const bruto = text(valor).trim();
  const brasileiro = bruto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const dia = brasileiro ? `${brasileiro[3]}-${brasileiro[2]}-${brasileiro[1]}` : bruto.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia < CORTE_VISTORIA;
}

function chaveResposta(answer) {
  return `${text(answer?.codigo)}|${text(answer?.comodo)}`;
}

function marcaPreenchida(valor) {
  return valor === "C" || valor === "NC" || valor === "NA";
}

function mesclarRespostas(base, porCima) {
  const mapa = new Map();
  for (const item of base || []) mapa.set(chaveResposta(item), item);
  for (const item of porCima || []) {
    const atual = mapa.get(chaveResposta(item));
    const nova = text(item?.mark || item?.marca);
    const antiga = text(atual?.mark || atual?.marca);
    if (atual && marcaPreenchida(antiga) && !marcaPreenchida(nova)) continue;
    mapa.set(chaveResposta(item), item);
  }
  return [...mapa.values()];
}

function nomeEmpreendimento(nome) {
  const valor = text(nome).toLocaleLowerCase("pt-br");
  if (valor === "condomínio ii" || valor === "condominio ii" || valor === "mangueira ii" || valor === "mangueira - cond ii") {
    return "mangueira - cond ii";
  }
  return valor;
}

function mesmoLugarLinha(a, b) {
  if (nomeEmpreendimento(a.empreendimento) !== nomeEmpreendimento(b.empreendimento) || text(a.bloco) !== text(b.bloco)) return false;
  if (text(a.escopo || "unidade") === "escada" || text(b.escopo || "unidade") === "escada") {
    return text(a.escopo) === "escada" && text(b.escopo) === "escada" && text(a.pavimento) === text(b.pavimento);
  }
  return text(a.unidade) === text(b.unidade);
}

function zerarRevisoes(rows, alvo) {
  const irmas = rows.filter((item) => !item.excluida && mesmoLugarLinha(item, alvo));
  irmas.sort((a, b) => (Number(a.revisao) || 0) - (Number(b.revisao) || 0) || text(a.updatedAt).localeCompare(text(b.updatedAt)) || text(a.id).localeCompare(text(b.id)));
  irmas.forEach((item, indice) => {
    item.revisao = indice === 0 ? "00" : String(indice).padStart(3, "0");
  });
}

function fotosDe(answer) {
  const lista = Array.isArray(answer.fotos) ? answer.fotos : [];
  const unicos = [];
  for (const item of lista) {
    const foto = typeof item === "string"
      ? { sharepointPath: text(item), observacao: "" }
      : { sharepointPath: text(item?.sharepointPath || item?.sharepoint_path), observacao: text(item?.observacao) };
    if (foto.sharepointPath && !unicos.some((salva) => salva.sharepointPath === foto.sharepointPath)) unicos.push(foto);
  }
  const principal = text(answer.sharepointPath || answer.sharepoint_path);
  if (principal && !unicos.some((salva) => salva.sharepointPath === principal)) {
    unicos.unshift({ sharepointPath: principal, observacao: "" });
  }
  return unicos;
}

export function createInspectionStore(filePath) {
  function read() {
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function write(rows) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(rows, null, 2));
  }

  function clean(body) {
    const answers = Array.isArray(body.answers) ? body.answers : [];
    return {
      id: text(body.id),
      empreendimento: text(body.empreendimento),
      bloco: text(body.bloco),
      unidade: text(body.unidade),
      status: text(body.status) || "em_andamento",
      vistoriador: text(body.vistoriador),
      data: text(body.data),
      horaInicio: text(body.horaInicio),
      horaFim: text(body.horaFim),
      clima: text(body.clima),
      revisao: text(body.revisao) || text(body.numeroVistoria) || "00",
      escopo: text(body.escopo) || "unidade",
      pavimento: text(body.pavimento),
      proprietario: text(body.proprietario),
      construtora: text(body.construtora),
      numeroVistoria: text(body.numeroVistoria),
      assinatura: text(body.assinatura),
      assinante: text(body.assinante),
      situacao: "",
      responsavelObra: "",
      updatedAt: text(body.updatedAt) || new Date().toISOString(),
      answers: answers.map((answer) => ({
        codigo: text(answer.codigo),
        comodo: text(answer.comodo),
        mark: text(answer.mark || answer.marca),
        observacao: text(answer.observacao),
        gravidade: text(answer.gravidade),
        sharepointPath: fotosDe(answer)[0]?.sharepointPath || "",
        fotos: fotosDe(answer),
      })),
    };
  }

  return {
    list: () => read().filter((item) => !item.excluida).sort((a, b) => text(b.updatedAt).localeCompare(text(a.updatedAt))),
    excluded: () => read().filter((item) => item.excluida).map((item) => item.id),
    save(body) {
      const row = clean(body);
      if (!row.id) return { error: "Vistoria sem identificador.", status: 400 };
      if (!row.empreendimento) return { error: "Informe o condomínio.", status: 400 };
      if (row.escopo === "escada") {
        if (!row.bloco || !row.pavimento) return { error: "Informe o bloco e o pavimento.", status: 400 };
      } else if (!row.unidade) {
        return { error: "Informe o condomínio e o apartamento.", status: 400 };
      }
      const rows = read();
      const index = rows.findIndex((item) => item.id === row.id);
      const previous = index >= 0 ? rows[index] : null;
      if (anteriorAoCorte(row.data)) {
        const tombstone = { id: row.id, excluida: true, excluidaEm: new Date().toISOString() };
        if (index >= 0) rows[index] = tombstone;
        else rows.unshift(tombstone);
        write(rows);
        return { error: "Esta vistoria foi excluída.", status: 409 };
      }
      if (previous?.excluida) return { error: "Esta vistoria foi excluída.", status: 409 };
      if (text(previous?.assinatura).startsWith("data:image")) {
        return { error: "Vistoria assinada não pode ser alterada.", status: 400 };
      }
      if (previous?.answers?.length && !row.answers.length) row.answers = previous.answers;
      if (previous && text(previous.updatedAt) > text(row.updatedAt)) {
        const extras = row.answers.filter((item) => !(previous.answers || []).some((atual) => chaveResposta(atual) === chaveResposta(item)));
        if (!extras.length) return { row: previous };
        row.answers = [...previous.answers, ...extras];
        row.updatedAt = previous.updatedAt;
        row.status = previous.status || row.status;
        row.horaFim = previous.horaFim || row.horaFim;
        row.horaInicio = previous.horaInicio || row.horaInicio;
      } else if (previous?.answers?.length && row.answers.length) {
        row.answers = mesclarRespostas(previous.answers, row.answers);
        if (previous.horaFim && !row.horaFim) row.horaFim = previous.horaFim;
        if (previous.horaInicio && !row.horaInicio) row.horaInicio = previous.horaInicio;
      }
      if (previous) {
        row.situacao = previous.situacao || "";
        row.responsavelObra = previous.responsavelObra || "";
        if (previous.revisao) row.revisao = previous.revisao;
      }
      if (previous?.parecer) {
        row.parecer = previous.parecer;
        row.parecerEm = previous.parecerEm;
        row.assinatura = previous.assinatura || row.assinatura;
        row.assinante = previous.assinante || row.assinante;
        row.status = "concluida";
        row.revisao = previous.revisao || row.revisao;
      } else {
        row.parecer = "";
        row.parecerEm = "";
        row.assinatura = "";
        row.assinante = "";
      }
      if (index >= 0) rows[index] = row;
      else rows.unshift(row);
      write(rows);
      return { row };
    },
    decide(id, parecer, assinatura = "", assinante = "", responsavelObra = "") {
      if (parecer !== "aprovada" && parecer !== "reprovada" && parecer !== "liberado" && parecer !== "finalizar") {
        return { error: "Escolha aprovar, reprovar, liberar ou finalizar.", status: 400 };
      }
      const rows = read();
      const index = rows.findIndex((item) => item.id === id);
      if (index < 0) return { error: "Vistoria não encontrada.", status: 404 };
      const previous = rows[index];
      if (previous?.excluida) return { error: "Vistoria não encontrada.", status: 404 };
      const naObra = previous.situacao === "obra" || (previous.parecer === "reprovada" && previous.situacao !== "liberado" && previous.situacao !== "aprovado");
      if (parecer === "liberado" && !(naObra && previous.parecer === "reprovada")) {
        return { error: "Só o responsável da obra envia uma vistoria reprovada para nova vistoria.", status: 400 };
      }
      if (parecer === "finalizar" && !(previous.situacao === "obra" && previous.parecer === "aprovada")) {
        return { error: "Só o responsável da obra finaliza uma vistoria aprovada.", status: 400 };
      }
      if ((parecer === "aprovada" || parecer === "reprovada") && (previous.situacao === "obra" || previous.situacao === "aprovado" || previous.situacao === "liberado")) {
        return { error: "Esta vistoria já foi assinada.", status: 400 };
      }
      const imagem = text(assinatura);
      const daObra = parecer === "liberado" || parecer === "finalizar";
      if (!daObra && text(previous.assinatura).startsWith("data:image")) {
        return { error: "Vistoria assinada não pode ser alterada.", status: 400 };
      }
      if (!imagem.startsWith("data:image")) {
        return { error: daObra ? "Assine como responsável da obra." : "Assine para aprovar ou reprovar.", status: 400 };
      }
      const responsavel = text(responsavelObra) || text(assinante) || previous.responsavelObra || "";
      const next = daObra
        ? {
            ...previous,
            parecer: parecer === "liberado" ? "reprovada" : "aprovada",
            situacao: parecer === "liberado" ? "liberado" : "aprovado",
            responsavelObra: responsavel,
            assinaturaObra: imagem,
            assinanteObra: text(assinante),
            obraEm: new Date().toISOString(),
            status: "concluida",
          }
        : {
            ...previous,
            parecer,
            situacao: "obra",
            parecerEm: new Date().toISOString(),
            assinatura: imagem || previous.assinatura || "",
            assinante: text(assinante) || previous.assinante || "",
            status: "concluida",
          };
      rows[index] = next;
      write(rows);
      return { row: next, previous };
    },
    remove(id) {
      const cleanId = text(id);
      if (!cleanId) return { error: "Vistoria sem identificador.", status: 400 };
      const rows = read();
      const index = rows.findIndex((item) => item.id === cleanId);
      const previous = index >= 0 ? rows[index] : null;
      if (previous?.excluida) return { row: previous, previous };
      const tombstone = { id: cleanId, excluida: true, excluidaEm: new Date().toISOString() };
      if (index >= 0) rows[index] = tombstone;
      else rows.unshift(tombstone);
      if (previous && !previous.excluida) zerarRevisoes(rows, previous);
      write(rows);
      return { row: tombstone, previous };
    },
    forget(id) {
      const cleanId = text(id);
      write(read().filter((item) => item.id !== cleanId));
    },
    anexarFoto(id, body) {
      const cleanId = text(id);
      const codigo = text(body?.codigo);
      const comodo = text(body?.comodo);
      if (!cleanId || !codigo) return { error: "Informe a vistoria e o item.", status: 400 };
      const rows = read();
      const index = rows.findIndex((item) => item.id === cleanId);
      const previous = index >= 0 ? rows[index] : null;
      if (!previous || previous.excluida) return { error: "Vistoria não encontrada.", status: 404 };
      const fotos = fotosDe(body || {});
      const answers = [...(previous.answers || [])];
      const pos = answers.findIndex((item) => chaveResposta(item) === `${codigo}|${comodo}`);
      const atual = pos >= 0 ? answers[pos] : null;
      const marca = text(body?.mark || body?.marca || atual?.mark || (fotos.length ? "NC" : ""));
      const celula = {
        codigo,
        comodo,
        mark: marca === "C" || marca === "NC" || marca === "NA" ? marca : atual?.mark || "NC",
        observacao: body?.observacao == null ? text(atual?.observacao) : text(body.observacao),
        gravidade: text(atual?.gravidade),
        sharepointPath: fotos[0]?.sharepointPath || "",
        fotos,
      };
      if (pos >= 0) answers[pos] = celula;
      else answers.push(celula);
      const row = { ...previous, answers, updatedAt: new Date().toISOString() };
      rows[index] = row;
      write(rows);
      return { row };
    },
    limpar() {
      const agora = new Date().toISOString();
      const rows = read().map((item) => (item.excluida ? item : { id: item.id, excluida: true, excluidaEm: agora }));
      write(rows);
      return rows.map((item) => item.id);
    },
    restore(row) {
      if (!row?.id) return;
      const rows = read();
      const index = rows.findIndex((item) => item.id === row.id);
      if (index >= 0) rows[index] = row;
      else rows.unshift(row);
      write(rows);
    },
  };
}

export async function decideInspectionInSupabase(config, token, row) {
  if (!config?.supabaseUrl || !config?.supabaseKey) return;
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/decidir_vistoria`, {
    method: "POST",
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_token: token,
      payload: {
        id: row.id,
        parecer: row.parecer,
        parecerEm: row.parecerEm,
        situacao: row.situacao,
        assinatura: row.assinatura,
        assinante: row.assinante,
        responsavelObra: row.responsavelObra,
        assinaturaObra: row.assinaturaObra,
        assinanteObra: row.assinanteObra,
        obraEm: row.obraEm,
      },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    let message = "Não foi possível registrar a decisão.";
    try {
      const parsed = JSON.parse(detail);
      if (parsed.message) message = String(parsed.message);
    } catch {
      if (detail) message = detail.slice(0, 240);
    }
    throw new Error(message);
  }
}

function supabaseHeaders(config) {
  return {
    apikey: config.supabaseKey,
    Authorization: `Bearer ${config.supabaseKey}`,
    "Content-Type": "application/json",
  };
}

async function supabaseError(response, fallback) {
  const detail = await response.text();
  try {
    const parsed = JSON.parse(detail);
    if (parsed.message) return String(parsed.message);
    if (parsed.code) return `${parsed.code} ${parsed.message || fallback}`;
  } catch {
    if (detail) return detail.slice(0, 240);
  }
  return fallback;
}

function comDecisao(item, remota) {
  if (!remota) return item;
  const imagem = (valor) => text(valor).startsWith("data:image");
  const parecer = text(item.parecer) || text(remota.parecer);
  return {
    ...item,
    parecer,
    parecerEm: text(item.parecerEm) || text(remota.parecerEm),
    situacao: text(item.situacao) || text(remota.situacao),
    assinatura: imagem(item.assinatura) ? item.assinatura : text(remota.assinatura) || text(item.assinatura),
    assinante: text(item.assinante) || text(remota.assinante),
    responsavelObra: text(item.responsavelObra) || text(remota.responsavelObra),
    assinaturaObra: imagem(item.assinaturaObra) ? item.assinaturaObra : text(remota.assinaturaObra) || text(item.assinaturaObra),
    assinanteObra: text(item.assinanteObra) || text(remota.assinanteObra),
    obraEm: text(item.obraEm) || text(remota.obraEm),
    status: parecer ? "concluida" : item.status,
  };
}

function filtroDaVistoria(id) {
  return /^\d+$/.test(id)
    ? `or=(cliente_id.eq.${encodeURIComponent(id)},id.eq.${id})`
    : `cliente_id=eq.${encodeURIComponent(id)}`;
}

async function vistoriasPorId(config, id) {
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/vistorias?${filtroDaVistoria(id)}&select=id,cliente_id,revisao`, {
    headers: supabaseHeaders(config),
  });
  if (!response.ok) throw new Error(await supabaseError(response, "Não foi possível localizar a vistoria."));
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function apagarVistoriaNoBanco(config, id) {
  const access = await tokenDoSupabase(config);
  if (!access) throw new Error("Entre de novo como administrador para excluir a vistoria do banco.");
  const base = config.supabaseUrl.replace(/\/$/, "");
  const headers = {
    ...supabaseHeaders(config),
    Authorization: `Bearer ${access}`,
    Prefer: "return=representation",
  };
  const rows = await vistoriasPorId(config, id);
  for (const row of rows) {
    const respostas = await fetch(`${base}/rest/v1/vistoria_respostas?vistoria_id=eq.${encodeURIComponent(row.id)}`, {
      method: "DELETE",
      headers,
    });
    if (!respostas.ok) throw new Error(await supabaseError(respostas, "Não foi possível excluir as respostas."));
    const vistoria = await fetch(`${base}/rest/v1/vistorias?id=eq.${encodeURIComponent(row.id)}`, {
      method: "DELETE",
      headers,
    });
    const apagadas = await vistoria.json().catch(() => []);
    if (!vistoria.ok || !Array.isArray(apagadas) || !apagadas.length) {
      throw new Error("Não foi possível excluir a vistoria do Supabase.");
    }
  }
  if ((await vistoriasPorId(config, id)).length) {
    throw new Error("A vistoria continuou no Supabase.");
  }
}

export async function deleteInspectionInSupabase(config, token, id) {
  if (!config?.supabaseUrl || !config?.supabaseKey || !id) return;
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/excluir_vistoria`, {
    method: "POST",
    headers: supabaseHeaders(config),
    body: JSON.stringify({ p_token: token, payload: { id } }),
  });
  if (!response.ok) {
    const message = await supabaseError(response, "Não foi possível excluir a vistoria.");
    if (!/excluir_vistoria|PGRST202|schema cache/i.test(message)) throw new Error(message);
  }
  if (!(await vistoriasPorId(config, id)).length) return;
  await apagarVistoriaNoBanco(config, id);
}

export async function alinharRevisoesNoSupabase(config, rows) {
  if (!config?.supabaseUrl || !config?.supabaseKey) return;
  const access = await tokenDoSupabase(config);
  if (!access) return;
  const base = config.supabaseUrl.replace(/\/$/, "");
  const headers = {
    ...supabaseHeaders(config),
    Authorization: `Bearer ${access}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  const pendentes = [];
  for (const row of rows || []) {
    if (!row?.id || row.excluida) continue;
    const remotas = await vistoriasPorId(config, row.id);
    const revisao = text(row.revisao) || "00";
    if (remotas.some((item) => text(item.revisao) !== revisao)) pendentes.push({ id: row.id, revisao });
  }
  pendentes.sort((a, b) => (Number(a.revisao) || 0) - (Number(b.revisao) || 0));
  for (const [indice, row] of pendentes.entries()) {
    const resposta = await fetch(`${base}/rest/v1/vistorias?cliente_id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ revisao: String(900 + indice) }),
    });
    if (!resposta.ok) throw new Error(await supabaseError(resposta, "Não foi possível renumerar a revisão."));
  }
  for (const row of pendentes) {
    const resposta = await fetch(`${base}/rest/v1/vistorias?cliente_id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ revisao: row.revisao }),
    });
    if (!resposta.ok) throw new Error(await supabaseError(resposta, "Não foi possível renumerar a revisão."));
  }
}

function codigoNoSupabase(answer) {
  const codigo = text(answer?.codigo);
  const comodo = text(answer?.comodo);
  if (!codigo || !comodo || codigo.includes("::")) return codigo;
  return `${codigo}::${comodo}`;
}

function respostaDoSupabase(resposta) {
  const bruto = text(resposta?.codigo);
  const corte = bruto.indexOf("::");
  return {
    codigo: corte < 0 ? bruto : bruto.slice(0, corte),
    comodo: corte < 0 ? "" : bruto.slice(corte + 2),
    mark: text(resposta?.marca),
    observacao: text(resposta?.observacao),
    gravidade: text(resposta?.gravidade),
    sharepointPath: text(resposta?.sharepoint_path),
  };
}

export async function publishInspectionToSupabase(config, row) {
  if (!config?.supabaseUrl || !config?.supabaseKey) return;
  const payload = {
    ...row,
    answers: (row.answers || []).map((answer) => ({ ...answer, codigo: codigoNoSupabase(answer) })),
  };
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/gravar_vistoria`, {
    method: "POST",
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail.slice(0, 240) || "Não foi possível gravar a vistoria no Supabase.");
  }
}

async function vistoriasDoSupabase(config) {
  if (!config?.supabaseUrl || !config?.supabaseKey) return [];
  const base = config.supabaseUrl.replace(/\/$/, "");
  const headers = supabaseHeaders(config);
  const [vistorias, unidades, blocos, condominios, respostas] = await Promise.all([
    fetch(`${base}/rest/v1/vistorias?select=id,cliente_id,status,parecer,parecer_em,situacao,assinatura,assinante,responsavel_obra,assinatura_obra,assinante_obra,obra_em,revisao,vistoriador,data,hora_inicio,hora_fim,clima,updated_at,unidade_id&order=updated_at.desc&limit=300`, { headers }),
    fetch(`${base}/rest/v1/unidades?select=id,numero,bloco_id&limit=500`, { headers }),
    fetch(`${base}/rest/v1/blocos?select=id,numero,condominio_id&limit=200`, { headers }),
    fetch(`${base}/rest/v1/condominios?select=id,nome&limit=50`, { headers }),
    fetch(`${base}/rest/v1/vistoria_respostas?select=vistoria_id,codigo,marca,observacao,gravidade,sharepoint_path&limit=20000`, { headers }),
  ]);
  if (!vistorias.ok || !unidades.ok || !blocos.ok || !condominios.ok || !respostas.ok) return [];
  const [lista, listaUnidades, listaBlocos, listaCondominios, listaRespostas] = await Promise.all([
    vistorias.json(),
    unidades.json(),
    blocos.json(),
    condominios.json(),
    respostas.json(),
  ]);
  const unidadePorId = new Map((Array.isArray(listaUnidades) ? listaUnidades : []).map((item) => [String(item.id), item]));
  const blocoPorId = new Map((Array.isArray(listaBlocos) ? listaBlocos : []).map((item) => [String(item.id), item]));
  const condominioPorId = new Map((Array.isArray(listaCondominios) ? listaCondominios : []).map((item) => [String(item.id), item]));
  const respostasPorVistoria = new Map();
  for (const resposta of Array.isArray(listaRespostas) ? listaRespostas : []) {
    const chave = String(resposta.vistoria_id);
    const grupo = respostasPorVistoria.get(chave) || [];
    grupo.push(respostaDoSupabase(resposta));
    respostasPorVistoria.set(chave, grupo);
  }
  return (Array.isArray(lista) ? lista : []).map((row) => {
    const unidade = unidadePorId.get(String(row.unidade_id));
    const bloco = blocoPorId.get(String(unidade?.bloco_id || ""));
    const condominio = condominioPorId.get(String(bloco?.condominio_id || ""));
    return {
      id: text(row.cliente_id) || text(row.id),
      origemId: text(row.id),
      empreendimento: text(condominio?.nome),
      bloco: text(bloco?.numero),
      unidade: text(unidade?.numero),
      status: text(row.status) || "em_andamento",
      parecer: text(row.parecer),
      parecerEm: text(row.parecer_em),
      situacao: text(row.situacao),
      assinatura: text(row.assinatura),
      assinante: text(row.assinante),
      responsavelObra: text(row.responsavel_obra),
      assinaturaObra: text(row.assinatura_obra),
      assinanteObra: text(row.assinante_obra),
      obraEm: text(row.obra_em),
      revisao: text(row.revisao) || "00",
      vistoriador: text(row.vistoriador),
      data: text(row.data),
      horaInicio: text(row.hora_inicio).slice(0, 5),
      horaFim: text(row.hora_fim).slice(0, 5),
      clima: text(row.clima),
      escopo: "unidade",
      updatedAt: text(row.updated_at),
      answers: respostasPorVistoria.get(String(row.id)) || [],
    };
  });
}

export function situacaoDaLinha(item) {
  if (item?.situacao === "liberado") return "liberado";
  if (item?.situacao === "aprovado") return "aprovado";
  if (item?.situacao === "obra") return "obra";
  if (item?.parecer === "aprovada") return "aprovado";
  if (item?.parecer === "reprovada") return "obra";
  return "vistoria";
}

export function vistoriasDaPessoa(rows, person) {
  if (!person || person.administrador || person.assinarObra !== true || person.assinarVistoria === true) return rows;
  return rows.filter((item) => situacaoDaLinha(item) === "obra");
}

export function semExcluidas(remotas, ocultas) {
  const escondidas = new Set(ocultas);
  return remotas
    .filter((item) => item?.id && !escondidas.has(item.id) && !escondidas.has(item.origemId))
    .map(({ origemId, ...item }) => item);
}

export function attachInspections(app, people, filePath, supabaseConfig) {
  const store = createInspectionStore(filePath);

  function tokenOf(req) {
    const header = req.headers.authorization || "";
    return header.startsWith("Bearer ") ? header.slice(7) : "";
  }

  function signedIn(req, res) {
    if (!people.findToken(tokenOf(req))) {
      res.status(401).json({ error: "Entre de novo para enviar a vistoria." });
      return false;
    }
    return true;
  }

  app.get("/fotos", async (req, res) => {
    if (!signedIn(req, res)) return;
    try {
      const fullPath = resolvePhotoPath(supabaseConfig?.basePath, req.query.path);
      if (req.query.existe === "1") {
        const existe = await photoExists(supabaseConfig, fullPath);
        res.status(existe ? 204 : 404).end();
        return;
      }
      const file = await downloadFromSharePoint(supabaseConfig, fullPath);
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.send(file.buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível abrir a foto.";
      res.status(message.includes("inválido") ? 400 : 404).json({ error: message });
    }
  });

  app.get("/vistorias/excluidas", (req, res) => {
    if (!signedIn(req, res)) return;
    res.json(store.excluded());
  });

  app.get("/vistorias", async (req, res) => {
    const person = people.findToken(tokenOf(req));
    if (!person) {
      res.status(401).json({ error: "Entre de novo para enviar a vistoria." });
      return;
    }
    const local = store.list();
    try {
      const remotas = semExcluidas(await vistoriasDoSupabase(supabaseConfig), store.excluded());
      const conhecidas = new Set(local.map((item) => item.id));
      const completas = local.map((item) => {
        const remota = remotas.find((row) => row.id === item.id);
        const base = !remota?.answers?.length
          ? item
          : {
              ...item,
              answers: item.answers?.length ? mesclarRespostas(remota.answers, item.answers) : remota.answers,
              empreendimento: item.empreendimento || remota.empreendimento,
              bloco: item.bloco || remota.bloco,
              unidade: item.unidade || remota.unidade,
            };
        return comDecisao(base, remota);
      });
      res.json(vistoriasDaPessoa([...completas, ...remotas.filter((item) => item.id && !conhecidas.has(item.id))], person));
    } catch {
      res.json(vistoriasDaPessoa(local, person));
    }
  });

  app.post("/vistorias/excluir", async (req, res) => {
    const person = people.findToken(tokenOf(req));
    if (!person) {
      res.status(401).json({ error: "Entre de novo para excluir a vistoria." });
      return;
    }
    if (!person.administrador) {
      res.status(403).json({ error: "Só um administrador pode excluir uma vistoria." });
      return;
    }
    const id = text(req.body?.id);
    const result = store.remove(id);
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    try {
      await deleteInspectionInSupabase(supabaseConfig, tokenOf(req), id);
    } catch (error) {
      if (result.previous) store.restore(result.previous);
      else store.forget(id);
      const message = error instanceof Error ? error.message : "Não foi possível excluir a vistoria.";
      res.status(502).json({ error: message });
      return;
    }
    if (result.previous) {
      try {
        await alinharRevisoesNoSupabase(
          supabaseConfig,
          store.list().filter((item) => mesmoLugarLinha(item, result.previous)),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível renumerar a revisão.";
        res.status(502).json({ error: message });
        return;
      }
    }
    res.json({ id });
  });

  async function avisarEquipe(pedido, row) {
    if (pedido !== "aprovada" && pedido !== "reprovada") return;
    try {
      await enviarAvisoDeObra(supabaseConfig, row);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Não foi possível enviar o aviso da obra.");
    }
  }

  app.post("/vistorias/parecer", async (req, res) => {
    const person = people.findToken(tokenOf(req));
    if (!person) {
      res.status(401).json({ error: "Entre de novo para decidir a vistoria." });
      return;
    }
    const pedido = text(req.body?.parecer);
    const daObra = pedido === "liberado" || pedido === "finalizar";
    const pode = person.administrador || (daObra ? person.assinarObra === true : person.assinarVistoria === true);
    if (!pode) {
      res.status(403).json({
        error: daObra ? "Você não tem permissão para assinar como responsável da obra." : "Você não tem permissão para assinar a vistoria.",
      });
      return;
    }
    const result = store.decide(text(req.body?.id), pedido, text(req.body?.assinatura), person.nome, text(req.body?.responsavelObra));
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    try {
      await decideInspectionInSupabase(supabaseConfig, tokenOf(req), result.row);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível registrar a decisão.";
      if (/não encontrada|schema cache|PGRST202/i.test(message)) {
        await avisarEquipe(pedido, result.row);
        res.json(result.row);
        return;
      }
      store.restore(result.previous);
      res.status(502).json({ error: message });
      return;
    }
    await avisarEquipe(pedido, result.row);
    res.json(result.row);
  });

  app.post("/vistorias/fotos", async (req, res) => {
    const person = people.findToken(tokenOf(req));
    if (!person) {
      res.status(401).json({ error: "Entre de novo para alterar as fotos." });
      return;
    }
    if (!person.administrador) {
      res.status(403).json({ error: "Só um administrador pode alterar as fotos do relatório." });
      return;
    }
    const result = store.anexarFoto(text(req.body?.id), req.body || {});
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    try {
      await publishInspectionToSupabase(supabaseConfig, result.row);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível gravar a foto na vistoria.";
      res.status(502).json({ error: message });
      return;
    }
    res.json(result.row);
  });

  app.post("/vistorias", async (req, res) => {
    if (!signedIn(req, res)) return;
    const result = store.save(req.body || {});
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    try {
      await publishInspectionToSupabase(supabaseConfig, result.row);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível gravar a vistoria no Supabase.";
      res.status(502).json({ error: message });
      return;
    }
    res.json(result.row);
  });
}
