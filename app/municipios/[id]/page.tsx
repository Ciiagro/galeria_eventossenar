"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiDelete, apiGet, Documento, Municipio } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { SearchIcon, XIcon } from "@/components/icons";
import PreviewLink from "@/components/PreviewLink";
import { linkIncorporavel, normalizarLink } from "@/lib/linkIncorporavel";

export default function MunicipioDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);
  const [municipio, setMunicipio] = useState<Municipio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroEscola, setFiltroEscola] = useState("");
  const [filtroProjeto, setFiltroProjeto] = useState("");
  const [filtroAno, setFiltroAno] = useState("");
  const [filtroMes, setFiltroMes] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca, setBusca] = useState("");

  // Chegando do painel com ?ano=2026&mes=9, já abre filtrado
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFiltroAno(params.get("ano") ?? "");
    setFiltroMes(params.get("ano") ? params.get("mes") ?? "" : "");
  }, []);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

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

  const escolasDisponiveis = Array.from(
    new Map((documentos ?? []).filter((d) => d.escolas?.nome).map((d) => [d.escola_id, d.escolas!.nome])).entries()
  );
  const projetosDisponiveis = Array.from(
    new Map((documentos ?? []).filter((d) => d.projetos?.nome).map((d) => [d.projeto_id, d.projetos!.nome])).entries()
  );

  const anosDisponiveis = Array.from(
    new Set((documentos ?? []).map((d) => d.data_realizacao?.slice(0, 4)).filter(Boolean) as string[])
  ).sort((a, b) => Number(b) - Number(a));

  const documentosFiltrados = (documentos ?? []).filter(
    (d) =>
      (!filtroEscola || d.escola_id === filtroEscola) &&
      (!filtroProjeto || d.projeto_id === filtroProjeto) &&
      (!filtroAno || d.data_realizacao?.slice(0, 4) === filtroAno) &&
      (!filtroAno || !filtroMes || Number(d.data_realizacao?.slice(5, 7)) === Number(filtroMes)) &&
      (!filtroStatus || d.status === filtroStatus) &&
      correspondeBusca(d, busca)
  );
  const temFiltro = Boolean(filtroEscola || filtroProjeto || filtroAno || filtroMes || filtroStatus || busca.trim());
  function limparFiltros() {
    setFiltroEscola(""); setFiltroProjeto(""); setFiltroAno(""); setFiltroMes(""); setFiltroStatus(""); setBusca("");
  }

  // Período = da primeira à última data de realização dos documentos exibidos
  const datasRealizacao = documentosFiltrados.map((d) => d.data_realizacao).filter(Boolean).sort();
  const periodoInicio = datasRealizacao[0];
  const periodoFim = datasRealizacao[datasRealizacao.length - 1];
  const textoPeriodo = !periodoInicio
    ? "sem ações registradas"
    : periodoInicio === periodoFim
      ? formatarData(periodoInicio)
      : `${formatarData(periodoInicio)} a ${formatarData(periodoFim)}`;

  const porTipo = documentosFiltrados.reduce<Record<string, Documento[]>>((acc, doc) => {
    const nome = doc.tipos_documento?.nome ?? "Outros";
    (acc[nome] ??= []).push(doc);
    return acc;
  }, {});

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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/" className="text-sm text-brand-dark/75 hover:underline">
            ← Municípios
          </Link>
          <h1 className="text-2xl font-semibold text-brand-dark mt-1">{municipio?.nome ?? "Documentos do município"}</h1>
          <p className="text-sm text-brand-dark/80 mt-1">Período das ações (data da realização): <strong className="text-brand-dark/90">{textoPeriodo}</strong></p>
        </div>
        <Link
          href={`/municipios/${id}/novo-documento`}
          className="bg-brand-light text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-brand-accent"
        >
          + Adicionar documento
        </Link>
      </div>

      {erro && (
        <div className="rounded-md bg-status-pendente/10 text-status-pendente px-4 py-3 text-sm mb-6">
          Não foi possível carregar os documentos: {erro}
        </div>
      )}

      {!documentos && !erro && <p className="text-sm text-brand-dark/75">Carregando...</p>}

      {documentos && documentos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative w-full sm:w-80">
            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark/60" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar ação, descrição, escola ou programa..."
              className="w-full border border-black/10 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30"
            />
          </div>
          <select
            value={filtroProjeto}
            onChange={(e) => setFiltroProjeto(e.target.value)}
            className="border border-black/10 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos os programas</option>
            {projetosDisponiveis.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
          <select
            value={filtroEscola}
            onChange={(e) => setFiltroEscola(e.target.value)}
            className="border border-black/10 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Todas as escolas</option>
            {escolasDisponiveis.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
          <select
            value={filtroAno}
            onChange={(e) => { setFiltroAno(e.target.value); if (!e.target.value) setFiltroMes(""); }}
            className="border border-black/10 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos os anos</option>
            {anosDisponiveis.map((ano) => (
              <option key={ano} value={ano}>{ano}</option>
            ))}
          </select>
          <select
            value={filtroMes}
            onChange={(e) => setFiltroMes(e.target.value)}
            disabled={!filtroAno}
            className="border border-black/10 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50"
          >
            <option value="">Todos os meses</option>
            {MESES.map((mes, i) => (
              <option key={mes} value={String(i + 1)}>{mes}</option>
            ))}
          </select>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="border border-black/10 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos os status</option>
            <option value="pendente">Pendentes</option>
            <option value="aprovado">Aprovados</option>
            <option value="rejeitado">Rejeitados</option>
          </select>
          {temFiltro && (
            <button onClick={limparFiltros} className="text-sm font-medium text-brand-light hover:underline">
              Limpar filtros
            </button>
          )}
          <span className="text-sm text-brand-dark/75 sm:ml-auto">
            {documentosFiltrados.length} de {documentos.length} documento{documentos.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      <div className="space-y-8">
        {Object.entries(porTipo).map(([tipo, docs]) => (
          <section key={tipo}>
            <h2 className="text-sm font-semibold text-brand-dark/85 uppercase tracking-wide mb-3">
              {tipo} · {docs.length} arquivo{docs.length !== 1 ? "s" : ""}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {docs.map((doc) => (
                <div key={doc.id} className="bg-white rounded-lg border border-black/5 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium truncate pr-2">
                      {doc.acao_evento ?? "Sem ação/evento"}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {doc.status === "aprovado" && doc.na_galeria && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sky-100 text-sky-800" title="Publicado na galeria pública">
                          🖼️ Na galeria
                        </span>
                      )}
                      <StatusBadge status={doc.status} />
                      {doc.status === "pendente" && (
                        <button
                          type="button"
                          onClick={() => excluirDocumento(doc)}
                          disabled={excluindoId === doc.id}
                          className="inline-flex items-center gap-1 text-xs text-status-pendente hover:underline disabled:opacity-50"
                          title="Excluir documento pendente"
                        >
                          <XIcon className="w-3.5 h-3.5" />
                          {excluindoId === doc.id ? "Excluindo..." : "Excluir"}
                        </button>
                      )}
                    </div>
                  </div>
                  {doc.projetos?.nome && (
                    <p className="text-xs text-brand-dark/80 mb-1">🗂️ {doc.projetos.nome}</p>
                  )}
                  {doc.escolas?.nome && (
                    <p className="text-xs text-brand-dark/80 mb-1">📍 {doc.escolas.nome}</p>
                  )}
                  <p className="text-xs text-brand-dark/80 mb-2">Realizado em {formatarData(doc.data_realizacao)}</p>
                  {doc.descricao && (
                    <p className="text-xs text-brand-dark/85 line-clamp-2">{doc.descricao}</p>
                  )}
                  {(doc.drive_file_link || doc.link_externo) && (
                    <>
                      <div className="mt-2">
                        <PreviewLink link={doc.drive_file_link ?? doc.link_externo} className="w-full max-w-sm h-48" />
                      </div>
                      {driveEmbedUrl(doc.drive_file_link) && tipo.toLowerCase().includes("vídeo") && (
                        <p className="text-xs text-brand-dark/70 mt-1 max-w-sm">
                          Vídeos recém-enviados podem aparecer como &quot;sendo processado&quot; por alguns minutos enquanto o Google Drive prepara a reprodução.
                        </p>
                      )}
                      <a
                        href={normalizarLink(doc.drive_file_link ?? doc.link_externo) ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-brand-light hover:underline mt-2 inline-block"
                      >
                        {!doc.drive_file_link ? "Abrir link em nova aba" : tipo.toLowerCase().includes("vídeo") ? "Abrir vídeo em nova aba" : "Abrir em nova aba"}
                      </a>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        {documentos && documentos.length === 0 && (
          <p className="text-sm text-brand-dark/75">Nenhum documento enviado ainda.</p>
        )}
        {documentos && documentos.length > 0 && documentosFiltrados.length === 0 && (
          <p className="text-sm text-brand-dark/75">Nenhum documento encontrado com esse filtro.</p>
        )}
      </div>
    </div>
  );
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function formatarData(data?: string | null) {
  if (!data) return "—";
  const [ano, mes, dia] = data.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function normalizarTexto(texto?: string | null) {
  return (texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function correspondeBusca(doc: Documento, busca: string) {
  const termo = normalizarTexto(busca.trim());
  if (!termo) return true;
  const campos = [
    doc.acao_evento,
    doc.descricao,
    doc.finalidade,
    doc.responsavel_nome,
    doc.escolas?.nome,
    doc.projetos?.nome,
    doc.tipos_documento?.nome,
    formatarData(doc.data_realizacao),
  ];
  return campos.some((campo) => normalizarTexto(campo).includes(termo));
}
