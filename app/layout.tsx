"use client";

import "./globals.css";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { AuthGuard } from "@/components/AuthGuard";
import { FundoSistema } from "@/components/FundoSistema";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const semSidebar = pathname?.startsWith("/galeria") || pathname === "/login";

  return (
    <html lang="pt-BR">
      <head>
        <title>Projeto Valores Humanos — FAEC SENAR Ceará</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta
          name="description"
          content="Acompanhe os trabalhos do Projeto Valores Humanos nos municípios: paz, amor, verdade, ação correta e não violência."
        />
      </head>
      <body className="font-sans text-brand-dark">
        <AuthGuard>
          {semSidebar ? (
            <main className="min-h-screen">{children}</main>
          ) : (
            <div className="flex">
              <Sidebar />
              <FundoSistema>{children}</FundoSistema>
            </div>
          )}
        </AuthGuard>
      </body>
    </html>
  );
}
