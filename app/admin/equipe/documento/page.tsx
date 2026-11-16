"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet } from "@/lib/api";
import { AdminGuard } from "@/components/AdminGuard";
import { FotoCoordenador } from "@/components/FotoCoordenador";

type Documento = {
  id: string;
  nome: string;
  funcao: string;
  cpf: string | null;
  email: string | null;
  ciclo: string | null;
  municipios: { id: number; nome: string; escolas: string[] }[];
};

function mascararCpf(v: string | null) {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : v ?? "";
}

export default function DocumentoApoiadorPage() {
  return (
    <AdminGuard>
      <Suspense fallback={<p className="p-8 text-sm">Carregando...</p>}>
        <Documento />
      </Suspense>
    </AdminGuard>
  );
}

function Documento() {
  const id = useSearchParams().get("id");
  const [dados, setDados] = useState<Documento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setErro("Faltou escolher a pessoa."); return; }
    apiGet(`/api/equipe-documento?id=${encodeURIComponent(id)}`)
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : "Não consegui montar o documento."));
  }, [id]);

  if (erro) return <p className="p-8 text-sm text-red-700" role="alert">{erro}</p>;
  if (!dados) return <p className="p-8 text-sm">Carregando...</p>;

  const totalEscolas = dados.municipios.reduce((n, m) => n + m.escolas.length, 0);
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-[#EEF1EF] p-4 print:bg-white print:p-0">
      <style>{"@page { size: A4; margin: 12mm; } @media print { body { background: #fff !important; } }"}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-brand-dark/80">Confira o documento. Na janela de impressão, escolha <b>Salvar como PDF</b>.</p>
        <button type="button" onClick={() => window.print()} className="rounded-xl bg-[#2F9E62] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:brightness-110">
          Imprimir / Salvar PDF
        </button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white p-[12mm] text-[#1D3B2F] shadow-md print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-center justify-between gap-4 border-b-4 border-[#2F9E62] pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-sistema-colorida.png" alt="Sistema FAEC / SENAR Ceará" className="h-14 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-valores-hd.png" alt="Projeto Valores" className="h-14 w-auto" />
        </header>

        <h1 className="mt-5 text-center text-xl font-extrabold uppercase tracking-wide">Apresentação de Apoiador</h1>
        <p className="mt-1 text-center text-sm text-[#1D3B2F]/80">Projeto Valores{dados.ciclo ? ` · ${dados.ciclo}` : ""}</p>

        <section className="mt-5 flex items-center gap-5 rounded-2xl border border-black/10 bg-[#F6F9F7] p-4">
          <FotoCoordenador userId={dados.id} nome={dados.nome} tamanho={112} />
          <div className="min-w-0">
            <p className="text-2xl font-extrabold leading-tight">{dados.nome}</p>
            <p className="mt-1 inline-block rounded-full bg-[#E3F4EA] px-3 py-0.5 text-sm font-bold text-[#17613B]">{dados.funcao}</p>
            <dl className="mt-2 space-y-0.5 text-sm">
              {dados.cpf && <div><dt className="inline font-semibold">CPF: </dt><dd className="inline">{mascararCpf(dados.cpf)}</dd></div>}
              {dados.email && <div><dt className="inline font-semibold">E-mail: </dt><dd className="inline">{dados.email}</dd></div>}
            </dl>
          </div>
        </section>

        <p className="mt-5 text-justify text-[15px] leading-relaxed">
          Apresentamos <b>{dados.nome}</b>, {dados.funcao} do Projeto Valores, do Sistema FAEC/SENAR Ceará. Esta pessoa está autorizada a visitar
          {totalEscolas === 1 ? " a escola relacionada" : " as escolas relacionadas"} abaixo, acompanhando as ações do projeto e registrando as atividades realizadas.
          Pedimos a colaboração da direção e da equipe escolar.
        </p>

        <h2 className="mt-5 text-base font-extrabold">
          Escolas de atuação <span className="font-semibold text-[#1D3B2F]/70">({dados.municipios.length} {dados.municipios.length === 1 ? "município" : "municípios"}, {totalEscolas} {totalEscolas === 1 ? "escola" : "escolas"})</span>
        </h2>

        {dados.municipios.length === 0 && <p className="mt-2 text-sm text-amber-800">Nenhum município definido para esta pessoa.</p>}
        {dados.municipios.map((m) => (
          <section key={m.id} className="mt-3 break-inside-avoid rounded-xl border border-black/10 p-3">
            <h3 className="mb-1.5 flex items-center justify-between text-sm font-extrabold uppercase tracking-wide text-[#0F4C85]">
              <span>{m.nome}</span>
              <span className="text-xs font-semibold normal-case text-[#1D3B2F]/70">{m.escolas.length} {m.escolas.length === 1 ? "escola" : "escolas"}</span>
            </h3>
            {m.escolas.length === 0 ? (
              <p className="text-sm text-[#1D3B2F]/70">Nenhuma escola do programa neste município.</p>
            ) : (
              <ol className="columns-2 gap-6 text-[13px] leading-snug">
                {m.escolas.map((e, i) => (
                  <li key={`${m.id}-${i}`} className="mb-0.5 break-inside-avoid"><span className="mr-1 font-semibold text-[#1D3B2F]/60">{i + 1}.</span>{e}</li>
                ))}
              </ol>
            )}
          </section>
        ))}

        <footer className="mt-10 grid grid-cols-2 gap-10 text-center text-xs">
          <div><div className="border-t border-black/50 pt-1">Coordenação do Projeto Valores</div></div>
          <div><div className="border-t border-black/50 pt-1">{dados.nome}</div></div>
        </footer>
        <p className="mt-4 text-center text-[11px] text-[#1D3B2F]/60">Emitido em {hoje}</p>
      </article>
    </div>
  );
}
