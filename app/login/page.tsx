"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { FaixaValores } from "@/components/Sol";
import { FundoLogin } from "@/components/FundoLogin";
import { esquecerPerfilSalvo } from "@/lib/usePerfil";
import { apiGetCache } from "@/lib/api";

const CAMPO =
  "w-full border border-black/10 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light";

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
    <FundoLogin className="min-h-screen">
      <div className="min-h-screen flex flex-col items-center justify-start gap-3 px-5 py-4 sm:pt-5">
        <div className="text-center">
          {/* Logo + sol lado a lado */}
          <div className="flex items-center justify-center gap-3 sm:gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-valores.png" alt="Projeto Valores" width={720} height={308} className="h-auto w-40 sm:w-64" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sol-valores.png" alt="" width={900} height={545} className="h-auto w-28 sm:w-44" />
          </div>
          <p className="mt-1 text-sm sm:text-base font-medium text-brand-dark/85">
            Brincando e cultivando os valores humanos
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/5 shadow-lg p-5 sm:p-6 w-full max-w-md">
          <h1 className="inline-block border-b-2 border-brand-light pb-0.5 text-lg sm:text-xl font-bold text-brand-dark">Entrar</h1>
          <p className="text-sm text-brand-dark/80 mt-1 mb-4">Acesse com seu e-mail e senha.</p>

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
            className={`${CAMPO} mb-3`}
          />

          <label htmlFor="senha" className="block text-sm font-medium text-brand-dark mb-1.5">Senha</label>
          <input
            id="senha"
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className={`${CAMPO} mb-3`}
          />

          <button
            type="submit"
            disabled={carregando}
            className="w-full bg-brand-light text-white text-sm font-semibold py-2 rounded-lg shadow-sm hover:bg-brand-accent transition-colors disabled:opacity-50"
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
          <p className="mt-3 text-center text-sm text-brand-dark/80">
            Primeiro acesso? <Link href="/adesao" className="font-semibold text-brand-light underline">Cadastre-se como coordenador(a)</Link>
          </p>
          <FaixaValores className="mt-4" />
        </form>

        {/* A logo da FAEC é branca, então fica sobre um bloco verde */}
        <div className="bg-brand rounded-xl px-4 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-sistema.png"
            alt="Sistema FAEC SENAR Ceará — Sindicato Rural"
            width={800}
            height={294}
            className="w-28 h-auto"
          />
        </div>
      </div>
    </FundoLogin>
  );
}
