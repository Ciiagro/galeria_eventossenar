"use client";

// Comprime vídeos grandes DIRETO NO NAVEGADOR antes do upload, usando o
// ffmpeg.wasm (o ffmpeg de verdade, rodando via WebAssembly). Carregado
// via CDN em tempo de execução — não precisa instalar nada no projeto.
//
// Regras:
//  - Vídeo que já é H.264 (MP4 comum) e pequeno: vai como está (o Drive toca na hora).
//  - Vídeo em outro formato (ex.: HEVC/H.265 de iPhone, .MOV) ou grande:
//    é convertido para MP4 H.264, que o Google Drive processa rápido.
//  - O tempo máximo de conversão agora acompanha a duração do vídeo
//    (antes era fixo em 45s, então vídeos longos iam sem converter e o
//    Drive ficava "processando" por muito tempo ou não tocava).
// Se der qualquer erro (navegador não suporta, CDN fora do ar, etc), o
// arquivo original é usado — nunca trava o envio por causa disso.

let ffmpegInstancia: any = null;
let ffmpegCarregando: Promise<any> | null = null;

async function carregarFFmpeg() {
  if (ffmpegInstancia) return ffmpegInstancia;
  if (ffmpegCarregando) return ffmpegCarregando;

  ffmpegCarregando = (async () => {
    // @ts-ignore -- import de URL externa (CDN), resolvido em tempo de execução no navegador
    const { FFmpeg } = await import(/* webpackIgnore: true */ "https://esm.sh/@ffmpeg/ffmpeg@0.12.10");
    // @ts-ignore
    const { toBlobURL } = await import(/* webpackIgnore: true */ "https://esm.sh/@ffmpeg/util@0.12.1");

    const ffmpeg = new FFmpeg();
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    const baseURLFFmpeg = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm";

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      classWorkerURL: await toBlobURL(`${baseURLFFmpeg}/worker.js`, "text/javascript"),
    });

    ffmpegInstancia = ffmpeg;
    return ffmpeg;
  })();

  return ffmpegCarregando;
}

export async function comprimirVideoSeNecessario(
  arquivo: File,
  onProgresso?: (percentual: number) => void
): Promise<File> {
  const ehVideo = arquivo.type.startsWith("video/");
  if (!ehVideo) {
    return arquivo;
  }

  // ~1,5 min de espera por minuto de vídeo, entre 1 e 20 minutos no total.
  const duracao = await duracaoDoVideo(arquivo);
  const TIMEOUT_MS = Math.min(20 * 60_000, Math.max(60_000, duracao ? duracao * 1500 : 5 * 60_000));

  let cancelado = false;
  const resultado = await Promise.race([
    comprimirDeVerdade(arquivo, onProgresso, () => cancelado).then((r) => ({ ok: true as const, arquivo: r })),
    new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), TIMEOUT_MS)),
  ]);

  if (!resultado.ok) {
    cancelado = true;
    ffmpegInstancia?.terminate?.();
    ffmpegInstancia = null;
    ffmpegCarregando = null;
    console.warn(`[comprimirVideo] Demorou mais de ${Math.round(TIMEOUT_MS / 1000)}s, vou enviar o arquivo original.`);
    return arquivo;
  }
  return resultado.arquivo;
}

// Duração em segundos, lida pelo próprio navegador (rápido, não decodifica o vídeo).
function duracaoDoVideo(arquivo: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(arquivo);
    const video = document.createElement("video");
    const fim = (valor: number | null) => { URL.revokeObjectURL(url); resolve(valor); };
    video.preload = "metadata";
    video.onloadedmetadata = () => fim(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => fim(null);
    setTimeout(() => fim(null), 10_000);
    video.src = url;
  });
}

const LIMITE_SEM_CONVERTER = 50 * 1024 * 1024; // H.264 até 50MB vai direto

async function comprimirDeVerdade(
  arquivo: File,
  onProgresso?: (percentual: number) => void,
  foiCancelado?: () => boolean
): Promise<File> {
  try {
    const ffmpeg = await carregarFFmpeg();
    // @ts-ignore
    const { fetchFile } = await import(/* webpackIgnore: true */ "https://esm.sh/@ffmpeg/util@0.12.1");

    const aoProgredir = ({ progress }: { progress: number }) => {
      onProgresso?.(Math.max(0, Math.min(99, Math.round(progress * 100))));
    };
    ffmpeg.on("progress", aoProgredir);

    const extensaoEntrada = arquivo.name.match(/\.[^.]+$/)?.[0] || ".mp4";
    const nomeEntrada = "entrada" + extensaoEntrada;
    const nomeSaida = "saida.mp4";

    await ffmpeg.writeFile(nomeEntrada, await fetchFile(arquivo));

    // Descobre o codec lendo só o cabeçalho (instantâneo).
    let infoCodec = "";
    const aoLogar = ({ message }: { message: string }) => { infoCodec += message + "\n"; };
    ffmpeg.on("log", aoLogar);
    await ffmpeg.exec(["-hide_banner", "-i", nomeEntrada]).catch(() => null);
    ffmpeg.off("log", aoLogar);
    const jaEhH264 = /Video:\s*h264/i.test(infoCodec) && /\.(mp4|m4v)$/i.test(nomeEntrada);

    if (jaEhH264 && arquivo.size <= LIMITE_SEM_CONVERTER) {
      ffmpeg.off("progress", aoProgredir);
      await ffmpeg.deleteFile(nomeEntrada).catch(() => null);
      onProgresso?.(100);
      return arquivo;
    }
    if (foiCancelado?.()) return arquivo;

    await ffmpeg.exec([
      "-i", nomeEntrada,
      "-vf", "scale='min(1280,iw)':-2",
      "-c:v", "libx264", "-crf", "28", "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      nomeSaida,
    ]);

    const dados = await ffmpeg.readFile(nomeSaida);
    ffmpeg.off("progress", aoProgredir);

    // limpa a memória virtual do ffmpeg pra não acumular entre uploads
    await ffmpeg.deleteFile(nomeEntrada).catch(() => null);
    await ffmpeg.deleteFile(nomeSaida).catch(() => null);

    const blob = new Blob([dados], { type: "video/mp4" });

    const novoNome = arquivo.name.replace(/\.[^.]+$/, "") + ".mp4";
    onProgresso?.(100);
    return new File([blob], novoNome, { type: "video/mp4" });
  } catch (e) {
    console.warn("[comprimirVideo] Não consegui comprimir, enviando o arquivo original:", e);
    return arquivo;
  }
}
