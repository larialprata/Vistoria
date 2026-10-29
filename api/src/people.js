import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { deletePersonInDatabase, listPeopleInDatabase, registerAdminSession, savePersonInDatabase, updatePersonInDatabase } from "./people-db.js";
import { guardarSessaoSupabase } from "./supabase-sessao.js";
import { concluirLoginOutlook, criarLoginOutlook, encerrarLoginOutlook, retornoDoOutlook, voltaPermitida } from "./outlook.js";

const ACESSO = new Set(["web", "app", "ambos"]);
const PAGINAS = ["painel", "vistorias", "obras", "configuracoes"];

export function hashPassword(senha) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function checkPassword(senha, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(senha, salt, 32);
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

export function createPeopleStore(filePath) {
  function read() {
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function write(people) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(people, null, 2));
  }

  function pagesOf(person) {
    if (person.administrador) return [...PAGINAS];
    if (!Array.isArray(person.paginas)) return [...PAGINAS];
    return [...new Set(person.paginas.filter((id) => PAGINAS.includes(id)))];
  }

  function assinaturaDe(person, campo) {
    if (typeof person[campo] === "boolean") return person[campo];
    return Boolean(person.administrador);
  }

  function publicPerson(person) {
    return {
      id: person.id,
      nome: person.nome,
      email: person.email,
      acesso: person.acesso,
      administrador: Boolean(person.administrador),
      paginas: pagesOf(person),
      visualizar: assinaturaDe(person, "visualizar"),
      assinarVistoria: assinaturaDe(person, "assinarVistoria"),
      assinarObra: assinaturaDe(person, "assinarObra"),
    };
  }

  function remembered(person) {
    const tokens = Array.isArray(person.tokens) ? person.tokens.filter(Boolean) : [];
    if (person.token && !tokens.includes(person.token)) tokens.push(person.token);
    return tokens;
  }

  function remember(person, token) {
    const tokens = remembered(person).filter((item) => item !== token);
    tokens.push(token);
    person.token = token;
    person.tokens = tokens.slice(-8);
  }

  function byToken(token) {
    if (!token) return null;
    return read().find((person) => remembered(person).includes(token)) || null;
  }

  return {
    list: () => read().map(publicPerson),
    session(token) {
      const person = byToken(token);
      if (!person) return null;
      return { ...publicPerson(person), token: person.token };
    },
    empty: () => read().length === 0,
    findToken: byToken,
    add({ nome, email, senha, acesso, administrador, paginas, visualizar, assinarVistoria, assinarObra }) {
      const people = read();
      const cleanEmail = String(email || "").trim().toLowerCase();
      const cleanNome = String(nome || "").trim();
      const cleanAcesso = acesso;
      const isAdmin = Boolean(administrador);
      if (!cleanNome) return { error: "Informe o nome.", status: 400 };
      if (!cleanEmail.includes("@")) return { error: "Informe um e-mail válido.", status: 400 };
      if (String(senha || "").length < 6) return { error: "A senha precisa ter pelo menos 6 caracteres.", status: 400 };
      if (!ACESSO.has(cleanAcesso)) return { error: "Escolha se a pessoa usa a web, o app ou os dois.", status: 400 };
      if (isAdmin && cleanAcesso === "app") return { error: "O administrador precisa entrar no painel.", status: 400 };
      if (people.some((person) => person.email === cleanEmail)) {
        return { error: "Esse e-mail já está cadastrado.", status: 409 };
      }
      const person = {
        id: randomBytes(8).toString("hex"),
        nome: cleanNome,
        email: cleanEmail,
        acesso: cleanAcesso,
        administrador: isAdmin,
        paginas: isAdmin || cleanAcesso === "app" ? [...PAGINAS] : pagesOf({ administrador: false, paginas }).filter((id) => id !== "configuracoes"),
        ...(typeof visualizar === "boolean" ? { visualizar } : {}),
        ...(typeof assinarVistoria === "boolean" ? { assinarVistoria } : {}),
        ...(typeof assinarObra === "boolean" ? { assinarObra } : {}),
        senhaHash: hashPassword(senha),
        token: "",
      };
      people.push(person);
      write(people);
      return { person: publicPerson(person) };
    },
    remove(id) {
      write(read().filter((person) => person.id !== id));
    },
    drop(id) {
      const people = read();
      const person = people.find((item) => item.id === id);
      if (!person) return { error: "Usuário não encontrado.", status: 404 };
      if (person.email === "admin@exemplo.com") {
        return { error: "A conta principal não pode ser excluída.", status: 400 };
      }
      if (person.administrador && !people.some((item) => item.id !== person.id && item.administrador)) {
        return { error: "Tem que restar pelo menos um administrador.", status: 400 };
      }
      write(people.filter((item) => item.id !== id));
      return { person: publicPerson(person) };
    },
    update(id, { acesso, administrador, paginas, visualizar, assinarVistoria, assinarObra }) {
      const people = read();
      const person = people.find((item) => item.id === id);
      if (!person) return { error: "Usuário não encontrado.", status: 404 };
      if (!ACESSO.has(acesso)) return { error: "Escolha se a pessoa usa a web, o app ou os dois.", status: 400 };
      const isAdmin = Boolean(administrador);
      if (isAdmin && acesso === "app") return { error: "O administrador precisa entrar no painel.", status: 400 };
      if (person.administrador && !isAdmin && !people.some((item) => item.id !== person.id && item.administrador)) {
        return { error: "Tem que restar pelo menos um administrador.", status: 400 };
      }
      person.acesso = acesso;
      person.administrador = isAdmin;
      person.paginas = isAdmin || acesso === "app" ? [...PAGINAS] : pagesOf({ administrador: false, paginas }).filter((id) => id !== "configuracoes");
      if (typeof visualizar === "boolean") person.visualizar = visualizar;
      if (typeof assinarVistoria === "boolean") person.assinarVistoria = assinarVistoria;
      if (typeof assinarObra === "boolean") person.assinarObra = assinarObra;
      write(people);
      return { person: publicPerson(person) };
    },
    login({ email, senha, onde }) {
      const people = read();
      if (people.length === 0) return { error: "Ninguém foi cadastrado ainda. Peça a um administrador.", status: 409 };
      const person = people.find((item) => item.email === String(email || "").trim().toLowerCase());
      if (!person || !checkPassword(senha, person.senhaHash)) {
        return { error: "E-mail ou senha incorretos.", status: 401 };
      }
      if (onde === "app" && person.acesso === "web") {
        return { error: "Essa pessoa só pode entrar no painel.", status: 403 };
      }
      if (onde === "web" && person.acesso === "app") {
        return { error: "Essa pessoa só pode entrar no aplicativo.", status: 403 };
      }
      remember(person, randomBytes(24).toString("hex"));
      write(people);
      return { conta: { ...publicPerson(person), token: person.token } };
    },
    entrarComEmpresa({ email, nome, onde }) {
      const people = read();
      const person = people.find((item) => item.email === String(email || "").trim().toLowerCase());
      if (!person) return { error: "Peça a um administrador para liberar este e-mail na vistoria.", status: 403 };
      if (onde === "app" && person.acesso === "web") {
        return { error: "Essa pessoa só pode entrar no painel.", status: 403 };
      }
      if (onde === "web" && person.acesso === "app") {
        return { error: "Essa pessoa só pode entrar no aplicativo.", status: 403 };
      }
      const nomeEmpresa = String(nome || "").trim();
      if (nomeEmpresa.length > 1) person.nome = nomeEmpresa;
      remember(person, randomBytes(24).toString("hex"));
      write(people);
      return { conta: { ...publicPerson(person), token: person.token } };
    },
    changePassword(token, { senhaAtual, senhaNova }) {
      const people = read();
      const person = people.find((item) => remembered(item).includes(token));
      if (!person) return { error: "Entre de novo para trocar a senha.", status: 401 };
      if (!checkPassword(senhaAtual, person.senhaHash)) return { error: "A senha atual não confere.", status: 401 };
      if (String(senhaNova || "").length < 6) return { error: "A nova senha precisa ter pelo menos 6 caracteres.", status: 400 };
      person.senhaHash = hashPassword(senhaNova);
      write(people);
      return { ok: true };
    },
  };
}

