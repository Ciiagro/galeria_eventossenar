"use client";

import { AdminGuard } from "@/components/AdminGuard";
import { TermoDocumento } from "@/components/TermoDocumento";

export default function TermoDocumentoAdminPage({ params }: { params: { id: string } }) {
  return (
    <AdminGuard>
      <TermoDocumento id={params.id} voltarHref="/admin/termo-adesao" />
    </AdminGuard>
  );
}
