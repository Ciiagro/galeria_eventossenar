"use client";

import { usePathname } from "next/navigation";
import { usePerfil } from "@/lib/usePerfil";
import { corDoItem, linkAtivo, montarLinks } from "@/lib/menu";

// Cabeçalho de página no mesmo estilo dos cartões do Material Instrucional:
// faixa clara na cor do item do menu, com o ícone do menu num quadradinho, o título e um subtítulo.
// `acao` fica à direita (botão, contador...). Se a página não for um item do menu, vira um título comum.
export function TituloPagina({
  children,
  descricao,
  acao,
  tamanho = "text-xl sm:text-2xl",
  className = "",
}: {
  children: React.ReactNode;
  descricao?: React.ReactNode;
  acao?: React.ReactNode;
  tamanho?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const { perfil, carregando } = usePerfil();

  const links = montarLinks(perfil);
  const indice = carregando ? -1 : links.findIndex((l) => linkAtivo(l, pathname));

  if (indice < 0) {
    return (
      <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}>
        <div className="min-w-0">
          <h1 className={`${tamanho} font-bold leading-tight text-brand-dark`}>{children}</h1>
          {descricao && <p className="mt-0.5 max-w-2xl text-sm text-brand-dark/75">{descricao}</p>}
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </div>
    );
  }

  const { Icon } = links[indice];
  const cor = corDoItem(indice);
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${className}`}
      style={{ background: cor.fundo }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm"
          style={{ background: cor.barra, color: cor.sobre }}
          aria-hidden="true"
        >
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1 className={`${tamanho} font-bold leading-tight`} style={{ color: cor.texto }}>{children}</h1>
          {descricao && <p className="mt-0.5 max-w-2xl text-sm text-brand-dark/75">{descricao}</p>}
        </div>
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}

// Quadrinho de número à direita da faixa (mesmo visual em todas as páginas)
export function Indicador({ valor, rotulo, alerta = false }: { valor: React.ReactNode; rotulo: string; alerta?: boolean }) {
  return (
    <div className="min-w-[96px] shrink-0 rounded-xl border border-black/5 bg-white/60 px-5 py-2.5 text-center">
      <p className={`text-3xl font-bold leading-none ${alerta ? "text-status-pendente" : "text-brand-dark"}`}>{valor}</p>
      <p className="mt-1 text-xs text-brand-dark/75">{rotulo}</p>
    </div>
  );
}
