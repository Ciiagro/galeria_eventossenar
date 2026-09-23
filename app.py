"""
Backend Flask — FAEC SENAR CE, Documentação Municipal.

Rodar local:
    pip install -r requirements.txt
    python app.py

Sobe em http://localhost:5000 por padrão.
Todas as rotas exigem o header: Authorization: Bearer <jwt do usuário logado>
(o mesmo JWT que o Supabase Auth devolve no login do frontend).
"""

import os
import time
import json
from datetime import datetime, timezone

from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, Response
from flask_cors import CORS

load_dotenv()

from lib.supabase_client import get_client, get_client_as_user, get_user_from_jwt
from lib.drive_client import get_drive_service, upload_file, create_municipio_folder, get_or_create_subfolder, iniciar_upload_resumavel, enviar_pedaco_resumavel, liberar_link_publico, baixar_miniatura
from lib.video_compress import comprimir_video_se_necessario

app = Flask(__name__)
CORS(app)  # em produção, restrinja origins conforme necessário


@app.get("/")
def index():
    return render_template("index.html")

# ------------------------------------------------------------
# MODO DEV: pula a exigência de login enquanto você ainda não
# configurou usuários no Supabase Auth. NÃO deixe True em produção —
# nesse modo, qualquer um que acesse a API consegue ler/escrever tudo,
# porque as consultas passam a usar a service key (ignora RLS).
# Ligar/desligar no .env: DEV_SKIP_AUTH=true
# ------------------------------------------------------------
DEV_SKIP_AUTH = os.environ.get("DEV_SKIP_AUTH", "false").lower() == "true"

# Cache simples em memória pra /api/municipios (evita bater no Supabase
# de novo a cada F5 — município não muda com frequência).
# Chaveado por jwt pra não vazar dados entre usuários diferentes; some
# sozinho depois de MUNICIPIOS_CACHE_TTL segundos, ou some se você
# reiniciar o servidor (python app.py de novo).
_municipios_cache: dict[str, tuple[float, list]] = {}
MUNICIPIOS_CACHE_TTL = 300  # 5 minutos


def get_jwt():
    auth_header = request.headers.get("Authorization", "")
    return auth_header.replace("Bearer ", "").strip()


# Cache curto do login/perfil: evita ir ao Supabase Auth em toda requisição
# (o painel faz várias chamadas seguidas ao abrir).
_CACHE_USUARIO = {}   # jwt -> (user, expira_em)
_CACHE_ADMIN = {}     # user_id -> (é_admin, expira_em)
_CACHE_SEGUNDOS = 120


def require_user():
    """
    Retorna (user, jwt) se autenticado.
    Em DEV_SKIP_AUTH, retorna um "usuário" fake sem exigir login —
    user.id fica None (o campo responsavel_envio_id/validado_por aceita nulo).
    """
    if DEV_SKIP_AUTH:
        class DevUser:
            id = None
        return DevUser(), None

    jwt = get_jwt()
    if not jwt:
        return None
    agora = time.time()
    em_cache = _CACHE_USUARIO.get(jwt)
    if em_cache and em_cache[1] > agora:
        return em_cache[0], jwt
    user = get_user_from_jwt(jwt)
    if not user:
        return None
    if len(_CACHE_USUARIO) > 500:
        _CACHE_USUARIO.clear()
    _CACHE_USUARIO[jwt] = (user, agora + _CACHE_SEGUNDOS)
    return user, jwt


def fetch_all(build_query, page_size=1000):
    """Busca TODAS as linhas, paginando de 1000 em 1000.

    O Supabase (PostgREST) devolve no máximo 1000 linhas por requisição,
    então um .execute() simples corta o resultado silenciosamente.
    `build_query` deve ser uma função que devolve uma query NOVA a cada chamada
    (com .order() estável, ex.: por "id"), para a paginação não pular linhas.
    """
    rows, start = [], 0
    while True:
        page = build_query().range(start, start + page_size - 1).execute().data or []
        rows.extend(page)
        if len(page) < page_size:
            return rows
        start += page_size


def get_db(jwt):
    """Cliente pro banco: respeita RLS com o JWT do usuário, ou service key (sem RLS) em modo dev."""
    return get_client_as_user(jwt) if jwt else get_client()


def require_admin(jwt, user):
    """True se o usuário logado tem role = admin. Em modo dev, sempre True."""
    if DEV_SKIP_AUTH:
        return True
    agora = time.time()
    em_cache = _CACHE_ADMIN.get(user.id)
    if em_cache and em_cache[1] > agora:
        return em_cache[0]
    admin_db = get_client()
    perfil = admin_db.table("perfis").select("role").eq("id", user.id).single().execute().data
    eh_admin = bool(perfil and perfil.get("role") == "admin")
    _CACHE_ADMIN[user.id] = (eh_admin, agora + _CACHE_SEGUNDOS)
    return eh_admin


