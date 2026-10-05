"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePerfil } from "@/lib/usePerfil";
import { TermoDocumento } from "@/components/TermoDocumento";

// Termo de Adesão do próprio coordenador (imprimir / salvar em PDF)
export default function TermoDoCoordenadorPage() {
  const { perfil, carregando } = usePerfil();
  const router = useRouter();

  useEffect(() => {
    if (!carregando && perfil?.role !== "municipio") router.replace("/");
  }, [carregando, perfil, router]);

  if (carregando || perfil?.role !== "municipio") return null;
  return <TermoDocumento voltarHref="/adesao/ficha" />;
}
