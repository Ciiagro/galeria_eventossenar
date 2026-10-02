"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// A tela "Projetos" virou "Valores". Este endereço antigo só redireciona.
export default function ProjetosRedireciona() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/valores");
  }, [router]);
  return null;
}
