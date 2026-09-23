"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// Endereço antigo (/galeria/123): agora tudo fica na mesma galeria,
// já filtrada pelo município.
export default function GaleriaMunicipioRedireciona() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/galeria?municipio_id=${id}`);
  }, [id, router]);
  return null;
}
