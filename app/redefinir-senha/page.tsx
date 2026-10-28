"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { esquecerPerfilSalvo } from "@/lib/usePerfil";

export default function RedefinirSenhaPage() {
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState<boolean | null>(null); // link válido?

  // o link do e-mail entra com uma sessão temporária: sem ela não dá para trocar a senha
  useEffect(() => {
    let vivo = true;
    const checar = async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      if (vivo) setPronto(Boolean(data.session));
    };
    const t = window.setTimeout(checar, 600);
    const { data } = supabaseBrowser.auth.onAuthStateChange((_e, s) => { if (s && vivo) setPronto(true); });
    return () => { vivo = false; window.clearTimeout(t); data.subscription.unsubscribe(); };
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) { setErro("A senha precisa ter pelo menos 6 caracteres."); return; }
    if (senha !== confirmar) { setErro("As senhas não são iguais."); return; }
    setSalvando(true);
    const { error } = await supabaseBrowser.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    setOk(true);
    esquecerPerfilSalvo();
    // já está conectado(a): segue para o sistema (quem ainda não assinou cai no termo de compromisso)
    window.setTimeout(() => { window.location.href = "/"; }, 1800);
  }

  const campo = "w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-[15px] focus:outline-none focus:ring-4 focus:ring-brand-light/15 focus:border-brand-light";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FFF8E9] px-5 py-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-valores.png" alt="Projeto Valores" width={720} height={308} className="mb-6 h-auto w-44" />
      <form onSubmit={salvar} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-8">
        <h1 className="text-2xl font-extrabold text-brand-dark">Criar nova senha</h1>
        <div className="mb-4 mt-2 h-1 w-14 rounded-full bg-brand-light" />
        {ok ? (
          <div className="rounded-xl bg-green-50 px-4 py-4 text-[15px] text-green-800" role="status">
            <p className="font-bold">Senha alterada com sucesso!</p>
            <p className="mt-1">Estamos levando você para o sistema...</p>
          </div>
        ) : pronto === false ? (
          <div className="space-y-4 text-[15px] text-brand-dark">
            <p>Este link não é mais válido (ele vale por 1 hora e só pode ser usado uma vez).</p>
            <a href="/login" className="block w-full rounded-xl bg-brand-light py-3.5 text-center text-base font-bold text-white shadow-md hover:bg-brand-accent">Pedir um novo link</a>
          </div>
        ) : (
          <>
            <p className="mb-4 text-[15px] text-slate-500">Escolha uma senha com pelo menos 6 caracteres.</p>
            {erro && <div className="mb-3 rounded-lg bg-status-pendente/10 px-3 py-2 text-sm text-status-pendente" role="alert">{erro}</div>}
            <label htmlFor="s1" className="mb-1.5 block text-sm font-bold text-brand-dark">Nova senha</label>
            <input id="s1" type={ver ? "text" : "password"} required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} className={`${campo} mb-3`} autoComplete="new-password" />
            <label htmlFor="s2" className="mb-1.5 block text-sm font-bold text-brand-dark">Repita a nova senha</label>
            <input id="s2" type={ver ? "text" : "password"} required minLength={6} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className={`${campo} mb-3`} autoComplete="new-password" />
            <label className="mb-5 flex items-center gap-2 text-sm text-brand-dark/80">
              <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} /> Mostrar a senha
            </label>
            <button type="submit" disabled={salvando || pronto === null} className="w-full rounded-xl bg-brand-light py-3.5 text-base font-bold text-white shadow-md hover:bg-brand-accent disabled:opacity-50">
              {salvando ? "Salvando..." : "Salvar nova senha"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
