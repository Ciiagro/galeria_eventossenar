"use client";

import { TituloPagina, Indicador } from "@/components/TituloPagina";

import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, Municipio } from "@/lib/api";
import { UserIcon, MailIcon, LockIcon, MapPinIcon, XIcon, BuildingIcon } from "@/components/icons";
import { AdminGuard } from "@/components/AdminGuard";
import { normalizarTexto } from "@/components/DocumentoUI";
import { BotaoEditar, BotaoExcluir } from "@/components/BotoesIcone";
import Link from "next/link";
import { Abas, BarraFiltros, CampoBusca } from "@/components/Filtros";
import { mascaraCpf } from "@/lib/mascaras";

const CAMPO =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30";

export default function ResponsaveisPageGuarded() {
  return (
    <AdminGuard>
      <ResponsaveisPage />
    </AdminGuard>
  );
}

type CadastroRecebido = {
  user_id: string; nome?: string | null; email?: string | null; cpf?: string | null;
  telefone1?: string | null; telefone2?: string | null; municipio_id?: number | null; municipio_nome?: string | null;
  cadastrado_em?: string | null; adesao_id?: string | null;
  adesao_status: "sem_ficha" | "rascunho" | "enviada" | "aprovada"; adesao_enviada_em?: string | null;
};
const SITUACAO: Record<CadastroRecebido["adesao_status"], { texto: string; cor: string; fundo: string }> = {
  sem_ficha: { texto: "Ainda não fez a adesão", cor: "#4A453A", fundo: "#EFEDE4" },
  rascunho: { texto: "Adesão em preenchimento", cor: "#6E4B00", fundo: "#FFF3CC" },
  enviada: { texto: "Adesão enviada — aguardando aprovação", cor: "#0F4C85", fundo: "#E2EFFB" },
  aprovada: { texto: "Adesão aprovada", cor: "#17613B", fundo: "#E3F4EA" },
};
const dataCurta = (iso?: string | null) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : "—";
};

