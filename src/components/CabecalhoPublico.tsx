// Cabeçalho das páginas públicas (galeria e "O projeto").
// A busca só aparece quando a página passa `onBusca` (a galeria).

type Props = {
  ativo: "galeria" | "projeto";
  busca?: string;
  onBusca?: (valor: string) => void;
};

export default function CabecalhoPublico({ ativo, busca = "", onBusca }: Props) {
  const aba = (rotulo: string, href: string, id: Props["ativo"]) => (
    <a
      href={href}
      aria-current={ativo === id ? "page" : undefined}
      className={`hidden sm:inline-flex items-center gap-1.5 self-stretch border-b-2 px-1 text-sm font-semibold transition-colors ${
        ativo === id ? "border-brand-light text-brand-light" : "border-transparent text-brand-dark/70 hover:text-brand-light"
      }`}
    >
      {rotulo}
    </a>
  );

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-black/5 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 h-16 flex items-center gap-4 sm:gap-8">
        <a href="/galeria" className="flex items-center gap-2 shrink-0">
          <LogoSenar />
          <span className="leading-none">
            <span className="block text-lg font-extrabold tracking-tight text-brand">SENAR</span>
            <span className="block text-xs font-semibold text-brand-light">Ceará</span>
          </span>
        </a>
        {aba("Galeria", "/galeria", "galeria")}
        {aba("O projeto", "/galeria/sobre", "projeto")}
        {onBusca ? (
          <div className="relative flex-1 max-w-xl mx-auto">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-dark/50">⌕</span>
            <input
              value={busca}
              onChange={(e) => onBusca(e.target.value)}
              placeholder="Buscar ações, escolas, municípios..."
              className="w-full rounded-full border border-black/10 bg-[#f6f8f5] pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30"
            />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <div className="hidden lg:flex items-center gap-4 shrink-0">
          <p className="border-l-2 border-brand pl-3 text-xs font-bold leading-tight text-brand max-w-[150px]">
            Juntos pelo desenvolvimento do nosso campo.
          </p>
          <span className="relative -mr-8 h-16 w-28" aria-hidden>
            <span className="absolute inset-y-0 right-10 w-6 -skew-x-[35deg] bg-brand" />
            <span className="absolute inset-y-0 right-4 w-6 -skew-x-[35deg] bg-brand-light" />
            <span className="absolute inset-y-0 -right-2 w-6 -skew-x-[35deg] bg-lime-400" />
          </span>
        </div>
      </div>
    </header>
  );
}

function LogoSenar() {
  return (
    <svg viewBox="0 0 40 40" className="w-10 h-10" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${8 + i * 6} 34 C ${6 + i * 6} 22, ${10 + i * 6} 12, ${16 + i * 5} 5`} stroke={i % 2 ? "#3F9B5E" : "#1E6B45"} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      ))}
    </svg>
  );
}
