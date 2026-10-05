"use client";

import { TituloPagina, Indicador } from "@/components/TituloPagina";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, Escola, escolheMunicipio, Municipio } from "@/lib/api";
import { usePerfil } from "@/lib/usePerfil";
import { CheckIcon, MapPinIcon } from "@/components/icons";
import { EscolaIcon, Info, normalizarTexto } from "@/components/DocumentoUI";
import { BotaoCompletar, BotaoEditar } from "@/components/BotoesIcone";
import { Abas, BarraFiltros, CampoBusca, CLASSE_SELECT } from "@/components/Filtros";
import { CAMPO, estaCompleta, FormularioEscola, lerNumero, separarPar, temCoordenadas, temEndereco, TIPOS_ESCOLA, validarCoordenadas } from "@/components/FormularioEscola";

type Aba = "incompletas" | "completas" | "todas";

// 3174 -> "3.174" (separador de milhar em português)
const fmt = (n: number) => n.toLocaleString("pt-BR");

const POR_PAGINA = 50;
// Guarda a lista de todas as escolas enquanto a pessoa navega pelo sistema:
// ao voltar para esta tela, ela aparece na hora e é atualizada em segundo plano.
let cacheTodas: Escola[] | null = null;
// Quem não é admin só vê as escolas do programa: busca só essas (algumas centenas) em vez das ~10 mil do estado
const cachePrograma = new Map<string, Escola[]>();

