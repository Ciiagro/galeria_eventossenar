from dotenv import load_dotenv
load_dotenv()
from lib.supabase_client import get_client

db = get_client()

nomes = [
    "ALUIZIO PEREIRA LIMA EEIEF",
    "EMEIFTI ERALDO AMADOR DA SILVA",
    "FRANCISCO DE ASSIS DIAS EMEI",
]

for nome in nomes:
    rows = db.table("escolas").select("id,nome,municipio_id").ilike("nome", f"%{nome}%").execute().data
    print(f"\nBusca: {nome}")
    for r in rows:
        m = db.table("municipios").select("nome").eq("id", r["municipio_id"]).single().execute().data
        print(f"  -> {r['nome']} | municipio_id={r['municipio_id']} ({m['nome'] if m else '???'})")
    if not rows:
        print("  (nenhuma encontrada)")
