"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiDelete, apiGet, Documento, ehDocumentoPdf, Municipio } from "@/lib/api";
import { CalendarIcon, CheckIcon, FolderIcon, SearchIcon, UserIcon, XIcon } from "@/components/icons";
import { EscolaIcon, Info, Miniatura, formatarData, formatarDataHora, normalizarTexto } from "@/components/DocumentoUI";
import PreviewLink from "@/components/PreviewLink";
import { MESES } from "@/lib/periodo";
import { noCicloEMes, useFiltroCiclo } from "@/lib/ciclos";
import { SeletorCiclo } from "@/components/SeletorCiclo";
import { normalizarLink } from "@/lib/linkIncorporavel";
import { BotaoExcluir } from "@/components/BotoesIcone";
import { AnaliseBadge } from "@/components/AnaliseBadge";
import { usePerfil } from "@/lib/usePerfil";

type Aba = "" | "pendente" | "aprovado" | "arquivado";
type Ordem = "recentes" | "antigos" | "data_acao";

const SELECT =
  "w-full border border-black/10 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30";

export default function MunicipioDetalhePage() {
  const { id } = useParams<{ id: string }>();
  // Coordenador do município vê só "Todos" e "Novos" e não escolhe ciclo (fica sempre no ciclo ativo)
  const { perfil } = usePerfil();
  const ehCoordenador = perfil?.role === "municipio";
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);
  const [municipio, setMunicipio] = useState<Municipio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [visualizando, setVisualizando] = useState<Documento | null>(null);

  // Filtros (padrão: ciclo ativo, todos os meses)
  const [aba, setAba] = useState<Aba>("");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const { ciclos, cicloId: filtroCiclo, setCicloId: setFiltroCiclo, ehPadrao: cicloPadrao } = useFiltroCiclo();
  const [filtroMes, setFiltroMes] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroAcao, setFiltroAcao] = useState("");
  const [filtroEscola, setFiltroEscola] = useState("");
  const [busca, setBusca] = useState("");

  // Chegando do painel com ?ciclo=<id>&mes=9, já abre filtrado
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // sem ?ciclo= na URL abre no ciclo ativo; ?ciclo=todos abre sem filtro de ciclo
    const ciclo = params.get("ciclo");
    if (ciclo !== null) {
      setFiltroCiclo(ciclo === "todos" ? "" : ciclo);
      setFiltroMes(params.get("mes") ?? "");
    }
  }, [setFiltroCiclo]);

  useEffect(() => {
    apiGet(`/api/documentos?municipio_id=${id}`)
      .then(setDocumentos)
      .catch((e) => setErro(e.message));
  }, [id]);

  useEffect(() => {
    apiGet("/api/municipios")
      .then((lista: Municipio[]) => setMunicipio(lista.find((item) => String(item.id) === String(id)) ?? null))
      .catch(() => null);
  }, [id]);

  // Esc fecha a visualização grande
  useEffect(() => {
    if (!visualizando) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setVisualizando(null);
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [visualizando]);

  // ---------- opções dos filtros ----------
  const tiposDisponiveis = useMemo(
    () => Array.from(new Map((documentos ?? []).filter((d) => d.tipos_documento?.nome).map((d) => [d.tipo_id, d.tipos_documento!.nome])).entries()),
    [documentos]
  );
  const acoesDisponiveis = useMemo(
    () => Array.from(new Map((documentos ?? []).filter((d) => d.acoes_pedagogicas?.nome).map((d) => [d.acao_pedagogica_id, d.acoes_pedagogicas!.nome])).entries()),
    [documentos]
  );
  const escolasDisponiveis = useMemo(
    () => Array.from(new Map((documentos ?? []).filter((d) => d.escolas?.nome).map((d) => [d.escola_id, d.escolas!.nome])).entries()),
    [documentos]
  );

  // ---------- filtragem ----------
  // "doFiltro" vale para todas as abas; a aba (status) é aplicada depois
  const doFiltro = useMemo(
    () =>
      (documentos ?? []).filter(
        (d) =>
          (!filtroEscola || d.escola_id === filtroEscola) &&
          (!filtroAcao || d.acao_pedagogica_id === filtroAcao) &&
          (!filtroTipo || d.tipo_id === filtroTipo) &&
          noCicloEMes(d, filtroCiclo, ciclos, filtroMes) &&
          correspondeBusca(d, busca)
      ),
    [documentos, filtroEscola, filtroAcao, filtroTipo, filtroCiclo, ciclos, filtroMes, busca]
  );

  const contagem = useMemo(
    () => ({
      pendente: doFiltro.filter((d) => d.status === "pendente").length,
      aprovado: doFiltro.filter((d) => d.status === "aprovado" && !d.arquivado).length,
      arquivado: doFiltro.filter((d) => d.arquivado).length,
      "": doFiltro.filter((d) => !d.arquivado).length,
    }),
    [doFiltro]
  );

  const lista = useMemo(() => {
    const itens = doFiltro.filter((d) =>
      aba === "arquivado" ? Boolean(d.arquivado) : !d.arquivado && (!aba || d.status === aba)
    );
    const chave = (d: Documento) => (ordem === "data_acao" ? d.data_realizacao ?? "" : d.created_at ?? d.data_realizacao ?? "");
    return [...itens].sort((a, b) => (ordem === "antigos" ? chave(a).localeCompare(chave(b)) : chave(b).localeCompare(chave(a))));
  }, [doFiltro, aba, ordem]);

  const pendentesTotal = (documentos ?? []).filter((d) => d.status === "pendente").length;
  const pendentesForaDoPeriodo = (documentos ?? []).filter(
    (d) => d.status === "pendente" && !noCicloEMes(d, filtroCiclo, ciclos, filtroMes)
  ).length;

  const temFiltro = Boolean(
    filtroEscola || filtroAcao || filtroTipo || !cicloPadrao || filtroMes || busca.trim()
  );
  function limparFiltros() {
    setFiltroEscola("");
    setFiltroAcao("");
    setFiltroTipo("");
    setFiltroCiclo(null);
    setFiltroMes("");
    setBusca("");
  }

  // Período = da primeira à última data de realização dos documentos exibidos
  const datasRealizacao = lista.map((d) => d.data_realizacao).filter(Boolean).sort();
  const periodoInicio = datasRealizacao[0];
  const periodoFim = datasRealizacao[datasRealizacao.length - 1];
  const textoPeriodo = !periodoInicio
    ? "sem ações registradas"
    : periodoInicio === periodoFim
      ? formatarData(periodoInicio)
      : `${formatarData(periodoInicio)} a ${formatarData(periodoFim)}`;

  async function excluirDocumento(documento: Documento) {
    if (!window.confirm("Excluir este documento? Essa ação não pode ser desfeita.")) return;

    setExcluindoId(documento.id);
    setErro(null);
    try {
      await apiDelete(`/api/documentos?id=${encodeURIComponent(documento.id)}`);
      setDocumentos((atual) => (atual ?? []).filter((item) => item.id !== documento.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir o documento.");
    } finally {
      setExcluindoId(null);
    }
  }

  const carregando = !documentos && !erro;

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 sm:p-7">
        {/* Cabeçalho */}
        <Link href="/" className="text-sm text-brand-dark/75 hover:underline">
          ← Municípios
        </Link>
        <div className="mt-1 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark">{municipio?.nome ?? "Documentos do município"}</h1>
            <p className="text-sm text-brand-dark/80 mt-1">
              Período das ações (data da realização): <strong className="text-brand-dark/90">{textoPeriodo}</strong>
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href={`/municipios/${id}/novo-documento`}
              className="bg-brand-light text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-sm hover:bg-brand-accent transition-colors"
            >
              + Adicionar documento
            </Link>
            <div className="rounded-xl bg-brand-light/[0.06] border border-brand-light/10 px-5 py-3 text-center">
              <p className={`text-3xl font-bold leading-none ${pendentesTotal ? "text-status-pendente" : "text-brand-dark"}`}>{pendentesTotal}</p>
              <p className="text-xs text-brand-dark/75 mt-1">{pendentesTotal === 1 ? "pendente" : "pendentes"}</p>
            </div>
          </div>
        </div>

        {erro && (
          <div className="mt-5 rounded-lg bg-status-pendente/10 text-status-pendente px-4 py-3 text-sm">{erro}</div>
        )}

        {documentos && documentos.length > 0 && (
          <>
            {/* Abas + ordenação */}
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-black/10">
              <nav className="flex gap-1 overflow-x-auto -mb-px">
                {(
                  [
                    ["", "Todos"],
                    ["pendente", "Novos"],
                    ["aprovado", "Validados"],
                    ["arquivado", "Arquivados"],
                  ] as [Aba, string][]
                ).filter(([valor]) => !ehCoordenador || valor === "" || valor === "pendente").map(([valor, rotulo]) => (
                  <button
                    key={rotulo}
                    onClick={() => setAba(valor)}
                    className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                      aba === valor ? "border-brand-light text-brand-light" : "border-transparent text-brand-dark/75 hover:text-brand-dark"
                    }`}
                  >
                    {rotulo} ({contagem[valor]})
                  </button>
                ))}
              </nav>
              <select
                value={ordem}
                onChange={(e) => setOrdem(e.target.value as Ordem)}
                className="mb-2 self-start sm:self-auto border border-black/10 rounded-lg px-3 py-2 text-sm bg-white"
                aria-label="Ordenar"
              >
                <option value="recentes">⇅ Enviados mais recentes</option>
                <option value="antigos">⇅ Enviados mais antigos</option>
                <option value="data_acao">⇅ Data da ação</option>
              </select>
            </div>

            {/* Filtros */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2">
              <div className={`relative ${ehCoordenador ? "lg:col-span-5" : "lg:col-span-4"}`}>
                <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark/60" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar ação pedagógica ou escola..."
                  className="w-full border border-black/10 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30"
                />
              </div>
              {!ehCoordenador && <SeletorCiclo ciclos={ciclos} valor={filtroCiclo} onChange={setFiltroCiclo} className={`${SELECT} lg:col-span-2`} />}
              <select
                value={filtroMes}
                onChange={(e) => setFiltroMes(e.target.value)}
                className={`${SELECT} ${ehCoordenador ? "lg:col-span-3" : "lg:col-span-2"}`}
              >
                <option value="">Todos os meses</option>
                {MESES.map((mes, i) => (
                  <option key={mes} value={String(i + 1)}>{mes}</option>
                ))}
              </select>
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className={`${SELECT} lg:col-span-4`}>
                <option value="">Todos os tipos</option>
                {tiposDisponiveis.map(([tid, nome]) => (
                  <option key={tid} value={tid}>{nome}</option>
                ))}
              </select>
              <select value={filtroAcao} onChange={(e) => setFiltroAcao(e.target.value)} className={`${SELECT} lg:col-span-6`}>
                <option value="">Todas as ações pedagógicas</option>
                {acoesDisponiveis.map(([pid, nome]) => (
                  <option key={pid} value={pid ?? ""}>{nome}</option>
                ))}
              </select>
              <select value={filtroEscola} onChange={(e) => setFiltroEscola(e.target.value)} className={`${SELECT} lg:col-span-6`}>
                <option value="">Todas as escolas</option>
                {escolasDisponiveis.map(([eid, nome]) => (
                  <option key={eid} value={eid}>{nome}</option>
                ))}
              </select>
            </div>
            {temFiltro && (
              <button onClick={limparFiltros} className="mt-2 text-sm font-medium text-brand-light hover:underline">
                Limpar filtros
              </button>
            )}

            {!ehCoordenador && pendentesForaDoPeriodo > 0 && (aba === "pendente" || aba === "") && (
              <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2.5 text-sm flex flex-wrap items-center gap-2">
                ⚠️ Há {pendentesForaDoPeriodo} {pendentesForaDoPeriodo === 1 ? "pendência" : "pendências"} fora do período escolhido.
                <button
                  onClick={() => {
                    setFiltroCiclo("");
                    setFiltroMes("");
                    setAba("pendente");
                  }}
                  className="font-semibold underline"
                >
                  Ver todas as pendências
                </button>
              </div>
            )}
          </>
        )}

        {/* Lista */}
        <div className="mt-5 space-y-3">
          {carregando && <p className="text-sm text-brand-dark/75">Carregando...</p>}

          {documentos && documentos.length === 0 && (
            <div className="rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-brand-dark/75">
              Nenhum documento enviado ainda.
            </div>
          )}
          {documentos && documentos.length > 0 && lista.length === 0 && (
            <div className="rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-brand-dark/75">
              Nenhum documento encontrado com esses filtros.
            </div>
          )}

          {lista.map((doc) => (
            <CartaoDocumento
              key={doc.id}
              doc={doc}
              excluindo={excluindoId === doc.id}
              onExcluir={() => excluirDocumento(doc)}
              onVisualizar={() => setVisualizando(doc)}
            />
          ))}
        </div>
      </div>

      {/* Visualização grande */}
      {visualizando && (
        <div
          className="fixed inset-0 z-50 bg-brand-dark/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setVisualizando(null)}
        >
          <div className="w-full max-w-4xl bg-white rounded-xl shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="font-semibold text-brand-dark truncate">
                {visualizando.tipos_documento?.nome} — {visualizando.acao_evento ?? "Sem ação/evento"}
              </p>
              <div className="flex items-center gap-3 shrink-0">
                <a
                  href={normalizarLink(visualizando.drive_file_link ?? visualizando.link_externo) ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-brand-light hover:underline"
                >
                  Abrir em nova aba
                </a>
                <button onClick={() => setVisualizando(null)} className="p-1 rounded hover:bg-black/5" aria-label="Fechar">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <PreviewLink
              link={visualizando.drive_file_link ?? visualizando.link_externo}
              className="w-full h-[70vh]"
              fallback={<p className="text-sm text-brand-dark/75">Este link não pode ser exibido aqui. Use &quot;Abrir em nova aba&quot;.</p>}
            />
            {visualizando.drive_file_link && /v[ií]deo/i.test(visualizando.tipos_documento?.nome ?? "") && (
              <p className="text-xs text-brand-dark/70 mt-2">
                Vídeos recém-enviados podem aparecer como &quot;sendo processado&quot; por alguns minutos enquanto o Google Drive prepara a reprodução.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// Card de um documento (mesmo desenho do Painel de Aprovação)
// ================================================================
function CartaoDocumento({
  doc,
  excluindo,
  onExcluir,
  onVisualizar,
}: {
  doc: Documento;
  excluindo: boolean;
  onExcluir: () => void;
  onVisualizar: () => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const descricao = doc.descricao ?? "";
  const longa = descricao.length > 180;
  const temArquivo = Boolean(doc.drive_file_link || doc.link_externo);
  const ehDoc = ehDocumentoPdf(doc); // Documento (PDF): não passa por aprovação

  return (
    <article className="rounded-xl border border-black/5 bg-white p-3 sm:p-4 transition-shadow hover:shadow-sm">
      <div className="flex flex-col sm:flex-row gap-4">
        <Miniatura doc={doc} onClick={temArquivo ? onVisualizar : undefined} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-brand-dark leading-snug">
                {doc.tipos_documento?.nome ?? "Documento"}
                {doc.acao_evento && <span className="font-semibold text-brand-dark/85"> — {doc.acao_evento}</span>}
              </h2>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-brand-dark/80">
                {doc.escolas?.nome && <Info icone={EscolaIcon} texto={doc.escolas.nome} forte />}
                {doc.acoes_pedagogicas?.nome && <Info icone={FolderIcon} texto={`${doc.acoes_pedagogicas.nome}${doc.subtipo ? ` · ${doc.subtipo}` : ""}`} forte />}
                <Info icone={CalendarIcon} texto={`Realizado em ${formatarData(doc.data_realizacao)}`} />
                {doc.responsavel_nome && <Info icone={UserIcon} texto={`Enviado por ${doc.responsavel_nome}`} />}
              </div>
            </div>

            {(doc.status === "pendente" || ehDoc) && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                  ✓ Enviado
                </span>
                <BotaoExcluir onClick={onExcluir} disabled={excluindo} rotulo="documento" />
              </div>
            )}
          </div>

          {descricao && (
            <p className={`mt-2 text-sm text-brand-dark/85 whitespace-pre-line ${!expandido && longa ? "line-clamp-2" : ""}`}>
              {descricao}
            </p>
          )}
          {longa && (
            <button onClick={() => setExpandido((v) => !v)} className="mt-1 text-sm font-semibold text-brand-light hover:underline">
              {expandido ? "ver menos" : "ver mais"}
            </button>
          )}

          {/* Documento com ajustes pedidos pelo apoio: o coordenador precisa saber */}
          {ehDoc && doc.analise_status === "ajustes" && <AnaliseBadge doc={{ ...doc, origem: null }} />}

          {/* Situação */}
          {doc.status === "aprovado" && !ehDoc && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="inline-flex items-center gap-1.5 text-brand-dark/85">
                <span className="w-5 h-5 rounded-full bg-status-completo text-white flex items-center justify-center">
                  <CheckIcon className="w-3 h-3" />
                </span>
                Validado{doc.validado_por_nome ? <> por <strong>{doc.validado_por_nome}</strong></> : ""}
                {doc.validado_em && <> · {formatarDataHora(doc.validado_em)}</>}
              </span>
              {doc.arquivado && (
                <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold text-brand-dark/75">📁 Arquivado</span>
              )}
              {doc.na_galeria && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-sky-100 text-sky-800" title="Publicado na galeria pública">
                  🖼️ Na galeria
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function correspondeBusca(doc: Documento, busca: string) {
  const termo = normalizarTexto(busca.trim());
  if (!termo) return true;
  const campos = [
    doc.acao_evento,
    doc.acoes_pedagogicas?.nome,
    doc.subtipo,
    doc.descricao,
    doc.finalidade,
    doc.responsavel_nome,
    doc.escolas?.nome,
    doc.tipos_documento?.nome,
    formatarData(doc.data_realizacao),
  ];
  return campos.some((campo) => normalizarTexto(campo).includes(termo));
}
