const STYLES: Record<string, string> = {
  completo: "bg-status-completo/10 text-status-completo",
  aprovado: "bg-status-completo/10 text-status-completo",
  parcial: "bg-status-parcial/10 text-status-parcial",
  pendente: "bg-status-pendente/10 text-status-pendente",
  rejeitado: "bg-black/5 text-brand-dark/70",
  arquivado: "bg-black/5 text-brand-dark/70",
};

const LABELS: Record<string, string> = {
  completo: "Completo",
  aprovado: "Validado",
  parcial: "Parcial",
  pendente: "Aguardando Validação",
  rejeitado: "Arquivado",
  arquivado: "Arquivado",
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
