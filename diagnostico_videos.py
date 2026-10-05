"""Confere se as imagens dos vídeos de divulgação do projeto aparecem para quem visita o site.

Como rodar (na pasta do projeto, com o ambiente virtual ligado):
    python diagnostico_videos.py

O teste que importa é o PÚBLICO: ele pede a imagem ao Google SEM login, como faz um visitante.
Também mostra qual conta do Google o sistema usa.
"""
import base64
import json
import os
import sys

import httpx
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from googleapiclient.errors import HttpError  # noqa: E402

from lib.drive_client import get_drive_service  # noqa: E402

VIDEOS = {
    "Quixadá": "1jHMwOMX_UlYbloVgzhlcNR-8GcwlSsW2",
    "Russas": "1FaP6DR3nl9x4frkYf5gehAuFtWkRS63K",
    "Ubajara": "1jU0WqyiEE5gvuo8_-Cb_N-SaW0AZBKKX",
    "Visita técnica": "1FaDvnq_BrrY8PvIHiXCuJ96Cw6iCVBfO",
    "Capacitação": "191onjzFeDUvM9dcxKP6Srun7AZL_fIH_",
}


def modo_e_conta() -> tuple[bool, str]:
    """(usa_oauth, e-mail) da conta que o sistema usa para falar com o Drive."""
    if os.environ.get("GOOGLE_OAUTH_REFRESH_TOKEN"):
        try:
            email = get_drive_service().about().get(fields="user(emailAddress)").execute()["user"]["emailAddress"]
        except Exception:  # noqa: BLE001
            email = "(não consegui descobrir)"
        return True, email
    info = json.loads(base64.b64decode(os.environ["GOOGLE_SERVICE_ACCOUNT_B64"]))
    return False, info.get("client_email", "(sem e-mail)")


def imagem_publica(id_arquivo: str) -> bool:
    """O Google entrega a imagem do vídeo sem login? (é o que um visitante do site recebe)"""
    try:
        r = httpx.get(f"https://drive.google.com/thumbnail?id={id_arquivo}&sz=w320", timeout=20, follow_redirects=True)
        return r.status_code == 200 and r.headers.get("content-type", "").startswith("image/")
    except Exception:  # noqa: BLE001
        return False


def main() -> None:
    oauth, email = modo_e_conta()
    print(f"\nConta do Google usada pelo sistema: {email} ({'OAuth' if oauth else 'conta de serviço'})")
    if oauth:
        print("No modo OAuth o sistema só enxerga arquivos que ELE criou (permissão 'drive.file').")
        print("Compartilhar com esta conta NÃO resolve: o jeito é deixar o vídeo público ou usar capas em public/videos-projeto/.")
    print()

    faltam = 0
    for nome, id_arquivo in VIDEOS.items():
        publico = imagem_publica(id_arquivo)
        pelo_sistema = ""
        if not oauth:
            try:
                info = get_drive_service().files().get(fileId=id_arquivo, fields="thumbnailLink", supportsAllDrives=True).execute()
                pelo_sistema = " | sistema acessa: sim" + ("" if info.get("thumbnailLink") else " (sem miniatura ainda)")
            except HttpError as erro:
                pelo_sistema = f" | sistema acessa: NÃO (erro {getattr(erro.resp, 'status', '?')}: compartilhe com {email})"
        if publico:
            print(f"[ok]    {nome:15s} a imagem aparece para qualquer visitante{pelo_sistema}")
        else:
            faltam += 1
            print(f"[FALHA] {nome:15s} o Google NÃO entrega a imagem sem login{pelo_sistema}")

    if faltam:
        print("\nPara corrigir: no Drive, abra cada vídeo > Compartilhar > Acesso geral > 'Qualquer pessoa com o link' (Leitor).")
        print("Depois rode este script de novo. Também serve (e é garantido) salvar as capas em public/videos-projeto/.\n")
    else:
        print("\nTudo certo: as imagens devem aparecer no site.\n")


if __name__ == "__main__":
    main()
