"use client";

import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, Municipio } from "@/lib/api";
import { UserIcon } from "@/components/icons";
import { AdminGuard } from "@/components/AdminGuard";

export default function ResponsaveisPageGuarded() {
  return (
    <AdminGuard>
      <ResponsaveisPage />
    </AdminGuard>
  );
}

function ResponsaveisPage() {
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [municipioId, setMunicipioId] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/api/municipios")
      .then((lista: Municipio[]) => {
        setMunicipios(lista);
        setMunicipioId(String(lista[0]?.id ?? ""));
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  const municipioSelecionado = useMemo(
    () => municipios.find((municipio) => String(municipio.id) === municipioId),
    [municipios, municipioId]
  );
  const responsaveis = municipios.filter((municipio) => municipio.responsavel_nome || municipio.responsavel_email);

  function novoResponsavel() {
    setMunicipioId("");
    setNome("");
    setEmail("");
    setSenha("");
    setMensagem(null);
    setErro(null);
    setMostrarFormulario(true);
  }

  async function excluir(id: number) {
    if (!window.confirm("Excluir o responsável e seu acesso de login?")) return;
    setErro(null);
    try {
      await apiDelete(`/api/responsaveis?municipio_id=${id}`);
      setMunicipios((atual) => atual.filter((municipio) => municipio.id !== id));
      if (String(id) === municipioId) setMostrarFormulario(false);
      setMensagem("Responsável excluído.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir responsável.");
    }
  }

  function selecionarMunicipio(id: string) {
    const municipio = municipios.find((item) => String(item.id) === id);
    setMunicipioId(id);
    setNome(municipio?.responsavel_nome ?? "");
    setEmail(municipio?.responsavel_email ?? "");
    setSenha("");
    setMensagem(null);
    setErro(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMensagem(null);
    if (!municipioId) {
      setErro("Selecione um município.");
      return;
    }

    setSalvando(true);
    try {
      await apiPost("/api/responsaveis", {
        municipio_id: Number(municipioId),
        responsavel_nome: nome,
        responsavel_email: email,
        senha,
      });
      setMensagem("Responsável salvo. Ele já pode entrar com este e-mail e senha.");
      setSenha("");
      const listaAtualizada = await apiGet("/api/municipios") as Municipio[];
      setMunicipios(listaAtualizada);
      setMostrarFormulario(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar responsável.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
        <div className="w-11 h-11 rounded-xl bg-brand-light/10 text-brand-light flex items-center justify-center mb-4">
          <UserIcon className="w-5 h-5" />
        </div>
        <h1 className="text-2xl font-semibold text-brand-dark">Cadastrar responsável</h1>
        <p className="text-sm text-brand-dark/90 mt-1">Escolha um município e crie o acesso do responsável.</p>
        </div>
        <button type="button" onClick={novoResponsavel} className="px-4 py-2.5 rounded-lg bg-brand-light text-white text-sm font-medium hover:bg-brand-accent">
          + Inserir responsável
        </button>
      </div>

      {erro && <div className="rounded-md bg-status-pendente/10 text-status-pendente px-4 py-3 text-sm mb-5">{erro}</div>}
      {mensagem && <div className="rounded-md bg-status-completo/10 text-status-completo px-4 py-3 text-sm mb-5">{mensagem}</div>}

      {mostrarFormulario && <form onSubmit={salvar} autoComplete="off" className="bg-white border border-black/5 rounded-xl shadow-sm p-6 space-y-5 max-w-3xl">
        <div>
          <label htmlFor="municipio" className="block text-sm font-medium text-brand-dark mb-1.5">Município *</label>
          <select
            id="municipio"
            required
            disabled={carregando}
            value={municipioId}
            onChange={(e) => selecionarMunicipio(e.target.value)}
            className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
          >
            <option value="">Selecione um município</option>
            {municipios.map((municipio) => <option key={municipio.id} value={municipio.id}>{municipio.nome}</option>)}
          </select>
        </div>

        {municipioSelecionado && (
          <div className="border-t border-black/5 pt-5 space-y-5">
            <div>
              <label htmlFor="nome" className="block text-sm font-medium text-brand-dark mb-1.5">Nome completo *</label>
              <input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do responsável" className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light" />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-brand-dark mb-1.5">E-mail de acesso *</label>
              <input id="email" name="responsavelEmail" required type="email" autoComplete="new-username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="responsavel@exemplo.com" className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light" />
            </div>
            <div>
              <label htmlFor="senha" className="block text-sm font-medium text-brand-dark mb-1.5">Senha {municipioSelecionado.responsavel_id ? "(opcional para alterar)" : "*"}</label>
              <input id="senha" name="responsavelSenha" required={!municipioSelecionado.responsavel_id} minLength={6} type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo de 6 caracteres" className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light" />
              <p className="text-xs text-brand-dark/85 mt-1.5">O responsável usará o e-mail e a senha na tela de login.</p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button type="button" onClick={() => setMostrarFormulario(false)} className="sm:w-32 px-5 py-3 rounded-lg border border-black/10 text-brand-dark/85 text-sm font-medium hover:bg-black/5">
                Cancelar
              </button>
              <button type="submit" disabled={salvando} className="flex-1 px-5 py-3 rounded-lg bg-brand-light text-white text-sm font-medium hover:bg-brand-accent disabled:opacity-50">
                {salvando ? "Salvando acesso..." : "Salvar responsável"}
              </button>
            </div>
          </div>
        )}
      </form>}

      <section className="mt-8 max-w-3xl">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-brand-dark">Relação de responsáveis</h2>
            <p className="text-sm text-brand-dark/90">Acessos já vinculados aos municípios.</p>
          </div>
          <span className="text-sm text-brand-dark/90">{responsaveis.length} cadastrado{responsaveis.length === 1 ? "" : "s"}</span>
        </div>
        <div className="bg-white border border-black/5 rounded-xl shadow-sm divide-y divide-black/5">
          {responsaveis.length === 0 && <p className="p-5 text-sm text-brand-dark/85">Nenhum responsável cadastrado.</p>}
          {responsaveis.map((municipio) => (
            <div
              key={municipio.id}
              className="p-4 hover:bg-brand-light/5 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-brand-dark">{municipio.nome}</p>
                  <p className="text-sm text-brand-dark/90 mt-1">{municipio.responsavel_nome}</p>
                  <p className="text-xs text-brand-dark/90 mt-0.5">{municipio.responsavel_email}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => { selecionarMunicipio(String(municipio.id)); setMostrarFormulario(true); }} className="text-xs text-brand-light border border-brand-light/30 rounded-md px-2 py-1">
                    Editar
                  </button>
                  <button type="button" onClick={() => excluir(municipio.id)} className="text-xs text-status-pendente border border-status-pendente/30 rounded-md px-2 py-1">
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
