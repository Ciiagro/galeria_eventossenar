"use client";

import { useEffect, useState } from "react";
import { apiGetCache, Perfil } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

// A barra lateral e as páginas usam o mesmo perfil: apiGetCache junta as chamadas numa só
// e o cache é limpo sozinho quando a pessoa sai ou troca de conta (veja src/lib/api.ts).
// O perfil fica guardado nesta aba (só para desenhar a tela): assim, ao recarregar a página, o menu já
// aparece certo e não "pisca" no menu do coordenador antes de chegar o do administrador. O servidor
// continua decidindo as permissões de verdade, e o perfil novo sempre substitui o guardado.
const CHAVE_PERFIL = "perfil_visual";
function lerPerfilSalvo(): Perfil | null {
  try {
    const texto = window.sessionStorage.getItem(CHAVE_PERFIL);
    return texto ? (JSON.parse(texto) as Perfil) : null;
  } catch {
    return null;
  }
}
function guardarPerfil(perfil: Perfil) {
  try { window.sessionStorage.setItem(CHAVE_PERFIL, JSON.stringify(perfil)); } catch { /* sem armazenamento: tudo bem */ }
}
export function esquecerPerfilSalvo() {
  try { window.sessionStorage.removeItem(CHAVE_PERFIL); } catch { /* ignora */ }
}

export function usePerfil() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let montado = true;
    let usuarioAtual: string | null | undefined;

    function buscar(mostrarCarregando: boolean) {
      if (mostrarCarregando) setCarregando(true);
      apiGetCache("/api/perfil", 60_000)
        .then((p: Perfil) => { if (montado) { setPerfil(p); guardarPerfil(p); } })
        .catch(() => { if (montado) { setPerfil(null); esquecerPerfilSalvo(); } })
        .finally(() => { if (montado) setCarregando(false); });
    }

    // já mostra o último perfil conhecido enquanto confere o atual
    const salvo = lerPerfilSalvo();
    if (salvo) {
      setPerfil(salvo);
      setCarregando(false);
    }
    buscar(!salvo);

    // Refaz a busca só quando a PESSOA muda. O Supabase também avisa ao voltar para a aba e
    // ao renovar o token: nesses casos nada mudou, então não refazemos nada (antes a tela
    // inteira sumia e recarregava toda vez que você voltava para a aba).
    const { data } = supabaseBrowser.auth.onAuthStateChange((_evento, sessao) => {
      const id = sessao?.user?.id ?? null;
      if (usuarioAtual === undefined) { usuarioAtual = id; return; }
      if (id === usuarioAtual) return;
      usuarioAtual = id;
      esquecerPerfilSalvo();
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
