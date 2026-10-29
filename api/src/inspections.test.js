import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createInspectionStore, semExcluidas, vistoriasDaPessoa } from "./inspections.js";

test("vistoria anterior ao dia 25 é recusada e sai da lista", () => {
  const store = createInspectionStore(join(mkdtempSync(join(tmpdir(), "vistoria-")), "vistorias.json"));
  const antiga = store.save({
    id: "antiga",
    empreendimento: "Mangueira IBGE",
    bloco: "4",
    unidade: "303",
    data: "2026-10-16",
    vistoriador: "Administrador",
  });
  assert.equal(antiga.status, 409);
  assert.equal(store.list().some((item) => item.id === "antiga"), false);
  assert.equal(store.excluded().includes("antiga"), true);
  const recente = store.save({
    id: "recente",
    empreendimento: "Condomínio II",
    bloco: "5",
    unidade: "301",
    data: "2026-10-26",
    vistoriador: "Larissa Vita",
  });
  assert.equal(recente.row.id, "recente");
});

test("a vistoria fica guardada e a segunda gravação atualiza a mesma", () => {
  const store = createInspectionStore(join(mkdtempSync(join(tmpdir(), "vistoria-")), "vistorias.json"));
  const created = store.save({
    id: "v1",
    empreendimento: "Condomínio IBGE",
    bloco: "1",
    unidade: "101",
    status: "em_andamento",
    vistoriador: "Ana",
    answers: [{ codigo: "1.1", mark: "NC", observacao: "trinca", gravidade: "M" }],
  });
  assert.equal(created.row.answers[0].mark, "NC");
  store.save({
    id: "v1",
    empreendimento: "Condomínio IBGE",
    bloco: "1",
    unidade: "101",
    status: "concluida",
    vistoriador: "Ana",
    answers: [{ codigo: "1.1", marca: "C" }],
  });
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].status, "concluida");
  assert.equal(store.list()[0].answers[0].mark, "C");
  store.save({
    id: "v1",
    empreendimento: "Condomínio IBGE",
    bloco: "1",
    unidade: "101",
    status: "concluida",
    vistoriador: "Ana",
    answers: [{ codigo: "1.1", mark: "NC", sharepointPath: "a.jpg", fotos: ["a.jpg", "b.jpg", "a.jpg"] }],
  });
  assert.deepEqual(store.list()[0].answers[0].fotos, [
    { sharepointPath: "a.jpg", observacao: "" },
    { sharepointPath: "b.jpg", observacao: "" },
  ]);
  assert.equal(store.list()[0].answers[0].sharepointPath, "a.jpg");
  store.save({
    id: "v1",
    empreendimento: "Condomínio IBGE",
    bloco: "1",
    unidade: "101",
    status: "concluida",
    vistoriador: "Ana",
    answers: [{ codigo: "1.1", mark: "NC", fotos: [{ sharepointPath: "a.jpg", observacao: "trinca na parede" }, { sharepointPath: "b.jpg", observacao: "piso" }] }],
  });
  assert.equal(store.list()[0].answers[0].fotos[0].observacao, "trinca na parede");
  assert.equal(store.list()[0].answers[0].fotos[1].observacao, "piso");
});

test("uma gravação antiga não apaga o que o outro aparelho marcou", () => {
  const store = createInspectionStore(join(mkdtempSync(join(tmpdir(), "vistoria-")), "vistorias.json"));
  store.save({
    id: "v1",
    empreendimento: "Condomínio II",
    bloco: "5",
    unidade: "403",
    status: "concluida",
    vistoriador: "Larissa",
    horaFim: "15:46",
    updatedAt: "2026-10-22T18:46:00.000Z",
    answers: [
      { codigo: "1.1", comodo: "sala", mark: "NC", observacao: "trinca" },
      { codigo: "1.2", comodo: "quarto-01", mark: "C" },
    ],
  });
  const antiga = store.save({
    id: "v1",
    empreendimento: "Condomínio II",
    bloco: "5",
    unidade: "403",
    status: "em_andamento",
    vistoriador: "Larissa",
    updatedAt: "2026-10-22T12:00:00.000Z",
    answers: [{ codigo: "1.1", comodo: "sala", mark: "C" }],
  });
  assert.equal(antiga.row.horaFim, "15:46");
  assert.equal(antiga.row.answers.find((item) => item.codigo === "1.1").mark, "NC");
  assert.equal(antiga.row.answers.find((item) => item.codigo === "1.2").mark, "C");
  const nova = store.save({
    id: "v1",
    empreendimento: "Condomínio II",
    bloco: "5",
    unidade: "403",
    status: "concluida",
    vistoriador: "Larissa",
    horaFim: "15:46",
    updatedAt: "2026-10-22T19:00:00.000Z",
    answers: [{ codigo: "1.1", comodo: "sala", mark: "NC", observacao: "trinca maior" }, { codigo: "2.1", comodo: "cozinha", mark: "NC" }],
  });
  assert.equal(nova.row.answers.find((item) => item.codigo === "1.1").observacao, "trinca maior");
  assert.equal(nova.row.answers.find((item) => item.codigo === "1.2").mark, "C");
  assert.equal(nova.row.answers.find((item) => item.codigo === "2.1").mark, "NC");
});

