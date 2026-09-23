"""
Cliente Supabase compartilhado pelas funções serverless.

Usa a SERVICE_ROLE_KEY porque as funções rodam no backend (Vercel),
não no navegador do usuário. A validação de quem pode ver/editar o quê
já é garantida pela RLS quando você repassar o JWT do usuário (ver
`supabase_as_user`), ou por checagens manuais de role no próprio código
quando usar a service role (acesso total).
"""

import os
from supabase import create_client, Client, ClientOptions

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Este sistema vive isolado num schema próprio (não o "public"),
# pra não colidir com outros projetos/tabelas na mesma organização/projeto Supabase.
# IMPORTANTE: esse schema precisa estar marcado em
# Dashboard > Project Settings > API > "Exposed schemas", senão o PostgREST
# recusa as requisições com erro de schema não encontrado.
DB_SCHEMA = os.environ.get("SUPABASE_SCHEMA", "trab_divulgados")


def get_client() -> Client:
    """Client com privilégio total (ignora RLS). Use só depois de checar a role manualmente."""
    return create_client(
        SUPABASE_URL, SUPABASE_SERVICE_KEY, options=ClientOptions(schema=DB_SCHEMA)
    )


def get_client_as_user(jwt: str) -> Client:
    """
    Client que respeita a RLS como se fosse o próprio usuário logado.
    Passe o JWT que vem do header Authorization da requisição do frontend.
    """
    client = create_client(
        SUPABASE_URL, SUPABASE_SERVICE_KEY, options=ClientOptions(schema=DB_SCHEMA)
    )
    client.postgrest.auth(jwt)
    return client


def get_user_from_jwt(jwt: str):
    """Retorna os dados do usuário autenticado a partir do JWT, ou None se inválido."""
    client = get_client()
    try:
        resp = client.auth.get_user(jwt)
        return resp.user
    except Exception:
        return None
