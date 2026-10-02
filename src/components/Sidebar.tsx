"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { usePerfil } from "@/lib/usePerfil";
import { HomeIcon, AlertIcon, LogoutIcon, UserIcon, CalendarIcon, CheckIcon, ImageIcon, BuildingIcon, FileTextIcon, HeartIcon, ClipboardListIcon, BookOpenIcon } from "@/components/icons";
import { ROTULO_PAPEL } from "@/lib/api";
import { FaixaValores, LogoValores } from "@/components/Sol";
import { CORES_ALEGRES, CriancasPulando, Estrela, Grama } from "@/components/Desenhos";
import { useCiclos } from "@/lib/ciclos";

type LinkMenu = { href: string; label: string; Icon: (p: { className?: string }) => JSX.Element; prefixo?: string };

const linksBase: LinkMenu[] = [
  { href: "/", label: "Início", Icon: HomeIcon },
  { href: "/escolas", label: "Escolas", Icon: BuildingIcon },
];

const linksAdmin: LinkMenu[] = [
  { href: "/admin/pendencias", label: "Documentos", Icon: AlertIcon },
  { href: "/admin/responsaveis", label: "Coordenadores", Icon: UserIcon },
  { href: "/admin/equipe", label: "Equipe de apoio", Icon: HeartIcon },
  { href: "/admin/escolas-programa", label: "Escolas do programa", Icon: CheckIcon },
  { href: "/admin/ciclos", label: "Ciclos", Icon: CalendarIcon },
];

// Material Instrucional (apresentações, formações, cartilha...) — todos os perfis
const linkMaterial: LinkMenu = { href: "/material-instrucional", label: "Material Instrucional", Icon: BookOpenIcon };

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
  const { perfil } = usePerfil();
  const { ativo: cicloAtivo } = useCiclos();
  // Responsável municipal: "Documentos" leva à lista de documentos do próprio município
  // (o admin tem o "Documentos" do Painel de Aprovação, em linksAdmin).
  const linkDocumentosMunicipio: LinkMenu[] =
    perfil?.role === "municipio" && perfil.municipio_id
      ? [{ href: `/municipios/${perfil.municipio_id}`, label: "Documentos", Icon: FileTextIcon, prefixo: "/municipios/" }]
      : [];
  // Apoiador de Relatórios: fila de análise dos documentos (o admin valida depois)
  const linkAnalise: LinkMenu[] =
    perfil?.role === "apoiador_relatorios"
      ? [{ href: "/analise", label: "Análise de documentos", Icon: ClipboardListIcon }]
      : [];
  const links: LinkMenu[] =
    perfil?.role === "admin"
      ? [...linksBase, ...linksAdmin, linkMaterial]
      : [linksBase[0], ...linkDocumentosMunicipio, ...linkAnalise, ...linksBase.slice(1), linkMaterial];

  async function sair() {
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
            </div>
          </div>
        )}

        {/* menu: cada item com uma cor do programa */}
        <nav className="mt-3 space-y-0.5" aria-label="Menu principal">
          {links.map(({ href, label, Icon, prefixo }, i) => {
            const active = pathname === href || Boolean(prefixo && pathname?.startsWith(prefixo));
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
              </Link>
            );
          })}
          {/* Galeria pública abre em outra aba (é a página que o público vê, sem login) */}
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
