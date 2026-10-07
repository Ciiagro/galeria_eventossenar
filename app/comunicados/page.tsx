"use client";

import { useCallback, useEffect, useState } from "react";
import { TituloPagina, Indicador } from "@/components/TituloPagina";
import { apiDelete, apiGet, apiPost, apiPut, Comunicado, EnvioEmail, LeituraComunicado, ResumoEnvio, ROTULO_PAPEL } from "@/lib/api";
import { BotaoEditar, BotaoExcluir } from "@/components/BotoesIcone";
import { LinkIcon, XIcon } from "@/components/icons";

// Canal de Comunicação: o administrador envia comunicados para um ou mais públicos.
//  - TODOS recebem por E-MAIL.
//  - Coordenadores e equipe de apoio (têm login) recebem TAMBÉM dentro do sistema: "Novo" até abrir, e o menu
//    mostra a quantidade. O administrador vê quem já leu.
//  - Secretários de educação não têm login (são contatos da ficha de adesão): recebem SÓ por e-mail.

const CAMPO =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30";

type Destino = "para_coordenadores" | "para_apoiadores" | "para_secretarios";
type ChaveContagem = "coordenadores" | "apoiadores" | "secretarios";

const DESTINOS: { chave: Destino; contagem: ChaveContagem; curto: string; titulo: string; descricao: string; cor: string; fundo: string }[] = [
  { chave: "para_coordenadores", contagem: "coordenadores", curto: "Coordenadores", titulo: "Coordenadores", descricao: "Recebem no sistema e por e-mail", cor: "#6B3F94", fundo: "#F0E8F7" },
  { chave: "para_apoiadores", contagem: "apoiadores", curto: "Equipe de apoio", titulo: "Equipe de apoio", descricao: "Recebem no sistema e por e-mail", cor: "#0F4C85", fundo: "#E2EFFB" },
  { chave: "para_secretarios", contagem: "secretarios", curto: "Secretários", titulo: "Secretários de educação", descricao: "Recebem só por e-mail (não têm acesso ao sistema)", cor: "#8A5200", fundo: "#FFF1DB" },
];

const ROTULO_TIPO_EMAIL: Record<EnvioEmail["tipo"], string> = {
  coordenador: "Coordenador(a)",
  apoiador: "Equipe de apoio",
  secretario: "Secretário(a) de Educação",
};

