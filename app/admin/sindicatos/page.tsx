"use client";

import { useEffect, useMemo, useState } from "react";
import { TituloPagina, Indicador } from "@/components/TituloPagina";
import { AdminGuard } from "@/components/AdminGuard";
import { SearchIcon } from "@/components/icons";
import { MenuAcoes, Pilula, RodapeTabela, Th, ordenar, type Ordem } from "@/components/TabelaCoordenadores";
import { apiGet, apiPost } from "@/lib/api";
import { mascaraCpf } from "@/lib/mascaras";

type Linha = {
  id: number; nome: string; regiao_faec: string | null; regiao_sebrae: string | null; presidente_nome: string | null;
  telefone1: string | null; telefone2: string | null; email1: string | null; email2: string | null; email3: string | null; email4: string | null;
  sindicato_nome: string | null; email_termo: string | null; cpf_termo: string | null; no_programa: boolean;
};

const POR_PAGINA = 10;
const CAMPO = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30";
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const emailsDe = (l: Linha) => [l.email1, l.email2, l.email3, l.email4].filter((x): x is string => Boolean(x));
const emailEfetivo = (l: Linha) => l.email_termo || emailsDe(l)[0] || null;
// situação: pronto = tem presidente, e-mail e CPF definidos pelo administrador
const situacaoDe = (l: Linha) => (!l.presidente_nome || emailsDe(l).length === 0 ? "sem" : l.cpf_termo ? "pronto" : "cpf");

