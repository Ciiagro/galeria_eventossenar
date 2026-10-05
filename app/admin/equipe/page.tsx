"use client";

import { TituloPagina, Indicador } from "@/components/TituloPagina";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, MembroEquipe, Municipio, ROTULO_PAPEL } from "@/lib/api";
import { AdminGuard } from "@/components/AdminGuard";
import { LockIcon, MailIcon, MapPinIcon, SearchIcon, UserIcon, XIcon } from "@/components/icons";
import { BotaoEditar, BotaoExcluir } from "@/components/BotoesIcone";
import { BarraFiltros, CampoBusca } from "@/components/Filtros";

type PapelApoio = MembroEquipe["role"];

const PAPEIS: { valor: PapelApoio; titulo: string; descricao: string; cor: string; fundo: string }[] = [
  {
    valor: "apoiador_visitas",
    titulo: ROTULO_PAPEL.apoiador_visitas,
    descricao: "Atua nos municípios que você definir. Envia relatório, imagens e vídeos das visitas.",
    cor: "#0F4C85",
    fundo: "#E2EFFB",
  },
  {
    valor: "apoiador_relatorios",
    titulo: ROTULO_PAPEL.apoiador_relatorios,
    descricao: "Atua nos municípios que você definir. Envia relatórios e analisa os documentos e imagens antes da validação do administrador.",
    cor: "#17613B",
    fundo: "#E3F4EA",
  },
];

const CAMPO =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30";

