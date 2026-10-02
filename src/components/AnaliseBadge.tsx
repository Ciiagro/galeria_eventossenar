import type { Documento } from "@/lib/api";
import { CheckIcon, AlertIcon } from "@/components/icons";

const ORIGEM: Record<string, string> = {
  visita: "Visita",
  apoio_relatorios: "Apoio de relatórios",
};

function dataHora(texto: string) {
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// Mostra a análise prévia feita pelo Apoiador de Relatórios (e a origem do envio).
export function AnaliseBadge({ doc }: { doc: Pick<Documento, "analise_status" | "analise_obs" | "analise_por_nome" | "analise_em" | "origem"> }) {
  const origem = doc.origem ? ORIGEM[doc.origem] : null;
  if (!doc.analise_status && !origem) return null;

  return (
    <div className="mt-2.5 space-y-2">
      {origem && (
        <span className="inline-flex items-center rounded-full bg-[#E4D7F0] px-2.5 py-0.5 text-xs font-semibold text-[#5B3485]">
          Enviado por: {origem}
        </span>
      )}
      {doc.analise_status && (
        <div
          className={`rounded-xl border px-3 py-2 text-[13px] ${
            doc.analise_status === "recomendado"
              ? "border-[#2F9E62]/30 bg-[#E3F4EA] text-[#17613B]"
              : "border-[#F2B705]/50 bg-[#FFF3CC] text-[#6E4B00]"
          }`}
        >
          <p className="flex flex-wrap items-center gap-1.5 font-bold">
            {doc.analise_status === "recomendado" ? <CheckIcon className="h-4 w-4" /> : <AlertIcon className="h-4 w-4" />}
            {doc.analise_status === "recomendado" ? "Análise: recomendado aprovar" : "Análise: pede ajustes"}
            <span className="font-normal opacity-80">
              {doc.analise_por_nome ? `· ${doc.analise_por_nome}` : ""} {doc.analise_em ? `· ${dataHora(doc.analise_em)}` : ""}
            </span>
          </p>
          {doc.analise_obs && <p className="mt-1 whitespace-pre-line">{doc.analise_obs}</p>}
        </div>
      )}
    </div>
  );
}
