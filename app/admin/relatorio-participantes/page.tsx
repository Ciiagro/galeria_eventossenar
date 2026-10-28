"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { TituloPagina, Indicador } from "@/components/TituloPagina";
import { apiGet } from "@/lib/api";

type EscolaRel = { id: string; nome: string; documentos: number };
type MunicipioRel = {
  municipio_id: number; municipio: string; coordenador: string | null;
  adesao_status: "rascunho" | "enviada" | "aprovada"; aprovada_em: string | null; escolas: EscolaRel[];
};

const SITUACAO = {
  aprovada: { texto: "Adesão aprovada", cor: "#17613B", fundo: "#E3F4EA" },
  enviada: { texto: "Aguardando aprovação", cor: "#0F4C85", fundo: "#E2EFFB" },
  rascunho: { texto: "Preenchendo a adesão", cor: "#6E4B00", fundo: "#FFF3CC" },
} as const;

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function RelatorioParticipantesPage() {
  return (
    <AdminGuard>
      <Relatorio />
    </AdminGuard>
  );
}

function Relatorio() {
  const [dados, setDados] = useState<MunicipioRel[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [soAprovados, setSoAprovados] = useState(true);

  useEffect(() => { apiGet("/api/admin/relatorio-participantes").then((r) => setDados(r.municipios ?? [])).catch((e) => setErro(e.message)); }, []);

  const lista = useMemo(() => {
    const q = norm(busca.trim());
    return (dados ?? [])
      .filter((m) => !soAprovados || m.adesao_status === "aprovada")
      .map((m) => ({ ...m, escolas: q && !norm(m.municipio).includes(q) ? m.escolas.filter((e) => norm(e.nome).includes(q)) : m.escolas }))
      .filter((m) => !q || norm(m.municipio).includes(q) || m.escolas.length > 0);
  }, [dados, busca, soAprovados]);

  const totalEscolas = lista.reduce((n, m) => n + m.escolas.length, 0);

  function baixarExcel() {
    const linhas = [["Município", "Situação da adesão", "Coordenador", "Escola participante", "Documentos enviados"]];
    lista.forEach((m) => {
      if (m.escolas.length === 0) linhas.push([m.municipio, SITUACAO[m.adesao_status].texto, m.coordenador ?? "", "(nenhuma escola informada)", ""]);
      m.escolas.forEach((e) => linhas.push([m.municipio, SITUACAO[m.adesao_status].texto, m.coordenador ?? "", e.nome, String(e.documentos)]));
    });
    const csv = linhas.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "municipios-e-escolas-participantes.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="p-3 sm:p-5">
      <style>{`@media print { aside, nav, .nao-imprimir { display: none !important; } body { background: #fff !important; } .quebra { break-inside: avoid; } }`}</style>
      <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
        <TituloPagina
          descricao="Municípios e as escolas que participam do projeto (as do termo de adesão aprovado)."
          acao={<Indicador valor={totalEscolas.toLocaleString("pt-BR")} rotulo={`${totalEscolas === 1 ? "escola" : "escolas"} em ${lista.length} ${lista.length === 1 ? "município" : "municípios"}`} />}
        >
          Relatório de participantes
        </TituloPagina>

        <div className="nao-imprimir mt-5 flex flex-wrap items-center gap-3">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar município ou escola..."
            className="min-w-[240px] flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-brand-dark/85">
            <input type="checkbox" checked={soAprovados} onChange={(e) => setSoAprovados(e.target.checked)} />
            Só adesões aprovadas
          </label>
          <button onClick={baixarExcel} className="rounded-lg border border-brand-light/30 bg-white px-4 py-2 text-sm font-semibold text-brand-light hover:bg-brand-light/5">Baixar Excel</button>
          <button onClick={() => window.print()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Imprimir</button>
        </div>

        {erro && <p className="mt-4 text-sm text-status-pendente">{erro}</p>}
        {!dados && !erro && <p className="mt-4 text-sm text-brand-dark/75">Carregando...</p>}
        {dados && lista.length === 0 && <p className="mt-6 text-center text-sm text-brand-dark/75">Nenhum município encontrado.</p>}

        <div className="mt-5 space-y-4">
          {lista.map((m) => {
            const sit = SITUACAO[m.adesao_status];
            return (
              <section key={m.municipio_id} className="quebra overflow-hidden rounded-xl border border-black/10">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-brand-light/[0.06] px-4 py-3">
                  <h2 className="text-base font-bold text-brand-dark">{m.municipio}</h2>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: sit.fundo, color: sit.cor }}>{sit.texto}</span>
                  {m.coordenador && <span className="text-xs text-brand-dark/75">Coordenador(a): {m.coordenador}</span>}
                  <span className="ml-auto text-sm font-semibold text-brand-dark/85">{m.escolas.length} {m.escolas.length === 1 ? "escola" : "escolas"}</span>
                </header>
                {m.escolas.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-brand-dark/70">Nenhuma escola informada na adesão ainda.</p>
                ) : (
                  <ul className="divide-y divide-black/5">
                    {m.escolas.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                        <span className="text-brand-dark">{e.nome}</span>
                        <span className={`shrink-0 text-xs font-semibold ${e.documentos > 0 ? "text-[#17613B]" : "text-brand-dark/55"}`}>
                          {e.documentos > 0 ? `${e.documentos} ${e.documentos === 1 ? "documento enviado" : "documentos enviados"}` : "nada enviado"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
