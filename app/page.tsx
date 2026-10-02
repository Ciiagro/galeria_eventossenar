"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AcaoPedagogica, AcaoResumo, apiGet, EscolaParticipante, Municipio, ResumoDashboard } from "@/lib/api";
import { usePerfil } from "@/lib/usePerfil";
import { AlertIcon, CheckIcon, ClipboardListIcon, FileTextIcon, FolderIcon, ImageIcon, MapPinIcon, SearchIcon, UploadCloudIcon, VideoIcon } from "@/components/icons";
import MapaMunicipios from "@/components/MapaMunicipios";
import { IconeAcao } from "@/components/IconesAcoes";
import { Ciclo, useCiclos } from "@/lib/ciclos";

export default function HomePage() {
  const router = useRouter();
  const { perfil, carregando: carregandoPerfil } = usePerfil();
  const [municipios, setMunicipios] = useState<Municipio[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [municipioId, setMunicipioId] = useState("");
  const [resumo, setResumo] = useState<ResumoDashboard | null>(null);
  const [erroResumo, setErroResumo] = useState<string | null>(null);
  const [acoes, setAcoes] = useState<AcaoPedagogica[]>([]);
  // Padrão: ciclo ativo, todos os meses. ciclo null = ativo · "" = todos os ciclos
  const { ciclos, ativo: cicloAtivo, carregando: carregandoCiclos } = useCiclos();
  const [filtros, setFiltros] = useState<FiltrosPainel>({ acao: "", ciclo: null, mes: "" });
  const cicloEfetivo = filtros.ciclo ?? cicloAtivo?.id ?? "";
  const [atualizandoResumo, setAtualizandoResumo] = useState(false);

  const ehAdmin = !carregandoPerfil && perfil?.role === "admin";

  useEffect(() => {
    if (!ehAdmin) return;
    apiGet("/api/acoes-pedagogicas").then(setAcoes).catch(() => setAcoes([]));
  }, [ehAdmin]);

  useEffect(() => {
    if (!ehAdmin || carregandoCiclos) return;
    let cancelado = false;
    setAtualizandoResumo(true);
    const params = new URLSearchParams();
    if (filtros.acao) params.set("acao_id", filtros.acao);
    if (cicloEfetivo) params.set("ciclo_id", cicloEfetivo);
    if (filtros.mes) params.set("mes", filtros.mes);
    const query = params.toString();
    const chaveCache = `resumo:${query}`;
    // mostra na hora o último resumo visto (se houver) e atualiza em segundo plano
    try {
      const guardado = sessionStorage.getItem(chaveCache);
      if (guardado) { setResumo(JSON.parse(guardado)); setErroResumo(null); }
    } catch { /* sem cache, segue normal */ }
    apiGet(query ? `/api/resumo?${query}` : "/api/resumo")
      .then((dados) => {
        if (cancelado) return;
        setResumo(dados);
        setErroResumo(null);
        try { sessionStorage.setItem(chaveCache, JSON.stringify(dados)); } catch { /* cheio: ignora */ }
      })
      .catch((e) => { if (!cancelado) setErroResumo(e.message); })
      .finally(() => { if (!cancelado) setAtualizandoResumo(false); });
    return () => { cancelado = true; };
  }, [ehAdmin, filtros, cicloEfetivo, carregandoCiclos]);

  useEffect(() => {
    // o painel do administrador não usa essa lista (vem no resumo): só carrega para os outros perfis
    if (carregandoPerfil || perfil?.role === "admin") return;
    apiGet("/api/municipios")
      .then((lista: Municipio[]) => {
        setMunicipios(lista);
        setMunicipioId((atual) => atual || String(lista[0]?.id ?? ""));
      })
      .catch((e) => setErro(e.message));
  }, [carregandoPerfil, perfil?.role]);

  function irParaEnvio(e: React.FormEvent) {
    e.preventDefault();
    if (municipioId) router.push(`/municipios/${municipioId}/novo-documento`);
  }

  if (carregandoPerfil) return null;

  if (perfil?.role === "admin") {
    if (erroResumo) {
      return <div className="p-8 text-sm text-status-pendente">Não foi possível carregar o painel: {erroResumo}</div>;
    }
    if (!resumo) return <div className="p-8 text-sm text-brand-dark/75">Carregando painel...</div>;
    return (
      <Dashboard
        resumo={resumo}
        acoes={acoes}
        ciclos={ciclos}
        cicloEfetivo={cicloEfetivo}
        filtros={filtros}
        onFiltrosChange={setFiltros}
        atualizando={atualizandoResumo}
      />
    );
  }

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-brand-dark">Projeto Valores Humanos</h1>
        <p className="text-brand-dark/80 text-sm mt-1">
          {perfil?.role === "apoiador_visitas"
            ? "Escolha o município que você visitou para enviar o relatório, as imagens e os vídeos das suas visitas."
            : perfil?.role === "apoiador_relatorios"
              ? "Envie relatórios ou, na Análise de documentos, confira o que foi enviado antes da validação do administrador."
              : "Selecione o seu município para enviar as imagens, vídeos e relatórios das ações pedagógicas realizadas."}
        </p>
      </header>

      {perfil?.role === "apoiador_relatorios" && (
        <Link
          href="/analise"
          className="mb-5 flex max-w-xl items-center gap-3 rounded-xl border border-[#2F9E62]/30 bg-[#E3F4EA] p-4 text-[#17613B] shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2F9E62] text-white">
            <CheckIcon className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-bold">Análise de documentos</span>
            <span className="block text-xs">Veja os envios pendentes e recomende a aprovação ou peça ajustes.</span>
          </span>
        </Link>
      )}

      <form
        onSubmit={irParaEnvio}
        className="bg-white rounded-xl border border-black/5 shadow-sm p-6 max-w-xl flex flex-col gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-light/10 text-brand-light flex items-center justify-center shrink-0">
            <UploadCloudIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-medium text-brand-dark">Enviar documentos</h2>
            <p className="text-xs text-brand-dark/80">Escolha o município e siga para o envio.</p>
          </div>
        </div>

        {erro && (
          <div className="rounded-md bg-status-pendente/10 text-status-pendente px-4 py-2 text-sm">
            Não foi possível carregar os municípios: {erro}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">Município</label>
          <select
            value={municipioId}
            onChange={(e) => setMunicipioId(e.target.value)}
            className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
          >
            {!municipios && <option value="">Carregando...</option>}
            {municipios?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={!municipioId}
            className="flex-1 px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            Adicionar documentos
          </button>
          <Link
            href={municipioId ? `/municipios/${municipioId}` : "#"}
            aria-disabled={!municipioId}
            className={`flex-1 text-center px-5 py-2.5 rounded-lg border border-brand-light/30 text-brand-light text-sm font-medium hover:bg-brand-light/5 transition-colors ${
              !municipioId ? "pointer-events-none opacity-50" : ""
            }`}
          >
            Ver documentos enviados
          </Link>
        </div>
      </form>
    </div>
  );
}

type FiltrosPainel = { acao: string; ciclo: string | null; mes: string };

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type DashboardProps = {
  resumo: ResumoDashboard;
  acoes: AcaoPedagogica[];
  ciclos: Ciclo[];
  cicloEfetivo: string;
  filtros: FiltrosPainel;
  onFiltrosChange: (filtros: FiltrosPainel) => void;
  atualizando: boolean;
};

function Dashboard({ resumo, acoes, ciclos, cicloEfetivo, filtros, onFiltrosChange, atualizando }: DashboardProps) {
  const [municipioSelecionado, setMunicipioSelecionado] = useState("");
  const cicloAtual = ciclos.find((c) => c.id === cicloEfetivo);
  const filtrosNaUrl = cicloEfetivo ? `?ciclo=${cicloEfetivo}${filtros.mes ? `&mes=${filtros.mes}` : ""}` : "?ciclo=todos";
  const descricaoPeriodo = cicloEfetivo
    ? `${cicloAtual?.nome ?? "Ciclo"}${filtros.mes ? ` · ${MESES[Number(filtros.mes) - 1]}` : ""}`
    : "Todos os ciclos";
  const filtrosPadrao = !filtros.acao && filtros.ciclo === null && !filtros.mes;
  const municipios = useMemo(
    () => resumo.municipios.filter((municipio) =>
      !municipioSelecionado || String(municipio.id) === municipioSelecionado
    ),
    [municipioSelecionado, resumo.municipios]
  );
  const municipiosComEnvio = useMemo(
    () => resumo.municipios
      .filter((municipio) => (municipio.total_documentos ?? 0) > 0 || String(municipio.id) === municipioSelecionado)
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    [municipioSelecionado, resumo.municipios]
  );
  const escolasFiltradas = useMemo(() => {
    const ids = new Set(municipios.map((municipio) => String(municipio.id)));
    return (resumo.escolas_participantes_lista ?? []).filter((escola) => ids.has(String(escola.municipio_id)));
  }, [municipios, resumo.escolas_participantes_lista]);
  const indicadores = useMemo(() => ({
    municipios_total: municipios.length,
    municipios_participantes: municipios.filter((municipio) => (municipio.total_documentos ?? 0) > 0).length,
    escolas_total: municipios.reduce((total, municipio) => total + municipio.escolas_total, 0),
    escolas_participantes: municipios.reduce((total, municipio) => total + municipio.escolas_participantes, 0),
    documentos_total: municipios.reduce((total, municipio) => total + (municipio.total_documentos ?? 0), 0),
    documentos_aprovados: municipios.reduce((total, municipio) => total + (municipio.aprovados ?? 0), 0),
    documentos_pendentes: municipios.reduce((total, municipio) => total + (municipio.pendentes ?? 0), 0),
    documentos_rejeitados: municipios.reduce((total, municipio) => total + municipio.rejeitados, 0),
  }), [municipios]);
  const percentualParticipacao = indicadores.municipios_total
    ? Math.round((indicadores.municipios_participantes / indicadores.municipios_total) * 100)
    : 0;
  const percentualEscolas = indicadores.escolas_total
    ? Math.round((indicadores.escolas_participantes / indicadores.escolas_total) * 100)
    : 0;
  const percentualDocumentosAprovados = indicadores.documentos_total
    ? Math.round((indicadores.documentos_aprovados / indicadores.documentos_total) * 100)
    : 0;
  const rankingMunicipios = municipios
    .filter((municipio) => (municipio.total_documentos ?? 0) > 0)
    .sort((a, b) => (b.total_documentos ?? 0) - (a.total_documentos ?? 0));
  const rankingTipos = useMemo(() => {
    if (!municipioSelecionado) return resumo.ranking_tipos;
    const soma: Record<string, number> = {};
    municipios.forEach((municipio) => {
      Object.entries(resumo.tipos_por_municipio?.[String(municipio.id)] ?? {}).forEach(([nome, total]) => {
        soma[nome] = (soma[nome] ?? 0) + total;
      });
    });
    return Object.entries(soma).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  }, [municipioSelecionado, municipios, resumo.ranking_tipos, resumo.tipos_por_municipio]);
  const totalTipos = rankingTipos.reduce((total, tipo) => total + tipo.total, 0);

  return (
    <div className="p-5 sm:p-8 max-w-[1500px]">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sol-valores.png" alt="" width={900} height={545} className="h-auto w-16 shrink-0" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-brand-dark">Painel geral</h1>
            <p className="text-sm text-brand-dark/80 mt-1">
              Projeto Valores Humanos · {descricaoPeriodo}. Acompanhe a participação dos municípios e as ações pedagógicas realizadas.
            </p>
          </div>
        </div>
        <Link
          href="/admin/pendencias"
          className="inline-flex items-center gap-2 self-start sm:self-auto rounded-lg border border-brand-light/30 bg-white px-4 py-2 text-sm font-semibold text-brand-light shadow-sm hover:bg-brand-light/5"
        >
          Revisar documentos
          {indicadores.documentos_pendentes > 0 && (
            <span className="rounded-full bg-status-pendente px-2 py-0.5 text-xs font-bold text-white">{indicadores.documentos_pendentes}</span>
          )}
          <span aria-hidden>→</span>
        </Link>
      </header>

      <section className="bg-white rounded-xl border border-black/5 shadow-sm px-4 py-4 sm:px-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1.3fr_auto] gap-3 items-end">
          <CampoFiltro rotulo="Ação pedagógica" id="acao-dashboard">
            <select id="acao-dashboard" value={filtros.acao} onChange={(e) => onFiltrosChange({ ...filtros, acao: e.target.value })} className={CLASSE_SELECT}>
              <option value="">Todas as ações</option>
              {acoes.map((acao) => <option key={acao.id} value={acao.id}>{acao.nome}</option>)}
              <option value="sem">Sem ação pedagógica</option>
            </select>
          </CampoFiltro>
          <CampoFiltro rotulo="Mês" id="mes-dashboard">
            <select id="mes-dashboard" value={filtros.mes} onChange={(e) => onFiltrosChange({ ...filtros, mes: e.target.value })} className={`${CLASSE_SELECT} disabled:bg-black/[0.03] disabled:text-brand-dark/50`}>
              <option value="">Todos os meses</option>
              {MESES.map((mes, i) => <option key={mes} value={String(i + 1)}>{mes}</option>)}
            </select>
          </CampoFiltro>
          <CampoFiltro rotulo="Município" id="municipio-dashboard">
            <select id="municipio-dashboard" value={municipioSelecionado} onChange={(e) => setMunicipioSelecionado(e.target.value)} className={CLASSE_SELECT}>
              <option value="">Todos os municípios</option>
              {municipiosComEnvio.map((municipio) => <option key={municipio.id} value={municipio.id}>{municipio.nome}</option>)}
            </select>
          </CampoFiltro>
          <div className="flex items-center gap-3 h-[42px]">
            {(!filtrosPadrao || municipioSelecionado) && (
              <button
                onClick={() => { onFiltrosChange({ acao: "", ciclo: null, mes: "" }); setMunicipioSelecionado(""); }}
                className="text-sm font-medium text-brand-light hover:underline whitespace-nowrap"
              >
                Limpar filtros
              </button>
            )}
            {atualizando && <span className="text-xs text-brand-dark/70 whitespace-nowrap">Atualizando...</span>}
          </div>
        </div>
      </section>

      <AcoesPedagogicasDoCiclo
        acoes={resumo.por_acao ?? []}
        semAcao={resumo.sem_acao ?? 0}
        selecionada={filtros.acao}
        onSelecionar={(acao) => onFiltrosChange({ ...filtros, acao })}
      />

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <MetricCard label="Municípios participantes" value={indicadores.municipios_participantes} detail={`${percentualParticipacao}% dos municípios`} tone="green" />
        <MetricCard label="Escolas no programa" value={indicadores.escolas_total} detail={`${indicadores.escolas_participantes} já enviaram documentos`} tone="blue" />
        <MetricCard label="Documentos inseridos" value={indicadores.documentos_total} detail={`${percentualDocumentosAprovados}% aprovados`} tone="amber" />
        <MetricCard label="Para revisar" value={indicadores.documentos_pendentes} detail="enviados e ainda não revisados" tone="red" />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.45fr_1fr] gap-5 mb-5">
        <MapaMunicipios municipios={municipios} escolas={escolasFiltradas} />

        <div className="bg-white rounded-xl border border-black/5 shadow-sm p-5">
          <h2 className="font-semibold text-brand-dark">Documentos mais inseridos</h2>
          <p className="text-xs text-brand-dark/75 mt-1 mb-5">Tipos de documento com mais envios</p>
          <div className="space-y-4">
            {rankingTipos.slice(0, 6).map((tipo) => {
              const percentual = totalTipos ? Math.round((tipo.total / totalTipos) * 100) : 0;
              const Icone = iconeDoTipo(tipo.nome);
              return (
                <div key={tipo.nome} className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-brand text-white flex items-center justify-center shrink-0">
                    <Icone className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-brand-dark truncate">{tipo.nome}</p>
                    <p className="text-xs text-brand-dark/75">
                      {tipo.total.toLocaleString("pt-BR")} {tipo.total === 1 ? "documento" : "documentos"} ({percentual}%)
                    </p>
                  </div>
                  <div className="w-24 sm:w-28 h-1.5 rounded-full bg-brand-light/10 overflow-hidden shrink-0">
                    <div className="h-full rounded-full bg-brand-light" style={{ width: `${percentual}%` }} />
                  </div>
                </div>
              );
            })}
            {!rankingTipos.length && <p className="text-sm text-brand-dark/75">Nenhum documento inserido ainda.</p>}
          </div>
        </div>
      </section>

      <section className="mb-5">
        <div className="bg-white rounded-xl border border-black/5 shadow-sm p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold text-brand-dark">Municípios participantes</h2>
              <p className="text-xs text-brand-dark/75 mt-1">Municípios com pelo menos um documento enviado</p>
            </div>
            <span className="text-2xl font-semibold text-brand-dark">{percentualParticipacao}%</span>
          </div>
          <div className="h-3 rounded-full bg-brand-light/10 overflow-hidden mb-5">
            <div className="h-full rounded-full bg-brand-light" style={{ width: `${percentualParticipacao}%` }} />
          </div>
          <div className="space-y-3">
            {rankingMunicipios.slice(0, 5).map((municipio) => (
              <Link href={`/municipios/${municipio.id}${filtrosNaUrl}`} key={municipio.id} className="block group">
                <div className="flex items-center justify-between gap-3 text-sm mb-1">
                  <span className="font-medium text-brand-dark group-hover:text-brand-light truncate">{municipio.nome}</span>
                  <span className="text-xs text-brand-dark/75 shrink-0">{municipio.total_documentos} docs</span>
                </div>
                <div className="h-1.5 rounded-full bg-brand-light/10 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-accent" style={{ width: `${Math.min(100, municipio.total_documentos ? ((municipio.aprovados ?? 0) / municipio.total_documentos) * 100 : 0)}%` }} />
                </div>
              </Link>
            ))}
            {!rankingMunicipios.length && <p className="text-sm text-brand-dark/75">Nenhum documento enviado com os filtros escolhidos.</p>}
          </div>
        </div>

      </section>

      <TabelaEscolas escolas={escolasFiltradas} />

      <section className="bg-white rounded-xl border border-black/5 shadow-sm overflow-hidden">
        <div className="p-5 flex items-center justify-between gap-3">
          <div><h2 className="font-semibold text-brand-dark">Municípios e andamento</h2><p className="text-xs text-brand-dark/75 mt-1">{descricaoPeriodo} · Resumo atualizado com os dados disponíveis no sistema</p></div>
          <span className="text-xs text-brand-dark/70">{municipios.filter((municipio) => (municipio.total_documentos ?? 0) > 0).length} municípios com envio</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead className="bg-brand-light/[0.05] text-xs text-brand-dark/80 uppercase tracking-wide"><tr><th className="text-left font-medium px-5 py-3">Município</th><th className="text-left font-medium px-3 py-3">Documentos</th><th className="text-left font-medium px-3 py-3">Aprovados</th><th className="text-left font-medium px-3 py-3">Para revisar</th><th className="text-left font-medium px-3 py-3">Progresso</th></tr></thead>
            <tbody className="divide-y divide-black/5">{municipios.filter((municipio) => (municipio.total_documentos ?? 0) > 0).map((municipio) => { const total = municipio.total_documentos ?? 0; const aprovados = municipio.aprovados ?? 0; const pendentes = municipio.pendentes ?? 0; const progresso = total ? Math.round((aprovados / total) * 100) : 0; return <tr key={municipio.id} className="hover:bg-brand-light/[0.03] cursor-pointer" onClick={() => window.location.href = `/municipios/${municipio.id}${filtrosNaUrl}`}><td className="px-5 py-3 font-medium text-brand-dark">{municipio.nome}<span className="block text-xs font-normal text-brand-dark/70">{municipio.escolas_participantes} de {municipio.escolas_total} escolas participantes</span></td><td className="px-3 py-3 text-brand-dark/85">{total}</td><td className="px-3 py-3 text-status-completo">{aprovados}</td><td className="px-3 py-3 text-status-pendente">{pendentes}</td><td className="px-3 py-3 min-w-[150px]"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-brand-light/10 overflow-hidden"><div className="h-full rounded-full bg-brand-light" style={{ width: `${progresso}%` }} /></div><span className="text-xs text-brand-dark/75 w-8">{progresso}%</span></div></td></tr>; })}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AcoesPedagogicasDoCiclo({
  acoes,
  semAcao,
  selecionada,
  onSelecionar,
}: {
  acoes: AcaoResumo[];
  semAcao: number;
  selecionada: string;
  onSelecionar: (id: string) => void;
}) {
  if (!acoes.length) return null;
  const maior = Math.max(1, ...acoes.map((a) => a.total));
  const total = acoes.reduce((soma, a) => soma + a.total, 0) + semAcao;
  return (
    <section className="bg-white rounded-xl border border-black/5 shadow-sm p-4 sm:p-5 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-4">
        <div>
          <h2 className="font-semibold text-brand-dark">Ações pedagógicas</h2>
          <p className="text-xs text-brand-dark/75 mt-1">Imagens, vídeos e relatórios enviados por ação. Clique em uma ação para filtrar o painel.</p>
        </div>
        <span className="text-sm text-brand-dark/80">{total.toLocaleString("pt-BR")} {total === 1 ? "documento" : "documentos"}</span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {acoes.map((acao) => {
          const marcada = selecionada === acao.id;
          return (
            <li key={acao.id}>
              <button
                type="button"
                aria-pressed={marcada}
                onClick={() => onSelecionar(marcada ? "" : acao.id)}
                className={`w-full text-left rounded-xl border p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-light/40 ${
                  marcada ? "border-brand-light bg-brand-light/10 ring-1 ring-brand-light/40" : "border-black/10 hover:bg-black/[0.02]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <IconeAcao nome={acao.nome} />
                  <p className="text-sm font-semibold text-brand-dark leading-snug">{acao.nome}</p>
                </div>
                <p className="mt-2 text-2xl font-semibold leading-tight text-brand-dark">{acao.total.toLocaleString("pt-BR")}</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-brand-light/10 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-light" style={{ width: `${(acao.total / maior) * 100}%` }} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {semAcao > 0 && (
        <p className="mt-3 text-xs text-brand-dark/75">
          {semAcao} {semAcao === 1 ? "documento" : "documentos"} sem ação pedagógica (enviados antes desta etapa).
        </p>
      )}
    </section>
  );
}

function MetricCard({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: "green" | "blue" | "amber" | "red" }) {
  const styles = { green: "bg-brand-light/10 text-brand-light", blue: "bg-sky-100 text-sky-700", amber: "bg-amber-100 text-amber-700", red: "bg-red-100 text-red-700" };
  const Icon = tone === "green" ? CheckIcon : tone === "blue" ? MapPinIcon : tone === "amber" ? FileTextIcon : AlertIcon;
  return <div className="bg-white rounded-xl border border-black/5 shadow-sm p-4 sm:p-5"><div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-4 ${styles[tone]}`}><Icon className="w-5 h-5" /></div><p className="text-xs text-brand-dark/80 leading-snug">{label}</p><p className="text-2xl sm:text-3xl font-semibold text-brand-dark mt-1">{value.toLocaleString("pt-BR")}</p><p className="text-xs text-brand-dark/70 mt-1">{detail}</p></div>;
}

function iconeDoTipo(nome: string) {
  const n = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (n.includes("foto") || n.includes("imagem")) return ImageIcon;
  if (n.includes("video")) return VideoIcon;
  if (n.includes("presenca") || n.includes("ficha") || n.includes("lista")) return ClipboardListIcon;
  if (n.includes("pdf") || n.includes("relatorio") || n.includes("ata") || n.includes("document")) return FileTextIcon;
  return FolderIcon;
}

function TabelaEscolas({ escolas }: { escolas: EscolaParticipante[] }) {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [soSemLocalizacao, setSoSemLocalizacao] = useState(false);
  const POR_PAGINA = 20;
  const semLocalizacao = escolas.filter((e) => e.latitude == null || e.longitude == null).length;
  const lista = useMemo(() => {
    const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const termo = normalizar(busca.trim());
    return escolas
      .filter((escola) => !soSemLocalizacao || escola.latitude == null || escola.longitude == null)
      .filter((escola) =>
        !termo ||
        normalizar(escola.nome).includes(termo) ||
        normalizar(escola.municipio_nome ?? "").includes(termo) ||
        escola.programas.some((programa) => normalizar(programa).includes(termo))
      )
      .sort((a, b) => b.documentos - a.documentos || a.nome.localeCompare(b.nome));
  }, [busca, escolas, soSemLocalizacao]);
  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;

  return (
    <section className="bg-white rounded-xl border border-black/5 shadow-sm overflow-hidden mb-5">
      <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-semibold text-brand-dark">Escolas participantes</h2>
          <p className="text-xs text-brand-dark/75 mt-1">
            {lista.length.toLocaleString("pt-BR")} escolas com documentos enviados
            {semLocalizacao > 0 && (
              <button
                onClick={() => { setSoSemLocalizacao((v) => !v); setPagina(1); }}
                className={`ml-2 rounded-full px-2 py-0.5 font-semibold ${soSemLocalizacao ? "bg-status-pendente text-white" : "bg-status-pendente/10 text-status-pendente hover:bg-status-pendente/20"}`}
                title="Mostrar só as escolas sem latitude/longitude"
              >
                {semLocalizacao} sem georreferência{soSemLocalizacao ? " ✕" : ""}
              </button>
            )}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark/65" />
          <input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Buscar escola, município ou ação pedagógica..."
            className="w-full border border-black/10 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead className="bg-brand-light/[0.05] text-xs text-brand-dark/80 uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-5 py-3">Escola</th>
              <th className="text-left font-medium px-3 py-3">Município</th>
              <th className="text-left font-medium px-3 py-3">Ações pedagógicas</th>
              <th className="text-right font-medium px-5 py-3">Documentos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {lista.slice(inicio, inicio + POR_PAGINA).map((escola) => (
              <tr
                key={escola.id}
                className="hover:bg-brand-light/[0.03] cursor-pointer"
                onClick={() => (window.location.href = `/municipios/${escola.municipio_id}`)}
              >
                <td className="px-5 py-3">
                  <span className="font-medium text-brand-dark">{escola.nome}</span>
                  <Coordenadas latitude={escola.latitude} longitude={escola.longitude} />
                </td>
                <td className="px-3 py-3 text-brand-dark/85">{escola.municipio_nome ?? "—"}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {escola.programas.map((acao) => (
                      <span
                        key={acao}
                        className={`text-xs px-2 py-0.5 rounded-full ${acao.startsWith("Sem ") ? "bg-black/5 text-brand-dark/75" : "bg-brand-light/10 text-brand-light"}`}
                      >
                        {acao}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3 text-right text-brand-dark/85">{escola.documentos}</td>
              </tr>
            ))}
            {!lista.length && (
              <tr><td colSpan={4} className="px-5 py-6 text-center text-sm text-brand-dark/75">Nenhuma escola encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {lista.length > POR_PAGINA && (
        <div className="px-5 py-3 flex items-center justify-between gap-3 border-t border-black/5 text-sm">
          <span className="text-xs text-brand-dark/75">
            {(inicio + 1).toLocaleString("pt-BR")}–{Math.min(inicio + POR_PAGINA, lista.length).toLocaleString("pt-BR")} de {lista.length.toLocaleString("pt-BR")}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPagina(paginaAtual - 1)} disabled={paginaAtual === 1} className="px-3 py-1.5 rounded-lg border border-black/10 text-brand-dark disabled:opacity-40 hover:bg-brand-light/5">‹ Anterior</button>
            <span className="text-xs text-brand-dark/80">Página {paginaAtual} de {totalPaginas}</span>
            <button onClick={() => setPagina(paginaAtual + 1)} disabled={paginaAtual === totalPaginas} className="px-3 py-1.5 rounded-lg border border-black/10 text-brand-dark disabled:opacity-40 hover:bg-brand-light/5">Próxima ›</button>
          </div>
        </div>
      )}
    </section>
  );
}

const CLASSE_SELECT =
  "w-full h-[42px] border border-black/10 rounded-lg bg-white px-3 text-sm font-medium text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-light/30";

function CampoFiltro({ rotulo, id, dica, children }: { rotulo: string; id: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wide text-brand-dark/75 mb-1.5" title={dica}>
        {rotulo}
      </label>
      {children}
    </div>
  );
}

function Coordenadas({ latitude, longitude }: { latitude: number | null; longitude: number | null }) {
  if (latitude == null || longitude == null) {
    return (
      <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-status-pendente">
        ⚠️ Sem georreferência (latitude/longitude não cadastradas)
      </span>
    );
  }
  return (
    <a
      href={`https://www.google.com/maps?q=${latitude},${longitude}`}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-dark/75 hover:text-brand-light hover:underline"
      title="Ver no Google Maps"
    >
      📍 Lat {latitude.toFixed(6)} · Long {longitude.toFixed(6)}
    </a>
  );
}