def garantir_pasta_municipio(db, municipio_id, service=None):
    """
    Devolve o ID da pasta do município no Google Drive.
    Se o município ainda não tem pasta, cria "<DRIVE_ROOT_FOLDER_ID>/<nome do município>"
    e grava o ID em municipios_extra.drive_folder_id. Se já existir uma pasta com
    esse nome, ela é reaproveitada (não duplica).
    """
    linhas = (
        db.table("municipios")
        .select("id, nome, drive_folder_id")
        .eq("id", municipio_id)
        .limit(1)
        .execute()
        .data
    )
    if not linhas:
        raise LookupError("Município não encontrado.")
    municipio = linhas[0]

    if municipio.get("drive_folder_id"):
        return municipio["drive_folder_id"]

    raiz = os.environ.get("DRIVE_ROOT_FOLDER_ID")
    if not raiz:
        raise RuntimeError("DRIVE_ROOT_FOLDER_ID não está configurado no .env.")

    service = service or get_drive_service()
    pasta_id = create_municipio_folder(service, raiz, municipio["nome"])

    db.table("municipios_extra").upsert(
        {"municipio_id": municipio["id"], "drive_folder_id": pasta_id},
        on_conflict="municipio_id",
    ).execute()
    _municipios_cache.clear()
    return pasta_id


@app.get("/api/perfil")
def obter_perfil():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth

    if DEV_SKIP_AUTH:
        return jsonify({"role": "admin", "municipio_id": None, "nome": "Dev", "email": "dev@local"})

    try:
        db = get_db(jwt)
        perfil = (
            db.table("perfis")
            .select("role, municipio_id, nome")
            .eq("id", user.id)
            .single()
            .execute()
            .data
        )
        resultado = perfil or {"role": None, "municipio_id": None, "nome": None}
        resultado["email"] = user.email
        return jsonify(resultado)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# MUNICÍPIOS
# ------------------------------------------------------------
@app.get("/api/municipios")
def listar_municipios():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth

    cache_key = jwt or "dev"
    cached = _municipios_cache.get(cache_key)
    if cached and (time.time() - cached[0]) < MUNICIPIOS_CACHE_TTL:
        return jsonify(cached[1])

    try:
        db = get_db(jwt)

        query = db.table("municipios").select("*")
        # Responsável de município só pode ver/escolher o próprio município.
        # Admin (ou modo DEV_SKIP_AUTH) continua vendo todos.
        if not DEV_SKIP_AUTH:
            perfil = (
                get_client()
                .table("perfis")
                .select("role, municipio_id")
                .eq("id", user.id)
                .single()
                .execute()
                .data
            )
            if perfil and perfil.get("role") == "municipio":
                query = query.eq("id", perfil.get("municipio_id"))
        municipios = query.execute().data

        # Uma única consulta trazendo status de TODOS os documentos, em vez de
        # uma consulta por município.
        todos_docs = db.table("documentos").select("municipio_id, status").execute().data

        contagem = {}
        for d in todos_docs:
            c = contagem.setdefault(d["municipio_id"], {"total": 0, "aprovados": 0, "pendentes": 0})
            c["total"] += 1
            if d["status"] == "aprovado":
                c["aprovados"] += 1
            elif d["status"] == "pendente":
                c["pendentes"] += 1

        for m in municipios:
            c = contagem.get(m["id"], {"total": 0, "aprovados": 0, "pendentes": 0})
            m["total_documentos"] = c["total"]
            m["aprovados"] = c["aprovados"]
            m["pendentes"] = c["pendentes"]
            m["progresso_pct"] = round((c["aprovados"] / c["total"]) * 100) if c["total"] else 0

        _municipios_cache[cache_key] = (time.time(), municipios)
        return jsonify(municipios)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.get("/api/resumo")
