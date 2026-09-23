"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePerfil } from "@/lib/usePerfil";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { perfil, carregando } = usePerfil();
  const router = useRouter();

  useEffect(() => {
    if (!carregando && perfil?.role !== "admin") {
      router.replace("/");
    }
  }, [carregando, perfil, router]);

  if (carregando || perfil?.role !== "admin") return null;
  return <>{children}</>;
}
