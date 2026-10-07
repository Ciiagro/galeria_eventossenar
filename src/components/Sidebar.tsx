"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { esquecerPerfilSalvo, usePerfil } from "@/lib/usePerfil";
import { LogoutIcon, ImageIcon, MapPinIcon } from "@/components/icons";
import { montarLinks, linkAtivo } from "@/lib/menu";
import { apiGet, ROTULO_PAPEL } from "@/lib/api";
import { FaixaValores, LogoValores } from "@/components/Sol";
import { CORES_ALEGRES, CriancasPulando, Estrela, Grama } from "@/components/Desenhos";
import { useCiclos } from "@/lib/ciclos";

// "Maria de Jesus" -> "MJ" · "maria@gmail.com" -> "M"
function iniciais(texto?: string | null) {
  const base = (texto ?? "").split("@")[0].trim();
  const partes = base.split(/[\s._-]+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const letras = partes.length === 1 ? partes[0].slice(0, 1) : partes[0][0] + partes[partes.length - 1][0];
  return letras.toLocaleUpperCase("pt-BR");
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { perfil, carregando: carregandoPerfil } = usePerfil();
  const { ativo: cicloAtivo } = useCiclos();
  // Apoiador de Relatórios: contador de documentos esperando análise ao lado do item do menu
  const [paraAnalisar, setParaAnalisar] = useState(0);
  const ehApoioRelatorios = perfil?.role === "apoiador_relatorios";
  useEffect(() => {
    if (!ehApoioRelatorios) { setParaAnalisar(0); return; }
    let montado = true;
    function atualizar() {
      if (document.hidden) return;
      apiGet("/api/analise/pendentes").then((r) => { if (montado) setParaAnalisar(r.para_analisar ?? 0); }).catch(() => null);
    }
    atualizar();
    const intervalo = window.setInterval(atualizar, 60000);
    window.addEventListener("focus", atualizar);
    return () => { montado = false; window.clearInterval(intervalo); window.removeEventListener("focus", atualizar); };
  }, [ehApoioRelatorios, pathname]);

  // Comunicados novos (para quem recebe: coordenador e equipe de apoio): contador ao lado do item do menu
  const [comunicadosNovos, setComunicadosNovos] = useState(0);
  const recebeComunicados = Boolean(perfil?.role) && perfil?.role !== "admin";
  useEffect(() => {
    if (!recebeComunicados) { setComunicadosNovos(0); return; }
    let montado = true;
    function atualizar() {
      if (document.hidden) return;
      apiGet("/api/comunicados/nao-lidos").then((r) => { if (montado) setComunicadosNovos(r.nao_lidos ?? 0); }).catch(() => null);
    }
    atualizar();
    const intervalo = window.setInterval(atualizar, 60000);
    window.addEventListener("focus", atualizar);
    window.addEventListener("comunicados-lidos", atualizar); // a página de comunicados avisa quando marca como lido
    return () => {
      montado = false;
      window.clearInterval(intervalo);
      window.removeEventListener("focus", atualizar);
      window.removeEventListener("comunicados-lidos", atualizar);
    };
  }, [recebeComunicados, pathname]);

  const aguardandoPerfil = carregandoPerfil && !perfil; // ainda não sabemos quem é: não mostra um menu que pode estar errado
  const links = aguardandoPerfil ? [] : montarLinks(perfil);

  async function sair() {
    esquecerPerfilSalvo();
    await supabaseBrowser.auth.signOut();
    router.push("/login");
  }

  const papel = perfil?.role ? ROTULO_PAPEL[perfil.role] : "Responsável municipal";

  return (
    <aside className="sticky top-0 h-screen w-64 shrink-0 self-start overflow-y-auto overflow-x-hidden bg-sol-creme border-r border-black/5 flex flex-col">
      {/* manchas pastel de fundo */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="absolute -left-16 top-52 h-40 w-40 rounded-full bg-[#E4D7F0]/30" />
        <span className="absolute -right-16 top-[58%] h-40 w-40 rounded-full bg-[#CFE8F7]/30" />
      </div>

      <div className="relative flex min-h-full flex-col px-4 pt-5">
        {/* logo */}
        <div className="relative">
          <Link href="/" className="relative block w-40" aria-label="Projeto Valores — ir para o início">
            <LogoValores className="w-40" />
          </Link>
        </div>
        <FaixaValores className="mt-2.5" />
        {cicloAtivo && (
          <p className="mt-2 inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full bg-[#FFF3CC] px-2.5 py-0.5 text-[11px] font-bold text-[#6E4B00]">
            <Estrela className="h-3 w-3" />
            {cicloAtivo.nome} em andamento
          </p>
        )}

        {perfil && (
          <div
            className="mt-3 flex items-center gap-2.5 rounded-xl border border-black/5 bg-white px-2.5 py-2 shadow-sm"
            title={perfil.email || undefined}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8E5BB5] text-xs font-bold tracking-wide text-white"
              aria-hidden
            >
              {iniciais(perfil.nome || perfil.email)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-brand-dark">{perfil.nome || perfil.email}</p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] font-bold leading-tight text-[#0F4C85]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2678C4]" aria-hidden />
                {papel}
              </p>
              {perfil.municipio_nome && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-semibold leading-tight text-brand-dark/75" title={perfil.municipio_pendente ? "Município escolhido no cadastro (liberado após a aprovação da adesão)" : undefined}>
                  <MapPinIcon className="h-3 w-3 shrink-0" />
                  {perfil.municipio_nome}
                </p>
              )}
            </div>
          </div>
        )}

        {/* menu: cada item com uma cor do programa */}
        <nav className="mt-3 space-y-0.5" aria-label="Menu principal">
          {aguardandoPerfil && (
            <div aria-hidden="true" className="space-y-1.5 pt-1">
              {[0, 1, 2, 3, 4].map((n) => <div key={n} className="h-9 animate-pulse rounded-xl bg-black/[0.06]" />)}
            </div>
          )}
          {links.map(({ href, label, Icon, prefixo }, i) => {
            const active = linkAtivo({ href, label, Icon, prefixo }, pathname);
            const cor = CORES_ALEGRES[i % CORES_ALEGRES.length];
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex items-center gap-2.5 rounded-xl border-2 px-2 py-1.5 text-sm font-semibold leading-tight transition-colors hover:shadow-sm"
                style={active ? { background: cor.fundo, borderColor: cor.barra, color: cor.texto } : { background: "transparent", borderColor: "transparent", color: "#122E20" }}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: cor.barra, color: cor.sobre }}>
                  <Icon className="h-4 w-4" />
                </span>
                {label}
                {href === "/analise" && paraAnalisar > 0 && (
                  <span className="ml-auto rounded-full bg-status-pendente px-2 py-0.5 text-xs font-bold text-white" title={`${paraAnalisar} para analisar`}>
                    {paraAnalisar}
                  </span>
                )}
                {href === "/comunicados" && comunicadosNovos > 0 && (
                  <span className="ml-auto rounded-full bg-status-pendente px-2 py-0.5 text-xs font-bold text-white" title={`${comunicadosNovos} comunicado(s) novo(s)`}>
                    {comunicadosNovos}
                  </span>
                )}
              </Link>
            );
          })}
          {/* Galeria pública abre em outra aba (é a página que o público vê, sem login).
              O coordenador do município não vê este atalho. */}
          {perfil?.role !== "municipio" && (
            <a
              href="/galeria"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 rounded-xl border-2 border-transparent px-2 py-1.5 text-sm font-semibold leading-tight text-brand-dark transition-colors hover:shadow-sm"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F49AC1] text-[#4B1528]">
                <ImageIcon className="h-4 w-4" />
              </span>
              Ver galeria pública
              <span className="ml-auto text-xs text-brand-dark/60" aria-hidden>↗</span>
            </a>
          )}
        </nav>

        <button
          onClick={sair}
          className="mt-0.5 flex w-full items-center gap-2.5 rounded-xl border-2 border-transparent px-2 py-1.5 text-sm font-semibold leading-tight text-brand-dark/80 transition-colors hover:bg-white hover:text-brand-dark"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/10 text-brand-dark">
            <LogoutIcon className="h-4 w-4" />
          </span>
          Sair
        </button>

        {/* pé da lateral: crianças na grama (só aparece em telas altas) e a marca da FAEC */}
        <div className="mt-auto pt-4">
          <div className="-mx-4 hidden select-none [@media(min-height:860px)]:block" aria-hidden="true">
            <CriancasPulando tamanho="w-12" />
            <div className="-mt-2"><Grama className="!h-8" /></div>
          </div>
          <div className="-mx-4 bg-brand px-4 py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-sistema.png"
              alt="Sistema FAEC SENAR Ceará — Sindicato Rural"
              width={800}
              height={294}
              className="h-auto w-36"
            />
            <p className="mt-2 text-xs leading-relaxed text-white/80">Brincando e cultivando os valores humanos</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
