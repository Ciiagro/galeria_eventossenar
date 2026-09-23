"use client";

import { useState } from "react";
import type { Documento } from "@/lib/api";
import { urlsMiniatura } from "@/lib/miniatura";
import { FileTextIcon, ImageIcon, LinkIcon, VideoIcon } from "@/components/icons";

// Peças visuais dos cartões de documento, iguais às do Painel de Aprovação
// (admin), para as duas telas terem a mesma aparência.

// ---------------------------------------------------------------
// Miniatura (imagem do Drive, capa do YouTube ou ícone do tipo)
// ---------------------------------------------------------------
export function Miniatura({ doc, onClick }: { doc: Documento; onClick?: () => void }) {
  // tenta cada endereço em ordem; se todos falharem, mostra o ícone
  const candidatos = urlsMiniatura(doc);
  const [tentativa, setTentativa] = useState(0);
  const url = candidatos[tentativa] ?? null;
  const tipo = (doc.tipos_documento?.nome ?? "").toLowerCase();
  const ehVideo = /v[ií]deo/.test(tipo);
  const Icone = ehVideo
    ? VideoIcon
    : /imag|foto/.test(tipo)
      ? ImageIcon
      : doc.link_externo && !doc.drive_file_link
        ? LinkIcon
        : FileTextIcon;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      disabled={!onClick}
      className="group relative w-full sm:w-44 h-32 sm:h-28 shrink-0 overflow-hidden rounded-lg border border-black/10 bg-brand-light/[0.06] disabled:cursor-default"
      title={onClick ? "Ver em tamanho grande" : undefined}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setTentativa((t) => t + 1)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-brand-light">
          <Icone className="w-8 h-8" />
          <span className="text-xs font-medium">{doc.tipos_documento?.nome ?? "Arquivo"}</span>
        </span>
      )}
      {ehVideo && url && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-10 h-10 rounded-full bg-black/55 text-white flex items-center justify-center text-lg">▶</span>
        </span>
      )}
      {onClick && (
        <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-center text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          🔍 Ampliar
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------
// Linha de informação com ícone (escola, programa, data...)
// ---------------------------------------------------------------
export function Info({
  icone: Icone,
  texto,
  forte,
}: {
  icone: (p: { className?: string }) => JSX.Element;
  texto: string;
  forte?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${forte ? "font-semibold text-brand-dark" : ""}`}>
      <Icone className="w-3.5 h-3.5 shrink-0 text-brand-light" />
      {texto}
    </span>
  );
}

export function EscolaIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10l9-6 9 6" />
      <path d="M5 10v9h14v-9" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}

// ---------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------
export function formatarData(data?: string | null) {
  if (!data) return "—";
  const [ano, mes, dia] = data.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

export function formatarDataHora(data: string) {
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function normalizarTexto(texto?: string | null) {
  return (texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
