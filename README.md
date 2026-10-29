# Vistoria de Unidades

Sistema de vistoria de entrega para a [Dimensional Engenharia](https://github.com/dimensionalengenharia). A equipe marca o checklist no celular. O escritório acompanha a unidade, decide a revisão e gera o relatório com as fotos.

Desenvolvido por **[Larissa Prata](https://github.com/larialprata)**.

## O que o sistema faz

A vistoria deixa de depender da planilha impressa. Cada apartamento, e também a escada e o hall, tem o seu checklist, as suas fotos e a sua revisão.

- O campo marca **C** (conforme), **NC** (não conforme) ou **NA** (não se aplica).
- A foto é obrigatória só no **NC**. Cada cômodo aceita até duas fotos, e cada foto tem a própria observação.
- A escada e o hall pedem o pavimento, do primeiro ao quarto, em vez do apartamento.
- A primeira revisão é **00**. Uma revisão nova só abre quando a anterior está liberada.
- O escritório acompanha quatro situações: **Vistoria**, **Obra**, **Liberado** e **Aprovado**.
- Aprovar ou reprovar pede assinatura. Depois da assinatura, o checklist não volta a ser editado.
- O relatório sai na tela, em Excel e em PDF, com filtro **C / NC / NA**.
- Um administrador pode incluir ou remover fotos direto no relatório.

## Como as pessoas usam

1. No celular, a pessoa escolhe o empreendimento, o bloco e o apartamento, ou a escada e o pavimento.
2. Marca o checklist por disciplina e por cômodo e fotografa o que está não conforme.
3. No painel, o escritório abre a revisão, vê as fotos e a observação e decide o próximo passo.
4. **Obra** devolve o apontamento para correção. **Liberado** autoriza uma nova revisão. **Aprovado** encerra a unidade.

## Arquitetura

O repositório é um monorepo com três partes.

| Parte | Pasta | Função |
| --- | --- | --- |
| Painel | `web` | Escritório: obras, unidades, decisão e relatório |
| Campo | `pwa` | Celular: checklist, fotos e observações |
| API | `api` | Sessão, vistorias, fotos e publicação no Supabase |

```text
celular (PWA) ──┐
                ├── API ── Supabase
painel (web) ───┘         └── SharePoint
```

O Supabase guarda condomínios, unidades, pessoas e vistorias. O SharePoint guarda o arquivo da foto. O banco fica com o caminho.

As fotos entram nesta árvore:

```text
Vistorias/
└── Empreendimento/
    └── Bloco-5/
        └── Apto-403/
            └── 2026-10-29_rev-00/
                └── Esquadrias/
                    └── 1.1-sala.jpg
```

A escada usa `Pavimento-1` no lugar do apartamento. A pasta do meio é a categoria do checklist, não um número solto.

## Stack

React 19, TypeScript, Vite, Tailwind CSS 4 e React Router no painel e no PWA. A API é Express. Os relatórios usam ExcelJS e pdf-lib. Os dados ficam no Supabase e as fotos no SharePoint, pela Microsoft Graph.

## Como rodar

```bash
npm install
npm run dev:api
npm run dev:web
npm run dev:pwa
```

| App | Endereço |
| --- | --- |
| API | `http://localhost:8787` |
| Painel | `http://localhost:5178` |
| Campo | `http://localhost:5174` |

Copie os exemplos antes de subir:

```bash
cp web/.env.example web/.env
cp pwa/.env.example pwa/.env
cp api/.env.example api/.env
```

`api/.env.example` precisa existir na sua cópia local com a porta, o Supabase e o aplicativo do SharePoint. O arquivo real de ambiente, as senhas e os dados gravados não entram no Git.

| Variável | Onde | Para quê |
| --- | --- | --- |
| `VITE_API_URL` | `web`, `pwa` | Endereço da API |
| `VITE_SUPABASE_URL` | `web`, `pwa` | Projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | `web`, `pwa` | Chave pública do Supabase |
| `SUPABASE_URL` | `api` | Mesmo projeto, no servidor |
| `SUPABASE_ANON_KEY` | `api` | Chave pública, no servidor |
| `SHAREPOINT_TENANT_ID` | `api` | Tenant do aplicativo de fotos |
| `SHAREPOINT_CLIENT_ID` | `api` | Aplicativo de fotos |
| `SHAREPOINT_CLIENT_SECRET` | `api` | Segredo do aplicativo. Só no servidor |
| `SHAREPOINT_HOSTNAME` | `api` | Host do SharePoint |
| `SHAREPOINT_SITE_PATH` | `api` | Site onde as pastas moram |
| `SHAREPOINT_BASE_PATH` | `api` | Pasta base das vistorias |

## Testes

Na pasta `api`:

```bash
npm test
```

No painel e no campo, a checagem de tipos é `npx tsc --noEmit` dentro de `web` ou de `pwa`.
