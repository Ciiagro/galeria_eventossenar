"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnaliseBadge } from "@/components/AnaliseBadge";
import { apiGet, apiPost, Documento, Municipio, TipoDocumento } from "@/lib/api";
import { AdminGuard } from "@/components/AdminGuard";
import PreviewLink from "@/components/PreviewLink";
import { normalizarLink } from "@/lib/linkIncorporavel";
import { MESES } from "@/lib/periodo";
import { noCicloEMes, useFiltroCiclo } from "@/lib/ciclos";
import { urlsMiniatura } from "@/lib/miniatura";
import {
  CalendarIcon,
  CheckIcon,
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  LinkIcon,
  MapPinIcon,
  SearchIcon,
  UserIcon,
  VideoIcon,
  XIcon,
} from "@/components/icons";

export default function PendenciasPageGuarded() {
  return (
    <AdminGuard>
      <PainelAprovacao />
    </AdminGuard>
  );
}

type Aba = "pendente" | "aprovado" | "arquivado" | "";
type Ordem = "recentes" | "antigos" | "data_acao";

function PainelAprovacao() {
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);

  // Filtros
  const [aba, setAba] = useState<Aba | null>(null); // null = ainda decidindo (Pendentes se houver, senão Todos)
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  // Padrão: ciclo ativo, todos os meses ("" = todos os ciclos)
  const { ciclos, cicloId: filtroCiclo, setCicloId: setFiltroCiclo, ehPadrao: cicloPadrao } = useFiltroCiclo();
  const [filtroMes, setFiltroMes] = useState("");
  const [filtroMunicipio, setFiltroMunicipio] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [busca, setBusca] = useState("");

  // Interação
  const [selecionado, setSelecionado] = useState(0);
  const [visualizando, setVisualizando] = useState<Documento | null>(null);
  const [documentoParaAprovar, setDocumentoParaAprovar] = useState<Documento | null>(null);
  const [publicarNaGaleria, setPublicarNaGaleria] = useState<boolean | null>(null);
  const [descricaoGaleria, setDescricaoGaleria] = useState("");
  const cardsRef = useRef<(HTMLElement | null)[]>([]);

  // ---------- dados ----------
  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (filtroMunicipio) params.set("municipio_id", filtroMunicipio);
    if (filtroTipo) params.set("tipo_id", filtroTipo);
    const query = params.toString();
    return apiGet(`/api/documentos${query ? `?${query}` : ""}`)
      .then((lista: Documento[]) => {
        setDocumentos(lista);
        setErro(null);
        return lista;
      })
      .catch((e) => {
        setErro(e.message);
        return [] as Documento[];
      });
  }, [filtroMunicipio, filtroTipo]);

  useEffect(() => {
    carregar().then((lista) =>
      setAba((atual) => (atual === null ? (lista.some((d) => d.status === "pendente") ? "pendente" : "") : atual))
    );
    const intervalo = window.setInterval(() => {
      // não recarrega enquanto a pessoa está aprovando (evita "pular" a tela)
      // nem com a aba em segundo plano (economiza o servidor)
      if (!document.hidden && !document.querySelector("[data-painel-ocupado]")) carregar();
    }, 30000);
    return () => window.clearInterval(intervalo);
  }, [carregar]);

  useEffect(() => {
    apiGet("/api/municipios").then(setMunicipios).catch(() => null);
    apiGet("/api/tipos-documento").then(setTipos).catch(() => null);
  }, []);

  const nomeMunicipio = useMemo(() => {
    const mapa = new Map(municipios.map((m) => [String(m.id), m.nome]));
    return (id?: number | string) => (id !== undefined ? mapa.get(String(id)) ?? `Município #${id}` : "—");
  }, [municipios]);

  // ---------- filtragem ----------
  const doFiltro = useMemo(() => {
    const termo = normalizar(busca.trim());
    return (documentos ?? []).filter(
      (doc) =>
        noCicloEMes(doc, filtroCiclo, ciclos, filtroMes) &&
        (!termo ||
          [doc.descricao, doc.acao_evento, doc.acoes_pedagogicas?.nome, doc.subtipo, doc.tipos_documento?.nome, doc.escolas?.nome, doc.responsavel_nome, nomeMunicipio(doc.municipio_id)]
            .some((v) => normalizar(v).includes(termo)))
    );
  }, [documentos, filtroCiclo, ciclos, filtroMes, busca, nomeMunicipio]);

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
    const chave = (d: Documento) =>
      ordem === "data_acao" ? d.data_realizacao ?? "" : d.created_at ?? d.data_realizacao ?? "";
    return [...itens].sort((a, b) => (ordem === "antigos" ? chave(a).localeCompare(chave(b)) : chave(b).localeCompare(chave(a))));
  }, [doFiltro, aba, ordem]);

  const pendentesTotal = (documentos ?? []).filter((d) => d.status === "pendente").length;
  const pendentesForaDoPeriodo = (documentos ?? []).filter(
    (d) => d.status === "pendente" && !noCicloEMes(d, filtroCiclo, ciclos, filtroMes)
  ).length;
  const temFiltro = Boolean(!cicloPadrao || filtroMes || filtroMunicipio || filtroTipo || busca.trim());

  useEffect(() => {
    setSelecionado((i) => Math.min(i, Math.max(0, lista.length - 1)));
  }, [lista.length]);

  // ---------- ações ----------
  function abrirAprovacao(doc: Documento) {
    const tipo = (doc.tipos_documento?.nome ?? "").toLowerCase();
    const ehMidia = /imagem|foto|v[ií]deo/.test(tipo);
    setDocumentoParaAprovar(doc);
    setPublicarNaGaleria(doc.status === "aprovado" ? Boolean(doc.na_galeria) : ehMidia ? true : null);
    setDescricaoGaleria(doc.descricao_galeria || doc.descricao || "");
  }

  async function confirmarAprovacao() {
    if (!documentoParaAprovar || publicarNaGaleria === null) return;
    if (publicarNaGaleria && !descricaoGaleria.trim()) return;
    setProcessando(documentoParaAprovar.id);
    try {
      await apiPost("/api/validar", {
        documento_id: documentoParaAprovar.id,
        status: "aprovado",
        na_galeria: publicarNaGaleria,
        descricao_galeria: publicarNaGaleria ? descricaoGaleria.trim() : undefined,
      });
      setDocumentoParaAprovar(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao aprovar documento.");
    } finally {
      setProcessando(null);
    }
  }

  async function arquivar(doc: Documento, valor: boolean) {
    setProcessando(doc.id);
    try {
      await apiPost("/api/arquivar", { documento_id: doc.id, arquivado: valor });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao arquivar documento.");
    } finally {
      setProcessando(null);
    }
  }

  // ---------- atalhos de teclado ----------
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName) || alvo.isContentEditable) return;
      if (documentoParaAprovar || visualizando || e.ctrlKey || e.metaKey || e.altKey) return;
      const doc = lista[selecionado];
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelecionado((i) => Math.min(i + 1, lista.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelecionado((i) => Math.max(i - 1, 0));
      } else if ((e.key === "a" || e.key === "A") && doc?.status === "pendente") {
        e.preventDefault();
        abrirAprovacao(doc);
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cardsRef.current[selecionado]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selecionado]);

  const ocupado = Boolean(documentoParaAprovar || visualizando);

  return (
    <div className="p-4 sm:p-8 max-w-6xl" {...(ocupado ? { "data-painel-ocupado": "" } : {})}>
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 sm:p-7">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark">Painel de Aprovação</h1>
            <p className="text-sm text-brand-dark/80 mt-1">
              Veja os documentos enviados pelos municípios e aprove. Ao aprovar, decida se vai para a galeria. Arquive o que não precisa ficar na lista.
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-brand-light/[0.06] border border-brand-light/10 px-5 py-3 text-center">
            <p className={`text-3xl font-bold leading-none ${pendentesTotal ? "text-status-pendente" : "text-brand-dark"}`}>{pendentesTotal}</p>
            <p className="text-xs text-brand-dark/75 mt-1">{pendentesTotal === 1 ? "para revisar" : "para revisar"}</p>
          </div>
        </div>

        {/* Abas + ordenação */}
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-black/10">
          <nav className="flex gap-1 overflow-x-auto -mb-px">
            {([
              ["pendente", "Para revisar"],
              ["aprovado", "Aprovados"],
              ["arquivado", "Arquivados"],
              ["", "Todos"],
            ] as [Aba, string][]).map(([valor, rotulo]) => (
              <button
                key={rotulo}
                onClick={() => { setAba(valor); setSelecionado(0); }}
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
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.3fr_1.3fr] gap-2">
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark/60" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar escola, ação pedagógica, município..."
              className="w-full border border-black/10 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30"
            />
          </div>
          <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className={SELECT}>
            <option value="">Todos os meses</option>
            {MESES.map((mes, i) => <option key={mes} value={String(i + 1)}>{mes}</option>)}
          </select>
          <select value={filtroMunicipio} onChange={(e) => setFiltroMunicipio(e.target.value)} className={SELECT}>
            <option value="">Todos os municípios</option>
            {municipios.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className={SELECT}>
            <option value="">Todos os tipos</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
        {temFiltro && (
          <button
            onClick={() => { setFiltroCiclo(null); setFiltroMes(""); setFiltroMunicipio(""); setFiltroTipo(""); setBusca(""); }}
            className="mt-2 text-sm font-medium text-brand-light hover:underline"
          >
            Limpar filtros
          </button>
        )}

        {pendentesForaDoPeriodo > 0 && (aba === "pendente" || aba === "") && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2.5 text-sm flex flex-wrap items-center gap-2">
            ⚠️ Há {pendentesForaDoPeriodo} {pendentesForaDoPeriodo === 1 ? "pendência" : "pendências"} fora do ciclo ou mês escolhido.
            <button onClick={() => { setFiltroCiclo(""); setFiltroMes(""); setAba("pendente"); }} className="font-semibold underline">
              Ver todas as pendências
            </button>
          </div>
        )}

        {erro && <p className="mt-4 text-sm text-status-pendente">{erro}</p>}

        {/* Lista */}
        <div className="mt-5 space-y-3">
          {(!documentos || aba === null) && !erro && <p className="text-sm text-brand-dark/75">Carregando...</p>}
          {documentos && aba !== null && lista.length === 0 && (
            <div className="rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-brand-dark/75">
              {aba === "pendente" ? "🎉 Nada para revisar neste período." : "Nenhum documento encontrado com esses filtros."}
            </div>
          )}

          {aba !== null && lista.map((doc, i) => (
            <CartaoDocumento
              key={doc.id}
              refFn={(el) => { cardsRef.current[i] = el; }}
              doc={doc}
              selecionado={i === selecionado}
              municipio={nomeMunicipio(doc.municipio_id)}
              processando={processando === doc.id}
              onSelecionar={() => setSelecionado(i)}
              onAprovar={() => abrirAprovacao(doc)}
              onArquivar={() => arquivar(doc, true)}
              onDesarquivar={() => arquivar(doc, false)}
              onVisualizar={() => setVisualizando(doc)}
            />
          ))}
        </div>

        {/* Atalhos */}
        {lista.length > 0 && (
          <div className="mt-5 rounded-lg bg-sky-50 border border-sky-100 px-4 py-2.5 text-center text-sm text-sky-900">
            ⌨️ <strong>A</strong> = Aprovar · <strong>← →</strong> navegar
          </div>
        )}
      </div>

      {/* Visualização grande */}
      {visualizando && (
        <div className="fixed inset-0 z-50 bg-brand-dark/40 flex items-center justify-center p-4" onClick={() => setVisualizando(null)}>
          <div className="w-full max-w-4xl bg-white rounded-xl shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="font-semibold text-brand-dark truncate">
                {visualizando.tipos_documento?.nome} — {visualizando.acao_evento ?? "Sem ação/evento"}
              </p>
              <div className="flex items-center gap-3 shrink-0">
                <a href={normalizarLink(visualizando.drive_file_link ?? visualizando.link_externo) ?? undefined} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-light hover:underline">
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
              fallback={<p className="text-sm text-brand-dark/75">Este link não pode ser exibido aqui. Use "Abrir em nova aba".</p>}
            />
          </div>
        </div>
      )}

      {documentoParaAprovar && (
        <div className="fixed inset-0 z-50 bg-brand-dark/30 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={(e) => { e.preventDefault(); confirmarAprovacao(); }}
            className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-xl shadow-xl p-6"
          >
            <h2 className="text-lg font-semibold text-brand-dark">
              {documentoParaAprovar.status === "aprovado" ? "Publicação na galeria" : "Aprovar documento"}
            </h2>
            <p className="text-sm text-brand-dark/80 mt-1">
              {documentoParaAprovar.tipos_documento?.nome} — {documentoParaAprovar.acao_evento ?? "Sem ação/evento"} ·{" "}
              {nomeMunicipio(documentoParaAprovar.municipio_id)}
            </p>

            <div className="mt-4">
              <PreviewLink link={documentoParaAprovar.drive_file_link ?? documentoParaAprovar.link_externo} className="w-full h-56" />
            </div>

            <p className="text-sm font-semibold text-brand-dark mt-5 mb-2">Este documento vai para a galeria pública?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPublicarNaGaleria(true)}
                className={`text-left rounded-lg border px-4 py-3 text-sm transition-colors ${publicarNaGaleria === true ? "border-sky-500 bg-sky-50 ring-2 ring-sky-200" : "border-black/10 hover:bg-black/[0.02]"}`}
              >
                <span className="font-semibold text-brand-dark block">🖼️ Sim, publicar na galeria</span>
                <span className="text-xs text-brand-dark/75">Aparece para o público com a descrição abaixo.</span>
              </button>
              <button
                type="button"
                onClick={() => setPublicarNaGaleria(false)}
                className={`text-left rounded-lg border px-4 py-3 text-sm transition-colors ${publicarNaGaleria === false ? "border-brand-light bg-brand-light/5 ring-2 ring-brand-light/20" : "border-black/10 hover:bg-black/[0.02]"}`}
              >
                <span className="font-semibold text-brand-dark block">✅ Não, só aprovar</span>
                <span className="text-xs text-brand-dark/75">Fica registrado, mas não aparece na galeria.</span>
              </button>
            </div>

            {publicarNaGaleria && (
              <div className="mt-5">
                <div className="flex items-end justify-between gap-2 mb-1.5">
                  <label htmlFor="descricao-galeria" className="block text-sm font-medium text-brand-dark">
                    Descrição para a galeria <span className="text-status-pendente">*</span>
                  </label>
                  {documentoParaAprovar.descricao && descricaoGaleria !== documentoParaAprovar.descricao && (
                    <button
                      type="button"
                      onClick={() => setDescricaoGaleria(documentoParaAprovar.descricao ?? "")}
                      className="text-xs font-medium text-brand-light hover:underline"
                    >
                      Voltar ao texto original
                    </button>
                  )}
                </div>
                <p className="text-xs text-brand-dark/75 mb-2">
                  Já veio preenchida com o texto de quem enviou{documentoParaAprovar.responsavel_nome ? ` (${documentoParaAprovar.responsavel_nome})` : ""}. Corrija e melhore antes de publicar.
                </p>
                <textarea
                  id="descricao-galeria"
                  value={descricaoGaleria}
                  onChange={(e) => setDescricaoGaleria(e.target.value)}
                  rows={6}
                  maxLength={2000}
                  required
                  className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
                <p className="text-xs text-brand-dark/70 text-right mt-1">{descricaoGaleria.length}/2000</p>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setDocumentoParaAprovar(null)}
                className="px-3 py-2 rounded-lg border border-black/10 text-sm font-medium text-brand-dark/85 hover:bg-brand-light/5"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  publicarNaGaleria === null ||
                  (publicarNaGaleria && !descricaoGaleria.trim()) ||
                  processando === documentoParaAprovar.id
                }
                className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${publicarNaGaleria ? "bg-sky-700 hover:bg-sky-800" : "bg-status-completo"}`}
              >
                {publicarNaGaleria === null
                  ? "Escolha uma opção"
                  : publicarNaGaleria
                    ? documentoParaAprovar.status === "aprovado" ? "Salvar e publicar" : "Aprovar e publicar na galeria"
                    : documentoParaAprovar.status === "aprovado"
                      ? documentoParaAprovar.na_galeria ? "Tirar da galeria" : "Manter fora da galeria"
                      : "Aprovar sem publicar"}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

// ================================================================
// Card de um documento
// ================================================================
type CartaoProps = {
  doc: Documento;
  refFn: (el: HTMLElement | null) => void;
  selecionado: boolean;
  municipio: string;
  processando: boolean;
  onSelecionar: () => void;
  onAprovar: () => void;
  onArquivar: () => void;
  onDesarquivar: () => void;
  onVisualizar: () => void;
};

function CartaoDocumento(p: CartaoProps) {
  const { doc } = p;
  const [expandido, setExpandido] = useState(false);
  const descricao = doc.descricao ?? "";
  const longa = descricao.length > 180;

  return (
    <article
      ref={p.refFn}
      onClick={p.onSelecionar}
      className={`relative rounded-xl border bg-white p-3 sm:p-4 transition-shadow ${
        p.selecionado ? "border-brand-light/40 ring-2 ring-brand-light/20 shadow-md" : "border-black/5 hover:shadow-sm"
      }`}
    >
      <div className="flex flex-col sm:flex-row gap-4">
        <Miniatura doc={p.doc} onClick={p.onVisualizar} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-brand-dark leading-snug">
                {doc.tipos_documento?.nome ?? "Documento"}
                {doc.acao_evento && <span className="font-semibold text-brand-dark/85"> — {doc.acao_evento}</span>}
              </h2>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-brand-dark/80">
                <Info icone={MapPinIcon} texto={p.municipio} forte />
                {doc.escolas?.nome && <Info icone={HomeEscola} texto={doc.escolas.nome} />}
                {doc.acoes_pedagogicas?.nome && <Info icone={FolderIcon} texto={`${doc.acoes_pedagogicas.nome}${doc.subtipo ? ` · ${doc.subtipo}` : ""}`} forte />}
                <Info icone={CalendarIcon} texto={`Realizado em ${formatarData(doc.data_realizacao)}`} />
                {doc.responsavel_nome && <Info icone={UserIcon} texto={`Enviado por ${doc.responsavel_nome}`} />}
              </div>
            </div>

            {doc.status === "pendente" && (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); p.onSelecionar(); p.onAprovar(); }}
                  disabled={p.processando}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-status-completo px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
                >
                  <CheckIcon className="w-4 h-4" /> Aprovar
                </button>
              </div>
            )}
          </div>

          {doc.status === "pendente" && <AnaliseBadge doc={doc} />}

          {descricao && (
            <p className={`mt-2 text-sm text-brand-dark/85 whitespace-pre-line ${!expandido && longa ? "line-clamp-2" : ""}`}>
              {descricao}
            </p>
          )}
          {longa && (
            <button onClick={(e) => { e.stopPropagation(); setExpandido((v) => !v); }} className="mt-1 text-sm font-semibold text-brand-light hover:underline">
              {expandido ? "ver menos" : "ver mais"}
            </button>
          )}

          {/* Situação */}
          {doc.status === "aprovado" && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="inline-flex items-center gap-1.5 text-brand-dark/85">
                <span className="w-5 h-5 rounded-full bg-status-completo text-white flex items-center justify-center"><CheckIcon className="w-3 h-3" /></span>
                Aprovado{doc.validado_por_nome ? <> por <strong>{doc.validado_por_nome}</strong></> : ""}
                {doc.validado_em && <> · {formatarDataHora(doc.validado_em)}</>}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${doc.na_galeria ? "bg-sky-100 text-sky-800" : "bg-black/5 text-brand-dark/75"}`}>
                {doc.na_galeria ? "🖼️ Na galeria" : "Fora da galeria"}
              </span>
              {!doc.arquivado && (
                <button onClick={(e) => { e.stopPropagation(); p.onAprovar(); }} className="text-xs font-semibold text-sky-800 hover:underline">
                  {doc.na_galeria ? "Editar publicação na galeria" : "Publicar na galeria"}
                </button>
              )}
              {!doc.na_galeria && !doc.arquivado && (
                <button
                  onClick={(e) => { e.stopPropagation(); p.onArquivar(); }}
                  disabled={p.processando}
                  className="text-xs font-semibold text-brand-dark/70 hover:underline disabled:opacity-50"
                >
                  📁 Arquivar
                </button>
              )}
              {doc.arquivado && (
                <>
                  <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold text-brand-dark/75">📁 Arquivado</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); p.onDesarquivar(); }}
                    disabled={p.processando}
                    className="text-xs font-semibold text-brand-light hover:underline disabled:opacity-50"
                  >
                    Desarquivar
                  </button>
                </>
              )}
            </div>
          )}
          {doc.status === "aprovado" && doc.na_galeria && doc.descricao_galeria && doc.descricao_galeria !== doc.descricao && (
            <p className="mt-2 text-sm text-sky-900 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
              <span className="font-semibold">Texto na galeria:</span> {doc.descricao_galeria}
            </p>
          )}
        </div>
      </div>

    </article>
  );
}

