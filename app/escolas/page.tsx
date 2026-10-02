"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, apiPut, Escola, escolheMunicipio, Municipio } from "@/lib/api";
import { usePerfil } from "@/lib/usePerfil";
import { CheckIcon, MapPinIcon, SearchIcon } from "@/components/icons";
import { EscolaIcon, Info, normalizarTexto } from "@/components/DocumentoUI";
import { BotaoCompletar, BotaoEditar } from "@/components/BotoesIcone";

type Aba = "incompletas" | "completas" | "todas";

// 3174 -> "3.174" (separador de milhar em português)
const fmt = (n: number) => n.toLocaleString("pt-BR");

const POR_PAGINA = 50;
const TIPOS_ESCOLA = ["Municipal", "Estadual", "Privada", "Federal"];
const SELECT =
  "w-full border border-black/10 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30";
const CAMPO =
  "w-full border border-black/10 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30";

// Limites do Ceará (com folga) — usados só para pegar erros de digitação
// (sinal de menos esquecido, latitude e longitude trocadas...).
const CE = { latMin: -8.0, latMax: -2.5, lonMin: -41.6, lonMax: -37.0 };

// ---------- ajudantes ----------
const numero = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const temCoordenadas = (e: Escola) => numero(e.latitude) !== null && numero(e.longitude) !== null;
const temEndereco = (e: Escola) => (e.endereco ?? "").trim().length > 0;
const estaCompleta = (e: Escola) => temCoordenadas(e) && temEndereco(e);

function paraTexto(v: unknown) {
  const n = numero(v);
  return n === null || Number.isNaN(n) ? "" : String(n);
}

function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : NaN;
}

// O Google Maps copia "-3.432100, -40.123400". Se a pessoa colar isso no campo
// de latitude, separamos nos dois campos.
function separarPar(texto: string): [string, string] | null {
  const m =
    texto.match(/^\s*(-?\d+[.,]\d+)\s*[;,]?\s+(-?\d+[.,]\d+)\s*$/) ?? texto.match(/^\s*(-?\d+\.\d+),(-?\d+\.\d+)\s*$/);
  return m ? [m[1].replace(",", "."), m[2].replace(",", ".")] : null;
}

function validarCoordenadas(lat: string, lon: string): string | null {
  const la = lerNumero(lat);
  const lo = lerNumero(lon);
  if (la === null && lo === null) return null; // as duas vazias = sem localização
  if (la === null || lo === null) return "Preencha latitude e longitude juntas.";
  if (Number.isNaN(la) || Number.isNaN(lo)) return "Use apenas números. Exemplo: -3.432100";
  if (la < CE.latMin || la > CE.latMax || lo < CE.lonMin || lo > CE.lonMax) {
    return "Essa posição fica fora do Ceará. Confira o sinal de menos (-) e se latitude e longitude não estão trocadas.";
  }
  return null;
}

function linkGoogleMaps(e: Escola, lat: string, lon: string, endereco: string) {
  const la = lerNumero(lat);
  const lo = lerNumero(lon);
  const consulta =
    la !== null && lo !== null && !Number.isNaN(la) && !Number.isNaN(lo)
      ? `${la},${lo}`
      : `${e.nome} ${endereco} Ceará`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
}

// Guarda a lista de todas as escolas enquanto a pessoa navega pelo sistema:
// ao voltar para esta tela, ela aparece na hora e é atualizada em segundo plano.
let cacheTodas: Escola[] | null = null;

