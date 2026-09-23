"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

const CAMPO =
  "w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password: senha });

    setCarregando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    router.push("/");
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-cream">
      {/* Faixa verde com a logo (a logo é branca, então precisa do fundo verde) */}
      <div className="bg-brand text-white flex flex-col justify-center items-center lg:items-start px-8 py-10 lg:w-[42%] lg:px-16 lg:py-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-sistema.png"
          alt="Sistema FAEC SENAR Ceará — Sindicato Rural"
          width={800}
          height={294}
          className="w-56 sm:w-64 lg:w-80 h-auto"
        />
        <p className="hidden lg:block mt-8 max-w-xs text-lg leading-snug text-white/80">
          Juntos pelo desenvolvimento do nosso campo.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/5 shadow-sm p-7 sm:p-8 w-full max-w-md">
          <h1 className="text-xl sm:text-2xl font-bold text-brand-dark">Documentação Municipal</h1>
          <p className="text-sm text-brand-dark/80 mt-1 mb-6">Acesse com seu e-mail e senha.</p>

          {erro && (
            <div className="rounded-lg bg-status-pendente/10 text-status-pendente px-3 py-2 text-sm mb-4" role="alert">
              {erro}
            </div>
          )}

          <label htmlFor="email" className="block text-sm font-medium text-brand-dark mb-1.5">E-mail</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${CAMPO} mb-4`}
          />

          <label htmlFor="senha" className="block text-sm font-medium text-brand-dark mb-1.5">Senha</label>
          <input
            id="senha"
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className={`${CAMPO} mb-6`}
          />

          <button
            type="submit"
            disabled={carregando}
            className="w-full bg-brand-light text-white text-sm font-semibold py-2.5 rounded-lg shadow-sm hover:bg-brand-accent transition-colors disabled:opacity-50"
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
