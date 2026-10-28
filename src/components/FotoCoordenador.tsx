"use client";

import { useEffect, useState } from "react";
import { apiBlobUrl } from "@/lib/api";

const PASTEIS = [
  { fundo: "#E7F1E8", texto: "#2B6A45" }, { fundo: "#E2EFFB", texto: "#0F4C85" }, { fundo: "#FFF3CC", texto: "#6E4B00" },
  { fundo: "#F3E4F5", texto: "#7B3A86" }, { fundo: "#FDE7DD", texto: "#9A4A22" }, { fundo: "#E0F3F1", texto: "#1B6B63" },
];

export function iniciais(nome?: string | null) {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return ((partes[0][0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

// Foto redonda do(a) coordenador(a). A imagem fica no Google Drive; enquanto carrega, ou se não houver foto,
// aparecem as iniciais do nome numa cor suave.
export function FotoCoordenador({ userId, nome, tamanho = 40 }: { userId?: string | null; nome?: string | null; tamanho?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setSrc(null);
    if (userId) apiBlobUrl(`/api/coordenador-foto?user_id=${encodeURIComponent(userId)}`).then((u) => { if (vivo) setSrc(u); });
    return () => { vivo = false; };
  }, [userId]);
  const cor = PASTEIS[Math.abs([...(nome ?? "")].reduce((a, c) => a + c.charCodeAt(0), 0)) % PASTEIS.length];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold"
      style={{ width: tamanho, height: tamanho, background: cor.fundo, color: cor.texto, fontSize: tamanho * 0.36 }}
      title={nome ?? undefined}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={nome ? `Foto de ${nome}` : "Foto"} className="h-full w-full object-cover" />
      ) : (
        iniciais(nome)
      )}
    </span>
  );
}
