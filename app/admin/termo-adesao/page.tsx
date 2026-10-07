"use client";

import { TituloPagina, Indicador } from "@/components/TituloPagina";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiAbrirArquivo, apiGet, apiPost } from "@/lib/api";
import { AdminGuard } from "@/components/AdminGuard";
import { mascaraCpf } from "@/lib/mascaras";
import { PdfIcon } from "@/components/icons";
import { Abas, BarraFiltros, CampoBusca, CLASSE_SELECT, SeletorOrdem } from "@/components/Filtros";
import { Paginacao } from "@/components/Paginacao";

type Status = "rascunho" | "enviada" | "aprovada";
type ResumoAssinatura = {
  pedido_id: string; status: "pendente" | "concluido"; criado_em: string; concluido_em?: string | null;
  total: number; assinados: number;
  signatarios: { papel: string; nome: string; email: string; assinado_em?: string | null }[];
};
const PAPEL_ASSINATURA: Record<string, string> = {
  prefeito: "Prefeito(a) Municipal", secretario: "Secretário(a) de Educação", sindicato: "Presidente do Sindicato Rural", coordenador: "Coordenador(a) do Projeto",
};
type Filtro = Status | "todas" | "assinando";
type Linha = {
  id: string; status: Status; municipio_nome?: string | null; coordenador_nome?: string | null;
  coordenador_telefone?: string | null; coordenador_email?: string | null;
  termo_assinado_nome?: string | null; assinatura?: ResumoAssinatura | null; observacao_admin?: string | null; total_escolas_informado?: number | null; total_professores_informado?: number | null; enviada_em?: string | null;
};
type EscolaDetalhe = {
  escola_id: string; nome: string; tipo?: string | null; quantidade_professores: number;
  matricula_infantil_3: number; matricula_infantil_4: number; matricula_infantil_5: number;
};
type Detalhe = Record<string, any> & { escolas: EscolaDetalhe[]; coordenador?: Record<string, string> | null };

const ROTULO: Record<Status, { texto: string; cor: string; fundo: string }> = {
  rascunho: { texto: "Rascunho", cor: "#6E4B00", fundo: "#FFF3CC" },
  enviada: { texto: "Em análise", cor: "#0F4C85", fundo: "#E2EFFB" },
  aprovada: { texto: "Válido", cor: "#17613B", fundo: "#E3F4EA" },
};
// Motivos mais comuns: um clique coloca o texto no recado (o admin pode completar)
const MOTIVOS = [
  "Há escolas marcadas que não participam do programa — revise a lista.",
  "Faltam escolas que participam do programa — inclua as que estão faltando.",
  "Números de professores ou alunos incompletos ou incorretos.",
  "Dados da prefeitura ou da secretaria incompletos.",
  "O termo assinado está incompleto: faltam assinaturas.",
];
// Selos e botão têm o mesmo tamanho (altura 36px) e só cantos arredondados, para alinhar na linha
const SELO = "inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-bold";
const BOTAO_TERMO =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-light text-white shadow-sm transition hover:bg-brand-accent";
const FILTROS: { valor: Filtro; nome: string }[] = [
  { valor: "assinando", nome: "Em assinatura" },
  { valor: "enviada", nome: "Em análise" },
  { valor: "aprovada", nome: "Válidos" },
  { valor: "rascunho", nome: "Rascunhos" },
  { valor: "todas", nome: "Todas" },
];

type Ordem = "recentes" | "antigos";
const POR_PAGINA_PADRAO = 10;

// "Em assinatura" = termo enviado por e-mail e ainda faltando assinaturas (inclui fichas ainda em rascunho)
const PAPEIS_DO_TERMO = ["prefeito", "secretario", "sindicato", "coordenador"];
// quem ainda não assinou por e-mail neste termo (assinam fora do sistema, enquanto não liberados)
function faltamPorEmail(a: Linha) {
  return PAPEIS_DO_TERMO.filter((p) => !(a.assinatura?.signatarios ?? []).some((s) => s.papel === p));
}

function combina(a: Linha, filtro: Filtro) {
  if (filtro === "todas") return true;
  if (filtro === "assinando") return a.assinatura?.status === "pendente";
  return a.status === filtro;
}

