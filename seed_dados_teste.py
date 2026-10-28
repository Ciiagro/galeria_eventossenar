"""
Dados de TESTE para o PainelDivulgacaoTrabalhos — cria tudo de uma vez, sem digitar.

Como usar (na pasta do projeto, com o ambiente do sistema ligado):
    python seed_dados_teste.py            -> cria os dados de teste
    python seed_dados_teste.py --limpar   -> apaga SÓ o que este script criou
    python seed_dados_teste.py --termos        -> simula o termo de adesão ASSINADO (PDF montado na hora) das adesões de teste enviadas/aprovadas
    python seed_dados_teste.py --compromissos -> dá o termo de compromisso assinado (com as escolas) a todos os de teste

O que ele cria:
  - a edição ativa (se ainda não existir nenhuma) e as escolas municipais dos municípios usados, já no programa;
  - 5 coordenadores de teste (e-mail teste.N@example.com, senha Teste@12345), cada um numa situação:
      1 aguardando (só cadastro)        2 ficha em rascunho        3 adesão enviada (para aprovar)
      4 adesão aprovada + compromisso   5 aprovada, mas com acesso DESATIVADO
  Nada é enviado por e-mail e nada vai para o Google Drive.
Tudo que é de teste tem o e-mail @example.com. Os dados reais e o administrador não são tocados.
"""

import random
import sys
from datetime import date, datetime, timedelta, timezone

from dotenv import load_dotenv

load_dotenv()
from lib.supabase_client import get_client  # noqa: E402

DOMINIO = "@example.com"
SENHA = "Teste@12345"
db = get_client()
agora = datetime.now(timezone.utc).isoformat()


def cpf_valido(base9: str) -> str:
    d = [int(c) for c in base9]
    for n in (9, 10):
        s = sum(d[i] * (n + 1 - i) for i in range(n))
        d.append((s * 10) % 11 % 10)
    return "".join(map(str, d))


def usuarios_de_teste():
    achados, pagina = [], 1
    while True:
        lote = db.auth.admin.list_users(page=pagina, per_page=200)
        if not lote:
            break
        achados += [u for u in lote if (u.email or "").lower().endswith(DOMINIO) and (u.email or "").lower().startswith("teste.")]
        if len(lote) < 200:
            break
        pagina += 1
    return achados


def limpar():
    usuarios = usuarios_de_teste()
    ids = [u.id for u in usuarios]
    print(f"Apagando {len(ids)} coordenador(es) de teste...")
    for uid in ids:
        db.table("municipios_extra").update({"responsavel_id": None, "responsavel_nome": None, "responsavel_email": None}).eq("responsavel_id", uid).execute()
        for tabela, col in (("compromissos", "coordenador_id"), ("adesoes", "coordenador_id"), ("coordenadores_cadastro", "user_id"), ("perfis", "id")):
            try:
                db.table(tabela).delete().eq(col, uid).execute()
            except Exception as e:  # noqa: BLE001
                print(f"  (aviso) {tabela}: {e}")
        db.auth.admin.delete_user(uid)
    print("Pronto. Os dados reais não foram mexidos.")


def ciclo_ativo():
    c = db.table("ciclos").select("id, nome").eq("ativo", True).limit(1).execute().data or []
    if c:
        print(f"Edição ativa já existe: {c[0]['nome']}")
        return c[0]
    novo = db.table("ciclos").insert({
        "nome": str(date.today().year), "data_inicio": f"{date.today().year}-01-01", "data_fim": f"{date.today().year}-12-31", "ativo": True,
    }).execute().data[0]
    print(f"Criei a edição ativa: {novo['nome']}")
    return novo


