"use client";

import { useEffect, useState } from "react";
import PreviewLink from "@/components/PreviewLink";
import { linkIncorporavel, nomePlataforma, pareceEndereco } from "@/lib/linkIncorporavel";

// Mostra, logo depois que a pessoa cola um link, se ele vai abrir no sistema:
// verde = reconhecido (com a prévia do vídeo/arquivo), amarelo = pode não abrir.
export function PreviaDoLink({ link }: { link: string }) {
  // espera a pessoa parar de digitar/colar antes de carregar a prévia
  const [atual, setAtual] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setAtual(link.trim()), 600);
    return () => window.clearTimeout(t);
  }, [link]);

  if (!link.trim() || !atual || !pareceEndereco(atual)) return null;

  const plataforma = nomePlataforma(atual);
  const embed = linkIncorporavel(atual);

  if (!embed) {
    const ehFotos = plataforma === "Google Fotos";
    return (
      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
        <strong>Este link pode não abrir dentro do sistema.</strong>{" "}
        {ehFotos
          ? "Links do Google Fotos não aparecem na galeria; quem quiser ver precisa clicar para abrir em outra aba."
          : "Ele será salvo, mas na galeria só aparecerá um botão para abrir em outra aba."}{" "}
        Se puder, use um link do YouTube, do Google Drive ou do Instagram (post ou reel).
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900">
      <p>
        <strong>✓ Link reconhecido ({plataforma}).</strong> Confira abaixo se é o vídeo ou arquivo certo.
        {plataforma === "Google Drive" && " Se aparecer \"Solicitar acesso\", o arquivo está restrito: no Drive, Compartilhar → \"Qualquer pessoa com o link\"."}
        {plataforma === "Instagram" && " Só funciona se o perfil for público."}
        {plataforma === "YouTube" && " O vídeo precisa estar como \"Público\" ou \"Não listado\"."}
      </p>
      <PreviewLink link={atual} className="mt-2 w-full max-w-xs h-44" />
    </div>
  );
}