// ================================================================
// Página
// ================================================================
export default function EscolasPage() {
  const { perfil, carregando: carregandoPerfil } = usePerfil();
  const ehAdmin = perfil?.role === "admin";
  const podeEscolher = escolheMunicipio(perfil?.role); // admin e apoiadores escolhem o município na tela

  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [municipioAdmin, setMunicipioAdmin] = useState("");
  const [escolas, setEscolas] = useState<Escola[] | null>(null);
  const [idsPrograma, setIdsPrograma] = useState<Set<string> | null>(null); // escolas do programa no ciclo ativo
  const [soPrograma, setSoPrograma] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [aba, setAba] = useState<Aba | null>(null); // null = decide quando as escolas chegam
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(POR_PAGINA);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvoId, setSalvoId] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  // Município em uso: o próprio (responsável) ou o escolhido (admin)
  const municipioId = podeEscolher ? municipioAdmin : perfil?.municipio_id ? String(perfil.municipio_id) : "";

  useEffect(() => {
    if (carregandoPerfil) return;
    apiGet("/api/municipios")
      .then((lista: Municipio[]) => setMunicipios([...lista].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))))
      .catch(() => null);
  }, [carregandoPerfil]);

  useEffect(() => {
    setEscolas(null);
    setErro(null);
    setAba(null);
    setEditandoId(null);
    setCriando(false);
    setLimite(POR_PAGINA);
    setSoPrograma(!!municipioId); // sem município escolhido (admin): mostra TODAS as escolas
    if (carregandoPerfil) return;
    if (!municipioId && !podeEscolher) return; // responsável sem município
    let cancelado = false;

    if (!municipioId) {
      // TODAS as escolas: mostra assim que chegam (a lista é grande) e deixa o
      // "só do programa" carregar depois, sem travar a tela.
      setIdsPrograma(null);
      if (cacheTodas) {
        setEscolas(cacheTodas);
        setAba("todas");
      }
      apiGet("/api/escolas")
        .then((lista: Escola[]) => {
          if (cancelado) return;
          cacheTodas = lista;
          setEscolas(lista);
          setAba((atual) => atual ?? "todas");
        })
        .catch((e) => !cancelado && !cacheTodas && setErro(e.message));
      apiGet("/api/escolas-participantes")
        .then((programa: { escola_ids: string[] | null }) => {
          if (!cancelado) setIdsPrograma(programa.escola_ids ? new Set<string>(programa.escola_ids) : null);
        })
        .catch(() => null);
      return () => {
        cancelado = true;
      };
    }

    Promise.all([
      apiGet(`/api/escolas?municipio_id=${municipioId}`),
      apiGet(`/api/escolas-participantes?municipio_id=${municipioId}`).catch(() => ({ escola_ids: null })),
    ])
      .then(([lista, programa]: [Escola[], { escola_ids: string[] | null }]) => {
        if (cancelado) return;
        const ids = programa.escola_ids ? new Set<string>(programa.escola_ids) : null;
        setEscolas(lista);
        setIdsPrograma(ids);
        const base = municipioId && ids ? lista.filter((e) => ids.has(e.id)) : lista;
        setAba(municipioId && base.some((e) => !estaCompleta(e)) ? "incompletas" : "todas");
      })
      .catch((e) => !cancelado && setErro(e.message));
    return () => {
      cancelado = true;
    };
  }, [municipioId, podeEscolher, carregandoPerfil]);

  const nomeMunicipio = municipios.find((m) => String(m.id) === municipioId)?.nome;
  const nomesMunicipios = useMemo(() => new Map(municipios.map((m) => [String(m.id), m.nome])), [municipios]);
  const mostrandoTodas = podeEscolher && !municipioId;

  // Só as escolas do programa (ou todas, se a pessoa desmarcar o filtro)
  const escolasBase = useMemo(
    () => (soPrograma && idsPrograma ? (escolas ?? []).filter((e) => idsPrograma.has(e.id)) : escolas ?? []),
    [escolas, idsPrograma, soPrograma]
  );

  const contagem = useMemo(() => {
    const todas = escolasBase;
    const completas = todas.filter(estaCompleta).length;
    return { incompletas: todas.length - completas, completas, todas: todas.length };
  }, [escolasBase]);

  // useDeferredValue: a digitação continua fluida enquanto as 10 mil escolas são filtradas
  const buscaAdiada = useDeferredValue(busca);
  const lista = useMemo(() => {
    const termo = normalizarTexto(buscaAdiada.trim());
    return escolasBase.filter(
      (e) =>
        (aba === "todas" || aba === null || (aba === "completas" ? estaCompleta(e) : !estaCompleta(e))) &&
        (!termo || normalizarTexto(e.nome).includes(termo) || normalizarTexto(e.endereco).includes(termo))
    );
  }, [escolasBase, aba, buscaAdiada]);

  const pctCompletas = contagem.todas ? Math.round((contagem.completas / contagem.todas) * 100) : 0;

  function aoCriar(nova: Escola & { no_programa?: boolean }) {
    if (cacheTodas) cacheTodas = [...cacheTodas, nova].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    setEscolas((atual) => [...(atual ?? []), nova].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    if (nova.no_programa) setIdsPrograma((atual) => (atual ? new Set(atual).add(nova.id) : atual));
    else setSoPrograma(false); // não entrou no programa: mostra todas para a pessoa enxergar a escola nova
    setAba(estaCompleta(nova) ? "completas" : "incompletas");
    setBusca("");
    setCriando(false);
    setSalvoId(nova.id);
    window.setTimeout(() => setSalvoId((id) => (id === nova.id ? null : id)), 6000);
  }

  function aoSalvar(atualizada: Escola) {
    if (cacheTodas) cacheTodas = cacheTodas.map((e) => (e.id === atualizada.id ? { ...e, ...atualizada } : e));
    setEscolas((atual) => (atual ?? []).map((e) => (e.id === atualizada.id ? { ...e, ...atualizada } : e)));
    setEditandoId(null);
    setSalvoId(atualizada.id);
    window.setTimeout(() => setSalvoId((id) => (id === atualizada.id ? null : id)), 4000);
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 sm:p-7">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark">
              Escolas{nomeMunicipio ? ` de ${nomeMunicipio}` : ""}
            </h1>
            <p className="text-sm text-brand-dark/80 mt-1 max-w-2xl">
              Complete o cadastro das escolas do programa (nome, tipo, endereço e localização) ou cadastre uma escola que ainda não está na lista. Esses dados alimentam o mapa da galeria.
            </p>
            {ehAdmin && (
              <Link
                href="/admin/escolas-programa"
                className="group mt-4 inline-flex items-center gap-2.5 rounded-xl bg-[#2678C4] py-2 pl-2.5 pr-4 text-sm font-bold text-white shadow-md shadow-[#2678C4]/25 transition-all hover:-translate-y-0.5 hover:bg-[#1F67AA] hover:shadow-lg"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
                  <CheckIcon className="h-4 w-4" />
                </span>
                Escolher quais escolas participam do programa
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-3">
          {municipioId && !criando && (
            <button
              type="button"
              onClick={() => { setCriando(true); setEditandoId(null); }}
              className="whitespace-nowrap rounded-lg bg-brand-light px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-accent transition-colors"
            >
              + Nova escola
            </button>
          )}
          {escolas && (
            <div className="rounded-xl bg-brand-light/[0.06] border border-brand-light/10 px-5 py-3 text-center">
              <p className={`text-3xl font-bold leading-none ${contagem.incompletas ? "text-status-pendente" : "text-brand-dark"}`}>
                {fmt(contagem.incompletas)}
              </p>
              <p className="text-xs text-brand-dark/75 mt-1">{contagem.incompletas === 1 ? "incompleta" : "incompletas"}</p>
            </div>
          )}
          </div>
        </div>

        {podeEscolher && (
          <div className="mt-5 max-w-sm">
            <select value={municipioAdmin} onChange={(e) => setMunicipioAdmin(e.target.value)} className={SELECT} aria-label="Município">
              <option value="">Todos os municípios</option>
              {municipios.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </div>
        )}

        {erro && <div className="mt-5 rounded-lg bg-status-pendente/10 text-status-pendente px-4 py-3 text-sm">{erro}</div>}

        {criando && municipioId && (
          <FormularioNovaEscola municipioId={municipioId} nomeMunicipio={nomeMunicipio} onCancelar={() => setCriando(false)} onCriada={aoCriar} />
        )}

        {!carregandoPerfil && !podeEscolher && !municipioId && (
          <div className="mt-5 rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-brand-dark/75">
            Seu usuário ainda não está ligado a um município. Peça ao administrador para concluir o cadastro.
          </div>
        )}
        {(municipioId || podeEscolher) && !escolas && !erro && <p className="mt-5 text-sm text-brand-dark/75">Carregando...</p>}

        {escolas && escolas.length === 0 && (
          <div className="mt-5 rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-brand-dark/75">
            Nenhuma escola cadastrada{mostrandoTodas ? "" : " neste município"}.
          </div>
        )}

        {escolas && escolas.length > 0 && idsPrograma && (
          <label className="mt-5 flex items-center gap-2 text-sm text-brand-dark">
            <input type="checkbox" checked={soPrograma} onChange={(e) => { setSoPrograma(e.target.checked); setLimite(POR_PAGINA); }} className="h-4 w-4 accent-[#2F6B4F]" />
            Mostrar só as escolas do programa ({fmt(idsPrograma.size)} de {fmt(escolas.length)})
          </label>
        )}

        {escolas && escolas.length > 0 && escolasBase.length === 0 && (
          <div className="mt-5 rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-brand-dark/75">
            Nenhuma escola deste município foi incluída no programa neste ciclo.
            {ehAdmin ? " Marque as escolas em Escolas do programa." : " Peça ao administrador para incluí-las."}
          </div>
        )}

        {escolas && escolas.length > 0 && escolasBase.length > 0 && (
          <>
            {/* Andamento */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-sm text-brand-dark/80 mb-1.5">
                <span>
                  <strong className="text-brand-dark">{fmt(contagem.completas)}</strong> de {fmt(contagem.todas)} escolas com endereço e localização
                </span>
                <span className="font-semibold text-brand-dark">{pctCompletas}%</span>
              </div>
              <div className="h-2 rounded-full bg-black/[0.06] overflow-hidden" role="progressbar" aria-valuenow={pctCompletas} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-status-completo transition-all" style={{ width: `${pctCompletas}%` }} />
              </div>
            </div>

            {/* Abas + busca */}
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-black/10">
              <nav className="flex gap-1 overflow-x-auto -mb-px">
                {(
                  [
                    ["incompletas", "Incompletas"],
                    ["completas", "Completas"],
                    ["todas", "Todas"],
                  ] as [Aba, string][]
                ).map(([valor, rotulo]) => (
                  <button
                    key={valor}
                    onClick={() => {
                      setAba(valor);
                      setLimite(POR_PAGINA);
                      setEditandoId(null);
                    }}
                    className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                      aba === valor ? "border-brand-light text-brand-light" : "border-transparent text-brand-dark/75 hover:text-brand-dark"
                    }`}
                  >
                    {rotulo} ({fmt(contagem[valor])})
                  </button>
                ))}
              </nav>
              <div className="relative mb-2 sm:w-80">
                <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark/60" />
                <input
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setLimite(POR_PAGINA);
                  }}
                  placeholder="Buscar escola ou endereço..."
                  className="w-full border border-black/10 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30"
                />
              </div>
            </div>

            {/* Lista */}
            <div className="mt-5 space-y-3">
              {lista.length === 0 && (
                <div className="rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-brand-dark/75">
                  {aba === "incompletas" && !busca.trim()
                    ? "🎉 Todas as escolas estão com endereço e localização."
                    : "Nenhuma escola encontrada com esses filtros."}
                </div>
              )}
              {lista.slice(0, limite).map((escola) => (
                <CartaoEscola
                  key={escola.id}
                  escola={escola}
                  municipioNome={mostrandoTodas ? nomesMunicipios.get(String(escola.municipio_id)) : undefined}
                  editando={editandoId === escola.id}
                  salvo={salvoId === escola.id}
                  onEditar={() => setEditandoId(escola.id)}
                  onCancelar={() => setEditandoId(null)}
                  onSalvo={aoSalvar}
                />
              ))}
              {lista.length > limite && (
                <button
                  onClick={() => setLimite((l) => l + POR_PAGINA)}
                  className="w-full rounded-lg border border-black/10 py-2.5 text-sm font-semibold text-brand-light hover:bg-brand-light/5"
                >
                  Mostrar mais ({fmt(lista.length - limite)} restantes)
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ================================================================
// Card de uma escola
// ================================================================
function CartaoEscola({
  escola,
  municipioNome,
  editando,
  salvo,
  onEditar,
  onCancelar,
  onSalvo,
}: {
  escola: Escola;
  municipioNome?: string;
  editando: boolean;
  salvo: boolean;
  onEditar: () => void;
  onCancelar: () => void;
  onSalvo: (e: Escola) => void;
}) {
  const semEndereco = !temEndereco(escola);
  const semCoord = !temCoordenadas(escola);

  return (
    <article className={`rounded-xl border bg-white p-3 sm:p-4 transition-shadow ${editando ? "border-brand-light/40 ring-2 ring-brand-light/20 shadow-md" : "border-black/5 hover:shadow-sm"}`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        <div className="hidden sm:flex w-12 h-12 shrink-0 items-center justify-center rounded-lg bg-brand-light/[0.06] text-brand-light">
          <EscolaIcon className="w-6 h-6" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-brand-dark leading-snug">
            {escola.nome}
            {escola.tipo && <span className="ml-2 align-middle rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold text-brand-dark/75">{escola.tipo}</span>}
            {municipioNome && <span className="ml-2 align-middle rounded-full bg-[#E2EFFB] px-2 py-0.5 text-xs font-semibold text-[#0F4C85]">{municipioNome}</span>}
          </h2>

          <div className="mt-1.5 flex flex-col gap-y-1 text-[13px] text-brand-dark/80">
            {semEndereco ? (
              <span className="inline-flex items-center gap-1 text-amber-800">
                <MapPinIcon className="w-3.5 h-3.5 shrink-0" /> Endereço não informado
              </span>
            ) : (
              <Info icone={MapPinIcon} texto={escola.endereco!.trim()} />
            )}
            {semCoord ? (
              <span className="inline-flex items-center gap-1 text-amber-800">
                <MapPinIcon className="w-3.5 h-3.5 shrink-0" /> Sem latitude e longitude
              </span>
            ) : (
              <span className="text-brand-dark/70 pl-[18px]">
                Lat {Number(escola.latitude).toFixed(6)} · Long {Number(escola.longitude).toFixed(6)}
              </span>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px]">
            {salvo ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-status-completo">
                <span className="w-5 h-5 rounded-full bg-status-completo text-white flex items-center justify-center">
                  <CheckIcon className="w-3 h-3" />
                </span>
                Salvo
              </span>
            ) : !semEndereco && !semCoord ? (
              <span className="inline-flex items-center gap-1.5 text-brand-dark/80">
                <span className="w-5 h-5 rounded-full bg-status-completo text-white flex items-center justify-center">
                  <CheckIcon className="w-3 h-3" />
                </span>
                Dados completos
              </span>
            ) : (
              <>
                {semEndereco && <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Falta endereço</span>}
                {semCoord && <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Falta localização</span>}
              </>
            )}
          </div>
        </div>

        {!editando && (semEndereco || semCoord ? (
          <div className="self-start">
            <BotaoCompletar onClick={onEditar} rotulo={escola.nome} />
          </div>
        ) : (
          <div className="self-start">
            <BotaoEditar onClick={onEditar} rotulo={escola.nome} />
          </div>
        ))}
      </div>

      {editando && <FormularioEscola escola={escola} onCancelar={onCancelar} onSalvo={onSalvo} />}
    </article>
  );
}

// ================================================================
// Formulário de edição (nome, tipo, endereço + latitude/longitude)
// ================================================================
function FormularioEscola({ escola, onCancelar, onSalvo }: { escola: Escola; onCancelar: () => void; onSalvo: (e: Escola) => void }) {
  const inicial = { nome: escola.nome ?? "", tipo: escola.tipo ?? "", endereco: escola.endereco ?? "", lat: paraTexto(escola.latitude), lon: paraTexto(escola.longitude) };
  const [nome, setNome] = useState(inicial.nome);
  const [tipo, setTipo] = useState(inicial.tipo);
  const [endereco, setEndereco] = useState(inicial.endereco);
  const [lat, setLat] = useState(inicial.lat);
  const [lon, setLon] = useState(inicial.lon);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const problemaCoord = validarCoordenadas(lat, lon);
  const problemaNome = nome.trim().length < 3 ? "Informe o nome da escola (mínimo de 3 letras)." : null;
  const problema = problemaNome ?? problemaCoord;
  const alterou =
    nome.trim() !== inicial.nome.trim() ||
    tipo !== inicial.tipo ||
    endereco.trim() !== inicial.endereco.trim() ||
    lerNumero(lat) !== lerNumero(inicial.lat) ||
    lerNumero(lon) !== lerNumero(inicial.lon);

  function aoMudarLatitude(texto: string) {
    const par = separarPar(texto);
    if (par) {
      setLat(par[0]);
      setLon(par[1]);
    } else {
      setLat(texto);
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (problema || !alterou) return;
    setSalvando(true);
    setErro(null);
    try {
      const atualizada: Escola = await apiPut("/api/escolas", {
        id: escola.id,
        nome: nome.trim(),
        tipo,
        endereco: endereco.trim(),
        latitude: lerNumero(lat),
        longitude: lerNumero(lon),
      });
      onSalvo(atualizada);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={salvar}
      onKeyDown={(e) => e.key === "Escape" && onCancelar()}
      className="mt-4 border-t border-black/10 pt-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3 mb-4">
        <div>
          <label htmlFor={`nome-${escola.id}`} className="block text-sm font-medium text-brand-dark mb-1.5">Nome da escola</label>
          <input id={`nome-${escola.id}`} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} className={CAMPO} />
        </div>
        <div>
          <label htmlFor={`tipo-${escola.id}`} className="block text-sm font-medium text-brand-dark mb-1.5">Tipo</label>
          <select id={`tipo-${escola.id}`} value={tipo} onChange={(e) => setTipo(e.target.value)} className={CAMPO}>
            <option value="">Não informado</option>
            {[...TIPOS_ESCOLA, ...(tipo && !TIPOS_ESCOLA.includes(tipo) ? [tipo] : [])].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <label htmlFor={`end-${escola.id}`} className="block text-sm font-medium text-brand-dark mb-1.5">
        Endereço
      </label>
      <textarea
        id={`end-${escola.id}`}
        value={endereco}
        onChange={(e) => setEndereco(e.target.value)}
        rows={2}
        maxLength={300}
        placeholder="Rua, número, bairro ou localidade, CEP"
        className={CAMPO}
      />

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
        <div>
          <label htmlFor={`lat-${escola.id}`} className="block text-sm font-medium text-brand-dark mb-1.5">Latitude</label>
          <input
            id={`lat-${escola.id}`}
            value={lat}
            onChange={(e) => aoMudarLatitude(e.target.value)}
            inputMode="decimal"
            placeholder="-3.432100"
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor={`lon-${escola.id}`} className="block text-sm font-medium text-brand-dark mb-1.5">Longitude</label>
          <input
            id={`lon-${escola.id}`}
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            inputMode="decimal"
            placeholder="-40.123400"
            className={CAMPO}
          />
        </div>
      </div>

      <p className="mt-2 text-xs text-brand-dark/75 max-w-xl">
        Dica: no Google Maps, clique com o botão direito no local da escola e clique nos números que aparecem para copiar.
        Depois cole no campo Latitude — os dois campos são preenchidos de uma vez.
      </p>
      <a
        href={linkGoogleMaps(escola, lat, lon, endereco)}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 inline-block text-sm font-semibold text-brand-light hover:underline"
      >
        {problemaCoord === null && lat.trim() && lon.trim() ? "Conferir no Google Maps ↗" : "Procurar no Google Maps ↗"}
      </a>

      {problema && (
        <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">⚠️ {problema}</p>
      )}
      {erro && <p className="mt-3 rounded-lg bg-status-pendente/10 px-3 py-2 text-sm text-status-pendente">{erro}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          disabled={salvando}
          className="px-3 py-2 rounded-lg border border-black/10 text-sm font-medium text-brand-dark/85 hover:bg-brand-light/5 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={salvando || Boolean(problema) || !alterou}
          className="px-4 py-2 rounded-lg bg-status-completo text-white text-sm font-semibold disabled:opacity-50"
        >
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}

// ================================================================
// Formulário de nova escola
// ================================================================
function FormularioNovaEscola({
  municipioId,
  nomeMunicipio,
  onCancelar,
  onCriada,
}: {
  municipioId: string;
  nomeMunicipio?: string;
  onCancelar: () => void;
  onCriada: (escola: Escola & { no_programa?: boolean }) => void;
}) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("Municipal");
  const [endereco, setEndereco] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const problemaCoord = validarCoordenadas(lat, lon);
  const problemaNome = nome.trim().length < 3 ? "Informe o nome da escola (mínimo de 3 letras)." : null;

  function aoMudarLatitude(texto: string) {
    const par = separarPar(texto);
    if (par) {
      setLat(par[0]);
      setLon(par[1]);
    } else {
      setLat(texto);
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (problemaNome || problemaCoord) return;
    setSalvando(true);
    setErro(null);
    try {
      const criada = await apiPost("/api/escolas", {
        municipio_id: municipioId,
        nome: nome.trim(),
        tipo,
        endereco: endereco.trim(),
        latitude: lerNumero(lat),
        longitude: lerNumero(lon),
      });
      onCriada(criada);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível cadastrar a escola.");
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={salvar}
      onKeyDown={(e) => e.key === "Escape" && onCancelar()}
      className="mt-5 rounded-xl border border-brand-light/40 ring-2 ring-brand-light/20 shadow-md bg-white p-4 sm:p-5"
    >
      <h2 className="font-semibold text-brand-dark">Nova escola{nomeMunicipio ? ` em ${nomeMunicipio}` : ""}</h2>
      <p className="text-xs text-brand-dark/75 mt-1 mb-4">
        Só o nome é obrigatório. Dá para completar o endereço e a localização depois. A escola nova já entra no programa do ciclo ativo.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
        <div>
          <label htmlFor="nova-nome" className="block text-sm font-medium text-brand-dark mb-1.5">Nome da escola *</label>
          <input id="nova-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} autoFocus className={CAMPO} placeholder="Ex: Escola Municipal Maria da Penha" />
        </div>
        <div>
          <label htmlFor="nova-tipo" className="block text-sm font-medium text-brand-dark mb-1.5">Tipo</label>
          <select id="nova-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={CAMPO}>
            <option value="">Não informado</option>
            {TIPOS_ESCOLA.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <label htmlFor="nova-endereco" className="block text-sm font-medium text-brand-dark mt-4 mb-1.5">
        Endereço <span className="font-normal text-brand-dark/60">(opcional)</span>
      </label>
      <textarea id="nova-endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} rows={2} maxLength={300} placeholder="Rua, número, bairro ou localidade, CEP" className={CAMPO} />

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
        <div>
          <label htmlFor="nova-lat" className="block text-sm font-medium text-brand-dark mb-1.5">Latitude <span className="font-normal text-brand-dark/60">(opcional)</span></label>
          <input id="nova-lat" value={lat} onChange={(e) => aoMudarLatitude(e.target.value)} inputMode="decimal" placeholder="-3.432100" className={CAMPO} />
        </div>
        <div>
          <label htmlFor="nova-lon" className="block text-sm font-medium text-brand-dark mb-1.5">Longitude <span className="font-normal text-brand-dark/60">(opcional)</span></label>
          <input id="nova-lon" value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" placeholder="-40.123400" className={CAMPO} />
        </div>
      </div>
      <p className="mt-2 text-xs text-brand-dark/75 max-w-xl">
        Dica: no Google Maps, clique com o botão direito no local da escola e copie os números. Cole no campo Latitude e os dois campos se preenchem.
      </p>

      {problemaCoord && <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">⚠️ {problemaCoord}</p>}
      {erro && <p className="mt-3 rounded-lg bg-status-pendente/10 px-3 py-2 text-sm text-status-pendente" role="alert">{erro}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancelar} disabled={salvando} className="px-3 py-2 rounded-lg border border-black/10 text-sm font-medium text-brand-dark/85 hover:bg-brand-light/5 disabled:opacity-50">
          Cancelar
        </button>
        <button type="submit" disabled={salvando || Boolean(problemaNome) || Boolean(problemaCoord)} className="px-4 py-2 rounded-lg bg-status-completo text-white text-sm font-semibold disabled:opacity-50">
          {salvando ? "Cadastrando..." : "Cadastrar escola"}
        </button>
      </div>
    </form>
  );
}
