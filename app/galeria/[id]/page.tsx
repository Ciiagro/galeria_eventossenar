"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost, DocumentoGaleria, EscolaParticipanteGaleria, Municipio } from "@/lib/api";
import EscolasParticipantes from "@/components/EscolasParticipantes";
import PreviewLink from "@/components/PreviewLink";
import { linkIncorporavel, normalizarLink } from "@/lib/linkIncorporavel";

export default function GaleriaMunicipioPage() {
  const { id } = useParams<{ id: string }>();
  const [documentos, setDocumentos] = useState<DocumentoGaleria[] | null>(null);
  const [municipio, setMunicipio] = useState<Municipio | null>(null);
  const [escolas, setEscolas] = useState<EscolaParticipanteGaleria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [curtidos, setCurtidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiGet(`/api/galeria?municipio_id=${id}&escolas=1`)
      .then(setEscolas)
      .catch(() => setEscolas([]));

    apiGet(`/api/galeria?municipio_id=${id}`)
      .then((docs: DocumentoGaleria[]) => {
        setDocumentos(docs);
        // Marca uma visualização por item, uma vez por carregamento (best-effort).
        docs.forEach((d) => apiPost("/api/galeria", { acao: "visualizar", documento_id: d.id }).catch(() => null));
      })
      .catch((e) => setErro(e.message));

    apiGet("/api/galeria?municipios=1")
      .then((lista: Municipio[]) => setMunicipio(lista.find((m) => String(m.id) === id) ?? null))
      .catch(() => null);
  }, [id]);

  async function curtir(docId: string) {
    if (curtidos.has(docId)) return; // evita curtir várias vezes na mesma visita
    setCurtidos((atual) => new Set(atual).add(docId));
    try {
      const resp = await apiPost("/api/galeria", { acao: "curtir", documento_id: docId });
      setDocumentos((atual) =>
        atual ? atual.map((d) => (d.id === docId ? { ...d, curtidas: resp.curtidas } : d)) : atual
      );
    } catch {
      // se falhar, permite tentar de novo
      setCurtidos((atual) => {
        const novo = new Set(atual);
        novo.delete(docId);
        return novo;
      });
    }
  }

  const ehVideo = (d: DocumentoGaleria) => d.tipos_documento?.nome === "Vídeos";

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

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-brand text-white px-4 sm:px-8 py-6">
        <Link href="/galeria" className="text-white/80 text-sm hover:underline">
          ← Trocar município
        </Link>
        <h1 className="text-2xl sm:text-3xl font-semibold mt-1">
          {municipio?.nome ?? "Galeria"}
        </h1>
        <p className="text-white/80 text-sm mt-1">Fotos e vídeos aprovados das ações realizadas.</p>
      </header>

      <main className="p-4 sm:p-8">
        {erro && (
          <div className="rounded-md bg-status-pendente/10 text-status-pendente px-4 py-3 text-sm mb-6 max-w-2xl">
            {erro}
          </div>
        )}
        {!documentos && !erro && <p className="text-sm text-brand-dark/75">Carregando...</p>}
        {documentos && documentos.length === 0 && (
          <p className="text-sm text-brand-dark/75">Ainda não há fotos ou vídeos aprovados pra esse município.</p>
        )}

        {escolas && (
          <div className="max-w-7xl mx-auto mb-6">
            <EscolasParticipantes escolas={escolas} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-7xl mx-auto">
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