function normalizar(texto?: string | null) {
  return (texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function dataBr(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function TermoAdesaoGuarded() {
  return (
    <AdminGuard>
      <TermoAdesao />
    </AdminGuard>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark/60">{rotulo}</p>
      <p className="text-sm text-brand-dark">{valor || "—"}</p>
    </div>
  );
}

function TermoAdesao() {
  const [lista, setLista] = useState<Linha[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("enviada");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [filtroMunicipio, setFiltroMunicipio] = useState("");
  const [busca, setBusca] = useState("");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [recado, setRecado] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [agindo, setAgindo] = useState(false);

  const carregar = useCallback(() => {
    apiGet("/api/admin/adesoes").then(setLista).catch((e) => setErro(e.message));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  function abrir(id: string) {
    if (abertoId === id) { setAbertoId(null); setDetalhe(null); return; }
    setAbertoId(id); setDetalhe(null); setRecado(""); setErro(null); setMensagem(null);
    apiGet(`/api/adesao?id=${id}`).then((r) => setDetalhe(r.adesao)).catch((e) => setErro(e.message));
  }

  async function agir(tipo: "aprovar" | "devolver", id: string) {
    setErro(null); setMensagem(null);
    if (tipo === "aprovar" && !confirm("Aprovar esta adesão? O coordenador ganha acesso ao município e as escolas entram no programa.")) return;
    if (tipo === "devolver" && !recado.trim()) { setErro("Escreva o que o coordenador precisa corrigir antes de devolver."); return; }
    setAgindo(true);
    try {
      const r = await apiPost(`/api/admin/adesoes/${tipo === "aprovar" ? "aprovar" : "devolver"}`, { id, observacao: recado });
      setMensagem(tipo === "aprovar" ? `Adesão aprovada — ${r.escolas_no_programa} escola(s) entraram no programa.` : "Adesão devolvida para o coordenador corrigir.");
      setAbertoId(null); setDetalhe(null);
      carregar();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setAgindo(false);
    }
  }

  const municipios = useMemo(
    () => Array.from(new Set((lista ?? []).map((a) => a.municipio_nome).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [lista]
  );

  // busca + município valem para as abas e para a contagem de cada aba
  const doFiltro = useMemo(() => {
    const termo = normalizar(busca.trim());
    return (lista ?? []).filter(
      (a) =>
        (!filtroMunicipio || a.municipio_nome === filtroMunicipio) &&
        (!termo || [a.municipio_nome, a.coordenador_nome, a.coordenador_email].some((v) => normalizar(v).includes(termo)))
    );
  }, [lista, filtroMunicipio, busca]);

  const visiveis = useMemo(() => {
    const itens = doFiltro.filter((a) => combina(a, filtro));
    const chave = (a: Linha) => a.enviada_em ?? "";
    return [...itens].sort((a, b) => (ordem === "antigos" ? chave(a).localeCompare(chave(b)) : chave(b).localeCompare(chave(a))));
  }, [doFiltro, filtro, ordem]);

  const temFiltro = Boolean(filtroMunicipio || busca.trim());

  // Paginação (mesma preferência de "por página" da tela de Pendências)
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(POR_PAGINA_PADRAO);
  useEffect(() => {
    try {
      const salvo = Number(window.localStorage.getItem("painel_por_pagina"));
      if ([10, 20, 50].includes(salvo)) setPorPagina(salvo);
    } catch { /* sem armazenamento: usa o padrão */ }
  }, []);
  // trocou aba, busca, município ou ordem: volta para a primeira página
  useEffect(() => { setPagina(1); }, [filtro, filtroMunicipio, busca, ordem]);
  // se a lista encolher (ex.: aprovou o último da página), volta para a última página válida
  const ultimaPagina = Math.max(1, Math.ceil(visiveis.length / porPagina));
  useEffect(() => { if (pagina > ultimaPagina) setPagina(ultimaPagina); }, [pagina, ultimaPagina]);
  const daPagina = useMemo(() => visiveis.slice((pagina - 1) * porPagina, pagina * porPagina), [visiveis, pagina, porPagina]);
  function mudarPorPagina(valor: number) {
    setPorPagina(valor);
    setPagina(1);
    try { window.localStorage.setItem("painel_por_pagina", String(valor)); } catch { /* ignora */ }
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 sm:p-7">
        <TituloPagina
          descricao="Acompanhe os termos enviados para assinatura, abra o termo assinado e aprove ou devolva para correção."
          acao={<Indicador valor={(lista ?? []).filter((a) => a.status === "enviada").length} rotulo="para aprovar" alerta={(lista ?? []).some((a) => a.status === "enviada")} />}
        >Termo de Adesão</TituloPagina>

        {erro && <div className="mt-5 rounded-lg bg-status-pendente/10 text-status-pendente px-4 py-3 text-sm">{erro}</div>}
        {mensagem && <div className="mt-5 rounded-lg bg-status-completo/10 text-status-completo px-4 py-3 text-sm">{mensagem}</div>}

        {/* Abas + ordenação */}
        <Abas<Filtro>
          abas={FILTROS.map((f) => ({
            valor: f.valor,
            rotulo: f.nome,
            contagem: doFiltro.filter((a) => combina(a, f.valor)).length,
          }))}
          valor={filtro}
          onChange={setFiltro}
          direita={
            <SeletorOrdem
              valor={ordem}
              onChange={(v) => setOrdem(v as Ordem)}
              opcoes={[["recentes", "Enviadas mais recentes"], ["antigos", "Enviadas mais antigas"]]}
            />
          }
        />

        {/* Filtros */}
        <BarraFiltros mostrarLimpar={temFiltro} onLimpar={() => { setFiltroMunicipio(""); setBusca(""); }}>
          <CampoBusca value={busca} onChange={setBusca} placeholder="Buscar município, coordenador..." />
          <select value={filtroMunicipio} onChange={(e) => setFiltroMunicipio(e.target.value)} className={CLASSE_SELECT}>
            <option value="">Todos os municípios</option>
            {municipios.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </BarraFiltros>

        <div className="mt-5 space-y-3">
          {!lista && !erro && <p className="text-sm text-brand-dark/75">Carregando...</p>}
          {lista && visiveis.length === 0 && (
            <div className="rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-brand-dark/75">
              Nenhuma adesão encontrada com esses filtros.
            </div>
          )}
          {daPagina.map((a) => {
            const r = ROTULO[a.status];
            const aberto = abertoId === a.id;
            return (
              <article key={a.id} className={`rounded-xl border bg-white ${aberto ? "border-brand-light/40 ring-2 ring-brand-light/20" : "border-black/5"}`}>
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={() => abrir(a.id)} className="min-w-0 flex-1 text-left" aria-expanded={aberto}>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-brand-dark leading-snug">{a.municipio_nome ?? "Município não escolhido"}</p>
                    <p className="text-sm text-brand-dark/75">
                      {a.coordenador_nome ?? "—"}{a.coordenador_telefone ? ` · ${a.coordenador_telefone}` : ""}{a.coordenador_email ? ` · ${a.coordenador_email}` : ""}
                    </p>
                    <p className="text-xs text-brand-dark/60 mt-0.5">
                      {a.total_escolas_informado ?? 0} escola(s) · {a.total_professores_informado ?? 0} professor(es) · enviada em {dataBr(a.enviada_em)}
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className={`${SELO} w-44`}
                    style={a.status === "rascunho" && a.observacao_admin ? { background: "#FFE8D9", color: "#8A2A00" } : { background: r.fundo, color: r.cor }}>
                    {a.status === "rascunho" && a.observacao_admin ? "Devolvida para correção" : r.texto}
                  </span>
                  {a.assinatura?.status === "pendente" && (
                    <span className={`${SELO} w-28`} style={{ background: "#FFF3CC", color: "#6E4B00" }} title="Termo enviado por e-mail; aguardando assinaturas">
                      Assinando {a.assinatura.assinados}/{a.assinatura.total}
                    </span>
                  )}
                  {a.status !== "rascunho" && !(a.assinatura?.status === "pendente" && !a.termo_assinado_nome) && (
                    <span className={`${SELO} min-w-[7rem]`}
                      title={a.termo_assinado_nome && a.assinatura?.status === "concluido" && faltamPorEmail(a).length > 0 ? `Parcial: assinaram por e-mail (${(a.assinatura.signatarios ?? []).map((sg) => PAPEL_ASSINATURA[sg.papel] ?? sg.papel).join(", ")}). Faltam: ${faltamPorEmail(a).map((p) => PAPEL_ASSINATURA[p]).join(", ")}.` : undefined}
                      style={a.termo_assinado_nome ? { background: "#E3F4EA", color: "#17613B" } : { background: "#EFEDE4", color: "#4A453A" }}>
                      {a.termo_assinado_nome ? (a.assinatura?.status === "concluido" && faltamPorEmail(a).length > 0 ? "✓ Parcial" : "✓ Assinado") : "Sem assinatura"}
                    </span>
                  )}
                  {/* mesmo botão nos dois casos: abre o termo assinado (PDF) se houver; senão, o termo gerado pelo sistema */}
                  {a.termo_assinado_nome ? (
                    <button
                      type="button"
                      onClick={() => apiAbrirArquivo(`/api/adesao/termo-assinado?id=${a.id}`).catch((e) => setErro(e.message))}
                      className={BOTAO_TERMO}
                      title="Ver termo assinado (PDF)"
                      aria-label="Ver termo assinado (PDF)"
                    >
                      <PdfIcon className="h-5 w-5" />
                    </button>
                  ) : (
                    (a.status !== "rascunho" || a.assinatura) && (
                      <Link
                        href={a.assinatura ? `/admin/termo-adesao/${a.id}/assinatura` : `/admin/termo-adesao/${a.id}`}
                        target="_blank" className={BOTAO_TERMO}
                        title={a.assinatura?.status === "pendente" ? "Ver termo enviado para assinatura" : "Ver termo (PDF)"}
                        aria-label={a.assinatura?.status === "pendente" ? "Ver termo enviado para assinatura" : "Ver termo (PDF)"}
                      >
                        <PdfIcon className="h-5 w-5" />
                      </Link>
                    )
                  )}
                </div>
                </div>

                {aberto && (
                  <div className="border-t border-black/5 p-4 space-y-5">
                    {!detalhe ? (
                      <p className="text-sm text-brand-dark/75">Carregando detalhes...</p>
                    ) : (
                      <>
                        {a.assinatura && (
                          <section className="rounded-xl border border-black/5 bg-black/[0.02] p-4">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <h2 className="text-sm font-bold text-brand-dark">
                                Assinaturas por e-mail — {a.assinatura.status === "concluido" ? "todas concluídas" : `${a.assinatura.assinados} de ${a.assinatura.total}`}
                              </h2>
                              <Link href={`/admin/termo-adesao/${a.id}/assinatura`} target="_blank" className="text-sm font-semibold text-brand-light hover:underline">
                                Ver termo enviado para assinatura
                              </Link>
                            </div>
                            <ul className="divide-y divide-black/5 rounded-lg border border-black/5 bg-white">
                              {a.assinatura.signatarios.map((sg) => (
                                <li key={sg.papel} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-brand-dark">{sg.nome} <span className="font-normal text-brand-dark/60">· {PAPEL_ASSINATURA[sg.papel] ?? sg.papel}</span></p>
                                    <p className="truncate text-xs text-brand-dark/70">{sg.email}</p>
                                  </div>
                                  <span className="rounded-full px-3 py-1 text-xs font-semibold" style={sg.assinado_em ? { background: "#E3F4EA", color: "#17613B" } : { background: "#EFEDE4", color: "#4A453A" }}>
                                    {sg.assinado_em ? `✓ Assinou em ${dataBr(sg.assinado_em)}` : "Aguardando"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {faltamPorEmail(a).length > 0 && (
                              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                Assinaram por e-mail: {a.assinatura.signatarios.map((sg) => PAPEL_ASSINATURA[sg.papel] ?? sg.papel).join(", ")}.
                                {" "}Ficam fora do sistema: {faltamPorEmail(a).map((p) => PAPEL_ASSINATURA[p]).join(", ")}.
                              </p>
                            )}
                            <p className="mt-2 text-xs text-brand-dark/60">Enviado para assinatura em {dataBr(a.assinatura.criado_em)}{a.assinatura.concluido_em ? ` · concluído em ${dataBr(a.assinatura.concluido_em)}` : ""}.</p>
                          </section>
                        )}
                        {a.status !== "rascunho" && (
                          <p className="text-sm">
                            <Link href={`/admin/termo-adesao/${a.id}`} target="_blank" className="font-semibold text-brand-light hover:underline">
                              Ver termo sem assinaturas (gerado pelo sistema)
                            </Link>
                          </p>
                        )}
                        <section>
                          <h2 className="text-sm font-bold text-brand-dark mb-2">Prefeitura</h2>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Dado rotulo="Prefeito(a)" valor={detalhe.prefeito_nome} />
                            <Dado rotulo="RG" valor={detalhe.prefeito_rg} />
                            <Dado rotulo="CPF" valor={detalhe.prefeito_cpf ? mascaraCpf(detalhe.prefeito_cpf) : null} />
                            <Dado rotulo="Endereço" valor={detalhe.prefeitura_endereco} />
                            <Dado rotulo="CEP" valor={detalhe.prefeitura_cep} />
                            <Dado rotulo="Telefone" valor={detalhe.prefeitura_telefone} />
                            <Dado rotulo="E-mail" valor={detalhe.prefeitura_email} />
                          </div>
                        </section>
                        <section>
                          <h2 className="text-sm font-bold text-brand-dark mb-2">Secretaria de Educação</h2>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Dado rotulo="Secretário(a)" valor={detalhe.secretario_nome} />
                            <Dado rotulo="CPF" valor={detalhe.secretario_cpf ? mascaraCpf(detalhe.secretario_cpf) : null} />
                            <Dado rotulo="Telefone" valor={detalhe.secretaria_telefone} />
                            <Dado rotulo="Endereço" valor={detalhe.secretaria_endereco} />
                            <Dado rotulo="E-mail" valor={detalhe.secretaria_email} />
                          </div>
                        </section>
                        <section>
                          <h2 className="text-sm font-bold text-brand-dark mb-2">Coordenador(a)</h2>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Dado rotulo="Nome" valor={detalhe.coordenador?.nome} />
                            <Dado rotulo="CPF" valor={detalhe.coordenador?.cpf ? mascaraCpf(detalhe.coordenador.cpf) : null} />
                            <Dado rotulo="RG" valor={detalhe.coordenador?.rg} />
                            <Dado rotulo="Telefone 1" valor={detalhe.coordenador?.telefone1} />
                            <Dado rotulo="Telefone 2" valor={detalhe.coordenador?.telefone2} />
                            <Dado rotulo="E-mail" valor={detalhe.coordenador?.email} />
                            <Dado rotulo="Preencheu a ficha" valor={detalhe.responsavel_preenchimento} />
                          </div>
                        </section>
                        <section>
                          <h2 className="text-sm font-bold text-brand-dark mb-2">Escolas participantes ({detalhe.escolas.length})</h2>
                          <div className="overflow-x-auto rounded-lg border border-black/5">
                            <table className="w-full text-sm">
                              <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide text-brand-dark/70">
                                <tr><th className="px-3 py-2">Escola</th><th className="px-3 py-2">Prof.</th><th className="px-3 py-2">Inf. 3</th><th className="px-3 py-2">Inf. 4</th><th className="px-3 py-2">Inf. 5</th></tr>
                              </thead>
                              <tbody className="divide-y divide-black/5">
                                {detalhe.escolas.map((e) => (
                                  <tr key={e.escola_id}>
                                    <td className="px-3 py-2 font-medium text-brand-dark">{e.nome}</td>
                                    <td className="px-3 py-2">{e.quantidade_professores}</td>
                                    <td className="px-3 py-2">{e.matricula_infantil_3}</td>
                                    <td className="px-3 py-2">{e.matricula_infantil_4}</td>
                                    <td className="px-3 py-2">{e.matricula_infantil_5}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </section>

                        {a.status === "enviada" && (
                          <section className="rounded-xl bg-black/[0.03] p-4 space-y-3">
                            <p className="text-sm font-semibold text-brand-dark">Para devolver, diga o que precisa ser corrigido:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {MOTIVOS.map((m) => (
                                <button key={m} type="button" onClick={() => setRecado((r) => (r.trim() ? `${r.trim()}\n${m}` : m))}
                                  className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-brand-dark hover:bg-black/5">
                                  + {m.split(" — ")[0].replace(/\.$/, "")}
                                </button>
                              ))}
                            </div>
                            <textarea className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm" rows={3} maxLength={500}
                              placeholder="Recado para o coordenador (obrigatório para devolver; o coordenador vê na ficha dele)"
                              value={recado} onChange={(e) => setRecado(e.target.value)} />
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <button type="button" disabled={agindo} onClick={() => agir("aprovar", a.id)}
                                className="rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-white hover:bg-brand-accent disabled:opacity-50">
                                Aprovar adesão
                              </button>
                              <button type="button" disabled={agindo} onClick={() => agir("devolver", a.id)}
                                className="rounded-lg border border-status-pendente px-4 py-2 text-sm font-semibold text-status-pendente hover:bg-status-pendente/5 disabled:opacity-50">
                                Devolver para correção
                              </button>
                            </div>
                          </section>
                        )}
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <Paginacao
          pagina={pagina}
          total={visiveis.length}
          porPagina={porPagina}
          onChange={(n) => { setPagina(n); setAbertoId(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onChangePorPagina={mudarPorPagina}
        />
      </div>
    </div>
  );
}
