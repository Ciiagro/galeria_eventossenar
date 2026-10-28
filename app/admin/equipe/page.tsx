"use client";

import { TituloPagina, Indicador } from "@/components/TituloPagina";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, MembroEquipe, Municipio, ROTULO_PAPEL } from "@/lib/api";
import { AdminGuard } from "@/components/AdminGuard";
import { LockIcon, MailIcon, MapPinIcon, SearchIcon, UserIcon, XIcon } from "@/components/icons";
import { MenuAcoes, Ordem, Pilula, RodapeTabela, Th, ordenar } from "@/components/TabelaCoordenadores";
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
  {
    valor: "admin",
    titulo: ROTULO_PAPEL.admin,
    descricao: "Acesso total ao sistema: valida documentos, cadastra a equipe e envia comunicados. Não precisa escolher municípios.",
    cor: "#6B3F94",
    fundo: "#F0E8F7",
  },
];

function iniciais(nome: string) {
  const partes = (nome || "?").trim().split(/\s+/).filter(Boolean);
  const a = partes[0]?.[0] ?? "?";
  const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (a + b).toUpperCase();
}

const POR_PAGINA_TABELA = 10;

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
  const [ordemTabela, setOrdemTabela] = useState<Ordem | undefined>(undefined);
  const [paginaTabela, setPaginaTabela] = useState(1);
  useEffect(() => { setPaginaTabela(1); }, [buscaEquipe, ordemTabela]);
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
  // município que já tem Apoiador de Relatórios (outra pessoa) não fica disponível para um novo
  const ocupadosRelatorios = useMemo(() => {
    const mapa = new Map<number, string>();
    if (papel !== "apoiador_relatorios") return mapa;
    for (const m of equipe ?? []) {
      if (m.role !== "apoiador_relatorios" || m.id === editandoId) continue;
      for (const id of m.municipio_ids) mapa.set(id, m.nome);
    }
    return mapa;
  }, [equipe, papel, editandoId]);
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
        municipio_ids: papel === "admin" ? [] : Array.from(escolhidos),
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
          descricao="Cadastre o Apoiador de Visitas e o Apoiador de Relatórios (você escolhe os municípios em que atuam) e também outros Administradores, com acesso total."
          acao={
            <div className="flex items-center gap-3">
              <Indicador valor={equipe?.length ?? 0} rotulo="na equipe" />
              {!formAberto && (
            <button
              onClick={novo}
              className="shrink-0 rounded-xl bg-[#2678C4] px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-[#2678C4]/25 transition hover:-translate-y-0.5 hover:bg-[#1F67AA]"
            >
              + Novo usuário
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
              <h2 className="text-lg font-bold text-brand-dark">{editandoId ? "Editar usuário" : "Novo usuário"}</h2>
              <button type="button" onClick={() => setFormAberto(false)} className="rounded p-1 hover:bg-black/5" aria-label="Fechar">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-brand-dark">Perfil</legend>
              <div className="grid gap-2 sm:grid-cols-3">
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

            {papel === "admin" && (
              <p className="rounded-lg bg-[#FFF1DB] px-3 py-2 text-sm font-semibold text-[#6B3D00]" role="note">
                Atenção: o Administrador tem acesso total ao sistema, inclusive para validar documentos, excluir usuários e enviar comunicados. Crie apenas para pessoas de confiança.
              </p>
            )}

            {papel !== "admin" && (
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-brand-dark">
                    Municípios em que atua <span className="font-normal text-brand-dark/70">({escolhidos.size} escolhido{escolhidos.size === 1 ? "" : "s"})</span>
                  </p>
                  {escolhidos.size > 0 && (
                    <button type="button" onClick={() => setEscolhidos(new Set())} className="text-xs font-semibold text-brand-light hover:underline">Limpar</button>
                  )}
                </div>
                <p className="mb-2 text-xs text-brand-dark/70">Só aparecem os municípios que têm escolas no programa da edição ativa.</p>
                <div className="relative mb-2">
                  <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-dark/60" />
                  <input value={buscaMunicipio} onChange={(e) => setBuscaMunicipio(e.target.value)} placeholder="Buscar município..." className={`${CAMPO} pl-9`} />
                </div>
                <div className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border border-black/10 bg-white p-2 sm:grid-cols-2 lg:grid-cols-3">
                  {municipiosFiltrados.map((m) => {
                    const dono = ocupadosRelatorios.get(m.id);
                    const bloqueado = Boolean(dono) && !escolhidos.has(m.id);
                    return (
                    <label key={m.id} title={bloqueado ? `Já é do Apoiador de Relatórios ${dono}` : undefined} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${bloqueado ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${escolhidos.has(m.id) ? "bg-[#E2EFFB] font-semibold text-[#0F4C85]" : bloqueado ? "" : "hover:bg-black/[0.04]"}`}>
                      <input type="checkbox" checked={escolhidos.has(m.id)} disabled={bloqueado} onChange={() => alternar(m.id)} className="h-4 w-4 accent-[#2678C4]" />
                      {m.nome}
                      {bloqueado && <span className="text-xs font-normal text-brand-dark/70">(já com {dono})</span>}
                      {contemplados instanceof Set && !contemplados.has(m.id) && (
                        <span className="text-xs font-normal text-amber-800">(sem escolas no programa)</span>
                      )}
                    </label>
                    );
                  })}
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
                disabled={salvando || (papel !== "admin" && escolhidos.size === 0)}
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
              Ninguém cadastrado ainda. Clique em &quot;+ Novo usuário&quot;.
            </div>
          )}
          {equipeFiltrada && equipeFiltrada.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-black/5 bg-[#F6F9F7]">
                    <tr>
                      <Th col="nome" ordem={ordemTabela} onOrdem={setOrdemTabela}>Nome</Th>
                      <Th col="email" ordem={ordemTabela} onOrdem={setOrdemTabela}>E-mail</Th>
                      <Th col="funcao" ordem={ordemTabela} onOrdem={setOrdemTabela}>Função</Th>
                      <Th>Municípios</Th>
                      <Th className="text-right">Ações</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/15">
                    {ordenar(equipeFiltrada, ordemTabela, (m, col) => col === "email" ? m.email ?? "" : col === "funcao" ? PAPEIS.find((p) => p.valor === m.role)?.titulo ?? "" : m.nome)
                      .slice((paginaTabela - 1) * POR_PAGINA_TABELA, paginaTabela * POR_PAGINA_TABELA)
                      .map((m) => {
                        const info = PAPEIS.find((p) => p.valor === m.role)!;
                        return (
                          <tr key={m.id} className="hover:bg-[#F3FAF6]">
                            <td className="px-4 py-[18px]">
                              <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ background: info.fundo, color: info.cor }} aria-hidden="true">
                                  {iniciais(m.nome)}
                                </span>
                                <span className="block font-bold text-brand-dark">{m.nome}</span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-[18px] text-brand-dark">{m.email ?? "sem e-mail"}</td>
                            <td className="px-4 py-[18px]"><Pilula texto={info.titulo} fundo={info.fundo} cor={info.cor} /></td>
                            <td className="px-4 py-[18px]">
                              {m.role === "admin" ? (
                                <span className="text-xs font-semibold text-brand-dark/70">Todos os municípios</span>
                              ) : (
                                <MunicipiosDoApoiador ids={m.municipio_ids} nomes={nomes} />
                              )}
                            </td>
                            <td className="px-4 py-[18px] text-right">
                              <MenuAcoes rotulo={m.nome} itens={[
                                { rotulo: "Editar dados", onClick: () => editar(m) },
                                { rotulo: "Excluir", perigo: true, onClick: () => excluir(m) },
                              ]} />
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-black/5"><RodapeTabela pagina={paginaTabela} total={equipeFiltrada.length} porPagina={POR_PAGINA_TABELA} onChange={setPaginaTabela} /></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// Municípios do apoiador em poucas linhas: mostra 2 e um "+N" que abre uma janelinha com todos (com busca).
function MunicipiosDoApoiador({ ids, nomes }: { ids: number[]; nomes: Map<number, string> }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const VISIVEIS = 2;
  if (ids.length === 0) {
    return <span className="min-w-0 flex-1 text-xs font-semibold text-amber-800">Nenhum município definido — clique em editar para escolher</span>;
  }
  const resto = ids.length - VISIVEIS;
  const todos = ids
    .map((id) => ({ id, nome: String(nomes.get(id) ?? id) }))
    .sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
  const termo = busca.trim().toLowerCase();
  const filtrados = termo ? todos.filter((m) => m.nome.toLowerCase().includes(termo)) : todos;
  const fechar = () => { setAberto(false); setBusca(""); };
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-dark/70" title={`${ids.length} municípios`}>
        <MapPinIcon className="h-4 w-4 text-red-600" /> {ids.length}
      </span>
      {ids.slice(0, VISIVEIS).map((id) => (
        <span key={id} className="rounded-full bg-[#E2EFFB] px-2.5 py-0.5 text-xs font-semibold text-[#0F4C85]">
          {nomes.get(id) ?? id}
        </span>
      ))}
      {resto > 0 && (
        <button
          type="button"
          onClick={() => setAberto(true)}
          title="Ver todos os municípios"
          className="rounded-full border border-black/10 px-2.5 py-0.5 text-xs font-semibold text-brand-dark/80 hover:bg-black/[0.04]"
        >
          {`+${resto}`}
        </button>
      )}
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={fechar}>
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-brand-dark">Municípios ({ids.length})</h3>
              <button type="button" onClick={fechar} className="rounded-lg px-2 py-1 text-lg leading-none text-brand-dark/60 hover:bg-black/5" aria-label="Fechar">×</button>
            </div>
            {ids.length > 8 && (
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar município..."
                className="mb-3 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand-dark/40"
              />
            )}
            <div className="flex flex-wrap gap-1.5 overflow-y-auto pr-1">
              {filtrados.length === 0 && <span className="text-sm text-brand-dark/60">Nenhum município encontrado.</span>}
              {filtrados.map((m) => (
                <span key={m.id} className="rounded-full bg-[#E2EFFB] px-3 py-1 text-xs font-semibold text-[#0F4C85]">{m.nome}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
