// Converte um link colado pelo usuário (YouTube, Google Drive, Instagram,
// Vimeo, Facebook, arquivo direto...) no formato que dá pra mostrar dentro
// da página. Se o site não permitir incorporar, devolve null e a tela mostra
// só o link para abrir em nova aba.

export type LinkIncorporavel =
  | { tipo: "iframe"; src: string; vertical?: boolean }
  | { tipo: "video"; src: string }
  | { tipo: "imagem"; src: string };

export function normalizarLink(link?: string | null): string | null {
  const texto = (link ?? "").trim();
  if (!texto) return null;
  return /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;
}

export function linkIncorporavel(link?: string | null): LinkIncorporavel | null {
  const bruto = normalizarLink(link);
  if (!bruto) return null;

  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "").toLowerCase();
  const caminho = url.pathname;

  // ---- Google Drive / Docs ----
  if (host === "drive.google.com" || host === "docs.google.com") {
    const pasta = caminho.match(/\/folders\/([\w-]+)/);
    if (pasta) return { tipo: "iframe", src: `https://drive.google.com/embeddedfolderview?id=${pasta[1]}#grid` };

    const doc = caminho.match(/\/(document|presentation|spreadsheets|forms)\/d\/([\w-]+)/);
    if (doc) return { tipo: "iframe", src: `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview` };

    const id = caminho.match(/\/d\/([\w-]+)/)?.[1] ?? url.searchParams.get("id");
    if (id) return { tipo: "iframe", src: `https://drive.google.com/file/d/${id}/preview` };
    return null;
  }

  // ---- YouTube ----
  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    let id: string | null = null;
    if (host === "youtu.be") id = caminho.split("/")[1] || null;
    else id = url.searchParams.get("v") ?? caminho.match(/\/(?:shorts|embed|live|v)\/([\w-]+)/)?.[1] ?? null;
    if (!id) return null;
    const inicio = url.searchParams.get("t") ?? url.searchParams.get("start");
    // aceita "90", "90s" e "1m30s"
    const partes = inicio?.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    const segundos = partes ? Number(partes[1] ?? 0) * 3600 + Number(partes[2] ?? 0) * 60 + Number(partes[3] ?? 0) : 0;
    return {
      tipo: "iframe",
      src: `https://www.youtube.com/embed/${id}${segundos ? `?start=${segundos}` : ""}`,
      vertical: caminho.includes("/shorts/"),
    };
  }

  // ---- Vimeo ----
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = caminho.match(/(\d{6,})/)?.[1];
    return id ? { tipo: "iframe", src: `https://player.vimeo.com/video/${id}` } : null;
  }

  // ---- Instagram (post, reel, IGTV) ----
  if (host === "instagram.com") {
    const m = caminho.match(/\/(p|reel|reels|tv)\/([\w-]+)/);
    if (!m) return null;
    const tipo = m[1] === "reels" ? "reel" : m[1];
    return { tipo: "iframe", src: `https://www.instagram.com/${tipo}/${m[2]}/embed`, vertical: true };
  }

  // ---- Facebook (vídeos públicos) ----
  if (host === "facebook.com" || host === "fb.watch" || host === "web.facebook.com") {
    const ehVideo = host === "fb.watch" || /\/(videos|watch|reel|share\/v|share\/r)/.test(caminho) || url.searchParams.has("v");
    const plugin = ehVideo ? "video" : "post";
    return {
      tipo: "iframe",
      src: `https://www.facebook.com/plugins/${plugin}.php?href=${encodeURIComponent(bruto)}&show_text=false`,
    };
  }

  // ---- TikTok ----
  if (host === "tiktok.com") {
    const id = caminho.match(/\/video\/(\d+)/)?.[1];
    return id ? { tipo: "iframe", src: `https://www.tiktok.com/embed/v2/${id}`, vertical: true } : null;
  }

  // ---- Arquivos diretos ----
  const extensao = caminho.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (extensao && ["mp4", "webm", "ogg", "mov", "m4v"].includes(extensao)) return { tipo: "video", src: bruto };
  if (extensao && ["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(extensao)) return { tipo: "imagem", src: bruto };
  if (extensao === "pdf") return { tipo: "iframe", src: bruto };

  return null;
}
