"use client";

import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, Projeto } from "@/lib/api";
import { FolderIcon } from "@/components/icons";
import { AdminGuard } from "@/components/AdminGuard";

export default function ProjetosPageGuarded() {
  return (
    <AdminGuard>
      <ProjetosPage />
    </AdminGuard>
  );
}

function ProjetosPage() {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    apiGet("/api/projetos")
      .then(setProjetos)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  function novoProjeto() {
    setProjetoId(null);
    setNome("");
    setDescricao("");
    setMensagem(null);
    setErro(null);
    setMostrarFormulario(true);
  }

  function editar(p: Projeto) {
    setProjetoId(p.id);
    setNome(p.nome);
    setDescricao(p.descricao ?? "");
    setMensagem(null);
    setErro(null);
    setMostrarFormulario(true);
  }

  async function excluir(id: string) {
    if (!window.confirm("Excluir este projeto? Documentos já enviados com ele mantêm o histórico, só deixam de ter o vínculo.")) return;
    setErro(null);
    try {
      await apiDelete(`/api/projetos?id=${id}`);
      setProjetos((atual) => atual.filter((p) => p.id !== id));
      setMensagem("Projeto excluído.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir projeto.");
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMensagem(null);
    if (!nome.trim()) {
      setErro("Informe o nome do projeto.");
      return;
    }

    setSalvando(true);
    try {
      await apiPost("/api/projetos", { id: projetoId ?? undefined, nome, descricao });
      setMensagem(projetoId ? "Projeto atualizado." : "Projeto criado. Já aparece no formulário de envio.");
      setMostrarFormulario(false);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar projeto.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <div className="w-11 h-11 rounded-xl bg-brand-light/10 text-brand-light flex items-center justify-center mb-4">
            <FolderIcon className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-semibold text-brand-dark">Projetos</h1>
          <p className="text-sm text-brand-dark/90 mt-1">
            Catálogo dos projetos/programas do ano. Como muda a cada ano, cadastre aqui os novos e pode apagar os antigos.
          </p>
        </div>
        <button
          type="button"
          onClick={novoProjeto}
          className="px-4 py-2.5 rounded-lg bg-brand-light text-white text-sm font-medium hover:bg-brand-accent"
        >
          + Novo projeto
        </button>
      </div>

      {erro && <div className="rounded-md bg-status-pendente/10 text-status-pendente px-4 py-3 text-sm mb-5">{erro}</div>}
      {mensagem && (
        <div className="rounded-md bg-status-completo/10 text-status-completo px-4 py-3 text-sm mb-5">{mensagem}</div>
      )}

      {mostrarFormulario && (
        <form onSubmit={salvar} className="bg-white border border-black/5 rounded-xl shadow-sm p-6 space-y-5 max-w-2xl mb-8">
          <div>
            <label htmlFor="nome" className="block text-sm font-medium text-brand-dark mb-1.5">
              Nome do projeto *
            </label>
            <input
              id="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Educação do Campo 2027"
              className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
            />
          </div>
          <div>
            <label htmlFor="descricao" className="block text-sm font-medium text-brand-dark mb-1.5">
              Descrição (opcional)
            </label>
            <textarea
              id="descricao"
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setMostrarFormulario(false)}
              className="sm:w-32 px-5 py-3 rounded-lg border border-black/10 text-brand-dark/85 text-sm font-medium hover:bg-black/5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 px-5 py-3 rounded-lg bg-brand-light text-white text-sm font-medium hover:bg-brand-accent disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Salvar projeto"}
            </button>
          </div>
        </form>
      )}

      <section className="max-w-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-brand-dark">Projetos cadastrados</h2>
          <span className="text-sm text-brand-dark/90">
            {projetos.length} cadastrado{projetos.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="bg-white border border-black/5 rounded-xl shadow-sm divide-y divide-black/5">
          {carregando && <p className="p-5 text-sm text-brand-dark/85">Carregando...</p>}
          {!carregando && projetos.length === 0 && (
            <p className="p-5 text-sm text-brand-dark/85">Nenhum projeto cadastrado ainda.</p>
          )}
          {projetos.map((p) => (
            <div key={p.id} className="p-4 hover:bg-brand-light/5 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-brand-dark">{p.nome}</p>
                  {p.descricao && <p className="text-xs text-brand-dark/90 mt-0.5">{p.descricao}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => editar(p)}
                    className="text-xs text-brand-light border border-brand-light/30 rounded-md px-2 py-1"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => excluir(p.id)}
                    className="text-xs text-status-pendente border border-status-pendente/30 rounded-md px-2 py-1"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
