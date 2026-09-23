"use client";

import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, Projeto } from "@/lib/api";
import { FolderIcon } from "@/components/icons";
import { AdminGuard } from "@/components/AdminGuard";

const CAMPO =
  "w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light";

export default function ProjetosPageGuarded() {
  return (
    <AdminGuard>
      <ProjetosPage />
    </AdminGuard>
  );
}

function ProjetosPage() {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [carregando, setCarregando] = useState(true);
  // "novo" = formulário de novo projeto no topo · id = editando aquele projeto · null = nada aberto
  const [editandoId, setEditandoId] = useState<string | "novo" | null>(null);
  const [salvando, setSalvando] = useState(false);
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

  function abrir(id: string | "novo") {
    setEditandoId(id);
    setMensagem(null);
    setErro(null);
  }

  async function excluir(id: string) {
    if (!window.confirm("Excluir este projeto? Documentos já enviados com ele mantêm o histórico, só deixam de ter o vínculo.")) return;
    setErro(null);
    setMensagem(null);
    try {
      await apiDelete(`/api/projetos?id=${id}`);
      setProjetos((atual) => atual.filter((p) => p.id !== id));
      setEditandoId((atual) => (atual === id ? null : atual));
      setMensagem("Projeto excluído.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir projeto.");
    }
  }

  async function salvar(id: string | null, dados: { nome: string; descricao: string }) {
    setErro(null);
    setMensagem(null);
    setSalvando(true);
    try {
      await apiPost("/api/projetos", { id: id ?? undefined, nome: dados.nome, descricao: dados.descricao });
      setMensagem(id ? "Projeto atualizado." : "Projeto criado. Já aparece no formulário de envio.");
      setEditandoId(null);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar projeto.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 sm:p-7">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark">Projetos</h1>
            <p className="text-sm text-brand-dark/80 mt-1 max-w-2xl">
              Catálogo dos projetos e programas do ano. Como muda a cada ano, cadastre os novos e apague os antigos.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => abrir("novo")}
              className="whitespace-nowrap bg-brand-light text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-sm hover:bg-brand-accent transition-colors"
            >
              + Novo projeto
            </button>
            <div className="rounded-xl bg-brand-light/[0.06] border border-brand-light/10 px-5 py-3 text-center">
              <p className="text-3xl font-bold leading-none text-brand-dark">{projetos.length}</p>
              <p className="text-xs text-brand-dark/75 mt-1">{projetos.length === 1 ? "projeto" : "projetos"}</p>
            </div>
          </div>
        </div>

        {erro && <div className="mt-5 rounded-lg bg-status-pendente/10 text-status-pendente px-4 py-3 text-sm">{erro}</div>}
        {mensagem && <div className="mt-5 rounded-lg bg-status-completo/10 text-status-completo px-4 py-3 text-sm">{mensagem}</div>}

        <div className="mt-6 space-y-3">
          {editandoId === "novo" && (
            <div className="rounded-xl border border-brand-light/40 ring-2 ring-brand-light/20 shadow-md bg-white p-4">
              <p className="font-semibold text-brand-dark mb-3">Novo projeto</p>
              <FormularioProjeto salvando={salvando} onSalvar={(d) => salvar(null, d)} onCancelar={() => setEditandoId(null)} />
            </div>
          )}

          {carregando && <p className="text-sm text-brand-dark/75">Carregando...</p>}
          {!carregando && projetos.length === 0 && editandoId !== "novo" && (
            <div className="rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-brand-dark/75">
              Nenhum projeto cadastrado ainda. Clique em &quot;+ Novo projeto&quot; para começar.
            </div>
          )}

          {projetos.map((p) => {
            const editando = editandoId === p.id;
            return (
              <article
                key={p.id}
                className={`rounded-xl border bg-white p-3 sm:p-4 transition-shadow ${
                  editando ? "border-brand-light/40 ring-2 ring-brand-light/20 shadow-md" : "border-black/5 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-11 h-11 shrink-0 rounded-lg bg-brand-light/[0.06] text-brand-light flex items-center justify-center">
                    <FolderIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-brand-dark leading-snug">{p.nome}</h2>
                    {p.descricao ? (
                      <p className="text-sm text-brand-dark/80 mt-0.5">{p.descricao}</p>
                    ) : (
                      <p className="text-sm text-brand-dark/50 mt-0.5">Sem descrição</p>
                    )}
                  </div>
                  {!editando && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => abrir(p.id)}
                        className="rounded-lg border border-brand-light/30 px-3 py-1.5 text-sm font-semibold text-brand-light hover:bg-brand-light/5"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => excluir(p.id)}
                        className="rounded-lg border border-status-pendente/30 px-3 py-1.5 text-sm font-semibold text-status-pendente hover:bg-status-pendente/5"
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </div>

                {editando && (
                  <div className="mt-4 border-t border-black/10 pt-4">
                    <FormularioProjeto
                      inicial={{ nome: p.nome, descricao: p.descricao ?? "" }}
                      salvando={salvando}
                      onSalvar={(d) => salvar(p.id, d)}
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

// ================================================================
// Formulário (novo projeto ou edição)
// ================================================================
function FormularioProjeto({
  inicial,
  salvando,
  onSalvar,
  onCancelar,
}: {
  inicial?: { nome: string; descricao: string };
  salvando: boolean;
  onSalvar: (dados: { nome: string; descricao: string }) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const sufixo = inicial ? "edicao" : "novo";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (nome.trim()) onSalvar({ nome: nome.trim(), descricao: descricao.trim() });
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancelar()}
      className="space-y-4"
    >
      <div>
        <label htmlFor={`nome-${sufixo}`} className="block text-sm font-medium text-brand-dark mb-1.5">
          Nome do projeto <span className="text-status-pendente">*</span>
        </label>
        <input
          id={`nome-${sufixo}`}
          required
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Educação do Campo 2027"
          className={CAMPO}
        />
      </div>
      <div>
        <label htmlFor={`descricao-${sufixo}`} className="block text-sm font-medium text-brand-dark mb-1.5">
          Descrição <span className="text-brand-dark/60 font-normal">(opcional)</span>
        </label>
        <textarea
          id={`descricao-${sufixo}`}
          rows={2}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className={CAMPO}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          disabled={salvando}
          className="px-3 py-2 rounded-lg border border-black/10 text-sm font-medium text-brand-dark/85 hover:bg-brand-light/5 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={salvando || !nome.trim()}
          className="px-4 py-2 rounded-lg bg-status-completo text-white text-sm font-semibold disabled:opacity-50"
        >
          {salvando ? "Salvando..." : "Salvar projeto"}
        </button>
      </div>
    </form>
  );
}