def resumo_dashboard():
    """Resumo agregado usado no painel principal do administrador.

    Filtros opcionais (query string):
      projeto_id = uuid do programa, ou "sem" para documentos sem programa
      ano        = ano da data de realização (ex.: 2026)
      mes        = mês da data de realização (1-12, só vale junto com ano)
    """
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem consultar o resumo."}), 403

    projeto_id = request.args.get("projeto_id") or None
    ano = request.args.get("ano", type=int)
    mes = request.args.get("mes", type=int) if ano else None

    try:
        # Caminho rápido: tudo agregado dentro do banco numa única chamada
        # (função sql/painel_resumo.sql). Só é chamado depois de confirmar admin.
        try:
            dados = get_client().rpc("painel_resumo", {
                "p_projeto_id": projeto_id if projeto_id and projeto_id != "sem" else None,
                "p_sem_projeto": projeto_id == "sem",
                "p_ano": ano,
                "p_mes": mes,
            }).execute().data
        except Exception as erro_rpc:
            print(f"[resumo] função painel_resumo indisponível, usando modo lento: {erro_rpc}")
            dados = _resumo_lento(projeto_id, ano, mes)

        return jsonify(_montar_resumo(dados))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _montar_resumo(dados):
    """Completa indicadores e rankings a partir do que veio agregado."""
    municipios = dados.get("municipios") or []
    escolas = dados.get("escolas_participantes_lista") or []
    total = sum(m["total_documentos"] for m in municipios)
    aprovados = sum(m["aprovados"] for m in municipios)
    return {
        "indicadores": {
            "municipios_total": len(municipios),
            "municipios_participantes": sum(1 for m in municipios if m["total_documentos"] > 0),
            "escolas_total": sum(m["escolas_total"] for m in municipios),
            "escolas_participantes": len(escolas),
            "documentos_total": total,
            "documentos_aprovados": aprovados,
            "documentos_pendentes": sum(m["pendentes"] for m in municipios),
            "documentos_rejeitados": sum(m["rejeitados"] for m in municipios),
            "progresso_aprovacao": round((aprovados / total) * 100) if total else 0,
        },
        "municipios": municipios,
        "ranking_municipios": sorted(
            municipios, key=lambda m: (m["total_documentos"], m["aprovados"]), reverse=True
        )[:8],
        "ranking_tipos": dados.get("ranking_tipos") or [],
        "tipos_por_municipio": dados.get("tipos_por_municipio") or {},
        "escolas_participantes_lista": escolas,
        "anos_disponiveis": dados.get("anos_disponiveis") or [],
    }


def _resumo_lento(projeto_id, ano, mes):
    """Mesmo resultado da função SQL, calculado em Python (usado só se a função não existir)."""
    db = get_client()
    municipios = db.table("municipios").select("id, nome, periodo").order("nome").execute().data or []

    def query_documentos():
        query = db.table("documentos").select(
            "id, municipio_id, escola_id, status, data_realizacao, tipos_documento(nome), projetos(nome)"
        )
        if projeto_id == "sem":
            query = query.is_("projeto_id", "null")
        elif projeto_id:
            query = query.eq("projeto_id", projeto_id)
        return query.order("id")

    todos_documentos = fetch_all(query_documentos)
    anos_disponiveis = sorted(
        {int(d["data_realizacao"][:4]) for d in todos_documentos if d.get("data_realizacao")}, reverse=True
    )
    documentos = [
        d for d in todos_documentos
        if (not ano or (d.get("data_realizacao") or "")[:4] == str(ano))
        and (not mes or (d.get("data_realizacao") or "")[5:7] == f"{mes:02d}")
    ]
    escolas = fetch_all(
        lambda: db.table("escolas").select("id, municipio_id, nome, latitude, longitude").order("id")
    )

    municipio_map = {
        m["id"]: {**m, "total_documentos": 0, "aprovados": 0, "pendentes": 0, "rejeitados": 0,
                  "escolas_total": 0, "escolas_participantes": 0}
        for m in municipios
    }
    for escola in escolas:
        if escola["municipio_id"] in municipio_map:
            municipio_map[escola["municipio_id"]]["escolas_total"] += 1

    tipos, tipos_por_municipio, docs_por_escola, programas_por_escola = {}, {}, {}, {}
    for d in documentos:
        municipio = municipio_map.get(d["municipio_id"])
        if municipio:
            municipio["total_documentos"] += 1
            if d.get("status") in ("aprovado", "pendente", "rejeitado"):
                municipio[f"{d['status']}s"] += 1
        tipo = (d.get("tipos_documento") or {}).get("nome") or "Outros"
        tipos[tipo] = tipos.get(tipo, 0) + 1
        por_mun = tipos_por_municipio.setdefault(str(d["municipio_id"]), {})
        por_mun[tipo] = por_mun.get(tipo, 0) + 1
        if d.get("escola_id"):
            docs_por_escola[d["escola_id"]] = docs_por_escola.get(d["escola_id"], 0) + 1
            programa = (d.get("projetos") or {}).get("nome") or "Sem programa"
            programas_por_escola.setdefault(d["escola_id"], set()).add(programa)

    escolas_por_id = {e["id"]: e for e in escolas}
    lista = []
    for escola_id, qtd in docs_por_escola.items():
        e = escolas_por_id.get(escola_id)
        if not e:
            continue
        if e["municipio_id"] in municipio_map:
            municipio_map[e["municipio_id"]]["escolas_participantes"] += 1
        lista.append({
            "id": e["id"], "nome": e["nome"], "municipio_id": e["municipio_id"],
            "municipio_nome": (municipio_map.get(e["municipio_id"]) or {}).get("nome"),
            "programas": sorted(programas_por_escola.get(escola_id, set())),
            "latitude": float(e["latitude"]) if e.get("latitude") is not None else None,
            "longitude": float(e["longitude"]) if e.get("longitude") is not None else None,
            "documentos": qtd,
        })

    return {
        "municipios": list(municipio_map.values()),
        "ranking_tipos": sorted(
            [{"nome": n, "total": t} for n, t in tipos.items()], key=lambda x: x["total"], reverse=True
        ),
        "tipos_por_municipio": tipos_por_municipio,
        "escolas_participantes_lista": lista,
        "anos_disponiveis": anos_disponiveis,
    }



