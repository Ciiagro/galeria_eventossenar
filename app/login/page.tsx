"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { esquecerPerfilSalvo } from "@/lib/usePerfil";
import { apiGetCache } from "@/lib/api";

const CAMPO =
  "w-full rounded-xl border border-black/15 bg-white py-3 pl-11 pr-4 text-[15px] text-brand-dark placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-light/15 focus:border-brand-light";

const Icone = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
    className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-dark/60" aria-hidden="true">{children}</svg>
);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [verSenha, setVerSenha] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function esqueciSenha() {
    setErro(null);
    setAviso(null);
    if (!email.trim()) { setErro("Digite seu e-mail acima e clique de novo em “Esqueci minha senha”."); return; }
    const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` });
    if (error) { setErro(error.message); return; }
    setAviso("Enviamos um link para o seu e-mail. Abra e crie uma nova senha.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    esquecerPerfilSalvo();
    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password: senha });

    setCarregando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    // Vai direto para a tela de cada perfil (antes passava pelo Início só para ser redirecionado: uma volta a mais)
    let destino = "/";
    try {
      const perfil = await apiGetCache("/api/perfil");
      if (perfil?.role === "municipio" && !perfil.municipio_id) destino = "/adesao/ficha";
      else if (perfil?.role === "apoiador_relatorios") destino = "/analise";
    } catch {
      // sem perfil agora: o Início resolve
    }
    router.push(destino);
  }

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

        <form onSubmit={handleSubmit} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-8">
          <h1 className="text-3xl font-extrabold text-brand-dark">Bem-vindo(a)!</h1>
          <div className="mb-2 mt-2 h-1 w-14 rounded-full bg-brand-light" />
          <p className="mb-5 text-[15px] text-slate-500">Acesse sua conta para continuar.</p>

          {erro && (
            <div className="mb-4 rounded-lg bg-status-pendente/10 px-3 py-2 text-sm text-status-pendente" role="alert">{erro}</div>
          )}
          {aviso && (
            <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">{aviso}</div>
          )}

          <label htmlFor="email" className="mb-1.5 block text-sm font-bold text-brand-dark">E-mail</label>
          <div className="relative mb-4">
            <Icone><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Icone>
            <input id="email" type="email" required autoComplete="email" placeholder="seuemail@exemplo.com" value={email}
              onChange={(e) => setEmail(e.target.value)} className={CAMPO} />
          </div>

          <label htmlFor="senha" className="mb-1.5 block text-sm font-bold text-brand-dark">Senha</label>
          <div className="relative">
            <Icone><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Icone>
            <input id="senha" type={verSenha ? "text" : "password"} required autoComplete="current-password" placeholder="Digite sua senha" value={senha}
              onChange={(e) => setSenha(e.target.value)} className={`${CAMPO} pr-12`} />
            <button type="button" onClick={() => setVerSenha((v) => !v)} aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-dark/60 hover:text-brand-dark">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                {verSenha ? (<><path d="M3 3l18 18" /><path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3 3.5M6.5 7.5C4.2 9 3 12 3 12s4 6 9 6c1.4 0 2.7-.4 3.8-1" /></>)
                  : (<><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>)}
              </svg>
            </button>
          </div>
          <div className="mb-5 mt-1.5 text-right">
            <button type="button" onClick={esqueciSenha} className="text-sm font-medium text-brand-light underline">Esqueci minha senha</button>
          </div>

          <button type="submit" disabled={carregando}
            className="w-full rounded-xl bg-brand-light py-3.5 text-base font-bold text-white shadow-md transition-colors hover:bg-brand-accent disabled:opacity-50">
            {carregando ? "Entrando..." : "Entrar"}
          </button>

          <div className="my-5 flex items-center gap-3 text-sm text-slate-500">
            <span className="h-px flex-1 bg-black/10" />Primeiro acesso?<span className="h-px flex-1 bg-black/10" />
          </div>
          <p className="text-center">
            <Link href="/adesao" className="text-[15px] font-bold text-brand-light underline">Cadastre-se como coordenador(a)</Link>
          </p>
        </form>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-sistema-colorida.png" alt="Sistema FAEC SENAR Ceará — Sindicato Rural" width={800} height={294} className="h-auto w-36" />
        <p className="text-center text-xs text-slate-500">Projeto Valores Humanos &nbsp;•&nbsp; Sistema FAEC/SENAR Ceará</p>
      </div>
    </div>
  );
}
