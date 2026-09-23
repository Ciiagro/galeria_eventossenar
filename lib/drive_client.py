"""
Integração com Google Drive.

Dois modos de autenticação (o código escolhe sozinho):

1) TESTE  -> OAuth com refresh token (usa o Drive da conta de quem autorizou).
   Variáveis no .env:
     GOOGLE_OAUTH_CLIENT_ID
     GOOGLE_OAUTH_CLIENT_SECRET
     GOOGLE_OAUTH_REFRESH_TOKEN

2) PRODUÇÃO -> conta de serviço + Drive compartilhado.
   Variável no .env:
     GOOGLE_SERVICE_ACCOUNT_B64   (JSON da conta de serviço em base64)

Se GOOGLE_OAUTH_REFRESH_TOKEN existir, o modo 1 é usado.
Nos dois casos, DRIVE_ROOT_FOLDER_ID guarda o ID da pasta raiz.

Atenção (modo 1): com o escopo "drive.file" o sistema só enxerga pastas e
arquivos que ELE MESMO criou. Por isso a pasta raiz deve ser criada pelo
script criar_pasta_raiz_teste.py, e não à mão no Drive.
"""

import os
import io
import json
import base64

import httpx
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials as OAuthCredentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

SCOPES_OAUTH = ["https://www.googleapis.com/auth/drive.file"]
SCOPES_SERVICE_ACCOUNT = ["https://www.googleapis.com/auth/drive"]


def _get_credentials():
    refresh_token = os.environ.get("GOOGLE_OAUTH_REFRESH_TOKEN")
    if refresh_token:
        return OAuthCredentials(
            token=None,
            refresh_token=refresh_token,
            client_id=os.environ["GOOGLE_OAUTH_CLIENT_ID"],
            client_secret=os.environ["GOOGLE_OAUTH_CLIENT_SECRET"],
            token_uri="https://oauth2.googleapis.com/token",
            scopes=SCOPES_OAUTH,
        )

    b64 = os.environ["GOOGLE_SERVICE_ACCOUNT_B64"]
    info = json.loads(base64.b64decode(b64))
    return service_account.Credentials.from_service_account_info(
        info, scopes=SCOPES_SERVICE_ACCOUNT
    )


def get_drive_service():
    creds = _get_credentials()
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def get_access_token() -> str:
    """
    Devolve um token de acesso (OAuth) de curta duração (~1h), usado só
    pra autorizar o navegador a subir o arquivo DIRETO pro Google Drive,
    sem passar pela função do Vercel (que tem limite de ~4.5MB por
    requisição). Nunca expõe a chave/segredo em si, só esse token
    temporário — se vazar, expira sozinho em pouco tempo.
    """
    creds = _get_credentials()
    creds.refresh(GoogleAuthRequest())
    return creds.token


def iniciar_upload_resumavel(folder_id: str, filename: str, mime_type: str) -> str:
    """
    Abre uma sessão de upload resumível direto na API do Google Drive e
    devolve a URL dessa sessão (upload_url). Quem sobe os bytes de fato,
    em pedaços, é o nosso próprio backend (via enviar_pedaco_resumavel) —
    o navegador nunca fala direto com o Google, então CORS não é problema.
    """
    token = get_access_token()
    resp = httpx.post(
        "https://www.googleapis.com/upload/drive/v3/files"
        "?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": mime_type,
        },
        json={"name": filename, "parents": [folder_id]},
        timeout=30,
    )
    resp.raise_for_status()
    upload_url = resp.headers.get("Location")
    if not upload_url:
        raise RuntimeError("O Google não devolveu a URL de upload (header Location ausente).")
    return upload_url


def enviar_pedaco_resumavel(upload_url: str, pedaco: bytes, content_range: str) -> httpx.Response:
    """
    Repassa UM pedaço do arquivo pra sessão de upload resumível do Drive.
    content_range no formato "bytes 0-4194303/19000000" (o total no final
    é obrigatório só no ÚLTIMO pedaço — nos intermediários, use "*" no
    lugar do total se ainda não souber, mas aqui sempre sabemos o total).
    Devolve a resposta crua do Google: 308 = continue enviando os
    próximos pedaços; 200/201 = terminou, corpo tem {id, webViewLink}.
    """
    token = get_access_token()
    return httpx.put(
        upload_url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Range": content_range,
        },
        content=pedaco,
        timeout=60,
    )


def get_or_create_subfolder(service, parent_folder_id: str, name: str) -> str:
    """Procura uma subpasta pelo nome dentro de parent_folder_id; cria se não existir."""
    safe_name = name.replace("\\", "\\\\").replace("'", "\\'")
    query = (
        f"'{parent_folder_id}' in parents and name = '{safe_name}' "
        "and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    )
    results = (
        service.files()
        .list(
            q=query,
            fields="files(id, name)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        )
        .execute()
    )
    files = results.get("files", [])
    if files:
        return files[0]["id"]

    metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_folder_id],
    }
    folder = (
        service.files()
        .create(body=metadata, fields="id", supportsAllDrives=True)
        .execute()
    )
    return folder["id"]


def upload_file(
    service,
    municipio_folder_id: str,
    tipo_documento: str,
    filename: str,
    file_bytes: bytes,
    mime_type: str,
):
    """
    Sobe um arquivo para: <pasta do município>/<tipo do documento>/<filename>
    Retorna (file_id, web_view_link).
    """
    tipo_folder_id = get_or_create_subfolder(service, municipio_folder_id, tipo_documento)

    media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime_type, resumable=True)
    metadata = {"name": filename, "parents": [tipo_folder_id]}

    created = (
        service.files()
        .create(
            body=metadata,
            media_body=media,
            fields="id, webViewLink",
            supportsAllDrives=True,
        )
        .execute()
    )

    # Deixa o arquivo visível para quem tem o link (ajuste conforme sua política de acesso).
    # Se o administrador do Workspace bloquear links públicos, este passo falha:
    # nesse caso o upload continua valendo, só o compartilhamento não é aplicado.
    try:
        service.permissions().create(
            fileId=created["id"],
            body={"role": "reader", "type": "anyone"},
            supportsAllDrives=True,
        ).execute()
    except Exception as e:
        print(f"[drive_client] Aviso: não consegui liberar o link do arquivo: {e}")

    return created["id"], created.get("webViewLink")


def create_municipio_folder(service, root_folder_id: str, municipio_nome: str) -> str:
    """Cria a pasta raiz de um município novo dentro da pasta raiz geral."""
    return get_or_create_subfolder(service, root_folder_id, municipio_nome)
