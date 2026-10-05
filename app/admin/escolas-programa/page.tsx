"use client";

import { TituloPagina, Indicador } from "@/components/TituloPagina";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, Escola, Municipio } from "@/lib/api";
import { AdminGuard } from "@/components/AdminGuard";
import { normalizarTexto } from "@/components/DocumentoUI";
import { useCiclos } from "@/lib/ciclos";
import { CriancasPulando, Estrela } from "@/components/Desenhos";
import { Abas, BarraFiltros, CampoBusca, CLASSE_SELECT } from "@/components/Filtros";

const POR_PAGINA = 40; // dá para ver ~40 escolas por vez (20 linhas em 2 colunas)

type Visao = "todas" | "no_programa" | "fora";

export default function EscolasProgramaPage() {
  return (
    <AdminGuard>
      <Conteudo />
    </AdminGuard>
  );
}

function Conteudo() {
  const { ciclos, ativo, carregando: carregandoCiclos } = useCiclos();
  // sempre o ciclo ativo (o seletor de ciclo saiu desta tela)
  const cicloId = ativo?.id ?? "";

  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [municipioId, setMunicipioId] = useState("");
  const [porMunicipio, setPorMunicipio] = useState<Record<string, number>>({});

  // escolas do município escolhido (só carregadas quando há município) e ids das escolas do programa no ciclo (todos os municípios)
  const [escolas, setEscolas] = useState<Escola[] | null>(null);
  const [conhecidas, setConhecidas] = useState<Record<string, Escola>>({});
  const [noPrograma, setNoPrograma] = useState<Set<string>>(new Set());
  const [carregandoPrograma, setCarregandoPrograma] = useState(false);
  const municipioCarregado = useRef("");
  const [visao, setVisao] = useState<Visao>("no_programa");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/api/municipios")
      .then((lista: Municipio[]) => setMunicipios([...lista].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))))
      .catch((e) => setErro(e.message));
  }, []);

  function carregarResumo() {
    if (!cicloId) return;
    apiGet(`/api/escolas-participantes?resumo=1&ciclo_id=${cicloId}`)
      .then((r) => setPorMunicipio(r.por_municipio ?? {}))
      .catch(() => null);
  }

  // ao abrir (ou trocar o ciclo): carrega as escolas que já estão no programa, de todos os municípios
  useEffect(() => {
    setPorMunicipio({});
    carregarResumo();
    setVisao("no_programa");
    setBusca("");
    setPagina(1);
    setAviso(null);
    if (!cicloId) return;
    let cancelado = false;
    setCarregandoPrograma(true);
    setErro(null);
    apiGet(`/api/escolas?participantes=1&ciclo_id=${cicloId}`)
      .then((lista: Escola[]) => {
        if (cancelado) return;
        setNoPrograma(new Set(lista.map((e) => e.id)));
        setConhecidas((atual) => {
          const novo = { ...atual };
          lista.forEach((e) => { novo[e.id] = e; });
          return novo;
        });
      })
      .catch((e) => !cancelado && setErro(e.message))
      .finally(() => !cancelado && setCarregandoPrograma(false));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cicloId]);

  // ao trocar de município: limpa a lista completa (será baixada só se precisar)
  useEffect(() => {
    setEscolas(null);
    municipioCarregado.current = "";
    setAviso(null);
    setBusca("");
    setPagina(1);
  }, [municipioId]);

  // todas as escolas do município só são baixadas ao abrir "Mostrar todas" ou "Fora do programa"
  const precisaTodas = visao !== "no_programa";
  useEffect(() => {
    if (!municipioId || !precisaTodas || municipioCarregado.current === municipioId) return;
    let cancelado = false;
    apiGet(`/api/escolas?municipio_id=${municipioId}`)
      .then((lista: Escola[]) => {
        if (cancelado) return;
        municipioCarregado.current = municipioId;
        setEscolas(lista);
        setConhecidas((atual) => {
          const novo = { ...atual };
          lista.forEach((e) => { novo[e.id] = e; });
          return novo;
        });
      })
      .catch((e) => !cancelado && setErro(e.message));
    return () => {
      cancelado = true;
    };
  }, [municipioId, precisaTodas]);

  const nomeMunicipio = useMemo(() => {
    const mapa = new Map<string, string>();
    municipios.forEach((m) => mapa.set(String(m.id), m.nome));
    return mapa;
  }, [municipios]);

  const total = escolas?.length ?? 0;
  const marcadas = useMemo(
    () =>
      municipioId
        ? Object.values(conhecidas).filter((e) => noPrograma.has(e.id) && String(e.municipio_id) === municipioId).length
        : noPrograma.size,
    [municipioId, conhecidas, noPrograma]
  );
  // "Mostrar todas" e "Fora do programa" precisam de um município escolhido (são milhares de escolas no estado)
  const precisaMunicipio = visao !== "no_programa" && !municipioId;

  const lista = useMemo(() => {
    if (precisaMunicipio) return [];
    const termo = normalizarTexto(busca.trim());
    let base: Escola[];
    if (visao === "no_programa") {
      base = Object.values(conhecidas)
        .filter((e) => noPrograma.has(e.id) && (!municipioId || String(e.municipio_id) === municipioId))
        .sort(
          (a, b) =>
            (nomeMunicipio.get(String(a.municipio_id)) ?? "").localeCompare(nomeMunicipio.get(String(b.municipio_id)) ?? "", "pt-BR") ||
            a.nome.localeCompare(b.nome, "pt-BR")
        );
    } else {
      base = (escolas ?? []).filter((e) => visao === "todas" || !noPrograma.has(e.id));
    }
    if (!termo) return base;
    return base.filter(
      (e) =>
        normalizarTexto(e.nome).includes(termo) ||
        normalizarTexto(nomeMunicipio.get(String(e.municipio_id)) ?? "").includes(termo)
    );
  }, [precisaMunicipio, visao, conhecidas, escolas, noPrograma, municipioId, busca, nomeMunicipio]);

  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const visiveis = lista.slice(inicio, inicio + POR_PAGINA);

  // números das páginas: 1 ... 4 5 [6] 7 8 ... 20
  const paginasMostradas = useMemo(() => {
    const itens: (number | "...")[] = [];
    for (let n = 1; n <= totalPaginas; n++) {
      if (n === 1 || n === totalPaginas || Math.abs(n - paginaAtual) <= 1) itens.push(n);
      else if (itens[itens.length - 1] !== "...") itens.push("...");
    }
    return itens;
  }, [totalPaginas, paginaAtual]);

  // Grava no servidor; se falhar, volta ao estado anterior.
  async function aplicar(ids: string[], participa: boolean) {
    if (!ids.length || !cicloId) return;
    const anterior = new Set(noPrograma);
    setNoPrograma((atual) => {
      const novo = new Set(atual);
      ids.forEach((id) => (participa ? novo.add(id) : novo.delete(id)));
      return novo;
    });
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await apiPost("/api/escolas-participantes", { ciclo_id: cicloId, escola_ids: ids, participa });
      if (!participa && r.com_documentos > 0) {
        setAviso(
          `${r.com_documentos} ${r.com_documentos === 1 ? "escola já tinha" : "escolas já tinham"} documentos nesta edição. Os documentos continuam salvos, mas ${r.com_documentos === 1 ? "ela deixa" : "elas deixam"} de contar como participante.`
        );
      }
      carregarResumo();
    } catch (e) {
      setNoPrograma(anterior);
      setErro(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  function marcarLista() {
    const ids = lista.filter((e) => !noPrograma.has(e.id)).map((e) => e.id);
    if (ids.length > 30 && !window.confirm(`Incluir ${ids.length} escolas no programa?`)) return;
    aplicar(ids, true);
  }
  function desmarcarLista() {
    const ids = lista.filter((e) => noPrograma.has(e.id)).map((e) => e.id);
    if (ids.length > 1 && !window.confirm(`Tirar ${ids.length} escolas do programa nesta edição?`)) return;
    aplicar(ids, false);
  }

  const totalCiclo = Object.values(porMunicipio).reduce((soma, n) => soma + n, 0);
  const municipiosNoCiclo = Object.keys(porMunicipio).length;
  const pct = municipioId && total ? Math.round((marcadas / total) * 100) : 0;

  return (
    <>
      <div className="relative p-4 sm:p-8 max-w-6xl">
       <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-7">
        {/* ============ topo (mesmo padrão das outras páginas) ============ */}
        <TituloPagina
          descricao="Marque as escolas que participam desta edição. Só as marcadas aparecem para o envio de documentos."
          acao={<Indicador valor={totalCiclo.toLocaleString("pt-BR")} rotulo={`${totalCiclo === 1 ? "escola" : "escolas"} em ${municipiosNoCiclo} ${municipiosNoCiclo === 1 ? "município" : "municípios"}`} />}
        >Escolas do programa</TituloPagina>

        {/* ============ município e busca numa linha só ============ */}
        <section className="mt-5">
          {!carregandoCiclos && ciclos.length === 0 && (
            <div className="mt-3 rounded-2xl border-2 border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/80">
              Crie um ciclo em Admin → Ciclos antes de escolher as escolas.
            </div>
          )}

          {erro && <div className="mt-3 rounded-xl bg-status-pendente/10 px-4 py-2.5 text-sm text-status-pendente" role="alert">{erro}</div>}
          {aviso && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">{aviso}</div>}

          {ciclos.length > 0 && (
            <>
              {/* abas + ações de lista */}
              <Abas<Visao>
                className="mt-4"
                abas={[
                  { valor: "no_programa", rotulo: `No programa (${marcadas})` },
                  { valor: "todas", rotulo: municipioId && escolas ? `Mostrar todas (${total})` : "Mostrar todas" },
                  { valor: "fora", rotulo: municipioId && escolas ? `Fora do programa (${total - marcadas})` : "Fora do programa" },
                ]}
                valor={visao}
                onChange={(v) => { setVisao(v); setPagina(1); }}
                direita={
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {salvando && <span className="text-xs text-brand-dark/60">Salvando...</span>}
                    <button
                      type="button"
                      onClick={marcarLista}
                      disabled={salvando || !lista.some((e) => !noPrograma.has(e.id))}
                      className="rounded-lg bg-brand-light px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-accent disabled:opacity-40"
                    >
                      Marcar lista ({lista.length})
                    </button>
                    <button
                      type="button"
                      onClick={desmarcarLista}
                      disabled={salvando || !lista.some((e) => noPrograma.has(e.id))}
                      className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-brand-dark hover:bg-black/[0.03] disabled:opacity-40"
                    >
                      Desmarcar lista ({lista.length})
                    </button>
                  </div>
                }
              />

              {/* filtros */}
              <BarraFiltros
                mostrarLimpar={Boolean(municipioId || busca.trim())}
                onLimpar={() => { setMunicipioId(""); setBusca(""); setPagina(1); }}
              >
                <CampoBusca value={busca} onChange={(v) => { setBusca(v); setPagina(1); }} placeholder="Buscar escola ou município..." />
                <select id="municipio-escolas" value={municipioId} onChange={(e) => setMunicipioId(e.target.value)} className={CLASSE_SELECT} aria-label="Município">
                  <option value="">Todos os municípios</option>
                  {municipios.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}{porMunicipio[String(m.id)] ? ` · ${porMunicipio[String(m.id)]} no programa` : ""}
                    </option>
                  ))}
                </select>
              </BarraFiltros>
              {/* barra fina de progresso (só quando há município escolhido) */}
              {municipioId && escolas && escolas.length > 0 && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06]" role="progressbar" aria-label="Escolas do município no programa" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-brand-light transition-all" style={{ width: `${pct}%` }} />
                </div>
              )}

              {precisaMunicipio && (
                <div className="mt-3 rounded-2xl border-2 border-dashed border-black/10 bg-black/[0.02] px-4 py-6 text-center">
                  <CriancasPulando />
                  <p className="mt-3 text-sm font-medium text-brand-dark/85">
                    Escolha um município para ver {visao === "fora" ? "as escolas que estão fora do programa" : "todas as escolas"}.
                  </p>
                </div>
              )}
              {!precisaMunicipio && (visao === "no_programa" ? carregandoPrograma : !!municipioId && !escolas && !erro) && (
                <p className="mt-3 text-sm text-brand-dark/75">Carregando...</p>
              )}
              {!precisaMunicipio && municipioId && escolas && escolas.length === 0 && (
                <div className="mt-3 rounded-2xl border-2 border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/80">
                  Nenhuma escola cadastrada neste município.
                </div>
              )}

              {!precisaMunicipio && !(visao === "no_programa" ? carregandoPrograma : !!municipioId && !escolas) && !(municipioId && escolas && escolas.length === 0) && (
                <>
                  <ul className="mt-3 grid gap-1.5 lg:grid-cols-2">
                    {lista.length === 0 && (
                      <li className="rounded-2xl border-2 border-dashed border-black/10 p-8 text-center text-sm text-brand-dark/80 lg:col-span-2">
                        {visao === "no_programa" && marcadas === 0 && !busca.trim()
                          ? municipioId
                            ? "Nenhuma escola deste município está no programa ainda."
                            : "Nenhuma escola está no programa nesta edição ainda."
                          : "Nenhuma escola encontrada com esses filtros."}
                        {visao !== "todas" && (
                          <button
                            type="button"
                            onClick={() => { setVisao("todas"); setPagina(1); }}
                            className="mx-auto mt-3 block rounded-full bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-accent"
                          >
                            Mostrar todas{municipioId && escolas ? ` (${total})` : ""}
                          </button>
                        )}
                      </li>
                    )}
                    {visiveis.map((escola) => {
                      const marcada = noPrograma.has(escola.id);
                      const nomeMun = nomeMunicipio.get(String(escola.municipio_id));
                      return (
                        <li key={escola.id}>
                          <label
                            className="flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1 transition-colors hover:border-brand-light/50"
                            style={marcada ? { background: "#EEF5F1", borderColor: "rgba(47,107,79,0.45)" } : { background: "#fff", borderColor: "rgba(0,0,0,0.09)" }}
                          >
                            <input
                              type="checkbox"
                              checked={marcada}
                              disabled={salvando}
                              onChange={(e) => aplicar([escola.id], e.target.checked)}
                              className="h-4 w-4 shrink-0 cursor-pointer"
                              style={{ accentColor: "#2F6B4F" }}
                            />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-dark" title={escola.nome}>{escola.nome}</span>
                            {/* o município só aparece quando a lista mistura vários (com um município escolhido seria repetição) */}
                            {nomeMun && !municipioId && (
                              <span className="max-w-[40%] shrink-0 truncate text-xs text-brand-dark/65" title={nomeMun}>{nomeMun}</span>
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>

                  {lista.length > POR_PAGINA && (
                    <nav className="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:justify-between" aria-label="Paginação">
                      <p className="text-xs text-brand-dark/70">
                        Mostrando {inicio + 1}–{Math.min(inicio + POR_PAGINA, lista.length)} de {lista.length}
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPagina(paginaAtual - 1)}
                          disabled={paginaAtual === 1}
                          className="rounded-full border-2 border-black/10 bg-white px-3 py-1 text-sm font-semibold text-brand-dark hover:bg-black/[0.03] disabled:opacity-40"
                        >
                          Anterior
                        </button>
                        {paginasMostradas.map((n, idx) =>
                          n === "..." ? (
                            <span key={`e${idx}`} className="px-1 text-sm text-brand-dark/50">…</span>
                          ) : (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setPagina(n)}
                              aria-current={n === paginaAtual ? "page" : undefined}
                              className="min-w-[2rem] rounded-full border-2 px-2 py-1 text-sm font-semibold"
                              style={n === paginaAtual ? { background: "#2F6B4F", borderColor: "#2F6B4F", color: "#fff" } : { background: "#fff", borderColor: "rgba(0,0,0,0.1)", color: "#122E20" }}
                            >
                              {n}
                            </button>
                          )
                        )}
                        <button
                          type="button"
                          onClick={() => setPagina(paginaAtual + 1)}
                          disabled={paginaAtual === totalPaginas}
                          className="rounded-full border-2 border-black/10 bg-white px-3 py-1 text-sm font-semibold text-brand-dark hover:bg-black/[0.03] disabled:opacity-40"
                        >
                          Próxima
                        </button>
                      </div>
                    </nav>
                  )}
                </>
              )}
            </>
          )}
        </section>
       </div>
      </div>

    </>
  );
}