test("reprovar conclui a vistoria e uma regravação não apaga a decisão", () => {
  const store = createInspectionStore(join(mkdtempSync(join(tmpdir(), "vistoria-")), "vistorias.json"));
  store.save({
    id: "v1",
    empreendimento: "Condomínio II",
    bloco: "2",
    unidade: "201",
    status: "concluida",
    vistoriador: "Larissa",
    updatedAt: "2026-10-09T10:00:00.000Z",
    answers: [],
  });
  assert.equal(store.decide("v1", "reprovada", "", "Larissa Prata").status, 400);
  const decided = store.decide("v1", "reprovada", "data:image/jpeg;base64,abc", "Larissa Prata");
  assert.equal(decided.row.status, "concluida");
  assert.equal(decided.row.parecer, "reprovada");
  assert.equal(decided.row.assinatura, "data:image/jpeg;base64,abc");
  assert.equal(decided.row.assinante, "Larissa Prata");
  assert.equal(decided.row.situacao, "obra");
  store.save({
    id: "v1",
    empreendimento: "Condomínio II",
    bloco: "2",
    unidade: "201",
    status: "concluida",
    vistoriador: "Larissa",
    updatedAt: "2026-10-09T10:00:00.000Z",
    answers: [],
  });
  assert.equal(store.list()[0].parecer, "reprovada");
  assert.equal(store.list()[0].status, "concluida");
  store.save({
    id: "v1",
    empreendimento: "Condomínio II",
    bloco: "2",
    unidade: "201",
    status: "em_andamento",
    vistoriador: "Larissa",
    updatedAt: "2099-01-01T00:00:00.000Z",
    answers: [],
  });
  assert.equal(store.list()[0].parecer, "reprovada");
  assert.equal(store.list()[0].status, "concluida");
  assert.equal(store.list()[0].assinatura, "data:image/jpeg;base64,abc");
  assert.equal(store.list()[0].assinante, "Larissa Prata");
  assert.equal(store.list()[0].situacao, "obra");
  assert.equal(store.decide("v1", "liberado").status, 400);
  assert.equal(store.decide("v1", "finalizar", "data:image/jpeg;base64,obra", "Obra").status, 400);
  const liberada = store.decide("v1", "liberado", "data:image/jpeg;base64,obra", "Obra");
  assert.equal(liberada.row.situacao, "liberado");
  assert.equal(liberada.row.parecer, "reprovada");
  assert.equal(liberada.row.assinatura, "data:image/jpeg;base64,abc");
  assert.equal(liberada.row.assinaturaObra, "data:image/jpeg;base64,obra");
  assert.equal(liberada.row.assinanteObra, "Obra");
  store.save({
    id: "v1",
    empreendimento: "Condomínio II",
    bloco: "2",
    unidade: "201",
    status: "em_andamento",
    vistoriador: "Larissa",
    answers: [],
  });
  assert.equal(store.list()[0].situacao, "liberado");
  const travada = store.save({
    id: "v1",
    empreendimento: "Condomínio II",
    bloco: "2",
    unidade: "201",
    status: "em_andamento",
    vistoriador: "Outra pessoa",
    answers: [{ codigo: "9.9", mark: "C" }],
  });
  assert.equal(travada.status, 400);
  assert.equal(store.list()[0].vistoriador, "Larissa");
  assert.equal(store.list()[0].answers.length, 0);
  assert.equal(store.decide("v1", "aprovada", "data:image/jpeg;base64,xyz", "Outra").status, 400);
});

test("aprovar manda para a obra e o responsável finaliza", () => {
  const store = createInspectionStore(join(mkdtempSync(join(tmpdir(), "vistoria-")), "vistorias.json"));
  store.save({
    id: "v1",
    empreendimento: "Condomínio II",
    bloco: "1",
    unidade: "101",
    status: "concluida",
    vistoriador: "Juliana",
    updatedAt: "2026-10-28T10:00:00.000Z",
    answers: [],
  });
  const aprovada = store.decide("v1", "aprovada", "data:image/jpeg;base64,ju", "Juliana");
  assert.equal(aprovada.row.parecer, "aprovada");
  assert.equal(aprovada.row.situacao, "obra");
  assert.equal(aprovada.row.assinante, "Juliana");
  assert.equal(store.decide("v1", "liberado", "data:image/jpeg;base64,ro", "Robson").status, 400);
  const final = store.decide("v1", "finalizar", "data:image/jpeg;base64,ro", "Robson", "Robson");
  assert.equal(final.row.situacao, "aprovado");
  assert.equal(final.row.parecer, "aprovada");
  assert.equal(final.row.assinatura, "data:image/jpeg;base64,ju");
  assert.equal(final.row.assinanteObra, "Robson");
  assert.equal(final.row.responsavelObra, "Robson");
});