def escolher_municipios(qtd):
    # municípios com pelo menos 3 escolas municipais e sem coordenador
    escolas = db.table("escolas").select("id, municipio_id, nome").eq("tipo", "Municipal").execute().data or []
    por_mun = {}
    for e in escolas:
        por_mun.setdefault(e["municipio_id"], []).append(e)
    ocupados = {r["municipio_id"] for r in (db.table("municipios_extra").select("municipio_id, responsavel_id").execute().data or []) if r.get("responsavel_id")}
    com_cadastro = {r["municipio_id"] for r in (db.table("coordenadores_cadastro").select("municipio_id").execute().data or []) if r.get("municipio_id")}
    livres = [m for m, lst in sorted(por_mun.items()) if len(lst) >= 3 and m not in ocupados and m not in com_cadastro]
    if len(livres) < qtd:
        print(f"Só achei {len(livres)} município(s) livre(s) com 3+ escolas; vou usar esses.")
    escolhidos = livres[:qtd]
    return escolhidos, por_mun


def nome_municipio(mid):
    r = db.table("municipios").select("nome").eq("id", mid).limit(1).execute().data or [{}]
    return r[0].get("nome") or str(mid)


def criar():
    random.seed(7)
    ciclo = ciclo_ativo()
    existentes = usuarios_de_teste()
    if existentes:
        print(f"Já existem {len(existentes)} coordenador(es) de teste. Rode primeiro:  python seed_dados_teste.py --limpar")
        return
    municipios, por_mun = escolher_municipios(5)
    if not municipios:
        print("Não achei município livre com escolas municipais. Nada criado.")
        return

    # escolas dos municípios usados entram no programa (é o que o administrador faz em "Escolas do programa")
    linhas = [{"escola_id": e["id"], "ciclo_id": ciclo["id"]} for m in municipios for e in por_mun[m][:12]]
    for i in range(0, len(linhas), 100):
        db.table("escolas_ciclos").upsert(linhas[i:i + 100], on_conflict="escola_id,ciclo_id", ignore_duplicates=True).execute()
    print(f"{len(linhas)} escola(s) marcadas no programa.")

    situacoes = ["aguardando", "rascunho", "enviada", "aprovada", "desativada"]
    primeiros = ["Maria", "José", "Ana", "Carlos", "Fernanda", "Paulo", "Luciana", "Rafael", "Juliana", "Marcos"]
    sobrenomes = ["Silva", "Oliveira", "Santos", "Pereira", "Lima", "Costa", "Almeida", "Ribeiro", "Moura", "Cavalcante"]
    resumo = []
    for n, (mid, sit) in enumerate(zip(municipios, situacoes), start=1):
        mun = nome_municipio(mid)
        nome = f"Teste {sit.capitalize()} {random.choice(sobrenomes)}"
        email = f"teste.{n}{DOMINIO}"
        cpf = cpf_valido(f"9000000{n:02d}")
        u = db.auth.admin.create_user({"email": email, "password": SENHA, "email_confirm": True, "user_metadata": {"nome": nome}}).user
        db.table("perfis").upsert({"id": u.id, "nome": nome, "role": "municipio", "municipio_id": None}, on_conflict="id").execute()
        db.table("coordenadores_cadastro").upsert({
            "user_id": u.id, "nome": nome, "cpf": cpf, "rg": f"20{n}0000{n}", "telefone1": f"(85) 9{random.randint(8000,9999)}-{random.randint(1000,9999)}",
            "telefone2": "", "email": email, "municipio_id": mid}, on_conflict="user_id").execute()

        adesao_id = None
        if sit != "aguardando":
            qtd_escolas = 2 if sit == "rascunho" else 3
            esc = por_mun[mid][:qtd_escolas]
            status = {"rascunho": "rascunho", "enviada": "enviada"}.get(sit, "aprovada")
            adesao = db.table("adesoes").insert({
                "ciclo_id": ciclo["id"], "coordenador_id": u.id, "municipio_id": mid, "status": status,
                "prefeito_nome": f"{random.choice(primeiros)} {random.choice(sobrenomes)}", "prefeito_rg": f"99{n}00{n}", "prefeito_cpf": cpf_valido(f"8000000{n:02d}"),
                "prefeitura_endereco": f"Rua Principal, {100 + n}, Centro", "prefeitura_cep": "63000-000", "prefeitura_telefone": "(88) 3500-0000", "prefeitura_email": f"prefeitura.{n}{DOMINIO}",
                "secretario_nome": f"{random.choice(primeiros)} {random.choice(sobrenomes)}", "secretario_cpf": cpf_valido(f"7000000{n:02d}"),
                "secretaria_endereco": f"Rua da Educação, {200 + n}", "secretaria_telefone": "(88) 3500-1111", "secretaria_email": f"educacao.{n}{DOMINIO}",
                "responsavel_preenchimento": nome,
                "total_escolas_informado": len(esc), "total_professores_informado": 0,
                "enviada_em": agora if status in ("enviada", "aprovada") else None,
                "aprovada_em": agora if status == "aprovada" else None,
            }).execute().data[0]
            adesao_id = adesao["id"]
            total_prof = 0
            itens = []
            for e in esc:
                prof = random.randint(4, 14)
                total_prof += prof
                itens.append({"adesao_id": adesao_id, "escola_id": e["id"], "quantidade_professores": prof,
                              "matricula_infantil_3": random.randint(8, 30), "matricula_infantil_4": random.randint(8, 30), "matricula_infantil_5": random.randint(8, 30)})
            db.table("adesao_escolas").insert(itens).execute()
            db.table("adesoes").update({"total_professores_informado": total_prof}).eq("id", adesao_id).execute()

            if status == "aprovada":
                db.table("perfis").update({"municipio_id": mid}).eq("id", u.id).execute()
                db.table("municipios_extra").upsert({"municipio_id": mid, "responsavel_id": u.id, "responsavel_nome": nome, "responsavel_email": email}, on_conflict="municipio_id").execute()
                # termo de compromisso já assinado (o PDF é gerado na hora, não vai para o Drive)
                try:
                    from lib.termo_compromisso import hash_texto, montar_texto
                    texto = montar_texto({"nome": nome, "cpf": cpf, "email": email, "municipio_nome": mun, "ciclo_nome": ciclo["nome"], "escolas": sorted(e["nome"] for e in esc)})
                    db.table("compromissos").upsert({
                        "ciclo_id": ciclo["id"], "coordenador_id": u.id, "municipio_id": mid, "nome": nome, "cpf": cpf, "email": email,
                        "texto_hash": hash_texto(texto), "snapshot": texto, "assinado_em": agora, "ip": "127.0.0.1", "user_agent": "dados de teste",
                    }, on_conflict="ciclo_id,coordenador_id").execute()
                except Exception as e:  # noqa: BLE001
                    print(f"  (aviso) compromisso não criado: {e}")
            if sit == "desativada":
                try:
                    db.table("perfis").update({"ativo": False}).eq("id", u.id).execute()
                    db.auth.admin.update_user_by_id(u.id, {"ban_duration": "876000h"})
                except Exception as e:  # noqa: BLE001
                    print(f"  (aviso) não consegui desativar (rodou a migration_termo_compromisso.sql?): {e}")
        resumo.append((email, nome, mun, sit))

    print("\nCOORDENADORES DE TESTE (senha de todos: " + SENHA + ")")
    for email, nome, mun, sit in resumo:
        print(f"  {email:24}  {mun:18}  {sit}")
    print("\nPronto! Abra o sistema como administrador e veja Coordenadores e Termo de Adesão.")
    print("Para apagar tudo isso depois:  python seed_dados_teste.py --limpar")


