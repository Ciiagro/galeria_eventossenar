"use client";

import { useEffect, useState } from "react";
import { apiGetCache, Perfil } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

// A barra lateral e as páginas usam o mesmo perfil: apiGetCache junta as chamadas numa só
// e o cache é limpo sozinho quando a pessoa sai ou troca de conta (veja src/lib/api.ts).
export function usePerfil() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let montado = true;
    let usuarioAtual: string | null | undefined;

    function buscar(mostrarCarregando: boolean) {
      if (mostrarCarregando) setCarregando(true);
      apiGetCache("/api/perfil", 60_000)
        .then((p: Perfil) => { if (montado) setPerfil(p); })
        .catch(() => { if (montado) setPerfil(null); })
        .finally(() => { if (montado) setCarregando(false); });
    }

    buscar(true);

    // Refaz a busca só quando a PESSOA muda. O Supabase também avisa ao voltar para a aba e
    // ao renovar o token: nesses casos nada mudou, então não refazemos nada (antes a tela
    // inteira sumia e recarregava toda vez que você voltava para a aba).
    const { data } = supabaseBrowser.auth.onAuthStateChange((_evento, sessao) => {
      const id = sessao?.user?.id ?? null;
      if (usuarioAtual === undefined) { usuarioAtual = id; return; }
      if (id === usuarioAtual) return;
      usuarioAtual = id;
      setPerfil(null);
      buscar(true);
    });

    return () => {
      montado = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { perfil, carregando };
}
