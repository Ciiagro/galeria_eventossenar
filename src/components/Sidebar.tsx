"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { esquecerPerfilSalvo, usePerfil } from "@/lib/usePerfil";
import { LogoutIcon, ImageIcon, MapPinIcon } from "@/components/icons";
import { montarLinks, linkAtivo, CORES_ICONES } from "@/lib/menu";
import { apiGet, apiGetCache, ROTULO_PAPEL } from "@/lib/api";
import { FaixaValores, LogoValores } from "@/components/Sol";
import { Estrela } from "@/components/Desenhos";
import { useCiclos } from "@/lib/ciclos";

// "Maria de Jesus" -> "MJ" · "maria@gmail.com" -> "M"
function iniciais(texto?: string | null) {
  const base = (texto ?? "").split("@")[0].trim();
  const partes = base.split(/[\s._-]+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const letras = partes.length === 1 ? partes[0].slice(0, 1) : partes[0][0] + partes[partes.length - 1][0];
  return letras.toLocaleUpperCase("pt-BR");
}

// uma cor para cada item do menu (a mesma do ícone; no item selecionado ela vira o destaque)

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

  // Coordenador liberado que ainda não assinou o termo de compromisso: o menu mostra só o termo.
  const [semCompromisso, setSemCompromisso] = useState<boolean | null>(null); // null = ainda conferindo
  const ehCoordLiberado = perfil?.role === "municipio" && Boolean(perfil.municipio_id);
  const quemConferiu = useRef<string | null>(null);
  useEffect(() => {
    if (!perfil) return; // ainda não sabemos quem é: continua "conferindo" (menu escondido)
    if (!ehCoordLiberado) { setSemCompromisso(false); return; }
    if (quemConferiu.current !== perfil.email) { quemConferiu.current = perfil.email ?? null; setSemCompromisso(null); }
    let vivo = true;
    let jaAssinou = false;
    try { jaAssinou = window.sessionStorage.getItem(`compromisso_ok:${perfil.email}`) === "1"; } catch { /* ignora */ }
    if (jaAssinou) { setSemCompromisso(false); return; }
    apiGetCache("/api/compromisso", 20_000)
      .then((c) => { if (c?.assinado) { try { window.sessionStorage.setItem(`compromisso_ok:${perfil.email}`, "1"); } catch { /* ignora */ } } if (vivo) setSemCompromisso(Boolean(c) && c.sem_edicao === false && c.assinado === false); })
      .catch(() => { if (vivo) setSemCompromisso(false); });
    return () => { vivo = false; };
  }, [perfil, ehCoordLiberado, pathname]);

  const aguardandoPerfil = carregandoPerfil && !perfil; // ainda não sabemos quem é: não mostra um menu que pode estar errado
  const links = aguardandoPerfil || (ehCoordLiberado && semCompromisso === null) ? [] : semCompromisso ? montarLinks(perfil).filter((l) => l.href === "/compromisso") : montarLinks(perfil);

  async function sair() {
    esquecerPerfilSalvo();
    await supabaseBrowser.auth.signOut();
    router.push("/login");
  }

  const papel = perfil?.role ? ROTULO_PAPEL[perfil.role] : "Responsável municipal";

  return (
    <aside className="sticky top-0 h-screen w-60 shrink-0 self-start overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-[#F4FAF6] border-r border-black/10 shadow-[4px_0_24px_-6px_rgba(18,46,32,0.18)] z-10 flex flex-col">
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
            className="mt-3 flex items-center gap-2.5 rounded-2xl border border-black/10 bg-[#FFF8EC] px-3 py-2.5 shadow-sm"
            title={perfil.email || undefined}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8E5BB5] text-xs font-bold tracking-wide text-white"
              aria-hidden
            >
              {iniciais(perfil.nome || perfil.email)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight text-brand-dark">{perfil.nome || perfil.email}</p>
              <p className="mt-0.5 truncate text-xs leading-tight text-slate-500">{papel}</p>
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
            const cor = CORES_ICONES[i % CORES_ICONES.length];
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-3 rounded-xl px-3 py-1.5 text-[14px] leading-tight transition-colors ${active ? "font-bold" : "font-medium text-slate-700 hover:bg-black/[0.05]"}`}
                style={active ? { background: `${cor}22`, color: "#1B1B2F" } : undefined}
              >
                {active && <span className="absolute -left-4 top-1 bottom-1 w-1 rounded-r-full" style={{ background: cor }} aria-hidden />}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={active ? { background: cor, color: "#fff" } : { background: `${cor}1F`, color: cor }}>
                  <Icon className="h-[18px] w-[18px]" />
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
              className="flex items-center gap-3 rounded-xl px-3 py-1.5 text-[14px] font-medium leading-tight text-slate-700 transition-colors hover:bg-black/[0.05]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#D6458F]">
                <ImageIcon className="h-[18px] w-[18px]" />
              </span>
              Ver galeria pública
              <span className="ml-auto text-xs text-brand-dark/60" aria-hidden>↗</span>
            </a>
          )}
        </nav>

        <button
          onClick={sair}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-[14px] font-medium leading-tight text-slate-700 transition-colors hover:bg-black/[0.05]"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#6B7280]">
            <LogoutIcon className="h-[18px] w-[18px]" />
          </span>
          Sair
        </button>

        {/* pé da lateral: crianças na grama (só aparece em telas altas) e a marca da FAEC */}
        <div className="mt-auto pt-2">
          <svg viewBox="0 0 300 40" preserveAspectRatio="none" className="-mx-4 -mb-px block h-5 w-[calc(100%+2rem)]" aria-hidden="true">
            <path d="M0 40V22C60 2 110 4 170 16C220 26 260 22 300 6V40Z" fill="#2F8F5B" />
            <path d="M0 40V30C70 14 130 18 190 28C235 34 270 30 300 20V40Z" fill="#1E4632" />
          </svg>
          <div className="-mx-4 bg-brand px-4 py-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-sistema.png"
              alt="Sistema FAEC SENAR Ceará — Sindicato Rural"
              width={800}
              height={294}
              className="h-auto w-24"
            />
            <p className="mt-1 text-[10px] leading-snug text-white/80">Brincando e cultivando os valores humanos</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