@app.post("/api/responsaveis")
def salvar_responsavel():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth

    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem editar responsáveis."}), 403

    body = request.get_json(force=True, silent=True) or {}
    municipio_id = body.get("municipio_id")
    nome = (body.get("responsavel_nome") or "").strip()
    email = (body.get("responsavel_email") or "").strip().lower()
    senha = body.get("senha") or ""
    if not municipio_id:
        return jsonify({"error": "municipio_id é obrigatório."}), 400
    if not nome or not email:
        return jsonify({"error": "Nome e e-mail são obrigatórios."}), 400
    if email and ("@" not in email or email.startswith("@") or email.endswith("@")):
        return jsonify({"error": "Informe um e-mail válido."}), 400
    if senha and len(senha) < 6:
        return jsonify({"error": "A senha deve ter pelo menos 6 caracteres."}), 400

    try:
        db = get_client()
        extra_response = (
            db.table("municipios_extra")
            .select("responsavel_id")
            .eq("municipio_id", municipio_id)
            .limit(1)
            .execute()
        )
        extra_rows = extra_response.data if extra_response else []
        extra = extra_rows[0] if extra_rows else None
        responsavel_id = extra.get("responsavel_id") if extra else None

        if responsavel_id:
            auth_attributes = {"email": email, "user_metadata": {"nome": nome}}
            if senha:
                auth_attributes["password"] = senha
            db.auth.admin.update_user_by_id(responsavel_id, auth_attributes)
        else:
            if len(senha) < 6:
                return jsonify({"error": "Informe uma senha com pelo menos 6 caracteres para o novo usuário."}), 400
            created_user = db.auth.admin.create_user({
                "email": email,
                "password": senha,
                "email_confirm": True,
                "user_metadata": {"nome": nome},
            })
            responsavel_id = created_user.user.id

        db.table("perfis").upsert(
            {"id": responsavel_id, "nome": nome, "role": "municipio", "municipio_id": municipio_id},
            on_conflict="id",
        ).execute()
        saved = (
            db.table("municipios_extra")
            .upsert(
                {
                    "municipio_id": municipio_id,
                    "responsavel_id": responsavel_id,
                    "responsavel_nome": nome,
                    "responsavel_email": email,
                },
                on_conflict="municipio_id",
            )
            .execute()
            .data
        )
        # Cria a pasta do município no Drive (se ainda não existir).
        # Se o Drive falhar, o responsável já foi salvo; a pasta é criada
        # automaticamente no primeiro upload.
        try:
            garantir_pasta_municipio(db, municipio_id)
        except Exception as drive_error:
            print(f"[drive] Não consegui criar a pasta do município {municipio_id}: {drive_error}")

        _municipios_cache.clear()
        return jsonify(saved)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.delete("/api/responsaveis")
def excluir_responsavel():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth

    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem excluir responsáveis."}), 403

    municipio_id = request.args.get("municipio_id")
    if not municipio_id:
        return jsonify({"error": "municipio_id é obrigatório."}), 400

    try:
        db = get_client()
        extra_response = (
            db.table("municipios_extra")
            .select("responsavel_id")
            .eq("municipio_id", municipio_id)
            .limit(1)
            .execute()
        )
        extra_rows = extra_response.data if extra_response else []
        extra = extra_rows[0] if extra_rows else None
        responsavel_id = extra.get("responsavel_id") if extra else None
        db.table("municipios_extra").delete().eq("municipio_id", municipio_id).execute()
        if responsavel_id:
            db.auth.admin.delete_user(responsavel_id)
        _municipios_cache.clear()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# TIPOS DE DOCUMENTO
# ------------------------------------------------------------
@app.get("/api/tipos-documento")
def listar_tipos_documento():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    _, jwt = auth

    try:
        db = get_db(jwt)
        tipos = db.table("tipos_documento").select("*").order("nome").execute().data
        return jsonify(tipos)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# PROJETOS (programa/projeto maior, acima de Ação/Evento)
# ------------------------------------------------------------
@app.get("/api/projetos")
def listar_projetos():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    _, jwt = auth

    try:
        db = get_db(jwt)
        projetos = db.table("projetos").select("*").order("nome").execute().data
        return jsonify(projetos)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/projetos")
def salvar_projeto():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth

    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem editar projetos."}), 403

    body = request.get_json(force=True, silent=True) or {}
    nome = (body.get("nome") or "").strip()
    descricao = (body.get("descricao") or "").strip() or None
    projeto_id = body.get("id")

    if not nome:
        return jsonify({"error": "Nome é obrigatório."}), 400

    try:
        db = get_client()
        payload = {"nome": nome, "descricao": descricao}
        if projeto_id:
            payload["id"] = projeto_id
        saved = db.table("projetos").upsert(payload, on_conflict="id").execute().data
        return jsonify(saved)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.delete("/api/projetos")
