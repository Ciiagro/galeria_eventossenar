"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { apiGet, apiGetCache } from "@/lib/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [verificado, setVerificado] = useState<string | null>(null); // usuário cujo termo de compromisso já foi conferido

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

  const publica = pathname === "/login" || pathname === "/adesao" || pathname === "/assinar" || pathname.startsWith("/galeria");

  useEffect(() => {
    if (carregando) return;
    if (pathname === "/login" && sessao) router.replace("/");
    if (!publica && !sessao) router.replace("/login");
  }, [carregando, pathname, router, sessao, publica]);

  // Coordenador liberado (já tem município) só usa o sistema depois de assinar o termo de compromisso.
  // Enquanto confere, a tela não aparece (evita mostrar o sistema por um instante antes de mandar para o termo).
  const usuarioId = sessao?.user?.id ?? null;
  useEffect(() => {
    if (carregando || publica || !usuarioId) return;
    let vivo = true;
    (async () => {
      try {
        const chave = `compromisso_ok:${usuarioId}`;
        let jaAssinou = false;
        try { jaAssinou = window.sessionStorage.getItem(chave) === "1"; } catch { /* ignora */ }
        if (jaAssinou) { if (vivo) setVerificado(usuarioId); return; } // assinou antes: não precisa conferir de novo
        const perfil = await apiGetCache("/api/perfil");
        if (perfil?.role === "municipio" && perfil.municipio_id) {
          const c = await apiGetCache("/api/compromisso", 20_000); // mesma chamada da barra lateral e da página: só uma vai ao servidor
          if (c?.assinado) { try { window.sessionStorage.setItem(chave, "1"); } catch { /* ignora */ } }
          if (c && c.sem_edicao === false && c.assinado === false) {
            if (vivo && pathname !== "/compromisso") router.replace("/compromisso");
            if (vivo) setVerificado(null);
            return;
          }
        }
      } catch {
        // sem resposta agora: não bloqueia
      }
      if (vivo) setVerificado(usuarioId);
    })();
    return () => { vivo = false; };
  }, [carregando, publica, usuarioId, pathname, router]);

  if (carregando) return null;
  if (publica) return <>{children}</>;
  if (sessao) return pathname === "/compromisso" || verificado === usuarioId ? <>{children}</> : null;
  return null;
}