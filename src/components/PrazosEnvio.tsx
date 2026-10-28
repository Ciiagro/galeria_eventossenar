"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { CalendarIcon, CheckIcon } from "@/components/icons";

type Linha = { nome: string; abre: string; prazo: string | null; situacao: "enviado" | "fechado" | "atrasado" | "vence_logo" | "em_dia"; dias: number | null; enviadas: number; total_escolas: number };

const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

const ROTULO: Record<Linha["situacao"], { texto: string; classe: string }> = {
  enviado: { texto: "Enviado", classe: "bg-[#DDF3E4] text-[#17613B]" },
  em_dia: { texto: "Em dia", classe: "bg-[#E2EFFB] text-[#0F4C85]" },
  vence_logo: { texto: "Vence em breve", classe: "bg-[#FFF1CC] text-[#7A5200]" },
  atrasado: { texto: "Atrasado", classe: "bg-[#FDE2E2] text-[#9B1C1C]" },
  fechado: { texto: "Ainda não abriu", classe: "bg-black/[0.06] text-brand-dark/70" },
};

// Quadro do coordenador: prazo de envio de cada relatório e lista de presença das formações (datas definidas pelo administrador em Edições)
export function PrazosEnvio({ municipioId }: { municipioId: string }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);

  useEffect(() => {
    apiGet(`/api/meus-prazos?municipio_id=${municipioId}`)
      .then((r) => setLinhas(r.documentos ?? []))
      .catch(() => setLinhas(null));
  }, [municipioId]);

  if (!linhas || linhas.length === 0) return null;

  return (
    <section className="mt-5 rounded-2xl border border-black/10 bg-white p-4 shadow-sm" aria-label="Prazos de envio">
      <h2 className="flex items-center gap-2 text-base font-bold text-brand-dark">
        <CalendarIcon className="h-5 w-5 text-[#2F9E62]" /> Prazos de envio
      </h2>
      <p className="mt-0.5 text-xs text-brand-dark/70">Datas limite definidas pela coordenação do projeto para cada formação.</p>
      <ul className="mt-3 divide-y divide-black/5">
        {linhas.map((l) => {
          const r = ROTULO[l.situacao];
          return (
            <li key={l.nome} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="min-w-[14rem] flex-1 font-semibold text-brand-dark">{l.nome.replace("Relatório de Formação", "Relatório")}</span>
              <span className="text-brand-dark/80">
                {l.situacao === "fechado" ? `Abre em ${br(l.abre)}` : l.prazo ? `Prazo: até ${br(l.prazo)}` : "Documento final (sem prazo)"}
                {l.situacao === "vence_logo" && l.dias !== null && ` (${l.dias === 0 ? "vence hoje" : `faltam ${l.dias} dia${l.dias === 1 ? "" : "s"}`})`}
              </span>
              {l.total_escolas > 0 && l.situacao !== "fechado" && (
                <span className="text-xs text-brand-dark/65">{l.enviadas} de {l.total_escolas} escolas</span>
              )}
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${r.classe}`}>
                {l.situacao === "enviado" && <CheckIcon className="h-3 w-3" />}
                {r.texto}
              </span>
              {(l.situacao === "em_dia" || l.situacao === "vence_logo" || l.situacao === "atrasado") && (
                <Link href={`/municipios/${municipioId}/novo-documento`} className="text-xs font-semibold text-brand-light hover:underline">Enviar</Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
