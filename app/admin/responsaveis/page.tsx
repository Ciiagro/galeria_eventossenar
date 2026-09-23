"use client";

import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, Municipio } from "@/lib/api";
import { UserIcon, MailIcon, LockIcon, PencilIcon, TrashIcon, XIcon, BuildingIcon } from "@/components/icons";
import { AdminGuard } from "@/components/AdminGuard";

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes[1]?.[0] ?? "")).toUpperCase();
}

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
    <div className="p-6 sm:p-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 shrink-0 rounded-xl bg-brand-light/10 text-brand-light flex items-center justify-center">
            <UserIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-brand-dark">Cadastrar responsável</h1>
            <p className="text-sm text-brand-dark/70 mt-0.5">Escolha um município e crie o acesso do responsável.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={novoResponsavel}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-light text-white text-sm font-medium shadow-sm hover:bg-brand-accent transition-colors shrink-0"
        >
          <span className="text-base leading-none">+</span> Inserir responsável
        </button>
      </div>

      {erro && (
        <div className="flex items-start gap-2.5 rounded-lg bg-status-pendente/10 text-status-pendente px-4 py-3 text-sm mb-5 border border-status-pendente/20">
          {erro}
        </div>
      )}
      {mensagem && (
        <div className="flex items-start gap-2.5 rounded-lg bg-status-completo/10 text-status-completo px-4 py-3 text-sm mb-5 border border-status-completo/20">
          {mensagem}
        </div>
      )}

      {mostrarFormulario && (
        <form
          onSubmit={salvar}
          autoComplete="off"
          className="bg-white border border-black/5 rounded-2xl shadow-sm max-w-2xl mb-10 overflow-hidden"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 bg-brand-dark/[0.03]">
            <h2 className="text-sm font-semibold text-brand-dark">
              {municipioSelecionado?.responsavel_id ? "Editar responsável" : "Novo responsável"}
            </h2>
            <button
              type="button"
              onClick={() => setMostrarFormulario(false)}
              aria-label="Fechar formulário"
              className="w-7 h-7 rounded-md flex items-center justify-center text-brand-dark/50 hover:text-brand-dark hover:bg-black/5 transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div>
              <label htmlFor="municipio" className="block text-sm font-medium text-brand-dark mb-1.5">Município *</label>
              <div className="relative">
                <BuildingIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark/40 pointer-events-none" />
                <select
                  id="municipio"
                  required
                  disabled={carregando}
                  value={municipioId}
                  onChange={(e) => selecionarMunicipio(e.target.value)}
                  className="w-full border border-black/10 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light appearance-none disabled:opacity-50"
                >
                  <option value="">Selecione um município</option>
                  {municipios.map((municipio) => <option key={municipio.id} value={municipio.id}>{municipio.nome}</option>)}
                </select>
              </div>
            </div>

            {municipioSelecionado && (
              <div className="border-t border-black/5 pt-5 space-y-5">
                <div>
                  <label htmlFor="nome" className="block text-sm font-medium text-brand-dark mb-1.5">Nome completo *</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark/40 pointer-events-none" />
                    <input
                      id="nome"
                      required
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Nome do responsável"
                      className="w-full border border-black/10 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-brand-dark mb-1.5">E-mail de acesso *</label>
                  <div className="relative">
                    <MailIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark/40 pointer-events-none" />
                    <input
                      id="email"
                      name="responsavelEmail"
                      required
                      type="email"
                      autoComplete="new-username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="responsavel@exemplo.com"
                      className="w-full border border-black/10 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="senha" className="block text-sm font-medium text-brand-dark mb-1.5">
                    Senha {municipioSelecionado.responsavel_id ? <span className="font-normal text-brand-dark/55">(opcional para alterar)</span> : "*"}
                  </label>
                  <div className="relative">
                    <LockIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark/40 pointer-events-none" />
                    <input
                      id="senha"
                      name="responsavelSenha"
                      required={!municipioSelecionado.responsavel_id}
                      minLength={6}
                      type="password"
                      autoComplete="new-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="Mínimo de 6 caracteres"
                      className="w-full border border-black/10 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                    />
                  </div>
                  <p className="text-xs text-brand-dark/60 mt-1.5">O responsável usará o e-mail e a senha na tela de login.</p>
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
                  <button type="button" onClick={() => setMostrarFormulario(false)} className="sm:w-32 px-5 py-3 rounded-lg border border-black/10 text-brand-dark/70 text-sm font-medium hover:bg-black/5 transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={salvando} className="flex-1 px-5 py-3 rounded-lg bg-brand-light text-white text-sm font-medium shadow-sm hover:bg-brand-accent transition-colors disabled:opacity-50">
                    {salvando ? "Salvando acesso..." : "Salvar responsável"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>
      )}

      <section className="max-w-2xl">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-brand-dark">Relação de responsáveis</h2>
            <p className="text-sm text-brand-dark/70">Acessos já vinculados aos municípios.</p>
          </div>
          <span className="text-xs font-medium text-brand-dark/60 bg-brand-dark/5 px-2.5 py-1 rounded-full">
            {responsaveis.length} cadastrado{responsaveis.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="bg-white border border-black/5 rounded-2xl shadow-sm divide-y divide-black/5">
          {responsaveis.length === 0 && (
            <div className="p-8 text-center">
              <div className="w-10 h-10 rounded-full bg-brand-dark/5 text-brand-dark/40 flex items-center justify-center mx-auto mb-3">
                <UserIcon className="w-5 h-5" />
              </div>
              <p className="text-sm text-brand-dark/60">Nenhum responsável cadastrado ainda.</p>
            </div>
          )}
          {responsaveis.map((municipio) => (
            <div key={municipio.id} className="flex items-center gap-4 p-4 hover:bg-brand-light/5 transition-colors">
              <div className="w-10 h-10 shrink-0 rounded-full bg-brand-light/10 text-brand-light flex items-center justify-center text-xs font-semibold">
                {iniciais(municipio.responsavel_nome ?? municipio.nome)}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-brand-dark truncate">{municipio.responsavel_nome}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  <span className="inline-flex items-center gap-1 text-xs text-brand-dark/60">
                    <BuildingIcon className="w-3.5 h-3.5" /> {municipio.nome}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-brand-dark/60 truncate">
                    <MailIcon className="w-3.5 h-3.5 shrink-0" /> {municipio.responsavel_email}
                  </span>
                </div>
              </div>

              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => { selecionarMunicipio(String(municipio.id)); setMostrarFormulario(true); }}
                  aria-label={`Editar responsável de ${municipio.nome}`}
                  title="Editar"
                  className="w-8 h-8 rounded-lg border border-black/10 text-brand-dark/60 flex items-center justify-center hover:border-brand-light/40 hover:text-brand-light hover:bg-brand-light/5 transition-colors"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => excluir(municipio.id)}
                  aria-label={`Excluir responsável de ${municipio.nome}`}
                  title="Excluir"
                  className="w-8 h-8 rounded-lg border border-black/10 text-brand-dark/60 flex items-center justify-center hover:border-status-pendente/40 hover:text-status-pendente hover:bg-status-pendente/5 transition-colors"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
