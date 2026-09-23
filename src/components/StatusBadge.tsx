const STYLES: Record<string, string> = {
  completo: "bg-status-completo/10 text-status-completo",
  aprovado: "bg-status-completo/10 text-status-completo",
  parcial: "bg-status-parcial/10 text-status-parcial",
  pendente: "bg-status-pendente/10 text-status-pendente",
  rejeitado: "bg-status-pendente/10 text-status-pendente",
};

const LABELS: Record<string, string> = {
  completo: "Completo",
  aprovado: "Aprovado",
  parcial: "Parcial",
  pendente: "Pendente",
  rejeitado: "Rejeitado",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STYLES[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}

/** Deriva um status "completo/parcial/pendente" a partir do progresso percentual de um município. */
export function progressoParaStatus(pct: number) {
  if (pct >= 100) return "completo";
  if (pct === 0) return "pendente";
  return "parcial";
}
