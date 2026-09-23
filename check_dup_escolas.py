from dotenv import load_dotenv
load_dotenv()
from lib.supabase_client import get_client

db = get_client()
escolas = db.table("escolas").select("id, nome, municipio_id").execute().data

from collections import Counter
chaves = Counter((e["municipio_id"], e["nome"].strip().upper()) for e in escolas)
duplicadas = {k: v for k, v in chaves.items() if v > 1}

print(f"Total de linhas em escolas: {len(escolas)}")
print(f"Nomes duplicados (mesmo município + mesmo nome): {len(duplicadas)}")
for (municipio_id, nome), qtd in list(duplicadas.items())[:15]:
    print(f"  municipio_id={municipio_id}  '{nome}'  x{qtd}")
