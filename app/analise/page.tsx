"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, Documento, Municipio } from "@/lib/api";
import { usePerfil } from "@/lib/usePerfil";
import { normalizarLink } from "@/lib/linkIncorporavel";
import PreviewLink from "@/components/PreviewLink";
import { AnaliseBadge } from "@/components/AnaliseBadge";
import { AlertIcon, CalendarIcon, CheckIcon, FolderIcon, MapPinIcon, SearchIcon, UserIcon, XIcon } from "@/components/icons";

type Aba = "para_analisar" | "analisados" | "todos";

const SELECT =
  "w-full border border-black/10 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30";

function semAcento(texto?: string | null) {
  return (texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function formatarData(data?: string | null) {
  if (!data) return "";
  const [ano, mes, dia] = data.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
}

// Análise prévia: o Apoiador de Relatórios confere os documentos e as imagens e
// recomenda aprovar ou pede ajustes. A decisão final continua sendo do administrador.
export default function AnalisePage() {
  const { perfil, carregando } = usePerfil();
  const router = useRouter();
  const permitido = perfil?.role === "apoiador_relatorios" || perfil?.role === "admin";

  useEffect(() => {
    if (!carregando && !permitido) router.replace("/");
  }, [carregando, permitido, router]);

  if (carregando || !permitido) return null;
  return <FilaAnalise />;
}

function FilaAnalise() {
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("para_analisar");
  const [filtroMunicipio, setFiltroMunicipio] = useState("");
  const [busca, setBusca] = useState("");
  const [verId, setVerId] = useState<string | null>(null);
  const [ajustesId, setAjustesId] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const carregar = useCallback(() => {
    return apiGet("/api/documentos?status=pendente")
      .then((lista: Documento[]) => {
        setDocumentos(lista);
        setErro(null);
      })
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregar();
    apiGet("/api/municipios").then(setMunicipios).catch(() => null);
  }, [carregar]);

  const nomeMunicipio = useMemo(() => new Map(municipios.map((m) => [m.id, m.nome])), [municipios]);

  const contagem = useMemo(() => {
    const lista = documentos ?? [];
    const analisados = lista.filter((d) => d.analise_status).length;
    return { para_analisar: lista.length - analisados, analisados, todos: lista.length };
  }, [documentos]);

  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim());
    return (documentos ?? []).filter((d) => {
      if (aba === "para_analisar" && d.analise_status) return false;
      if (aba === "analisados" && !d.analise_status) return false;
      if (filtroMunicipio && String(d.municipio_id) !== filtroMunicipio) return false;
      if (!termo) return true;
      return [d.acao_evento, d.descricao, d.responsavel_nome, d.escolas?.nome, d.acoes_pedagogicas?.nome, nomeMunicipio.get(d.municipio_id)]
        .some((campo) => semAcento(campo).includes(termo));
    });
  }, [documentos, aba, filtroMunicipio, busca, nomeMunicipio]);

  async function enviarAnalise(doc: Documento, status: "recomendado" | "ajustes", obs = "") {
    setSalvandoId(doc.id);
    setErro(null);
    try {
      await apiPost("/api/analisar", { documento_id: doc.id, analise_status: status, analise_obs: obs });
      setAjustesId(null);
      setObservacao("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a análise.");
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-7">
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Análise de documentos</h1>
        <p className="mt-1 max-w-2xl text-sm text-brand-dark/80">
          Confira os relatórios, imagens e vídeos enviados. Recomende a aprovação ou peça ajustes: o administrador faz a
          validação final com a sua análise ao lado.
        </p>

        {erro && <div className="mt-4 rounded-lg bg-status-pendente/10 px-4 py-3 text-sm text-status-pendente" role="alert">{erro}</div>}

        <div className="mt-6 flex flex-col-reverse gap-3 border-b border-black/10 sm:flex-row sm:items-end sm:justify-between">
          <nav className="-mb-px flex gap-1 overflow-x-auto">
            {(
              [
                ["para_analisar", "Para analisar"],
                ["analisados", "Já analisados"],
                ["todos", "Todos"],
              ] as [Aba, string][]
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                onClick={() => setAba(valor)}
                className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  aba === valor ? "border-brand-light text-brand-light" : "border-transparent text-brand-dark/75 hover:text-brand-dark"
                }`}
              >
                {rotulo} ({contagem[valor]})
              </button>
            ))}
          </nav>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row">
            <select value={filtroMunicipio} onChange={(e) => setFiltroMunicipio(e.target.value)} className={`${SELECT} sm:w-56`} aria-label="Município">
              <option value="">Todos os municípios</option>
              {municipios.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
            <div className="relative sm:w-64">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-dark/60" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar..."
                className="w-full rounded-lg border border-black/10 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {!documentos && !erro && <p className="text-sm text-brand-dark/75">Carregando...</p>}
          {documentos && visiveis.length === 0 && (
            <div className="rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-brand-dark/75">
              {aba === "para_analisar" && !busca.trim() && !filtroMunicipio
                ? "🎉 Nada para analisar agora."
                : "Nenhum documento encontrado com esses filtros."}
            </div>
          )}

          {visiveis.map((doc) => {
            const link = doc.drive_file_link ?? doc.link_externo;
            const abrindoAjustes = ajustesId === doc.id;
            const salvando = salvandoId === doc.id;
            return (
              <article key={doc.id} className="rounded-xl border border-black/5 bg-white p-3 transition-shadow hover:shadow-sm sm:p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold leading-snug text-brand-dark">
                      {doc.tipos_documento?.nome ?? "Documento"}
                      {doc.acao_evento && <span className="font-semibold text-brand-dark/85"> — {doc.acao_evento}</span>}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-brand-dark/80">
                      <span className="inline-flex items-center gap-1 font-semibold"><MapPinIcon className="h-3.5 w-3.5" /> {nomeMunicipio.get(doc.municipio_id) ?? `Município ${doc.municipio_id}`}</span>
                      {doc.acoes_pedagogicas?.nome && (
                        <span className="inline-flex items-center gap-1"><FolderIcon className="h-3.5 w-3.5" /> {doc.acoes_pedagogicas.nome}{doc.subtipo ? ` · ${doc.subtipo}` : ""}</span>
                      )}
                      <span className="inline-flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" /> Realizado em {formatarData(doc.data_realizacao)}</span>
                      {doc.responsavel_nome && <span className="inline-flex items-center gap-1"><UserIcon className="h-3.5 w-3.5" /> Enviado por {doc.responsavel_nome}</span>}
                    </div>
                  </div>

                  {!abrindoAjustes && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        onClick={() => enviarAnalise(doc, "recomendado")}
                        disabled={salvando}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#2F9E62] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
                      >
                        <CheckIcon className="h-4 w-4" /> Recomendar aprovação
                      </button>
                      <button
                        onClick={() => { setAjustesId(doc.id); setObservacao(doc.analise_status === "ajustes" ? doc.analise_obs ?? "" : ""); }}
                        disabled={salvando}
                        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#F2B705] bg-[#FFF3CC] px-4 py-2 text-sm font-bold text-[#6E4B00] transition hover:bg-[#F2B705]/30 disabled:opacity-50"
                      >
                        <AlertIcon className="h-4 w-4" /> Pedir ajustes
                      </button>
                    </div>
                  )}
                </div>

                {doc.descricao && <p className="mt-2 whitespace-pre-line text-sm text-brand-dark/85">{doc.descricao}</p>}

                <AnaliseBadge doc={doc} />

                {link && (
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <button onClick={() => setVerId(verId === doc.id ? null : doc.id)} className="text-sm font-semibold text-brand-light hover:underline">
                      {verId === doc.id ? "Esconder arquivo" : "Ver arquivo aqui"}
                    </button>
                    <a href={normalizarLink(link) ?? undefined} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-light hover:underline">
                      Abrir em nova aba
                    </a>
                  </div>
                )}
                {verId === doc.id && (
                  <div className="mt-3">
                    <PreviewLink
                      link={link}
                      className="h-[60vh] w-full"
                      fallback={<p className="text-sm text-brand-dark/75">Este link não pode ser exibido aqui. Use &quot;Abrir em nova aba&quot;.</p>}
                    />
                  </div>
                )}

                {abrindoAjustes && (
                  <div className="mt-3 rounded-xl border border-[#F2B705]/50 bg-[#FFF8E1] p-3">
                    <label htmlFor={`obs-${doc.id}`} className="block text-sm font-bold text-[#6E4B00]">O que precisa ser ajustado?</label>
                    <textarea
                      id={`obs-${doc.id}`}
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      autoFocus
                      placeholder="Ex.: A imagem está escura; envie outra. O relatório não cita a escola."
                      className="mt-1.5 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F2B705]/40"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => enviarAnalise(doc, "ajustes", observacao)}
                        disabled={salvando || !observacao.trim()}
                        className="rounded-lg bg-[#F26122] px-4 py-2 text-sm font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
                      >
                        {salvando ? "Salvando..." : "Enviar análise"}
                      </button>
                      <button onClick={() => setAjustesId(null)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-brand-dark/80 hover:bg-black/5">
                        <XIcon className="h-4 w-4" /> Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
