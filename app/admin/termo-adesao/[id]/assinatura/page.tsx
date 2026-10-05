"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminGuard } from "@/components/AdminGuard";
import { TermoConteudo } from "@/components/TermoDocumento";
import { apiGet } from "@/lib/api";

type Assinatura = {
  papel: string; nome: string; email: string; assinado_em?: string | null;
  assinado_nome_digitado?: string | null; ip?: string | null;
};
type Resposta = {
  pedido: { id: string; status: "pendente" | "concluido" | "cancelado"; criado_em: string; concluido_em?: string | null; atualizado: boolean | null };
  termo: Record<string, any>;
  assinaturas: Assinatura[];
};

const PAPEL: Record<string, string> = {
  prefeito: "Prefeito(a) Municipal",
  secretario: "Secretário(a) de Educação",
  sindicato: "Presidente do Sindicato Rural",
  coordenador: "Coordenador(a) do Projeto",
};

function quando(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// O termo exatamente como foi enviado para assinatura por e-mail, com o andamento de cada assinatura.
export default function TermoEnviadoParaAssinaturaPage({ params }: { params: { id: string } }) {
  return (
    <AdminGuard>
      <Conteudo id={params.id} />
    </AdminGuard>
  );
}

function Conteudo({ id }: { id: string }) {
  const [r, setR] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiGet(`/api/admin/adesoes/assinatura?id=${encodeURIComponent(id)}`).then(setR).catch((e) => setErro(e.message));
  }, [id]);

  if (erro) {
    return (
      <div className="p-8 text-sm">
        <p className="text-status-pendente">{erro}</p>
        <Link href="/admin/termo-adesao" className="mt-3 inline-block font-semibold text-brand-light underline">← Voltar</Link>
      </div>
    );
  }
  if (!r) return <div className="p-8 text-sm text-brand-dark/75">Carregando termo...</div>;

  const assinados = r.assinaturas.filter((x) => x.assinado_em).length;
  const concluido = r.pedido.status === "concluido";

  return (
    <div className="min-h-screen bg-[#EDEAE0] py-4 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 16mm 14mm; } @media print { html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>

      <div className="mx-auto mb-3 flex w-full max-w-[210mm] items-center justify-between gap-2 px-3 print:hidden">
        <Link href="/admin/termo-adesao" className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-brand-dark hover:bg-black/5">← Voltar</Link>
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-accent">
          Salvar em PDF / imprimir
        </button>
      </div>

      <div className="mx-auto mb-3 w-full max-w-[210mm] px-3 print:hidden">
        <div className={`rounded-xl border px-5 py-4 ${concluido ? "border-[#17613B]/20 bg-[#E3F4EA]" : "border-black/10 bg-white shadow-sm"}`}>
          <p className={`text-base font-bold ${concluido ? "text-[#17613B]" : "text-[#1E4632]"}`}>
            {concluido ? "✓ Assinado por todos" : `Em assinatura — ${assinados} de ${r.assinaturas.length} assinaturas`}
          </p>
          <p className="mt-0.5 text-xs text-brand-dark/70">
            Enviado para assinatura em {quando(r.pedido.criado_em)}{concluido ? ` · concluído em ${quando(r.pedido.concluido_em)}` : ""}.
            Este é o texto que as pessoas receberam, com os dados da ficha naquele momento.
          </p>
          {r.pedido.atualizado === false && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              ⚠️ A ficha foi alterada depois deste envio: os dados atuais são diferentes dos que estão neste termo.
            </p>
          )}
          <ul className="mt-3 divide-y divide-black/5 rounded-lg border border-black/5 bg-white">
            {r.assinaturas.map((s) => (
              <li key={s.papel} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-brand-dark">{s.nome} <span className="font-normal text-brand-dark/60">· {PAPEL[s.papel] ?? s.papel}</span></p>
                  <p className="truncate text-xs text-brand-dark/70">{s.email}</p>
                  {s.assinado_em && (
                    <p className="text-[11px] text-brand-dark/60">
                      Assinou como “{s.assinado_nome_digitado ?? s.nome}” · IP {s.ip ?? "—"}
                    </p>
                  )}
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${s.assinado_em ? "bg-[#E3F4EA] text-[#17613B]" : "bg-[#EFEDE4] text-[#4A453A]"}`}>
                  {s.assinado_em ? `✓ Assinou em ${quando(s.assinado_em)}` : "Aguardando"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <TermoConteudo a={r.termo as any} assinaturas={r.assinaturas} />
    </div>
  );
}