function databaseError(error) {
  return error instanceof Error ? error.message : "Não foi possível salvar o usuário no banco.";
}

export function attachPeople(app, store, config) {
  function tokenOf(req) {
    const header = req.headers.authorization || "";
    return header.startsWith("Bearer ") ? header.slice(7) : "";
  }

  function canManage(req, res) {
    const person = store.findToken(tokenOf(req));
    if (!person) {
      res.status(401).json({ error: "Entre como administrador para cadastrar pessoas." });
      return null;
    }
    if (!person.administrador) {
      res.status(403).json({ error: "Só um administrador pode cadastrar pessoas." });
      return null;
    }
    return person;
  }

  app.get("/estado", (_req, res) => {
    res.json({ vazio: store.empty() });
  });

  app.get("/entrar/outlook", (req, res) => {
    const origem = `${req.protocol}://${req.get("host")}`;
    const redirectUri = retornoDoOutlook(req.query.voltar, req.get("host") || "");
    if (!redirectUri) {
      res.status(400).json({ error: "Endereço de retorno inválido." });
      return;
    }
    const onde = req.query.onde === "app" ? "app" : "web";
    const voltar = voltaPermitida(req.query.voltar) || (onde === "app" ? `${origem}/` : `${origem}/`);
    const login = criarLoginOutlook(config, { onde, voltar, redirectUri });
    if (login.error) {
      res.redirect(`${voltar}?erro=${encodeURIComponent(login.error)}`);
      return;
    }
    res.redirect(login.url);
  });

  app.get("/entrar/outlook/retorno", async (req, res) => {
    const falha = String(req.query.error_description || req.query.error || "");
    if (!req.query.code || !req.query.state || falha) {
      const voltar = encerrarLoginOutlook(String(req.query.state || "")) || "/";
      const mensagem = falha.includes("AADSTS50011")
        ? "O Outlook ainda não aceita o endereço de retorno deste login."
        : "Não foi possível entrar com o Outlook.";
      res.redirect(`${voltar}?erro=${encodeURIComponent(mensagem)}`);
      return;
    }
    const outlook = await concluirLoginOutlook(config, { code: String(req.query.code), state: String(req.query.state) });
    const voltar = outlook.voltar || "/";
    if (outlook.error) {
      res.redirect(`${voltar}?erro=${encodeURIComponent(outlook.error)}`);
      return;
    }
    const result = store.entrarComEmpresa({ email: outlook.email, nome: outlook.nome, onde: outlook.onde });
    if (result.error) {
      res.redirect(`${voltar}?erro=${encodeURIComponent(result.error)}`);
      return;
    }
    res.redirect(`${voltar}#entrada=${encodeURIComponent(result.conta.token)}`);
  });

  app.post("/entrar", async (req, res) => {
    const result = store.login(req.body || {});
    if (result.error) {
      res.status(result.status).json({ error: result.error, primeiro: Boolean(result.primeiro) });
      return;
    }
    if (result.conta.administrador) {
      try {
        await registerAdminSession(config, result.conta.email, req.body?.senha, result.conta.token);
      } catch (error) {
        console.error(databaseError(error));
      }
      try {
        await guardarSessaoSupabase(config, result.conta.email, req.body?.senha);
      } catch (error) {
        console.error(databaseError(error));
      }
    }
    res.json(result.conta);
  });

  app.get("/eu", (req, res) => {
    const conta = store.session(tokenOf(req));
    if (!conta) {
      res.status(401).json({ error: "Entre de novo." });
      return;
    }
    res.json(conta);
  });

  async function pessoasVisiveis() {
    const locais = store.list();
    const remotos = await listPeopleInDatabase(config);
    const porEmail = new Map(locais.map((person) => [person.email, person]));
    for (const remoto of remotos) {
      if (!remoto.email) continue;
      const local = porEmail.get(remoto.email);
      porEmail.set(
        remoto.email,
        local
          ? {
              ...remoto,
              id: local.id,
              visualizar: local.visualizar,
              assinarVistoria: local.assinarVistoria,
              assinarObra: local.assinarObra,
            }
          : remoto,
      );
    }
    return [...porEmail.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  }

  app.get("/pessoas", async (req, res) => {
    if (!canManage(req, res)) return;
    res.json(await pessoasVisiveis());
  });

  app.post("/pessoas", async (req, res) => {
    if (!canManage(req, res)) return;
    const result = store.add(req.body || {});
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    try {
      await savePersonInDatabase(config, tokenOf(req), result.person, req.body?.senha);
    } catch (error) {
      store.remove(result.person.id);
      res.status(502).json({ error: databaseError(error) });
      return;
    }
    res.status(201).json(result.person);
  });

  app.post("/pessoas/permissoes", async (req, res) => {
    if (!canManage(req, res)) return;
    const body = req.body || {};
    const before = (await pessoasVisiveis()).find((person) => person.id === body.id);
    const result = store.update(body.id, body);
    if (result.error) {
      if (result.status === 404 && before) {
        const person = {
          ...before,
          acesso: body.acesso,
          administrador: Boolean(body.administrador),
          paginas: body.paginas,
          visualizar: typeof body.visualizar === "boolean" ? body.visualizar : Boolean(body.administrador),
          assinarVistoria: typeof body.assinarVistoria === "boolean" ? body.assinarVistoria : Boolean(body.administrador),
          assinarObra: typeof body.assinarObra === "boolean" ? body.assinarObra : Boolean(body.administrador),
        };
        try {
          await updatePersonInDatabase(config, tokenOf(req), person);
        } catch (error) {
          res.status(502).json({ error: databaseError(error) });
          return;
        }
        res.json(person);
        return;
      }
      res.status(result.status).json({ error: result.error });
      return;
    }
    try {
      await updatePersonInDatabase(config, tokenOf(req), result.person);
    } catch (error) {
      if (before) store.update(before.id, before);
      res.status(502).json({ error: databaseError(error) });
      return;
    }
    res.json(result.person);
  });

  app.post("/pessoas/excluir", async (req, res) => {
    const manager = canManage(req, res);
    if (!manager) return;
    const person = (await pessoasVisiveis()).find((item) => item.id === (req.body || {}).id);
    if (!person) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }
    if (person.email === manager.email) {
      res.status(400).json({ error: "Você não pode excluir a própria conta." });
      return;
    }
    if (person.email === "admin@exemplo.com") {
      res.status(400).json({ error: "A conta principal não pode ser excluída." });
      return;
    }
    if (person.administrador && !(await pessoasVisiveis()).some((item) => item.id !== person.id && item.administrador)) {
      res.status(400).json({ error: "Tem que restar pelo menos um administrador." });
      return;
    }
    try {
      await deletePersonInDatabase(config, tokenOf(req), person);
    } catch (error) {
      res.status(502).json({ error: databaseError(error) });
      return;
    }
    store.remove(person.id);
    res.json({ ok: true });
  });

  app.post("/senha", (req, res) => {
    const result = store.changePassword(tokenOf(req), req.body || {});
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });
}
