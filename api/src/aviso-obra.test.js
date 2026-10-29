import assert from "node:assert/strict";
import test from "node:test";
import { contarNc, textoDoAviso } from "./aviso-obra.js";

test("o aviso da obra diz quem assinou, o resultado e as NC", () => {
  assert.equal(contarNc([{ mark: "C" }, { mark: "NC" }, { marca: "NC" }, { mark: "NA" }]), 2);
  const aviso = textoDoAviso({
    empreendimento: "Condomínio II",
    bloco: "5",
    unidade: "201",
    parecer: "reprovada",
    assinante: "Juliana Brandão",
    answers: [{ mark: "NC" }, { mark: "NC" }, { mark: "C" }],
  });
  assert.equal(aviso.assunto, "Vistoria em obra: Mangueira - Cond II, bloco 5, apartamento 201");
  assert.equal(
    aviso.corpo,
    "Juliana Brandão assinou a vistoria de Mangueira - Cond II, bloco 5, apartamento 201.\nResultado: reprovada.\nNC: 2.\n\nNecessário assinatura do responsável da obra para nova vistoria.",
  );
  const aprovada = textoDoAviso({ parecer: "aprovada", assinante: "Ana", answers: [] });
  assert.match(aprovada.corpo, /Resultado: aprovada/);
  assert.match(aprovada.corpo, /NC: 0/);
  assert.match(aprovada.corpo, /finalizar a vistoria\.$/);
});
