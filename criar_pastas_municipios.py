"""
Cria (ou reaproveita) a pasta do Google Drive de cada município que já tem
responsável cadastrado mas ainda não tem drive_folder_id, e grava o ID de
volta em trab_divulgados.municipios_extra.

Rodar UMA vez agora, e de novo sempre que cadastrar um responsável novo
(municípios que já têm drive_folder_id são ignorados, não duplica pasta):

    python criar_pastas_municipios.py

Pré-requisitos (mesmos do criar_pasta_raiz_teste.py):
  - .env com SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SCHEMA
  - .env com as credenciais do Google Drive (OAuth ou service account)
  - .env com DRIVE_ROOT_FOLDER_ID já preenchido (gerado pelo
    criar_pasta_raiz_teste.py) — é dentro dela que as pastas dos
    municípios serão criadas.
"""

import os
from dotenv import load_dotenv

load_dotenv()

from lib.supabase_client import get_client
from lib.drive_client import get_drive_service, get_or_create_subfolder

ROOT_FOLDER_ID = os.environ["DRIVE_ROOT_FOLDER_ID"]


def main():
    db = get_client()
    service = get_drive_service()

    # município é a view que já junta sindicatos.municipios + municipios_extra
    municipios = (
        db.table("municipios")
        .select("id, nome, responsavel_id, responsavel_nome, drive_folder_id")
        .execute()
        .data
    )

    pendentes = [
        m for m in municipios
        if m.get("responsavel_id") and not m.get("drive_folder_id")
    ]

    if not pendentes:
        print("Nenhum município pendente: todos os que têm responsável já têm pasta no Drive.")
        return

    for m in pendentes:
        nome_pasta = m["nome"]
        folder_id = get_or_create_subfolder(service, ROOT_FOLDER_ID, nome_pasta)

        db.table("municipios_extra").update(
            {"drive_folder_id": folder_id}
        ).eq("municipio_id", m["id"]).execute()

        print(f"OK  {nome_pasta:<30} responsável: {m.get('responsavel_nome'):<30} drive_folder_id={folder_id}")

    print(f"\n{len(pendentes)} pasta(s) criada(s)/vinculada(s) com sucesso.")


if __name__ == "__main__":
    main()
