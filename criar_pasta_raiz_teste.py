"""
Teste do Google Drive (rodar UMA vez, na pasta do projeto):

    python criar_pasta_raiz_teste.py

O que faz:
  1. Cria a pasta raiz "Sistema Municipios" no seu Drive.
  2. Cria dentro dela uma pasta de teste "Municipio Teste".
  3. Envia um arquivo de texto para "Municipio Teste/Imagens".
  4. Mostra os IDs que você vai colocar no .env e no Supabase.

Se aparecer o arquivo "teste-upload.txt" no seu Drive, está tudo funcionando.
"""

from dotenv import load_dotenv

load_dotenv()

from lib.drive_client import (
    get_drive_service,
    get_or_create_subfolder,
    upload_file,
)

NOME_RAIZ = "Sistema Municipios"
NOME_MUNICIPIO_TESTE = "Municipio Teste"


def main():
    service = get_drive_service()

    # "root" = a raiz do "Meu Drive" de quem autorizou
    raiz_id = get_or_create_subfolder(service, "root", NOME_RAIZ)
    municipio_id = get_or_create_subfolder(service, raiz_id, NOME_MUNICIPIO_TESTE)

    file_id, link = upload_file(
        service=service,
        municipio_folder_id=municipio_id,
        tipo_documento="Imagens",
        filename="teste-upload.txt",
        file_bytes="Se você está lendo isso, o upload funcionou.".encode("utf-8"),
        mime_type="text/plain",
    )

    print("\n=== FUNCIONOU ===")
    print(f"DRIVE_ROOT_FOLDER_ID (colocar no .env)   : {raiz_id}")
    print(f"Pasta 'Municipio Teste' (drive_folder_id) : {municipio_id}")
    print(f"Arquivo de teste                          : {link}")


if __name__ == "__main__":
    main()
