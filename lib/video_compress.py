"""
Comprime vídeos grandes usando o ffmpeg (linha de comando), reduzindo
resolução/bitrate antes de subir pro Google Drive.

Exige o ffmpeg instalado na máquina que roda o backend (python app.py) e
disponível no PATH. Se o ffmpeg não estiver instalado, ou a compressão
falhar por qualquer motivo, o arquivo original é usado sem alteração —
o upload nunca quebra por causa disso.

Instalar o ffmpeg no Windows (uma vez só):
  1. Baixe em https://www.gyan.dev/ffmpeg/builds/ (essentials build, .zip)
  2. Descompacte, por exemplo em C:\\ffmpeg
  3. Adicione C:\\ffmpeg\\bin ao PATH do Windows (Editar variáveis de
     ambiente do sistema > Path > Novo > C:\\ffmpeg\\bin)
  4. Abra um terminal novo e confirme com: ffmpeg -version
"""

import shutil
import subprocess
import tempfile
import os

LIMITE_BYTES = 10 * 1024 * 1024  # 10 MB


def comprimir_video_se_necessario(file_bytes: bytes, mime_type: str, filename: str):
    """
    Retorna (novos_bytes, novo_mime_type, novo_filename).
    Só mexe em arquivos de vídeo acima de LIMITE_BYTES; qualquer outra
    coisa (foto, pdf, vídeo pequeno) volta exatamente como veio.
    """
    eh_video = (mime_type or "").startswith("video/")
    if not eh_video or len(file_bytes) <= LIMITE_BYTES:
        return file_bytes, mime_type, filename

    if not shutil.which("ffmpeg"):
        print("[video_compress] ffmpeg não encontrado no PATH — enviando o vídeo original, sem comprimir.")
        return file_bytes, mime_type, filename

    entrada = None
    saida = None
    try:
        with tempfile.NamedTemporaryFile(suffix=os.path.splitext(filename)[1] or ".mp4", delete=False) as f:
            f.write(file_bytes)
            entrada = f.name

        saida = entrada + "_comprimido.mp4"

        resultado = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", entrada,
                "-vf", "scale='min(1280,iw)':-2",
                "-c:v", "libx264", "-crf", "28", "-preset", "veryfast",
                "-c:a", "aac", "-b:a", "128k",
                saida,
            ],
            capture_output=True,
            timeout=300,
        )

        if resultado.returncode != 0 or not os.path.exists(saida):
            print(f"[video_compress] ffmpeg falhou, enviando original. stderr: {resultado.stderr.decode(errors='ignore')[:500]}")
            return file_bytes, mime_type, filename

        with open(saida, "rb") as f:
            novos_bytes = f.read()

        if len(novos_bytes) >= len(file_bytes):
            # Comprimir não ajudou (raro, mas acontece com vídeos já bem comprimidos) — mantém o original.
            return file_bytes, mime_type, filename

        novo_nome = os.path.splitext(filename)[0] + ".mp4"
        print(f"[video_compress] {filename}: {len(file_bytes)/1_048_576:.1f}MB -> {len(novos_bytes)/1_048_576:.1f}MB")
        return novos_bytes, "video/mp4", novo_nome

    except Exception as e:
        print(f"[video_compress] Erro ao comprimir, enviando original: {e}")
        return file_bytes, mime_type, filename

    finally:
        for caminho in (entrada, saida):
            if caminho and os.path.exists(caminho):
                try:
                    os.remove(caminho)
                except OSError:
                    pass
