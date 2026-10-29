import { gravarFotosDaCelula } from "@shared/accounts";
import { nomeDoEmpreendimento } from "@shared/catalog";
import { modeloDe } from "@shared/checklist";
import { baixarPlanilha } from "@shared/excel";
import { nomePavimento, quandoAssinou } from "@shared/labels";
import { localDaUnidade, statusVistoria, type PainelData, type RespostaRemota, type VistoriaRemota } from "@shared/painel";
import { arquivoDaCamera, marcarFotoEnviada, stagePhoto, usarFotosParadas } from "@shared/photos";
import { sharePointPhotoPath } from "@shared/paths";
import { rotuloRevisao } from "@shared/revisao";
import type { Escopo, Inspection } from "@shared/types";
import { ArrowLeft, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { type ReactNode, useState } from "react";
import rodape from "@shared/marca/rodape.jpg";
import topo from "@shared/marca/topo-logo.jpg";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DecisaoDaVistoria } from "../components/DecisaoDaVistoria";
import { FotoDaVistoria } from "../components/FotoDaVistoria";
import { ExcluirVistoria } from "../components/ExcluirVistoria";
import { usePainel } from "../data";
import { baixarPdf } from "@shared/pdf";

function Folha({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <article className={`folha ${className}`.trim()}>
      <header className="folha-cabeca">
        <div className="folha-resumo">
          <div className="folha-quem">
            <p className="kicker">Dimensional · Relatório de vistoria de unidades</p>
            <h1>Resumo da revisão</h1>
          </div>
        </div>
        <img className="timbre-topo" src={topo} alt="Dimensional Engenharia" />
      </header>
      {children}
      <img className="timbre-rodape" src={rodape} alt="Certificações Dimensional" />
    </article>
  );
}

function horaCurta(valor: string) {
  const hora = valor.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(hora) ? hora : valor;
}

function dataCurta(valor: string) {
  const dia = valor.slice(0, 10);
  const [ano, mes, d] = dia.split("-");
  if (ano && mes && d && ano.length === 4) return `${d}/${mes}/${ano}`;
  return valor || "—";
}

function chaveDaUnidade(data: PainelData, vistoria: VistoriaRemota) {
  const local = localDaUnidade(data, vistoria.unidade_id);
  const lugar = nomeDoEmpreendimento(local.condominio?.nome || vistoria.empreendimento || "");
  const bloco = local.bloco?.numero || vistoria.bloco || "";
  const apto = vistoria.escopo === "escada" ? `escada:${vistoria.pavimento || ""}` : local.unidade?.numero || vistoria.apartamento || "";
  return `${lugar}|${bloco}|${apto}|${vistoria.escopo || "unidade"}`;
}

function respostaDoComodo(respostas: RespostaRemota[], codigo: string, comodo: { id: string; nome: string }) {
  return respostas.find((item) => {
    if (item.codigo !== codigo) return false;
    const texto = (item.comodo || "").trim().toLocaleLowerCase("pt-BR");
    return texto === comodo.id || texto === comodo.nome.toLocaleLowerCase("pt-BR");
  });
}

function fotosDaCelula(resposta?: RespostaRemota) {
  const lista = [...(resposta?.fotos || []), resposta?.sharepoint_path || ""].map((item) => item.trim()).filter(Boolean);
  return [...new Set(lista)];
}

function textoDaCelula(resposta?: RespostaRemota) {
  if (!resposta) return "";
  const marca = resposta.marca.toUpperCase();
  const notas = [resposta.observacao, ...(resposta.anotacoes || [])].map((item) => item.trim()).filter(Boolean);
  const unicas = [...new Set(notas)];
  if (marca === "NC") return unicas.join("\n") || "NC";
  if (marca === "C" || marca === "NA") return marca;
  return "";
}

type MarcaFiltro = "C" | "NC" | "NA";

function marcaAceita(marca: string, marcas: MarcaFiltro[]) {
  const valor = marca.toUpperCase();
  return (valor === "C" || valor === "NC" || valor === "NA") && marcas.includes(valor);
}

