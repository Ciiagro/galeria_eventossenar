"use client";

import { TituloPagina, Indicador } from "@/components/TituloPagina";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { AdminGuard } from "@/components/AdminGuard";
import type { Ciclo } from "@/lib/ciclos";
import { formatarData } from "@/components/DocumentoUI";
import { BotaoEditar, BotaoExcluir } from "@/components/BotoesIcone";

const CAMPO =
  "w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light";

export default function CiclosPageGuarded() {
  return (
    <AdminGuard>
      <CiclosPage />
    </AdminGuard>
  );
}

function CiclosPage() {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editandoId, setEditandoId] = useState<string | "novo" | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    apiGet("/api/ciclos")
      .then(setCiclos)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar(ciclo: Partial<Ciclo> & { nome: string; data_inicio: string; data_fim: string; ativo: boolean }) {
    setErro(null);
    setMensagem(null);
    setSalvando(true);
    try {
      await apiPost("/api/ciclos", ciclo);
      setMensagem(ciclo.id ? "Edição atualizada." : "Edição criada.");
      setEditandoId(null);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar a edição.");
    } finally {
      setSalvando(false);
    }
  }

  async function tornarAtivo(c: Ciclo) {
    if (!window.confirm(`Tornar "${c.nome}" a edição ativa? Painel, mapa e galeria passam a abrir nela, e os novos envios entram nela.`)) return;
    await salvar({ ...c, ativo: true });
  }

  async function excluir(c: Ciclo) {
    if (!window.confirm(`Excluir "${c.nome}"? Só é possível se ele não tiver nenhum documento.`)) return;
    setErro(null);
    setMensagem(null);
    try {
      await apiDelete(`/api/ciclos?id=${c.id}`);
      setMensagem("Edição excluída.");
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir a edição.");
    }
  }

  const proximoAno = Math.max(new Date().getFullYear(), ...ciclos.map((c) => Number(c.data_fim.slice(0, 4)))) + (ciclos.length ? 1 : 0);

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 sm:p-7">
        <TituloPagina
          descricao="Cada ano é uma edição do projeto. Ao ativar uma edição nova, os números do painel recomeçam do zero e as anteriores ficam guardadas."
          acao={
            <div className="flex items-center gap-3">
            <Indicador valor={ciclos.length} rotulo={ciclos.length === 1 ? "edição" : "edições"} />
  <button
    type="button"
    onClick={() => { setEditandoId("novo"); setMensagem(null); setErro(null); }}
    className="whitespace-nowrap bg-brand-light text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-sm hover:bg-brand-accent transition-colors"
  >
    + Nova edição
  </button>
            </div>
          }
        >Edições</TituloPagina>

        {erro && <div className="mt-5 rounded-lg bg-status-pendente/10 text-status-pendente px-4 py-3 text-sm">{erro}</div>}
        {mensagem && <div className="mt-5 rounded-lg bg-status-completo/10 text-status-completo px-4 py-3 text-sm">{mensagem}</div>}

        <div className="mt-6 space-y-3">
          {editandoId === "novo" && (
            <div className="rounded-xl border border-brand-light/40 ring-2 ring-brand-light/20 shadow-md bg-white p-4">
              <p className="font-semibold text-brand-dark mb-3">Nova edição</p>
              <FormularioCiclo
                inicial={{ nome: `Edição ${proximoAno}`, data_inicio: `${proximoAno}-01-01`, data_fim: `${proximoAno}-12-31`, ativo: false }}
                salvando={salvando}
                onSalvar={salvar}
                onCancelar={() => setEditandoId(null)}
              />
            </div>
          )}

          {carregando && <p className="text-sm text-brand-dark/75">Carregando...</p>}
          {!carregando && ciclos.length === 0 && editandoId !== "novo" && (
            <div className="rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-brand-dark/75">
              Nenhuma edição cadastrada. Rode o arquivo <code>sql/migration_valores_ciclos.sql</code> no Supabase ou crie a primeira edição aqui.
            </div>
          )}

          {ciclos.map((c) => {
            const editando = editandoId === c.id;
            return (
              <article key={c.id} className={`rounded-xl border bg-white p-3 sm:p-4 ${editando ? "border-brand-light/40 ring-2 ring-brand-light/20 shadow-md" : "border-black/5"}`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-brand-dark leading-snug flex flex-wrap items-center gap-2">
                      {c.nome}
                      {c.ativo && <span className="rounded-full bg-sol/30 text-[#6E4B00] px-2.5 py-0.5 text-xs font-semibold">Ativa</span>}
                    </h2>
                    <p className="text-sm text-brand-dark/80">{formatarData(c.data_inicio)} a {formatarData(c.data_fim)}</p>
                  </div>
                  {!editando && (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {!c.ativo && (
                        <button type="button" onClick={() => tornarAtivo(c)} className="rounded-lg bg-brand-light px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-accent">
                          Tornar ativa
                        </button>
                      )}
                      <BotaoEditar onClick={() => { setEditandoId(c.id); setMensagem(null); setErro(null); }} rotulo={c.nome} />
                      {!c.ativo && <BotaoExcluir onClick={() => excluir(c)} rotulo={c.nome} />}
                    </div>
                  )}
                </div>
                {editando && (
                  <div className="mt-4 border-t border-black/10 pt-4">
                    <FormularioCiclo
                      inicial={c}
                      salvando={salvando}
                      onSalvar={salvar}
                      onCancelar={() => setEditandoId(null)}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FormularioCiclo({
  inicial,
  salvando,
  onSalvar,
  onCancelar,
}: {
  inicial: Partial<Ciclo> & { nome: string; data_inicio: string; data_fim: string; ativo: boolean };
  salvando: boolean;
  onSalvar: (ciclo: Partial<Ciclo> & { nome: string; data_inicio: string; data_fim: string; ativo: boolean }) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial.nome);
  const [inicio, setInicio] = useState(inicial.data_inicio);
  const [fim, setFim] = useState(inicial.data_fim);
  const [ativo, setAtivo] = useState(inicial.ativo);
  const jaAtivo = Boolean(inicial.id && inicial.ativo);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSalvar({ ...inicial, nome: nome.trim(), data_inicio: inicio, data_fim: fim, ativo });
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancelar()}
      className="space-y-4"
    >
      <div>
        <label htmlFor="nome-ciclo" className="block text-sm font-medium text-brand-dark mb-1.5">Nome</label>
        <input id="nome-ciclo" required value={nome} onChange={(e) => setNome(e.target.value)} className={CAMPO} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="inicio-ciclo" className="block text-sm font-medium text-brand-dark mb-1.5">Início</label>
          <input id="inicio-ciclo" type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)} className={CAMPO} />
        </div>
        <div>
          <label htmlFor="fim-ciclo" className="block text-sm font-medium text-brand-dark mb-1.5">Fim</label>
          <input id="fim-ciclo" type="date" required value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} className={CAMPO} />
        </div>
      </div>
      {!jaAtivo && (
        <label className="flex items-start gap-2 text-sm text-brand-dark">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="mt-0.5" />
          <span>Tornar esta a edição ativa (o painel e os novos envios passam a usar ela)</span>
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} disabled={salvando} className="px-3 py-2 rounded-lg border border-black/10 text-sm font-medium text-brand-dark/85 hover:bg-brand-light/5 disabled:opacity-50">
          Cancelar
        </button>
        <button type="submit" disabled={salvando || !nome.trim()} className="px-4 py-2 rounded-lg bg-status-completo text-white text-sm font-semibold disabled:opacity-50">
          {salvando ? "Salvando..." : "Salvar edição"}
        </button>
      </div>
    </form>
  );
}
