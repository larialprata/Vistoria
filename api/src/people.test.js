import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkPassword, createPeopleStore, hashPassword } from "./people.js";
import { retornoDoOutlook, voltaPermitida } from "./outlook.js";

test("a senha conferida não guarda o texto puro", () => {
  const stored = hashPassword("segredo");
  assert.equal(stored.includes("segredo"), false);
  assert.equal(checkPassword("segredo", stored), true);
  assert.equal(checkPassword("outra", stored), false);
});

test("o acesso pedido é respeitado e só o administrador vem marcado", () => {
  const store = createPeopleStore(join(mkdtempSync(join(tmpdir(), "vistoria-")), "pessoas.json"));
  const created = store.add({ nome: "Ana Lima", email: "ana@dimensional.com", senha: "123456", acesso: "app" });
  assert.equal(created.person.acesso, "app");
  assert.equal(created.person.administrador, false);
  const admin = store.add({
    nome: "Admin",
    email: "admin@dimensional.com",
    senha: "123456",
    acesso: "ambos",
    administrador: true,
  });
  assert.equal(admin.person.administrador, true);
  const web = store.login({ email: "admin@dimensional.com", senha: "123456", onde: "web" });
  assert.equal(web.conta.administrador, true);
  store.add({ nome: "Bruno", email: "bruno@dimensional.com", senha: "123456", acesso: "web" });
  const blocked = store.login({ email: "bruno@dimensional.com", senha: "123456", onde: "app" });
  assert.equal(blocked.status, 403);
  const limited = store.add({
    nome: "Clara",
    email: "clara@dimensional.com",
    senha: "123456",
    acesso: "web",
    paginas: ["painel", "obras", "inexistente"],
  });
  assert.deepEqual(limited.person.paginas, ["painel", "obras"]);
  const promoted = store.update(limited.person.id, { acesso: "ambos", administrador: true, paginas: [] });
  assert.equal(promoted.person.administrador, true);
  assert.deepEqual(promoted.person.paginas, ["painel", "vistorias", "obras", "configuracoes"]);
  assert.equal(promoted.person.assinarVistoria, true);
  const marcado = store.update(promoted.person.id, {
    acesso: "ambos",
    administrador: true,
    paginas: [],
    assinarVistoria: false,
    assinarObra: true,
  });
  assert.equal(marcado.person.administrador, true);
  assert.equal(marcado.person.assinarVistoria, false);
  assert.equal(marcado.person.assinarObra, true);
  const last = store.update(admin.person.id, { acesso: "web", administrador: false, paginas: ["painel"] });
  assert.equal(last.error, undefined);
  const stuck = store.update(promoted.person.id, { acesso: "web", administrador: false, paginas: ["painel"] });
  assert.equal(stuck.status, 400);
});

test("a conta principal e o último administrador não são excluídos", () => {
  const store = createPeopleStore(join(mkdtempSync(join(tmpdir(), "vistoria-")), "pessoas.json"));
  const principal = store.add({
    nome: "Administrador",
    email: "admin@exemplo.com",
    senha: "123456",
    acesso: "ambos",
    administrador: true,
  });
  const outra = store.add({ nome: "Ana Lima", email: "ana@dimensional.com", senha: "123456", acesso: "app" });
  assert.equal(store.drop(principal.person.id).status, 400);
  assert.equal(store.drop(outra.person.id).error, undefined);
  assert.equal(store.list().some((person) => person.email === "ana@dimensional.com"), false);
  const outro = store.add({
    nome: "Bruno",
    email: "bruno@dimensional.com",
    senha: "123456",
    acesso: "ambos",
    administrador: true,
  });
  assert.equal(store.drop(outro.person.id).error, undefined);
  assert.equal(store.drop(principal.person.id).status, 400);
  const solo = createPeopleStore(join(mkdtempSync(join(tmpdir(), "vistoria-")), "pessoas.json"));
  const unico = solo.add({
    nome: "Bruno",
    email: "bruno@dimensional.com",
    senha: "123456",
    acesso: "ambos",
    administrador: true,
  });
  assert.equal(solo.drop(unico.person.id).status, 400);
});

test("o outlook só entra no endereço da vistoria e com e-mail já liberado", () => {
  assert.equal(voltaPermitida("https://vistoria.dimensionalengenharia.com/"), "https://vistoria.dimensionalengenharia.com/");
  assert.equal(voltaPermitida("http://localhost:5178/"), "http://localhost:5178/");
  assert.equal(voltaPermitida("https://exemplo.com/"), "");
  assert.equal(
    retornoDoOutlook("http://localhost:5178/", "127.0.0.1:8787"),
    "http://localhost:5178/entrar/outlook/retorno",
  );
  assert.equal(
    retornoDoOutlook("https://vistoria.dimensionalengenharia.com/", "127.0.0.1:8787"),
    "https://vistoria.dimensionalengenharia.com/api/entrar/outlook/retorno",
  );
  const store = createPeopleStore(join(mkdtempSync(join(tmpdir(), "vistoria-")), "pessoas.json"));
  store.add({ nome: "Ana", email: "ana@dimensionalengenharia.com", senha: "local-123", acesso: "ambos" });
  const certa = store.entrarComEmpresa({ email: "ana@dimensionalengenharia.com", nome: "Ana Lima", onde: "web" });
  assert.equal(certa.conta.nome, "Ana Lima");
  const faltando = store.entrarComEmpresa({ email: "outro@dimensionalengenharia.com", nome: "Outro", onde: "web" });
  assert.equal(faltando.status, 403);
});

test("entrar de novo no aplicativo não derruba a sessão do painel", () => {
  const store = createPeopleStore(join(mkdtempSync(join(tmpdir(), "vistoria-")), "pessoas.json"));
  store.add({
    nome: "Administrador",
    email: "admin@exemplo.com",
    senha: "123456",
    acesso: "ambos",
    administrador: true,
  });
  const painel = store.login({ email: "admin@exemplo.com", senha: "123456", onde: "web" });
  const app = store.login({ email: "admin@exemplo.com", senha: "123456", onde: "app" });
  assert.notEqual(painel.conta.token, app.conta.token);
  assert.equal(store.session(painel.conta.token)?.email, "admin@exemplo.com");
  assert.equal(store.session(app.conta.token)?.email, "admin@exemplo.com");
});