def excluir_projeto():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth

    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem excluir projetos."}), 403

    projeto_id = request.args.get("id")
    if not projeto_id:
        return jsonify({"error": "Parâmetro 'id' é obrigatório."}), 400

    try:
        db = get_client()
        deleted = db.table("projetos").delete().eq("id", projeto_id).execute().data
        return jsonify(deleted)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# ESCOLAS
# ------------------------------------------------------------
@app.get("/api/escolas")
def listar_escolas():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    _, jwt = auth

    try:
        db = get_db(jwt)
        municipio_id = request.args.get("municipio_id")

        def build_query():
            query = db.table("escolas").select("*")
            if municipio_id:
                query = query.eq("municipio_id", municipio_id)
            return query.order("nome").order("id")

        escolas = fetch_all(build_query)
        return jsonify(escolas)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/escolas")
def criar_escola():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    _, jwt = auth

    body = request.get_json(force=True, silent=True) or {}
    if not body.get("municipio_id") or not body.get("nome"):
        return jsonify({"error": "municipio_id e nome são obrigatórios."}), 400

    try:
        db = get_db(jwt)
        perfis = db.table("perfis").select("nome").eq("id", user.id).limit(1).execute().data or []
        perfil = perfis[0] if perfis else {}
        responsavel_nome = perfil.get("nome") or (getattr(user, "user_metadata", {}) or {}).get("nome") or user.email
        payload = {
            "municipio_id": body["municipio_id"],
            "nome": body["nome"],
            "tipo": body.get("tipo"),
            "endereco": body.get("endereco"),
            "latitude": body.get("latitude"),
            "longitude": body.get("longitude"),
        }
        created = db.table("escolas").insert(payload).execute().data
        return jsonify(created), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.delete("/api/escolas")
def remover_escola():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    _, jwt = auth

    escola_id = request.args.get("id")
    if not escola_id:
        return jsonify({"error": "Parâmetro 'id' é obrigatório."}), 400

    try:
        db = get_db(jwt)
        deleted = db.table("escolas").delete().eq("id", escola_id).execute().data
        return jsonify(deleted)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# DOCUMENTOS
