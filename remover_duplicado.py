# Remove o login duplicado "Geovana Costa" (id b600d4ef-65b0-4a48-a589-0692d9168c87),
# que ficou órfão (não está mais vinculado em municipios_extra, mas ainda existe
# como usuário de login com role='municipio' apontando pra Caucaia).
#
# Isso deleta o usuário do Supabase Auth; como perfis.id referencia
# auth.users com "on delete cascade", o perfil correspondente some junto.
#
# Rode: python remover_duplicado.py

from dotenv import load_dotenv
load_dotenv()
from lib.supabase_client import get_client

USER_ID = "b600d4ef-65b0-4a48-a589-0692d9168c87"

db = get_client()

# Confirma antes de apagar
perfil = db.table("perfis").select("*").eq("id", USER_ID).execute().data
print("Perfil encontrado:", perfil)

if perfil:
    db.auth.admin.delete_user(USER_ID)
    print("Usuário duplicado removido com sucesso.")
else:
    print("Não achei esse id — já foi removido antes, ou o id mudou. Não fiz nada.")
