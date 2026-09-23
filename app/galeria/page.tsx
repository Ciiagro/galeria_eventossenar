"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost, DocumentoGaleria, EscolaParticipanteGaleria, Municipio, RankingMunicipio } from "@/lib/api";
import EscolasParticipantes from "@/components/EscolasParticipantes";
import PreviewLink from "@/components/PreviewLink";
import { linkIncorporavel, normalizarLink } from "@/lib/linkIncorporavel";

export default function GaleriaPage() {
  return (
    <Suspense fallback={null}>
      <GaleriaConteudo />
    </Suspense>
  );
}

function GaleriaConteudo() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const municipioId = searchParams.get("municipio_id") ?? "";

  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [ranking, setRanking] = useState<RankingMunicipio[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoGaleria[] | null>(null);
  const [escolas, setEscolas] = useState<EscolaParticipanteGaleria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [curtidos, setCurtidos] = useState<Set<string>>(new Set());

  // Carrega municípios e ranking uma vez só.
  useEffect(() => {
    apiGet("/api/galeria?municipios=1").then(setMunicipios).catch(() => null);
    apiGet("/api/galeria?ranking=1").then(setRanking).catch(() => null);
  }, []);

  // Carrega o feed (misturado ou filtrado) toda vez que o município muda.
  useEffect(() => {
    setDocumentos(null);
    const query = municipioId ? `?municipio_id=${municipioId}` : "";
    apiGet(`/api/galeria${query}`)
      .then((docs: DocumentoGaleria[]) => {
        setDocumentos(docs);
        docs.forEach((d) => apiPost("/api/galeria", { acao: "visualizar", documento_id: d.id }).catch(() => null));
      })
      .catch((e) => setErro(e.message));

    setEscolas(null);
    if (municipioId) {
      apiGet(`/api/galeria?municipio_id=${municipioId}&escolas=1`)
        .then(setEscolas)
        .catch(() => setEscolas([]));
    }
  }, [municipioId]);

  function mudarMunicipio(novoId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (novoId) params.set("municipio_id", novoId);
    else params.delete("municipio_id");
    router.replace(`/galeria${params.toString() ? `?${params}` : ""}`);
  }

  async function curtir(docId: string) {
    if (curtidos.has(docId)) return;
    setCurtidos((atual) => new Set(atual).add(docId));
    try {
      const resp = await apiPost("/api/galeria", { acao: "curtir", documento_id: docId });
      setDocumentos((atual) =>
        atual ? atual.map((d) => (d.id === docId ? { ...d, curtidas: resp.curtidas } : d)) : atual
      );
    } catch {
      setCurtidos((atual) => {
        const novo = new Set(atual);
        novo.delete(docId);
        return novo;
      });
    }
  }

  const ehVideo = (d: DocumentoGaleria) => d.tipos_documento?.nome === "Vídeos";
  const nomeMunicipio = (id?: number) => municipios.find((m) => m.id === id)?.nome;

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

  const municipioAtual = municipios.find((m) => String(m.id) === municipioId);

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-brand text-white px-4 sm:px-8 py-6">
        <h1 className="text-2xl sm:text-3xl font-semibold">
          {municipioAtual ? municipioAtual.nome : "Galeria de Ações"}
        </h1>
        <p className="text-white/80 text-sm mt-1">
          {municipioAtual
            ? "Fotos e vídeos aprovados das ações realizadas."
            : "Fotos e vídeos das ações realizadas nos municípios do Ceará."}
        </p>
      </header>

      <main className="p-4 sm:p-8 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <select
            value={municipioId}
            onChange={(e) => mudarMunicipio(e.target.value)}
            className="border border-black/10 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos os municípios</option>
            {municipios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>

        {erro && (
          <div className="rounded-md bg-status-pendente/10 text-status-pendente px-4 py-3 text-sm mb-6 max-w-2xl">
            {erro}
          </div>
        )}

        {!municipioAtual && ranking.length > 0 && (
          <div className="bg-white rounded-xl border border-black/5 p-5 mb-6">
            <h2 className="text-sm font-semibold text-brand-dark mb-3">Municípios em destaque</h2>
            <div className="flex flex-wrap gap-2">
              {ranking.slice(0, 10).map((r, i) => (
                <button
                  key={r.municipio_id}
                  onClick={() => mudarMunicipio(String(r.municipio_id))}
                  className="text-xs px-3 py-1.5 rounded-full border border-black/10 hover:bg-brand-light/10 transition-colors"
                >
                  <span className="text-brand-dark/70 mr-1">{i + 1}º</span>
                  {r.nome} <span className="text-brand-light font-medium">· {r.total}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {municipioAtual && escolas && (
          <div className="mb-6">
            <EscolasParticipantes escolas={escolas} />
          </div>
        )}

        {!documentos && !erro && <p className="text-sm text-brand-dark/75">Carregando...</p>}
        {documentos && documentos.length === 0 && (
          <p className="text-sm text-brand-dark/75">
            {municipioAtual
              ? "Ainda não há fotos ou vídeos aprovados pra esse município."
              : "Ainda não há fotos ou vídeos aprovados."}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {documentos?.map((doc) => (
            <div key={doc.id} className="bg-white rounded-xl border border-black/5 shadow-sm overflow-hidden flex flex-col">
              <div className="aspect-video bg-black/5 flex items-center justify-center">
                {linkIncorporavel(doc.drive_file_link ?? doc.link_externo) ? (
                  <PreviewLink link={doc.drive_file_link ?? doc.link_externo} className="w-full h-full !min-h-0 !rounded-none !border-0" />
                ) : doc.link_externo ? (
                  <a
                    href={normalizarLink(doc.link_externo) ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-light text-sm font-medium flex flex-col items-center gap-1 p-4"
                  >
                    <span className="text-3xl">{ehVideo(doc) ? "▶️" : "🖼️"}</span>
                    {ehVideo(doc) ? "Assistir vídeo" : "Ver foto"}
                  </a>
                ) : (
                  <span className="text-3xl">{ehVideo(doc) ? "▶️" : "🖼️"}</span>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col gap-1">
                {!municipioAtual && (
                  <button
                    onClick={() => mudarMunicipio(String(doc.municipio_id))}
                    className="text-xs font-semibold text-brand-light hover:underline text-left w-fit"
                  >
                    {nomeMunicipio(doc.municipio_id) ?? "Município"}
                  </button>
                )}
                {(doc.projetos?.nome || doc.escolas?.nome) && (
                  <p className="text-xs text-brand-dark/75">
                    {[doc.projetos?.nome, doc.escolas?.nome].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="text-sm font-medium text-brand-dark">{doc.descricao || doc.tipos_documento?.nome}</p>
                <p className="text-xs text-brand-dark/70">{doc.data_realizacao}</p>
                <div className="mt-auto pt-2 flex items-center justify-between">
                  <span className="text-xs text-brand-dark/70">👁️ {doc.visualizacoes}</span>
                  <button
                    onClick={() => curtir(doc.id)}
                    disabled={curtidos.has(doc.id)}
                    className={`text-sm flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                      curtidos.has(doc.id) ? "text-status-pendente" : "text-brand-dark/75 hover:text-status-pendente"
                    }`}
                  >
                    {curtidos.has(doc.id) ? "❤️" : "🤍"} {doc.curtidas}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
