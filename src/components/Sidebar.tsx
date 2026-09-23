"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { usePerfil } from "@/lib/usePerfil";
import { HomeIcon, AlertIcon, LogoutIcon, UserIcon, FolderIcon, ImageIcon } from "@/components/icons";

const linksBase = [{ href: "/", label: "Início", Icon: HomeIcon }];

const linksAdmin = [
  { href: "/admin/pendencias", label: "Documentos", Icon: AlertIcon },
  { href: "/admin/responsaveis", label: "Responsáveis", Icon: UserIcon },
  { href: "/admin/projetos", label: "Projetos", Icon: FolderIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { perfil } = usePerfil();
  const links = perfil?.role === "admin" ? [...linksBase, ...linksAdmin] : linksBase;

  async function sair() {
    await supabaseBrowser.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="w-64 shrink-0 bg-brand text-white min-h-screen flex flex-col justify-between px-5 py-6">
      <div>
        <div className="mb-6">
          <div className="text-lg font-semibold leading-tight">FAEC SENAR</div>
          <div className="text-sm text-white/80">Ceará</div>
        </div>

        {perfil && (
          <div className="mb-6 pb-4 border-b border-white/10">
            <p className="text-xs text-white/70 mb-0.5">Logado como</p>
            <p className="text-sm font-medium truncate">{perfil.nome || perfil.email}</p>
            <p className="text-xs text-white/75 truncate">{perfil.email}</p>
            <span className="inline-block mt-1.5 text-xs bg-white/10 px-2 py-0.5 rounded-full">
              {perfil.role === "admin" ? "Administrador" : "Responsável municipal"}
            </span>
          </div>
        )}

        <nav className="space-y-1">
          {links.map(({ href, label, Icon }) => {
            const active = pathname === href;
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
