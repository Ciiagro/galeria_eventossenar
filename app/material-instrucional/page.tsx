"use client";

import { TituloPagina, Indicador } from "@/components/TituloPagina";

import { CORES_ALEGRES } from "@/components/Desenhos";
import { BookOpenIcon, ClipboardListIcon, LightbulbIcon, UserIcon } from "@/components/icons";
import { MATERIAL_INSTRUCIONAL } from "@/lib/materialInstrucional";

const ICONES: Record<string, (p: { className?: string }) => JSX.Element> = {
  apresentacao: LightbulbIcon,
  formacao: UserIcon,
  cartilha: BookOpenIcon,
  norteador: ClipboardListIcon,
};

export default function MaterialInstrucionalPage() {
  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 sm:p-7">
        <TituloPagina
          descricao="Apresentações, formações, guia do professor e documento norteador do projeto. Cada material abre em uma nova aba."
          acao={<Indicador valor={MATERIAL_INSTRUCIONAL.reduce((t, c) => t + c.links.length, 0)} rotulo="materiais" />}
        >Material Pedagógico</TituloPagina>

        <div className="mt-6 space-y-4">
          {MATERIAL_INSTRUCIONAL.map((cat, i) => {
            const cor = CORES_ALEGRES[i % CORES_ALEGRES.length];
            const Icone = ICONES[cat.id] ?? BookOpenIcon;
            return (
              <section key={cat.id} className="rounded-xl border border-black/5 overflow-hidden">
                <header className="flex items-center gap-3 px-4 py-3" style={{ background: cor.fundo }}>
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: cor.barra, color: cor.sobre }}
                  >
                    <Icone className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold leading-tight" style={{ color: cor.texto }}>{cat.titulo}</h2>
                    <p className="text-xs text-brand-dark/70">{cat.descricao}</p>
                  </div>
                </header>
                <ul className="divide-y divide-black/5 bg-white">
                  {cat.links.map((l) => (
                    <li key={l.titulo}>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-brand-dark transition-colors hover:bg-black/[0.03]"
                      >
                        <span>{l.titulo}</span>
                        <span className="flex items-center gap-1 text-xs font-bold" style={{ color: cor.texto }}>
                          Abrir <span aria-hidden>↗</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
