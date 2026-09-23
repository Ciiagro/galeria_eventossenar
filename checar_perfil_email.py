from dotenv import load_dotenv
load_dotenv()
from lib.supabase_client import get_client

db = get_client()

EMAIL = "geovana@senarce.org.br"

usuarios = db.auth.admin.list_users()
alvo = next((u for u in usuarios if u.email == EMAIL), None)

if not alvo:
    print(f"Não achei nenhum usuário de login com o e-mail {EMAIL}.")
else:
    print(f"Usuário encontrado: id={alvo.id}, email={alvo.email}")
    perfil = db.table("perfis").select("*").eq("id", alvo.id).execute().data
    print("Perfil (perfis):", perfil)
