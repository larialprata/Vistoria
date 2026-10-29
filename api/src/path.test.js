import assert from "node:assert/strict";
import test from "node:test";
import { graphItemPath, joinSharePointPath, resolvePhotoPath } from "./path.js";

test("coloca a foto dentro da pasta de teste", () => {
  assert.equal(
    joinSharePointPath("Teste/Vistoria", "Vistorias/238-239/Bloco-1/Apto-203/Sala/1.1.5.jpg"),
    "Teste/Vistoria/Vistorias/238-239/Bloco-1/Apto-203/Sala/1.1.5.jpg",
  );
});

test("recusa caminho que tenta sair da pasta", () => {
  assert.throws(() => joinSharePointPath("Teste/Vistoria", "../fora.jpg"));
  assert.throws(() => joinSharePointPath("Teste/Vistoria", "/Vistorias/foto.jpg"));
});

test("aceita o caminho completo da foto e recusa sair da pasta", () => {
  assert.equal(
    resolvePhotoPath("Teste/Vistoria", "Teste/Vistoria/Mangueira IBGE/Sala/1.1.1.jpg"),
    "Teste/Vistoria/Mangueira IBGE/Sala/1.1.1.jpg",
  );
  assert.equal(resolvePhotoPath("Teste/Vistoria", "Vistorias/Sala/1.1.1.jpg"), "Teste/Vistoria/Vistorias/Sala/1.1.1.jpg");
  assert.throws(() => resolvePhotoPath("Teste/Vistoria", "Teste/Vistoria/../secreto.jpg"));
});

test("codifica cada pedaço do caminho para o Graph", () => {
  assert.equal(graphItemPath("Teste/Vistoria/Sala/1.1.5.jpg"), "Teste/Vistoria/Sala/1.1.5.jpg");
});
