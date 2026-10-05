"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

type Signatario = { papel: string; nome: string; email: string; assinado_em?: string | null; convite_enviado_em?: string | null };
type Pedido = {
  id: string; status: "pendente" | "concluido" | "cancelado"; criado_em: string; concluido_em?: string | null;
  atualizado: boolean; todos_assinaram: boolean; signatarios: Signatario[];
};
type Estado = {
  configurado: boolean; papeis_ativos?: string[]; pedido: Pedido | null;
  sugestoes: Record<string, { nome?: string; email?: string }>;
};

const ROTULO: Record<string, string> = {
  prefeito: "Prefeito(a) Municipal",
  secretario: "Secretário(a) de Educação",
  sindicato: "Presidente do Sindicato Rural",
  coordenador: "Coordenador(a) do Projeto",
};

// guarda no navegador que o termo foi aberto: se a nova aba for bloqueada e a tela inteira for para o termo,
// ao voltar o passo 1 continua cumprido
const CHAVE_TERMO_ABERTO = "valores_termo_aberto_para_assinatura";

const CAMPO =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 disabled:bg-black/[0.03]";
const ROTULO_CAMPO = "mb-1 block text-sm font-medium text-brand-dark";

// Bloco da etapa "Termo assinado": envia o termo por e-mail para os 3 assinarem e acompanha quem já assinou.
export function AssinaturaEmail({
  prefeitoNome, prefeitoEmail, secretarioNome, secretarioEmail, coordenadorNome, coordenadorEmail, pronto, motivoBloqueio, somenteLeitura, salvarAntes, onConcluido,
  abrirTermo, abrindoTermo, declaracao, onDeclaracao,
}: {
  prefeitoNome: string; prefeitoEmail: string; secretarioNome: string; secretarioEmail: string; coordenadorNome: string; coordenadorEmail: string;
  pronto: boolean; motivoBloqueio?: string; somenteLeitura: boolean;
  salvarAntes: () => Promise<void>; onConcluido: () => void;
  abrirTermo: () => Promise<boolean>; abrindoTermo: boolean;
  declaracao: boolean; onDeclaracao: (aceita: boolean) => void;
}) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [emailPrefeito, setEmailPrefeito] = useState(prefeitoEmail);
  const [emailSecretario, setEmailSecretario] = useState(secretarioEmail);
  const [sindNome, setSindNome] = useState("");
  const [sindEmail, setSindEmail] = useState("");
  const [corrigindo, setCorrigindo] = useState<{ papel: string; email: string } | null>(null);
  const [refazendo, setRefazendo] = useState(false);
  const [abriuTermo, setAbriuTermo] = useState(false); // só libera o envio depois de abrir o termo
  const conferiu = declaracao;                          // e de o coordenador marcar a declaração de veracidade
  const setConferiu = onDeclaracao;

  const carregar = useCallback(async (silencioso = false) => {
    try {
      const r: Estado = await apiGet("/api/adesao/assinaturas");
      setEstado(r);
      return r;
    } catch (e: any) {
      // na atualização automática, uma falha passageira (ex.: o servidor reiniciou) não deve assustar: tenta de novo depois
      if (!silencioso) setErro(e.message);
      return null;
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    try { if (sessionStorage.getItem(CHAVE_TERMO_ABERTO) === "1") setAbriuTermo(true); } catch { /* sem sessionStorage: segue normal */ }
  }, []);

  // preenche o formulário com o que foi digitado antes (ou com o e-mail da prefeitura da ficha)
  useEffect(() => {
    if (!estado) return;
    const s = estado.sugestoes;
    setEmailPrefeito((atual) => atual || s.prefeito?.email || prefeitoEmail || "");
    setSindNome((atual) => atual || s.sindicato?.nome || "");
    setEmailSecretario((atual) => atual || s.secretario?.email || secretarioEmail || "");
    setSindEmail((atual) => atual || s.sindicato?.email || "");
  }, [estado, prefeitoEmail, secretarioEmail]);

  const pedido = estado?.pedido ?? null;
  const emAndamento = pedido?.status === "pendente";
  const concluido = pedido?.status === "concluido";

  // um pedido ativo só existe porque a declaração foi marcada antes do envio: mantém marcada ao reabrir a ficha
  useEffect(() => {
    if (pedido && pedido.status !== "cancelado" && pedido.atualizado) onDeclaracao(true);
  }, [pedido?.id, pedido?.status, pedido?.atualizado]); // eslint-disable-line react-hooks/exhaustive-deps

  // enquanto há assinaturas pendentes, confere sozinho a cada 15 s; quando conclui, avisa a ficha
  useEffect(() => {
    if (!emAndamento) return;
    const id = setInterval(async () => {
      if (document.hidden) return;
      const r = await carregar(true);
      if (r?.pedido?.status === "concluido") onConcluido();
    }, 15000);
    return () => clearInterval(id);
  }, [emAndamento, carregar, onConcluido]);

  async function agir(fn: () => Promise<any>, ok?: string) {
    setErro(null); setMensagem(null); setOcupado(true);
    try {
      const r = await fn();
      if (r?.pedido) setEstado((e) => (e ? { ...e, pedido: r.pedido } : e));
      else await carregar();
      if (ok) setMensagem(ok);
      return r;
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  }

  async function enviar() {
    await agir(async () => {
      await salvarAntes(); // o termo é montado a partir da ficha salva
      const r = await apiPost("/api/adesao/assinaturas/enviar", {
        prefeito_email: emailPrefeito, secretario_email: emailSecretario, sindicato_nome: sindNome, sindicato_email: sindEmail,
      });
      if (r.falhas?.length) {
        setErro(`Não consegui enviar para: ${r.falhas.map((f: any) => f.email).join(", ")}. ${r.falhas[0]?.motivo ?? ""} Confira o endereço e use "Reenviar".`);
      } else {
        setMensagem(sosCoordenador ? "E-mail enviado! Abra a sua caixa de entrada, leia o termo e assine pelo link." : "E-mails enviados! Cada pessoa vai receber um link para ler e assinar o termo.");
      }
      setRefazendo(false);
      setAbriuTermo(false);
      try { sessionStorage.removeItem(CHAVE_TERMO_ABERTO); } catch { /* ignora */ }
      return r;
    });
  }

  async function abrirEConferir() {
    setConferiu(false);
    try { sessionStorage.setItem(CHAVE_TERMO_ABERTO, "1"); } catch { /* ignora */ }
    const ok = await abrirTermo(); // se a página for para o termo, o passo 1 já fica registrado acima
    if (ok) {
      setAbriuTermo(true);
    } else {
      try { sessionStorage.removeItem(CHAVE_TERMO_ABERTO); } catch { /* ignora */ }
    }
  }

  async function reenviar(papel: string, email?: string) {
    await agir(async () => {
      const r = await apiPost("/api/adesao/assinaturas/reenviar", { papel, email });
      setCorrigindo(null);
      return r;
    }, "E-mail reenviado com um novo link.");
  }

  async function cancelar() {
    if (!confirm("Cancelar este pedido? Os links já enviados deixam de funcionar e as assinaturas feitas até agora serão perdidas.")) return;
    await agir(() => apiPost("/api/adesao/assinaturas/cancelar", {}), "Pedido cancelado. Você pode enviar de novo.");
  }

  async function concluir() {
    const r = await agir(() => apiPost("/api/adesao/assinaturas/finalizar", {}));
    if (r?.pedido?.status === "concluido") onConcluido();
  }

  if (!estado && erro) {
    return (
      <div className="rounded-xl border border-[#8A2A00]/20 bg-[#FFE8D9] p-4 text-sm text-[#8A2A00]">
        <p className="font-semibold">Não foi possível carregar a assinatura por e-mail.</p>
        <p className="mt-1">{erro}</p>
        <p className="mt-1 text-xs">Se aparecer algo como "relation ... does not exist" ou "schema cache", falta rodar o arquivo <code>sql/migration_assinatura_email.sql</code> no Supabase.</p>
        <button type="button" onClick={() => { setErro(null); carregar(); }} className="mt-2 rounded-lg border border-[#8A2A00]/40 px-3 py-1.5 text-xs font-semibold hover:bg-white/50">Tentar de novo</button>
      </div>
    );
  }
  if (!estado) return <div className="rounded-xl border border-black/5 bg-black/[0.02] p-4 text-sm text-brand-dark/70">Carregando assinaturas...</div>;

  const ativos = estado.papeis_ativos ?? ["prefeito", "secretario", "sindicato", "coordenador"];
  const pedePrefeito = ativos.includes("prefeito");
  const pedeSecretario = ativos.includes("secretario");
  const pedeSindicato = ativos.includes("sindicato");
  const sosCoordenador = !pedePrefeito && !pedeSecretario && !pedeSindicato;
  const camposOk = (!pedePrefeito || Boolean(emailPrefeito)) && (!pedeSecretario || Boolean(emailSecretario))
    && (!pedeSindicato || Boolean(sindNome && sindEmail));
  const outrosRotulos = [pedePrefeito && "prefeito(a)", pedeSecretario && "secretário(a) de educação", pedeSindicato && "presidente do sindicato"].filter(Boolean) as string[];

  const mostrarFormulario = !somenteLeitura && (!pedido || pedido.status === "cancelado" || refazendo || (concluido && !pedido.atualizado));

  return (
    <div className="rounded-xl border-2 border-brand-light/40 bg-white p-4">
      <h3 className="text-base font-bold text-brand-dark">Assinar por e-mail <span className="ml-1 rounded-full bg-brand-light px-2 py-0.5 align-middle text-[11px] font-semibold text-white">recomendado</span></h3>
      <p className="mt-0.5 text-sm text-brand-dark/75">
        {sosCoordenador ? (
          <>
            Você, coordenador(a), recebe um link no seu e-mail, lê o termo e assina. Quando você assinar, o PDF assinado é guardado automaticamente — não precisa anexar nada.
            As assinaturas do(a) prefeito(a), do(a) secretário(a) de educação e do(a) presidente do sindicato serão liberadas por e-mail em uma próxima etapa.
          </>
        ) : (
          <>
            {outrosRotulos.join(", ")} e coordenador(a) recebem um link no próprio e-mail, leem o termo e assinam.
            Quando todos assinarem, o PDF assinado é guardado automaticamente — você não precisa anexar nada.
          </>
        )}
      </p>

      {!estado.configurado && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          O envio de e-mail ainda não foi configurado no sistema. Fale com o administrador ou use a opção de assinar fora do sistema, mais abaixo.
        </div>
      )}
      {erro && <div className="mt-3 rounded-lg bg-[#FFE8D9] px-3 py-2 text-sm font-semibold text-[#8A2A00]">{erro}</div>}
      {mensagem && <div className="mt-3 rounded-lg bg-[#E2EFFB] px-3 py-2 text-sm font-semibold text-[#0F4C85]">{mensagem}</div>}

      {pedido && pedido.status !== "cancelado" && (
        <div className="mt-3 space-y-2">
          {concluido && pedido.atualizado && (
            <div className="rounded-lg bg-[#E3F4EA] px-3 py-2 text-sm font-semibold text-[#17613B]">
              ✅ Todas as assinaturas foram concluídas e o termo assinado já está anexado à adesão.
            </div>
          )}
          {concluido && !pedido.atualizado && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              ⚠️ Você alterou dados ou escolas depois das assinaturas, então elas não valem mais. Envie o termo para assinatura de novo.
            </div>
          )}
          {emAndamento && !pedido.atualizado && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              ⚠️ A ficha foi alterada depois do envio. As pessoas estão assinando a versão antiga; cancele e envie de novo para que assinem os dados atuais.
            </div>
          )}
          {emAndamento && pedido.todos_assinaram && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Todos já assinaram, mas o PDF final ainda não foi guardado.{" "}
              <button type="button" onClick={concluir} disabled={ocupado} className="font-semibold underline">Concluir agora</button>
            </div>
          )}

          <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
            {pedido.signatarios.map((s) => (
              <li key={s.papel} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-brand-dark">{s.nome} <span className="font-normal text-brand-dark/60">· {ROTULO[s.papel]}</span></p>
                  <p className="truncate text-xs text-brand-dark/70">{s.email}</p>
                </div>
                {s.assinado_em ? (
                  <span className="rounded-full bg-[#E3F4EA] px-3 py-1 text-xs font-semibold text-[#17613B]">
                    ✓ Assinou em {new Date(s.assinado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                ) : emAndamento && !somenteLeitura ? (
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[#EFEDE4] px-3 py-1 text-xs font-semibold text-[#4A453A]">Aguardando</span>
                    <button type="button" disabled={ocupado} onClick={() => reenviar(s.papel)} className="text-xs font-semibold text-brand-light underline disabled:opacity-50">Reenviar</button>
                    <button type="button" disabled={ocupado} onClick={() => setCorrigindo({ papel: s.papel, email: s.email })} className="text-xs font-semibold text-brand-dark/70 underline disabled:opacity-50">Trocar e-mail</button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          {corrigindo && (
            <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-3 sm:flex-row sm:items-end">
              <label className="flex-1">
                <span className={ROTULO_CAMPO}>Novo e-mail de {ROTULO[corrigindo.papel]}</span>
                <input type="email" value={corrigindo.email} onChange={(e) => setCorrigindo({ ...corrigindo, email: e.target.value })} className={CAMPO} />
              </label>
              <div className="flex gap-2">
                <button type="button" disabled={ocupado} onClick={() => reenviar(corrigindo.papel, corrigindo.email)}
                  className="rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-white hover:bg-brand-accent disabled:opacity-50">Salvar e reenviar</button>
                <button type="button" onClick={() => setCorrigindo(null)} className="rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold text-brand-dark hover:bg-black/5">Cancelar</button>
              </div>
            </div>
          )}

          {!somenteLeitura && (
            <div className="flex flex-wrap gap-3 pt-1 text-xs">
              {emAndamento && <button type="button" disabled={ocupado} onClick={cancelar} className="font-semibold text-[#8A2A00] underline disabled:opacity-50">Cancelar pedido</button>}
              {concluido && pedido.atualizado && (
                <button type="button" onClick={() => setRefazendo(true)} className="font-semibold text-brand-dark/70 underline">Enviar para assinatura de novo</button>
              )}
              {emAndamento && <span className="text-brand-dark/60">Esta lista se atualiza sozinha.</span>}
            </div>
          )}
        </div>
      )}

      {mostrarFormulario && (
        <div className="mt-4 space-y-4">
          {/* Passo 1: conferir o termo */}
          <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
            <h4 className="text-sm font-bold text-brand-dark">
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-light text-[11px] text-white">1</span>
              Abra o termo, confira e declare
            </h4>
            <p className="mt-1 text-sm text-brand-dark/75">
              O termo é montado com o que você preencheu. Confira município, prefeito(a), secretaria e escolas: depois que as pessoas assinarem, qualquer mudança exige assinar de novo.
            </p>
            <button type="button" onClick={abrirEConferir} disabled={abrindoTermo || ocupado || !pronto}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-accent disabled:opacity-50">
              {abrindoTermo ? "Abrindo..." : abriuTermo ? "Abrir o termo de novo" : "Abrir termo para conferir"}
            </button>
            {!pronto && motivoBloqueio && <p className="mt-2 text-xs text-brand-dark/75">{motivoBloqueio}</p>}
            <label className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm ${abriuTermo ? "border-brand-light/40 bg-white text-brand-dark" : "border-black/5 text-brand-dark/40"}`}>
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" disabled={!abriuTermo} checked={conferiu} onChange={(e) => setConferiu(e.target.checked)} />
              <span>
                Abri o termo, conferi os dados e <strong>declaro que as informações são verdadeiras</strong>, estando ciente de que os dados informados serão utilizados
                para os fins do Projeto Valores, nos termos da cláusula "Da veracidade e do uso dos dados" do Termo de Adesão.
              </span>
            </label>
            {!abriuTermo && <p className="mt-1 text-xs text-brand-dark/60">Esta declaração é liberada depois que você clicar em "Abrir termo para conferir" e o termo abrir.</p>}
          </div>

          {/* Passo 2: e-mails de quem vai assinar */}
          <div className={`rounded-lg border border-black/10 p-4 ${conferiu ? "bg-white" : "bg-black/[0.02] opacity-60"}`}>
            <h4 className="text-sm font-bold text-brand-dark">
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-light text-[11px] text-white">2</span>
              {sosCoordenador ? "Envie o termo para o seu e-mail" : "Informe quem vai assinar e envie"}
            </h4>
            <fieldset disabled={!conferiu} className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {pedePrefeito && (
                  <label className="sm:col-span-2">
                    <span className={ROTULO_CAMPO}>E-mail de {prefeitoNome ? <strong>{prefeitoNome}</strong> : "Prefeito(a)"} <span className="font-normal text-brand-dark/60">(Prefeito(a))</span></span>
                    <input type="email" value={emailPrefeito} onChange={(e) => setEmailPrefeito(e.target.value)} className={CAMPO} placeholder="email do(a) prefeito(a)" />
                  </label>
                )}
                {pedeSecretario && (
                  <label className="sm:col-span-2">
                    <span className={ROTULO_CAMPO}>E-mail de {secretarioNome ? <strong>{secretarioNome}</strong> : "Secretário(a) de Educação"} <span className="font-normal text-brand-dark/60">(Secretário(a) de Educação)</span></span>
                    <input type="email" value={emailSecretario} onChange={(e) => setEmailSecretario(e.target.value)} className={CAMPO} placeholder="email do(a) secretário(a) de educação" />
                  </label>
                )}
                {pedeSindicato && (
                  <>
                    <label>
                      <span className={ROTULO_CAMPO}>Nome do(a) presidente do sindicato rural</span>
                      <input value={sindNome} onChange={(e) => setSindNome(e.target.value)} className={CAMPO} />
                    </label>
                    <label>
                      <span className={ROTULO_CAMPO}>E-mail do(a) presidente do sindicato</span>
                      <input type="email" value={sindEmail} onChange={(e) => setSindEmail(e.target.value)} className={CAMPO} />
                    </label>
                  </>
                )}
                <p className="text-xs text-brand-dark/70 sm:col-span-2">
                  {sosCoordenador ? "O link será enviado para " : "Coordenador(a): "}<strong>{coordenadorNome || "você"}</strong>
                  {sosCoordenador ? " no e-mail do seu cadastro" : ", no e-mail do seu cadastro"}{coordenadorEmail ? ` (${coordenadorEmail})` : ""}.
                  {!sosCoordenador && " Cada pessoa precisa de um e-mail diferente."}
                </p>
              </div>
              <button type="button" onClick={enviar} disabled={ocupado || !conferiu || !pronto || !estado.configurado || !camposOk}
                className="rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-accent disabled:opacity-50">
                {ocupado ? "Enviando..." : sosCoordenador ? "Enviar o termo para o meu e-mail" : "Enviar para assinatura por e-mail"}
              </button>
            </fieldset>
            {!conferiu && <p className="mt-2 text-xs text-brand-dark/60">Libera depois de abrir o termo e marcar a declaração do passo 1.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
