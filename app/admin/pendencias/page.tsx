"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, Documento, Municipio, TipoDocumento } from "@/lib/api";
import { AdminGuard } from "@/components/AdminGuard";
import { StatusBadge } from "@/components/StatusBadge";
import PreviewLink from "@/components/PreviewLink";
import { linkIncorporavel, normalizarLink } from "@/lib/linkIncorporavel";
import { ANO_ATUAL, MES_ATUAL, MESES, anosParaSeletor, noPeriodo } from "@/lib/periodo";

export default function PendenciasPageGuarded() {
  return (
    <AdminGuard>
      <PendenciasPage />
    </AdminGuard>
  );
}

function PendenciasPage() {
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);
  // Status: abre em "Pendentes" se existir alguma pendência; senão, em "Todos".
  const [filtroStatus, setFiltroStatus] = useState<"" | "pendente" | "aprovado" | "rejeitado" | null>(null);
  const [filtroAno, setFiltroAno] = useState(ANO_ATUAL);
  const [filtroMes, setFiltroMes] = useState(MES_ATUAL);
  const [pendenciasTotais, setPendenciasTotais] = useState<Documento[]>([]);
  const [filtroMunicipio, setFiltroMunicipio] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [documentoParaRejeitar, setDocumentoParaRejeitar] = useState<Documento | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [documentoParaAprovar, setDocumentoParaAprovar] = useState<Documento | null>(null);
  const [publicarNaGaleria, setPublicarNaGaleria] = useState<boolean | null>(null);
  const [descricaoGaleria, setDescricaoGaleria] = useState("");

  function abrirAprovacao(doc: Documento) {
    const tipo = (doc.tipos_documento?.nome ?? "").toLowerCase();
    const ehMidia = /imagem|foto|v[ií]deo/.test(tipo);
    setDocumentoParaAprovar(doc);
    // já publicado: mantém a escolha; pendente: sugere "sim" para fotos/vídeos
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
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao aprovar documento.");
    } finally {
      setProcessando(null);
    }
  }

  function carregarPendencias() {
    return apiGet("/api/documentos?status=pendente")
      .then((lista: Documento[]) => {
        setPendenciasTotais(lista);
        return lista;
      })
      .catch(() => [] as Documento[]);
  }

  // Na primeira abertura decide o status padrão
  useEffect(() => {
    carregarPendencias().then((lista) => setFiltroStatus((atual) => (atual === null ? (lista.length ? "pendente" : "") : atual)));
  }, []);

  function carregar() {
    if (filtroStatus === null) return;
    carregarPendencias();
    const params = new URLSearchParams();
    if (filtroStatus) params.set("status", filtroStatus);
    if (filtroMunicipio) params.set("municipio_id", filtroMunicipio);
    if (filtroTipo) params.set("tipo_id", filtroTipo);
    const query = params.toString();
    apiGet(`/api/documentos${query ? `?${query}` : ""}`)
      .then(setDocumentos)
      .catch((e) => setErro(e.message));
  }

  useEffect(() => {
    apiGet("/api/municipios")
      .then(setMunicipios)
      .catch(() => null);
    apiGet("/api/tipos-documento")
      .then(setTipos)
      .catch(() => null);
  }, []);

  useEffect(() => {
    carregar();
    const intervalo = window.setInterval(carregar, 5000);
    return () => window.clearInterval(intervalo);
  }, [filtroStatus, filtroMunicipio, filtroTipo]);

  const nomeMunicipio = useMemo(() => {
    const mapa = new Map(municipios.map((m) => [String(m.id), m.nome]));
    return (id?: number | string) => (id !== undefined ? mapa.get(String(id)) ?? `Município #${id}` : "—");
  }, [municipios]);

  const documentosVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const doPeriodo = (documentos ?? []).filter((doc) => noPeriodo(doc.data_realizacao, filtroAno, filtroMes));
    if (!termo) return doPeriodo;
    return doPeriodo.filter((doc) =>
      [
        doc.descricao,
        doc.acao_evento,
        doc.tipos_documento?.nome,
        doc.escolas?.nome,
        doc.projetos?.nome,
        nomeMunicipio(doc.municipio_id),
      ]
        .filter(Boolean)
        .some((valor) => valor!.toLowerCase().includes(termo))
    );
  }, [busca, documentos, nomeMunicipio, filtroAno, filtroMes]);

  const anosDisponiveis = useMemo(
    () => anosParaSeletor((documentos ?? []).concat(pendenciasTotais).map((d) => d.data_realizacao), filtroAno),
    [documentos, pendenciasTotais, filtroAno]
  );
  // pendências que existem mas ficaram de fora por causa do ano/mês escolhido
  const pendenciasForaDoPeriodo = pendenciasTotais.filter(
    (d) =>
      !noPeriodo(d.data_realizacao, filtroAno, filtroMes) &&
      (!filtroMunicipio || String(d.municipio_id) === filtroMunicipio) &&
      (!filtroTipo || d.tipo_id === filtroTipo)
  ).length;
  const temFiltro = Boolean(
    filtroAno !== ANO_ATUAL || filtroMes !== MES_ATUAL || filtroMunicipio || filtroTipo || busca.trim() ||
      filtroStatus !== (pendenciasTotais.length ? "pendente" : "")
  );
  function limparFiltros() {
    setFiltroAno(ANO_ATUAL);
    setFiltroMes(MES_ATUAL);
    setFiltroMunicipio("");
    setFiltroTipo("");
    setBusca("");
    setFiltroStatus(pendenciasTotais.length ? "pendente" : "");
  }

  function driveEmbedUrl(link?: string) {
    const id = driveFileId(link);
    return id ? `https://drive.google.com/file/d/${id}/preview` : null;
  }

  function driveDirectUrl(link?: string) {
    const id = driveFileId(link);
    return id ? `https://drive.google.com/uc?export=download&id=${id}` : null;
  }

  function driveFileId(link?: string) {
    if (!link) return null;
    const match = link.match(/\/d\/([^/?]+)/) ?? link.match(/[?&]id=([^&]+)/);
    return match?.[1] ?? null;
  }

  async function validar(id: string, status: "aprovado" | "rejeitado") {
    setProcessando(id);
    try {
      await apiPost("/api/validar", {
        documento_id: id,
        status,
        motivo_rejeicao: status === "rejeitado" ? motivoRejeicao.trim() : undefined,
      });
      carregar();
      setDocumentoParaRejeitar(null);
      setMotivoRejeicao("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao validar documento.");
    } finally {
      setProcessando(null);
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-brand-dark mb-1">Documentos</h1>
      <p className="text-sm text-brand-dark/80 mb-6">
        Visão geral de todos os municípios. Use os filtros abaixo se quiser reduzir a lista.
      </p>

      <div className="bg-white border border-black/5 rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3">
          <label className="relative flex-1">
            <span className="sr-only">Buscar documentos</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por escola, descrição, projeto ou município..."
              className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm bg-brand-light/[0.03] focus:outline-none focus:ring-2 focus:ring-brand-light/30"
            />
          </label>
          <select
            value={filtroStatus ?? ""}
            onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}
            className="border border-black/10 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos os status</option>
            <option value="pendente">Pendentes{pendenciasTotais.length ? ` (${pendenciasTotais.length})` : ""}</option>
            <option value="aprovado">Aprovados</option>
            <option value="rejeitado">Rejeitados</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          <select
            value={filtroMunicipio}
            onChange={(e) => setFiltroMunicipio(e.target.value)}
            className="border border-black/10 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos os municípios</option>
            {municipios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="border border-black/10 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos os tipos de arquivo</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
          <select
            value={filtroAno}
            onChange={(e) => { setFiltroAno(e.target.value); if (!e.target.value) setFiltroMes(""); }}
            className="border border-black/10 rounded-lg px-3 py-2 text-sm bg-white"
            title="Pela data de realização"
          >
            <option value="">Todos os anos</option>
            {anosDisponiveis.map((ano) => <option key={ano} value={ano}>{ano}</option>)}
          </select>
          <select
            value={filtroMes}
            onChange={(e) => setFiltroMes(e.target.value)}
            disabled={!filtroAno}
            className="border border-black/10 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-black/[0.03] disabled:text-brand-dark/50"
          >
            <option value="">{filtroAno ? "Todos os meses" : "Escolha o ano"}</option>
            {MESES.map((mes, i) => <option key={mes} value={String(i + 1)}>{mes}</option>)}
          </select>
          {temFiltro && (
            <button onClick={limparFiltros} className="text-sm font-medium text-brand-light hover:underline self-center">
              Limpar filtros
            </button>
          )}
          <span className="text-xs text-brand-dark/70 self-center">
            {documentosVisiveis.length} {documentosVisiveis.length === 1 ? "documento" : "documentos"}
          </span>
        </div>
      </div>

      {erro && (
        <div className="rounded-md bg-status-pendente/10 text-status-pendente px-4 py-3 text-sm mb-6">
          {erro}
        </div>
      )}

      {(filtroStatus === "pendente" || filtroStatus === "") && pendenciasForaDoPeriodo > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-sm mb-4 flex flex-wrap items-center gap-2">
          ⚠️ Há {pendenciasForaDoPeriodo} {pendenciasForaDoPeriodo === 1 ? "pendência" : "pendências"} fora do período escolhido.
          <button
            onClick={() => { setFiltroAno(""); setFiltroMes(""); setFiltroStatus("pendente"); }}
            className="font-semibold underline"
          >
            Ver todas as pendências
          </button>
        </div>
      )}

      {!documentos && !erro && <p className="text-sm text-brand-dark/75">Carregando...</p>}
      {documentos && documentosVisiveis.length === 0 && (
        <p className="text-sm text-brand-dark/75">Nenhum documento encontrado com esse filtro.</p>
      )}

      <div className="space-y-3 max-w-5xl">
        {documentosVisiveis.map((doc) => (
          <div
            key={doc.id}
            className="bg-white rounded-xl border border-black/5 shadow-sm overflow-hidden"
          >
            <div className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/municipios/${doc.municipio_id}`}
                    className="text-xs font-semibold text-brand-light hover:underline"
                  >
                    {nomeMunicipio(doc.municipio_id)}
                  </Link>
                  {doc.projetos?.nome && (
                    <span className="text-xs text-brand-dark/75">· 🗂️ {doc.projetos.nome}</span>
                  )}
                  {doc.escolas?.nome && (
                    <span className="text-xs text-brand-dark/80">· 📍 {doc.escolas.nome}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {doc.status === "aprovado" && (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${doc.na_galeria ? "bg-sky-100 text-sky-800" : "bg-black/5 text-brand-dark/75"}`}>
                      {doc.na_galeria ? "🖼️ Na galeria" : "Fora da galeria"}
                    </span>
                  )}
                  {doc.status !== "pendente" && <StatusBadge status={doc.status} />}
                </div>
              </div>
              <p className="text-base font-semibold text-brand-dark truncate">
                {doc.tipos_documento?.nome} — {doc.acao_evento ?? "Sem ação/evento"}
              </p>
              <p className="text-sm text-brand-dark/85 mt-1">{doc.descricao}</p>
              {doc.na_galeria && doc.descricao_galeria && doc.descricao_galeria !== doc.descricao && (
                <p className="text-sm text-sky-900 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2 mt-2">
                  <span className="font-semibold">Texto na galeria:</span> {doc.descricao_galeria}
                </p>
              )}
              <p className="text-xs text-brand-dark/70 mt-2">Realizado em {doc.data_realizacao}</p>
              <div className="mt-2 mb-1">
                <PreviewLink link={doc.drive_file_link ?? doc.link_externo} className="w-full max-w-xs h-44" />
              </div>
              {(doc.drive_file_link || doc.link_externo) && (
                <a
                  href={normalizarLink(doc.drive_file_link ?? doc.link_externo) ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-light hover:underline inline-block"
                >
                  {!doc.drive_file_link ? "Abrir link em nova aba" : doc.tipos_documento?.nome?.toLowerCase().includes("vídeo") ? "Abrir vídeo em nova aba" : "Abrir em nova aba"}
                </a>
              )}
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-black/5">
              {doc.status === "pendente" ? (
                <>
                  <button
                    onClick={() => abrirAprovacao(doc)}
                    disabled={processando === doc.id}
                    className="px-3 py-1.5 rounded-md bg-status-completo text-white text-xs font-medium disabled:opacity-50"
                  >
                    Aprovar
                  </button>
                  <button
                    onClick={() => {
                      setDocumentoParaRejeitar(doc);
                      setMotivoRejeicao("");
                    }}
                    disabled={processando === doc.id}
                    className="px-3 py-1.5 rounded-md bg-status-pendente text-white text-xs font-medium disabled:opacity-50"
                  >
                    Rejeitar
                  </button>
                </>
              ) : doc.status === "aprovado" ? (
                <>
                  <button
                    onClick={() => abrirAprovacao(doc)}
                    className="px-3 py-1.5 rounded-md border border-sky-200 text-sky-800 bg-sky-50 text-xs font-medium hover:bg-sky-100"
                  >
                    {doc.na_galeria ? "Editar publicação na galeria" : "Publicar na galeria"}
                  </button>
                  <span className="text-xs text-brand-dark/70">Documento aprovado.</span>
                </>
              ) : (
                <span className="text-xs text-brand-dark/70">
                  Rejeitado{doc.motivo_rejeicao ? `: ${doc.motivo_rejeicao}` : "."}
                </span>
              )}
              </div>
            </div>
          </div>
        ))}
      </div>


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

      {documentoParaRejeitar && (
        <div className="fixed inset-0 z-50 bg-brand-dark/30 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (motivoRejeicao.trim()) validar(documentoParaRejeitar.id, "rejeitado");
            }}
            className="w-full max-w-md bg-white rounded-xl shadow-xl p-6"
          >
            <h2 className="text-lg font-semibold text-brand-dark">Rejeitar documento?</h2>
            <p className="text-sm text-brand-dark/80 mt-1 mb-4">
              Informe o que precisa ser corrigido para orientar o responsável pelo envio.
            </p>
            <label htmlFor="motivo-rejeicao" className="block text-sm font-medium text-brand-dark/90 mb-1.5">
              Motivo da rejeição <span className="text-status-pendente">*</span>
            </label>
            <textarea
              id="motivo-rejeicao"
              value={motivoRejeicao}
              onChange={(e) => setMotivoRejeicao(e.target.value)}
              placeholder="Ex.: a escola selecionada não corresponde ao documento."
              rows={4}
              maxLength={500}
              autoFocus
              required
              className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-light/30"
            />
            <p className="text-xs text-brand-dark/70 text-right mt-1">{motivoRejeicao.length}/500</p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setDocumentoParaRejeitar(null)}
                className="px-3 py-2 rounded-lg border border-black/10 text-sm font-medium text-brand-dark/85 hover:bg-brand-light/5"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!motivoRejeicao.trim() || processando === documentoParaRejeitar.id}
                className="px-3 py-2 rounded-lg bg-status-pendente text-white text-sm font-medium disabled:opacity-50"
              >
                Confirmar rejeição
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