function semAcento(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function EquipePageGuarded() {
  return (
    <AdminGuard>
      <EquipePage />
    </AdminGuard>
  );
}

function EquipePage() {
  const [equipe, setEquipe] = useState<MembroEquipe[] | null>(null);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  // municípios contemplados = com escolas no programa do ciclo ativo ("todos" se não for possível consultar)
  const [contemplados, setContemplados] = useState<Set<number> | "todos" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<PapelApoio>("apoiador_visitas");
  const [escolhidos, setEscolhidos] = useState<Set<number>>(new Set());
  const [buscaMunicipio, setBuscaMunicipio] = useState("");
  const [buscaEquipe, setBuscaEquipe] = useState(""); // pesquisa na lista da equipe
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    return apiGet("/api/usuarios")
      .then((lista: MembroEquipe[]) => setEquipe(lista))
      .catch((e) => {
        setErro(e.message);
        setEquipe([]);
      });
  }, []);

  useEffect(() => {
    carregar();
    apiGet("/api/municipios")
      .then((lista: Municipio[]) => setMunicipios([...lista].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))))
      .catch(() => null);
    apiGet("/api/escolas-participantes?resumo=1")
      .then((r) => {
        const ids = Object.entries((r.por_municipio ?? {}) as Record<string, number>)
          .filter(([, qtd]) => Number(qtd) > 0)
          .map(([id]) => Number(id));
        setContemplados(new Set(ids));
      })
      .catch(() => setContemplados("todos"));
  }, [carregar]);

  const nomes = useMemo(() => new Map(municipios.map((m) => [m.id, m.nome])), [municipios]);
  const municipiosFiltrados = useMemo(() => {
    const termo = semAcento(buscaMunicipio.trim());
    // só os contemplados; os que a pessoa já tem marcados continuam na lista para poderem ser desmarcados
    const visiveis =
      contemplados instanceof Set ? municipios.filter((m) => contemplados.has(m.id) || escolhidos.has(m.id)) : municipios;
    return termo ? visiveis.filter((m) => semAcento(m.nome).includes(termo)) : visiveis;
  }, [municipios, buscaMunicipio, contemplados, escolhidos]);

  // pesquisa por nome, e-mail, função (visitas/relatórios) ou município
  const equipeFiltrada = useMemo(() => {
    const termo = semAcento(buscaEquipe.trim());
    if (!equipe || !termo) return equipe;
    return equipe.filter((m) =>
      [m.nome, m.email, PAPEIS.find((p) => p.valor === m.role)?.titulo, ...m.municipio_ids.map((id) => nomes.get(id))]
        .some((v) => semAcento(String(v ?? "")).includes(termo))
    );
  }, [equipe, buscaEquipe, nomes]);

  function novo() {
    setEditandoId(null);
    setNome("");
    setEmail("");
    setSenha("");
    setPapel("apoiador_visitas");
    setEscolhidos(new Set());
    setBuscaMunicipio("");
    setErro(null);
    setMensagem(null);
    setFormAberto(true);
  }

  function editar(m: MembroEquipe) {
    setEditandoId(m.id);
    setNome(m.nome);
    setEmail(m.email ?? "");
    setSenha("");
    setPapel(m.role);
    setEscolhidos(new Set(m.municipio_ids));
    setBuscaMunicipio("");
    setErro(null);
    setMensagem(null);
    setFormAberto(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function alternar(id: number) {
    setEscolhidos((atual) => {
      const novoConjunto = new Set(atual);
      if (novoConjunto.has(id)) novoConjunto.delete(id);
      else novoConjunto.add(id);
      return novoConjunto;
    });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    setMensagem(null);
    try {
      await apiPost("/api/usuarios", {
        id: editandoId,
        nome,
        email,
        senha,
        role: papel,
        municipio_ids: Array.from(escolhidos),
      });
      setMensagem(editandoId ? "Dados salvos." : "Usuário criado. Passe o e-mail e a senha para a pessoa entrar.");
      setFormAberto(false);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(m: MembroEquipe) {
    if (!window.confirm(`Excluir ${m.nome}? Ela deixa de ter acesso ao sistema.`)) return;
    setErro(null);
    setMensagem(null);
    try {
      await apiDelete(`/api/usuarios?id=${m.id}`);
      setMensagem(`${m.nome} foi excluído(a).`);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  }

  return (
    <div className="max-w-6xl p-4 sm:p-8">
      <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-7">
        <TituloPagina
          descricao="Cadastre o Apoiador de Visitas (escolha os municípios em que ele atua) e o Apoiador de Relatórios (analisa os documentos antes da sua validação)."
          acao={
            <div className="flex items-center gap-3">
              <Indicador valor={equipe?.length ?? 0} rotulo="na equipe" />
              {!formAberto && (
            <button
              onClick={novo}
              className="shrink-0 rounded-xl bg-[#2678C4] px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-[#2678C4]/25 transition hover:-translate-y-0.5 hover:bg-[#1F67AA]"
            >
              + Novo apoiador
            </button>
              )}
            </div>
          }
        >Equipe de apoio</TituloPagina>

        {erro && <div className="mt-4 rounded-lg bg-status-pendente/10 px-4 py-3 text-sm text-status-pendente" role="alert">{erro}</div>}
        {mensagem && <div className="mt-4 rounded-lg bg-status-completo/10 px-4 py-3 text-sm font-medium text-status-completo">{mensagem}</div>}

        {formAberto && (
          <form onSubmit={salvar} className="mt-5 space-y-4 rounded-2xl border border-black/10 bg-[#FFFBF2] p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-brand-dark">{editandoId ? "Editar apoiador" : "Novo apoiador"}</h2>
              <button type="button" onClick={() => setFormAberto(false)} className="rounded p-1 hover:bg-black/5" aria-label="Fechar">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-brand-dark">Perfil</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {PAPEIS.map((p) => (
                  <label
                    key={p.valor}
                    className={`cursor-pointer rounded-xl border-2 p-3 transition ${papel === p.valor ? "shadow-sm" : "border-black/10 bg-white hover:bg-black/[0.02]"}`}
                    style={papel === p.valor ? { borderColor: p.cor, background: p.fundo } : undefined}
                  >
                    <input type="radio" name="papel" value={p.valor} checked={papel === p.valor} onChange={() => setPapel(p.valor)} className="sr-only" />
                    <span className="block text-sm font-bold" style={{ color: p.cor }}>{p.titulo}</span>
                    <span className="mt-0.5 block text-xs text-brand-dark/80">{p.descricao}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-brand-dark">
                <span className="mb-1 flex items-center gap-1.5"><UserIcon className="h-4 w-4" /> Nome</span>
                <input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={120} className={CAMPO} />
              </label>
              <label className="block text-sm font-medium text-brand-dark">
                <span className="mb-1 flex items-center gap-1.5"><MailIcon className="h-4 w-4" /> E-mail (login)</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={CAMPO} />
              </label>
              <label className="block text-sm font-medium text-brand-dark sm:col-span-2">
                <span className="mb-1 flex items-center gap-1.5"><LockIcon className="h-4 w-4" /> Senha {editandoId && <span className="font-normal text-brand-dark/70">(deixe vazio para manter a atual)</span>}</span>
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required={!editandoId} minLength={6} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" className={CAMPO} />
              </label>
            </div>

            {(
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-brand-dark">
                    Municípios em que atua <span className="font-normal text-brand-dark/70">({escolhidos.size} escolhido{escolhidos.size === 1 ? "" : "s"})</span>
                  </p>
                  {escolhidos.size > 0 && (
                    <button type="button" onClick={() => setEscolhidos(new Set())} className="text-xs font-semibold text-brand-light hover:underline">Limpar</button>
                  )}
                </div>
                <p className="mb-2 text-xs text-brand-dark/70">Só aparecem os municípios que têm escolas no programa do ciclo ativo.</p>
                <div className="relative mb-2">
                  <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-dark/60" />
                  <input value={buscaMunicipio} onChange={(e) => setBuscaMunicipio(e.target.value)} placeholder="Buscar município..." className={`${CAMPO} pl-9`} />
                </div>
                <div className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border border-black/10 bg-white p-2 sm:grid-cols-2 lg:grid-cols-3">
                  {municipiosFiltrados.map((m) => (
                    <label key={m.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${escolhidos.has(m.id) ? "bg-[#E2EFFB] font-semibold text-[#0F4C85]" : "hover:bg-black/[0.04]"}`}>
                      <input type="checkbox" checked={escolhidos.has(m.id)} onChange={() => alternar(m.id)} className="h-4 w-4 accent-[#2678C4]" />
                      {m.nome}
                      {contemplados instanceof Set && !contemplados.has(m.id) && (
                        <span className="text-xs font-normal text-amber-800">(sem escolas no programa)</span>
                      )}
                    </label>
                  ))}
                  {contemplados === null && <p className="p-2 text-sm text-brand-dark/70">Carregando...</p>}
                  {contemplados !== null && municipiosFiltrados.length === 0 && (
                    <p className="p-2 text-sm text-brand-dark/70 sm:col-span-2 lg:col-span-3">
                      {buscaMunicipio.trim() ? "Nenhum município encontrado." : "Nenhum município tem escolas no programa ainda. Marque as escolas em Escolas do programa."}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={salvando || escolhidos.size === 0}
                className="rounded-xl bg-[#2F9E62] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
              >
                {salvando ? "Salvando..." : "Salvar"}
              </button>
              <button type="button" onClick={() => setFormAberto(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark/80 hover:bg-black/5">
                Cancelar
              </button>
            </div>
          </form>
        )}

        {equipe && equipe.length > 0 && (
          <BarraFiltros
            className="mt-6"
            colunas="grid-cols-1 sm:max-w-md"
            mostrarLimpar={Boolean(buscaEquipe.trim())}
            onLimpar={() => setBuscaEquipe("")}
            resumo={buscaEquipe.trim() ? `${equipeFiltrada?.length ?? 0} de ${equipe.length}` : `${equipe.length} ${equipe.length === 1 ? "pessoa" : "pessoas"}`}
          >
            <CampoBusca value={buscaEquipe} onChange={setBuscaEquipe} placeholder="Pesquisar por nome, e-mail, função ou município..." ariaLabel="Pesquisar na equipe de apoio" />
          </BarraFiltros>
        )}

        <div className="mt-4 space-y-3">
          {!equipe && <p className="text-sm text-brand-dark/75">Carregando...</p>}
          {equipe && equipe.length > 0 && equipeFiltrada?.length === 0 && (
            <div className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/75">
              Ninguém encontrado para &quot;{buscaEquipe.trim()}&quot;.
            </div>
          )}
          {equipe && equipe.length === 0 && !formAberto && (
            <div className="rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-brand-dark/75">
              Ninguém cadastrado ainda. Clique em &quot;+ Novo apoiador&quot;.
            </div>
          )}
          {equipeFiltrada?.map((m) => {
            const info = PAPEIS.find((p) => p.valor === m.role)!;
            return (
              <article key={m.id} className="rounded-xl border border-black/5 bg-white px-4 py-2.5 transition-shadow hover:shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 sm:w-60 sm:shrink-0">
                    <h2 className="truncate text-base font-bold leading-tight text-brand-dark" title={m.nome}>{m.nome}</h2>
                    <p className="truncate text-xs text-brand-dark/75" title={m.email ?? undefined}>{m.email ?? "sem e-mail"}</p>
                  </div>
                  <span className="w-fit shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold sm:w-44 sm:text-center" style={{ background: info.fundo, color: info.cor }}>
                    {info.titulo}
                  </span>
                  <MunicipiosDoApoiador ids={m.municipio_ids} nomes={nomes} />
                  <div className="flex shrink-0 gap-2 sm:ml-auto">
                    <BotaoEditar onClick={() => editar(m)} rotulo={m.nome} />
                    <BotaoExcluir onClick={() => excluir(m)} rotulo={m.nome} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// Municípios do apoiador em poucas linhas: mostra 2 e um "+N" que abre o resto (são muitos por pessoa).
function MunicipiosDoApoiador({ ids, nomes }: { ids: number[]; nomes: Map<number, string> }) {
  const [aberto, setAberto] = useState(false);
  const VISIVEIS = 2;
  if (ids.length === 0) {
    return <span className="min-w-0 flex-1 text-xs font-semibold text-amber-800">Nenhum município definido — clique em editar para escolher</span>;
  }
  const lista = aberto ? ids : ids.slice(0, VISIVEIS);
  const resto = ids.length - VISIVEIS;
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-dark/70" title={`${ids.length} municípios`}>
        <MapPinIcon className="h-3.5 w-3.5" /> {ids.length}
      </span>
      {lista.map((id) => (
        <span key={id} className="rounded-full bg-[#E2EFFB] px-2.5 py-0.5 text-xs font-semibold text-[#0F4C85]">
          {nomes.get(id) ?? id}
        </span>
      ))}
      {resto > 0 && (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          title={aberto ? "Mostrar menos" : ids.slice(VISIVEIS).map((id) => nomes.get(id) ?? id).join(", ")}
          className="rounded-full border border-black/10 px-2.5 py-0.5 text-xs font-semibold text-brand-dark/80 hover:bg-black/[0.04]"
        >
          {aberto ? "menos" : `+${resto}`}
        </button>
      )}
    </div>
  );
}
