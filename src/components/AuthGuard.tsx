"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let montado = true;

    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (!montado) return;
      setSessao(data.session);
      setCarregando(false);
    });

    const { data } = supabaseBrowser.auth.onAuthStateChange((_event, session) => {
      if (montado) setSessao(session);
    });

    return () => {
      montado = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const publica = pathname === "/login" || pathname.startsWith("/galeria");

  useEffect(() => {
    if (carregando) return;
    if (pathname === "/login" && sessao) router.replace("/");
    if (!publica && !sessao) router.replace("/login");
  }, [carregando, pathname, router, sessao, publica]);

  if (carregando) return null;
  if (publica) return <>{children}</>;
  if (sessao) return <>{children}</>;
  return null;
}