function GradeDaRevisao({
  escopo,
  respostas,
  marcas,
  origem,
  onSalvar,
}: {
  escopo: Escopo;
  respostas: RespostaRemota[];
  marcas: MarcaFiltro[];
  origem: Pick<Inspection, "empreendimento" | "tipologia" | "bloco" | "unidade" | "data" | "revisao" | "escopo" | "pavimento">;
  onSalvar: (codigo: string, comodo: string, mark: string, observacao: string, fotos: { sharepointPath: string; observacao?: string }[]) => Promise<void>;
}) {
  const modelo = modeloDe(escopo);
  const blocos = modelo.disciplinas
    .map((disciplina) => ({
      ...disciplina,
      itens: disciplina.itens.filter((item) =>
        modelo.comodos.some((comodo) => marcaAceita(respostaDoComodo(respostas, item.codigo, comodo)?.marca || "", marcas)),
      ),
    }))
    .filter((disciplina) => disciplina.itens.length > 0);
  if (!blocos.length) return <p className="empty">Nenhum item com esse filtro nesta revisão.</p>;
  return (
    <div className="relatorio-grade">
      {blocos.map((disciplina) => (
        <section key={disciplina.id} className="folha">
          <h2>{disciplina.nome}</h2>
          <table className="planilha grade">
            <thead>
              <tr>
                <th className="item">Item a verificar</th>
                <th>Critério</th>
                {modelo.comodos.map((comodo) => (
                  <th key={comodo.id}>{comodo.nome}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {disciplina.itens.map((item) => {
                const salas = modelo.comodos.map((comodo) => respostaDoComodo(respostas, item.codigo, comodo));
                const temNc = salas.some((sala) => sala?.marca.toUpperCase() === "NC");
                return (
                  <tr key={item.codigo} className={temNc ? "nc" : ""}>
                    <td className="item">
                      <strong>{item.texto}</strong>
                    </td>
                    <td>{item.criterio}</td>
                    {modelo.comodos.map((comodo) => {
                      const sala = respostaDoComodo(respostas, item.codigo, comodo);
                      const visivel = marcaAceita(sala?.marca || "", marcas);
                      return (
                        <td key={comodo.id} className="comodo-celula">
                          {visivel ? (
                            <CelulaDeFotos
                              sala={sala}
                              categoria={disciplina.nome}
                              codigo={item.codigo}
                              comodo={comodo.id}
                              origem={origem}
                              onSalvar={onSalvar}
                            />
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function CelulaDeFotos({
  sala,
  categoria,
  codigo,
  comodo,
  origem,
  onSalvar,
}: {
  sala?: RespostaRemota;
  categoria: string;
  codigo: string;
  comodo: string;
  origem: Pick<Inspection, "empreendimento" | "tipologia" | "bloco" | "unidade" | "data" | "revisao" | "escopo" | "pavimento">;
  onSalvar: (codigo: string, comodo: string, mark: string, observacao: string, fotos: { sharepointPath: string; observacao?: string }[]) => Promise<void>;
}) {
  const fotos = fotosDaCelula(sala);
  const notas = sala?.anotacoes || [];
  const fotosParadas = usarFotosParadas();
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const texto = textoDaCelula(sala);

  async function gravar(proximas: { sharepointPath: string; observacao?: string }[], observacao = sala?.observacao || "") {
    setOcupado(true);
    setAviso("");
    try {
      await onSalvar(codigo, comodo, sala?.marca || "NC", observacao, proximas);
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "Não foi possível salvar a foto.");
    } finally {
      setOcupado(false);
    }
  }

  async function adicionar(file: File) {
    const extra = fotos.length === 0 ? "" : String(Date.now());
    const path = sharePointPhotoPath(origem, "", codigo, "jpg", extra, comodo, categoria);
    const enviada = await stagePhoto(file, path);
    const lista = fotos.map((caminho, indice) => ({ sharepointPath: caminho, observacao: notas[indice] || "" }));
    await gravar([...lista, { sharepointPath: enviada.sharepointPath, observacao: "" }]);
    if (enviada.warning) setAviso(enviada.warning);
  }

  return (
    <div className="celula-fotos">
      {fotos.map((caminho, indice) => (
        <figure key={caminho}>
          <FotoDaVistoria path={caminho} />
          {fotosParadas.includes(caminho) ? <small className="no-print">Falta enviar para a pasta</small> : null}
          {notas[indice] ? <small>{notas[indice]}</small> : null}
          <button
            type="button"
            className="foto-remover no-print"
            disabled={ocupado}
            onClick={() => {
              marcarFotoEnviada(caminho);
              void gravar(fotos.flatMap((item, ordem) => (item === caminho ? [] : [{ sharepointPath: item, observacao: notas[ordem] || "" }])));
            }}
          >
            Remover
          </button>
        </figure>
      ))}
      {texto === "C" || texto === "NA" ? <strong>{texto}</strong> : null}
      {texto && texto !== "C" && texto !== "NA" ? <small>{texto}</small> : null}
      <label className={`foto-adicionar no-print${ocupado ? " ocupado" : ""}`}>
        {ocupado ? "Enviando..." : "Adicionar foto"}
        <input
          type="file"
          accept="image/*"
          disabled={ocupado}
          onChange={(event) => {
            const input = event.currentTarget;
            void arquivoDaCamera(input).then((file) => {
              if (file) void adicionar(file);
              else setAviso("A foto não chegou. Tente outra vez.");
            });
          }}
        />
      </label>
      {aviso ? <small className="no-print">{aviso}</small> : null}
    </div>
  );
}

function textoDaUnidade(data: PainelData, vistoria: VistoriaRemota) {
  const { unidade, bloco } = localDaUnidade(data, vistoria.unidade_id);
  const blocoTexto = bloco ? `Bloco ${bloco.numero}` : vistoria.bloco ? `Bloco ${vistoria.bloco}` : "Bloco";
  if (vistoria.escopo === "escada") return `${blocoTexto} · ${nomePavimento(vistoria.pavimento) || "Escada e hall"}`;
  const apto = unidade ? `Apto ${unidade.numero}` : vistoria.apartamento ? `Apto ${vistoria.apartamento}` : "Unidade";
  return `${blocoTexto} · ${apto}`;
}

export function RelatorioPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, loading, reload } = usePainel();
  const resumo = params.get("resumo") === "1";
  const [gerando, setGerando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [erroExcel, setErroExcel] = useState("");
  const [marcas, setMarcas] = useState<MarcaFiltro[]>(["C", "NC", "NA"]);
  if (loading || !data) return <main className="canvas"><p className="lead">Carregando o Supabase...</p></main>;

  const vistoria = data.vistorias.find((item) => item.id === id);
  if (!vistoria) {
    return (
      <main className="canvas">
        <section className="empty-card">
          <h2>Vistoria não encontrada</h2>
          <p>Esse registro não está no Supabase.</p>
          <Link to="/unidades" className="open">Voltar às vistorias</Link>
        </section>
      </main>
    );
  }

  const chave = chaveDaUnidade(data, vistoria);
  const revisoes = data.vistorias
    .filter((item) => chaveDaUnidade(data, item) === chave)
    .sort((a, b) => (Number(a.revisao) || 0) - (Number(b.revisao) || 0) || a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  const rotulo = (item: VistoriaRemota) => `Revisão ${rotuloRevisao(item.revisao)}`;
  const { condominio } = localDaUnidade(data, vistoria.unidade_id);
  const lugar = nomeDoEmpreendimento(condominio?.nome || vistoria.empreendimento || "Sem condomínio");

  if (!resumo) {
    return (
      <main className="canvas relatorio">
        <div className="relatorio-tools no-print">
          <Link to={`/unidades/${vistoria.id}`} className="back">
            <ArrowLeft size={16} />
            Vistoria
          </Link>
        </div>
        <header className="sheet dossier-head">
          <div>
            <p className="kicker">{lugar}</p>
            <h1>Revisões</h1>
            <p className="lead">{textoDaUnidade(data, vistoria)}</p>
          </div>
        </header>
        <ul className="revisoes">
          {revisoes.map((item) => {
            const status = statusVistoria(item.status, item.parecer, item.assinatura, item.situacao);
            return (
              <li key={item.id}>
                <Link to={`/unidades/${item.id}/relatorio?resumo=1`}>
                  <strong>{rotulo(item)}</strong>
                  <span>
                    <em className={`tag ${status.tone}`}>{status.label}</em>
                    <small>{status.detalhe}</small>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    );
  }

  const status = statusVistoria(vistoria.status, vistoria.parecer, vistoria.assinatura, vistoria.situacao);
  const horario = [horaCurta(vistoria.hora_inicio), horaCurta(vistoria.hora_fim)].filter(Boolean).join(" – ");
  const decisao = vistoria.parecer === "aprovada" ? "Aprovada" : vistoria.parecer === "reprovada" ? "Reprovada" : "";
  const quando = quandoAssinou(vistoria.parecerEm || "");
  const nome = vistoria.assinante || "—";
  const ficha = vistoria;
  const painel = data;

  async function exportar() {
    setGerando(true);
    setErroExcel("");
    try {
      const escopo: Escopo = ficha.escopo === "escada" ? "escada" : "unidade";
      const respostas = painel.respostas.filter((item) => item.vistoria_id === ficha.id && marcaAceita(item.marca, marcas));
      await baixarPlanilha({
        empreendimento: lugar,
        data: dataCurta(ficha.data),
        vistoriador: ficha.vistoriador || "—",
        horario: horario || "—",
        unidade: textoDaUnidade(painel, ficha),
        revisao: rotuloRevisao(ficha.revisao),
        marcas,
        situacao: `${status.label} · ${status.detalhe}`,
        decisao: decisao ? [decisao, quando, nome].filter(Boolean).join(" · ") : "—",
        responsavelObra: ficha.responsavelObra || "—",
        assinatura: ficha.assinatura,
        assinante: ficha.assinante,
        escopo,
        respostas: respostas.map((item) => ({
          codigo: item.codigo,
          comodo: item.comodo,
          marca: item.marca,
          observacao: item.observacao,
          gravidade: item.gravidade,
          foto: item.sharepoint_path,
          fotos: item.fotos,
          anotacoes: item.anotacoes,
        })),
      });
    } catch {
      setErroExcel("Não foi possível gerar o Excel.");
    } finally {
      setGerando(false);
    }
  }

  const local = localDaUnidade(painel, ficha.unidade_id);
  const origemDaFicha = {
    empreendimento: local.condominio?.nome || ficha.empreendimento || lugar,
    tipologia: "apartamento" as const,
    bloco: local.bloco?.numero || ficha.bloco || "",
    unidade: ficha.escopo === "escada" ? "" : local.unidade?.numero || ficha.apartamento || "",
    data: (ficha.data || "").slice(0, 10),
    revisao: rotuloRevisao(ficha.revisao),
    escopo: ficha.escopo === "escada" ? ("escada" as const) : ("unidade" as const),
    pavimento: ficha.pavimento || "",
  };

  async function salvarCelula(codigo: string, comodo: string, mark: string, observacao: string, fotos: { sharepointPath: string; observacao?: string }[]) {
    await gravarFotosDaCelula(ficha.id, { codigo, comodo, mark, observacao, fotos });
    await reload();
  }

  async function gerarPdf() {
    setGerandoPdf(true);
    setErroExcel("");
    try {
      const escopo: Escopo = origemDaFicha.escopo;
      const modelo = modeloDe(escopo);
      const respostas = painel.respostas.filter((item) => item.vistoria_id === ficha.id);
      const blocos = modelo.disciplinas
        .map((disciplina) => ({
          nome: disciplina.nome,
          itens: disciplina.itens
            .filter((item) => modelo.comodos.some((comodo) => marcaAceita(respostaDoComodo(respostas, item.codigo, comodo)?.marca || "", marcas)))
            .map((item) => ({
              texto: item.texto,
              criterio: item.criterio,
              salas: modelo.comodos.map((comodo) => {
                const sala = respostaDoComodo(respostas, item.codigo, comodo);
                if (!marcaAceita(sala?.marca || "", marcas)) return { texto: "", fotos: [] };
                return { texto: textoDaCelula(sala), fotos: fotosDaCelula(sala), nc: sala?.marca.toUpperCase() === "NC" };
              }),
            })),
        }))
        .filter((bloco) => bloco.itens.length > 0);
      const unidade = textoDaUnidade(painel, ficha);
      await baixarPdf({
        arquivo: `${unidade.replace(/[^\w]+/g, "-")}-Rev-${rotuloRevisao(ficha.revisao)}.pdf`,
        comodos: modelo.comodos.map((comodo) => comodo.nome),
        campos: [
          ["Empreendimento", lugar],
          ["Data de vistoria", dataCurta(ficha.data)],
          ["Realizado por", ficha.vistoriador || "—"],
          ["Horário", horario || "—"],
          ["Unidade", unidade],
          ["Revisão", rotuloRevisao(ficha.revisao)],
          ["Situação", `${status.label} · ${status.detalhe}`],
          ["Decisão", decisao ? [decisao, quando, nome].filter(Boolean).join(" · ") : "—"],
          ["Responsável", ficha.responsavelObra || "—"],
        ],
        assinatura: ficha.assinatura,
        blocos,
      });
    } catch {
      setErroExcel("Não foi possível gerar o PDF.");
    } finally {
      setGerandoPdf(false);
    }
  }

  return (
    <main className="canvas relatorio">
      <div className="relatorio-tools no-print">
        <Link to={`/unidades/${vistoria.id}/relatorio`} className="back">
          <ArrowLeft size={16} />
          Revisões
        </Link>
        <div className="relatorio-botoes">
          <ExcluirVistoria id={vistoria.id} onDeleted={() => navigate("/unidades")} />
          <button type="button" className="btn-ghost" disabled={gerando} onClick={() => void exportar()}>
            <FileSpreadsheet size={16} />
            {gerando ? "Gerando Excel..." : "Exportar Excel"}
          </button>
          <button type="button" className="btn-ghost" disabled={gerandoPdf} onClick={() => void gerarPdf()}>
            <FileText size={16} />
            {gerandoPdf ? "Gerando PDF..." : "Gerar PDF"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => window.print()}>
            <Printer size={16} />
            Imprimir
          </button>
        </div>
        <div className="filtro-marcas">
          <span>Mostrar</span>
          {(["C", "NC", "NA"] as MarcaFiltro[]).map((marca) => (
            <label key={marca} className={marcas.includes(marca) ? "ativo" : ""}>
              <input
                type="checkbox"
                checked={marcas.includes(marca)}
                onChange={() => setMarcas((atual) => (atual.includes(marca) ? atual.filter((item) => item !== marca) : [...atual, marca]))}
              />
              {marca}
            </label>
          ))}
        </div>
      </div>
      {erroExcel ? <p className="pending-note no-print">{erroExcel}</p> : null}
      <Folha>
        <dl className="ficha">
          <div>
            <dt>Empreendimento</dt>
            <dd>{lugar}</dd>
          </div>
          <div>
            <dt>Data de vistoria</dt>
            <dd>{dataCurta(vistoria.data)}</dd>
          </div>
          <div>
            <dt>Realizado por</dt>
            <dd>{vistoria.vistoriador || "—"}</dd>
          </div>
          <div>
            <dt>Horário</dt>
            <dd>{horario || "—"}</dd>
          </div>
          <div>
            <dt>Unidade</dt>
            <dd>{textoDaUnidade(data, vistoria)}</dd>
          </div>
          <div>
            <dt>Revisão</dt>
            <dd>{rotulo(vistoria)}</dd>
          </div>
          <div>
            <dt>Situação</dt>
            <dd>{status.label} · {status.detalhe}</dd>
          </div>
          <div>
            <dt>{decisao || "Decisão"}</dt>
            <dd>
              {decisao ? (
                <>
                  <span>{[decisao, quando, nome].filter(Boolean).join(" · ")}</span>
                  {vistoria.assinatura?.startsWith("data:image") ? (
                    <img className="ficha-assinatura" src={vistoria.assinatura} alt={`Assinatura de ${nome}`} />
                  ) : null}
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt>Responsável</dt>
            <dd>{vistoria.responsavelObra || "—"}</dd>
          </div>
        </dl>
      </Folha>
      <GradeDaRevisao
        escopo={ficha.escopo === "escada" ? "escada" : "unidade"}
        respostas={painel.respostas.filter((item) => item.vistoria_id === ficha.id)}
        marcas={marcas}
        origem={origemDaFicha}
        onSalvar={salvarCelula}
      />
      <DecisaoDaVistoria id={vistoria.id} parecer={vistoria.parecer} situacao={vistoria.situacao} responsavel={vistoria.responsavelObra} assinatura={vistoria.assinatura} />
    </main>
  );
}
