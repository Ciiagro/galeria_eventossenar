"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

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
    <div className="min-h-screen flex items-center justify-center bg-cream">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-black/5 p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-brand-dark mb-1">Documentação Municipal</h1>
        <p className="text-sm text-brand-dark/80 mb-6">FAEC SENAR Ceará</p>

        {erro && (
          <div className="rounded-md bg-status-pendente/10 text-status-pendente px-3 py-2 text-sm mb-4">
            {erro}
          </div>
        )}

        <label className="block text-sm font-medium mb-1">E-mail</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-black/10 rounded-md px-3 py-2 text-sm mb-4"
        />

        <label className="block text-sm font-medium mb-1">Senha</label>
        <input
          type="password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full border border-black/10 rounded-md px-3 py-2 text-sm mb-6"
        />

        <button
          type="submit"
          disabled={carregando}
          className="w-full bg-brand-light text-white text-sm font-medium py-2 rounded-md disabled:opacity-50"
        >
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