# ------------------------------------------------------------
@app.get("/api/documentos")
def listar_documentos():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    _, jwt = auth

    try:
        db = get_db(jwt)
        municipio_id = request.args.get("municipio_id")
        status = request.args.get("status")
        tipo_id = request.args.get("tipo_id")

        def montar_query():
            query = db.table("documentos").select("*, tipos_documento(nome), escolas(nome, endereco), projetos(nome)")
            if municipio_id:
                query = query.eq("municipio_id", municipio_id)
            if status:
                query = query.eq("status", status)
            if tipo_id:
                query = query.eq("tipo_id", tipo_id)
            return query.order("created_at", desc=True).order("id")

        docs = fetch_all(montar_query)

        # Nome de quem aprovou/reprovou ("Aprovado por Geovana")
        ids_validadores = list({d["validado_por"] for d in docs if d.get("validado_por")})
        if ids_validadores:
            perfis = (
                get_client().table("perfis").select("id, nome").in_("id", ids_validadores).execute().data or []
            )
            nomes = {p["id"]: p["nome"] for p in perfis}
            for d in docs:
                d["validado_por_nome"] = nomes.get(d.get("validado_por"))
        return jsonify(docs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/documentos")
def criar_documento():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth

    body = request.get_json(force=True, silent=True) or {}

    required = ["municipio_id", "tipo_id", "data_realizacao"]
    missing = [f for f in required if not body.get(f)]
    if missing:
        return jsonify({"error": f"Campos obrigatórios faltando: {missing}"}), 400

    if not (body.get("drive_file_id") or body.get("link_externo")):
        return jsonify({"error": "É necessário um arquivo enviado ou um link externo."}), 400

    if not data_realizacao_valida(body.get("data_realizacao")):
        return jsonify({"error": "Data de realização inválida. Confira o ano (ex.: 2026)."}), 400

    try:
        db = get_db(jwt)
        perfil = db.table("perfis").select("nome").eq("id", user.id).single().execute().data or {}
        responsavel_nome = perfil.get("nome") or (getattr(user, "user_metadata", {}) or {}).get("nome") or user.email
        payload = {
            "municipio_id": body["municipio_id"],
            "tipo_id": body["tipo_id"],
            "finalidade": body.get("finalidade"),
            "acao_evento": body.get("acao_evento"),
            "escola_id": body.get("escola_id"),
            "projeto_id": body.get("projeto_id"),
            "descricao": body.get("descricao"),
            "data_realizacao": body["data_realizacao"],
            "responsavel_envio_id": user.id,
            "responsavel_nome": responsavel_nome,
            "responsavel_email": user.email,
            "drive_file_id": body.get("drive_file_id"),
            "drive_file_link": body.get("drive_file_link"),
            "link_externo": body.get("link_externo"),
            "status": "pendente",
        }
        created = db.table("documentos").insert(payload).execute().data
        _municipios_cache.clear()
        return jsonify(created), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.delete("/api/documentos")
def excluir_documento():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    documento_id = request.args.get("id")
    if not documento_id:
        return jsonify({"error": "id do documento é obrigatório."}), 400

    try:
        # A autoria e o status são conferidos antes; a exclusão usa o cliente
        # de serviço para não depender de uma policy RLS de DELETE.
        db = get_client()
        documento = (
            db.table("documentos")
            .select("id, drive_file_id, status")
            .eq("id", documento_id)
            .eq("responsavel_envio_id", user.id)
            .eq("status", "pendente")
            .limit(1)
            .execute()
            .data
        )
        if not documento:
            return jsonify({"error": "Documento não encontrado ou sem permissão para excluir."}), 404

        drive_file_id = documento[0].get("drive_file_id")
        if drive_file_id:
            try:
                get_drive_service().files().delete(fileId=drive_file_id, supportsAllDrives=True).execute()
            except Exception as drive_error:
                print(f"[drive] Não consegui excluir o arquivo {drive_file_id}: {drive_error}")

        db.table("documentos").delete().eq("id", documento_id).eq("responsavel_envio_id", user.id).execute()
        _municipios_cache.clear()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# VALIDAR (aprovar/rejeitar) — só admin
# ------------------------------------------------------------
@app.post("/api/validar")
def validar_documento():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth

    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem validar documentos."}), 403

    body = request.get_json(force=True, silent=True) or {}
    documento_id = body.get("documento_id")
    novo_status = body.get("status")

    if not documento_id or novo_status not in ("aprovado", "rejeitado"):
        return jsonify({"error": "documento_id e status ('aprovado'|'rejeitado') são obrigatórios."}), 400

    if novo_status == "rejeitado" and not body.get("motivo_rejeicao"):
        return jsonify({"error": "motivo_rejeicao é obrigatório ao rejeitar."}), 400

    campos_galeria, erro_galeria = campos_publicacao_galeria(novo_status, body)
    if erro_galeria:
        return jsonify({"error": erro_galeria}), 400

    try:
        db = get_db(jwt)
        updated = (
            db.table("documentos")
            .update(
                {
                    "status": novo_status,
                    "motivo_rejeicao": body.get("motivo_rejeicao") if novo_status == "rejeitado" else None,
                    "validado_por": user.id,
                    "validado_em": datetime.now(timezone.utc).isoformat(),
                    **campos_galeria,
                }
            )
            .eq("id", documento_id)
            .execute()
            .data
        )
        _municipios_cache.clear()
        if campos_galeria.get("na_galeria"):
            for doc in updated or []:
                if doc.get("drive_file_id"):
                    liberar_link_publico(doc["drive_file_id"])
        return jsonify(updated)
    except Exception as e:
        return jsonify({"error": mensagem_erro_galeria(e)}), 500


def data_realizacao_valida(valor):
    """Aceita só datas AAAA-MM-DD com ano entre 2000 e o ano que vem."""
    try:
        data = datetime.strptime(str(valor)[:10], "%Y-%m-%d")
    except (TypeError, ValueError):
        return False
    return 2000 <= data.year <= datetime.now().year + 1


def campos_publicacao_galeria(novo_status, body):
    """Campos da galeria a gravar junto com a validação.

    Rejeitado -> sai da galeria.
    Aprovado  -> body.na_galeria (true/false); se true, exige descricao_galeria.
    Se o frontend não mandar na_galeria (versão antiga), não mexe na galeria.
    """
    if novo_status == "rejeitado":
        return {"na_galeria": False}, None
    if "na_galeria" not in body:
        return {}, None
    if not body.get("na_galeria"):
        return {"na_galeria": False}, None
    descricao = (body.get("descricao_galeria") or "").strip()
    if not descricao:
        return None, "Escreva a descrição que vai aparecer na galeria."
    return {
        "na_galeria": True,
        "descricao_galeria": descricao[:2000],
        "publicado_galeria_em": datetime.now(timezone.utc).isoformat(),
    }, None


def mensagem_erro_galeria(erro):
    texto = str(erro)
    if "na_galeria" in texto or "descricao_galeria" in texto:
        return "Falta rodar o script sql/migration_galeria_publicacao.sql no Supabase (SQL Editor)."
    return texto


# ------------------------------------------------------------
# UPLOAD (Google Drive)
# ------------------------------------------------------------
_CACHE_MINIATURAS = {}  # file_id -> (bytes, content_type, expira_em)


@app.get("/api/miniatura/<file_id>")
def miniatura(file_id):
    """Miniatura de um arquivo do Drive para os cards (tag <img>).

    Passa pelo nosso servidor porque o link direto do Google só funciona se o
    arquivo estiver público e o navegador aceitar cookies do Google.
    Só serve arquivos que pertencem a algum documento do sistema.
    """
    import re

    if not re.fullmatch(r"[\w-]{10,200}", file_id or ""):
        return jsonify({"error": "id inválido"}), 400

    agora = time.time()
    em_cache = _CACHE_MINIATURAS.get(file_id)
    if em_cache and em_cache[2] > agora:
        conteudo, tipo = em_cache[0], em_cache[1]
    else:
        try:
            existe = (
                get_client().table("documentos").select("id").eq("drive_file_id", file_id).limit(1).execute().data
            )
            if not existe:
                return jsonify({"error": "Arquivo não encontrado."}), 404
            resultado = baixar_miniatura(file_id)
        except Exception as e:
            print(f"[miniatura] {file_id}: {e}")
            resultado = None
        if not resultado:
            # Drive ainda não gerou (ex.: vídeo processando) ou tipo sem miniatura
            return Response(status=404, headers={"Cache-Control": "public, max-age=300"})
        conteudo, tipo = resultado
        if len(_CACHE_MINIATURAS) > 300:
            _CACHE_MINIATURAS.clear()
        _CACHE_MINIATURAS[file_id] = (conteudo, tipo, agora + 3600)

    return Response(conteudo, mimetype=tipo, headers={"Cache-Control": "public, max-age=86400"})


@app.post("/api/upload-iniciar")
def upload_iniciar():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    _, jwt = auth

    body = request.get_json(force=True, silent=True) or {}
    municipio_id = body.get("municipio_id")
    tipo_documento = body.get("tipo_documento")
    filename = body.get("filename")
    mime_type = body.get("mime_type") or "application/octet-stream"

    if not (municipio_id and tipo_documento and filename):
        return jsonify({"error": "municipio_id, tipo_documento e filename são obrigatórios."}), 400

    try:
        db = get_client()
        service = get_drive_service()
        try:
            pasta_municipio = garantir_pasta_municipio(db, municipio_id, service)
        except LookupError as e:
            return jsonify({"error": str(e)}), 404

        pasta_tipo = get_or_create_subfolder(service, pasta_municipio, tipo_documento)
        upload_url = iniciar_upload_resumavel(pasta_tipo, filename, mime_type)
        return jsonify({"upload_url": upload_url})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/upload-pedaco")
def upload_pedaco():
    """
    Recebe UM pedaço (chunk) do arquivo, no corpo cru da requisição, e
    repassa pro Google. Feito assim (em vez do navegador subir o arquivo
    inteiro de uma vez) porque o Vercel tem limite de ~4.5MB por
    requisição — cada pedaço fica bem abaixo disso.

    Headers esperados:
      X-Drive-Upload-Url : a upload_url devolvida por /api/upload-iniciar
      Content-Range       : ex. "bytes 0-4194303/19000000"
    """
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    _, jwt = auth

    upload_url = request.headers.get("X-Drive-Upload-Url")
    content_range = request.headers.get("Content-Range")
    if not upload_url or not content_range:
        return jsonify({"error": "Headers X-Drive-Upload-Url e Content-Range são obrigatórios."}), 400

    pedaco = request.get_data()

    try:
        resposta = enviar_pedaco_resumavel(upload_url, pedaco, content_range)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # 308 = "continue enviando" (resposta do Google sem corpo JSON útil).
    # 200/201 = terminou: repassa o {id, webViewLink} que o Google devolveu.
    if resposta.status_code == 308:
        return jsonify({"concluido": False}), 200

    if resposta.status_code in (200, 201):
        dados = resposta.json()
        if dados.get("id"):
            # igual ao upload pequeno: libera "qualquer pessoa com o link"
            liberar_link_publico(dados["id"])
        return jsonify({"concluido": True, **dados}), 200

    return jsonify({"error": f"Google Drive respondeu {resposta.status_code}: {resposta.text[:300]}"}), 502


@app.post("/api/upload")
def upload_documento():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    _, jwt = auth

    municipio_id = request.form.get("municipio_id")
    tipo_documento = request.form.get("tipo_documento")
    arquivo = request.files.get("file")

    if not (municipio_id and tipo_documento and arquivo):
        return jsonify({"error": "municipio_id, tipo_documento e file são obrigatórios."}), 400

    try:
        db = get_client()
        service = get_drive_service()
        try:
            pasta_id = garantir_pasta_municipio(db, municipio_id, service)
        except LookupError as e:
            return jsonify({"error": str(e)}), 404

        file_bytes = arquivo.read()
        mime_type = arquivo.mimetype or "application/octet-stream"
        filename = arquivo.filename
        file_bytes, mime_type, filename = comprimir_video_se_necessario(file_bytes, mime_type, filename)

        file_id, web_link = upload_file(
            service=service,
            municipio_folder_id=pasta_id,
            tipo_documento=tipo_documento,
            filename=filename,
            file_bytes=file_bytes,
            mime_type=mime_type,
        )
        return jsonify({"drive_file_id": file_id, "drive_file_link": web_link})
    except Exception as e:
        return jsonify({"error": str(e)}), 500



# ------------------------------------------------------------
# GALERIA PÚBLICA (sem login) — só o que o admin aprovou e publicou
# ------------------------------------------------------------
def escolas_participantes_municipio(db, municipio_id):
    """Escolas do município que REALMENTE participaram: têm documento aprovado.

    Devolve uma lista com, para cada escola, os programas de que participou
    e quantas ações (documentos aprovados) teve em cada um.
    """
    docs = (
        db.table("documentos")
        .select("escola_id, projetos(nome)")
        .eq("municipio_id", municipio_id)
        .eq("status", "aprovado")
        .not_.is_("escola_id", "null")
        .limit(5000)
        .execute()
        .data
        or []
    )
    por_escola = {}
    for d in docs:
        programa = (d.get("projetos") or {}).get("nome") or "Sem programa"
        contagem = por_escola.setdefault(d["escola_id"], {})
        contagem[programa] = contagem.get(programa, 0) + 1
    if not por_escola:
        return []

    escolas = (
        db.table("escolas")
        .select("id, nome, latitude, longitude")
        .in_("id", list(por_escola.keys()))
        .execute()
        .data
        or []
    )
    resultado = []
    for e in escolas:
        programas = por_escola.get(e["id"], {})
        resultado.append({
            "id": e["id"],
            "nome": e["nome"],
            "latitude": float(e["latitude"]) if e.get("latitude") is not None else None,
            "longitude": float(e["longitude"]) if e.get("longitude") is not None else None,
            "programas": [
                {"nome": nome, "acoes": qtd}
                for nome, qtd in sorted(programas.items(), key=lambda item: (-item[1], item[0]))
            ],
            "acoes": sum(programas.values()),
        })
    resultado.sort(key=lambda e: (-e["acoes"], e["nome"]))
    return resultado


def _galeria_feed(db, municipio_id):
    """Só o que o administrador aprovou E escolheu publicar na galeria."""
    query = (
        db.table("documentos")
        .select(
            "id, municipio_id, tipo_id, descricao, descricao_galeria, data_realizacao, drive_file_link, "
            "link_externo, visualizacoes, curtidas, tipos_documento(nome), escolas(nome), projetos(nome)"
        )
        .eq("status", "aprovado")
        .eq("na_galeria", True)
    )
    if municipio_id:
        query = query.eq("municipio_id", municipio_id)
    else:
        query = query.limit(60)

    docs = query.order("data_realizacao", desc=True).execute().data or []
    for doc in docs:
        # a galeria mostra o texto revisado pelo admin
        doc["descricao"] = doc.pop("descricao_galeria", None) or doc.get("descricao")
    return docs


def _galeria_ranking(db):
    docs = fetch_all(
        lambda: db.table("documentos")
        .select("id, municipio_id")
        .eq("status", "aprovado")
        .eq("na_galeria", True)
        .order("id")
    )
    contagem = {}
    for d in docs:
        contagem[d["municipio_id"]] = contagem.get(d["municipio_id"], 0) + 1

    municipios = db.table("municipios").select("id, nome").execute().data
    nomes = {m["id"]: m["nome"] for m in municipios}

    ranking = [
        {"municipio_id": mid, "nome": nomes.get(mid, f"Município #{mid}"), "total": total}
        for mid, total in contagem.items()
    ]
    ranking.sort(key=lambda r: r["total"], reverse=True)
    return ranking


@app.get("/api/galeria")
def galeria_documentos():
    if request.args.get("municipios") == "1":
        try:
            db = get_client()
            municipios = db.table("municipios").select("id, nome").order("nome").execute().data
            return jsonify(municipios)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    municipio_id = request.args.get("municipio_id")

    if request.args.get("escolas") == "1":
        if not municipio_id:
            return jsonify({"error": "Parâmetro 'municipio_id' é obrigatório."}), 400
        try:
            return jsonify(escolas_participantes_municipio(get_client(), municipio_id))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    if request.args.get("ranking") == "1":
        try:
            return jsonify(_galeria_ranking(get_client()))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    if not municipio_id:
        try:
            db = get_client()
            return jsonify(_galeria_feed(db, None))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    try:
        db = get_client()
        return jsonify(_galeria_feed(db, municipio_id))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/galeria")
def galeria_acao():
    body = request.get_json(force=True, silent=True) or {}
    acao = body.get("acao")
    documento_id = body.get("documento_id")
    campo = {"curtir": "curtidas", "visualizar": "visualizacoes"}.get(acao)

    if not campo or not documento_id:
        return jsonify({"error": "Envie 'acao' ('curtir' ou 'visualizar') e 'documento_id'."}), 400

    try:
        db = get_client()
        atual = db.table("documentos").select(campo).eq("id", documento_id).single().execute().data
        novo_total = (atual.get(campo) or 0) + 1
        db.table("documentos").update({campo: novo_total}).eq("id", documento_id).execute()
        return jsonify({campo: novo_total})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, port=port)
