"use client";

import { linkIncorporavel } from "@/lib/linkIncorporavel";

type Props = {
  link?: string | null;
  /** classes do quadro (largura/altura). Ex.: "w-full max-w-sm h-48" */
  className?: string;
  /** o que mostrar quando o link não pode ser incorporado */
  fallback?: React.ReactNode;
};

// Mostra o conteúdo de um link dentro da página (vídeo do YouTube, arquivo
// do Drive, post do Instagram, imagem, PDF...). Se o site não deixar
// incorporar, mostra o `fallback` (ou nada).
export default function PreviewLink({ link, className = "w-full max-w-sm h-48", fallback = null }: Props) {
  const embed = linkIncorporavel(link);
  if (!embed) return <>{fallback}</>;

  const moldura = `rounded-md border border-black/5 bg-black/5 overflow-hidden ${className}`;

  if (embed.tipo === "imagem") {
    return <img src={embed.src} alt="" loading="lazy" className={`${moldura} object-contain`} />;
  }
  if (embed.tipo === "video") {
    return <video src={embed.src} controls preload="metadata" className={`${moldura} bg-black`} />;
  }
  return (
    <iframe
      src={embed.src}
      className={`${moldura} ${embed.vertical ? "min-h-[420px]" : ""}`}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
