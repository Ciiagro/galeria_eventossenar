"use client";

import type { ReactNode } from "react";
import { SearchIcon } from "@/components/icons";

// ================================================================
// Filtros padrão do sistema (modelo: tela de Documentos / Painel de Aprovação).
// Toda tela com lista usa estes componentes, nesta ordem:
//   1. <Abas> (com <SeletorOrdem> à direita, se houver ordenação)
//   2. <BarraFiltros> com <CampoBusca> + <select className={CLASSE_SELECT}> ...
// Para mudar o visual dos filtros em TODAS as telas, mude só este arquivo.
// ================================================================

export const CLASSE_SELECT =
  "w-full border border-black/10 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30";

const CLASSE_BUSCA =
  "w-full border border-black/10 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30";

export type ItemAba<T extends string> = { valor: T; rotulo: string; contagem?: number | string };

export function Abas<T extends string>({
  abas,
  valor,
  onChange,
  direita,
  className = "mt-6",
}: {
  abas: ItemAba<T>[];
  valor: T | null;
  onChange: (valor: T) => void;
  direita?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${className} flex flex-col-reverse sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-black/10`}>
      <nav className="flex gap-1 overflow-x-auto -mb-px">
        {abas.map((a) => (
          <button
            key={a.rotulo}
            type="button"
            onClick={() => onChange(a.valor)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              valor === a.valor ? "border-brand-light text-brand-light" : "border-transparent text-brand-dark/75 hover:text-brand-dark"
            }`}
          >
            {a.rotulo}
            {a.contagem !== undefined ? ` (${a.contagem})` : ""}
          </button>
        ))}
      </nav>
      {direita}
    </div>
  );
}

export function SeletorOrdem({
  valor,
  onChange,
  opcoes,
}: {
  valor: string;
  onChange: (valor: string) => void;
  opcoes: [valor: string, rotulo: string][];
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className="mb-2 self-start sm:self-auto border border-black/10 rounded-lg px-3 py-2 text-sm bg-white"
      aria-label="Ordenar"
    >
      {opcoes.map(([v, r]) => <option key={v} value={v}>⇅ {r}</option>)}
    </select>
  );
}

export function CampoBusca({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (valor: string) => void;
  placeholder: string;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark/60" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={CLASSE_BUSCA}
      />
    </div>
  );
}

export function BarraFiltros({
  children,
  colunas = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr]",
  mostrarLimpar,
  onLimpar,
  resumo,
  className = "mt-4",
}: {
  children: ReactNode;
  /** classes de grade; a busca deve ser o primeiro filho */
  colunas?: string;
  mostrarLimpar?: boolean;
  onLimpar?: () => void;
  /** texto discreto ao lado de "Limpar filtros" (ex.: "3 de 20") */
  resumo?: ReactNode;
  className?: string;
}) {
  return (
    <>
      <div className={`${className} grid ${colunas} gap-2`}>{children}</div>
      {((mostrarLimpar && onLimpar) || resumo) && (
        <div className="mt-2 flex items-center gap-3">
          {mostrarLimpar && onLimpar && (
            <button type="button" onClick={onLimpar} className="text-sm font-medium text-brand-light hover:underline">
              Limpar filtros
            </button>
          )}
          {resumo && <span className="text-sm text-brand-dark/75">{resumo}</span>}
        </div>
      )}
    </>
  );
}
