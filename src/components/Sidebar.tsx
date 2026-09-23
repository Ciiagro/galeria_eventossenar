"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { usePerfil } from "@/lib/usePerfil";
import { HomeIcon, AlertIcon, LogoutIcon, UserIcon, FolderIcon, ImageIcon, BuildingIcon, FileTextIcon } from "@/components/icons";

type LinkMenu = { href: string; label: string; Icon: (p: { className?: string }) => JSX.Element; prefixo?: string };

const linksBase: LinkMenu[] = [
  { href: "/", label: "Início", Icon: HomeIcon },
  { href: "/escolas", label: "Escolas", Icon: BuildingIcon },
];

const linksAdmin: LinkMenu[] = [
  { href: "/admin/pendencias", label: "Documentos", Icon: AlertIcon },
  { href: "/admin/responsaveis", label: "Responsáveis", Icon: UserIcon },
  { href: "/admin/projetos", label: "Projetos", Icon: FolderIcon },
];

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
  // Responsável municipal: "Documentos" leva à lista de documentos do próprio município
  // (o admin tem o "Documentos" do Painel de Aprovação, em linksAdmin).
  const linkDocumentosMunicipio: LinkMenu[] =
    perfil?.role === "municipio" && perfil.municipio_id
      ? [{ href: `/municipios/${perfil.municipio_id}`, label: "Documentos", Icon: FileTextIcon, prefixo: "/municipios/" }]
      : [];
  const links: LinkMenu[] =
    perfil?.role === "admin"
      ? [...linksBase, ...linksAdmin]
      : [linksBase[0], ...linkDocumentosMunicipio, ...linksBase.slice(1)];

  async function sair() {
    await supabaseBrowser.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="w-64 shrink-0 bg-brand text-white min-h-screen flex flex-col justify-between px-5 py-6">
      <div>
        <Link href="/" className="mb-6 block" aria-label="Sistema FAEC SENAR Ceará — ir para o início">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-sistema.png"
            alt="Sistema FAEC SENAR Ceará — Sindicato Rural"
            width={800}
            height={294}
            className="w-full max-w-[200px] h-auto"
          />
        </Link>

        {perfil && (
          <div className="mb-6 rounded-xl bg-white/[0.06] border border-white/10 p-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 shrink-0 rounded-full bg-white/15 flex items-center justify-center text-sm font-semibold tracking-wide"
                aria-hidden
              >
                {iniciais(perfil.nome || perfil.email)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight truncate" title={perfil.nome || perfil.email || undefined}>
                  {perfil.nome || perfil.email}
                </p>
                {perfil.nome && perfil.email && (
                  <p className="mt-0.5 text-xs text-white/70 truncate" title={perfil.email}>
                    {perfil.email}
                  </p>
                )}
              </div>
            </div>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" aria-hidden />
              {perfil.role === "admin" ? "Administrador" : "Responsável municipal"}
            </span>
          </div>
        )}

        <nav className="space-y-1">
          {links.map(({ href, label, Icon, prefixo }) => {
            const active = pathname === href || Boolean(prefixo && pathname?.startsWith(prefixo));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  active ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
          {/* Galeria pública abre em outra aba (é a página que o público vê, sem login) */}
          <a
            href="/galeria"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/5 transition-colors"
          >
            <ImageIcon className="w-4 h-4" />
            Ver galeria pública
            <span className="ml-auto text-xs text-white/60" aria-hidden>↗</span>
          </a>
        </nav>
      </div>

      <div className="space-y-4">
        <button
          onClick={sair}
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white transition-colors w-full"
        >
          <LogoutIcon className="w-4 h-4" />
          Sair
        </button>
        <p className="text-xs text-white/70 leading-relaxed">
          Juntos pelo desenvolvimento do nosso campo.
        </p>
      </div>
    </aside>
  );
}