// ================================================================
// Página
// ================================================================
export default function EscolasPage() {
  const { perfil, carregando: carregandoPerfil } = usePerfil();
  const ehAdmin = perfil?.role === "admin";
  const podeEscolher = escolheMunicipio(perfil?.role);
  const soDoPrograma = perfil?.role !== "admin"; // só o administrador pode ver escolas fora do programa (coordenador e apoiadores veem apenas as do programa) // admin e apoiadores escolhem o município na tela

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
    setSoPrograma(soDoPrograma || !!municipioId); // sem município escolhido (admin): mostra TODAS as escolas
    if (carregandoPerfil) return;
    if (!municipioId && !podeEscolher) return; // responsável sem município
    let cancelado = false;

    if (soDoPrograma) {
      // Coordenador e apoiadores: o servidor já devolve só as escolas do programa (muito menos que "todas")
      const url = `/api/escolas?participantes=1${municipioId ? `&municipio_id=${municipioId}` : ""}`;
      const aplicar = (lista: Escola[]) => {
        setEscolas(lista);
        setIdsPrograma(new Set(lista.map((e) => e.id)));
        setAba((atual) => atual ?? (lista.some((e) => !estaCompleta(e)) ? "incompletas" : "todas"));
      };
      const guardada = cachePrograma.get(url);
      if (guardada) aplicar(guardada); // mostra na hora e atualiza em segundo plano
      apiGet(url)
        .then((lista: Escola[]) => {
          if (cancelado) return;
          cachePrograma.set(url, lista);
          aplicar(lista);
        })
        .catch((e) => !cancelado && !guardada && setErro(e.message));
      return () => {
        cancelado = true;
      };
    }

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
        .catch(() => { if (!cancelado && soDoPrograma) setIdsPrograma(new Set()); }); // sem a lista do programa, quem não é admin não vê nada
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
  }, [municipioId, podeEscolher, carregandoPerfil, soDoPrograma]);

  const nomeMunicipio = (municipioId ? municipios.find((m) => String(m.id) === municipioId)?.nome : undefined) ?? perfil?.municipio_nome ?? undefined;
  const nomesMunicipios = useMemo(() => new Map(municipios.map((m) => [String(m.id), m.nome])), [municipios]);
  const mostrandoTodas = podeEscolher && !municipioId;

  // Só as escolas do programa (ou todas, se a pessoa desmarcar o filtro)
  const escolasBase = useMemo(
    () => {
      if (soPrograma && idsPrograma) return (escolas ?? []).filter((e) => idsPrograma.has(e.id));
      if (soPrograma && soDoPrograma) return []; // a lista do programa ainda não chegou: não mostra escola de fora
      return escolas ?? [];
    },
    [escolas, idsPrograma, soPrograma, soDoPrograma]
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
    cachePrograma.clear();
    if (cacheTodas) cacheTodas = [...cacheTodas, nova].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    setEscolas((atual) => [...(atual ?? []), nova].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    if (nova.no_programa) setIdsPrograma((atual) => (atual ? new Set(atual).add(nova.id) : atual));
    else if (!soDoPrograma) setSoPrograma(false); // não entrou no programa: mostra todas para a pessoa enxergar a escola nova
    setAba(estaCompleta(nova) ? "completas" : "incompletas");
    setBusca("");
    setCriando(false);
    setSalvoId(nova.id);
    window.setTimeout(() => setSalvoId((id) => (id === nova.id ? null : id)), 6000);
  }

  function aoSalvar(atualizada: Escola) {
    cachePrograma.clear();
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
        <TituloPagina
          descricao="Complete o cadastro das escolas do programa (nome, tipo, endereço e localização) ou cadastre uma escola que ainda não está na lista."
          acao={
            <div className="flex items-center gap-3">
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
            <Indicador valor={fmt(contagem.incompletas)} rotulo={contagem.incompletas === 1 ? "incompleta" : "incompletas"} alerta={contagem.incompletas > 0} />
          )}
            </div>
          }
        >
          Escolas{nomeMunicipio ? ` de ${nomeMunicipio}` : ""}
        </TituloPagina>
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

        {podeEscolher && (
          <div className="mt-5 max-w-sm">
            <select value={municipioAdmin} onChange={(e) => setMunicipioAdmin(e.target.value)} className={CLASSE_SELECT} aria-label="Município">
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

        {!carregandoPerfil && !podeEscolher && !municipioId && perfil?.municipio_nome && perfil.role === "municipio" && (
          <EscolasAguardandoAprovacao municipio={perfil.municipio_nome} />
        )}
        {!carregandoPerfil && !podeEscolher && !municipioId && !(perfil?.municipio_nome && perfil.role === "municipio") && (
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

        {escolas && escolas.length > 0 && idsPrograma && !soDoPrograma && (
          <label className="mt-5 flex items-center gap-2 text-sm text-brand-dark">
            <input type="checkbox" checked={soPrograma} onChange={(e) => { setSoPrograma(e.target.checked); setLimite(POR_PAGINA); }} className="h-4 w-4 accent-[#2F6B4F]" />
            Mostrar só as escolas do programa ({fmt(idsPrograma.size)} de {fmt(escolas.length)})
          </label>
        )}

        {escolas && escolas.length > 0 && escolasBase.length === 0 && (!soDoPrograma || idsPrograma) && (
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
            <Abas<Aba>
              abas={[
                { valor: "incompletas", rotulo: "Incompletas", contagem: fmt(contagem.incompletas) },
                { valor: "completas", rotulo: "Completas", contagem: fmt(contagem.completas) },
                { valor: "todas", rotulo: "Todas", contagem: fmt(contagem.todas) },
              ]}
              valor={aba}
              onChange={(v) => { setAba(v); setLimite(POR_PAGINA); setEditandoId(null); }}
            />
            <BarraFiltros
              colunas="grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr]"
              mostrarLimpar={Boolean(busca.trim())}
              onLimpar={() => { setBusca(""); setLimite(POR_PAGINA); }}
            >
              <CampoBusca value={busca} onChange={(v) => { setBusca(v); setLimite(POR_PAGINA); }} placeholder="Buscar escola ou endereço..." />
            </BarraFiltros>

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


// ================================================================
// Coordenador cujo município ainda não foi liberado: mostra só as escolas do município
// escolhido no cadastro (somente leitura) e leva à ficha de adesão, onde elas são vinculadas ao programa.
// ================================================================
function EscolasAguardandoAprovacao({ municipio }: { municipio: string }) {
  const [lista, setLista] = useState<{ id: string; nome: string; tipo?: string | null; endereco?: string | null }[] | null>(null);
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet("/api/adesao/escolas"),
      apiGet("/api/adesao").catch(() => null),
    ])
      .then(([escolas, resp]) => {
        setLista(escolas);
        setEscolhidas(new Set<string>((resp?.adesao?.escolas ?? []).map((e: { escola_id: string }) => e.escola_id)));
      })
      .catch((e) => setErro(e.message));
  }, []);

  const termo = busca.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const visiveis = (lista ?? []).filter((e) => !termo || e.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(termo));

  return (
    <div className="mt-5">
      <div className="rounded-xl bg-[#E2EFFB] px-4 py-3 text-sm text-[#0F4C85]">
        O município de <strong>{municipio}</strong> será liberado quando o administrador aprovar a sua adesão. Para vincular escolas ao programa,
        marque-as na <Link href="/adesao/ficha" className="font-bold underline">Ficha de adesão</Link>. Depois da aprovação elas aparecem aqui para você completar o cadastro.
      </div>
      {erro && <div className="mt-3 rounded-lg bg-status-pendente/10 px-4 py-3 text-sm text-status-pendente">{erro}</div>}
      {!lista && !erro && <p className="mt-4 text-sm text-brand-dark/75">Carregando escolas de {municipio}...</p>}
      {lista && (
        <>
          <div className="mt-4 grid grid-cols-1 sm:max-w-md">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar escola..."
              className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30"
            />
          </div>
          <p className="mt-2 text-sm text-brand-dark/75">{lista.length} escola(s) em {municipio} · {escolhidas.size} escolhida(s) na ficha</p>
          <ul className="mt-3 space-y-2">
            {visiveis.map((e) => (
              <li key={e.id} className={`rounded-xl border px-4 py-3 ${escolhidas.has(e.id) ? "border-brand-light/40 bg-[#F3FAF6]" : "border-black/5 bg-white"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-brand-dark">{e.nome}</p>
                  {escolhidas.has(e.id) && <span className="rounded-full bg-[#E3F4EA] px-2.5 py-0.5 text-xs font-bold text-[#17613B]">Escolhida na ficha</span>}
                </div>
                {(e.tipo || e.endereco) && <p className="text-xs text-brand-dark/70">{[e.tipo, e.endereco].filter(Boolean).join(" · ")}</p>}
              </li>
            ))}
            {visiveis.length === 0 && <li className="text-sm text-brand-dark/75">Nenhuma escola encontrada.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
