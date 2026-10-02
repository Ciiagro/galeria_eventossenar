// Sol do Projeto Valores Humanos: os raios usam as cores dos valores.
const RAIOS = ["#F2B705", "#2678C4", "#E03A3E", "#8E5BB5", "#2F9E62", "#F26122", "#E03A3E", "#2678C4"];

export function Sol({ className = "w-24 h-24" }: { className?: string }) {
  return (
    <svg viewBox="-70 -70 140 140" className={className} aria-hidden="true" focusable="false">
      {RAIOS.map((cor, i) => (
        <line key={i} x1="40" y1="0" x2="60" y2="0" stroke={cor} strokeWidth="8" strokeLinecap="round" transform={`rotate(${i * 45})`} />
      ))}
      <circle r="31" fill="#FBCB3C" />
    </svg>
  );
}

// Fundo festivo (login e galeria pública): creme com manchas pastel e o sol dos valores (some com mostrarSol={false}).
// Telas de trabalho (listas, tabelas, formulários) ficam em fundo liso.
export function FundoFestivo({
  children,
  className = "",
  mostrarSol = true,
}: {
  children: React.ReactNode;
  className?: string;
  mostrarSol?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden bg-sol-creme ${className}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="absolute -left-24 -bottom-28 h-80 w-80 rounded-full bg-[#CFE8F7]" />
        <span className="absolute -right-20 -bottom-24 h-72 w-72 rounded-full bg-[#F8D5E3]" />
        <span className="absolute -left-20 top-8 h-56 w-56 rounded-full bg-[#E4D7F0]" />
        <span className="absolute -right-12 top-[48%] h-36 w-36 rounded-full bg-[#DDEDB8]" />
        {mostrarSol && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/sol-valores.png"
            alt=""
            width={900}
            height={545}
            className="absolute right-4 top-4 h-auto w-28 sm:right-10 sm:top-8 sm:w-40 lg:w-52"
          />
        )}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

export function LogoValores({ className = "w-56" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo-valores.png" alt="Projeto Valores" width={720} height={308} className={`h-auto ${className}`} />
  );
}

// Faixa fina com as cinco cores dos valores
export function FaixaValores({ className = "" }: { className?: string }) {
  return (
    <div className={`flex h-1 overflow-hidden rounded-full ${className}`} aria-hidden="true">
      {["#8E5BB5", "#E03A3E", "#2F9E62", "#F2B705", "#2678C4"].map((cor) => (
        <span key={cor} className="flex-1" style={{ background: cor }} />
      ))}
    </div>
  );
}
