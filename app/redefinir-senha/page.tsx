"use client";

import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

export default function RedefinirSenhaPage() {
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);

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
  }

  const campo = "w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-[15px] focus:outline-none focus:ring-4 focus:ring-brand-light/15 focus:border-brand-light";
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FFF8E9] px-5">
      <form onSubmit={salvar} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-extrabold text-brand-dark">Criar nova senha</h1>
        <div className="mb-4 mt-2 h-1 w-14 rounded-full bg-brand-light" />
        {ok ? (
          <p className="text-[15px] text-brand-dark">Senha alterada! <Link href="/login" className="font-bold text-brand-light underline">Entrar</Link></p>
        ) : (
          <>
            {erro && <div className="mb-3 rounded-lg bg-status-pendente/10 px-3 py-2 text-sm text-status-pendente" role="alert">{erro}</div>}
            <label htmlFor="s1" className="mb-1.5 block text-sm font-bold text-brand-dark">Nova senha</label>
            <input id="s1" type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} className={`${campo} mb-3`} />
            <label htmlFor="s2" className="mb-1.5 block text-sm font-bold text-brand-dark">Repita a nova senha</label>
            <input id="s2" type="password" required minLength={6} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className={`${campo} mb-5`} />
            <button type="submit" disabled={salvando} className="w-full rounded-xl bg-brand-light py-3.5 text-base font-bold text-white shadow-md hover:bg-brand-accent disabled:opacity-50">
              {salvando ? "Salvando..." : "Salvar nova senha"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
