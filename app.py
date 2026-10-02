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
import re
import time
import threading
import json
import unicodedata
from concurrent.futures import ThreadPoolExecutor
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

# Cache do resumo do painel (admin): a função SQL agrega tudo, mas rodar a cada abertura pesa.
# Some sozinho em RESUMO_CACHE_TTL segundos e é limpo sempre que algo é gravado (veja os
# pontos que chamam _municipios_cache.clear()).
_CACHE_RESUMO: dict[str, tuple[float, dict]] = {}
RESUMO_CACHE_TTL = 60
_CACHE_NOMES_PERFIS: dict[str, tuple[str, float]] = {}  # id -> (nome, expira_em)

# Lista de escolas (são ~10 mil): guardada por 5 min, separada por quem pode ver o quê.
_CACHE_ESCOLAS: dict[str, tuple[float, list]] = {}
ESCOLAS_CACHE_TTL = 300
COLUNAS_ESCOLA = "id, municipio_id, nome, tipo, endereco, latitude, longitude"


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


def _com_tentativas(funcao, tentativas=4):
    """Roda a consulta e tenta de novo se a conexão falhar por um instante.

    No Windows, vários pedidos ao mesmo tempo podem dar "[WinError 10035] Uma operação de
    soquete sem bloqueio não pôde ser concluída imediatamente". É passageiro: esperar um
    pouco e repetir resolve.
    """
    ultimo = None
    for i in range(tentativas):
        try:
            return funcao()
        except Exception as e:  # noqa: BLE001
            texto = str(e)
            passageiro = (
                isinstance(e, OSError)
                or "10035" in texto
                or "non-blocking" in texto.lower()
                or type(e).__module__.split(".")[0] in ("httpx", "httpcore", "h2")
            )
            if not passageiro:
                raise
            ultimo = e
            time.sleep(0.2 * (i + 1))
    raise ultimo


def fetch_all(build_query, page_size=1000):
    """Busca TODAS as linhas, paginando de 1000 em 1000.

    O Supabase (PostgREST) devolve no máximo 1000 linhas por requisição,
    então um .execute() simples corta o resultado silenciosamente.
    `build_query` deve ser uma função que devolve uma query NOVA a cada chamada
    (com .order() estável, ex.: por "id"), para a paginação não pular linhas.
    """
    rows, start = [], 0
    while True:
        page = _com_tentativas(lambda: build_query().range(start, start + page_size - 1).execute()).data or []
        rows.extend(page)
        if len(page) < page_size:
            return rows
        start += page_size


# Limita quantas buscas em paralelo rodam ao mesmo tempo no servidor inteiro
# (várias telas abrindo juntas não podem somar dezenas de conexões).
_VAGAS_PARALELO = threading.BoundedSemaphore(4)


def fetch_all_paralelo(build_query, page_size=1000, workers=3):
    """Como fetch_all, mas busca as páginas ao mesmo tempo (mais rápido em tabelas grandes).

    `build_query(com_total)` devolve uma query NOVA; com_total=True deve pedir
    select("*", count="exact"). Se o total não vier, ou se algo falhar no modo paralelo
    (ex.: o erro de soquete do Windows), cai no fetch_all normal, que é mais calmo.
    """
    try:
        with _VAGAS_PARALELO:
            primeira = _com_tentativas(lambda: build_query(True).range(0, page_size - 1).execute())
            linhas = list(primeira.data or [])
            total = getattr(primeira, "count", None)
            if total is None:
                raise RuntimeError("sem total")
            if total <= page_size:
                return linhas
            inicios = list(range(page_size, total, page_size))

            def buscar(inicio):
                return _com_tentativas(
                    lambda: build_query(False).range(inicio, inicio + page_size - 1).execute()
                ).data or []

            with ThreadPoolExecutor(max_workers=workers) as pool:
                for pagina in pool.map(buscar, inicios):
                    linhas.extend(pagina)
            return linhas
    except Exception as erro:  # noqa: BLE001
        print(f"[fetch] modo paralelo falhou ({erro}); usando o modo sequencial")
        return fetch_all(lambda: build_query(False), page_size)


# ------------------------------------------------------------
# PERFIS DE ACESSO
#   admin               -> tudo
#   municipio           -> Coordenador Geral por Município (1 município)
#   apoiador_visitas    -> Apoiador de Visitas (municípios definidos pelo admin)
#   apoiador_relatorios -> Apoiador de Relatórios (municípios definidos pelo admin; analisa documentos)
# ------------------------------------------------------------
PAPEIS_APOIADOR = ("apoiador_visitas", "apoiador_relatorios")
ROTULO_PAPEL_APOIADOR = {"apoiador_visitas": "Apoiador de Visitas", "apoiador_relatorios": "Apoiador de Relatórios"}
ORIGEM_POR_PAPEL = {
    "admin": "admin",
    "municipio": "municipio",
    "apoiador_visitas": "visita",
    "apoiador_relatorios": "apoio_relatorios",
}
_CACHE_PERFIL = {}  # user_id -> (perfil, expira_em)


def carregar_perfil(user):
    """Perfil do usuário: role, nome, municipio_id e `municipios_ids`.

    `municipios_ids` = None significa "todos os municípios" (admin ou perfil ainda não
    configurado); senão é a lista dos que ele pode acessar.
    """
    if DEV_SKIP_AUTH:
        return {"role": "admin", "municipio_id": None, "nome": "Dev", "municipios_ids": None}
    agora = time.time()
    em_cache = _CACHE_PERFIL.get(user.id)
    if em_cache and em_cache[1] > agora:
        return em_cache[0]

    db = get_client()
    linhas = db.table("perfis").select("role, municipio_id, nome").eq("id", user.id).limit(1).execute().data or []
    perfil = dict(linhas[0]) if linhas else {"role": None, "municipio_id": None, "nome": None}
    role = perfil.get("role")
    if role in (None, "admin"):
        ids = None
    else:
        conjunto = set()
        if perfil.get("municipio_id") is not None:
            conjunto.add(int(perfil["municipio_id"]))
        if role in PAPEIS_APOIADOR:
            atribuidos = db.table("perfil_municipios").select("municipio_id").eq("perfil_id", user.id).execute().data or []
            conjunto.update(int(r["municipio_id"]) for r in atribuidos)
        ids = sorted(conjunto)
    perfil["municipios_ids"] = ids
    if len(_CACHE_PERFIL) > 500:
        _CACHE_PERFIL.clear()
    _CACHE_PERFIL[user.id] = (perfil, agora + 60)
    return perfil