// ================================================================
// Miniatura (imagem do Drive, capa do YouTube ou ícone)
// ================================================================
function Miniatura({ doc, onClick }: { doc: Documento; onClick: () => void }) {
  // tenta cada endereço em ordem; se todos falharem, mostra o ícone
  const candidatos = urlsMiniatura(doc);
  const [tentativa, setTentativa] = useState(0);
  const url = candidatos[tentativa] ?? null;
  const falhou = !url;
  const tipo = (doc.tipos_documento?.nome ?? "").toLowerCase();
  const Icone = /v[ií]deo/.test(tipo) ? VideoIcon : /imag|foto/.test(tipo) ? ImageIcon : doc.link_externo && !doc.drive_file_link ? LinkIcon : FileTextIcon;
  const ehVideo = /v[ií]deo/.test(tipo);

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="group relative w-full sm:w-44 h-32 sm:h-28 shrink-0 overflow-hidden rounded-lg border border-black/10 bg-brand-light/[0.06]"
      title="Ver em tamanho grande"
    >
      {url && !falhou ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setTentativa((t) => t + 1)} className="w-full h-full object-cover" />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-brand-light">
          <Icone className="w-8 h-8" />
          <span className="text-xs font-medium">{doc.tipos_documento?.nome ?? "Arquivo"}</span>
        </span>
      )}
      {ehVideo && url && !falhou && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-10 h-10 rounded-full bg-black/55 text-white flex items-center justify-center text-lg">▶</span>
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-center text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
        🔍 Ampliar
      </span>
    </button>
  );
}

// ================================================================
// Pequenos auxiliares
// ================================================================
const SELECT = "w-full border border-black/10 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30";

function HomeEscola({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10l9-6 9 6" /><path d="M5 10v9h14v-9" /><path d="M10 19v-5h4v5" />
    </svg>
  );
}

function Info({ icone: Icone, texto, forte }: { icone: (p: { className?: string }) => JSX.Element; texto: string; forte?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 ${forte ? "font-semibold text-brand-dark" : ""}`}>
      <Icone className="w-3.5 h-3.5 shrink-0 text-brand-light" />
      {texto}
    </span>
  );
}

function normalizar(texto?: string | null) {
  return (texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function formatarData(data?: string | null) {
  if (!data) return "—";
  const [ano, mes, dia] = data.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(data: string) {
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}
