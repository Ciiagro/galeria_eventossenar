"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, apiGet, apiPost, Documento, Municipio, TipoDocumento } from "@/lib/api";
import { AdminGuard } from "@/components/AdminGuard";
import PreviewLink from "@/components/PreviewLink";
import { normalizarLink } from "@/lib/linkIncorporavel";
import { ANO_ATUAL, MES_ATUAL, MESES, anosParaSeletor, noPeriodo } from "@/lib/periodo";
import {
  AlertIcon,
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

type Aba = "pendente" | "aprovado" | "rejeitado" | "";
type Ordem = "recentes" | "antigos" | "data_acao";

const MOTIVOS = [
  { id: "ilegivel", rotulo: "Arquivo ilegível ou não abre", icone: ImageIcon },
  { id: "incompleto", rotulo: "Documento incompleto", icone: FileTextIcon },
  { id: "escola_programa", rotulo: "Escola ou programa errado", icone: MapPinIcon },
  { id: "data", rotulo: "Data de realização incorreta", icone: CalendarIcon },
  { id: "outro", rotulo: "Outro motivo", icone: AlertIcon },
] as const;

function PainelAprovacao() {
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);

  // Filtros
  const [aba, setAba] = useState<Aba | null>(null); // null = ainda decidindo (Pendentes se houver, senão Todos)
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [filtroAno, setFiltroAno] = useState(ANO_ATUAL);
  const [filtroMes, setFiltroMes] = useState(MES_ATUAL);
  const [filtroMunicipio, setFiltroMunicipio] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [busca, setBusca] = useState("");

  // Interação
  const [selecionado, setSelecionado] = useState(0);
  const [reprovando, setReprovando] = useState<string | null>(null);
  const [motivoEscolhido, setMotivoEscolhido] = useState<string>("");
  const [motivoTexto, setMotivoTexto] = useState("");
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
      // não recarrega enquanto a pessoa está reprovando/aprovando (evita "pular" a tela)
      if (!document.querySelector("[data-painel-ocupado]")) carregar();
    }, 10000);
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
        noPeriodo(doc.data_realizacao, filtroAno, filtroMes) &&
        (!termo ||
          [doc.descricao, doc.acao_evento, doc.tipos_documento?.nome, doc.escolas?.nome, doc.projetos?.nome, doc.responsavel_nome, nomeMunicipio(doc.municipio_id)]
            .some((v) => normalizar(v).includes(termo)))
    );
  }, [documentos, filtroAno, filtroMes, busca, nomeMunicipio]);

  const contagem = useMemo(
    () => ({
      pendente: doFiltro.filter((d) => d.status === "pendente").length,
      aprovado: doFiltro.filter((d) => d.status === "aprovado").length,
      rejeitado: doFiltro.filter((d) => d.status === "rejeitado").length,
      "": doFiltro.length,
    }),
    [doFiltro]
  );

  const lista = useMemo(() => {
    const itens = doFiltro.filter((d) => !aba || d.status === aba);
    const chave = (d: Documento) =>
      ordem === "data_acao" ? d.data_realizacao ?? "" : d.created_at ?? d.data_realizacao ?? "";
    return [...itens].sort((a, b) => (ordem === "antigos" ? chave(a).localeCompare(chave(b)) : chave(b).localeCompare(chave(a))));
  }, [doFiltro, aba, ordem]);

  const pendentesTotal = (documentos ?? []).filter((d) => d.status === "pendente").length;
  const pendentesForaDoPeriodo = (documentos ?? []).filter(
    (d) => d.status === "pendente" && !noPeriodo(d.data_realizacao, filtroAno, filtroMes)
  ).length;
  const anosDisponiveis = useMemo(
    () => anosParaSeletor((documentos ?? []).map((d) => d.data_realizacao), filtroAno),
    [documentos, filtroAno]
  );
  const temFiltro = Boolean(filtroAno !== ANO_ATUAL || filtroMes !== MES_ATUAL || filtroMunicipio || filtroTipo || busca.trim());

  useEffect(() => {
    setSelecionado((i) => Math.min(i, Math.max(0, lista.length - 1)));
  }, [lista.length]);

  // ---------- ações ----------
  function abrirAprovacao(doc: Documento) {
    const tipo = (doc.tipos_documento?.nome ?? "").toLowerCase();
    const ehMidia = /imagem|foto|v[ií]deo/.test(tipo);
    setReprovando(null);
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

  function abrirReprovacao(doc: Documento) {
    setReprovando((atual) => (atual === doc.id ? null : doc.id));
    setMotivoEscolhido("");
    setMotivoTexto("");
  }

  async function confirmarReprovacao(doc: Documento) {
    const motivo = MOTIVOS.find((m) => m.id === motivoEscolhido);
    if (!motivo) return;
    const complemento = motivoTexto.trim();
    if (motivo.id === "outro" && !complemento) return;
    const texto = motivo.id === "outro" ? complemento : complemento ? `${motivo.rotulo}: ${complemento}` : motivo.rotulo;
    setProcessando(doc.id);
    try {
      await apiPost("/api/validar", { documento_id: doc.id, status: "rejeitado", motivo_rejeicao: texto });
      setReprovando(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao reprovar documento.");
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
        setReprovando(null);
        setSelecionado((i) => Math.min(i + 1, lista.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setReprovando(null);
        setSelecionado((i) => Math.max(i - 1, 0));
      } else if ((e.key === "a" || e.key === "A") && doc?.status === "pendente") {
        e.preventDefault();
        abrirAprovacao(doc);
      } else if ((e.key === "r" || e.key === "R") && doc?.status === "pendente") {
        e.preventDefault();
        abrirReprovacao(doc);
      } else if (e.key === "Escape") {
        setReprovando(null);
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cardsRef.current[selecionado]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selecionado]);

  const ocupado = Boolean(reprovando || documentoParaAprovar || visualizando);

  return (
    <div className="p-4 sm:p-8 max-w-6xl" {...(ocupado ? { "data-painel-ocupado": "" } : {})}>
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 sm:p-7">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark">Painel de Aprovação</h1>
            <p className="text-sm text-brand-dark/80 mt-1">
              Analise os documentos enviados pelos municípios e aprove ou reprove. Ao aprovar, decida se vai para a galeria.
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-brand-light/[0.06] border border-brand-light/10 px-5 py-3 text-center">
            <p className={`text-3xl font-bold leading-none ${pendentesTotal ? "text-status-pendente" : "text-brand-dark"}`}>{pendentesTotal}</p>
            <p className="text-xs text-brand-dark/75 mt-1">{pendentesTotal === 1 ? "pendente" : "pendentes"}</p>
          </div>
        </div>

        {/* Abas + ordenação */}
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-black/10">
          <nav className="flex gap-1 overflow-x-auto -mb-px">
            {([
              ["pendente", "Pendentes"],
              ["aprovado", "Aprovados"],
              ["rejeitado", "Reprovados"],
              ["", "Todos"],
            ] as [Aba, string][]).map(([valor, rotulo]) => (
              <button
                key={rotulo}
                onClick={() => { setAba(valor); setSelecionado(0); setReprovando(null); }}
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
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.3fr_1.3fr] gap-2">
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark/60" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar escola, ação, programa, município..."
              className="w-full border border-black/10 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30"
            />
          </div>
          <select value={filtroAno} onChange={(e) => { setFiltroAno(e.target.value); if (!e.target.value) setFiltroMes(""); }} className={SELECT} title="Pela data de realização">
            <option value="">Todos os anos</option>
            {anosDisponiveis.map((ano) => <option key={ano} value={ano}>{ano}</option>)}
          </select>
          <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} disabled={!filtroAno} className={`${SELECT} disabled:bg-black/[0.03] disabled:text-brand-dark/50`}>
            <option value="">{filtroAno ? "Todos os meses" : "Escolha o ano"}</option>
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
            onClick={() => { setFiltroAno(ANO_ATUAL); setFiltroMes(MES_ATUAL); setFiltroMunicipio(""); setFiltroTipo(""); setBusca(""); }}
            className="mt-2 text-sm font-medium text-brand-light hover:underline"
          >
            Limpar filtros
          </button>
        )}

        {pendentesForaDoPeriodo > 0 && (aba === "pendente" || aba === "") && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2.5 text-sm flex flex-wrap items-center gap-2">
            ⚠️ Há {pendentesForaDoPeriodo} {pendentesForaDoPeriodo === 1 ? "pendência" : "pendências"} fora do período escolhido.
            <button onClick={() => { setFiltroAno(""); setFiltroMes(""); setAba("pendente"); }} className="font-semibold underline">
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
              {aba === "pendente" ? "🎉 Nenhuma pendência neste período." : "Nenhum documento encontrado com esses filtros."}
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
              reprovandoAberto={reprovando === doc.id}
              motivoEscolhido={motivoEscolhido}
              motivoTexto={motivoTexto}
              onSelecionar={() => setSelecionado(i)}
              onAprovar={() => abrirAprovacao(doc)}
              onReprovar={() => abrirReprovacao(doc)}
              onFecharReprovar={() => setReprovando(null)}
              onMotivo={setMotivoEscolhido}
              onMotivoTexto={setMotivoTexto}
              onConfirmarReprovar={() => confirmarReprovacao(doc)}
              onVisualizar={() => setVisualizando(doc)}
            />
          ))}
        </div>

        {/* Atalhos */}
        {lista.length > 0 && (
          <div className="mt-5 rounded-lg bg-sky-50 border border-sky-100 px-4 py-2.5 text-center text-sm text-sky-900">
            ⌨️ <strong>A</strong> = Aprovar · <strong>R</strong> = Reprovar · <strong>← →</strong> navegar · <strong>Esc</strong> fechar
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
  reprovandoAberto: boolean;
  motivoEscolhido: string;
  motivoTexto: string;
  onSelecionar: () => void;
  onAprovar: () => void;
  onReprovar: () => void;
  onFecharReprovar: () => void;
  onMotivo: (id: string) => void;
  onMotivoTexto: (texto: string) => void;
  onConfirmarReprovar: () => void;
  onVisualizar: () => void;
};

function CartaoDocumento(p: CartaoProps) {
  const { doc } = p;
  const [expandido, setExpandido] = useState(false);
  const descricao = doc.descricao ?? "";
  const longa = descricao.length > 180;
  const motivoOutro = p.motivoEscolhido === "outro";
  const podeConfirmar = Boolean(p.motivoEscolhido) && (!motivoOutro || p.motivoTexto.trim());

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
                <Info icone={FolderIcon} texto={doc.projetos?.nome ?? "Sem programa"} />
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
                <button
                  onClick={(e) => { e.stopPropagation(); p.onSelecionar(); p.onReprovar(); }}
                  disabled={p.processando}
                  className={`inline-flex items-center gap-1.5 rounded-lg bg-status-pendente px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50 ${p.reprovandoAberto ? "ring-4 ring-status-pendente/25" : ""}`}
                >
                  <XIcon className="w-4 h-4" /> Reprovar
                </button>
              </div>
            )}
          </div>

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
              <button onClick={(e) => { e.stopPropagation(); p.onAprovar(); }} className="text-xs font-semibold text-sky-800 hover:underline">
                {doc.na_galeria ? "Editar publicação na galeria" : "Publicar na galeria"}
              </button>
            </div>
          )}
          {doc.status === "aprovado" && doc.na_galeria && doc.descricao_galeria && doc.descricao_galeria !== doc.descricao && (
            <p className="mt-2 text-sm text-sky-900 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
              <span className="font-semibold">Texto na galeria:</span> {doc.descricao_galeria}
            </p>
          )}
          {doc.status === "rejeitado" && (
            <div className="mt-3 text-[13px] text-brand-dark/85">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-status-pendente text-white flex items-center justify-center"><XIcon className="w-3 h-3" /></span>
                Reprovado{doc.validado_por_nome ? <> por <strong>{doc.validado_por_nome}</strong></> : ""}
                {doc.validado_em && <> · {formatarDataHora(doc.validado_em)}</>}
              </span>
              {doc.motivo_rejeicao && (
                <p className="mt-1.5 rounded-lg bg-status-pendente/5 border border-status-pendente/15 px-3 py-2 text-status-pendente">
                  <strong>Motivo:</strong> {doc.motivo_rejeicao}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Caixa de motivo da reprovação */}
      {p.reprovandoAberto && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative z-20 mt-3 sm:absolute sm:right-4 sm:top-[64px] sm:mt-0 w-full sm:w-80 rounded-xl border border-black/10 bg-white p-4 shadow-xl"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-brand-dark">Motivo da reprovação</p>
            <button onClick={p.onFecharReprovar} className="p-1 rounded hover:bg-black/5" aria-label="Fechar"><XIcon className="w-4 h-4" /></button>
          </div>
          <div className="space-y-2">
            {MOTIVOS.map((m) => {
              const Icone = m.icone;
              const ativo = p.motivoEscolhido === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => p.onMotivo(m.id)}
                  className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    ativo ? "border-sky-400 bg-sky-50 text-brand-dark font-medium" : "border-black/10 text-brand-dark/85 hover:bg-black/[0.02]"
                  }`}
                >
                  <Icone className="w-4 h-4 shrink-0" /> {m.rotulo}
                </button>
              );
            })}
          </div>
          {p.motivoEscolhido && (
            <textarea
              value={p.motivoTexto}
              onChange={(e) => p.onMotivoTexto(e.target.value)}
              rows={2}
              autoFocus={motivoOutro}
              placeholder={motivoOutro ? "Descreva o motivo (obrigatório)" : "Detalhe para quem enviou (opcional)"}
              className="mt-3 w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-status-pendente/20"
            />
          )}
          <button
            onClick={p.onConfirmarReprovar}
            disabled={!podeConfirmar || p.processando}
            className="mt-3 w-full rounded-lg bg-status-pendente py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
          >
            {p.processando ? "Reprovando..." : "Confirmar"}
          </button>
        </div>
      )}
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

function urlsMiniatura(doc: Documento): string[] {
  const urls: string[] = [];
  // 1) arquivo enviado pelo sistema: miniatura pelo nosso servidor (funciona mesmo se não for público)
  const nosso = doc.drive_file_id ?? idDoDrive(doc.drive_file_link);
  if (nosso) {
    urls.push(`${API_BASE}/api/miniatura/${nosso}`);
    urls.push(`https://lh3.googleusercontent.com/d/${nosso}=w480`);
  }
  // 2) link colado pela pessoa
  const link = normalizarLink(doc.link_externo);
  if (link) {
    const driveExterno = idDoDrive(link);
    if (driveExterno && driveExterno !== nosso) {
      urls.push(`https://lh3.googleusercontent.com/d/${driveExterno}=w480`);
      urls.push(`https://drive.google.com/thumbnail?id=${driveExterno}&sz=w480`);
    }
    const youtube = link.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{6,})/);
    if (youtube && /youtu/.test(link)) urls.push(`https://img.youtube.com/vi/${youtube[1]}/hqdefault.jpg`);
    if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(link)) urls.push(link);
  }
  return urls;
}

function idDoDrive(link?: string | null) {
  if (!link || !/drive\.google|docs\.google/.test(link)) return null;
  return link.match(/\/d\/([\w-]+)/)?.[1] ?? link.match(/[?&]id=([\w-]+)/)?.[1] ?? null;
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
