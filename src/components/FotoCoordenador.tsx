"use client";

import { useEffect, useState } from "react";
import { apiBlobUrl } from "@/lib/api";

const PASTEIS = [
  { fundo: "#E7F1E8", texto: "#2B6A45" }, { fundo: "#E2EFFB", texto: "#0F4C85" }, { fundo: "#FFF3CC", texto: "#6E4B00" },
  { fundo: "#F3E4F5", texto: "#7B3A86" }, { fundo: "#FDE7DD", texto: "#9A4A22" }, { fundo: "#E0F3F1", texto: "#1B6B63" },
];

// "Versão" das fotos: muda sempre que alguém salva uma foto. Entra no endereço da imagem, assim a foto nova
// aparece na hora (sem recarregar a página) e o navegador não mostra a antiga que ficou guardada.
let versaoFotos = "0";
try { versaoFotos = window.sessionStorage.getItem("fotos_v") ?? "0"; } catch { /* sem armazenamento */ }
export function atualizarFotos() {
  versaoFotos = String(Date.now());
  try { window.sessionStorage.setItem("fotos_v", versaoFotos); } catch { /* ignora */ }
  window.dispatchEvent(new Event("fotos-atualizadas"));
}

// endereço da foto de um coordenador, já com a versão (para nunca pegar uma foto velha guardada)
export const caminhoFotoCoordenador = (userId: string) => `/api/coordenador-foto?user_id=${encodeURIComponent(userId)}&v=${versaoFotos}`;

export function iniciais(nome?: string | null) {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return ((partes[0][0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

// Foto redonda do(a) coordenador(a). A imagem fica no Google Drive; enquanto carrega, ou se não houver foto,
// aparecem as iniciais do nome numa cor suave.
export function FotoCoordenador({ userId, nome, tamanho = 40, propria = false }: { userId?: string | null; nome?: string | null; tamanho?: number; propria?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [versao, setVersao] = useState(versaoFotos);
  useEffect(() => {
    const aoMudar = () => setVersao(versaoFotos);
    window.addEventListener("fotos-atualizadas", aoMudar);
    return () => window.removeEventListener("fotos-atualizadas", aoMudar);
  }, []);
  useEffect(() => {
    let vivo = true;
    // "propria": a foto de quem está logado (o servidor usa o usuário da sessão)
    const caminho = userId ? `/api/coordenador-foto?user_id=${encodeURIComponent(userId)}&v=${versao}` : `/api/coordenador-foto?v=${versao}`;
    if (userId || propria) apiBlobUrl(caminho).then((u) => { if (vivo) setSrc(u); });
    else setSrc(null);
    return () => { vivo = false; };
  }, [userId, propria, versao]);
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
