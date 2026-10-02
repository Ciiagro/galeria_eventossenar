import { CenarioRodape } from "@/components/Desenhos";

// Fundo de todas as telas do sistema (menos login e galeria, que têm o próprio):
// creme liso e, só no pé da página, as crianças na grama (pequeno, para não poluir).
export function FundoSistema({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen min-w-0 flex-1 flex-col bg-sol-creme">
      <div className="flex-1">{children}</div>
      <CenarioRodape />
    </main>
  );
}
