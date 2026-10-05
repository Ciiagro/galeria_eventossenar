"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { TermoConteudo, type AssinaturaTermo } from "@/components/TermoDocumento";

// Página PÚBLICA de assinatura: quem assina não tem login, o link único do e-mail é a credencial.
// Passo 1: ler o termo. Passo 2: pedir o código (chega no mesmo e-mail). Passo 3: informar o código e assinar.

type Info = {
  papel: string; papel_rotulo: string; nome: string; email_mascarado: string;
  assinado_em?: string | null; pedido_status: "pendente" | "concluido" | "cancelado";
  termo: Record<string, any>; assinaturas: AssinaturaTermo[];
};

async function chamar(caminho: string, corpo?: unknown) {
  const res = await fetch(API_BASE + caminho, corpo === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`);
  return json;
}

const CAMPO =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-base text-[#2A2620] focus:outline-none focus:border-[#2F6B4F] focus:ring-4 focus:ring-[#2F6B4F]/15";

export default function AssinarPage() {
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [erroFatal, setErroFatal] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [aceito, setAceito] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [feito, setFeito] = useState<{ concluido: boolean } | null>(null);
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    setToken(t);
    if (!t) { setErroFatal("Link incompleto. Abra o link exatamente como veio no e-mail."); return; }
    chamar(`/api/assinar/info?t=${encodeURIComponent(t)}`).then(setInfo).catch((e) => setErroFatal(e.message));
  }, []);

  async function pedirCodigo() {
    if (!token) return;
    setErro(null); setAviso(null); setOcupado(true);
    try {
      const r = await chamar("/api/assinar/codigo", { t: token });
      setCodigoEnviado(true);
      setAviso(`Enviamos um código de 6 dígitos para ${r.email_mascarado}. Ele vale por ${r.validade_minutos} minutos.`);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  }

  async function assinar() {
    if (!token) return;
    setErro(null); setAviso(null); setOcupado(true);
    try {
      const r = await chamar("/api/assinar/confirmar", { t: token, codigo, aceito });
      setFeito({ concluido: Boolean(r.concluido) });
      const atual = await chamar(`/api/assinar/info?t=${encodeURIComponent(token)}`);
      setInfo(atual);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  }

  if (erroFatal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#EDEAE0] p-6">
        <div className="max-w-md rounded-2xl bg-white p-7 text-center shadow-lg">
          <img src="/logo-senar-termo.png" alt="SENAR" className="mx-auto mb-4 h-10 w-auto" />
          <h1 className="text-lg font-bold text-[#1E4632]">Não foi possível abrir o termo</h1>
          <p className="mt-2 text-sm text-[#4A453A]">{erroFatal}</p>
        </div>
      </div>
    );
  }
  if (!info) return <div className="p-8 text-sm text-[#4A453A]">Carregando termo...</div>;

  const jaAssinou = Boolean(info.assinado_em);
  const faltam = info.assinaturas.filter((x) => !x.assinado_em).length;
  const podeAssinar = codigo.length === 6 && aceito && !ocupado;

  return (
    <div className="min-h-screen bg-[#EDEAE0] py-4 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 16mm 14mm; } @media print { html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>

      <div ref={painel} className="mx-auto mb-3 w-full max-w-[210mm] px-3 print:hidden">
        {jaAssinou ? (
          <div className="rounded-xl border border-[#17613B]/20 bg-[#E3F4EA] px-5 py-4 text-[#17613B]">
            <p className="text-base font-bold">✓ Você assinou este termo{feito ? " agora" : ""}.</p>
            <p className="mt-1 text-sm">
              Assinatura registrada em {new Date(info.assinado_em!).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.{" "}
              {info.pedido_status === "concluido"
                ? "Todas as assinaturas foram concluídas; o PDF assinado foi enviado por e-mail para quem assinou."
                : faltam > 0
                  ? `Ainda ${faltam === 1 ? "falta 1 assinatura" : `faltam ${faltam} assinaturas`}. Você receberá o PDF final por e-mail quando todos assinarem.`
                  : "Estamos finalizando o documento; o PDF final chegará por e-mail."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-black/10 bg-white px-5 py-4 shadow-sm">
            <h1 className="text-lg font-bold text-[#1E4632]">Olá, {info.nome}</h1>
            <p className="mt-1 text-sm text-[#4A453A]">
              Leia o termo abaixo. Para assinar como <strong>{info.papel_rotulo}</strong>, use a área “Assinar” no final desta página.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">
              {info.assinaturas.map((s) => (
                <li key={s.papel} className={`rounded-full px-3 py-1 font-semibold ${s.assinado_em ? "bg-[#E3F4EA] text-[#17613B]" : "bg-[#EFEDE4] text-[#4A453A]"}`}>
                  {s.assinado_em ? "✓ " : "… "}{s.nome}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <TermoConteudo a={info.termo as any} assinaturas={info.assinaturas} />

      {!jaAssinou && (
        <section className="mx-auto mt-4 w-full max-w-[210mm] px-3 pb-10 print:hidden">
          <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#1E4632]">Assinar</h2>

            {erro && <div className="mt-3 rounded-lg bg-[#FFE8D9] px-3 py-2 text-sm font-semibold text-[#8A2A00]">{erro}</div>}
            {aviso && <div className="mt-3 rounded-lg bg-[#E2EFFB] px-3 py-2 text-sm font-semibold text-[#0F4C85]">{aviso}</div>}

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-[#2A2620]">Confirme que é você</p>
                <p className="mt-0.5 text-sm text-[#4A453A]">Vamos enviar um código de 6 dígitos para <strong>{info.email_mascarado}</strong>.</p>
                <button type="button" onClick={pedirCodigo} disabled={ocupado}
                  className="mt-2 rounded-lg border border-[#2F6B4F] px-4 py-2 text-sm font-semibold text-[#2F6B4F] hover:bg-[#2F6B4F]/5 disabled:opacity-50">
                  {codigoEnviado ? "Enviar outro código" : "Enviar código para o meu e-mail"}
                </button>
              </div>

              {codigoEnviado && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-[#2A2620]">Código recebido</span>
                    <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo}
                      onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className={`${CAMPO} max-w-[12rem] text-center font-mono text-xl tracking-[0.4em]`} placeholder="000000" />
                  </label>
                  <label className="flex items-start gap-2 text-sm text-[#2A2620]">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={aceito} onChange={(e) => setAceito(e.target.checked)} />
                    <span>Eu, <strong>{info.nome}</strong>, li o Termo de Adesão acima, concordo com o seu conteúdo e assino eletronicamente como <strong>{info.papel_rotulo}</strong>.</span>
                  </label>
                  <button type="button" onClick={assinar} disabled={!podeAssinar}
                    className="rounded-lg bg-[#2F6B4F] px-6 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-[#1E4632] disabled:opacity-50">
                    {ocupado ? "Assinando..." : "Assinar termo"}
                  </button>
                  <p className="text-xs text-[#6E6555]">
                    Ficam registrados a data, a hora, o endereço IP e o navegador desta assinatura, que é uma assinatura eletrônica simples (Lei nº 14.063/2020).
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
