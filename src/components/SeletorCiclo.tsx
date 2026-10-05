import type { Ciclo } from "@/lib/ciclos";

export function SeletorCiclo({
  ciclos,
  valor,
  onChange,
  className,
  id,
}: {
  ciclos: Ciclo[];
  valor: string;
  onChange: (cicloId: string) => void;
  className?: string;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      title="Cada ano é uma edição do projeto"
    >
      <option value="">Todas as edições</option>
      {ciclos.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nome}{c.ativo ? " (ativo)" : ""}
        </option>
      ))}
    </select>
  );
}
