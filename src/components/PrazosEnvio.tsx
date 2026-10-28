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
    <div className={`flex flex-1 flex-col rounded-xl border bg-white px-3 py-2 ${e.borda}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-brand-dark">{rotuloDoc(l.nome)}</p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${e.pill}`}>
          {l.situacao === "enviado" && <CheckIcon className="h-3 w-3" />}{e.texto}
        </span>
      </div>
      <p className="mt-1 text-xs text-brand-dark/70">
        Início <strong className="text-sm text-brand-dark">{br(l.abre)}</strong>
        <span className="mx-1.5 text-brand-dark/30">·</span>
        Fim <strong className="text-sm text-brand-dark">{l.prazo ? br(l.prazo) : "sem data final"}</strong>
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        {l.total_escolas > 0 && l.situacao !== "fechado" ? (
          <>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.07]"><div className={`h-full rounded-full ${e.barra}`} style={{ width: `${pct}%` }} /></div>
            <span className="whitespace-nowrap text-[11px] text-brand-dark/65">{l.enviadas}/{l.total_escolas} escolas · {contagem}</span>
          </>
        ) : (
          <span className="text-[11px] text-brand-dark/65">{contagem}</span>
        )}
        {pendente && (
          <Link href={`/municipios/${municipioId}/novo-documento`} className="inline-flex shrink-0 rounded-md bg-brand-light px-2.5 py-1 text-[11px] font-bold text-white hover:bg-brand-accent">
            Enviar agora
          </Link>
        )}
      </div>
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
  // só o que já abriu: as formações com envio faltando e, sempre, a última que abriu (mesmo já enviada)
  const jaAbriu = grupos.filter((g) => g.docs.some((d) => d.situacao !== "fechado"));
  const ultimaAberta = jaAbriu[jaAbriu.length - 1];
  const abertas = jaAbriu.filter((g) => g === ultimaAberta || g.docs.some((d) => d.situacao !== "enviado"));
  const concluidas = grupos.filter((g) => g.docs.every((d) => d.situacao === "enviado") && !abertas.includes(g)).length;
  const proxima = grupos.find((g) => g.docs.every((d) => d.situacao === "fechado"));
  const port = portfolio[0];
  const portAberto = port && port.situacao !== "fechado" && port.situacao !== "enviado";
  const nadaAberto = abertas.length === 0 && !portAberto;
  if (nadaAberto && concluidas === 0 && !proxima) return null;

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-[#CFE6D8] bg-gradient-to-br from-[#F1F9F4] to-white px-4 py-3 shadow-sm" aria-label="Prazos de envio">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-brand-dark">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#CDEBDA] text-[#1E6B45]"><CalendarIcon className="h-4 w-4" /></span>
          Prazos de envio
        </h2>
        {concluidas > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#DDF3E4] px-2.5 py-0.5 text-xs font-bold text-[#17613B]">
            <CheckIcon className="h-3 w-3" /> {concluidas} {concluidas === 1 ? "formação concluída" : "formações concluídas"}
          </span>
        )}
      </div>

      {abertas.map((g) => (
        <div key={g.nome} className="mt-2">
          <p className="mb-1.5"><span className="rounded-full bg-[#1E6B45] px-2.5 py-0.5 text-xs font-bold text-white">{g.nome}</span></p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {g.docs.map((d) => <CartaoDoc key={d.nome} l={d} municipioId={municipioId} />)}
          </div>
        </div>
      ))}

      {portAberto && <div className="mt-3 flex"><CartaoDoc l={port} municipioId={municipioId} /></div>}

      {nadaAberto && (
        <p className="mt-3 rounded-xl bg-white/70 px-4 py-3 text-sm font-medium text-brand-dark/80">
          Nenhum envio aberto agora.{proxima ? <> A <strong>{proxima.nome}</strong> abre em <strong>{br(proxima.docs[0].abre)}</strong>.</> : " 🎉 Tudo enviado."}
        </p>
      )}

      {!nadaAberto && proxima && (
        <p className="mt-2 text-sm text-brand-dark/80">
          A <strong>{proxima.nome}</strong> abre em <strong>{br(proxima.docs[0].abre)}</strong>.
        </p>
      )}
    </section>
  );
}
