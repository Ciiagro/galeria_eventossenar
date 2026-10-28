// Fundo das telas de login e adesão: só o creme, sem as manchas laterais.
export function FundoLogin({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-sol-creme ${className}`}>
      <div className="relative w-full">{children}</div>
    </div>
  );
}