function dataHora(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Leituras = { pessoas: LeituraComunicado[]; lidos: number; total: number; emails: EnvioEmail[] };
type Contagem = Record<ChaveContagem, { com_email: number; sem_email: number }> & { email_configurado: boolean };
type Envio = { id: string; resumo: ResumoEnvio };

export default function ComunicadosPage() {
  const [itens, setItens] = useState<Comunicado[] | null>(null);
  const [podeEnviar, setPodeEnviar] = useState(false);
  const [novos, setNovos] = useState<Set<string>>(new Set()); // os que eram novos quando a página abriu
  const [erro, setErro] = useState("");
  const [avisoAtual, setAvisoAtual] = useState<{ texto: string; atencao: boolean } | null>(null);
  const setAviso = (texto: string, atencao = false) => setAvisoAtual(texto ? { texto, atencao } : null); // "" apaga o aviso

  // formulário (só o administrador)
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [destinos, setDestinos] = useState<Record<Destino, boolean>>({ para_coordenadores: true, para_apoiadores: false, para_secretarios: false });
  const [link, setLink] = useState("");
  const [fixado, setFixado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [contagem, setContagem] = useState<Contagem | null>(null);

  // acompanhamento (só o administrador)
  const [leiturasAbertas, setLeiturasAbertas] = useState<string | null>(null);
  const [leituras, setLeituras] = useState<Record<string, Leituras>>({});
  const [carregandoLeituras, setCarregandoLeituras] = useState(false);
  const [envio, setEnvio] = useState<Envio | null>(null); // envio de e-mails em andamento

  const carregar = useCallback(async (marcarComoLido: boolean) => {
    try {
      const r = await apiGet("/api/comunicados");
      const lista: Comunicado[] = r.comunicados ?? [];
      setItens(lista);
      setPodeEnviar(Boolean(r.pode_enviar));
      setErro("");
      if (marcarComoLido && !r.pode_enviar) {
        const naoLidos = lista.filter((c) => !c.lido).map((c) => c.id);
        setNovos(new Set(naoLidos));
        if (naoLidos.length > 0) {
          await apiPost("/api/comunicados/lido", { ids: naoLidos }).catch(() => null);
          window.dispatchEvent(new Event("comunicados-lidos")); // o menu atualiza o contador
        }
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os comunicados.");
      setItens((atual) => atual ?? []);
    }
  }, []);

  useEffect(() => {
    carregar(true);
  }, [carregar]);

  function buscarContagem() {
    apiGet("/api/comunicados/contagem-email").then(setContagem).catch(() => setContagem(null));
  }

  function limparFormulario() {
    setEditandoId(null);
    setTitulo("");
    setMensagem("");
    setDestinos({ para_coordenadores: true, para_apoiadores: false, para_secretarios: false });
    setLink("");
    setFixado(false);
  }

  function abrirNovo() {
    limparFormulario();
    setAviso("");
    setErro("");
    setFormAberto(true);
    buscarContagem();
  }

  function abrirEdicao(c: Comunicado) {
    setEditandoId(c.id);
    setTitulo(c.titulo);
    setMensagem(c.mensagem);
    setDestinos({ para_coordenadores: c.para_coordenadores, para_apoiadores: c.para_apoiadores, para_secretarios: c.para_secretarios });
    setLink(c.link ?? "");
    setFixado(c.fixado);
    setAviso("");
    setErro("");
    setFormAberto(true);
    buscarContagem();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function fecharFormulario() {
    setFormAberto(false);
    limparFormulario();
  }

  const algumDestino = destinos.para_coordenadores || destinos.para_apoiadores || destinos.para_secretarios;

  // Envia os e-mails em lotes: o servidor tem limite de tempo por chamada, então a tela chama de novo
  // até acabar. Cada pessoa fica registrada, então ninguém recebe duas vezes.
  async function enviarEmails(id: string, reenviarErros = false) {
    setErro("");
    setEnvio({ id, resumo: { total: 0, enviados: 0, erros: 0, pendentes: 0 } });
    try {
      let primeira = true;
      for (let volta = 0; volta < 80; volta++) {
        const r = await apiPost("/api/comunicados/enviar-email", { id, reenviar_erros: reenviarErros && primeira });
        primeira = false;
        setEnvio({ id, resumo: { total: r.total, enviados: r.enviados, erros: r.erros, pendentes: r.pendentes } });
        if (r.feito) {
          setAviso(
            r.total === 0
              ? "Nenhuma pessoa com e-mail cadastrado para receber este comunicado."
              : `E-mails: ${r.enviados} enviado(s)${r.erros ? `, ${r.erros} com erro (use "Reenviar os que falharam")` : ""}.`,
            r.total === 0 || r.erros > 0
          );
          break;
        }
      }
    } catch (err) {
      setErro(`O envio dos e-mails parou: ${err instanceof Error ? err.message : "erro desconhecido"}. O comunicado já está salvo e visível no sistema; continue o envio no botão do comunicado.`);
    } finally {
      setEnvio(null);
      setLeituras((antes) => {
        const { [id]: _removido, ...resto } = antes;
        return resto;
      });
      await carregar(false);
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!algumDestino) {
      setErro("Marque para quem o comunicado será enviado.");
      return;
    }
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const corpo = { titulo: titulo.trim(), mensagem: mensagem.trim(), link: link.trim(), fixado, ...destinos };
      const eraEdicao = Boolean(editandoId);
      let criado: Comunicado | null = null;
      if (editandoId) await apiPut("/api/comunicados", { id: editandoId, ...corpo });
      else criado = await apiPost("/api/comunicados", corpo);
      fecharFormulario();
      setLeituras({});
      await carregar(false);
      if (eraEdicao) {
        setAviso('Comunicado atualizado. Os e-mails já enviados não são reenviados; para quem ainda não recebeu, use "Continuar envio".');
      } else if (criado?.id) {
        setAviso("Comunicado salvo. Enviando os e-mails...");
        await enviarEmails(criado.id);
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar o comunicado.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(c: Comunicado) {
    if (!window.confirm(`Excluir o comunicado "${c.titulo}"? Ele deixa de aparecer para todos (os e-mails já enviados não podem ser desfeitos).`)) return;
    setErro("");
    setAviso("");
    try {
      await apiDelete(`/api/comunicados?id=${c.id}`);
      setAviso("Comunicado excluído.");
      if (leiturasAbertas === c.id) setLeiturasAbertas(null);
      setLeituras({});
      await carregar(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  }

  async function alternarLeituras(c: Comunicado) {
    if (leiturasAbertas === c.id) {
      setLeiturasAbertas(null);
      return;
    }
    setLeiturasAbertas(c.id);
    if (leituras[c.id]) return;
    setCarregandoLeituras(true);
    try {
      const r: Leituras = await apiGet(`/api/comunicados/leituras?id=${c.id}`);
      setLeituras((antes) => ({ ...antes, [c.id]: r }));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível ver o acompanhamento.");
      setLeiturasAbertas(null);
    } finally {
      setCarregandoLeituras(false);
    }
  }

  const descricao = podeEnviar
    ? "Envie avisos para coordenadores, equipe de apoio e secretários de educação. Todos recebem por e-mail; coordenadores e equipe de apoio também veem aqui no sistema."
    : "Avisos da coordenação do projeto. O que for novo aparece marcado.";

  const progresso = envio && envio.resumo.total > 0 ? Math.round(((envio.resumo.enviados + envio.resumo.erros) / envio.resumo.total) * 100) : 0;

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 sm:p-7">
        <TituloPagina
          descricao={descricao}
          acao={
            <div className="flex items-center gap-3">
              <Indicador
                valor={podeEnviar ? itens?.length ?? 0 : novos.size}
                rotulo={podeEnviar ? "enviados" : novos.size === 1 ? "novo" : "novos"}
                alerta={!podeEnviar && novos.size > 0}
              />
              {podeEnviar && !formAberto && (
                <button
                  onClick={abrirNovo}
                  disabled={Boolean(envio)}
                  className="shrink-0 rounded-xl bg-[#8E5BB5] px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-[#8E5BB5]/25 transition hover:-translate-y-0.5 hover:bg-[#7A4AA0] disabled:opacity-60"
                >
                  + Novo comunicado
                </button>
              )}
            </div>
          }
        >Canal de Comunicação</TituloPagina>

        {envio && (
          <div role="status" className="mt-4 rounded-lg bg-[#FFF1DB] px-4 py-3 text-sm text-[#6B3D00]">
            <p className="font-semibold">
              Enviando e-mails... {envio.resumo.total > 0 && `${envio.resumo.enviados + envio.resumo.erros} de ${envio.resumo.total}`}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70" aria-hidden="true">
              <div className="h-full rounded-full bg-[#C47A00] transition-all" style={{ width: `${progresso}%` }} />
            </div>
            <p className="mt-1.5 text-xs">Não feche esta página até terminar. Se fechar, é só continuar depois pelo botão do comunicado.</p>
          </div>
        )}
        {avisoAtual && !envio && (
          <p
            role="status"
            className={`mt-4 rounded-lg px-4 py-2.5 text-sm font-semibold ${avisoAtual.atencao ? "bg-[#FFF1DB] text-[#6B3D00]" : "bg-[#E3F4EA] text-[#17613B]"}`}
          >
            {avisoAtual.texto}
          </p>
        )}
        {erro && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-semibold text-status-pendente">{erro}</p>}

        {/* Formulário (administrador) */}
        {podeEnviar && formAberto && (
          <form onSubmit={salvar} className="mt-6 rounded-xl border border-black/10 bg-cream/60 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-brand-dark">{editandoId ? "Editar comunicado" : "Novo comunicado"}</h2>
              <button type="button" onClick={fecharFormulario} className="rounded p-1 hover:bg-black/5" aria-label="Fechar">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-brand-dark">Título</span>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={150} placeholder="Ex.: Prazo para envio dos relatórios" className={`${CAMPO} mt-1`} />
              </label>

              <label className="block">
                <span className="flex items-baseline justify-between text-sm font-semibold text-brand-dark">
                  Mensagem
                  <span className="text-xs font-normal text-brand-dark/60">{mensagem.length}/5000</span>
                </span>
                <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} required maxLength={5000} rows={6} placeholder="Escreva o aviso. As quebras de linha são mantidas." className={`${CAMPO} mt-1 resize-y`} />
              </label>

              <fieldset>
                <legend className="text-sm font-semibold text-brand-dark">Para quem enviar <span className="font-normal text-brand-dark/60">(marque um ou mais)</span></legend>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                  {DESTINOS.map((d) => {
                    const ativo = destinos[d.chave];
                    const c = contagem?.[d.contagem];
                    return (
                      <label
                        key={d.chave}
                        className="flex cursor-pointer items-start gap-2.5 rounded-xl border-2 px-3 py-2.5 transition"
                        style={ativo ? { borderColor: d.cor, background: d.fundo } : { borderColor: "rgba(0,0,0,0.08)", background: "#fff" }}
                      >
                        <input
                          type="checkbox"
                          checked={ativo}
                          onChange={(e) => setDestinos((antes) => ({ ...antes, [d.chave]: e.target.checked }))}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold" style={{ color: ativo ? d.cor : "#122E20" }}>{d.titulo}</span>
                          <span className="block text-xs text-brand-dark/70">{d.descricao}</span>
                          {c && (
                            <span className="mt-1 block text-xs font-semibold" style={{ color: d.cor }}>
                              {c.com_email} com e-mail
                              {c.sem_email > 0 && ` (${c.sem_email} sem e-mail)`}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {!algumDestino && <p className="mt-1.5 text-xs font-semibold text-status-pendente">Marque pelo menos um público.</p>}
                {contagem && !contagem.email_configurado && (
                  <p className="mt-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-status-pendente">
                    O envio de e-mail ainda não está configurado no servidor (faltam SMTP_USER e SMTP_PASSWORD). O comunicado será salvo e aparecerá no sistema, mas os e-mails só saem depois de configurar.
                  </p>
                )}
                {destinos.para_secretarios && (
                  <p className="mt-1.5 text-xs text-brand-dark/65">
                    Secretários de educação não entram no sistema (são contatos da ficha de adesão), então não dá para saber se leram. O sistema só registra se o e-mail foi enviado.
                  </p>
                )}
              </fieldset>

              <label className="block">
                <span className="text-sm font-semibold text-brand-dark">Link <span className="font-normal text-brand-dark/60">(opcional)</span></span>
                <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." className={`${CAMPO} mt-1`} />
              </label>

              <label className="flex items-center gap-2 text-sm font-semibold text-brand-dark">
                <input type="checkbox" checked={fixado} onChange={(e) => setFixado(e.target.checked)} className="h-4 w-4 rounded" />
                Fixar no topo da lista (dentro do sistema)
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="submit" disabled={salvando || !algumDestino} className="rounded-xl bg-[#8E5BB5] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-[#8E5BB5]/25 transition hover:bg-[#7A4AA0] disabled:opacity-60">
                {salvando ? "Salvando..." : editandoId ? "Salvar alterações" : "Enviar comunicado"}
              </button>
              <button type="button" onClick={fecharFormulario} className="rounded-xl border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-brand-dark hover:bg-black/[0.03]">
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* Lista */}
        <div className="mt-6 space-y-4">
          {itens === null && <div className="h-28 animate-pulse rounded-xl bg-black/[0.05]" aria-label="Carregando" />}

          {itens !== null && itens.length === 0 && !erro && (
            <p className="rounded-xl border border-dashed border-black/15 px-4 py-10 text-center text-sm text-brand-dark/70">
              {podeEnviar ? "Você ainda não enviou nenhum comunicado. Clique em “Novo comunicado” para começar." : "Nenhum comunicado por enquanto."}
            </p>
          )}

          {itens?.map((c) => {
            const ehNovo = novos.has(c.id);
            const soSecretarios = c.para_secretarios && !c.para_coordenadores && !c.para_apoiadores;
            const corBarra = soSecretarios ? "#8A5200" : "#6B3F94";
            const dados = leituras[c.id];
            const em = c.emails;
            const temLeitura = (c.destinatarios ?? 0) > 0;
            const ocupado = Boolean(envio);
            return (
              <article
                key={c.id}
                className="overflow-hidden rounded-xl border border-black/5 shadow-sm"
                style={{ borderLeft: `5px solid ${corBarra}`, background: ehNovo ? "#F0E8F7" : "#fff" }}
              >
                <div className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {ehNovo && <span className="rounded-full bg-status-pendente px-2.5 py-0.5 text-xs font-bold text-white">Novo</span>}
                    {c.fixado && <span className="rounded-full bg-[#FFF3CC] px-2.5 py-0.5 text-xs font-bold text-[#6E4B00]">📌 Fixado</span>}
                    {podeEnviar &&
                      DESTINOS.filter((d) => c[d.chave]).map((d) => (
                        <span key={d.chave} className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: d.fundo, color: d.cor }}>
                          Para: {d.curto}
                        </span>
                      ))}
                  </div>

                  <div className="mt-1.5 flex items-start justify-between gap-3">
                    <h2 className="text-lg font-bold leading-snug text-brand-dark">{c.titulo}</h2>
                    {podeEnviar && (
                      <div className="flex shrink-0 gap-1">
                        <BotaoEditar onClick={() => abrirEdicao(c)} rotulo="Editar comunicado" />
                        <BotaoExcluir onClick={() => excluir(c)} rotulo="Excluir comunicado" />
                      </div>
                    )}
                  </div>

                  <p className="mt-0.5 text-xs text-brand-dark/65">
                    {c.criado_por_nome ? `${c.criado_por_nome} · ` : ""}
                    {dataHora(c.criado_em)}
                    {c.atualizado_em ? ` · editado em ${dataHora(c.atualizado_em)}` : ""}
                  </p>

                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-brand-dark">{c.mensagem}</p>

                  {c.link && (
                    <a
                      href={c.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-white/80 px-3 py-1.5 text-sm font-semibold text-brand-light ring-1 ring-black/10 hover:bg-white"
                    >
                      <LinkIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate">Abrir link</span>
                    </a>
                  )}
                </div>

                {/* Acompanhamento (administrador) */}
                {podeEnviar && (
                  <div className="space-y-2 border-t border-black/5 bg-black/[0.02] px-4 py-2.5 sm:px-5">
                    {temLeitura && (
                      <p className="text-sm text-brand-dark/80">
                        Lido no sistema por <strong>{c.lidos ?? 0}</strong> de <strong>{c.destinatarios ?? 0}</strong>
                        {(c.destinatarios ?? 0) > 0 && <> ({Math.round(((c.lidos ?? 0) / (c.destinatarios ?? 1)) * 100)}%)</>}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-brand-dark/80">
                        E-mails:{" "}
                        {em && em.total > 0 ? (
                          <>
                            <strong>{em.enviados}</strong> enviado(s) de <strong>{em.total}</strong>
                            {em.erros > 0 && <span className="font-semibold text-status-pendente"> · {em.erros} com erro</span>}
                            {em.pendentes > 0 && <span className="font-semibold text-[#8A5200]"> · {em.pendentes} pendente(s)</span>}
                          </>
                        ) : (
                          <span className="font-semibold text-[#8A5200]">ainda não enviados</span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {(!em || em.total === 0 || em.pendentes > 0) && (
                          <button disabled={ocupado} onClick={() => enviarEmails(c.id)} className="text-sm font-semibold text-[#8A5200] hover:underline disabled:opacity-50">
                            {em && em.total > 0 ? "Continuar envio" : "Enviar e-mails agora"}
                          </button>
                        )}
                        {em && em.erros > 0 && (
                          <button disabled={ocupado} onClick={() => enviarEmails(c.id, true)} className="text-sm font-semibold text-status-pendente hover:underline disabled:opacity-50">
                            Reenviar os que falharam
                          </button>
                        )}
                      </div>
                    </div>

                    {(temLeitura || (em && em.total > 0)) && (
                      <button onClick={() => alternarLeituras(c)} className="text-sm font-semibold text-brand-light hover:underline">
                        {leiturasAbertas === c.id ? "Esconder detalhes" : "Ver detalhes (quem leu / e-mails)"}
                      </button>
                    )}

                    {leiturasAbertas === c.id && (
                      <div className="space-y-3">
                        {carregandoLeituras && !dados && <p className="text-sm text-brand-dark/70">Carregando...</p>}

                        {dados && dados.pessoas.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-dark/60">Leitura dentro do sistema</p>
                            <ul className="max-h-72 divide-y divide-black/5 overflow-y-auto rounded-lg border border-black/5 bg-white text-sm">
                              {dados.pessoas.map((p, i) => (
                                <li key={`${p.nome}-${i}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                                  <span className="min-w-0">
                                    <span className="font-semibold text-brand-dark">{p.nome}</span>
                                    <span className="text-brand-dark/65">
                                      {" · "}
                                      {p.municipio ? p.municipio : p.role ? ROTULO_PAPEL[p.role] : ""}
                                    </span>
                                  </span>
                                  {p.lido ? (
                                    <span className="text-xs font-semibold text-[#17613B]">✓ Leu em {dataHora(p.lido_em)}</span>
                                  ) : (
                                    <span className="text-xs font-semibold text-status-pendente">Ainda não leu</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {dados && dados.emails.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-dark/60">E-mails</p>
                            <ul className="max-h-72 divide-y divide-black/5 overflow-y-auto rounded-lg border border-black/5 bg-white text-sm">
                              {dados.emails.map((s, i) => (
                                <li key={`${s.email}-${i}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                                  <span className="min-w-0">
                                    <span className="font-semibold text-brand-dark">{s.nome || ROTULO_TIPO_EMAIL[s.tipo]}</span>
                                    <span className="text-brand-dark/65">
                                      {" · "}{ROTULO_TIPO_EMAIL[s.tipo]}{s.municipio ? ` · ${s.municipio}` : ""} · {s.email}
                                    </span>
                                  </span>
                                  {s.status === "enviado" && <span className="text-xs font-semibold text-[#17613B]">✓ Enviado em {dataHora(s.enviado_em)}</span>}
                                  {s.status === "pendente" && <span className="text-xs font-semibold text-[#8A5200]">Pendente</span>}
                                  {s.status === "erro" && (
                                    <span className="text-xs font-semibold text-status-pendente" title={s.erro ?? undefined}>
                                      ⚠ Não enviou{s.erro ? `: ${s.erro.slice(0, 60)}` : ""}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
