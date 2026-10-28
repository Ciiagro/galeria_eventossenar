"use client";

import { createPortal } from "react-dom";
import { ReactNode, useEffect, useRef, useState } from "react";

export type Ordem = { col: string; dir: "asc" | "desc" };

// Cabeçalho clicável: alterna crescente/decrescente, com setinhas como nas outras telas.
export function Th({ col, ordem, onOrdem, children, className = "" }: {
  col?: string; ordem?: Ordem; onOrdem?: (o: Ordem) => void; children: ReactNode; className?: string;
}) {
  const ativo = col && ordem?.col === col;
  return (
    <th className={`px-3 py-3 text-sm font-bold text-brand-dark ${className}`} aria-sort={ativo ? (ordem!.dir === "asc" ? "ascending" : "descending") : undefined}>
      {col && onOrdem ? (
        <button type="button" onClick={() => onOrdem({ col, dir: ativo && ordem!.dir === "asc" ? "desc" : "asc" })}
          className="group inline-flex items-center gap-1 text-sm font-bold normal-case tracking-normal text-brand-dark hover:text-brand-light">
          {children}
          <span className={`text-[9px] leading-none ${ativo ? "text-brand-light" : "text-brand-dark/25 group-hover:text-brand-dark/60"}`} aria-hidden>
            {ativo ? (ordem!.dir === "asc" ? "▲" : "▼") : "⇅"}
          </span>
        </button>
      ) : children}
    </th>
  );
}

export function ordenar<T>(lista: T[], ordem: Ordem | undefined, valor: (item: T, col: string) => string) {
  if (!ordem) return lista;
  const f = ordem.dir === "asc" ? 1 : -1;
  return [...lista].sort((a, b) => f * valor(a, ordem.col).localeCompare(valor(b, ordem.col), "pt", { sensitivity: "base", numeric: true }));
}

export type ItemMenu = { rotulo: string; onClick: () => void; perigo?: boolean; oculto?: boolean };

// Menu de três pontinhos (⋮). Abre solto da tabela (position fixed) para não ficar cortado.
export function MenuAcoes({ itens, rotulo }: { itens: ItemMenu[]; rotulo: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pos) return;
    const fechar = () => setPos(null);
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("click", fechar);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("click", fechar);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
      window.removeEventListener("keydown", tecla);
    };
  }, [pos]);
  const visiveis = itens.filter((i) => !i.oculto);
  if (!visiveis.length) return null;
  return (
    <>
      <button ref={botao} type="button" aria-label={`Ações: ${rotulo}`} aria-haspopup="menu" aria-expanded={Boolean(pos)}
        onClick={(e) => {
          e.stopPropagation();
          if (pos) return setPos(null);
          const r = botao.current?.getBoundingClientRect();
          if (r) setPos({ x: Math.max(8, r.right - 240), y: r.bottom + 4 });
        }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-black/[0.04] text-lg font-bold leading-none text-brand-dark hover:bg-black/10">
        ⋮
      </button>
      {pos &&
        createPortal(<div role="menu" style={{ position: "fixed", left: pos.x, top: pos.y, width: 240, zIndex: 9999, background: "#ffffff", opacity: 1 }}
          className="overflow-hidden rounded-xl border border-black/10 py-1 shadow-xl" onClick={(e) => e.stopPropagation()}>
          {visiveis.map((i) => (
            <button key={i.rotulo} role="menuitem" type="button" onClick={() => { setPos(null); i.onClick(); }}
              className={`block w-full whitespace-nowrap px-4 py-2.5 text-left text-sm font-medium leading-5 hover:bg-black/5 ${i.perigo ? "text-status-pendente" : "text-brand-dark"}`}>
              {i.rotulo}
            </button>
          ))}
        </div>, document.body)}
    </>
  );
}

export function Pilula({ texto, fundo, cor }: { texto: string; fundo: string; cor: string }) {
  return <span className="inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold" style={{ background: fundo, color: cor }}>{texto}</span>;
}

// Rodapé: "Mostrando 1–10 de 95" + setas e números de página.
export function RodapeTabela({ pagina, total, porPagina, onChange }: { pagina: number; total: number; porPagina: number; onChange: (p: number) => void }) {
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  if (total === 0) return null;
  const inicio = (pagina - 1) * porPagina + 1;
  const fim = Math.min(pagina * porPagina, total);
  const numeros: (number | "…")[] = [];
  for (let p = 1; p <= ultima; p++) {
    if (p === 1 || p === ultima || Math.abs(p - pagina) <= 1) numeros.push(p);
    else if (numeros[numeros.length - 1] !== "…") numeros.push("…");
  }
  const seta = "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white text-brand-dark hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-white";
  return (
    <div className="flex flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row">
      <span className="text-sm text-brand-dark/75">Mostrando {inicio}–{fim} de {total}</span>
      <nav aria-label="Paginação" className="flex items-center gap-1.5">
        <button type="button" className={seta} disabled={pagina <= 1} onClick={() => onChange(pagina - 1)} aria-label="Página anterior">‹</button>
        {numeros.map((n, i) => n === "…" ? <span key={`e${i}`} className="px-1 text-brand-dark/50">…</span> : (
          <button key={n} type="button" onClick={() => onChange(n)} aria-current={n === pagina ? "page" : undefined}
            className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold ${n === pagina ? "bg-brand-light/15 text-brand-light" : "text-brand-dark hover:bg-black/5"}`}>
            {n}
          </button>
        ))}
        <button type="button" className={seta} disabled={pagina >= ultima} onClick={() => onChange(pagina + 1)} aria-label="Próxima página">›</button>
      </nav>
    </div>
  );
}
