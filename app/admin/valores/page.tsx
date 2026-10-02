"use client";

import { AdminGuard } from "@/components/AdminGuard";
import { VALORES } from "@/lib/valores";

export default function ValoresPage() {
  return (
    <AdminGuard>
      <div className="p-4 sm:p-8 max-w-4xl">
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 sm:p-7">
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark">Valores do projeto</h1>
          <p className="text-sm text-brand-dark/80 mt-1 max-w-2xl">
            Os cinco valores humanos universais que o Projeto Valores Humanos trabalha. São informação do programa:
            não são escolhidos ao enviar documentos. Cada imagem, vídeo ou PDF fica ligado a uma ação pedagógica.
          </p>

          <div className="mt-6 space-y-3">
            {VALORES.map((v) => (
              <article key={v.chave} className="rounded-xl border border-black/5 bg-white overflow-hidden flex">
                <span className="w-2 shrink-0" style={{ background: v.cor.barra }} aria-hidden />
                <div className="p-3 sm:p-4">
                  <h2 className="text-lg font-bold leading-snug" style={{ color: v.cor.texto }}>{v.nome}</h2>
                  <p className="text-xs text-brand-dark/70">{v.dimensao}</p>
                  <p className="text-sm text-brand-dark/80 mt-1">{v.descricao}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
