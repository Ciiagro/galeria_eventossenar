"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGetCache, API_BASE } from "./api";

// Cada ano é um ciclo (edição) do Projeto Valores Humanos.
export type Ciclo = {
  id: string;
  nome: string;
  data_inicio: string; // AAAA-MM-DD
  data_fim: string;
  ativo: boolean;
};

type DocComCiclo = { ciclo_id?: string | null; data_realizacao?: string | null };

/** O documento pertence ao ciclo? (documentos antigos, sem ciclo, caem pela data de realização) */
export function noCiclo(doc: DocComCiclo, cicloId: string, ciclos: Ciclo[]) {
  if (!cicloId) return true; // "todos os ciclos"
  if (doc.ciclo_id) return doc.ciclo_id === cicloId;
  const ciclo = ciclos.find((c) => c.id === cicloId);
  const data = (doc.data_realizacao ?? "").slice(0, 10);
  return Boolean(ciclo && data && data >= ciclo.data_inicio && data <= ciclo.data_fim);
}

/** Ciclo + mês (1-12) pela data de realização. Mês vazio = o ciclo todo. */
export function noCicloEMes(doc: DocComCiclo, cicloId: string, ciclos: Ciclo[], mes: string) {
  if (!noCiclo(doc, cicloId, ciclos)) return false;
  if (!mes) return true;
  return Number((doc.data_realizacao ?? "").slice(5, 7)) === Number(mes);
}

/**
 * Carrega os ciclos. `publico` usa a rota da galeria (sem login).
 * Se a tabela de ciclos ainda não existir (migração não rodada), devolve lista
 * vazia e as telas continuam funcionando sem filtro de ciclo.
 */
export function useCiclos(publico = false) {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const buscar = publico
      ? fetch(`${API_BASE}/api/galeria?ciclos=1`).then((r) => (r.ok ? r.json() : []))
      : apiGetCache("/api/ciclos", 60_000);
    buscar
      .then((lista: Ciclo[]) => { if (!cancelado) setCiclos(Array.isArray(lista) ? lista : []); })
      .catch(() => { if (!cancelado) setCiclos([]); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [publico]);

  const ativo = useMemo(() => ciclos.find((c) => c.ativo) ?? ciclos[0] ?? null, [ciclos]);
  return { ciclos, ativo, carregando };
}

/** "Ciclo 2026" / "Edição 2026" / "2026" -> "Edição 2026" (para textos, mesmo que o nome gravado ainda comece com "Ciclo"). */
export function rotuloEdicao(nome?: string | null): string {
  const resto = (nome ?? "").replace(/^\s*(ciclo|edi[cç][aã]o)(?![\p{L}\d])[\s\-:]*/iu, "").trim();
  return resto ? `Edição ${resto}` : "";
}

/**
 * Ciclo escolhido numa tela. Começa no ciclo ativo; "" significa "todos os ciclos";
 * setCicloId(null) volta para o ciclo ativo.
 */
export function useFiltroCiclo(publico = false) {
  const { ciclos, ativo, carregando } = useCiclos(publico);
  const [escolha, setEscolha] = useState<string | null>(null);
  const cicloId = escolha ?? ativo?.id ?? "";
  const ciclo = ciclos.find((c) => c.id === cicloId) ?? null;
  const ehPadrao = escolha === null || escolha === (ativo?.id ?? "");
  return { ciclos, ativo, ciclo, carregando, cicloId, setCicloId: setEscolha, ehPadrao };
}
