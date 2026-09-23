"use client";

import "./globals.css";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { AuthGuard } from "@/components/AuthGuard";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const semSidebar = pathname?.startsWith("/galeria") || pathname === "/login";

  return (
    <html lang="pt-BR">
      <head>
        <title>Documentação Municipal — FAEC SENAR Ceará</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta
          name="description"
          content="Acompanhe e gerencie os documentos das ações realizadas nos municípios."
        />
      </head>
      <body className="font-sans text-brand-dark">
        <AuthGuard>
          {semSidebar ? (
            <main className="min-h-screen">{children}</main>
          ) : (
            <div className="flex">
              <Sidebar />
              <main className="flex-1 min-h-screen">{children}</main>
            </div>
          )}
        </AuthGuard>
      </body>
    </html>
  );
}