def limpar_caches_perfil():
    _CACHE_PERFIL.clear()
    _CACHE_ADMIN.clear()
    _municipios_cache.clear()
    _CACHE_RESUMO.clear()
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
    _CACHE_RESUMO.clear()
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
        perfil = carregar_perfil(user)
        return jsonify(
            {
                "role": perfil.get("role"),
                "municipio_id": perfil.get("municipio_id"),
                "nome": perfil.get("nome"),
                "email": user.email,
                "municipio_ids": perfil.get("municipios_ids"),  # null = todos os municípios
            }
        )
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
        # Coordenador do município e os apoiadores só enxergam os municípios deles.
        # Só o admin (ou DEV_SKIP_AUTH) vê todos.
        permitidos = None if DEV_SKIP_AUTH else carregar_perfil(user)["municipios_ids"]
        if permitidos is not None:
            if not permitidos:
                _municipios_cache[cache_key] = (time.time(), [])
                return jsonify([])
            query = query.in_("id", permitidos)
        municipios = query.execute().data

        # Uma única consulta trazendo status de TODOS os documentos, em vez de
        # uma consulta por município.
        todos_docs = fetch_all(lambda: db.table("documentos").select("municipio_id, status").order("id"))

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
      acao_id    = uuid da ação pedagógica, ou "sem" para documentos sem ação pedagógica
      ciclo_id   = uuid do ciclo (edição) do projeto — tem prioridade sobre "ano"
      ano        = ano da data de realização (ex.: 2026), usado só sem ciclo
      mes        = mês da data de realização (1-12, vale junto com ciclo ou ano)
    """
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem consultar o resumo."}), 403

    acao_id = request.args.get("acao_id") or None
    ciclo_id = request.args.get("ciclo_id") or None
    ano = request.args.get("ano", type=int) if not ciclo_id else None
    mes = request.args.get("mes", type=int) if (ano or ciclo_id) else None

    chave_resumo = f"{acao_id}|{ciclo_id}|{ano}|{mes}"
    em_cache = _CACHE_RESUMO.get(chave_resumo)
    if em_cache and (time.time() - em_cache[0]) < RESUMO_CACHE_TTL:
        return jsonify(em_cache[1])
    inicio_resumo = time.time()

    try:
        # Caminho rápido: tudo agregado dentro do banco numa única chamada
        # (função sql/painel_resumo.sql). Só é chamado depois de confirmar admin.
        try:
            dados = get_client().rpc("painel_resumo", {
                "p_acao_id": acao_id if acao_id and acao_id != "sem" else None,
                "p_sem_acao": acao_id == "sem",
                "p_ano": ano,
                "p_mes": mes,
                "p_ciclo_id": ciclo_id,
            }).execute().data
        except Exception as erro_rpc:
            print(f"[resumo] função painel_resumo indisponível, usando modo lento: {erro_rpc}")
            dados = _resumo_lento(acao_id, ano, mes, ciclo_id)

        resultado = _montar_resumo(dados)
        if len(_CACHE_RESUMO) > 100:
            _CACHE_RESUMO.clear()
        _CACHE_RESUMO[chave_resumo] = (time.time(), resultado)
        ms = round((time.time() - inicio_resumo) * 1000)
        print(f"[resumo] calculado em {ms} ms (próximas aberturas em até {RESUMO_CACHE_TTL}s saem do cache)")
        resposta = jsonify(resultado)
        resposta.headers["Server-Timing"] = f"resumo;dur={ms}"
        return resposta
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
        "por_acao": dados.get("por_acao") or [],
        "sem_acao": dados.get("sem_acao") or 0,
    }


def _resumo_lento(acao_id, ano, mes, ciclo_id=None):
    """Mesmo resultado da função SQL, calculado em Python (usado só se a função não existir)."""
    db = get_client()
    municipios = db.table("municipios").select("id, nome, periodo").order("nome").execute().data or []

    def query_documentos():
        return db.table("documentos").select(
            "id, municipio_id, escola_id, status, data_realizacao, ciclo_id, acao_pedagogica_id, "
            "tipos_documento(nome), acoes_pedagogicas(nome)"
        ).order("id")

    todos_documentos = fetch_all(query_documentos)
    acoes = db.table("acoes_pedagogicas").select("id, nome, ordem").eq("ativo", True).execute().data or []

    def no_periodo(d):
        data = d.get("data_realizacao") or ""
        if ciclo_id:
            if d.get("ciclo_id") != ciclo_id:
                return False
        elif ano and data[:4] != str(ano):
            return False
        return not mes or data[5:7] == f"{mes:02d}"

    def na_acao(d):
        if acao_id == "sem":
            return not d.get("acao_pedagogica_id")
        return not acao_id or d.get("acao_pedagogica_id") == acao_id

    do_periodo = [d for d in todos_documentos if no_periodo(d)]
    documentos = [d for d in do_periodo if na_acao(d)]
    anos_disponiveis = sorted(
        {int(d["data_realizacao"][:4]) for d in todos_documentos if d.get("data_realizacao") and na_acao(d)},
        reverse=True,
    )
    # o resumo por ação ignora o filtro de ação (mostra todas as barras)
    por_acao = []
    for a in sorted(acoes, key=lambda x: (x.get("ordem") is None, x.get("ordem") or 0, x["nome"])):
        da_acao = [d for d in do_periodo if d.get("acao_pedagogica_id") == a["id"]]
        por_acao.append({
            **a,
            "total": len(da_acao),
            "aprovados": sum(1 for d in da_acao if d.get("status") == "aprovado"),
        })
    sem_acao = sum(1 for d in do_periodo if not d.get("acao_pedagogica_id"))
    escolas = fetch_all(
        lambda: db.table("escolas").select("id, municipio_id, nome, latitude, longitude").order("id")
    )
    # "escolas_total" = escolas que participam do programa no ciclo
    if ciclo_id:
        ids_programa = set(_ids_escolas_no_ciclo(db, ciclo_id))
    else:
        ids_programa = {l["escola_id"] for l in fetch_all(lambda: db.table("escolas_ciclos").select("escola_id, ciclo_id").order("escola_id").order("ciclo_id"))}

    municipio_map = {
        m["id"]: {**m, "total_documentos": 0, "aprovados": 0, "pendentes": 0, "rejeitados": 0,
                  "escolas_total": 0, "escolas_participantes": 0}
        for m in municipios
    }
    for escola in escolas:
        if escola["id"] in ids_programa and escola["municipio_id"] in municipio_map:
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
            programa = (d.get("acoes_pedagogicas") or {}).get("nome") or "Sem ação pedagógica"
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
        "por_acao": por_acao,
        "sem_acao": sem_acao,
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

        # primeiro as escolas, depois o responsável: só municípios com escolas no programa
        if not responsavel_id and int(municipio_id) not in _municipios_contemplados(db):
            return jsonify({"error": "Este município ainda não tem escolas no programa. Marque as escolas em Escolas do programa antes de cadastrar o responsável."}), 400

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

        limpar_caches_perfil()
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

        _CACHE_RESUMO.clear()
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
        _CACHE_RESUMO.clear()
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
# AÇÕES PEDAGÓGICAS (Acolhimento, Meditação, Hora do Conto, Relatório...)
# ------------------------------------------------------------
@app.get("/api/acoes-pedagogicas")
def listar_acoes_pedagogicas():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    _, jwt = auth

    try:
        db = get_db(jwt)
        acoes = (
            db.table("acoes_pedagogicas").select("*").eq("ativo", True)
            .order("ordem", nullsfirst=False).order("nome").execute().data
        )
        return jsonify(acoes)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# VALORES (no banco, tabela "projetos": Paz, Amor, Verdade, Ação correta, Não violência)
# ------------------------------------------------------------
@app.get("/api/projetos")
def listar_projetos():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    _, jwt = auth

    try:
        db = get_db(jwt)
        projetos = (
            db.table("projetos").select("*").eq("ativo", True)  # valores antigos (Agrinho etc.) ficam de fora
            .order("ordem", nullsfirst=False).order("nome").execute().data
        )
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
    cor = (body.get("cor") or "").strip() or None

    if not nome:
        return jsonify({"error": "Nome é obrigatório."}), 400
    if cor and not re.fullmatch(r"#[0-9a-fA-F]{6}", cor):
        return jsonify({"error": "A cor precisa estar no formato #RRGGBB (ex.: #8E5BB5)."}), 400

    try:
        db = get_client()
        payload = {"nome": nome, "descricao": descricao}
        if cor:
            payload["cor"] = cor
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
# CICLOS (cada ano é um ciclo/edição do Projeto Valores Humanos)
# ------------------------------------------------------------
def _ciclos_publicos():
    """Lista de ciclos, do mais recente para o mais antigo (sem exigir login)."""
    return (
        get_client().table("ciclos").select("id, nome, data_inicio, data_fim, ativo")
        .order("data_inicio", desc=True).execute().data or []
    )


@app.get("/api/ciclos")
def listar_ciclos():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    try:
        return jsonify(_ciclos_publicos())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/ciclos")
def salvar_ciclo():
    """Cria ou edita um ciclo. Com ativo=true, os outros ciclos deixam de ser o ativo."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem editar ciclos."}), 403

    body = request.get_json(force=True, silent=True) or {}
    ciclo_id = body.get("id")
    nome = (body.get("nome") or "").strip()
    inicio = (body.get("data_inicio") or "").strip()
    fim = (body.get("data_fim") or "").strip()
    ativo = bool(body.get("ativo"))

    if not nome or not inicio or not fim:
        return jsonify({"error": "Informe o nome, a data de início e a data de fim do ciclo."}), 400
    if not data_realizacao_valida(inicio) or not data_realizacao_valida(fim):
        return jsonify({"error": "Data inválida. Confira o ano (ex.: 2027)."}), 400
    if fim < inicio:
        return jsonify({"error": "A data de fim não pode ser antes da data de início."}), 400

    try:
        db = get_client()
        if ativo:
            # o índice único só aceita um ativo: desliga os outros antes
            consulta = db.table("ciclos").update({"ativo": False}).eq("ativo", True)
            if ciclo_id:
                consulta = consulta.neq("id", ciclo_id)
            consulta.execute()
        payload = {"nome": nome, "data_inicio": inicio, "data_fim": fim, "ativo": ativo}
        if ciclo_id:
            payload["id"] = ciclo_id
        salvo = db.table("ciclos").upsert(payload, on_conflict="id").execute().data
        _CACHE_FEED.clear()
        _CACHE_ESCOLAS.clear()
        _CACHE_GERAL.clear()
        return jsonify(salvo)
    except Exception as e:
        mensagem = str(e)
        if "uq_ciclos_um_ativo" in mensagem:
            mensagem = "Já existe um ciclo ativo. Tente de novo."
        return jsonify({"error": mensagem}), 500


