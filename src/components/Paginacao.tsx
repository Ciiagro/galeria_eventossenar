"use client";

type Props = {
  pagina: number; // 1-based
  total: number; // total de itens
  porPagina: number;
  onChange: (pagina: number) => void;
  onChangePorPagina?: (valor: number) => void;
  opcoesPorPagina?: number[];
};

/** Gera [1, "…", 4, 5, 6, "…", 20] */
function janela(atual: number, ultima: number): (number | "…")[] {
  if (ultima <= 7) return Array.from({ length: ultima }, (_, i) => i + 1);
  const paginas = new Set([1, ultima, atual - 1, atual, atual + 1]);
  if (atual <= 3) [2, 3, 4].forEach((p) => paginas.add(p));
  if (atual >= ultima - 2) [ultima - 3, ultima - 2, ultima - 1].forEach((p) => paginas.add(p));
  const ordenadas = [...paginas].filter((p) => p >= 1 && p <= ultima).sort((a, b) => a - b);
  const saida: (number | "…")[] = [];
  ordenadas.forEach((p, i) => {
    if (i > 0 && p - ordenadas[i - 1] > 1) saida.push("…");
    saida.push(p);
  });
  return saida;
}

export function Paginacao({ pagina, total, porPagina, onChange, onChangePorPagina, opcoesPorPagina = [10, 20, 50] }: Props) {
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  if (total === 0) return null;
  // com poucos itens e sem seletor, nem aparece
  if (ultima === 1 && !onChangePorPagina) return null;

  const inicio = (pagina - 1) * porPagina + 1;
  const fim = Math.min(pagina * porPagina, total);
  const base = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm font-semibold transition-colors";
  const normal = "border-black/10 bg-white text-brand-dark hover:bg-black/5";
  const desabilitado = "disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed";

  return (
    <nav aria-label="Paginação" className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <div className="flex items-center gap-3 text-sm text-brand-dark/80">
        <span>
          Mostrando <strong>{inicio}–{fim}</strong> de <strong>{total}</strong>
        </span>
        {onChangePorPagina && (
          <label className="inline-flex items-center gap-1.5">
            <span className="sr-only sm:not-sr-only">Por página:</span>
            <select
              value={porPagina}
              onChange={(e) => onChangePorPagina(Number(e.target.value))}
              className="h-9 rounded-lg border border-black/10 bg-white px-2 text-sm"
            >
              {opcoesPorPagina.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>

      {ultima > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <button type="button" onClick={() => onChange(pagina - 1)} disabled={pagina <= 1} aria-label="Página anterior" className={`${base} ${normal} ${desabilitado}`}>
            ‹ <span className="ml-1 hidden sm:inline">Anterior</span>
          </button>
          {janela(pagina, ultima).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-1 text-brand-dark/60" aria-hidden>…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onChange(p)}
                aria-current={p === pagina ? "page" : undefined}
                aria-label={`Página ${p}`}
                className={`${base} ${p === pagina ? "border-brand-light bg-brand-light text-white" : normal}`}
              >
                {p}
              </button>
            )
          )}
          <button type="button" onClick={() => onChange(pagina + 1)} disabled={pagina >= ultima} aria-label="Próxima página" className={`${base} ${normal} ${desabilitado}`}>
            <span className="mr-1 hidden sm:inline">Próxima</span> ›
          </button>
        </div>
      )}
    </nav>
  );
}
