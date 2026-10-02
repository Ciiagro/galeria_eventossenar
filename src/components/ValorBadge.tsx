import { corDoValor } from "@/lib/valores";

/** Etiqueta com a cor do valor (Paz, Amor, Verdade, Ação correta, Não violência). */
export function ValorBadge({ nome, cor, className = "" }: { nome?: string | null; cor?: string | null; className?: string }) {
  const rotulo = nome || "Sem valor";
  const c = corDoValor(nome, cor);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
      style={{ background: c.fundo, color: c.texto }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.barra }} aria-hidden />
      {rotulo}
    </span>
  );
}