function Pagina() {
  const [lista, setLista] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [soPrograma, setSoPrograma] = useState(true);
  const [filtro, setFiltro] = useState<"" | "pronto" | "cpf" | "sem">("");
  const [pagina, setPagina] = useState(1);
  const [ordem, setOrdem] = useState<Ordem>({ col: "municipio", dir: "asc" } as Ordem);
  const [edit, setEdit] = useState<Linha | null>(null);
  const [emailSel, setEmailSel] = useState("");
  const [cpfSel, setCpfSel] = useState("");
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    apiGet("/api/admin/sindicatos").then(setLista).catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar."));
  }
  useEffect(carregar, []);

  const filtrada = useMemo(() => {
    const termo = semAcento(busca.trim());
    const base = (lista ?? []).filter((l) =>
      (!soPrograma || l.no_programa) &&
      (!filtro || situacaoDe(l) === filtro) &&
      (!termo || [l.nome, l.sindicato_nome, l.presidente_nome, l.regiao_faec].some((v) => semAcento(v ?? "").includes(termo))));
    return ordenar(base, ordem, (l, col) =>
      col === "sindicato" ? l.sindicato_nome ?? "" : col === "presidente" ? l.presidente_nome ?? "" : col === "regiao" ? l.regiao_faec ?? "" : l.nome);
  }, [lista, busca, soPrograma, filtro, ordem]);
  useEffect(() => setPagina(1), [busca, soPrograma, filtro, ordem]);

  const prontos = (lista ?? []).filter((l) => (!soPrograma || l.no_programa) && situacaoDe(l) === "pronto").length;
  const total = (lista ?? []).filter((l) => !soPrograma || l.no_programa).length;

  function abrir(l: Linha) {
    setErro(null);
    setEdit(l);
    setEmailSel(emailEfetivo(l) ?? "");
    setCpfSel(l.cpf_termo ? mascaraCpf(l.cpf_termo) : "");
  }

  async function salvar() {
    if (!edit) return;
    setSalvando(true);
    setErro(null);
    try {
      await apiPost("/api/admin/municipio-sindicato", { municipio_id: edit.id, email: emailSel, cpf: cpfSel });
      setEdit(null);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const pil = (l: Linha) => {
    const s = situacaoDe(l);
    return s === "pronto" ? <Pilula texto="Pronto" fundo="#E3F4EA" cor="#17613B" /> : s === "cpf" ? <Pilula texto="Falta o CPF" fundo="#FFF3CC" cor="#6E4B00" /> : <Pilula texto="Sem presidente" fundo="#EFEDE4" cor="#4A453A" />;
  };

  return (
    <div className="max-w-[1800px] p-4 sm:p-8">
      <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-7">
        <TituloPagina
          descricao="Confira o sindicato e o presidente de cada município e escolha o e-mail e o CPF que vão para o termo de adesão, antes de ele ir para o coordenador."
          acao={<Indicador valor={`${prontos}/${total}`} rotulo="prontos" />}
        >Sindicatos</TituloPagina>

        {erro && !edit && <div className="mt-4 rounded-lg bg-status-pendente/10 px-4 py-3 text-sm text-status-pendente" role="alert">{erro}</div>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[16rem] flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-dark/60" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar município, sindicato, presidente ou região..." className={`${CAMPO} pl-9`} />
          </div>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className={`${CAMPO} w-auto`}>
            <option value="">Situação: todas</option>
            <option value="pronto">Prontos</option>
            <option value="cpf">Falta o CPF</option>
            <option value="sem">Sem presidente</option>
          </select>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-brand-dark">
            <input type="checkbox" checked={soPrograma} onChange={(e) => setSoPrograma(e.target.checked)} className="h-4 w-4 accent-[#2678C4]" />
            Só municípios do programa
          </label>
        </div>

        <div className="mt-4">
          {lista === null && !erro && <p className="text-sm text-brand-dark/75">Carregando...</p>}
          {lista !== null && filtrada.length === 0 && (
            <div className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/75">Nenhum município encontrado.</div>
          )}
          {filtrada.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-black/5 bg-[#F6F9F7]">
                    <tr>
                      <Th col="municipio" ordem={ordem} onOrdem={setOrdem}>Município</Th>
                      <Th col="regiao" ordem={ordem} onOrdem={setOrdem}>Região</Th>
                      <Th col="sindicato" ordem={ordem} onOrdem={setOrdem}>Sindicato rural</Th>
                      <Th col="presidente" ordem={ordem} onOrdem={setOrdem}>Presidente</Th>
                      <Th>E-mail no termo</Th>
                      <Th>CPF</Th>
                      <Th>Situação</Th>
                      <Th className="text-right">Ações</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/15">
                    {filtrada.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA).map((l) => (
                      <tr key={l.id} className="hover:bg-[#F3FAF6]">
                        <td className="px-4 py-[18px] font-bold text-brand-dark">{l.nome}</td>
                        <td className="px-4 py-[18px] text-brand-dark/85">{l.regiao_faec ?? "—"}</td>
                        <td className="px-4 py-[18px] text-brand-dark">{l.sindicato_nome ?? "—"}</td>
                        <td className="px-4 py-[18px] text-brand-dark">{l.presidente_nome ?? "—"}</td>
                        <td className="px-4 py-[18px] text-brand-dark [overflow-wrap:anywhere]">
                          {emailEfetivo(l) ?? "—"}
                          {emailsDe(l).length > 1 && !l.email_termo && <span className="block text-xs text-[#6E4B00]">{emailsDe(l).length} e-mails: escolha um</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-[18px] text-brand-dark">{l.cpf_termo ? mascaraCpf(l.cpf_termo) : "—"}</td>
                        <td className="px-4 py-[18px]">{pil(l)}</td>
                        <td className="px-4 py-[18px] text-right">
                          <MenuAcoes rotulo={l.nome} itens={[{ rotulo: "Escolher e-mail e CPF", oculto: !l.presidente_nome, onClick: () => abrir(l) }]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-black/5"><RodapeTabela pagina={pagina} total={filtrada.length} porPagina={POR_PAGINA} onChange={setPagina} /></div>
            </div>
          )}
        </div>
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEdit(null)}>
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-brand-dark">{edit.nome}</h3>
              <button type="button" onClick={() => setEdit(null)} className="rounded-lg px-2 py-1 text-lg leading-none text-brand-dark/60 hover:bg-black/5" aria-label="Fechar">×</button>
            </div>
            <div className="space-y-1 text-sm text-brand-dark">
              <p><strong>Sindicato rural:</strong> {edit.sindicato_nome ?? "—"}</p>
              <p><strong>Presidente:</strong> {edit.presidente_nome ?? "—"}</p>
              <p><strong>Região:</strong> {edit.regiao_faec ?? "—"}{edit.regiao_sebrae ? ` · Sebrae: ${edit.regiao_sebrae}` : ""}</p>
              {(edit.telefone1 || edit.telefone2) && <p><strong>Telefones:</strong> {[edit.telefone1, edit.telefone2].filter(Boolean).join(" · ")}</p>}
            </div>
            <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-brand-dark/60">E-mail que vai para o termo</p>
            <div className="space-y-1">
              {emailsDe(edit).map((em) => (
                <label key={em} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm [overflow-wrap:anywhere] ${em.toLowerCase() === emailSel.toLowerCase() ? "bg-[#E2EFFB] font-semibold text-[#0F4C85]" : "hover:bg-black/[0.04]"}`}>
                  <input type="radio" name="email-termo" checked={em.toLowerCase() === emailSel.toLowerCase()} onChange={() => setEmailSel(em)} className="h-4 w-4 accent-[#2678C4]" />
                  {em}
                </label>
              ))}
            </div>
            <label className="mt-3 block text-sm font-semibold text-brand-dark">CPF do presidente
              <input inputMode="numeric" value={cpfSel} onChange={(e) => setCpfSel(mascaraCpf(e.target.value))} placeholder="000.000.000-00" className={`${CAMPO} mt-1 font-normal`} />
            </label>
            {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{erro}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={salvar} disabled={salvando || !emailSel} className="rounded-lg bg-brand-light px-5 py-2 text-sm font-semibold text-white hover:bg-brand-accent disabled:opacity-60">{salvando ? "Salvando..." : "Salvar"}</button>
              <button type="button" onClick={() => setEdit(null)} className="rounded-lg border border-black/10 px-5 py-2 text-sm font-semibold text-brand-dark hover:bg-black/5">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SindicatosPage() {
  return (
    <AdminGuard>
      <Pagina />
    </AdminGuard>
  );
}
