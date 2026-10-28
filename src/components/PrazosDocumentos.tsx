"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

type Linha = { nome: string; abre_em: string; prazo: string | null };

const CAMPO = "w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light";

const mesDe = (d: string | null) => (d ? d.slice(0, 7) : "");
const primeiroDia = (m: string) => `${m}-01`;
function ultimoDia(m: string) {
  const [a, mes] = m.split("-").map(Number);
  return `${m}-${String(new Date(a, mes, 0).getDate()).padStart(2, "0")}`;
}

// O administrador define, por mês, quando cada documento das formações passa a aparecer para o coordenador e o prazo de envio.
export function PrazosDocumentos() {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { apiGet("/api/admin/prazos-documentos").then(setLinhas).catch((e) => setErro(e.message)); }, []);

  function mudar(nome: string, campo: "abre_em" | "prazo", mes: string) {
    setMsg(null);
    setLinhas((l) => (l ?? []).map((x) => (x.nome === nome ? { ...x, [campo]: mes ? (campo === "abre_em" ? primeiroDia(mes) : ultimoDia(mes)) : null } : x)));
  }

  async function salvar() {
    setSalvando(true); setErro(null); setMsg(null);
    try {
      await apiPost("/api/admin/prazos-documentos", { itens: linhas });
      setMsg("Prazos salvos.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  // uma linha por formação: Relatório e Lista de presença lado a lado; o Portfólio fica sozinho
  const grupos: [string, Linha | undefined, Linha | undefined][] = [];
  (linhas ?? []).forEach((l) => {
    const formacao = l.nome.includes(" - ") ? l.nome.split(" - ")[1] : l.nome;
    let g = grupos.find((x) => x[0] === formacao);
    if (!g) { g = [formacao, undefined, undefined]; grupos.push(g); }
    if (l.nome.startsWith("Lista")) g[2] = l; else g[1] = l;
  });

  if (!linhas) return erro ? <p className="mt-6 text-sm text-status-pendente">{erro}</p> : null;
  return (
    <section className="mt-6 rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-bold text-brand-dark">Prazos dos documentos das formações</h2>
      <p className="mt-1 text-sm text-brand-dark/75">
        Escolha o mês em que cada documento passa a aparecer para o coordenador e o mês limite de envio. O Portfólio é o documento final e pode ficar sem prazo.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[#F6F9F7] text-brand-dark">
            <tr>
              <th rowSpan={2} className="px-3 py-1.5 align-middle font-bold">Formação</th>
              <th colSpan={2} className="border-l border-black/10 px-3 py-1.5 text-center font-bold">Relatório</th>
              <th colSpan={2} className="border-l border-black/10 px-3 py-1.5 text-center font-bold">Lista de presença</th>
            </tr>
            <tr className="text-xs text-brand-dark/75">
              <th className="border-l border-black/10 px-3 pb-1.5 font-semibold">Aparece em</th>
              <th className="px-3 pb-1.5 font-semibold">Prazo</th>
              <th className="border-l border-black/10 px-3 pb-1.5 font-semibold">Aparece em</th>
              <th className="px-3 pb-1.5 font-semibold">Prazo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {grupos.map(([formacao, relatorio, lista]) => (
              <tr key={formacao}>
                <td className="px-3 py-1.5 font-semibold text-brand-dark">{formacao}</td>
                {[relatorio, lista].map((l, k) => l ? (
                  [
                    <td key={`${k}a`} className={`px-2 py-1.5 ${k === 1 ? "border-l border-black/10" : "border-l border-black/10"}`}><input type="month" aria-label={`${l.nome}: aparece em`} className={CAMPO} value={mesDe(l.abre_em)} onChange={(e) => mudar(l.nome, "abre_em", e.target.value)} /></td>,
                    <td key={`${k}b`} className="px-2 py-1.5"><input type="month" aria-label={`${l.nome}: prazo`} className={CAMPO} value={mesDe(l.prazo)} onChange={(e) => mudar(l.nome, "prazo", e.target.value)} /></td>,
                  ]
                ) : (
                  <td key={k} colSpan={2} className="border-l border-black/10 px-3 py-1.5 text-center text-brand-dark/40">{formacao === "Portfólio" ? "documento final: sem lista" : "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {erro && <p className="mt-3 text-sm text-status-pendente">{erro}</p>}
      {msg && <p className="mt-3 text-sm font-medium text-status-completo">{msg}</p>}
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={salvar} disabled={salvando} className="rounded-lg bg-status-completo px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {salvando ? "Salvando..." : "Salvar prazos"}
        </button>
      </div>
    </section>
  );
}
