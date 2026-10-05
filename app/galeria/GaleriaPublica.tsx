"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiGetCache, apiPost, esquecerCacheApiPor, DocumentoGaleria, EscolaParticipanteGaleria } from "@/lib/api";
import MapaCearaGaleria, { COR_PARTICIPANTE } from "@/components/MapaCearaGaleria";
import PreviewLink from "@/components/PreviewLink";
import { normalizarLink } from "@/lib/linkIncorporavel";
import { urlsMiniatura } from "@/lib/miniatura";
import { useFiltroCiclo } from "@/lib/ciclos";
import { FundoFestivo, LogoValores } from "@/components/Sol";
import CabecalhoPublico from "@/components/CabecalhoPublico";
import { VALORES } from "@/lib/valoresProjeto";
import { corDaAcao, SimboloAcao } from "@/components/IconesAcoes";
import { ImageIcon } from "@/components/icons";

type Ordem = "recentes" | "antigas";
type MunicipioGaleria = { id: number; nome: string; publicacoes: number };
type Resumo = { municipios: number; escolas: number; publicacoes: number; visualizacoes: number };

// Ordem em que as ações aparecem na vitrine (a da apresentação do projeto); as demais vêm depois
const ORDEM_ACOES = ["acolh", "meditac", "civico", "circulo", "conto", "pratica", "cultura", "familia", "refeic", "aniversari"];
// ATENÇÃO: frases PROVISÓRIAS para os cartões. A equipe do projeto precisa revisar cada uma.
const DESCRICAO_ACAO: [string, string][] = [
  ["acolh", "Receber cada criança com carinho, começando o dia com afeto e presença."],
  ["meditac", "Um momento de silêncio e atenção para acalmar a mente e o corpo."],
  ["civico", "Vivenciar o respeito à pátria, aos símbolos e à convivência em comunidade."],
  ["circulo", "Crianças e professor em roda, compartilhando gestos de amor e cuidado."],
  ["conto", "Histórias que ensinam e despertam os valores humanos."],
  ["pratica", "Atividades em grupo que ensinam a cooperar e a partilhar."],
  ["cultura", "Cuidar da natureza e valorizar a cultura no dia a dia da escola."],
  ["familia", "A família participa e fortalece, junto com a escola, a formação das crianças."],
  ["refeic", "Partilhar a refeição com gratidão, respeito e boas maneiras."],
  ["aniversari", "Celebrar cada criança, valorizando a alegria de estar juntos."],
];
const ordemDaAcao = (nome: string) => {
  const n = normalizar(nome);
  const i = ORDEM_ACOES.findIndex((chave) => n.includes(chave));
  return i === -1 ? ORDEM_ACOES.length : i;
};
const descricaoDaAcao = (nome: string) => {
  const n = normalizar(nome);
  return DESCRICAO_ACAO.find(([chave]) => n.includes(chave))?.[1] ?? "Registros desta ação pedagógica.";
};

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
  // Ciclo padrão = "ativo" (o servidor resolve): a galeria começa a carregar já, sem esperar a lista de ciclos
  const parametroCiclo = cicloPadrao ? "ciclo_id=ativo" : cicloId ? `ciclo_id=${cicloId}` : "";

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
    const extra = parametroCiclo ? `&${parametroCiclo}` : "";
    // apiGetCache: voltar para a galeria (ou ir e voltar de "O projeto") não refaz os pedidos
    apiGetCache(`/api/galeria?municipios=1${extra}`).then(setMunicipios).catch(() => null);
    apiGetCache(`/api/galeria?mapa=1${extra}`).then(setEscolasMapa).catch(() => null);
    apiGetCache(`/api/galeria?resumo=1${extra}`).then(setResumo).catch(() => null);
  }, [parametroCiclo]);

  useEffect(() => {
    setDocumentos(null);
    setAcaoPed("");
    setEscola(escolaPendente.current ?? "");
    escolaPendente.current = null;
    const consulta = [municipioId ? `municipio_id=${municipioId}` : "", parametroCiclo].filter(Boolean).join("&");
    apiGetCache(`/api/galeria${consulta ? `?${consulta}` : ""}`)
      .then((lista: DocumentoGaleria[]) => setDocumentos(lista))
      .catch((e) => setErro(e.message));
    if (municipioId) setDestaqueId(Number(municipioId));
  }, [municipioId, parametroCiclo]);

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

  // Escolas do programa no município escolhido, com quantas publicações cada uma tem na galeria
  const escolasDoMunicipio = useMemo(() => {
    if (!municipioId) return [];
    const total = new Map<string, number>();
    (documentos ?? []).forEach((d) => d.escolas?.nome && total.set(d.escolas.nome, (total.get(d.escolas.nome) ?? 0) + 1));
    return escolasMapa
      .filter((e) => String(e.municipio_id) === municipioId)
      .map((e) => ({ id: e.id, nome: e.nome, publicacoes: total.get(e.nome) ?? 0 }))
      .sort((a, b) => b.publicacoes - a.publicacoes || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [municipioId, escolasMapa, documentos]);

  // Cartões por ação: respeitam os demais filtros, mas não o de ação (cada cartão mostra a sua)
  const cartoesAcoes = useMemo(() => {
    const termo = normalizar(busca.trim());
    const base = (documentos ?? []).filter(
      (d) =>
        d.acoes_pedagogicas?.nome &&
        (!categoria || rotuloTipo(d) === categoria) &&
        (!periodo || (d.data_realizacao ?? "").startsWith(periodo)) &&
        (!escola || d.escolas?.nome === escola) &&
        (!termo || [d.acao_evento, d.acoes_pedagogicas?.nome, d.descricao, d.escolas?.nome, nomeMunicipio(d.municipio_id)].some((v) => normalizar(v).includes(termo)))
    );
    const porAcao = new Map<string, DocumentoGaleria[]>();
    for (const d of base) {
      const nome = d.acoes_pedagogicas!.nome;
      porAcao.set(nome, [...(porAcao.get(nome) ?? []), d]);
    }
    return Array.from(porAcao.entries())
      .map(([nome, docs]) => ({ nome, total: docs.length, docs: [...docs].sort((a, b) => chaveData(b).localeCompare(chaveData(a))).slice(0, 5) }))
      .sort((a, b) => ordemDaAcao(a.nome) - ordemDaAcao(b.nome) || a.nome.localeCompare(b.nome));
  }, [documentos, categoria, periodo, escola, busca, nomeMunicipio]);

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
    // mostra +1 na hora (card, janela aberta e número do topo) e depois confirma com o total do servidor
    atualizar(doc.id, { visualizacoes: (doc.visualizacoes ?? 0) + 1 });
    setResumo((r) => (r ? { ...r, visualizacoes: r.visualizacoes + 1 } : r));
    apiPost("/api/galeria", { acao: "visualizar", documento_id: doc.id })
      .then((resp) => {
        if (resp?.visualizacoes !== undefined) atualizar(doc.id, { visualizacoes: resp.visualizacoes });
        esquecerCacheApiPor("/api/galeria"); // ao voltar para a galeria, busca os números novos
      })
      .catch(() => {
        // não conseguiu registrar: desfaz o +1 para não mostrar um número que o servidor não tem
        atualizar(doc.id, { visualizacoes: doc.visualizacoes ?? 0 });
        setResumo((r) => (r ? { ...r, visualizacoes: Math.max(0, r.visualizacoes - 1) } : r));
      });
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
      <CabecalhoPublico ativo="galeria" busca={busca} onBusca={setBusca} />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 py-4 space-y-4">
        {/* ================= Topo compacto: logo, texto, valores, botão e o sol (sem cortar nada) ================= */}
        <FundoFestivo className="rounded-2xl border border-black/5" mostrarSol={false}>
          <section className="p-4 sm:px-6 sm:py-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <LogoValores className="order-1 w-36 shrink-0 sm:w-44" />

              {/* o sol fica no fluxo da página (e não solto no fundo), então nunca é cortado */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/sol-valores.png" alt="" width={900} height={545} className="order-2 ml-auto h-auto w-28 shrink-0 sm:order-3 sm:w-40 lg:w-52" />

              <div className="order-3 w-full sm:order-2 sm:w-auto sm:min-w-[280px] sm:flex-1">
                {municipioId && nomeMunicipio(Number(municipioId)) ? (
                  <h1 className="mb-2 text-xl font-bold sm:text-2xl">Galeria de {nomeMunicipio(Number(municipioId))}</h1>
                ) : (
                  <h1 className="sr-only">Projeto Valores: galeria de publicações</h1>
                )}
                <p className="max-w-2xl text-sm leading-relaxed text-brand-dark/90 sm:text-base">
                  Colabore com a formação do caráter na <strong>educação infantil</strong>, proporcionando à sociedade um ser integral dotado dos valores humanos universais.
                </p>
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Valores humanos do projeto">
                  {VALORES.map((v) => (
                    <li key={v.nome} className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/90 px-3 py-1 text-sm font-semibold text-brand-dark">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: v.cor }} aria-hidden="true" />
                      {v.nome}
                    </li>
                  ))}
                </ul>
                <BotaoConheca />
              </div>
            </div>
          </section>
        </FundoFestivo>

        {/* ================= Números (uma linha só) ================= */}
        {resumo && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Numero icone="📍" rotulo="Municípios participantes" valor={resumo.municipios} />
            <Numero icone="🏫" rotulo="Escolas" valor={resumo.escolas} />
            <Numero icone="📄" rotulo="Publicações" valor={resumo.publicacoes} />
            <Numero icone="👁️" rotulo="Visualizações" valor={resumo.visualizacoes} />
          </div>
        )}

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
          {municipioId ? (
            <Filtro icone="🏫" valor={escola} onChange={setEscola}>
              <option value="">Todas as escolas ({escolasDoMunicipio.length})</option>
              {[...escolasDoMunicipio].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((e) => (
                <option key={e.id} value={e.nome}>{e.nome} ({e.publicacoes})</option>
              ))}
            </Filtro>
          ) : (
            <Filtro icone="🏫" valor="" onChange={() => {}} desativado dica="Escolha um município para filtrar por escola">
              <option value="">Escolas: escolha um município</option>
            </Filtro>
          )}
          <Filtro icone="▦" valor={categoria} onChange={setCategoria}>
            <option value="">Todas as categorias</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </Filtro>
          <Filtro icone="📅" valor={periodo} onChange={setPeriodo}>
            <option value="">Todo o período</option>
            {periodos.map((p) => <option key={p} value={p}>{MESES[Number(p.slice(5, 7)) - 1]} de {p.slice(0, 4)}</option>)}
          </Filtro>
          {temFiltro && (
            <button onClick={limparFiltros} className="text-sm font-semibold text-brand-light hover:underline ml-1">Limpar filtros</button>
          )}
        </div>

        {/* ================= Galeria de fotos e vídeos, por ação pedagógica ================= */}
        {cartoesAcoes.length > 0 && (
          <section aria-labelledby="titulo-vitrine" className="space-y-4 rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-6">
            <div>
              <h2 id="titulo-vitrine" className="flex items-center gap-3 text-xl sm:text-2xl font-extrabold text-brand">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-brand" aria-hidden="true">
                  <ImageIcon className="h-5 w-5" />
                </span>
                Galeria de fotos e vídeos
              </h2>
              <p className="mt-1 text-brand-dark/80">Explore os registros das nossas ações pedagógicas e momentos especiais.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por ação pedagógica">
              <button
                type="button"
                aria-pressed={acaoPed === ""}
                onClick={() => { setAcaoPed(""); setEscola(""); }}
                className={`rounded-full border px-6 py-2.5 text-sm font-semibold transition-colors ${acaoPed === "" ? "border-brand bg-brand text-white" : "border-black/10 bg-white text-brand-dark hover:bg-black/[0.03]"}`}
              >
                Todas
              </button>
              {cartoesAcoes.map(({ nome }) => {
                const marcada = acaoPed === nome;
                const cor = corDaAcao(nome);
                return (
                  <button
                    key={nome}
                    type="button"
                    aria-pressed={marcada}
                    onClick={() => { setAcaoPed(marcada ? "" : nome); setEscola(""); }}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${marcada ? "border-brand bg-brand text-white" : "border-black/10 bg-white text-brand-dark hover:bg-black/[0.03]"}`}
                  >
                    <span style={{ color: marcada ? "#FFFFFF" : cor.escuro }}><SimboloAcao nome={nome} className="h-5 w-5" /></span>
                    {nome}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {cartoesAcoes.map(({ nome, docs, total }) => {
                const cor = corDaAcao(nome);
                return (
                  <article
                    key={nome}
                    className={`flex flex-col rounded-2xl border border-black/5 shadow-sm ${acaoPed === nome ? "ring-2 ring-brand" : ""}`}
                    style={{ background: `color-mix(in srgb, ${cor.fundo} 12%, #ffffff)` }}
                  >
                    <header className="flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{ background: cor.fundo, color: cor.texto }}>
                      <SimboloAcao nome={nome} className="h-8 w-8 shrink-0" />
                      <h3 className="text-xl font-bold leading-tight">{nome}</h3>
                    </header>
                    <p className="px-4 pt-4 pb-3 text-sm leading-snug" style={{ color: cor.escuro }}>{descricaoDaAcao(nome)}</p>
                    {/* a caixa branca cresce para ocupar o espaço que sobra: o "Ver mais" fica sempre embaixo, alinhado com os outros cartões */}
                    <div className="mx-3 flex flex-1 items-center rounded-xl bg-white p-1.5 shadow-sm">
                      <div className="w-full">
                        <Mosaico docs={docs} onAbrir={abrir} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setAcaoPed(nome); setEscola(""); irParaLista(); }}
                      className="mx-4 mb-4 mt-4 rounded-full border-2 bg-white/70 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white"
                      style={{ borderColor: cor.fundo, color: cor.escuro }}
                    >
                      Ver mais <span aria-hidden="true">›</span>
                      <span className="sr-only"> registros de {nome} ({total})</span>
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
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

function Filtro({ icone, valor, onChange, children, desativado, dica }: { icone: string; valor: string; onChange: (v: string) => void; children: React.ReactNode; desativado?: boolean; dica?: string }) {
  return (
    <label title={dica} className={`relative inline-flex items-center rounded-lg border bg-white shadow-sm ${desativado ? "opacity-55" : ""} ${valor ? "border-brand-light/50 ring-1 ring-brand-light/20" : "border-black/10"}`}>
      <span className="pointer-events-none absolute left-3 text-sm" aria-hidden>{icone}</span>
      <select value={valor} disabled={desativado} onChange={(e) => onChange(e.target.value)} className="appearance-none bg-transparent pl-9 pr-8 py-2 text-sm font-medium focus:outline-none max-w-[240px] disabled:cursor-not-allowed">
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 text-xs text-brand-dark/60" aria-hidden>▾</span>
    </label>
  );
}

// Botão "Conheça o projeto": verde escuro, lâmpada num círculo à esquerda, seta à direita e faíscas em volta
function BotaoConheca() {
  return (
    <span className="relative mt-4 inline-block px-3 py-1.5">
      <span aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="absolute -right-1 top-0 h-3 w-0.5 rotate-[35deg] rounded bg-brand-dark/45" />
        <span className="absolute right-3 -top-1 h-3 w-0.5 rotate-[-20deg] rounded bg-brand-dark/45" />
        <span className="absolute -left-1 bottom-0 h-3 w-0.5 rotate-[-35deg] rounded bg-brand-dark/45" />
        <span className="absolute left-3 -bottom-1 h-3 w-0.5 rotate-[20deg] rounded bg-brand-dark/45" />
      </span>
      <a
        href="/galeria/sobre"
        className="relative inline-flex items-center gap-3 rounded-full bg-brand py-2 pl-2.5 pr-5 text-base font-bold text-white shadow-md shadow-brand/25 transition hover:-translate-y-0.5 hover:bg-brand-light"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18h6M10 21h4" />
            <path d="M12 3a6 6 0 00-3.6 10.8c.6.5 1 1.2 1 2v.7h5.2v-.7c0-.8.4-1.5 1-2A6 6 0 0012 3z" />
          </svg>
        </span>
        Conheça o projeto
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </a>
    </span>
  );
}

function Numero({ icone, rotulo, valor }: { icone: string; rotulo: string; valor: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[#e8f1e6] px-3 py-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/70 text-xl" aria-hidden>{icone}</span>
      <span className="min-w-0">
        <span className="block truncate text-xs text-brand-dark/75">{rotulo}</span>
        <span className="block text-xl font-bold leading-tight">{valor.toLocaleString("pt-BR")}</span>
      </span>
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

// Até 5 registros em mosaico (2 quadrados, 1 largo, 2 quadrados), como na vitrine de referência
function Mosaico({ docs, onAbrir }: { docs: DocumentoGaleria[]; onAbrir: (doc: DocumentoGaleria) => void }) {
  const n = docs.length;
  const larga = (i: number) => n === 1 || (i === 2 && (n === 3 || n === 5));
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {docs.map((doc, i) => (
        <button
          key={doc.id}
          type="button"
          onClick={() => onAbrir(doc)}
          aria-label={`Abrir ${tituloDe(doc)}`}
          className={`block overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-light ${larga(i) ? "col-span-2" : ""}`}
        >
          <Thumb doc={doc} semSelo className={`w-full ${larga(i) ? "aspect-[2/1]" : "aspect-square"}`} />
        </button>
      ))}
    </div>
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
