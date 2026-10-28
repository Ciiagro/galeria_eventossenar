"use client";

import { useEffect, useState } from "react";
import { apiAbrirArquivo, apiGetCache, apiPost, esquecerCacheApiPor } from "@/lib/api";
import { mascaraCpf } from "@/lib/mascaras";
import { FileTextIcon } from "@/components/icons";

type Texto = { titulo: string; identificacao: [string, string][]; paragrafos: [string, boolean][][]; municipio?: string; escolas?: string[] };
type Estado = {
  sem_edicao: boolean; texto?: Texto; precisa_cpf?: boolean; email_mascarado?: string; assinado?: boolean; assinado_em?: string | null; nome?: string;
};

const CAMPO = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30";

// Termo de compromisso do(a) coordenador(a): lê o texto, pede o código por e-mail e assina.
export function TermoCompromisso({ onMudou }: { onMudou?: (assinado: boolean) => void }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [codigoEnviado, setCodigoEnviado] = useState<string | null>(null); // e-mail mascarado
  const [codigo, setCodigo] = useState("");
  const [cpf, setCpf] = useState("");
  const [aceito, setAceito] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function carregar(novo = false) {
    setErro(null);
    if (novo) esquecerCacheApiPor("/api/compromisso");
    try {
      const r: Estado = await Promise.race([
        apiGetCache("/api/compromisso", 20_000),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("O termo está demorando para carregar.")), 20000)),
      ]);
      setEstado(r);
      onMudou?.(Boolean(r.assinado));
    } catch (e: any) {
      setErro(e.message);
    }
  }
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function pedirCodigo() {
    setErro(null); setMsg(null); setOcupado(true);
    try {
      const r = await apiPost("/api/compromisso/codigo", {});
      setCodigoEnviado(r.email_mascarado);
      if (r.codigo_teste) setCodigo(String(r.codigo_teste));
      setMsg(r.codigo_teste ? `MODO TESTE: o código ${r.codigo_teste} já foi preenchido para você (nenhum e-mail foi enviado).` : `Enviei um código de 6 dígitos para ${r.email_mascarado}. Ele vale por ${r.validade_minutos} minutos.`);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  }

  async function assinar() {
    setErro(null); setMsg(null);
    if (codigo.replace(/\D/g, "").length !== 6) return setErro("Digite o código de 6 dígitos que chegou no seu e-mail.");
    if (!aceito) return setErro("Marque a declaração de que leu e concorda com o termo.");
    setOcupado(true);
    try {
      const r = await apiPost("/api/compromisso/assinar", { codigo, aceito: true, ...(estado?.precisa_cpf ? { cpf } : {}) });
      setMsg(r.aviso ?? "Termo assinado. Obrigado!");
      await carregar(true);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  }

  async function verPdf() {
    setErro(null);
    try { await apiAbrirArquivo("/api/compromisso/arquivo"); } catch (e: any) { setErro(e.message); }
  }

  if (!estado) {
    return erro ? (
      <div className="space-y-3 text-sm text-brand-dark/80">
        <p>{erro}</p>
        <button type="button" onClick={() => carregar(true)} className="rounded-lg bg-brand-light px-4 py-2 font-semibold text-white hover:bg-brand-accent">Tentar de novo</button>
      </div>
    ) : <p className="text-sm text-brand-dark/75">Carregando...</p>;
  }
  if (estado.sem_edicao || !estado.texto) {
    return <div className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/75">Não há edição ativa no momento. Fale com o administrador.</div>;
  }
  const t = estado.texto;

  return (
    <div className="space-y-4">
      <article className="rounded-2xl border border-black/10 bg-[#FBFAF3] p-5">
        <div className="flex items-center justify-between gap-4 border-b-2 border-brand-light pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-valores-termo.png" alt="Projeto Valores — Brincando e cultivando os valores humanos" width={298} height={136} className="h-10 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-senar-termo.png" alt="SENAR" width={370} height={140} className="h-12 w-auto" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-brand-dark">{t.titulo}</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-1 rounded-lg border border-black/5 bg-white p-3 text-sm sm:grid-cols-2">
          {t.identificacao.map(([rotulo, valor]) => (
            <div key={rotulo}><dt className="inline font-bold text-brand-dark">{rotulo}: </dt><dd className="inline text-brand-dark/90">{valor}</dd></div>
          ))}
        </dl>
        {t.escolas && t.escolas.length > 0 ? (
          <div className="mt-3 rounded-lg border border-black/5 bg-[#F3FAF6] p-3 text-sm">
            <p className="font-bold text-brand-dark">Escolas sob a sua coordenação ({t.escolas.length})</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-brand-dark/90 sm:columns-2">
              {t.escolas.map((nome) => <li key={nome}>{nome}</li>)}
            </ol>
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-[#FFF3CC] px-3 py-2 text-sm text-[#6E4B00]">As escolas aparecem aqui depois que você marcá-las na ficha de adesão (aba 4 · Escolas) e salvar o rascunho.</p>
        )}
        <div className="mt-4 space-y-3 text-justify text-sm leading-relaxed text-brand-dark">
          {t.paragrafos.map((par, i) => (
            <p key={i}>{par.map(([texto, negrito], k) => (negrito ? <strong key={k}>{texto}</strong> : <span key={k}>{texto}</span>))}</p>
          ))}
        </div>
      </article>

      {erro && <div className="rounded-lg bg-status-pendente/10 px-4 py-2.5 text-sm text-status-pendente" role="alert">{erro}</div>}
      {msg && <div className="rounded-lg bg-status-completo/10 px-4 py-2.5 text-sm font-medium text-status-completo">{msg}</div>}

      {estado.assinado ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#E3F4EA] px-4 py-3 text-sm text-[#17613B]">
          <span>✅ Termo assinado{estado.assinado_em ? ` em ${new Date(estado.assinado_em).toLocaleDateString("pt-BR")}` : ""}.</span>
          <button type="button" onClick={verPdf} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-light px-3 py-1.5 font-semibold text-white hover:bg-brand-accent">
            <FileTextIcon className="h-4 w-4" /> Ver termo assinado (PDF)
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-black/10 bg-white p-4">
          <h3 className="text-base font-bold text-brand-dark">Assinar</h3>
          <ol className="space-y-3 text-sm text-brand-dark">
            <li>
              <strong>1.</strong> Peça o código de confirmação. Ele chega no e-mail {estado.email_mascarado ? <strong>{estado.email_mascarado}</strong> : "do seu cadastro"}.
              <div className="mt-2">
                <button type="button" disabled={ocupado} onClick={pedirCodigo}
                  className="rounded-lg border border-brand-light px-4 py-2 font-semibold text-brand-light hover:bg-brand-light/5 disabled:opacity-50">
                  {codigoEnviado ? "Enviar um novo código" : "Enviar código para o meu e-mail"}
                </button>
              </div>
            </li>
            <li>
              <strong>2.</strong> Digite o código{estado.precisa_cpf ? " e o seu CPF" : ""}, leia o termo acima e confirme.
              <div className="mt-2 grid gap-2 sm:max-w-md sm:grid-cols-2">
                <input inputMode="numeric" maxLength={6} placeholder="Código de 6 dígitos" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} className={CAMPO} aria-label="Código" />
                {estado.precisa_cpf && (
                  <input inputMode="numeric" placeholder="Seu CPF" value={cpf} onChange={(e) => setCpf(mascaraCpf(e.target.value))} className={CAMPO} aria-label="CPF" />
                )}
              </div>
              <label className="mt-3 flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={aceito} onChange={(e) => setAceito(e.target.checked)} />
                <span>Li o termo de compromisso e concordo com todas as cláusulas.</span>
              </label>
              <button type="button" disabled={ocupado || codigo.replace(/\D/g, "").length !== 6} onClick={assinar}
                className="mt-3 rounded-lg bg-brand-light px-5 py-2 font-semibold text-white shadow-sm hover:bg-brand-accent disabled:opacity-50"
                title={codigo.replace(/\D/g, "").length !== 6 ? "Digite o código de 6 dígitos que chegou no e-mail" : undefined}>
                {ocupado ? "Aguarde..." : "Assinar termo"}
              </button>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