@app.delete("/api/ciclos")
def excluir_ciclo():
    """Só exclui ciclos que ainda não têm nenhum documento."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem excluir ciclos."}), 403

    ciclo_id = request.args.get("id")
    if not ciclo_id:
        return jsonify({"error": "Parâmetro 'id' é obrigatório."}), 400
    try:
        db = get_client()
        usados = db.table("documentos").select("id", count="exact").eq("ciclo_id", ciclo_id).limit(1).execute()
        if (usados.count or 0) > 0:
            return jsonify({"error": "Este ciclo já tem documentos e não pode ser excluído."}), 400
        db.table("ciclos").delete().eq("id", ciclo_id).execute()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# ESCOLAS DO PROGRAMA (nem todas participam: o admin marca por ciclo)
# ------------------------------------------------------------
def _ciclo_ativo_id(db):
    linhas = db.table("ciclos").select("id").eq("ativo", True).limit(1).execute().data or []
    return linhas[0]["id"] if linhas else None


def _escolas_por_ids(db, ids, colunas="*", lote=100):
    """Busca só as escolas pedidas (em lotes, ao mesmo tempo) — sem varrer a tabela inteira."""
    ids = list(ids)
    if not ids:
        return []
    lotes = [ids[i:i + lote] for i in range(0, len(ids), lote)]

    def buscar(parte):
        return _com_tentativas(lambda: db.table("escolas").select(colunas).in_("id", parte).execute()).data or []

    linhas = []
    try:
        with _VAGAS_PARALELO:
            with ThreadPoolExecutor(max_workers=3) as pool:
                for resultado in pool.map(buscar, lotes):
                    linhas.extend(resultado)
    except Exception as erro:  # noqa: BLE001
        print(f"[escolas] busca em paralelo falhou ({erro}); usando o modo sequencial")
        linhas = []
        for parte in lotes:
            linhas.extend(buscar(parte))
    return linhas


def _resumo_programa_por_municipio(ciclo_id):
    """{municipio_id (texto): quantidade de escolas no programa}. Guardado por 60 s; limpo ao salvar."""

    def calcular():
        db = get_client()
        try:
            return get_client().rpc("escolas_programa_por_municipio", {"p_ciclo_id": ciclo_id}).execute().data or {}
        except Exception as erro_rpc:
            print(f"[escolas-participantes] função indisponível, usando modo lento: {erro_rpc}")
            ids = _ids_escolas_no_ciclo(db, ciclo_id)
            por_municipio = {}
            for e in _escolas_por_ids(db, ids, "id, municipio_id"):
                chave = str(e["municipio_id"])
                por_municipio[chave] = por_municipio.get(chave, 0) + 1
            return por_municipio

    return _em_cache(f"resumo_programa|{ciclo_id}", 60, calcular)


def _municipios_contemplados(db=None):
    """IDs dos municípios que já têm escolas no programa do ciclo ativo.

    Só neles é permitido cadastrar Coordenador ou Apoiador.
    """
    db = db or get_client()
    ciclo_id = _ciclo_ativo_id(db)
    if not ciclo_id:
        return set()
    return {int(k) for k, qtd in _resumo_programa_por_municipio(ciclo_id).items() if qtd}


def _ids_escolas_no_ciclo(db, ciclo_id, municipio_id=None):
    """IDs das escolas incluídas no programa neste ciclo (de um município, ou de todos)."""
    if not municipio_id:
        linhas = fetch_all(
            lambda: db.table("escolas_ciclos").select("escola_id").eq("ciclo_id", ciclo_id).order("escola_id")
        )
        return [l["escola_id"] for l in linhas]
    do_municipio = [
        e["id"] for e in fetch_all(lambda: db.table("escolas").select("id").eq("municipio_id", municipio_id).order("id"))
    ]
    encontrados = []
    for i in range(0, len(do_municipio), 100):  # em lotes, para não estourar o tamanho da URL
        encontrados += (
            db.table("escolas_ciclos").select("escola_id")
            .eq("ciclo_id", ciclo_id).in_("escola_id", do_municipio[i:i + 100]).execute().data or []
        )
    return [l["escola_id"] for l in encontrados]


@app.get("/api/escolas-participantes")
def listar_escolas_participantes():
    """?ciclo_id=&municipio_id= -> ids das escolas do programa. ?resumo=1 -> quantidade por município."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    _, jwt = auth

    try:
        db = get_db(jwt)
        ciclo_id = request.args.get("ciclo_id") or _ciclo_ativo_id(db)
        if not ciclo_id:
            return jsonify({"ciclo_id": None, "escola_ids": [], "por_municipio": {}})

        if request.args.get("resumo") == "1":
            por_municipio = _resumo_programa_por_municipio(ciclo_id)
            return jsonify({"ciclo_id": ciclo_id, "por_municipio": por_municipio, "total": sum(por_municipio.values())})

        municipio_id = request.args.get("municipio_id")
        return jsonify({"ciclo_id": ciclo_id, "escola_ids": _ids_escolas_no_ciclo(db, ciclo_id, municipio_id)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/escolas-participantes")
def salvar_escolas_participantes():
    """Admin: inclui (participa=true) ou tira (participa=false) escolas do programa num ciclo."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem escolher as escolas do programa."}), 403

    body = request.get_json(force=True, silent=True) or {}
    ciclo_id = body.get("ciclo_id")
    escola_ids = [i for i in (body.get("escola_ids") or []) if i]
    participa = bool(body.get("participa"))
    if not ciclo_id:
        return jsonify({"error": "Escolha o ciclo."}), 400
    if not escola_ids:
        return jsonify({"error": "Nenhuma escola informada."}), 400
    if len(escola_ids) > 3000:
        return jsonify({"error": "Escolha no máximo 3000 escolas por vez."}), 400

    try:
        db = get_client()
        if not (db.table("ciclos").select("id").eq("id", ciclo_id).limit(1).execute().data or []):
            return jsonify({"error": "Ciclo não encontrado."}), 400

        com_documentos = set()
        for i in range(0, len(escola_ids), 100):
            lote = escola_ids[i:i + 100]
            if participa:
                db.table("escolas_ciclos").upsert(
                    [{"escola_id": e, "ciclo_id": ciclo_id} for e in lote],
                    on_conflict="escola_id,ciclo_id",
                    ignore_duplicates=True,
                ).execute()
            else:
                db.table("escolas_ciclos").delete().eq("ciclo_id", ciclo_id).in_("escola_id", lote).execute()
                docs = (
                    db.table("documentos").select("escola_id")
                    .eq("ciclo_id", ciclo_id).in_("escola_id", lote).execute().data or []
                )
                com_documentos |= {d["escola_id"] for d in docs}
        _municipios_cache.clear()
        _CACHE_RESUMO.clear()
        _CACHE_ESCOLAS.clear()
        _CACHE_GERAL.clear()
        return jsonify({"ok": True, "participa": participa, "total": len(escola_ids), "com_documentos": len(com_documentos)})
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
    user, jwt = auth

    try:
        db = get_db(jwt)
        municipio_id = request.args.get("municipio_id")
        so_programa = request.args.get("participantes") == "1"

        def build_query(com_total=False):
            query = (
                db.table("escolas").select(COLUNAS_ESCOLA, count="exact")
                if com_total
                else db.table("escolas").select(COLUNAS_ESCOLA)
            )
            if municipio_id:
                query = query.eq("municipio_id", municipio_id)
            return query.order("nome").order("id")

        if so_programa:
            # só as escolas marcadas como participantes no ciclo (padrão: o ciclo ativo):
            # busca primeiro os ids marcados e depois só essas escolas, sem varrer a tabela toda
            ciclo_id = request.args.get("ciclo_id") or _ciclo_ativo_id(db)
            if not ciclo_id:
                return jsonify([])
            ids = _ids_escolas_no_ciclo(db, ciclo_id, municipio_id)
            escolas = _escolas_por_ids(db, ids)
            escolas.sort(key=lambda e: ((e.get("nome") or "").lower(), str(e["id"])))
            return jsonify(escolas)

        # 10 mil escolas = ~11 páginas: buscadas ao mesmo tempo, não uma por vez.
        # O resultado fica guardado por 5 min (a chave inclui o que a pessoa pode ver).
        permitidos = None if DEV_SKIP_AUTH else carregar_perfil(user)["municipios_ids"]
        quem = "todos" if permitidos is None else ",".join(str(i) for i in permitidos) or "nenhum"
        chave = f"{municipio_id or ''}|{quem}"
        em_cache = _CACHE_ESCOLAS.get(chave)
        if em_cache and (time.time() - em_cache[0]) < ESCOLAS_CACHE_TTL:
            return jsonify(em_cache[1])
        escolas = fetch_all_paralelo(build_query)
        if len(_CACHE_ESCOLAS) > 50:
            _CACHE_ESCOLAS.clear()
        _CACHE_ESCOLAS[chave] = (time.time(), escolas)
        return jsonify(escolas)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _norm_nome(texto):
    """Nome sem acento, minúsculo e com espaços únicos — para achar escola repetida."""
    sem_acento = unicodedata.normalize("NFD", str(texto or "")).encode("ascii", "ignore").decode()
    return " ".join(sem_acento.lower().split())


def _nome_escola_valido(valor):
    """Devolve (nome_limpo, erro)."""
    nome = " ".join(str(valor or "").split())
    if len(nome) < 3:
        return None, "Informe o nome da escola (mínimo de 3 letras)."
    if len(nome) > 200:
        return None, "Nome muito longo (máximo de 200 caracteres)."
    return nome, None


@app.post("/api/escolas")
def criar_escola():
    """Cadastra uma escola. Admin: qualquer município. Responsável municipal: só o próprio
    (garantido pela policy de INSERT do banco — sql/migration_escolas_cadastro.sql).
    A escola nova já entra no programa do ciclo ativo."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    _, jwt = auth

    body = request.get_json(force=True, silent=True) or {}
    municipio_id = body.get("municipio_id")
    if not municipio_id:
        return jsonify({"error": "Escolha o município da escola."}), 400
    nome, erro_nome = _nome_escola_valido(body.get("nome"))
    if erro_nome:
        return jsonify({"error": erro_nome}), 400

    tipo = (body.get("tipo") or "").strip() or None
    if tipo and len(tipo) > 40:
        return jsonify({"error": "Tipo muito longo."}), 400
    endereco = (body.get("endereco") or "").strip()
    if len(endereco) > 300:
        return jsonify({"error": "Endereço muito longo (máximo de 300 caracteres)."}), 400
    try:
        latitude = _coordenada(body.get("latitude"), 90, "Latitude")
        longitude = _coordenada(body.get("longitude"), 180, "Longitude")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    if (latitude is None) != (longitude is None):
        return jsonify({"error": "Informe latitude e longitude juntas (ou deixe as duas vazias)."}), 400

    try:
        db = get_db(jwt)
        existentes = fetch_all(lambda: db.table("escolas").select("id, nome").eq("municipio_id", municipio_id).order("id"))
        if any(_norm_nome(e["nome"]) == _norm_nome(nome) for e in existentes):
            return jsonify({"error": "Já existe uma escola com esse nome neste município. Procure na lista e use Editar."}), 409

        criadas = db.table("escolas").insert({
            "municipio_id": municipio_id,
            "nome": nome,
            "tipo": tipo,
            "endereco": endereco or None,
            "latitude": latitude,
            "longitude": longitude,
        }).execute().data
        if not criadas:
            return jsonify({"error": "Não foi possível cadastrar a escola."}), 403
        escola = criadas[0]

        # escola nova entra no programa do ciclo ativo (o admin pode desmarcar depois)
        no_programa = False
        try:
            admin_db = get_client()
            ciclo_ativo = _ciclo_ativo_id(admin_db)
            if ciclo_ativo:
                admin_db.table("escolas_ciclos").upsert(
                    {"escola_id": escola["id"], "ciclo_id": ciclo_ativo},
                    on_conflict="escola_id,ciclo_id", ignore_duplicates=True,
                ).execute()
                no_programa = True
        except Exception as erro_programa:
            print(f"[escolas] escola criada, mas não entrou no programa do ciclo ativo: {erro_programa}")

        _municipios_cache.clear()

        _CACHE_RESUMO.clear()
        _CACHE_ESCOLAS.clear()
        _CACHE_GERAL.clear()
        return jsonify({**escola, "no_programa": no_programa}), 201
    except Exception as e:
        mensagem = str(e)
        if "row-level security" in mensagem or "42501" in mensagem:
            return jsonify({"error": "Você só pode cadastrar escolas do seu município."}), 403
        return jsonify({"error": mensagem}), 500


def _coordenada(valor, limite, rotulo):
    """Converte o valor recebido em float com 6 casas (ou None se vazio).

    Aceita número ou texto com vírgula decimal ("-3,4321"). Levanta ValueError
    com mensagem pronta para o usuário se não for um número válido.
    """
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        return None
    try:
        numero = float(str(valor).strip().replace(",", "."))
    except ValueError:
        raise ValueError(f"{rotulo} inválida: use apenas números (ex.: -3.432100).")
    if numero != numero or abs(numero) > limite:  # NaN ou fora do intervalo possível
        raise ValueError(f"{rotulo} inválida: deve estar entre -{limite} e {limite}.")
    return round(numero, 6)


@app.put("/api/escolas")
def atualizar_escola():
    """Atualiza nome, tipo, endereço, latitude e longitude de UMA escola.

    Quem pode: admin (qualquer escola) e responsável municipal (só do próprio
    município). Isso é garantido pelo banco: policy de UPDATE + gatilho em
    sql/migration_escolas_cadastro.sql — aqui só aceitamos esses campos.
    """
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    _, jwt = auth

    body = request.get_json(force=True, silent=True) or {}
    escola_id = body.get("id")
    if not escola_id:
        return jsonify({"error": "Campo 'id' é obrigatório."}), 400

    try:
        endereco = (body.get("endereco") or "").strip()
        if len(endereco) > 300:
            return jsonify({"error": "Endereço muito longo (máximo de 300 caracteres)."}), 400
        latitude = _coordenada(body.get("latitude"), 90, "Latitude")
        longitude = _coordenada(body.get("longitude"), 180, "Longitude")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    if (latitude is None) != (longitude is None):
        return jsonify({"error": "Informe latitude e longitude juntas (ou deixe as duas vazias)."}), 400

    payload = {"endereco": endereco or None, "latitude": latitude, "longitude": longitude}
    if "tipo" in body:
        tipo = (body.get("tipo") or "").strip()
        if len(tipo) > 40:
            return jsonify({"error": "Tipo muito longo."}), 400
        payload["tipo"] = tipo or None
    if "nome" in body:
        nome, erro_nome = _nome_escola_valido(body.get("nome"))
        if erro_nome:
            return jsonify({"error": erro_nome}), 400
        payload["nome"] = nome

    try:
        db = get_db(jwt)
        if "nome" in payload:
            atual = db.table("escolas").select("municipio_id, nome").eq("id", escola_id).limit(1).execute().data
            if not atual:
                return jsonify({"error": "Escola não encontrada ou sem permissão para editar."}), 404
            if _norm_nome(atual[0]["nome"]) != _norm_nome(payload["nome"]):
                outras = fetch_all(lambda: db.table("escolas").select("id, nome").eq("municipio_id", atual[0]["municipio_id"]).order("id"))
                if any(o["id"] != escola_id and _norm_nome(o["nome"]) == _norm_nome(payload["nome"]) for o in outras):
                    return jsonify({"error": "Já existe outra escola com esse nome neste município."}), 409
        atualizadas = db.table("escolas").update(payload).eq("id", escola_id).execute().data
        if not atualizadas:
            # a RLS esconde escolas de outros municípios: para o usuário, "não existe"
            return jsonify({"error": "Escola não encontrada ou sem permissão para editar."}), 404
        _CACHE_ESCOLAS.clear()
        _CACHE_GERAL.clear()  # o mapa público usa latitude/longitude: refaz na próxima visita
        return jsonify(atualizadas[0])
    except Exception as e:
        if "42501" in str(e) or "só pode alterar" in str(e):
            return jsonify({"error": "Você só pode editar escolas do seu município."}), 403
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
        ciclo_id = request.args.get("ciclo_id")

        def montar_query():
            query = db.table("documentos").select("*, tipos_documento(nome), escolas(nome, endereco), acoes_pedagogicas(nome)")
            if municipio_id:
                query = query.eq("municipio_id", municipio_id)
            if ciclo_id:
                query = query.eq("ciclo_id", ciclo_id)
            if status:
                query = query.eq("status", status)
            if tipo_id:
                query = query.eq("tipo_id", tipo_id)
            return query.order("created_at", desc=True).order("id")

        docs = fetch_all(montar_query)

        # Nome de quem aprovou ("Aprovado por Geovana"); guardado por 5 min para não consultar a cada abertura
        ids_validadores = list(
            {d[campo] for d in docs for campo in ("validado_por", "analise_por") if d.get(campo)}
        )
        if ids_validadores:
            agora = time.time()
            nomes = {i: _CACHE_NOMES_PERFIS[i][0] for i in ids_validadores if i in _CACHE_NOMES_PERFIS and _CACHE_NOMES_PERFIS[i][1] > agora}
            faltando = [i for i in ids_validadores if i not in nomes]
            if faltando:
                perfis = get_client().table("perfis").select("id, nome").in_("id", faltando).execute().data or []
                for p in perfis:
                    nomes[p["id"]] = p["nome"]
                    _CACHE_NOMES_PERFIS[p["id"]] = (p["nome"], agora + 300)
            for d in docs:
                d["validado_por_nome"] = nomes.get(d.get("validado_por"))
                d["analise_por_nome"] = nomes.get(d.get("analise_por"))
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

    # Cada perfil só envia para os municípios em que atua
    perfil_envio = carregar_perfil(user)
    permitidos = perfil_envio.get("municipios_ids")
    if permitidos is not None:
        try:
            municipio_ok = int(body["municipio_id"]) in permitidos
        except (TypeError, ValueError):
            municipio_ok = False
        if not municipio_ok:
            return jsonify({"error": "Você não tem permissão para enviar documentos para este município."}), 403

    acao_id = body.get("acao_pedagogica_id") or None
    subtipo = (body.get("subtipo") or "").strip() or None
    if not acao_id:
        return jsonify({"error": "Escolha a ação pedagógica realizada (Acolhimento, Meditação, Hora do Conto...)."}), 400

    try:
        db = get_db(jwt)
        if acao_id:
            acao = db.table("acoes_pedagogicas").select("nome, exige_pdf, subtipos").eq("id", acao_id).limit(1).execute().data
            if not acao:
                return jsonify({"error": "Ação pedagógica não encontrada."}), 400
            acao = acao[0]
            # PDF é só para a ação Relatório; as demais ações usam Vídeo ou Imagem
            tipo_linha = db.table("tipos_documento").select("nome").eq("id", body["tipo_id"]).limit(1).execute().data or []
            tipo_nome = (tipo_linha[0]["nome"] if tipo_linha else "").strip().lower()
            if acao.get("exige_pdf") and tipo_nome != "pdf":
                return jsonify({"error": f"A ação {acao['nome']} é enviada em PDF."}), 400
            if not acao.get("exige_pdf") and tipo_nome == "pdf":
                return jsonify({"error": f"A ação {acao['nome']} aceita só vídeo ou imagem. PDF é para a ação Relatório."}), 400
            if acao.get("subtipos"):
                if subtipo not in acao["subtipos"]:
                    return jsonify({"error": f"Escolha o tipo de {acao['nome'].lower()}: {', '.join(acao['subtipos'])}."}), 400
            else:
                subtipo = None
        else:
            subtipo = None
        if body.get("escola_id"):
            ciclo_do_envio = body.get("ciclo_id") or _ciclo_ativo_id(db)
            if ciclo_do_envio:
                participa = db.table("escolas_ciclos").select("escola_id").eq("escola_id", body["escola_id"]).eq("ciclo_id", ciclo_do_envio).limit(1).execute().data
                if not participa:
                    return jsonify({"error": "Esta escola não faz parte do programa neste ciclo. Peça ao administrador para incluí-la."}), 400
        perfil = db.table("perfis").select("nome").eq("id", user.id).single().execute().data or {}
        responsavel_nome = perfil.get("nome") or (getattr(user, "user_metadata", {}) or {}).get("nome") or user.email
        payload = {
            "municipio_id": body["municipio_id"],
            "tipo_id": body["tipo_id"],
            "finalidade": body.get("finalidade"),
            "acao_evento": body.get("acao_evento"),
            "escola_id": body.get("escola_id"),
            "acao_pedagogica_id": acao_id,
            "subtipo": subtipo,
            "descricao": body.get("descricao"),
            "data_realizacao": body["data_realizacao"],
            "responsavel_envio_id": user.id,
            "responsavel_nome": responsavel_nome,
            "responsavel_email": user.email,
            "drive_file_id": body.get("drive_file_id"),
            "drive_file_link": body.get("drive_file_link"),
            "link_externo": body.get("link_externo"),
            "status": "pendente",
            "origem": ORIGEM_POR_PAPEL.get(perfil_envio.get("role")),
        }
        if body.get("ciclo_id"):  # sem ciclo informado, o banco usa o ciclo ativo
            payload["ciclo_id"] = body["ciclo_id"]
        created = db.table("documentos").insert(payload).execute().data
        _municipios_cache.clear()
        _CACHE_RESUMO.clear()
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
        _CACHE_RESUMO.clear()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# VALIDAR (aprovar) e ARQUIVAR — só admin. Não existe mais rejeição.
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

    if not documento_id or novo_status != "aprovado":
        return jsonify({"error": "documento_id e status 'aprovado' são obrigatórios. Documentos não são mais rejeitados."}), 400

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
                    "motivo_rejeicao": None,
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
        _CACHE_RESUMO.clear()
        _CACHE_FEED.clear()
        _CACHE_ESCOLAS.clear()
        _CACHE_GERAL.clear()
        if campos_galeria.get("na_galeria"):
            for doc in updated or []:
                if doc.get("drive_file_id"):
                    liberar_link_publico(doc["drive_file_id"])
        return jsonify(updated)
    except Exception as e:
        return jsonify({"error": mensagem_erro_galeria(e)}), 500


@app.post("/api/arquivar")
def arquivar_documento():
    """Guarda (ou tira do arquivo) um documento aprovado para a lista não ficar cheia."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth

    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem arquivar documentos."}), 403

    body = request.get_json(force=True, silent=True) or {}
    documento_id = body.get("documento_id")
    arquivar = bool(body.get("arquivado", True))
    if not documento_id:
        return jsonify({"error": "documento_id é obrigatório."}), 400

    try:
        db = get_db(jwt)
        atual = db.table("documentos").select("id, status, na_galeria").eq("id", documento_id).limit(1).execute().data
        if not atual:
            return jsonify({"error": "Documento não encontrado."}), 404
        if arquivar:
            if atual[0].get("status") != "aprovado":
                return jsonify({"error": "Aprove o documento antes de arquivar."}), 400
            if atual[0].get("na_galeria"):
                return jsonify({"error": "Tire o documento da galeria antes de arquivar."}), 400
        updated = (
            db.table("documentos")
            .update({
                "arquivado": arquivar,
                "arquivado_em": datetime.now(timezone.utc).isoformat() if arquivar else None,
            })
            .eq("id", documento_id)
            .execute()
            .data
        )
        _municipios_cache.clear()
        _CACHE_RESUMO.clear()
        return jsonify(updated)
    except Exception as e:
        texto = str(e)
        if "arquivado" in texto:
            texto = "Falta rodar o script sql/migration_sem_rejeicao.sql no Supabase (SQL Editor)."
        return jsonify({"error": texto}), 500


def data_realizacao_valida(valor):
    """Aceita só datas AAAA-MM-DD com ano entre 2000 e o ano que vem."""
    try:
        data = datetime.strptime(str(valor)[:10], "%Y-%m-%d")
    except (TypeError, ValueError):
        return False
    return 2000 <= data.year <= datetime.now().year + 1


def campos_publicacao_galeria(novo_status, body):
    """Campos da galeria a gravar junto com a validação.

    Aprovado -> body.na_galeria (true/false); se true, exige descricao_galeria.
    Se o frontend não mandar na_galeria (versão antiga), não mexe na galeria.
    Quem vai para a galeria nunca fica arquivado.
    """
    if "na_galeria" not in body:
        return {}, None
    if not body.get("na_galeria"):
        return {"na_galeria": False}, None
    descricao = (body.get("descricao_galeria") or "").strip()
    if not descricao:
        return None, "Escreva a descrição que vai aparecer na galeria."
    return {
        "na_galeria": True,
        "arquivado": False,
        "arquivado_em": None,
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


@app.post("/api/analisar")
def analisar_documento():
    """Análise prévia (Apoiador de Relatórios): recomenda a aprovação ou pede ajustes.

    Não aprova nem rejeita: a decisão final continua sendo do admin (/api/validar).
    """
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth

    perfil = carregar_perfil(user)
    if perfil.get("role") not in ("admin", "apoiador_relatorios"):
        return jsonify({"error": "Apenas o Apoiador de Relatórios e o administrador podem analisar documentos."}), 403

    body = request.get_json(force=True, silent=True) or {}
    documento_id = body.get("documento_id")
    analise_status = body.get("analise_status")
    observacao = (body.get("analise_obs") or "").strip()

    if not documento_id or analise_status not in ("recomendado", "ajustes"):
        return jsonify({"error": "documento_id e analise_status ('recomendado'|'ajustes') são obrigatórios."}), 400
    if analise_status == "ajustes" and not observacao:
        return jsonify({"error": "Explique o que precisa ser ajustado."}), 400

    try:
        db = get_client()
        doc = db.table("documentos").select("id, status, municipio_id").eq("id", documento_id).limit(1).execute().data or []
        if not doc:
            return jsonify({"error": "Documento não encontrado."}), 404
        # o Apoiador de Relatórios só analisa documentos dos municípios em que atua
        permitidos = perfil.get("municipios_ids")
        if permitidos is not None and doc[0].get("municipio_id") not in permitidos:
            return jsonify({"error": "Este documento é de um município em que você não atua."}), 403
        if doc[0]["status"] != "pendente":
            return jsonify({"error": "Só documentos pendentes podem ser analisados."}), 400
        atualizado = (
            db.table("documentos")
            .update(
                {
                    "analise_status": analise_status,
                    "analise_obs": observacao[:1000] or None,
                    "analise_por": user.id,
                    "analise_em": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", documento_id)
            .execute()
            .data
        )
        return jsonify(atualizado)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# EQUIPE: Apoiador de Visitas e Apoiador de Relatórios (só admin)
# ------------------------------------------------------------
@app.get("/api/usuarios")
def listar_usuarios():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem ver a equipe."}), 403

    try:
        db = get_client()
        perfis = (
            db.table("perfis").select("id, nome, role").in_("role", list(PAPEIS_APOIADOR)).order("nome").execute().data or []
        )
        ids = [p["id"] for p in perfis]
        atribuicoes = {}
        if ids:
            linhas = db.table("perfil_municipios").select("perfil_id, municipio_id").in_("perfil_id", ids).execute().data or []
            for linha in linhas:
                atribuicoes.setdefault(linha["perfil_id"], []).append(linha["municipio_id"])
        for p in perfis:
            try:
                p["email"] = db.auth.admin.get_user_by_id(p["id"]).user.email
            except Exception:
                p["email"] = None
            p["municipio_ids"] = sorted(atribuicoes.get(p["id"], []))
        return jsonify(perfis)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/usuarios")
def salvar_usuario():
    """Cria ou edita (com `id`) um Apoiador de Visitas / Apoiador de Relatórios."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem editar a equipe."}), 403

    body = request.get_json(force=True, silent=True) or {}
    usuario_id = body.get("id")
    nome = (body.get("nome") or "").strip()
    email = (body.get("email") or "").strip().lower()
    senha = body.get("senha") or ""
    role = body.get("role")
    municipio_ids = body.get("municipio_ids") or []

    if role not in PAPEIS_APOIADOR:
        return jsonify({"error": "Escolha o perfil: Apoiador de Visitas ou Apoiador de Relatórios."}), 400
    if not nome or not email:
        return jsonify({"error": "Nome e e-mail são obrigatórios."}), 400
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        return jsonify({"error": "Informe um e-mail válido."}), 400
    if senha and len(senha) < 6:
        return jsonify({"error": "A senha deve ter pelo menos 6 caracteres."}), 400
    try:
        municipio_ids = sorted({int(m) for m in municipio_ids})
    except (TypeError, ValueError):
        return jsonify({"error": "Municípios inválidos."}), 400
    if not municipio_ids:
        return jsonify({"error": f"Escolha pelo menos um município para o {ROTULO_PAPEL_APOIADOR[role]}."}), 400

    try:
        db = get_client()
        # primeiro as escolas, depois a equipe: só municípios com escolas no programa
        # (os que a pessoa já tinha continuam valendo)
        atuais = set()
        if usuario_id:
            atuais = {
                int(r["municipio_id"])
                for r in db.table("perfil_municipios").select("municipio_id").eq("perfil_id", usuario_id).execute().data or []
            }
        novos = [m for m in municipio_ids if m not in atuais]
        if novos:
            contemplados = _municipios_contemplados(db)
            if any(m not in contemplados for m in novos):
                return jsonify({"error": "Só é possível escolher municípios que já têm escolas no programa. Marque as escolas em Escolas do programa primeiro."}), 400
        if usuario_id:
            existente = db.table("perfis").select("role").eq("id", usuario_id).limit(1).execute().data or []
            if not existente or existente[0]["role"] not in PAPEIS_APOIADOR:
                return jsonify({"error": "Este usuário não é um apoiador."}), 404
            atributos = {"email": email, "user_metadata": {"nome": nome}}
            if senha:
                atributos["password"] = senha
            db.auth.admin.update_user_by_id(usuario_id, atributos)
        else:
            if len(senha) < 6:
                return jsonify({"error": "Informe uma senha com pelo menos 6 caracteres para o novo usuário."}), 400
            criado = db.auth.admin.create_user(
                {"email": email, "password": senha, "email_confirm": True, "user_metadata": {"nome": nome}}
            )
            usuario_id = criado.user.id

        db.table("perfis").upsert(
            {"id": usuario_id, "nome": nome, "role": role, "municipio_id": None}, on_conflict="id"
        ).execute()
        db.table("perfil_municipios").delete().eq("perfil_id", usuario_id).execute()
        if municipio_ids:
            db.table("perfil_municipios").insert(
                [{"perfil_id": usuario_id, "municipio_id": m} for m in municipio_ids]
            ).execute()
        limpar_caches_perfil()
        return jsonify({"id": usuario_id, "nome": nome, "email": email, "role": role, "municipio_ids": municipio_ids})
    except Exception as e:
        texto = str(e)
        if "already" in texto.lower() or "registered" in texto.lower():
            texto = "Já existe um usuário com este e-mail."
        return jsonify({"error": texto}), 500


