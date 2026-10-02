// Desenhos do Projeto Valores Humanos (crianças, escolinha, flores...).
// São só decoração: todos têm aria-hidden e usam as cores da logo e do programa.

type Props = { className?: string };

// Cores alegres do programa. "barra" = cor viva, "fundo" = tom claro, "texto" = tom escuro para ler sobre o fundo.
export type CorAlegre = { barra: string; fundo: string; texto: string; sobre: string }; // sobre = cor de ícone/letra em cima da "barra"

export const CORES_ALEGRES: CorAlegre[] = [
  { barra: "#8E5BB5", fundo: "#EFE8F8", texto: "#5B3485", sobre: "#FFFFFF" },
  { barra: "#E03A3E", fundo: "#FDE8E8", texto: "#A11F25", sobre: "#FFFFFF" },
  { barra: "#2F9E62", fundo: "#E3F4EA", texto: "#17613B", sobre: "#FFFFFF" },
  { barra: "#F2B705", fundo: "#FFF3CC", texto: "#6E4B00", sobre: "#3D2A00" },
  { barra: "#2678C4", fundo: "#E2EFFB", texto: "#0F4C85", sobre: "#FFFFFF" },
];

// ---------------------------------------------------------------
// Criança comemorando (braços para cima)
// ---------------------------------------------------------------
type CriancaProps = Props & {
  pele: string;
  cabelo: string;
  camisa: string;
  calca: string;
  penteado?: "curto" | "chiquinha" | "crespo";
};