def assinar_compromissos():
    """Cria o termo de compromisso ASSINADO (com as escolas) para os 5 coordenadores de teste que ainda não têm."""
    from lib.termo_compromisso import hash_texto, montar_texto
    ciclo = ciclo_ativo()
    feitos = 0
    for u in usuarios_de_teste():
        if db.table("compromissos").select("coordenador_id").eq("ciclo_id", ciclo["id"]).eq("coordenador_id", u.id).limit(1).execute().data:
            continue
        cad = (db.table("coordenadores_cadastro").select("nome, cpf, email, municipio_id").eq("user_id", u.id).limit(1).execute().data or [{}])[0]
        mun = nome_municipio(cad.get("municipio_id")) if cad.get("municipio_id") else ""
        escolas = []
        ades = db.table("adesoes").select("id").eq("ciclo_id", ciclo["id"]).eq("coordenador_id", u.id).limit(1).execute().data or []
        if ades:
            ids = [i["escola_id"] for i in (db.table("adesao_escolas").select("escola_id").eq("adesao_id", ades[0]["id"]).execute().data or [])]
            if ids:
                escolas = sorted(e["nome"] for e in (db.table("escolas").select("nome").in_("id", ids).execute().data or []))
        texto = montar_texto({"nome": cad.get("nome"), "cpf": cad.get("cpf"), "email": cad.get("email"), "municipio_nome": mun, "ciclo_nome": ciclo["nome"], "escolas": escolas})
        db.table("compromissos").upsert({
            "ciclo_id": ciclo["id"], "coordenador_id": u.id, "municipio_id": cad.get("municipio_id"), "nome": cad.get("nome"), "cpf": cad.get("cpf"), "email": cad.get("email"),
            "texto_hash": hash_texto(texto), "snapshot": texto, "assinado_em": agora, "ip": "127.0.0.1", "user_agent": "dados de teste",
        }, on_conflict="ciclo_id,coordenador_id").execute()
        feitos += 1
    print(f"Termo de compromisso assinado criado para {feitos} coordenador(es) de teste.")