test("excluir tira a vistoria da lista e uma nova gravação não a recupera", () => {
  const store = createInspectionStore(join(mkdtempSync(join(tmpdir(), "vistoria-")), "vistorias.json"));
  store.save({
    id: "v1",
    empreendimento: "Condomínio II",
    bloco: "3",
    unidade: "102",
    status: "concluida",
    vistoriador: "Larissa",
    answers: [{ codigo: "1.1", mark: "C" }],
  });
  const removed = store.remove("v1");
  assert.equal(removed.previous.id, "v1");
  assert.equal(store.list().length, 0);
  assert.deepEqual(store.excluded(), ["v1"]);
  store.save({
    id: "v2",
    empreendimento: "Condomínio II",
    bloco: "3",
    unidade: "102",
    revisao: "001",
    status: "concluida",
    vistoriador: "Larissa",
    answers: [],
  });
  store.save({
    id: "v3",
    empreendimento: "Condomínio II",
    bloco: "3",
    unidade: "102",
    revisao: "002",
    status: "concluida",
    vistoriador: "Larissa",
    answers: [],
  });
  store.remove("v2");
  assert.equal(store.list().find((item) => item.id === "v3").revisao, "00");
  const again = store.save({
    id: "v1",
    empreendimento: "Condomínio II",
    bloco: "3",
    unidade: "102",
    status: "em_andamento",
    vistoriador: "Larissa",
    answers: [],
  });
  assert.equal(again.status, 409);
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].id, "v3");
  assert.equal(store.decide("v1", "aprovada").status, 404);
});

test("uma gravação vazia não apaga as respostas que já estavam salvas", () => {
  const store = createInspectionStore(join(mkdtempSync(join(tmpdir(), "vistoria-")), "vistorias.json"));
  store.save({
    id: "v1",
    empreendimento: "Condomínio II",
    bloco: "5",
    unidade: "402",
    status: "concluida",
    vistoriador: "Larissa Vita",
    answers: [{ codigo: "4.6", comodo: "sala", mark: "NC", sharepointPath: "Vistorias/sala/4.6-sala.jpg" }],
  });
  store.save({
    id: "v1",
    empreendimento: "Condomínio II",
    bloco: "5",
    unidade: "402",
    status: "concluida",
    vistoriador: "Larissa Vita",
    answers: [],
  });
  assert.equal(store.list()[0].answers.length, 1);
  assert.equal(store.list()[0].answers[0].sharepointPath, "Vistorias/sala/4.6-sala.jpg");
});

test("foto do relatório entra mesmo com a vistoria assinada, e limpar zera a lista", () => {
  const store = createInspectionStore(join(mkdtempSync(join(tmpdir(), "vistoria-")), "vistorias.json"));
  store.save({
    id: "v1",
    empreendimento: "Mangueira IBGE",
    bloco: "5",
    unidade: "101",
    status: "em_andamento",
    vistoriador: "Larissa Vita",
    answers: [{ codigo: "1.1", comodo: "sala", mark: "NC", observacao: "trinca" }],
  });
  store.decide("v1", "aprovada", "data:image/png;base64,abc", "Larissa Vita", "");
  const foto = store.anexarFoto("v1", {
    codigo: "1.1",
    comodo: "sala",
    mark: "NC",
    observacao: "trinca na parede",
    fotos: [{ sharepointPath: "Vistorias/Mangueira-IBGE/Bloco-5/Apto-101/Rev-00/Esquadrias/1.1-sala.jpg", observacao: "lado esquerdo" }],
  });
  assert.equal(foto.row.assinatura.startsWith("data:image"), true);
  assert.equal(foto.row.answers[0].fotos[0].observacao, "lado esquerdo");
  assert.equal(foto.row.answers[0].observacao, "trinca na parede");
  const ids = store.limpar();
  assert.deepEqual(ids, ["v1"]);
  assert.equal(store.list().length, 0);
  assert.deepEqual(store.excluded(), ["v1"]);
});

test("responsável da obra só recebe vistorias com status obra", () => {
  const rows = [
    { id: "a", situacao: "vistoria", parecer: "" },
    { id: "b", situacao: "obra", parecer: "reprovada" },
    { id: "c", situacao: "", parecer: "reprovada" },
    { id: "d", situacao: "aprovado", parecer: "aprovada" },
    { id: "e", situacao: "liberado", parecer: "reprovada" },
  ];
  const obra = { administrador: false, assinarObra: true, assinarVistoria: false };
  assert.deepEqual(vistoriasDaPessoa(rows, obra).map((item) => item.id), ["b", "c"]);
  assert.equal(vistoriasDaPessoa(rows, { administrador: true, assinarObra: true }).length, 5);
  assert.equal(vistoriasDaPessoa(rows, { administrador: false, assinarObra: true, assinarVistoria: true }).length, 5);
});

test("vistoria excluída não volta quando o banco ainda a lista", () => {
  const lista = semExcluidas(
    [
      { id: "cliente-1", origemId: "71", empreendimento: "IBGE" },
      { id: "cliente-2", origemId: "72", empreendimento: "II" },
    ],
    ["71"],
  );
  assert.deepEqual(lista, [{ id: "cliente-2", empreendimento: "II" }]);
});
