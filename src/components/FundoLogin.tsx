// Fundo exclusivo da tela de login: creme com manchas suaves nos cantos e um coração de rabisco.
// Só decoração, fica atrás do conteúdo (o foco é a logo, o sol e o formulário).
export function FundoLogin({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-sol-creme ${className}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {/* Canto superior esquerdo: mancha amarela suave */}
        <svg viewBox="0 0 300 300" className="absolute left-0 top-0 w-[20vw] min-w-[100px] max-w-[260px]" fill="none">
          <path d="M0 0H215C205 38 172 50 150 76C126 104 92 100 62 126C36 148 16 172 0 178Z" fill="#FCD770" />
          <path d="M0 0H150C140 30 112 40 92 60C70 82 40 82 0 110Z" fill="#FEE6A0" />
        </svg>

        {/* Canto superior direito: mancha verde suave */}
        <svg viewBox="0 0 300 300" className="absolute right-0 top-0 w-[18vw] min-w-[90px] max-w-[240px]" fill="none">
          <path d="M300 0H108C124 26 160 20 186 42C216 66 252 56 300 92Z" fill="#B5D985" />
          <path d="M300 0H170C186 20 214 18 238 34C262 50 282 46 300 60Z" fill="#9CCB6B" />
        </svg>

        {/* Canto inferior esquerdo: roxo + azul suaves e coração */}
        <svg viewBox="0 0 300 300" className="absolute bottom-0 left-0 w-[20vw] min-w-[100px] max-w-[260px]" fill="none">
          <path d="M0 300V120C34 108 64 138 74 180C84 224 52 258 82 300Z" fill="#DCC9EC" />
          <path d="M0 300V168C42 148 92 172 108 214C120 250 154 272 196 300Z" fill="#6FAEE6" />
          <path d="M0 300V214C30 204 62 222 78 254C86 272 100 288 116 300Z" fill="#9CC8F0" />
          <path
            d="M44 258C30 246 24 236 30 228C35 222 43 224 46 230C49 224 58 223 62 229C67 238 58 248 44 258Z"
            stroke="#FFFFFF"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        </svg>

        {/* Canto inferior direito: mancha amarela suave */}
        <svg viewBox="0 0 300 300" className="absolute bottom-0 right-0 w-[18vw] min-w-[90px] max-w-[240px]" fill="none">
          <path d="M300 300V150C260 160 230 190 215 226C200 262 160 286 128 300Z" fill="#FCD770" />
          <path d="M300 300V210C272 214 250 232 238 256C230 274 210 290 190 300Z" fill="#FEE6A0" />
        </svg>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
