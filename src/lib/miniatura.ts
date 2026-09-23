import { API_BASE } from "@/lib/api";
import { normalizarLink } from "@/lib/linkIncorporavel";

type ComArquivo = {
  drive_file_id?: string | null;
  drive_file_link?: string | null;
  link_externo?: string | null;
};

// Endereços possíveis para a miniatura de um documento, em ordem de preferência.
// O <img> tenta o primeiro; se falhar, passa para o próximo.
export function urlsMiniatura(doc: ComArquivo): string[] {
  const urls: string[] = [];
  // 1) arquivo enviado pelo sistema: miniatura pelo nosso servidor (funciona mesmo se não for público)
  const nosso = doc.drive_file_id ?? idDoDrive(doc.drive_file_link);
  if (nosso) {
    urls.push(`${API_BASE}/api/miniatura/${nosso}`);
    urls.push(`https://lh3.googleusercontent.com/d/${nosso}=w640`);
  }
  // 2) link colado pela pessoa
  const link = normalizarLink(doc.link_externo);
  if (link) {
    const driveExterno = idDoDrive(link);
    if (driveExterno && driveExterno !== nosso) {
      urls.push(`https://lh3.googleusercontent.com/d/${driveExterno}=w640`);
      urls.push(`https://drive.google.com/thumbnail?id=${driveExterno}&sz=w640`);
    }
    const youtube = link.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{6,})/);
    if (youtube && /youtu/.test(link)) urls.push(`https://img.youtube.com/vi/${youtube[1]}/hqdefault.jpg`);
    if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(link)) urls.push(link);
  }
  return urls;
}

export function idDoDrive(link?: string | null) {
  if (!link || !/drive\.google|docs\.google/.test(link)) return null;
  return link.match(/\/d\/([\w-]+)/)?.[1] ?? link.match(/[?&]id=([\w-]+)/)?.[1] ?? null;
}
