"use client";

import { TituloPagina } from "@/components/TituloPagina";
import { TermoCompromisso } from "@/components/TermoCompromisso";
import { usePerfil } from "@/lib/usePerfil";

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
            <p className="text-sm text-brand-dark/75">Esta página é para coordenadores. O administrador acompanha as assinaturas em Coordenadores.</p>
          )}
        </div>
      </div>
    </div>
  );
}