function ResponsaveisPage() {
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [municipioId, setMunicipioId] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  // cadastros feitos pelos próprios coordenadores (em /adesao) que ainda não foram liberados
  const [cadastros, setCadastros] = useState<CadastroRecebido[] | null>(null);
  const [aba, setAba] = useState<"aguardando" | "liberados" | null>(null);
  // municípios contemplados = com escolas no programa do ciclo ativo ("todos" se não for possível consultar)
  const [contemplados, setContemplados] = useState<Set<number> | "todos" | null>(null);

  useEffect(() => {
    apiGet("/api/admin/coordenadores-cadastros")
      .then((lista: CadastroRecebido[]) => {
        setCadastros(lista);
        setAba((atual) => atual ?? (lista.length > 0 ? "aguardando" : "liberados"));
      })
      .catch(() => { setCadastros([]); setAba((atual) => atual ?? "liberados"); });
    apiGet("/api/municipios")
      .then((lista: Municipio[]) => {
        setMunicipios(lista);
        setMunicipioId(String(lista[0]?.id ?? ""));
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
    apiGet("/api/escolas-participantes?resumo=1")
      .then((r) => {
        const ids = Object.entries((r.por_municipio ?? {}) as Record<string, number>)
          .filter(([, qtd]) => Number(qtd) > 0)
          .map(([id]) => Number(id));
        setContemplados(new Set(ids));
      })
      .catch(() => setContemplados("todos"));
  }, []);

  const municipioSelecionado = useMemo(
    () => municipios.find((municipio) => String(municipio.id) === municipioId),
    [municipios, municipioId]
  );
  const responsaveis = municipios.filter((municipio) => municipio.responsavel_nome || municipio.responsavel_email);
  // só os municípios contemplados; o que já tem responsável continua na lista para poder ser editado
  const opcoesMunicipio = useMemo(
    () =>
      contemplados instanceof Set
        ? municipios.filter((m) => contemplados.has(m.id) || m.responsavel_nome || m.responsavel_email)
        : municipios,
    [municipios, contemplados]
  );
  const filtrados = useMemo(() => {
    const termo = normalizarTexto(busca.trim());
    if (!termo) return responsaveis;
    return responsaveis.filter(
      (m) =>
        normalizarTexto(m.responsavel_nome ?? "").includes(termo) ||
        normalizarTexto(m.responsavel_email ?? "").includes(termo) ||
        normalizarTexto(m.nome).includes(termo)
    );
  }, [responsaveis, busca]);

  const cadastrosFiltrados = useMemo(() => {
    const termo = normalizarTexto(busca.trim());
    return (cadastros ?? []).filter(
      (c) =>
        !termo ||
        [c.nome, c.email, c.municipio_nome, c.cpf].some((v) => normalizarTexto(v ?? "").includes(termo))
    );
  }, [cadastros, busca]);

  function novoResponsavel() {
    setMunicipioId("");
    setNome("");
    setEmail("");
    setSenha("");
    setMensagem(null);
    setErro(null);
    setMostrarFormulario(true);
  }

  async function excluir(id: number) {
    if (!window.confirm("Excluir o responsável e seu acesso de login?")) return;
    setErro(null);
    try {
      await apiDelete(`/api/responsaveis?municipio_id=${id}`);
      setMunicipios((atual) => atual.filter((municipio) => municipio.id !== id));
      if (String(id) === municipioId) setMostrarFormulario(false);
      setMensagem("Responsável excluído.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir responsável.");
    }
  }

  function selecionarMunicipio(id: string) {
    const municipio = municipios.find((item) => String(item.id) === id);
    setMunicipioId(id);
    setNome(municipio?.responsavel_nome ?? "");
    setEmail(municipio?.responsavel_email ?? "");
    setSenha("");
    setMensagem(null);
    setErro(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMensagem(null);
    if (!municipioId) {
      setErro("Selecione um município.");
      return;
    }

    setSalvando(true);
    try {
      await apiPost("/api/responsaveis", {
        municipio_id: Number(municipioId),
        responsavel_nome: nome,
        responsavel_email: email,
        senha,
      });
      setMensagem("Responsável salvo. Ele já pode entrar com este e-mail e senha.");
      setSenha("");
      const listaAtualizada = await apiGet("/api/municipios") as Municipio[];
      setMunicipios(listaAtualizada);
      setMostrarFormulario(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar responsável.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="max-w-6xl p-4 sm:p-8">
      <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
        <TituloPagina
          descricao="Escolha um município e crie o acesso do Coordenador Geral por Município."
          acao={
            <div className="flex items-center gap-3">
              <Indicador valor={responsaveis.length} rotulo={responsaveis.length === 1 ? "cadastrado" : "cadastrados"} />
              {!mostrarFormulario && (
            <button
              type="button"
              onClick={novoResponsavel}
              className="shrink-0 rounded-xl bg-[#2678C4] px-4 py-2 text-sm font-bold text-white shadow-md shadow-[#2678C4]/25 transition hover:-translate-y-0.5 hover:bg-[#1F67AA]"
            >
              + Inserir responsável
            </button>
              )}
            </div>
          }
        >Coordenadores</TituloPagina>

        {erro && <div className="mt-3 rounded-lg bg-status-pendente/10 px-4 py-2.5 text-sm text-status-pendente" role="alert">{erro}</div>}
        {mensagem && <div className="mt-3 rounded-lg bg-status-completo/10 px-4 py-2.5 text-sm font-medium text-status-completo">{mensagem}</div>}

        {mostrarFormulario && (
          <form onSubmit={salvar} autoComplete="off" className="mt-4 space-y-3 rounded-2xl border border-black/10 bg-[#FFFBF2] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-brand-dark">
                {municipioSelecionado?.responsavel_id ? "Editar responsável" : "Novo responsável"}
              </h2>
              <button type="button" onClick={() => setMostrarFormulario(false)} className="rounded p-1 hover:bg-black/5" aria-label="Fechar">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-brand-dark">
                <span className="mb-1 flex items-center gap-1.5"><BuildingIcon className="h-4 w-4" /> Município *</span>
                <select
                  id="municipio"
                  required
                  disabled={carregando}
                  value={municipioId}
                  onChange={(e) => selecionarMunicipio(e.target.value)}
                  className={`${CAMPO} disabled:opacity-50`}
                >
                  <option value="">{contemplados === null ? "Carregando..." : "Selecione um município"}</option>
                  {opcoesMunicipio.map((municipio) => <option key={municipio.id} value={municipio.id}>{municipio.nome}</option>)}
                </select>
                <span className="mt-1 block text-xs font-normal text-brand-dark/70">
                  {contemplados !== null && opcoesMunicipio.length === 0
                    ? "Nenhum município tem escolas no programa ainda. Marque as escolas em Escolas do programa."
                    : "Só aparecem os municípios que já têm escolas no programa da edição ativa."}
                </span>
              </label>

              {municipioSelecionado && (
                <>
                  <label className="block text-sm font-medium text-brand-dark">
                    <span className="mb-1 flex items-center gap-1.5"><UserIcon className="h-4 w-4" /> Nome completo *</span>
                    <input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do responsável" maxLength={120} className={CAMPO} />
                  </label>
                  <label className="block text-sm font-medium text-brand-dark">
                    <span className="mb-1 flex items-center gap-1.5"><MailIcon className="h-4 w-4" /> E-mail (login) *</span>
                    <input
                      id="email"
                      name="responsavelEmail"
                      required
                      type="email"
                      autoComplete="new-username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="responsavel@exemplo.com"
                      className={CAMPO}
                    />
                  </label>
                  <label className="block text-sm font-medium text-brand-dark">
                    <span className="mb-1 flex items-center gap-1.5">
                      <LockIcon className="h-4 w-4" /> Senha{" "}
                      {municipioSelecionado.responsavel_id ? <span className="font-normal text-brand-dark/70">(deixe vazio para manter a atual)</span> : "*"}
                    </span>
                    <input
                      id="senha"
                      name="responsavelSenha"
                      required={!municipioSelecionado.responsavel_id}
                      minLength={6}
                      type="password"
                      autoComplete="new-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="Mínimo de 6 caracteres"
                      className={CAMPO}
                    />
                  </label>
                </>
              )}
            </div>

            {municipioSelecionado && (
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={salvando}
                  className="rounded-xl bg-[#2F9E62] px-5 py-2 text-sm font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
                >
                  {salvando ? "Salvando acesso..." : "Salvar"}
                </button>
                <button type="button" onClick={() => setMostrarFormulario(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-dark/80 hover:bg-black/5">
                  Cancelar
                </button>
              </div>
            )}
          </form>
        )}

        {(responsaveis.length > 0 || (cadastros?.length ?? 0) > 0) && (
          <>
            <Abas<"aguardando" | "liberados">
              className="mt-5"
              abas={[
                { valor: "aguardando", rotulo: "Aguardando liberação", contagem: cadastros?.length ?? 0 },
                { valor: "liberados", rotulo: "Liberados", contagem: responsaveis.length },
              ]}
              valor={aba}
              onChange={setAba}
            />
            <BarraFiltros
              colunas="grid-cols-1 sm:max-w-md"
              mostrarLimpar={Boolean(busca.trim())}
              onLimpar={() => setBusca("")}
              resumo={busca.trim() ? (aba === "aguardando" ? `${cadastrosFiltrados.length} de ${cadastros?.length ?? 0}` : `${filtrados.length} de ${responsaveis.length}`) : undefined}
            >
              <CampoBusca value={busca} onChange={setBusca} placeholder="Pesquisar por nome, e-mail ou município..." ariaLabel="Pesquisar coordenadores" />
            </BarraFiltros>
          </>
        )}

        {aba === "aguardando" && (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-brand-dark/75">
              Coordenadores que se cadastraram pelo link de adesão. O município é liberado quando você aprova a adesão deles em <strong>Termo de Adesão</strong>.
            </p>
            {cadastros && cadastros.length === 0 && (
              <div className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/75">
                Nenhum cadastro aguardando liberação.
              </div>
            )}
            {cadastros && cadastros.length > 0 && cadastrosFiltrados.length === 0 && (
              <div className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/75">
                Nenhum cadastro encontrado para &quot;{busca.trim()}&quot;.
              </div>
            )}
            {cadastrosFiltrados.map((c) => {
              const sit = SITUACAO[c.adesao_status];
              return (
                <article key={c.user_id} className="rounded-xl border border-black/5 bg-white px-4 py-2.5 transition-shadow hover:shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 sm:w-60 sm:shrink-0">
                      <h2 className="truncate text-base font-bold leading-tight text-brand-dark" title={c.nome ?? undefined}>{c.nome}</h2>
                      <p className="truncate text-xs text-brand-dark/75" title={c.email ?? undefined}>{c.email}</p>
                      <p className="truncate text-xs text-brand-dark/60">
                        {[c.telefone1, c.cpf ? `CPF ${mascaraCpf(c.cpf)}` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#E2EFFB] px-2.5 py-0.5 text-xs font-semibold text-[#0F4C85]">
                        <MapPinIcon className="h-3 w-3" /> {c.municipio_nome ?? "Município não informado"}
                      </span>
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: sit.fundo, color: sit.cor }}>{sit.texto}</span>
                      <span className="text-xs text-brand-dark/60">cadastrado em {dataCurta(c.cadastrado_em)}</span>
                    </div>
                    {c.adesao_id && c.adesao_status !== "rascunho" && (
                      <Link href={`/admin/termo-adesao/${c.adesao_id}`} target="_blank"
                        className="w-fit shrink-0 rounded-lg bg-brand-light px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-accent sm:ml-auto">
                        Abrir termo
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {aba !== "aguardando" && (
        <div className="mt-3 space-y-2">
          {carregando && <p className="text-sm text-brand-dark/75">Carregando...</p>}
          {!carregando && responsaveis.length === 0 && !mostrarFormulario && (
            <div className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/75">
              Nenhum responsável cadastrado ainda. Clique em &quot;+ Inserir responsável&quot;.
            </div>
          )}
          {responsaveis.length > 0 && filtrados.length === 0 && (
            <div className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/75">
              Nenhum responsável encontrado para &quot;{busca.trim()}&quot;.
            </div>
          )}
          {filtrados.map((municipio) => (
            <article key={municipio.id} className="rounded-xl border border-black/5 bg-white px-4 py-2.5 transition-shadow hover:shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 sm:w-60 sm:shrink-0">
                  <h2 className="truncate text-base font-bold leading-tight text-brand-dark" title={municipio.responsavel_nome ?? undefined}>
                    {municipio.responsavel_nome}
                  </h2>
                  <p className="truncate text-xs text-brand-dark/75" title={municipio.responsavel_email ?? undefined}>
                    {municipio.responsavel_email}
                  </p>
                </div>
                <span className="w-fit shrink-0 rounded-full bg-[#FFF3CC] px-2.5 py-0.5 text-xs font-bold text-[#6E4B00] sm:w-44 sm:text-center">
                  Coordenador Geral
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#E2EFFB] px-2.5 py-0.5 text-xs font-semibold text-[#0F4C85]">
                    <MapPinIcon className="h-3 w-3" /> {municipio.nome}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2 sm:ml-auto">
                  <BotaoEditar
                    onClick={() => { selecionarMunicipio(String(municipio.id)); setMostrarFormulario(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    rotulo={`responsável de ${municipio.nome}`}
                  />
                  <BotaoExcluir onClick={() => excluir(municipio.id)} rotulo={`responsável de ${municipio.nome}`} />
                </div>
              </div>
            </article>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