@app.delete("/api/usuarios")
def excluir_usuario():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem excluir usuários da equipe."}), 403

    usuario_id = request.args.get("id")
    if not usuario_id:
        return jsonify({"error": "id é obrigatório."}), 400
    try:
        db = get_client()
        existente = db.table("perfis").select("role").eq("id", usuario_id).limit(1).execute().data or []
        if not existente or existente[0]["role"] not in PAPEIS_APOIADOR:
            return jsonify({"error": "Só é possível excluir Apoiadores por aqui."}), 404
        db.auth.admin.delete_user(usuario_id)
        limpar_caches_perfil()
        return jsonify({"ok": True})
    except Exception as e:
        texto = str(e)
        if "foreign key" in texto.lower() or "violates" in texto.lower():
            texto = "Este usuário já enviou ou analisou documentos e não pode ser excluído."
        return jsonify({"error": texto}), 500


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
def escolas_participantes_municipio(db, municipio_id=None, ciclo_id=None):
    """Escolas que REALMENTE participaram: têm documento aprovado.

    municipio_id=None -> Ceará inteiro (mapa geral da galeria).
    Devolve, para cada escola, o município, as coordenadas, os programas de
    que participou e quantas ações (documentos aprovados) teve em cada um.
    """
    def montar():
        query = (
            db.table("documentos")
            .select("id, escola_id, acoes_pedagogicas(nome)")
            .eq("status", "aprovado")
            .not_.is_("escola_id", "null")
        )
        if municipio_id:
            query = query.eq("municipio_id", municipio_id)
        if ciclo_id:
            query = query.eq("ciclo_id", ciclo_id)
        return query.order("id")

    docs = fetch_all(montar)
    por_escola = {}
    for d in docs:
        programa = (d.get("acoes_pedagogicas") or {}).get("nome") or "Sem ação pedagógica"
        contagem = por_escola.setdefault(d["escola_id"], {})
        contagem[programa] = contagem.get(programa, 0) + 1
    if not por_escola:
        return []

    ids = list(por_escola.keys())
    escolas = []
    for i in range(0, len(ids), 150):  # em lotes, para não estourar o tamanho da URL
        escolas += (
            db.table("escolas")
            .select("id, nome, municipio_id, latitude, longitude")
            .in_("id", ids[i:i + 150])
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
            "municipio_id": e.get("municipio_id"),
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


_CACHE_FEED = {}  # municipio_id -> (docs, expira_em)


def _galeria_feed(db, municipio_id, ciclo_id=None):
    """Só o que o administrador aprovou E escolheu publicar na galeria,
    do mais recente para o mais antigo (data da ação).

    Guarda o resultado por 60s: a galeria é pública e muito acessada,
    assim cada visita não vira uma consulta nova ao banco."""
    chave = f"{municipio_id or ''}|{ciclo_id or ''}"
    agora = time.time()
    em_cache = _CACHE_FEED.get(chave)
    if em_cache and em_cache[1] > agora:
        return em_cache[0]

    query = (
        db.table("documentos")
        .select(
            "id, municipio_id, tipo_id, escola_id, acao_pedagogica_id, subtipo, acao_evento, descricao, descricao_galeria, "
            "data_realizacao, drive_file_id, drive_file_link, link_externo, visualizacoes, curtidas, "
            "publicado_galeria_em, tipos_documento(nome), escolas(nome), acoes_pedagogicas(nome)"
        )
        .eq("status", "aprovado")
        .eq("na_galeria", True)
    )
    if ciclo_id:
        query = query.eq("ciclo_id", ciclo_id)
    if municipio_id:
        query = query.eq("municipio_id", municipio_id)
    else:
        query = query.limit(120)

    docs = query.order("data_realizacao", desc=True).order("publicado_galeria_em", desc=True).execute().data or []
    for doc in docs:
        # a galeria mostra o texto revisado pelo admin
        doc["descricao"] = doc.pop("descricao_galeria", None) or doc.get("descricao")
    if len(_CACHE_FEED) > 200:
        _CACHE_FEED.clear()
    _CACHE_FEED[chave] = (docs, agora + 60)
    return docs


_CACHE_GERAL = {}  # chave -> (valor, expira_em)


def _em_cache(chave, segundos, calcular):
    """Guarda o resultado por alguns segundos (a galeria é pública e muito acessada)."""
    agora = time.time()
    em_cache = _CACHE_GERAL.get(chave)
    if em_cache and em_cache[1] > agora:
        return em_cache[0]
    valor = calcular()
    _CACHE_GERAL[chave] = (valor, agora + segundos)
    return valor


def _galeria_ranking(db, ciclo_id=None):
    def montar():
        query = (
            db.table("documentos")
            .select("id, municipio_id")
            .eq("status", "aprovado")
            .eq("na_galeria", True)
        )
        if ciclo_id:
            query = query.eq("ciclo_id", ciclo_id)
        return query.order("id")

    docs = fetch_all(montar)
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
    ciclo_id = request.args.get("ciclo_id") or None

    if request.args.get("ciclos") == "1":
        # Ciclos (edições) para o seletor da galeria pública
        try:
            return jsonify(_em_cache("ciclos_galeria", 120, _ciclos_publicos))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    if request.args.get("municipios") == "1":
        # Só os municípios que já têm alguma publicação na galeria
        try:
            return jsonify(_em_cache(f"municipios_galeria|{ciclo_id}", 300, lambda: sorted(
                [{"id": r["municipio_id"], "nome": r["nome"], "publicacoes": r["total"]} for r in _galeria_ranking(get_client(), ciclo_id)],
                key=lambda m: m["nome"],
            )))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    if request.args.get("resumo") == "1":
        # Números gerais do topo da galeria
        try:
            def calcular():
                db = get_client()
                def montar_publicados():
                    query = (
                        db.table("documentos")
                        .select("id, municipio_id, visualizacoes")
                        .eq("status", "aprovado")
                        .eq("na_galeria", True)
                    )
                    if ciclo_id:
                        query = query.eq("ciclo_id", ciclo_id)
                    return query.order("id")

                publicados = fetch_all(montar_publicados)
                escolas = _em_cache(f"mapa_escolas|{ciclo_id}", 300, lambda: escolas_participantes_municipio(db, None, ciclo_id))
                municipios = {d["municipio_id"] for d in publicados} | {e["municipio_id"] for e in escolas if e.get("municipio_id")}
                return {
                    "municipios": len(municipios),
                    "escolas": len(escolas),
                    "publicacoes": len(publicados),
                    "visualizacoes": sum(d.get("visualizacoes") or 0 for d in publicados),
                }
            return jsonify(_em_cache(f"resumo_galeria|{ciclo_id}", 300, calcular))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    if request.args.get("mapa") == "1":
        # Escolas participantes do Ceará inteiro, para o mapa geral
        try:
            return jsonify(_em_cache(f"mapa_escolas|{ciclo_id}", 300, lambda: escolas_participantes_municipio(get_client(), None, ciclo_id)))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    municipio_id = request.args.get("municipio_id")

    if request.args.get("escolas") == "1":
        if not municipio_id:
            return jsonify({"error": "Parâmetro 'municipio_id' é obrigatório."}), 400
        try:
            return jsonify(escolas_participantes_municipio(get_client(), municipio_id, ciclo_id))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    if request.args.get("ranking") == "1":
        try:
            return jsonify(_galeria_ranking(get_client(), ciclo_id))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    if not municipio_id:
        try:
            db = get_client()
            return jsonify(_galeria_feed(db, None, ciclo_id))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    try:
        db = get_client()
        return jsonify(_galeria_feed(db, municipio_id, ciclo_id))
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
        # só publicações que estão na galeria podem receber curtida/visualização
        atual = (
            db.table("documentos").select(campo).eq("id", documento_id).eq("na_galeria", True).single().execute().data
        )
        novo_total = (atual.get(campo) or 0) + 1
        db.table("documentos").update({campo: novo_total}).eq("id", documento_id).execute()
        return jsonify({campo: novo_total})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _aquecer_escolas():
    """Busca a lista completa de escolas logo ao ligar o servidor (visão do administrador)."""
    try:
        db = get_client()

        def build_query(com_total=False):
            q = db.table("escolas").select(COLUNAS_ESCOLA, count="exact") if com_total else db.table("escolas").select(COLUNAS_ESCOLA)
            return q.order("nome").order("id")

        _CACHE_ESCOLAS["|todos"] = (time.time(), fetch_all_paralelo(build_query))
        print(f"[escolas] lista pronta em memória ({len(_CACHE_ESCOLAS['|todos'][1])} escolas)")
    except Exception as erro:  # noqa: BLE001
        print(f"[escolas] não deu para aquecer o cache: {erro}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # com debug=True o Flask liga duas vezes; aquece só no processo que de fato atende
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
        threading.Thread(target=_aquecer_escolas, daemon=True).start()
    app.run(debug=True, port=port)
