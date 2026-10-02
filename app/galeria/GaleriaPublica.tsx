"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiPost, DocumentoGaleria, EscolaParticipanteGaleria } from "@/lib/api";
import MapaCearaGaleria, { COR_PARTICIPANTE } from "@/components/MapaCearaGaleria";
import PreviewLink from "@/components/PreviewLink";
import { normalizarLink } from "@/lib/linkIncorporavel";
import { urlsMiniatura } from "@/lib/miniatura";
import { useFiltroCiclo } from "@/lib/ciclos";
import { FundoFestivo, LogoValores } from "@/components/Sol";
import { IconeAcao } from "@/components/IconesAcoes";

type Ordem = "recentes" | "antigas";
type MunicipioGaleria = { id: number; nome: string; publicacoes: number };
type Resumo = { municipios: number; escolas: number; publicacoes: number; visualizacoes: number };

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function GaleriaPublica() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const municipioId = searchParams.get("municipio_id") ?? "";

  // dados
  const [municipios, setMunicipios] = useState<MunicipioGaleria[]>([]);
  const [escolasMapa, setEscolasMapa] = useState<EscolaParticipanteGaleria[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [documentos, setDocumentos] = useState<DocumentoGaleria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // ciclo (cada ano é um ciclo): abre no ativo; "" = todos
  const { ciclos, cicloId, setCicloId, ehPadrao: cicloPadrao, carregando: carregandoCiclos } = useFiltroCiclo(true);
  const parametroCiclo = cicloId ? `ciclo_id=${cicloId}` : "";

  // filtros
  const [categoria, setCategoria] = useState("");
  const [periodo, setPeriodo] = useState(""); // "AAAA-MM"
  const [acaoPed, setAcaoPed] = useState("");
  const [escola, setEscola] = useState("");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recentes");

  // interação
  const [destaqueId, setDestaqueId] = useState<number | null>(null);
  const [aberto, setAberto] = useState<DocumentoGaleria | null>(null);
  const [curtidos, setCurtidos] = useState<Set<string>>(new Set());
  const escolaPendente = useRef<string | null>(null);
  const listaRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (carregandoCiclos) return;
    const extra = parametroCiclo ? `&${parametroCiclo}` : "";
    apiGet(`/api/galeria?municipios=1${extra}`).then(setMunicipios).catch(() => null);
    apiGet(`/api/galeria?mapa=1${extra}`).then(setEscolasMapa).catch(() => null);
    apiGet(`/api/galeria?resumo=1${extra}`).then(setResumo).catch(() => null);
  }, [carregandoCiclos, parametroCiclo]);

  useEffect(() => {
    if (carregandoCiclos) return;
    setDocumentos(null);
    setAcaoPed("");
    setEscola(escolaPendente.current ?? "");
    escolaPendente.current = null;
    const consulta = [municipioId ? `municipio_id=${municipioId}` : "", parametroCiclo].filter(Boolean).join("&");
    apiGet(`/api/galeria${consulta ? `?${consulta}` : ""}`)
      .then(setDocumentos)
      .catch((e) => setErro(e.message));
    if (municipioId) setDestaqueId(Number(municipioId));
  }, [municipioId, carregandoCiclos, parametroCiclo]);

  function mudarMunicipio(novoId: string) {
    router.replace(novoId ? `/galeria?municipio_id=${novoId}` : "/galeria", { scroll: false });
  }
  function irParaLista() {
    setTimeout(() => listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
  }

  const nomeMunicipio = useMemo(() => {
    const mapa = new Map(municipios.map((m) => [m.id, m.nome]));
    return (id?: number | null) => (id != null ? mapa.get(Number(id)) ?? "" : "");
  }, [municipios]);

  const municipiosParticipantes = useMemo(() => {
    const ids = new Set<number>(municipios.map((m) => m.id));
    escolasMapa.forEach((e) => e.municipio_id && ids.add(e.municipio_id));
    return ids;
  }, [municipios, escolasMapa]);

  // ---------- filtros ----------
  const categorias = useMemo(
    () => Array.from(new Set((documentos ?? []).map((d) => rotuloTipo(d)))).sort(),
    [documentos]
  );
  const periodos = useMemo(
    () => Array.from(new Set((documentos ?? []).map((d) => (d.data_realizacao ?? "").slice(0, 7)).filter((p) => /^\d{4}-\d{2}$/.test(p)))).sort().reverse(),
    [documentos]
  );
  const acoesPedagogicas = useMemo(
    () => Array.from(new Set((documentos ?? []).map((d) => d.acoes_pedagogicas?.nome).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [documentos]
  );
  const escolasOpcoes = useMemo(
    () =>
      Array.from(new Set((documentos ?? []).filter((d) => !acaoPed || d.acoes_pedagogicas?.nome === acaoPed).map((d) => d.escolas?.nome).filter(Boolean) as string[])).sort(),
    [documentos, acaoPed]
  );

  const lista = useMemo(() => {
    const termo = normalizar(busca.trim());
    const filtrada = (documentos ?? []).filter(
      (d) =>
        (!categoria || rotuloTipo(d) === categoria) &&
        (!periodo || (d.data_realizacao ?? "").startsWith(periodo)) &&
        (!acaoPed || d.acoes_pedagogicas?.nome === acaoPed) &&
        (!escola || d.escolas?.nome === escola) &&
        (!termo || [d.acao_evento, d.acoes_pedagogicas?.nome, d.descricao, d.escolas?.nome, nomeMunicipio(d.municipio_id)].some((v) => normalizar(v).includes(termo)))
    );
    return [...filtrada].sort((a, b) => (ordem === "recentes" ? chaveData(b).localeCompare(chaveData(a)) : chaveData(a).localeCompare(chaveData(b))));
  }, [documentos, categoria, periodo, acaoPed, escola, busca, ordem, nomeMunicipio]);

  const destaques = useMemo(() => [...lista].sort((a, b) => chaveData(b).localeCompare(chaveData(a))).slice(0, 3), [lista]);

  // Município do painel: o escolhido no mapa/filtro; senão, o da ação mais recente
  const idPainel = destaqueId ?? destaques[0]?.municipio_id ?? null;
  const acoesDoPainel = useMemo(
    () => (documentos ?? []).filter((d) => d.municipio_id === idPainel).sort((a, b) => chaveData(b).localeCompare(chaveData(a))),
    [documentos, idPainel]
  );
  const infoPainel = idPainel
    ? {
        nome: nomeMunicipio(idPainel),
        escolas: escolasMapa.filter((e) => e.municipio_id === idPainel).length,
        publicacoes: municipios.find((m) => m.id === idPainel)?.publicacoes ?? acoesDoPainel.length,
        ultima: acoesDoPainel[0]?.data_realizacao,
      }
    : null;

  // ---------- ações ----------
  function abrir(doc: DocumentoGaleria) {
    setAberto(doc);
    apiPost("/api/galeria", { acao: "visualizar", documento_id: doc.id })
      .then((resp) => resp?.visualizacoes !== undefined && atualizar(doc.id, { visualizacoes: resp.visualizacoes }))
      .catch(() => null);
  }
  function atualizar(id: string, campos: Partial<DocumentoGaleria>) {
    setDocumentos((atual) => atual?.map((d) => (d.id === id ? { ...d, ...campos } : d)) ?? atual);
    setAberto((atual) => (atual?.id === id ? { ...atual, ...campos } : atual));
  }
  async function curtir(doc: DocumentoGaleria) {
    if (curtidos.has(doc.id)) return;
    setCurtidos((atual) => new Set(atual).add(doc.id));
    atualizar(doc.id, { curtidas: doc.curtidas + 1 });
    try {
      const resp = await apiPost("/api/galeria", { acao: "curtir", documento_id: doc.id });
      if (resp?.curtidas !== undefined) atualizar(doc.id, { curtidas: resp.curtidas });
    } catch {
      atualizar(doc.id, { curtidas: doc.curtidas });
      setCurtidos((atual) => { const novo = new Set(atual); novo.delete(doc.id); return novo; });
    }
  }
  function verAcoesDaEscola(e: EscolaParticipanteGaleria) {
    if (String(e.municipio_id) === municipioId) { setAcaoPed(""); setEscola(e.nome); }
    else { escolaPendente.current = e.nome; mudarMunicipio(String(e.municipio_id)); }
    irParaLista();
  }
  function limparFiltros() {
    setBusca(""); setCategoria(""); setPeriodo(""); setAcaoPed(""); setEscola(""); setDestaqueId(null); setCicloId(null);
    mudarMunicipio("");
  }

  const temFiltro = Boolean(municipioId || categoria || periodo || acaoPed || escola || busca || !cicloPadrao);

  return (
    <div className="min-h-screen bg-[#f3f7f2] text-brand-dark">
      {/* ================= Topo ================= */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-black/5 overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 h-16 flex items-center gap-4 sm:gap-8">
          <a href="/galeria" className="flex items-center gap-2 shrink-0">
            <LogoSenar />
            <span className="leading-none">
              <span className="block text-lg font-extrabold tracking-tight text-brand">SENAR</span>
              <span className="block text-xs font-semibold text-brand-light">Ceará</span>
            </span>
          </a>
          <span className="hidden sm:inline-flex items-center gap-1.5 self-stretch border-b-2 border-brand-light px-1 text-sm font-semibold text-brand-light">
            🗺️ Galeria
          </span>
          <div className="relative flex-1 max-w-xl mx-auto">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-dark/50">⌕</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar ações, escolas, municípios..."
              className="w-full rounded-full border border-black/10 bg-[#f6f8f5] pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30"
            />
          </div>
          <div className="hidden lg:flex items-center gap-4 shrink-0">
            <p className="border-l-2 border-brand pl-3 text-xs font-bold leading-tight text-brand max-w-[150px]">
              Juntos pelo desenvolvimento do nosso campo.
            </p>
            <span className="relative -mr-8 h-16 w-28" aria-hidden>
              <span className="absolute inset-y-0 right-10 w-6 -skew-x-[35deg] bg-brand" />
              <span className="absolute inset-y-0 right-4 w-6 -skew-x-[35deg] bg-brand-light" />
              <span className="absolute inset-y-0 -right-2 w-6 -skew-x-[35deg] bg-lime-400" />
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 py-6 space-y-5">
        {/* ================= Título + números ================= */}
        <FundoFestivo className="rounded-2xl border border-black/5">
          <section className="grid gap-5 p-5 sm:p-8">
            <div className="pr-24 sm:pr-44 lg:pr-56">
              <LogoValores className="w-44 sm:w-56" />
              <h1 className="mt-3 text-2xl sm:text-3xl font-bold">
                {municipioId && nomeMunicipio(Number(municipioId)) ? `Galeria de ${nomeMunicipio(Number(municipioId))}` : "Galeria de Publicações"}
              </h1>
              <p className="text-brand-dark/80">
                As ações das escolas e municípios do Ceará{ciclos.find((c) => c.id === cicloId) ? ` · ${ciclos.find((c) => c.id === cicloId)!.nome}` : ""}.
              </p>
            </div>
            {resumo && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Numero icone="📍" rotulo="Municípios participantes" valor={resumo.municipios} />
                <Numero icone="🏫" rotulo="Escolas" valor={resumo.escolas} />
                <Numero icone="📄" rotulo="Publicações" valor={resumo.publicacoes} />
                <Numero icone="👁️" rotulo="Visualizações" valor={resumo.visualizacoes} />
              </div>
            )}
          </section>
        </FundoFestivo>

        {/* ================= Filtros ================= */}
        <div className="flex flex-wrap items-center gap-2">
          {ciclos.length > 0 && (
            <Filtro icone="☀️" valor={cicloId} onChange={setCicloId}>
              <option value="">Todos os ciclos</option>
              {ciclos.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.ativo ? " (atual)" : ""}</option>)}
            </Filtro>
          )}
          <Filtro icone="📍" valor={municipioId} onChange={mudarMunicipio}>
            <option value="">Todos os municípios</option>
            {municipios.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </Filtro>
          <Filtro icone="▦" valor={categoria} onChange={setCategoria}>
            <option value="">Todas as categorias</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </Filtro>
          <Filtro icone="📅" valor={periodo} onChange={setPeriodo}>
            <option value="">Todo o período</option>
            {periodos.map((p) => <option key={p} value={p}>{MESES[Number(p.slice(5, 7)) - 1]} de {p.slice(0, 4)}</option>)}
          </Filtro>
          {municipioId && (
            <>
              <Filtro icone="🏫" valor={escola} onChange={setEscola}>
                <option value="">Todas as escolas</option>
                {escolasOpcoes.map((e) => <option key={e} value={e}>{e}</option>)}
              </Filtro>
            </>
          )}
          {temFiltro && (
            <button onClick={limparFiltros} className="text-sm font-semibold text-brand-light hover:underline ml-1">Limpar filtros</button>
          )}
        </div>

        {/* Ações pedagógicas: clique para ver só as publicações daquela ação */}
        {acoesPedagogicas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por ação pedagógica">
            {acoesPedagogicas.map((acao) => {
              const marcada = acaoPed === acao;
              const total = (documentos ?? []).filter((d) => d.acoes_pedagogicas?.nome === acao).length;
              return (
                <button
                  key={acao}
                  type="button"
                  aria-pressed={marcada}
                  onClick={() => { setAcaoPed(marcada ? "" : acao); setEscola(""); }}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-light/40 ${
                    marcada ? "border-brand bg-brand text-white" : "border-black/10 bg-white text-brand-dark hover:bg-brand-light/5"
                  }`}
                >
                  <IconeAcao nome={acao} className="h-3.5 w-3.5" tileClassName="h-6 w-6 rounded-full" />
                  {acao}
                  <span className={`text-xs font-medium ${marcada ? "text-white/80" : "text-brand-dark/60"}`}>{total}</span>
                </button>
              );
            })}
          </div>
        )}

        {erro && <p className="text-sm text-status-pendente">{erro}</p>}
        {!documentos && !erro && <p className="text-sm text-brand-dark/70">Carregando publicações...</p>}

        {/* ================= Destaques ================= */}
        {destaques.length > 0 && (
          <section className={CARTAO}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2"><span className="text-brand-light">★</span> Destaques da galeria</h2>
              <button onClick={irParaLista} className="text-sm font-semibold text-brand-light hover:underline">Ver todas as publicações →</button>
            </div>
            <div className="grid lg:grid-cols-[2fr_1fr_1fr] gap-4">
              {destaques.map((doc, i) =>
                i === 0 ? (
                  <button key={doc.id} onClick={() => abrir(doc)} className="group grid sm:grid-cols-[1.1fr_1fr] gap-4 rounded-xl border border-black/5 bg-[#f7faf6] p-2 text-left hover:shadow-md transition">
                    <Thumb doc={doc} className="h-56 sm:h-full min-h-[200px] rounded-lg" grande />
                    <div className="flex flex-col py-2 pr-2">
                      <span className="w-fit rounded-full bg-amber-300 px-2.5 py-0.5 text-xs font-bold text-amber-950">Mais recente</span>
                      <Local doc={doc} municipio={nomeMunicipio(doc.municipio_id)} className="mt-3" />
                      <h3 className="mt-2 text-xl font-bold leading-snug line-clamp-2">{tituloDe(doc)}</h3>
                      {doc.descricao && <p className="mt-1 text-sm text-brand-dark/75 line-clamp-3">{doc.descricao}</p>}
                      <p className="mt-2 text-xs text-brand-dark/65">📅 {formatarData(doc.data_realizacao)}</p>
                      <div className="mt-auto pt-3 flex items-center gap-4 text-sm text-brand-dark/80">
                        <Contadores doc={doc} curtido={curtidos.has(doc.id)} />
                        <span className="ml-auto text-lg text-brand-dark/50 group-hover:text-brand-light">›</span>
                      </div>
                    </div>
                  </button>
                ) : (
                  <button key={doc.id} onClick={() => abrir(doc)} className="group flex flex-col overflow-hidden rounded-xl border border-black/5 bg-white text-left hover:shadow-md transition">
                    <Thumb doc={doc} className="h-36" />
                    <div className="flex flex-1 flex-col p-3">
                      <Local doc={doc} municipio={nomeMunicipio(doc.municipio_id)} />
                      <h3 className="mt-1.5 font-bold leading-snug line-clamp-1">{tituloDe(doc)}</h3>
                      {doc.descricao && <p className="text-xs text-brand-dark/70 line-clamp-1">{doc.descricao}</p>}
                      <p className="mt-1.5 text-xs text-brand-dark/65">📅 {formatarData(doc.data_realizacao)}</p>
                      <div className="mt-auto pt-2 flex items-center gap-4 text-sm text-brand-dark/80">
                        <Contadores doc={doc} curtido={curtidos.has(doc.id)} />
                        <span className="ml-auto text-lg text-brand-dark/50 group-hover:text-brand-light">›</span>
                      </div>
                    </div>
                  </button>
                )
              )}
            </div>
          </section>
        )}

        {/* ================= Mapa + município + últimas ações ================= */}
        {municipiosParticipantes.size > 0 && (
          <section className="grid xl:grid-cols-[1.75fr_1fr] gap-5">
            <div className={`${CARTAO} grid md:grid-cols-[0.6fr_1.7fr_1fr] gap-4 items-stretch`}>
              <div>
                <h2 className="text-base font-bold">🗺️ Municípios participantes</h2>
                <div className="mt-3 space-y-1.5 text-xs text-brand-dark/75">
                  <p className="flex items-center gap-2"><span className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ background: COR_PARTICIPANTE }} /> Participantes</p>
                  <p className="flex items-center gap-2"><span className="w-2.5 h-2.5 shrink-0 rounded-full bg-[#123A26]" /> Em destaque</p>
                  <p className="flex items-center gap-2"><span className="w-2.5 h-2.5 shrink-0 rounded-full bg-amber-400" /> Escolas</p>
                </div>
                {municipioId && (
                  <button onClick={() => mudarMunicipio("")} className="mt-4 text-left text-xs font-semibold text-brand-light hover:underline">← Todos os municípios</button>
                )}
              </div>
              <MapaCearaGaleria
                municipiosParticipantes={municipiosParticipantes}
                destaqueId={idPainel}
                zoomId={municipioId}
                escolas={escolasMapa}
                onClicarMunicipio={(id) => setDestaqueId(id)}
                onClicarEscola={verAcoesDaEscola}
                className="h-[360px]"
              />
              {infoPainel && (
                <div className="rounded-xl bg-[#f4f8f3] p-4 flex flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-lg font-bold">📍 {infoPainel.nome} (CE)</p>
                  </div>
                  <dl className="mt-4 space-y-3 text-sm">
                    <Dado icone="🏫" rotulo="Escolas participantes" valor={infoPainel.escolas} />
                    <Dado icone="📄" rotulo="Publicações" valor={infoPainel.publicacoes} />
                    <Dado icone="🕒" rotulo="Última ação" valor={infoPainel.ultima ? formatarData(infoPainel.ultima) : "—"} />
                  </dl>
                  <button
                    onClick={() => { mudarMunicipio(String(idPainel)); irParaLista(); }}
                    className="mt-auto pt-3 w-fit text-sm font-semibold text-brand-light hover:underline"
                  >
                    Ver ações →
                  </button>
                </div>
              )}
            </div>

            <div className={CARTAO}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold flex items-center gap-2">🕒 Últimas ações no município</h2>
                {idPainel && (
                  <button onClick={() => { mudarMunicipio(String(idPainel)); irParaLista(); }} className="text-sm font-semibold text-brand-light hover:underline">Ver todas →</button>
                )}
              </div>
              <div className="divide-y divide-black/5">
                {acoesDoPainel.slice(0, 3).map((doc, i) => (
                  <button key={doc.id} onClick={() => abrir(doc)} className="group flex w-full items-center gap-3 py-2.5 text-left">
                    <Thumb doc={doc} className="h-14 w-20 shrink-0 rounded-md" semSelo />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug line-clamp-1">{tituloDe(doc)}</p>
                      {doc.escolas?.nome && <p className="text-xs text-brand-dark/70 line-clamp-1">{doc.escolas.nome}</p>}
                      <p className="text-xs text-brand-dark/60">{formatarData(doc.data_realizacao)}</p>
                    </div>
                    {i === 0 ? (
                      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-900">Mais recente</span>
                    ) : (
                      <span className="rounded-full bg-brand-light/10 px-2 py-0.5 text-[11px] font-semibold text-brand-light">{rotuloTipo(doc)}</span>
                    )}
                    <span className="text-lg text-brand-dark/40 group-hover:text-brand-light">›</span>
                  </button>
                ))}
                {!acoesDoPainel.length && <p className="py-4 text-sm text-brand-dark/70">Clique num município do mapa para ver as últimas ações dele.</p>}
              </div>
            </div>
          </section>
        )}

        {/* ================= Todas as ações ================= */}
        {documentos && (
          <section ref={listaRef} className="scroll-mt-20">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className="text-brand-light">▦</span> {escola ? `Ações da escola ${escola}` : "Todas as ações"}
              </h2>
              <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className="bg-transparent text-sm font-semibold focus:outline-none">
                <option value="recentes">Mais recentes</option>
                <option value="antigas">Mais antigas</option>
              </select>
            </div>
            {lista.length === 0 && (
              <div className="rounded-xl bg-white border border-black/5 px-5 py-4 text-sm text-brand-dark/80">
                {escola ? "Esta escola ainda não tem ações publicadas na galeria." : "Nenhuma ação encontrada com esses filtros."}
                {temFiltro && <button onClick={limparFiltros} className="ml-2 font-semibold text-brand-light hover:underline">Ver todas as ações</button>}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-7 gap-3">
              {lista.map((doc) => (
                <button key={doc.id} onClick={() => abrir(doc)} className="group flex flex-col overflow-hidden rounded-xl border border-black/5 bg-white text-left shadow-sm hover:shadow-md hover:-translate-y-0.5 transition">
                  <Thumb doc={doc} className="h-28" />
                  <div className="flex flex-1 flex-col p-2.5">
                    <Local doc={doc} municipio={nomeMunicipio(doc.municipio_id)} pequeno />
                    <p className="mt-1 text-sm font-bold leading-snug line-clamp-2">{tituloDe(doc)}</p>
                    <p className="mt-1 text-xs text-brand-dark/60">📅 {formatarData(doc.data_realizacao)}</p>
                    <div className="mt-auto pt-2 flex items-center gap-3 text-xs text-brand-dark/80">
                      <Contadores doc={doc} curtido={curtidos.has(doc.id)} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* ================= Ação aberta ================= */}
      {aberto && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-6" onClick={() => setAberto(null)}>
          <div className="w-full max-w-4xl max-h-[95vh] overflow-y-auto bg-white rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-black">
              <PreviewLink
                link={linkDo(aberto)}
                className="w-full h-[55vh] !rounded-none !border-0"
                fallback={
                  <a href={normalizarLink(linkDo(aberto)) ?? undefined} target="_blank" rel="noreferrer" className="flex h-48 items-center justify-center text-white underline">
                    Abrir em nova aba
                  </a>
                }
              />
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="rounded-full bg-brand-light/10 px-2.5 py-0.5 text-xs font-semibold text-brand-light">{rotuloTipo(aberto)}</span>
                  {aberto.acoes_pedagogicas?.nome && (
                    <span className="ml-2 rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold text-brand-dark/85">{aberto.acoes_pedagogicas.nome}{aberto.subtipo ? ` · ${aberto.subtipo}` : ""}</span>
                  )}
                  <h3 className="mt-2 text-xl font-bold">{tituloDe(aberto)}</h3>
                  <p className="text-sm text-brand-dark/80 mt-1">
                    <strong>{nomeMunicipio(aberto.municipio_id)} (CE)</strong>
                    {aberto.escolas?.nome && <> · {aberto.escolas.nome}</>}
                    {" · "}📅 {formatarData(aberto.data_realizacao)}
                  </p>
                </div>
                <button onClick={() => setAberto(null)} className="text-2xl leading-none text-brand-dark/60 hover:text-brand-dark" aria-label="Fechar">×</button>
              </div>
              {aberto.descricao && (
                <div className="mt-5 rounded-xl bg-[#f4f8f3] p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-light mb-2">Sobre a ação</p>
                  <p className="text-[15px] leading-relaxed text-brand-dark/90 whitespace-pre-line">{aberto.descricao}</p>
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <button
                  onClick={() => curtir(aberto)}
                  disabled={curtidos.has(aberto.id)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border ${curtidos.has(aberto.id) ? "border-rose-200 bg-rose-50 text-rose-600" : "border-black/10 hover:bg-rose-50 hover:text-rose-600"}`}
                >
                  {curtidos.has(aberto.id) ? "❤️ Curtido" : "🤍 Curtir"} · {aberto.curtidas}
                </button>
                <span className="text-sm text-brand-dark/75">👁️ {formatarNumero(aberto.visualizacoes)} visualizações</span>
                <a href={normalizarLink(linkDo(aberto)) ?? undefined} target="_blank" rel="noreferrer" className="ml-auto text-sm font-medium text-brand-light hover:underline">
                  Abrir em nova aba ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// Peças pequenas
// ================================================================
const CARTAO = "rounded-2xl bg-white border border-black/5 shadow-sm p-4 sm:p-5";

function LogoSenar() {
  return (
    <svg viewBox="0 0 40 40" className="w-10 h-10" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${8 + i * 6} 34 C ${6 + i * 6} 22, ${10 + i * 6} 12, ${16 + i * 5} 5`} stroke={i % 2 ? "#3F9B5E" : "#1E6B45"} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      ))}
    </svg>
  );
}

function Filtro({ icone, valor, onChange, children }: { icone: string; valor: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className={`relative inline-flex items-center rounded-lg border bg-white shadow-sm ${valor ? "border-brand-light/50 ring-1 ring-brand-light/20" : "border-black/10"}`}>
      <span className="pointer-events-none absolute left-3 text-sm" aria-hidden>{icone}</span>
      <select value={valor} onChange={(e) => onChange(e.target.value)} className="appearance-none bg-transparent pl-9 pr-8 py-2 text-sm font-medium focus:outline-none max-w-[240px]">
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 text-xs text-brand-dark/60" aria-hidden>▾</span>
    </label>
  );
}

function Numero({ icone, rotulo, valor }: { icone: string; rotulo: string; valor: number }) {
  return (
    <div className="min-w-[150px] rounded-xl bg-[#e8f1e6] px-4 py-3">
      <p className="text-xl" aria-hidden>{icone}</p>
      <p className="mt-1 text-xs text-brand-dark/75">{rotulo}</p>
      <p className="text-2xl font-bold">{valor.toLocaleString("pt-BR")}</p>
    </div>
  );
}

function Dado({ icone, rotulo, valor }: { icone: string; rotulo: string; valor: string | number }) {
  return (
    <div className="flex items-start gap-2.5">
      <span aria-hidden>{icone}</span>
      <div>
        <dt className="text-xs text-brand-dark/65">{rotulo}</dt>
        <dd className="font-bold">{valor}</dd>
      </div>
    </div>
  );
}

function Local({ doc, municipio, className = "", pequeno }: { doc: DocumentoGaleria; municipio: string; className?: string; pequeno?: boolean }) {
  return (
    <div className={`${pequeno ? "text-[11px]" : "text-xs"} text-brand-dark/75 ${className}`}>
      <p className="line-clamp-1">📍 {municipio ? `${municipio} (CE)` : "Ceará"}</p>
      {doc.escolas?.nome && <p className="line-clamp-1">🏫 {doc.escolas.nome}</p>}
      {doc.acoes_pedagogicas?.nome && <p className="line-clamp-1">🎒 {doc.acoes_pedagogicas.nome}</p>}
    </div>
  );
}

function Contadores({ doc, curtido }: { doc: DocumentoGaleria; curtido: boolean }) {
  return (
    <>
      <span className={`inline-flex items-center gap-1 ${curtido ? "text-rose-600" : ""}`}>{curtido ? "❤️" : "🤍"} {formatarNumero(doc.curtidas)}</span>
      <span className="inline-flex items-center gap-1">👁️ {formatarNumero(doc.visualizacoes)}</span>
    </>
  );
}

function Thumb({ doc, className, grande, semSelo }: { doc: DocumentoGaleria; className: string; grande?: boolean; semSelo?: boolean }) {
  const candidatos = urlsMiniatura(doc);
  const [tentativa, setTentativa] = useState(0);
  const url = candidatos[tentativa];
  const video = ehVideo(doc);
  return (
    <span className={`relative block overflow-hidden bg-gradient-to-br from-brand-light/20 to-brand-light/5 ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setTentativa((t) => t + 1)} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-3xl">{video ? "🎬" : "🖼️"}</span>
      )}
      {video && url && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className={`${grande ? "w-12 h-12 text-xl" : semSelo ? "w-6 h-6 text-[10px]" : "w-9 h-9 text-sm"} rounded-full bg-black/55 text-white flex items-center justify-center`}>▶</span>
        </span>
      )}
      {!semSelo && (
        <span className={`absolute ${grande ? "bottom-2 left-2" : "bottom-1.5 right-1.5"} rounded-full bg-brand/90 px-2 py-0.5 text-[10px] font-semibold text-white`}>
          {video ? "▶ " : ""}{rotuloTipo(doc)}
        </span>
      )}
    </span>
  );
}

// ================================================================
function ehVideo(doc: DocumentoGaleria) {
  return /v[ií]deo/i.test(doc.tipos_documento?.nome ?? "");
}
function rotuloTipo(doc: DocumentoGaleria) {
  const nome = doc.tipos_documento?.nome ?? "Outros";
  if (/v[ií]deo/i.test(nome)) return "Vídeo";
  if (/imag|foto/i.test(nome)) return "Imagem";
  return nome;
}
function chaveData(d: DocumentoGaleria) {
  return `${d.data_realizacao ?? ""}|${d.publicado_galeria_em ?? ""}`;
}
function linkDo(doc: DocumentoGaleria) {
  return doc.drive_file_link || (doc.drive_file_id ? `https://drive.google.com/file/d/${doc.drive_file_id}/view` : doc.link_externo) || null;
}
function tituloDe(doc: DocumentoGaleria) {
  return doc.acao_evento || doc.acoes_pedagogicas?.nome || doc.descricao?.split("\n")[0]?.slice(0, 80) || doc.tipos_documento?.nome || "Publicação";
}
function normalizar(texto?: string | null) {
  return (texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function formatarData(data?: string | null) {
  if (!data) return "";
  const [ano, mes, dia] = data.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}
function formatarNumero(n: number) {
  if ((n ?? 0) >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")} mil`;
  return String(n ?? 0);
}
