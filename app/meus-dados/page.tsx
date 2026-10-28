"use client";

import { useEffect, useState } from "react";
import { TituloPagina } from "@/components/TituloPagina";
import { FotoCoordenador } from "@/components/FotoCoordenador";
import { usePerfil } from "@/lib/usePerfil";
import { apiGet, apiPost } from "@/lib/api";
import { reduzirFoto } from "@/lib/reduzirFoto";
import { mascaraTelefone } from "@/lib/mascaras";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

const CAMPO =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30";

// Página do coordenador: trocar a foto, corrigir os telefones e mudar a senha.
// Nome, CPF e e-mail ficam com a administração (aparecem nos termos assinados e o e-mail é o login).
export default function MeusDadosPage() {
  const { perfil, carregando } = usePerfil();
  const [dados, setDados] = useState<{ nome: string | null; email: string | null; tem_foto: boolean | null } | null>(null);
  const [tel1, setTel1] = useState("");
  const [tel2, setTel2] = useState("");
  const [fotoNova, setFotoNova] = useState("");
  const [fotoSalva, setFotoSalva] = useState(false);
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [meuId, setMeuId] = useState<string | null>(null);
  useEffect(() => { supabaseBrowser.auth.getSession().then(({ data }) => setMeuId(data.session?.user?.id ?? null)); }, []);

  useEffect(() => {
    apiGet("/api/meus-dados")
      .then((d) => { setDados(d); setTel1(d.telefone1 ?? ""); setTel2(d.telefone2 ?? ""); setFotoSalva(d.tem_foto === true); })
      .catch((e) => setErro(e instanceof Error ? e.message : "Não consegui carregar seus dados."));
  }, []);

  async function escolherFoto(arquivo: File | null) {
    if (!arquivo) return;
    setErro(null);
    try { setFotoNova(await reduzirFoto(arquivo)); } catch (e) { setErro(e instanceof Error ? e.message : "Foto inválida."); }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(null);
    if (!fotoSalva && !fotoNova) { setErro("Escolha a sua foto (rosto bem visível)."); return; }
    if (senha && senha.length < 6) { setErro("A senha deve ter pelo menos 6 caracteres."); return; }
    if (senha && senha !== senha2) { setErro("As duas senhas não são iguais."); return; }
    setSalvando(true);
    try {
      if (fotoNova) {
        await apiPost("/api/coordenador-foto", { foto: fotoNova });
        setFotoSalva(true);
        try { if (meuId) window.sessionStorage.setItem(`foto_ok:${meuId}`, "1"); } catch { /* ignora */ }
      }
      await apiPost("/api/meus-dados", { telefone1: tel1, telefone2: tel2 });
      if (senha) {
        const { error } = await supabaseBrowser.auth.updateUser({ password: senha });
        if (error && !/same_password|different from the old/i.test(`${error.message} ${(error as { code?: string }).code ?? ""}`)) throw new Error(error.message);
        setSenha(""); setSenha2("");
      }
      setOk("Dados salvos.");
      if (fotoNova) { setFotoNova(""); window.location.href = "/"; }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="max-w-2xl p-4 sm:p-8">
      <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
        <TituloPagina descricao="Coloque a sua foto e mantenha seus telefones e sua senha em dia.">Meus dados</TituloPagina>
        {carregando ? null : perfil?.role !== "municipio" ? (
          <p className="mt-4 text-sm text-brand-dark/75">Esta página é só para coordenadores.</p>
        ) : (
          <form onSubmit={salvar} className="mt-4 space-y-4">
            {!fotoSalva && (
              <p className="rounded-lg bg-[#FFF3CC] px-3 py-2 text-sm font-semibold text-[#6E4B00]">
                Falta só a sua foto para usar o sistema. Escolha uma foto com o rosto bem visível.
              </p>
            )}
            <div className="flex items-center gap-4">
              {fotoNova ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoNova} alt="Foto escolhida" className="h-20 w-20 rounded-full border border-black/10 object-cover" />
              ) : (
                <FotoCoordenador userId={fotoSalva ? meuId : null} nome={dados?.nome ?? perfil?.nome} tamanho={80} />
              )}
              <div>
                <label htmlFor="foto" className="inline-block cursor-pointer rounded-lg border border-brand-light px-3 py-1.5 text-sm font-semibold text-brand-light hover:bg-brand-light/5">
                  {fotoNova || fotoSalva ? "Trocar foto" : "Escolher foto"}
                </label>
                <input id="foto" type="file" accept="image/*" className="sr-only" onChange={(ev) => { escolherFoto(ev.target.files?.[0] ?? null); ev.target.value = ""; }} />
                <p className="mt-1 text-xs text-brand-dark/70">JPG ou PNG.</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 text-sm text-brand-dark/80">
                <p><strong>{dados?.nome ?? perfil?.nome ?? ""}</strong></p>
                <p className="text-xs text-brand-dark/65">{dados?.email ?? perfil?.email ?? ""} · nome, CPF e e-mail só a administração altera.</p>
              </div>
              <label className="text-sm font-semibold text-brand-dark">Telefone principal
                <input required inputMode="tel" value={tel1} onChange={(e) => setTel1(mascaraTelefone(e.target.value))} placeholder="(00) 00000-0000" className={`${CAMPO} mt-1 font-normal`} />
              </label>
              <label className="text-sm font-semibold text-brand-dark">Outro telefone (opcional)
                <input inputMode="tel" value={tel2} onChange={(e) => setTel2(mascaraTelefone(e.target.value))} placeholder="(00) 00000-0000" className={`${CAMPO} mt-1 font-normal`} />
              </label>
              <label className="text-sm font-semibold text-brand-dark">Nova senha (opcional)
                <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo de 6 caracteres" className={`${CAMPO} mt-1 font-normal`} />
              </label>
              <label className="text-sm font-semibold text-brand-dark">Repita a nova senha
                <input type="password" autoComplete="new-password" value={senha2} onChange={(e) => setSenha2(e.target.value)} className={`${CAMPO} mt-1 font-normal`} />
              </label>
            </div>

            {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{erro}</p>}
            {ok && <p className="rounded-lg bg-[#E3F4EA] px-3 py-2 text-sm font-semibold text-[#17613B]">{ok}</p>}
            <button type="submit" disabled={salvando} className="rounded-lg bg-brand-light px-5 py-2 text-sm font-semibold text-white hover:bg-brand-accent disabled:opacity-60">
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
