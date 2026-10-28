"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { CalendarIcon, CheckIcon } from "@/components/icons";

type Linha = { nome: string; abre: string; prazo: string | null; situacao: "enviado" | "fechado" | "atrasado" | "vence_logo" | "em_dia"; dias: number | null; enviadas: number; total_escolas: number };

const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

const ESTILO: Record<Linha["situacao"], { texto: string; pill: string; borda: string; barra: string }> = {
  enviado: { texto: "Enviado", pill: "bg-[#DDF3E4] text-[#17613B]", borda: "border-[#BFE3CC]", barra: "bg-[#2F9E62]" },
  em_dia: { texto: "Em dia", pill: "bg-[#E2EFFB] text-[#0F4C85]", borda: "border-[#C9DDF1]", barra: "bg-[#2678C4]" },
  vence_logo: { texto: "Vence em breve", pill: "bg-[#FFF1CC] text-[#7A5200]", borda: "border-[#F2D98A]", barra: "bg-[#E0A800]" },
  atrasado: { texto: "Atrasado", pill: "bg-[#FDE2E2] text-[#9B1C1C]", borda: "border-[#F2B8B8]", barra: "bg-[#D64545]" },
  fechado: { texto: "Ainda não abriu", pill: "bg-black/[0.06] text-brand-dark/70", borda: "border-black/10", barra: "bg-black/20" },
};

const rotuloDoc = (nome: string) => (nome.startsWith("Lista") ? "Lista de Presença" : nome.startsWith("Portfólio") ? "Portfólio" : "Relatório");
const formacaoDe = (nome: string) => (nome.includes(" - ") ? nome.split(" - ").slice(1).join(" - ") : nome);

function CartaoDoc({ l, municipioId }: { l: Linha; municipioId: string }) {
  const e = ESTILO[l.situacao];
  const pct = l.total_escolas > 0 ? Math.round((l.enviadas / l.total_escolas) * 100) : l.situacao === "enviado" ? 100 : 0;
  const pendente = l.situacao === "em_dia" || l.situacao === "vence_logo" || l.situacao === "atrasado";
  const contagem =
    l.situacao === "enviado" ? "Entregue" :
    l.situacao === "fechado" ? `Abre em ${br(l.abre)}` :
    l.dias === null ? "Sem data limite" :
    l.dias < 0 ? `Venceu há ${-l.dias} dia${l.dias === -1 ? "" : "s"}` :
    l.dias === 0 ? "Vence hoje" : `Faltam ${l.dias} dia${l.dias === 1 ? "" : "s"}`;
  return (
    <div className={`flex flex-1 flex-col rounded-2xl border bg-white p-4 ${e.borda}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-brand-dark">{rotuloDoc(l.nome)}</p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${e.pill}`}>
          {l.situacao === "enviado" && <CheckIcon className="h-3 w-3" />}{e.texto}
        </span>
      </div>
      <p className="mt-2 text-2xl font-extrabold leading-none text-brand-dark">{l.prazo && l.situacao !== "fechado" ? br(l.prazo) : l.situacao === "fechado" ? br(l.abre) : "—"}</p>
      <p className="mt-1 text-xs font-medium text-brand-dark/70">{l.situacao === "fechado" ? "Data em que abre para envio" : "Prazo de envio"} · {contagem}</p>
      {l.total_escolas > 0 && l.situacao !== "fechado" && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-black/[0.07]"><div className={`h-full rounded-full ${e.barra}`} style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-xs text-brand-dark/65">{l.enviadas} de {l.total_escolas} escolas</p>
        </div>
      )}
      {pendente && (
        <Link href={`/municipios/${municipioId}/novo-documento`} className="mt-3 inline-flex w-fit rounded-lg bg-brand-light px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-accent">
          Enviar agora
        </Link>
      )}
    </div>
  );
}

// Quadro do coordenador: mostra só a formação do momento (a primeira que ainda não foi toda enviada). Concluída, passa para a próxima.
export function PrazosEnvio({ municipioId }: { municipioId: string }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);

  useEffect(() => {
    apiGet(`/api/meus-prazos?municipio_id=${municipioId}`)
      .then((r) => setLinhas(r.documentos ?? []))
      .catch(() => setLinhas(null));
  }, [municipioId]);

  if (!linhas || linhas.length === 0) return null;

  const grupos: { nome: string; docs: Linha[] }[] = [];
  const portfolio: Linha[] = [];
  for (const l of linhas) {
    if (l.nome.startsWith("Portfólio")) { portfolio.push(l); continue; }
    const f = formacaoDe(l.nome);
    let g = grupos.find((x) => x.nome === f);
    if (!g) { g = { nome: f, docs: [] }; grupos.push(g); }
    g.docs.push(l);
  }
  const atualIdx = grupos.findIndex((g) => g.docs.some((d) => d.situacao !== "enviado"));
  const atual = atualIdx >= 0 ? grupos[atualIdx] : null;
  const concluidas = atualIdx >= 0 ? atualIdx : grupos.length;
  const proxima = atualIdx >= 0 ? grupos[atualIdx + 1] : null;
  const port = portfolio[0];
  const tudoFeito = !atual && (!port || port.situacao === "enviado");

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-[#CFE6D8] bg-gradient-to-br from-[#F1F9F4] to-white p-4 shadow-sm sm:p-5" aria-label="Prazos de envio">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-brand-dark">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#CDEBDA] text-[#1E6B45]"><CalendarIcon className="h-5 w-5" /></span>
          Prazos de envio
          {atual && <span className="rounded-full bg-[#1E6B45] px-2.5 py-0.5 text-xs font-bold text-white">{atual.nome}</span>}
        </h2>
        {concluidas > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#DDF3E4] px-2.5 py-0.5 text-xs font-bold text-[#17613B]">
            <CheckIcon className="h-3 w-3" /> {concluidas} {concluidas === 1 ? "formação concluída" : "formações concluídas"}
          </span>
        )}
      </div>

      {atual && (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          {atual.docs.map((d) => <CartaoDoc key={d.nome} l={d} municipioId={municipioId} />)}
        </div>
      )}

      {!atual && port && port.situacao !== "enviado" && (
        <div className="mt-3 flex"><CartaoDoc l={port} municipioId={municipioId} /></div>
      )}

      {tudoFeito && (
        <p className="mt-3 rounded-xl bg-[#DDF3E4] px-4 py-3 text-sm font-semibold text-[#17613B]">🎉 Tudo enviado. Não há prazos pendentes.</p>
      )}

      {proxima && (
        <p className="mt-3 text-xs text-brand-dark/65">
          Depois vem a <strong>{proxima.nome}</strong>{proxima.docs[0] ? ` (abre em ${br(proxima.docs[0].abre)})` : ""}.
        </p>
      )}
    </section>
  );
}
