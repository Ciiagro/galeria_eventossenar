"use client";

import { useEffect, useState } from "react";
import { apiGet, Perfil } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

export function usePerfil() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let montado = true;

    function buscar() {
      setCarregando(true);
      apiGet("/api/perfil")
        .then((p: Perfil) => {
          if (montado) setPerfil(p);
        })
        .catch(() => {
          if (montado) setPerfil(null);
        })
        .finally(() => {
          if (montado) setCarregando(false);
        });
    }

    buscar();

    // Refaz a busca sempre que o login mudar (logar, deslogar, trocar de conta) —
    // sem isso, a barra lateral pode continuar mostrando o perfil da sessão anterior.
    const { data } = supabaseBrowser.auth.onAuthStateChange(() => {
      if (montado) buscar();
    });

    return () => {
      montado = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { perfil, carregando };
}