export function Crianca({ className = "w-20", pele, cabelo, camisa, calca, penteado = "curto" }: CriancaProps) {
  return (
    <svg viewBox="0 0 80 130" className={className} aria-hidden="true" focusable="false">
      {/* pernas e tênis */}
      <rect x="30" y="94" width="8" height="24" rx="4" fill={pele} />
      <rect x="42" y="94" width="8" height="24" rx="4" fill={pele} />
      <ellipse cx="32" cy="121" rx="8.5" ry="5" fill="#FFFFFF" stroke="#8A8A85" strokeWidth="1.5" />
      <ellipse cx="48" cy="121" rx="8.5" ry="5" fill="#FFFFFF" stroke="#8A8A85" strokeWidth="1.5" />
      {/* short */}
      <rect x="27" y="82" width="26" height="18" rx="6" fill={calca} />
      {/* braços para cima */}
      <path d="M29 58 L13 35" stroke={pele} strokeWidth="8" strokeLinecap="round" />
      <path d="M51 58 L67 35" stroke={pele} strokeWidth="8" strokeLinecap="round" />
      <circle cx="12" cy="32" r="6" fill={pele} />
      <circle cx="68" cy="32" r="6" fill={pele} />
      {/* camisa */}
      <rect x="26" y="52" width="28" height="38" rx="10" fill={camisa} />
      <path d="M28 57 L19 45" stroke={camisa} strokeWidth="10" strokeLinecap="round" />
      <path d="M52 57 L61 45" stroke={camisa} strokeWidth="10" strokeLinecap="round" />
      {/* pescoço e cabeça */}
      <rect x="35" y="46" width="10" height="9" fill={pele} />
      {penteado === "chiquinha" && (
        <>
          <circle cx="21" cy="40" r="6.5" fill={cabelo} />
          <circle cx="59" cy="40" r="6.5" fill={cabelo} />
        </>
      )}
      {penteado === "crespo" && (
        <>
          <circle cx="27" cy="21" r="9" fill={cabelo} />
          <circle cx="40" cy="15" r="10" fill={cabelo} />
          <circle cx="53" cy="21" r="9" fill={cabelo} />
          <circle cx="24" cy="31" r="7" fill={cabelo} />
          <circle cx="56" cy="31" r="7" fill={cabelo} />
        </>
      )}
      <circle cx="40" cy="32" r="17" fill={pele} />
      {penteado !== "crespo" && <path d="M23 32 Q21 12 40 13 Q59 12 57 32 Q50 21 40 22 Q30 21 23 32 Z" fill={cabelo} />}
      {penteado === "crespo" && <path d="M25 30 Q27 21 40 21 Q53 21 55 30 Q48 26 40 26 Q32 26 25 30 Z" fill={cabelo} />}
      {/* rosto */}
      <circle cx="34" cy="33" r="2.2" fill="#3A2A22" />
      <circle cx="46" cy="33" r="2.2" fill="#3A2A22" />
      <circle cx="29.5" cy="39" r="3" fill="#F49AC1" opacity="0.55" />
      <circle cx="50.5" cy="39" r="3" fill="#F49AC1" opacity="0.55" />
      <path d="M33.5 39 Q40 48 46.5 39 Z" fill="#FFFFFF" stroke="#3A2A22" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

// As quatro crianças da logo do projeto, de peles e cabelos diferentes
export function CriancasPulando({ className = "", tamanho = "w-16 sm:w-20" }: Props & { tamanho?: string }) {
  return (
    <div className={`flex items-end justify-center -space-x-3 ${className}`} aria-hidden="true">
      <Crianca className={`${tamanho} -rotate-3`} pele="#F7CFAF" cabelo="#E5622A" camisa="#5BB8EC" calca="#2678C4" />
      <Crianca className={`${tamanho} rotate-2`} pele="#F0B88F" cabelo="#8A5A3C" camisa="#A98BC9" calca="#6B5CA5" penteado="chiquinha" />
      <Crianca className={`${tamanho} -rotate-2`} pele="#F8D5B5" cabelo="#F2C94C" camisa="#A6CE3A" calca="#C9772E" />
      <Crianca className={`${tamanho} rotate-3`} pele="#7A4A32" cabelo="#2B1B14" camisa="#FFC72C" calca="#E03A3E" penteado="crespo" />
    </div>
  );
}

// ---------------------------------------------------------------
// Escolinha com bandeira
// ---------------------------------------------------------------
export function Escolinha({ className = "w-32" }: Props) {
  return (
    <svg viewBox="0 0 200 150" className={className} aria-hidden="true" focusable="false">
      <ellipse cx="100" cy="142" rx="94" ry="8" fill="#A6CE3A" opacity="0.55" />
      <line x1="100" y1="32" x2="100" y2="10" stroke="#8A8A85" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M101 10 L121 16 L101 22 Z" fill="#E03A3E" />
      <rect x="30" y="76" width="140" height="62" rx="6" fill="#FFC72C" />
      <path d="M16 82 L100 32 L184 82 Z" fill="#F26122" strokeLinejoin="round" />
      <circle cx="100" cy="62" r="9" fill="#CFE8F7" stroke="#FFFFFF" strokeWidth="3" />
      <rect x="84" y="100" width="32" height="38" rx="4" fill="#2678C4" />
      <circle cx="110" cy="120" r="2.5" fill="#FFC72C" />
      <rect x="44" y="92" width="28" height="24" rx="3" fill="#CFE8F7" stroke="#FFFFFF" strokeWidth="3" />
      <line x1="58" y1="92" x2="58" y2="116" stroke="#FFFFFF" strokeWidth="2.5" />
      <line x1="44" y1="104" x2="72" y2="104" stroke="#FFFFFF" strokeWidth="2.5" />
      <rect x="128" y="92" width="28" height="24" rx="3" fill="#CFE8F7" stroke="#FFFFFF" strokeWidth="3" />
      <line x1="142" y1="92" x2="142" y2="116" stroke="#FFFFFF" strokeWidth="2.5" />
      <line x1="128" y1="104" x2="156" y2="104" stroke="#FFFFFF" strokeWidth="2.5" />
      <rect x="78" y="136" width="44" height="6" rx="2" fill="#D3D1C7" />
    </svg>
  );
}

// ---------------------------------------------------------------
// Pequenos enfeites
// ---------------------------------------------------------------
export function Nuvem({ className = "w-24" }: Props) {
  return (
    <svg viewBox="0 0 120 60" className={className} aria-hidden="true" focusable="false">
      <path
        d="M25 52 Q5 52 8 36 Q10 22 28 24 Q32 8 52 10 Q68 4 78 20 Q98 16 104 32 Q116 36 110 48 Q106 54 96 52 Z"
        fill="#FFFFFF"
        stroke="#CFE8F7"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Estrela({ className = "w-5 h-5", cor = "#FFC72C" }: Props & { cor?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path d="M12 2 L14.9 8.6 L22 9.3 L16.6 14 L18.2 21 L12 17.3 L5.8 21 L7.4 14 L2 9.3 L9.1 8.6 Z" fill={cor} strokeLinejoin="round" />
    </svg>
  );
}

export function Coracao({ className = "w-5 h-5", cor = "#E03A3E" }: Props & { cor?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path d="M12 21 C5 15 2 11.5 2 8 A5 5 0 0 1 12 6 A5 5 0 0 1 22 8 C22 11.5 19 15 12 21 Z" fill={cor} />
    </svg>
  );
}

export function Flor({ className = "w-8", petala = "#F49AC1" }: Props & { petala?: string }) {
  return (
    <svg viewBox="0 0 50 80" className={className} aria-hidden="true" focusable="false">
      <path d="M25 40 L25 78" stroke="#3F9E62" strokeWidth="3.5" strokeLinecap="round" />
      <ellipse cx="16" cy="62" rx="8" ry="3.8" transform="rotate(-30 16 62)" fill="#6DBE45" />
      <ellipse cx="34" cy="56" rx="8" ry="3.8" transform="rotate(30 34 56)" fill="#6DBE45" />
      {[
        [25, 14],
        [35.5, 21.6],
        [31.5, 33.9],
        [18.5, 33.9],
        [14.5, 21.6],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="8.5" fill={petala} />
      ))}
      <circle cx="25" cy="25" r="6.5" fill="#FFC72C" />
    </svg>
  );
}

export function Arvore({ className = "w-14" }: Props) {
  return (
    <svg viewBox="0 0 70 100" className={className} aria-hidden="true" focusable="false">
      <rect x="30" y="54" width="10" height="44" rx="4" fill="#A9744F" />
      <circle cx="35" cy="36" r="26" fill="#8DBB2E" />
      <circle cx="20" cy="48" r="15" fill="#A6CE3A" />
      <circle cx="50" cy="48" r="15" fill="#A6CE3A" />
      <circle cx="30" cy="30" r="3.5" fill="#E03A3E" />
      <circle cx="45" cy="40" r="3.5" fill="#E03A3E" />
      <circle cx="24" cy="46" r="3.5" fill="#E03A3E" />
    </svg>
  );
}

// Faixa de grama para o pé da página
export function Grama({ className = "" }: Props) {
  const ondas = Array.from({ length: 40 }, (_, i) => `Q${i * 30 + 15} 6 ${i * 30 + 30} 22`).join(" ");
  return (
    <svg viewBox="0 0 1200 60" preserveAspectRatio="none" className={`block w-full h-12 sm:h-16 ${className}`} aria-hidden="true" focusable="false">
      <path d={`M0 22 ${ondas} L1200 60 L0 60 Z`} fill="#A6CE3A" />
      <path d="M0 40 Q150 28 300 40 T600 40 T900 40 T1200 40 L1200 60 L0 60 Z" fill="#8DBB2E" />
    </svg>
  );
}

// Cenário do pé da página: grama, árvores e flores (pequeno, para não poluir)
export function CenarioRodape() {
  return (
    <div className="relative mt-6 select-none" aria-hidden="true">
      <div className="relative mx-auto flex max-w-xl items-end justify-center gap-1 px-4">
        <Arvore className="hidden w-10 -mr-1 sm:block" />
        <Flor className="hidden w-5 sm:block" petala="#F49AC1" />
        <Flor className="hidden w-5 sm:block" petala="#A98BC9" />
        <Arvore className="hidden w-10 -ml-1 sm:block" />
      </div>
      <div className="-mt-2">
        <Grama className="!h-5 sm:!h-6" />
      </div>
    </div>
  );
}