def simular_termos_adesao():
    """Simula o termo de adesão ASSINADO (só o coordenador assina pelo sistema, como no real: o resto assina fora)
    para as adesões de teste já enviadas ou aprovadas. O PDF é montado na hora; nada vai para o Google Drive."""
    import hashlib
    import uuid
    import app as sistema  # usa as mesmas funções do sistema (montagem do termo e impressão digital)

    ciclo = ciclo_ativo()
    feitos = 0
    for u in usuarios_de_teste():
        ades = db.table("adesoes").select("*").eq("ciclo_id", ciclo["id"]).eq("coordenador_id", u.id).limit(1).execute().data or []
        if not ades or ades[0]["status"] not in ("enviada", "aprovada") or ades[0].get("termo_assinado_drive_id"):
            continue
        adesao = ades[0]
        itens = db.table("adesao_escolas").select("*").eq("adesao_id", adesao["id"]).execute().data or []
        hash_termo = sistema._hash_conteudo_adesao(adesao, adesao.get("municipio_id"), itens)
        snapshot = sistema._snapshot_termo(db, adesao)
        pedido = db.table("assinatura_pedidos").insert({
            "adesao_id": adesao["id"], "hash_termo": hash_termo, "snapshot": snapshot, "status": "concluido", "concluido_em": agora,
        }).execute().data[0]
        cad = (db.table("coordenadores_cadastro").select("nome, cpf, email").eq("user_id", u.id).limit(1).execute().data or [{}])[0]
        db.table("assinatura_signatarios").insert({
            "pedido_id": pedido["id"], "papel": "coordenador", "nome": cad.get("nome"), "email": cad.get("email"), "cpf": cad.get("cpf"),
            "token_hash": hashlib.sha256(uuid.uuid4().hex.encode()).hexdigest(), "convite_enviado_em": agora, "assinado_em": agora,
            "assinado_nome_digitado": cad.get("nome"), "ip": "127.0.0.1", "user_agent": "dados de teste",
        }).execute()
        nome_arq = f"Termo de Adesão assinado - {snapshot.get('municipio_nome') or ''} (teste).pdf"
        db.table("assinatura_pedidos").update({"pdf_drive_id": f"teste:{pedido['id']}"}).eq("id", pedido["id"]).execute()
        db.table("adesoes").update({
            "termo_assinado_drive_id": f"teste:{pedido['id']}", "termo_assinado_nome": nome_arq,
            "termo_assinado_em": agora, "termo_assinado_hash": hash_termo,
        }).eq("id", adesao["id"]).execute()
        feitos += 1
    print(f"Termo de adesão assinado (simulado) criado para {feitos} adesão(ões) de teste.")


if __name__ == "__main__":
    if "--limpar" in sys.argv:
        limpar()
    elif "--compromissos" in sys.argv:
        assinar_compromissos()
    elif "--termos" in sys.argv:
        simular_termos_adesao()
    else:
        criar()
