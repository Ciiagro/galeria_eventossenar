"use client";

import { TituloPagina } from "@/components/TituloPagina";
import { TermoCompromisso } from "@/components/TermoCompromisso";
import { usePerfil } from "@/lib/usePerfil";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

// Página do coordenador: ler e assinar o termo de compromisso (o convite por e-mail leva para cá).
export default function CompromissoPage() {
  const { perfil, carregando } = usePerfil();
  return (
    <div className="max-w-4xl p-4 sm:p-8">
      <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
        <TituloPagina descricao="Leia o termo e assine com o código enviado ao seu e-mail.">Termo de compromisso</TituloPagina>
        <div className="mt-4">
          {carregando ? null : perfil?.role === "municipio" ? (
            <TermoCompromisso />
          ) : (
            <div className="space-y-3 text-sm text-brand-dark/75">
              <p>Você está conectado(a) como <strong>{perfil?.nome || perfil?.email || "outra conta"}</strong>, e esta página é só para coordenadores.</p>
              <p>Para assinar o termo, saia e entre com o <strong>e-mail e a senha do coordenador</strong> que recebeu o convite. O administrador acompanha as assinaturas em Coordenadores.</p>
              <button
                type="button"
                onClick={async () => { await supabaseBrowser.auth.signOut(); window.location.href = "/login"; }}
                className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
              >
                Sair e entrar como coordenador
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
