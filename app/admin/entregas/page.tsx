"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { TituloPagina, Indicador } from "@/components/TituloPagina";
import { apiGet } from "@/lib/api";

type Coluna = { nome: string; abre: string; prazo: string | null; aberto: boolean; atrasado: boolean };
type Entrega = { total: number; enviado_em: string | null; link: string | null; escolas?: Record<string, { enviado_em: string | null; link: string | null }> };
type Linha = { id: number | string; nome: string | null; coordenador: string | null; entregas: Record<string, Entrega>; escolas: { id: string; nome: string }[] };

const dataBR = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");
const mesBR = (d: string | null) => (d ? d.slice(0, 7).split("-").reverse().join("/") : "");

export default function EntregasPage() {
  return (
    <AdminGuard>
      <Entregas />
    </AdminGuard>
  );
}

function Entregas() {
  const [dados, setDados] = useState<{ colunas: Coluna[]; municipios: Linha[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [soPendentes, setSoPendentes] = useState(false);
  const [detalhe, setDetalhe] = useState<{ m: Linha; c: Coluna } | null>(null);

  useEffect(() => { apiGet("/api/admin/entregas").then(setDados).catch((e) => setErro(e.message)); }, []);

  // formações agrupadas: "1ª Formação" -> [Relatório, Lista de Presença]; Portfólio sozinho
  const grupos = useMemo(() => {
    const mapa = new Map<string, Coluna[]>();
    (dados?.colunas ?? []).forEach((c) => {
      const chave = c.nome.includes(" - ") ? c.nome.split(" - ")[1] : c.nome;
      mapa.set(chave, [...(mapa.get(chave) ?? []), c]);
    });
    return [...mapa.entries()];
  }, [dados]);

  const colunas = dados?.colunas ?? [];
  // quantas escolas já foram cobertas (entrega pode ser parcial: parte das escolas agora, o resto depois)
  const cobertura = (m: Linha, c: Coluna) => {
    const e = m.entregas[c.nome];
    if (!e) return { feito: 0, total: m.escolas.length, completo: false, algum: false };
    if (m.escolas.length === 0) return { feito: 1, total: 1, completo: true, algum: true };
    const feito = m.escolas.filter((x) => e.escolas?.[x.id]).length;
    return { feito, total: m.escolas.length, completo: feito >= m.escolas.length, algum: feito > 0 };
  };
  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (dados?.municipios ?? []).filter((m) => {
      if (q && !`${m.nome ?? ""} ${m.coordenador ?? ""}`.toLowerCase().includes(q)) return false;
      if (soPendentes) return colunas.some((c) => c.aberto && !cobertura(m, c).completo);
      return true;
    });
  }, [dados, busca, soPendentes, colunas]);

  const total = dados?.municipios.length ?? 0;
  const atrasados = (dados?.municipios ?? []).reduce((n, m) => n + colunas.filter((c) => c.atrasado && !cobertura(m, c).completo).length, 0);

  return (
    <div className="p-3 sm:p-5">
      <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
        <TituloPagina
          descricao="Veja de uma vez o que cada município já entregou: relatórios, listas de presença e portfólio."
          acao={<Indicador valor={atrasados} rotulo={atrasados === 1 ? "em atraso" : "em atraso"} alerta={atrasados > 0} />}
        >
          Entregas
        </TituloPagina>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar município ou coordenador..."
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 sm:w-80"
          />
          <label className="flex items-center gap-2 text-sm text-brand-dark">
            <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
            Só quem tem pendência
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-brand-dark/75">
            <span><b className="text-[#17613B]">✓</b> entregue</span>
            <span><b className="text-[#8A6D00]">2/3</b> parcial</span>
            <span><b className="text-[#9B2C25]">Atrasado</b></span>
            <span><b className="text-[#8A6D00]">Pendente</b></span>
            <span><b className="text-brand-dark/45">—</b> ainda não abriu</span>
          </div>
        </div>

        {erro && <p className="mt-4 text-sm text-status-pendente">{erro}</p>}
        {!dados && !erro && <p className="mt-4 text-sm text-brand-dark/75">Carregando...</p>}
        {dados && linhas.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/75">Nenhum município encontrado.</p>}

        {dados && linhas.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-black/5">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-[#F6F9F7]">
                <tr>
                  <th rowSpan={2} className="sticky left-0 z-10 bg-[#F6F9F7] px-3 py-2 align-bottom font-bold text-brand-dark">Município</th>
                  {grupos.map(([nome, cols]) => (
                    <th key={nome} colSpan={cols.length} className="border-l border-black/5 px-3 py-2 text-center font-bold text-brand-dark">
                      {nome}
                      <span className="block text-[11px] font-normal text-brand-dark/65">{cols[0].prazo ? `até ${mesBR(cols[0].prazo)}` : "documento final"}</span>
                    </th>
                  ))}
                </tr>
                <tr>
                  {grupos.flatMap(([, cols]) => cols).map((c) => (
                    <th key={c.nome} className="border-l border-black/5 px-3 py-1.5 text-center text-xs font-semibold text-brand-dark/80">
                      {c.nome.startsWith("Relatório") ? "Relatório" : c.nome.startsWith("Lista") ? "Lista" : "Portfólio"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {linhas.map((m) => (
                  <tr key={m.id} className="hover:bg-[#F3FAF6]">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2.5">
                      <span className="block font-bold text-brand-dark">{m.nome}</span>
                      <span className="block text-xs text-brand-dark/65">{m.coordenador}</span>
                    </td>
                    {grupos.flatMap(([, cols]) => cols).map((c) => {
                      const cob = cobertura(m, c);
                      return (
                        <td key={c.nome} className="border-l border-black/5 px-3 py-2.5 text-center">
                          {cob.completo ? (
                            <button type="button" onClick={() => setDetalhe({ m, c })} title="Ver as escolas" className="inline-flex flex-col items-center rounded-lg bg-[#E3F4EA] px-2.5 py-1 text-[#17613B] hover:ring-2 hover:ring-[#17613B]/30">
                              <b>✓</b><span className="text-[10px] font-semibold">{dataBR(m.entregas[c.nome]?.enviado_em ?? null)}</span>
                            </button>
                          ) : cob.algum ? (
                            <button type="button" onClick={() => setDetalhe({ m, c })} title="Entrega parcial: veja quais escolas faltam" className="inline-flex flex-col items-center rounded-lg bg-[#FFF3CC] px-2.5 py-1 text-[#8A6D00] hover:ring-2 hover:ring-[#8A6D00]/30">
                              <b>{cob.feito}/{cob.total}</b><span className="text-[10px] font-semibold">parcial</span>
                            </button>
                          ) : !c.aberto ? (
                            <span className="text-brand-dark/45" title={`Abre em ${mesBR(c.abre)}`}>—</span>
                          ) : c.atrasado ? (
                            <button type="button" onClick={() => setDetalhe({ m, c })} className="rounded-full bg-[#F8E1DF] px-2.5 py-1 text-xs font-bold text-[#9B2C25]">Atrasado</button>
                          ) : (
                            <button type="button" onClick={() => setDetalhe({ m, c })} className="rounded-full bg-[#FFF3CC] px-2.5 py-1 text-xs font-bold text-[#8A6D00]">Pendente</button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#F6F9F7]">
                <tr>
                  <td className="sticky left-0 z-10 bg-[#F6F9F7] px-3 py-2 text-xs font-bold text-brand-dark">Entregues</td>
                  {grupos.flatMap(([, cols]) => cols).map((c) => (
                    <td key={c.nome} className="border-l border-black/5 px-3 py-2 text-center text-xs font-bold text-brand-dark">
                      {(dados?.municipios ?? []).filter((m) => cobertura(m, c).completo).length} de {total}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      {detalhe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/40 p-4" onClick={() => setDetalhe(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-brand-dark">{detalhe.c.nome}</h2>
            <p className="text-sm text-brand-dark/75">{detalhe.m.nome} · {cobertura(detalhe.m, detalhe.c).feito} de {cobertura(detalhe.m, detalhe.c).total} escolas</p>
            <ul className="mt-3 divide-y divide-black/5 rounded-xl border border-black/5">
              {detalhe.m.escolas.length === 0 && <li className="p-3 text-sm text-brand-dark/75">Este município ainda não tem escolas na adesão aprovada.</li>}
              {detalhe.m.escolas.map((esc) => {
                const ok = detalhe.m.entregas[detalhe.c.nome]?.escolas?.[esc.id];
                return (
                  <li key={esc.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ok ? "bg-[#E3F4EA] text-[#17613B]" : detalhe.c.atrasado ? "bg-[#F8E1DF] text-[#9B2C25]" : "bg-[#FFF3CC] text-[#8A6D00]"}`}>{ok ? "✓" : "•"}</span>
                    <span className="min-w-0 flex-1 font-medium text-brand-dark">{esc.nome}</span>
                    {ok ? (
                      <span className="shrink-0 text-xs text-brand-dark/70">
                        {dataBR(ok.enviado_em)} {ok.link && <a href={ok.link} target="_blank" rel="noreferrer" className="ml-1 font-semibold text-brand-light hover:underline">Abrir PDF</a>}
                      </span>
                    ) : <span className="shrink-0 text-xs font-semibold text-brand-dark/60">{detalhe.c.atrasado ? "Atrasado" : "Falta enviar"}</span>}
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 text-right">
              <button type="button" onClick={() => setDetalhe(null)} className="rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-black/5">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
