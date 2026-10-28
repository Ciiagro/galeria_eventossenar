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
    // o Supabase recusa quando a senha nova é igual à atual; nesse caso está tudo certo, é só seguir
    const igualAtual = error && ((error as { code?: string }).code === "same_password" || /different from the old password/i.test(error.message));
    if (error && !igualAtual) { setErro(error.message); return; }
    setOk(true);
    esquecerPerfilSalvo();
    // já está conectado(a): segue para o sistema (quem ainda não assinou cai no termo de compromisso)
    window.setTimeout(() => { window.location.href = "/"; }, 1800);
  }

  const campo = "w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-[15px] focus:outline-none focus:ring-4 focus:ring-brand-light/15 focus:border-brand-light";
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#FFF8E9]">
      {/* manchas verdes suaves nos cantos, com um fio fino */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <svg viewBox="0 0 400 300" className="absolute right-0 top-0 w-[28vw] min-w-[140px] max-w-[380px]" fill="none">
          <path d="M120 0H400V230C350 250 330 190 290 150C250 110 200 130 160 90C130 60 130 30 120 0Z" fill="#DCEAC8" />
          <path d="M250 0C270 60 330 90 400 120" stroke="#2F8F5B" strokeWidth="1.5" />
        </svg>
        <svg viewBox="0 0 400 300" className="absolute bottom-0 left-0 w-[28vw] min-w-[140px] max-w-[380px]" fill="none">
          <path d="M0 300V120C60 110 90 160 140 190C190 220 250 230 300 300Z" fill="#DCEAC8" />
          <path d="M0 80C60 90 110 150 140 300" stroke="#2F8F5B" strokeWidth="1.5" />
        </svg>
      </div>

      <div className="relative flex min-h-screen w-full flex-col items-center justify-center gap-5 px-5 py-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-4 sm:gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-valores.png" alt="Projeto Valores" width={720} height={308} className="h-auto w-40 sm:w-60" />
            <span aria-hidden="true" className="h-24 w-px bg-brand-light/60 sm:h-28" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sol-valores.png" alt="" width={900} height={545} className="h-auto w-28 sm:w-44" />
          </div>
          <p className="mt-2 text-base font-bold text-brand-light sm:text-lg">Brincando e cultivando os valores humanos</p>
        </div>

        <form onSubmit={salvar} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-8">
          <h1 className="text-3xl font-extrabold text-brand-dark">Criar nova senha</h1>
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

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-sistema-colorida.png" alt="Sistema FAEC SENAR Ceará — Sindicato Rural" width={800} height={294} className="h-auto w-36" />
        <p className="text-center text-xs text-slate-500">Projeto Valores Humanos &nbsp;•&nbsp; Sistema FAEC/SENAR Ceará</p>
      </div>
    </div>
  );
}
