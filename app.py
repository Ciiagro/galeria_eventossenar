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
import hashlib
import hmac
import secrets
import smtplib
import re
import time
import threading
import json
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, Response
from flask_cors import CORS

load_dotenv()

from lib.supabase_client import get_client, get_client_as_user, get_user_from_jwt
from lib.drive_client import upload_arquivo_privado, baixar_arquivo, apagar_arquivo, get_drive_service, upload_file, create_municipio_folder, get_or_create_subfolder, iniciar_upload_resumavel, enviar_pedaco_resumavel, liberar_link_publico, baixar_miniatura
from lib.video_compress import comprimir_video_se_necessario
from lib.email_client import enviar_email, email_configurado, montar_convite, montar_codigo, montar_concluido, montar_comunicado, url_base
from lib.termo_pdf import gerar_pdf_termo

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
# O sistema trabalha só com escolas da rede municipal (coluna escolas.tipo).
TIPO_ESCOLA_PAINEL = "Municipal"


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
# A tela "Equipe" também cadastra Administradores (acesso total, sem municípios definidos)
PAPEIS_EQUIPE = PAPEIS_APOIADOR + ("admin",)
ORIGEM_POR_PAPEL = {
    "admin": "admin",
    "municipio": "municipio",
    "apoiador_visitas": "visita",
    "apoiador_relatorios": "apoio_relatorios",
}
_CACHE_PERFIL = {}  # user_id -> (perfil, expira_em)
_CACHE_MUN_NOME = {}  # user.id -> ((nome, pendente), expira_em): evita 1-2 consultas por /api/perfil


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
    _CACHE_MUN_NOME.clear()
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

        # Nome do município para mostrar na barra lateral e nas telas. Coordenador que acabou de se
        # cadastrar ainda não tem município liberado (só depois da aprovação da adesão): usamos o
        # município escolhido no cadastro SÓ para exibir — o acesso continua dependendo da aprovação.
        municipio_nome, municipio_pendente = None, False
        em_cache = _CACHE_MUN_NOME.get(user.id)
        if em_cache and em_cache[1] > time.time():
            municipio_nome, municipio_pendente = em_cache[0]
        else:
            try:
                mid = perfil.get("municipio_id")
                if mid is None and perfil.get("role") == "municipio":
                    cad = get_client().table("coordenadores_cadastro").select("municipio_id").eq("user_id", user.id).limit(1).execute().data or []
                    mid = cad[0].get("municipio_id") if cad else None
                    municipio_pendente = mid is not None
                if mid is not None:
                    m = get_client().table("municipios").select("nome").eq("id", mid).limit(1).execute().data or []
                    municipio_nome = m[0]["nome"] if m else None
                if len(_CACHE_MUN_NOME) > 500:
                    _CACHE_MUN_NOME.clear()
                _CACHE_MUN_NOME[user.id] = ((municipio_nome, municipio_pendente), time.time() + 60)
            except Exception:  # noqa: BLE001 - só enfeite: nunca derruba o login
                municipio_nome, municipio_pendente = None, False

        return jsonify(
            {
                "role": perfil.get("role"),
                "municipio_id": perfil.get("municipio_id"),
                "municipio_nome": municipio_nome,
                "municipio_pendente": municipio_pendente,
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

        resultado = _separar_documentos(_montar_resumo(dados), ano, mes, ciclo_id)
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


def _separar_documentos(resultado, ano, mes, ciclo_id):
    """Tira "Documentos" (PDF: relatórios, ficha de frequência, portfólio) da lista de ações pedagógicas
    e devolve a contagem por tipo de documento em `por_documento` (respeita ciclo/ano/mês)."""
    try:
        db = get_client()
        grupos = db.table("acoes_pedagogicas").select("id, subtipos").eq("exige_pdf", True).eq("ativo", True).execute().data or []
        ids = [g["id"] for g in grupos]
        resultado["por_acao"] = [a for a in resultado.get("por_acao", []) if a.get("id") not in ids]
        resultado["por_documento"] = []
        if not ids:
            return resultado
        docs = fetch_all(lambda: db.table("documentos").select("id, subtipo, status, data_realizacao, ciclo_id").in_("acao_pedagogica_id", ids).order("id"))

        def no_periodo(d):
            data = d.get("data_realizacao") or ""
            if ciclo_id:
                if d.get("ciclo_id") != ciclo_id:
                    return False
            elif ano and data[:4] != str(ano):
                return False
            return not mes or data[5:7] == f"{mes:02d}"

        previstos = [t for g in grupos for t in (g.get("subtipos") or [])]
        contagem = {t: {"nome": t, "total": 0, "aprovados": 0} for t in previstos}
        for d in docs:
            if not no_periodo(d):
                continue
            nome = d.get("subtipo") or "Outros documentos"
            item = contagem.setdefault(nome, {"nome": nome, "total": 0, "aprovados": 0})
            item["total"] += 1
            if d.get("status") == "aprovado":
                item["aprovados"] += 1
        resultado["por_documento"] = list(contagem.values())
    except Exception as e:  # noqa: BLE001 - o painel funciona mesmo sem esse bloco
        print(f"[resumo] não consegui separar os documentos: {e}")
        resultado.setdefault("por_documento", [])
    return resultado


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
        lambda: db.table("escolas").select("id, municipio_id, nome, latitude, longitude").eq("tipo", TIPO_ESCOLA_PAINEL).order("id")
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
        return jsonify({"error": "Apenas administradores podem editar edições."}), 403

    body = request.get_json(force=True, silent=True) or {}
    ciclo_id = body.get("id")
    nome = (body.get("nome") or "").strip()
    inicio = (body.get("data_inicio") or "").strip()
    fim = (body.get("data_fim") or "").strip()
    ativo = bool(body.get("ativo"))

    if not nome or not inicio or not fim:
        return jsonify({"error": "Informe o nome, a data de início e a data de fim da edição."}), 400
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
            mensagem = "Já existe uma edição ativa. Tente de novo."
        return jsonify({"error": mensagem}), 500


@app.delete("/api/ciclos")
def excluir_ciclo():
    """Só exclui ciclos que ainda não têm nenhum documento."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem excluir edições."}), 403

    ciclo_id = request.args.get("id")
    if not ciclo_id:
        return jsonify({"error": "Parâmetro 'id' é obrigatório."}), 400
    try:
        db = get_client()
        usados = db.table("documentos").select("id", count="exact").eq("ciclo_id", ciclo_id).limit(1).execute()
        if (usados.count or 0) > 0:
            return jsonify({"error": "Esta edição já tem documentos e não pode ser excluída."}), 400
        db.table("ciclos").delete().eq("id", ciclo_id).execute()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# ESCOLAS DO PROGRAMA (nem todas participam: o admin marca por ciclo)
# ------------------------------------------------------------
def _ciclo_ativo_ou_recente():
    """Ciclo ativo; se não houver nenhum, o mais recente (None se não existir ciclo)."""
    db = get_client()
    linhas = db.table("ciclos").select("id").eq("ativo", True).limit(1).execute().data or []
    if not linhas:
        linhas = db.table("ciclos").select("id").order("data_inicio", desc=True).limit(1).execute().data or []
    return linhas[0]["id"] if linhas else None


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
        return _com_tentativas(lambda: db.table("escolas").select(colunas).eq("tipo", TIPO_ESCOLA_PAINEL).in_("id", parte).execute()).data or []

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
        e["id"] for e in fetch_all(lambda: db.table("escolas").select("id").eq("municipio_id", municipio_id).eq("tipo", TIPO_ESCOLA_PAINEL).order("id"))
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
        return jsonify({"error": "Escolha a edição."}), 400
    if not escola_ids:
        return jsonify({"error": "Nenhuma escola informada."}), 400
    if len(escola_ids) > 3000:
        return jsonify({"error": "Escolha no máximo 3000 escolas por vez."}), 400

    try:
        db = get_client()
        if not (db.table("ciclos").select("id").eq("id", ciclo_id).limit(1).execute().data or []):
            return jsonify({"error": "Edição não encontrada."}), 400

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
            query = query.eq("tipo", TIPO_ESCOLA_PAINEL)
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

        fila_analise = request.args.get("fila_analise") == "1"
        ids_docs = _ids_grupos_documentos(db) if fila_analise else []

        def montar_query(somente_documentos=False):
            query = db.table("documentos").select("*, tipos_documento(nome), escolas(nome, endereco), acoes_pedagogicas(nome, exige_pdf)")
            if somente_documentos:
                return query.in_("acao_pedagogica_id", ids_docs).order("created_at", desc=True).order("id")
            if municipio_id:
                query = query.eq("municipio_id", municipio_id)
            if ciclo_id:
                query = query.eq("ciclo_id", ciclo_id)
            if status:
                query = query.eq("status", status)
            elif fila_analise:
                # pendentes + os que o Apoiador de Relatórios já analisou: estes continuam na aba "Analisados"
                # mesmo depois de o administrador aprovar (antes sumiam da lista ao sair de "pendente")
                query = query.or_("status.eq.pendente,analise_status.not.is.null")
            if tipo_id:
                query = query.eq("tipo_id", tipo_id)
            return query.order("created_at", desc=True).order("id")

        docs = fetch_all(montar_query)
        if fila_analise and ids_docs:
            # a fila do Apoiador de Relatórios inclui também os Documentos (PDF), que entram já "recebidos"
            vistos = {d["id"] for d in docs}
            docs += [d for d in fetch_all(lambda: montar_query(True)) if d["id"] not in vistos]

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
    if perfil_envio.get("role") == "apoiador_relatorios":
        return jsonify({"error": "O Apoiador de Relatórios analisa os documentos enviados; quem envia são o coordenador e o apoiador de visitas."}), 403
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

    eh_documento = False  # Documentos (PDF) não passam por aprovação: só ações pedagógicas (podem ir à galeria)
    try:
        db = get_db(jwt)
        if acao_id:
            acao = db.table("acoes_pedagogicas").select("nome, exige_pdf, subtipos").eq("id", acao_id).limit(1).execute().data
            if not acao:
                return jsonify({"error": "Ação pedagógica não encontrada."}), 400
            acao = acao[0]
            eh_documento = bool(acao.get("exige_pdf"))
            # PDF é só para Documentos; as ações pedagógicas usam Vídeo ou Imagem
            tipo_linha = db.table("tipos_documento").select("nome").eq("id", body["tipo_id"]).limit(1).execute().data or []
            tipo_nome = (tipo_linha[0]["nome"] if tipo_linha else "").strip().lower()
            if acao.get("exige_pdf") and tipo_nome != "pdf":
                return jsonify({"error": "Documentos (relatórios, ficha de frequência e portfólio) são enviados em PDF."}), 400
            if not acao.get("exige_pdf") and tipo_nome == "pdf":
                return jsonify({"error": f"A ação {acao['nome']} aceita só vídeo ou imagem. PDF é só para Documentos."}), 400
            if acao.get("subtipos"):
                if subtipo not in acao["subtipos"]:
                    return jsonify({"error": f"Escolha o tipo de documento: {', '.join(acao['subtipos'])}."}), 400
            else:
                subtipo = None
        else:
            subtipo = None
        # toda ação e todo documento se refere a uma escola do programa (não existe "não se aplica")
        if not body.get("escola_id"):
            return jsonify({"error": "Escolha a escola do programa a que este envio se refere."}), 400
        if body.get("escola_id"):
            ciclo_do_envio = body.get("ciclo_id") or _ciclo_ativo_id(db)
            if ciclo_do_envio:
                participa = db.table("escolas_ciclos").select("escola_id").eq("escola_id", body["escola_id"]).eq("ciclo_id", ciclo_do_envio).limit(1).execute().data
                if not participa:
                    return jsonify({"error": "Esta escola não faz parte do programa nesta edição. Peça ao administrador para incluí-la."}), 400
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
        if eh_documento and created:
            # Documento não precisa de aprovação do administrador: já entra como recebido (aprovado)
            try:
                atualizado = (
                    get_client().table("documentos")
                    .update({"status": "aprovado", "validado_em": datetime.now(timezone.utc).isoformat()})
                    .eq("id", created[0]["id"]).execute().data
                )
                created = atualizado or created
            except Exception as erro_status:  # noqa: BLE001 - se falhar, fica pendente e o admin ainda enxerga
                print(f"[documentos] não consegui marcar o documento como recebido: {erro_status}")
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
            .select("id, drive_file_id, status, acao_pedagogica_id")
            .eq("id", documento_id)
            .eq("responsavel_envio_id", user.id)
            .limit(1)
            .execute()
            .data
        )
        if not documento:
            return jsonify({"error": "Documento não encontrado ou sem permissão para excluir."}), 404
        # Ação pedagógica só pode ser excluída enquanto está pendente; Documentos (sem aprovação) a qualquer momento
        if documento[0].get("status") != "pendente":
            grupo = (
                db.table("acoes_pedagogicas").select("exige_pdf").eq("id", documento[0].get("acao_pedagogica_id")).limit(1).execute().data
                if documento[0].get("acao_pedagogica_id") else []
            )
            if not (grupo and grupo[0].get("exige_pdf")):
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


@app.get("/api/analise/pendentes")
def contar_para_analisar():
    """Quantos documentos aguardam análise (pendentes, sem parecer e não arquivados). Chamada leve, usada
    pelo contador do menu do Apoiador de Relatórios."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    perfil = carregar_perfil(user)
    if perfil.get("role") not in ("admin", "apoiador_relatorios"):
        return jsonify({"error": "Sem permissão."}), 403
    try:
        db = get_client()
        total = (
            db.table("documentos").select("id", count="exact")
            .eq("status", "pendente").eq("arquivado", False).is_("analise_status", "null")
            .limit(1).execute().count or 0
        )
        ids_docs = _ids_grupos_documentos(db)
        if ids_docs:  # Documentos (PDF) também são analisados, mesmo entrando já como "recebidos"
            total += (
                db.table("documentos").select("id", count="exact")
                .in_("acao_pedagogica_id", ids_docs).neq("status", "pendente")
                .eq("arquivado", False).is_("analise_status", "null")
                .limit(1).execute().count or 0
            )
        return jsonify({"para_analisar": total})
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.post("/api/analise/arquivar")
def arquivar_na_analise():
    """O Apoiador de Relatórios (e o admin) tira da fila um documento PENDENTE (duplicado, enviado por engano...)
    ou o devolve para a fila. Não aprova nada: o admin continua vendo o documento na aba Arquivados
    do Painel de Aprovação e pode desarquivar."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    perfil = carregar_perfil(user)
    if perfil.get("role") not in ("admin", "apoiador_relatorios"):
        return jsonify({"error": "Apenas o Apoiador de Relatórios e o administrador podem arquivar na análise."}), 403

    body = request.get_json(force=True, silent=True) or {}
    documento_id = body.get("documento_id")
    arquivar = bool(body.get("arquivado", True))
    if not documento_id:
        return jsonify({"error": "documento_id é obrigatório."}), 400
    try:
        db = get_client()
        doc = db.table("documentos").select("id, status, municipio_id, acao_pedagogica_id").eq("id", documento_id).limit(1).execute().data or []
        if not doc:
            return jsonify({"error": "Documento não encontrado."}), 404
        permitidos = perfil.get("municipios_ids")
        if permitidos is not None and doc[0].get("municipio_id") not in permitidos:
            return jsonify({"error": "Este documento é de um município em que você não atua."}), 403
        eh_documento = doc[0].get("acao_pedagogica_id") in _ids_grupos_documentos(db)
        if doc[0]["status"] != "pendente" and not eh_documento:
            return jsonify({"error": "Só ações pendentes (e os Documentos) podem ser arquivadas na análise."}), 400
        atualizado = (
            db.table("documentos")
            .update({"arquivado": arquivar, "arquivado_em": datetime.now(timezone.utc).isoformat() if arquivar else None})
            .eq("id", documento_id).execute().data
        )
        _municipios_cache.clear()
        _CACHE_RESUMO.clear()
        return jsonify(atualizado)
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


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
        doc = db.table("documentos").select("id, status, municipio_id, acao_pedagogica_id").eq("id", documento_id).limit(1).execute().data or []
        if not doc:
            return jsonify({"error": "Documento não encontrado."}), 404
        eh_documento = doc[0].get("acao_pedagogica_id") in _ids_grupos_documentos(db)
        # o Apoiador de Relatórios só analisa documentos dos municípios em que atua
        permitidos = perfil.get("municipios_ids")
        if permitidos is not None and doc[0].get("municipio_id") not in permitidos:
            return jsonify({"error": "Este documento é de um município em que você não atua."}), 403
        if doc[0]["status"] != "pendente" and not eh_documento:
            return jsonify({"error": "Só ações pendentes (e os Documentos) podem ser analisados."}), 400
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
            db.table("perfis").select("id, nome, role").in_("role", list(PAPEIS_EQUIPE)).order("nome").execute().data or []
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
    """Cria ou edita (com `id`) um Apoiador de Visitas, Apoiador de Relatórios ou Administrador."""
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

    if role not in PAPEIS_EQUIPE:
        return jsonify({"error": "Escolha o perfil: Apoiador de Visitas, Apoiador de Relatórios ou Administrador."}), 400
    if usuario_id and str(usuario_id) == str(user.id) and role != "admin":
        return jsonify({"error": "Você não pode tirar o seu próprio acesso de administrador."}), 400
    if not nome or not email:
        return jsonify({"error": "Nome e e-mail são obrigatórios."}), 400
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        return jsonify({"error": "Informe um e-mail válido."}), 400
    if senha and len(senha) < 6:
        return jsonify({"error": "A senha deve ter pelo menos 6 caracteres."}), 400
    if role == "admin":
        municipio_ids = []  # administrador enxerga todos os municípios
    try:
        municipio_ids = sorted({int(m) for m in municipio_ids})
    except (TypeError, ValueError):
        return jsonify({"error": "Municípios inválidos."}), 400
    if role != "admin" and not municipio_ids:
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
            if not existente or existente[0]["role"] not in PAPEIS_EQUIPE:
                return jsonify({"error": "Este usuário não faz parte da equipe."}), 404
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
    if str(usuario_id) == str(user.id):
        return jsonify({"error": "Você não pode excluir o seu próprio usuário."}), 400
    try:
        db = get_client()
        existente = db.table("perfis").select("role").eq("id", usuario_id).limit(1).execute().data or []
        if not existente or existente[0]["role"] not in PAPEIS_EQUIPE:
            return jsonify({"error": "Só é possível excluir a equipe (apoiadores e administradores) por aqui."}), 404
        db.auth.admin.delete_user(usuario_id)
        limpar_caches_perfil()
        return jsonify({"ok": True})
    except Exception as e:
        texto = str(e)
        if "foreign key" in texto.lower() or "violates" in texto.lower():
            texto = "Este usuário já enviou ou analisou documentos e não pode ser excluído."
        return jsonify({"error": texto}), 500


# Vídeos de divulgação do projeto (página "O projeto"): também podem ter a miniatura servida por aqui,
# mesmo sem fazerem parte de um documento. Mantenha igual à lista de src/lib/videosProjeto.ts.
_MINIATURAS_CONFERIDAS: set = set()  # arquivos que já sabemos que podem ter miniatura servida

IDS_VIDEOS_PROJETO = {
    "1jHMwOMX_UlYbloVgzhlcNR-8GcwlSsW2",  # Quixadá
    "1FaP6DR3nl9x4frkYf5gehAuFtWkRS63K",  # Russas
    "1jU0WqyiEE5gvuo8_-Cb_N-SaW0AZBKKX",  # Ubajara
    "1FaDvnq_BrrY8PvIHiXCuJ96Cw6iCVBfO",  # Visita técnica
    "191onjzFeDUvM9dcxKP6Srun7AZL_fIH_",  # Capacitação
}


@app.get("/api/miniatura/<file_id>")
def miniatura(file_id):
    """Miniatura de um arquivo do Drive para os cards (tag <img>).

    Passa pelo nosso servidor porque o link direto do Google só funciona se o
    arquivo estiver público e o navegador aceitar cookies do Google.
    Só serve arquivos que pertencem a algum documento do sistema ou aos vídeos de divulgação do projeto.
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
            existe = file_id in IDS_VIDEOS_PROJETO or file_id in _MINIATURAS_CONFERIDAS or (
                get_client().table("documentos").select("id").eq("drive_file_id", file_id).limit(1).execute().data
            )
            if not existe:
                return jsonify({"error": "Arquivo não encontrado."}), 404
            if len(_MINIATURAS_CONFERIDAS) > 5000:
                _MINIATURAS_CONFERIDAS.clear()
            _MINIATURAS_CONFERIDAS.add(file_id)
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


# Capa de links externos (TikTok e Vimeo) via oEmbed: gratuito, sem chave de API.
# Só consultamos os endereços fixos abaixo (o link da pessoa vai apenas como parâmetro), então não há risco de SSRF.
_OEMBED = {
    "tiktok.com": "https://www.tiktok.com/oembed?url=",
    "vm.tiktok.com": "https://www.tiktok.com/oembed?url=",
    "vt.tiktok.com": "https://www.tiktok.com/oembed?url=",
    "vimeo.com": "https://vimeo.com/api/oembed.json?url=",
}
_CACHE_CAPAS_LINK: dict = {}  # link -> (url_da_capa ou None, expira_em)


@app.get("/api/miniatura-link")
def miniatura_link():
    """Redireciona para a capa de um vídeo de TikTok/Vimeo (usado em <img src>).

    A URL da capa do TikTok expira, por isso não é gravada no banco: buscamos
    na hora e guardamos em memória por 1 hora.
    """
    from urllib.parse import urlparse, quote
    from urllib.request import Request, urlopen

    link = (request.args.get("url") or "").strip()
    if len(link) > 500:
        return Response(status=400)
    try:
        partes = urlparse(link)
        host = (partes.hostname or "").lower()
        host = host[4:] if host.startswith("www.") else host
        host = host[2:] if host.startswith("m.") else host
    except Exception:
        return Response(status=400)
    if partes.scheme not in ("http", "https") or host not in _OEMBED:
        return Response(status=400)

    agora = time.time()
    em_cache = _CACHE_CAPAS_LINK.get(link)
    if em_cache and em_cache[1] > agora:
        capa = em_cache[0]
    else:
        capa = None
        try:
            req = Request(_OEMBED[host] + quote(link, safe=""), headers={"User-Agent": "Mozilla/5.0 (PainelDivulgacao)"})
            with urlopen(req, timeout=6) as resp:
                dados = json.loads(resp.read(200_000).decode("utf-8", "replace"))
            capa = dados.get("thumbnail_url")
            if capa and not str(capa).startswith("https://"):
                capa = None
        except Exception as e:
            print(f"[miniatura-link] {link}: {e}")
        if len(_CACHE_CAPAS_LINK) > 500:
            _CACHE_CAPAS_LINK.clear()
        # sucesso vale 1 hora; falha é lembrada por 5 minutos para não insistir a cada abertura da tela
        _CACHE_CAPAS_LINK[link] = (capa, agora + (3600 if capa else 300))

    if not capa:
        return Response(status=404, headers={"Cache-Control": "public, max-age=300"})
    return Response(status=302, headers={"Location": capa, "Cache-Control": "public, max-age=3600"})


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
            .eq("tipo", TIPO_ESCOLA_PAINEL)
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


_TRAVAS_CACHE: dict = {}
_TRAVA_DAS_TRAVAS = threading.Lock()


def _em_cache(chave, segundos, calcular):
    """Guarda o resultado por alguns segundos (a galeria é pública e muito acessada).

    Se dois pedidos iguais chegam juntos (a galeria faz vários ao abrir), o segundo espera o primeiro
    terminar e reaproveita o resultado, em vez de refazer a mesma consulta pesada duas vezes."""
    agora = time.time()
    em_cache = _CACHE_GERAL.get(chave)
    if em_cache and em_cache[1] > agora:
        return em_cache[0]
    with _TRAVA_DAS_TRAVAS:
        trava = _TRAVAS_CACHE.setdefault(chave, threading.Lock())
    with trava:
        em_cache = _CACHE_GERAL.get(chave)
        if em_cache and em_cache[1] > time.time():
            return em_cache[0]
        valor = calcular()
        _CACHE_GERAL[chave] = (valor, time.time() + segundos)
        if len(_TRAVAS_CACHE) > 500:
            _TRAVAS_CACHE.clear()
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
    if ciclo_id == "ativo":
        # a galeria pede "o ciclo atual" sem esperar a lista de ciclos chegar
        ciclo_id = _em_cache("ciclo_ativo_galeria", 60, _ciclo_ativo_ou_recente)

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
            return jsonify(_em_cache(f"resumo_galeria|{ciclo_id}", 60, calcular))
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


def _atualizar_caches_galeria(db, documento_id, campo, novo_total):
    """Depois de contar uma visualização/curtida, acerta os caches desta instância para o número
    aparecer na hora (o resumo do topo ficava até 5 min parado). Em outras instâncias do servidor
    o resumo se acerta sozinho em até 60 s (validade do cache)."""
    try:
        alvo = str(documento_id)
        for docs, _expira in list(_CACHE_FEED.values()):
            for d in docs:
                if str(d.get("id")) == alvo:
                    d[campo] = novo_total
        if campo != "visualizacoes":
            return
        chaves = [c for c in list(_CACHE_GERAL) if c.startswith("resumo_galeria|")]
        if not chaves:
            return
        ciclo_doc = None
        if any(c.split("|", 1)[1] not in ("None", "") for c in chaves):  # só consulta se houver resumo de um ciclo específico
            linha = db.table("documentos").select("ciclo_id").eq("id", documento_id).limit(1).execute().data or []
            ciclo_doc = str(linha[0]["ciclo_id"]) if linha and linha[0].get("ciclo_id") else None
        for chave in chaves:
            em_cache = _CACHE_GERAL.get(chave)
            if not em_cache or not isinstance(em_cache[0], dict):
                continue
            ciclo_da_chave = chave.split("|", 1)[1]
            if ciclo_da_chave in ("None", "") or ciclo_da_chave == ciclo_doc:
                em_cache[0]["visualizacoes"] = (em_cache[0].get("visualizacoes") or 0) + 1
    except Exception as erro:  # noqa: BLE001
        print(f"[galeria] não consegui atualizar o cache: {erro}")


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
        novo_total = None
        try:
            # soma direto no banco, de uma vez (não perde contagem quando várias pessoas abrem juntas)
            novo_total = db.rpc("incrementar_contador_documento", {"p_id": str(documento_id), "p_campo": campo}).execute().data
        except Exception as erro_rpc:  # função ainda não criada no banco: usa o modo antigo
            print(f"[galeria] função incrementar_contador_documento indisponível ({erro_rpc}); usando modo antigo")
        if novo_total is None:
            # só publicações que estão na galeria podem receber curtida/visualização
            atual = (
                db.table("documentos").select(campo).eq("id", documento_id).eq("na_galeria", True).single().execute().data
            )
            novo_total = (atual.get(campo) or 0) + 1
            db.table("documentos").update({campo: novo_total}).eq("id", documento_id).execute()
        _atualizar_caches_galeria(db, documento_id, campo, int(novo_total))
        return jsonify({campo: int(novo_total)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# ADESÃO AO PROGRAMA
#   1) o coordenador se cadastra pelo link público (POST /api/cadastro-coordenador);
#   2) depois de entrar, escolhe o município e as escolas que vão participar e
#      preenche a ficha de adesão (GET/POST /api/adesao);
#   3) o administrador confere e aprova (GET /api/admin/adesoes, POST .../aprovar):
#      ao aprovar, o coordenador passa a ter acesso ao município e as escolas
#      escolhidas entram no programa do ciclo.
# Por enquanto não há envio de e-mail nem assinatura eletrônica.
# ------------------------------------------------------------
_CADASTROS_POR_IP: dict[str, list[float]] = {}


def _so_digitos(valor):
    return re.sub(r"\D", "", str(valor or ""))


def _cpf_valido(cpf):
    d = _so_digitos(cpf)
    if len(d) != 11 or d == d[0] * 11:
        return False
    for n in (9, 10):
        soma = sum(int(d[i]) * (n + 1 - i) for i in range(n))
        if (soma * 10) % 11 % 10 != int(d[n]):
            return False
    return True


def _texto(valor, limite=200):
    return " ".join(str(valor or "").split())[:limite] or None


def _inteiro(valor):
    try:
        return max(0, int(str(valor).strip() or 0))
    except (TypeError, ValueError):
        return 0


def _ip_da_requisicao():
    encaminhado = request.headers.get("X-Forwarded-For", "")
    return (encaminhado.split(",")[0].strip() if encaminhado else request.remote_addr) or "?"


def _excedeu_limite_cadastro(ip, maximo=8, janela=3600):
    """Freio simples contra cadastros em massa (por IP, em memória)."""
    agora = time.time()
    recentes = [t for t in _CADASTROS_POR_IP.get(ip, []) if agora - t < janela]
    if len(recentes) >= maximo:
        _CADASTROS_POR_IP[ip] = recentes
        return True
    recentes.append(agora)
    _CADASTROS_POR_IP[ip] = recentes
    if len(_CADASTROS_POR_IP) > 2000:
        _CADASTROS_POR_IP.clear()
    return False


@app.get("/api/cadastro/municipios")
def cadastro_municipios():
    """PÚBLICO: municípios para o coordenador escolher já no cadastro.
    Marca como 'ocupado' o que já tem coordenador aprovado e TIRA da lista o que já tem termo assinado."""
    try:
        def montar():
            db = get_client()
            municipios = db.table("municipios").select("id, nome").order("nome").execute().data or []
            com_coordenador = {
                r["municipio_id"]
                for r in (db.table("municipios_extra").select("municipio_id, responsavel_id").execute().data or [])
                if r.get("responsavel_id")
            }
            # Município com termo assinado (adesão enviada ou aprovada no ciclo ativo) não aceita nova adesão: sai da lista
            ciclo_id = _ciclo_ativo_id(db)
            com_termo = set()
            if ciclo_id:
                linhas = db.table("adesoes").select("municipio_id").eq("ciclo_id", ciclo_id).in_("status", ["enviada", "aprovada"]).execute().data or []
                com_termo = {l["municipio_id"] for l in linhas if l.get("municipio_id")}
            return [
                {"id": m["id"], "nome": m["nome"], "ocupado": m["id"] in com_coordenador}
                for m in municipios if m["id"] not in com_termo
            ]
        return jsonify(_em_cache("cadastro_municipios", 30, montar))
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.post("/api/cadastro-coordenador")
def cadastrar_coordenador():
    """Cadastro PÚBLICO do coordenador (link enviado às pessoas). Cria o login e o perfil
    'municipio' ainda SEM município: o município só é liberado quando o admin aprova a adesão."""
    body = request.get_json(force=True, silent=True) or {}
    if body.get("website"):  # campo-isca: pessoas não preenchem, robôs sim
        return jsonify({"ok": True}), 201
    if _excedeu_limite_cadastro(_ip_da_requisicao()):
        return jsonify({"error": "Muitas tentativas. Aguarde um pouco e tente de novo."}), 429

    nome = _texto(body.get("nome"), 150)
    email = (body.get("email") or "").strip().lower()
    senha = body.get("senha") or ""
    cpf = _so_digitos(body.get("cpf"))
    rg = _texto(body.get("rg"), 30)
    telefone1 = _texto(body.get("telefone1"), 20)
    telefone2 = _texto(body.get("telefone2"), 20)
    try:
        municipio_id = int(body.get("municipio_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "Escolha o município em que você vai atuar."}), 400

    if not nome or len(nome) < 3:
        return jsonify({"error": "Informe o seu nome completo."}), 400
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return jsonify({"error": "Informe um e-mail válido."}), 400
    if not _cpf_valido(cpf):
        return jsonify({"error": "CPF inválido. Confira os números."}), 400
    if not telefone1 or len(_so_digitos(telefone1)) < 10:
        return jsonify({"error": "Informe um telefone com DDD."}), 400
    if len(senha) < 6:
        return jsonify({"error": "A senha deve ter pelo menos 6 caracteres."}), 400

    uid = None
    db = get_client()
    try:
        if not (db.table("municipios").select("id").eq("id", municipio_id).limit(1).execute().data or []):
            return jsonify({"error": "Município não encontrado."}), 400
        ja_tem = db.table("municipios_extra").select("responsavel_id").eq("municipio_id", municipio_id).limit(1).execute().data or []
        if ja_tem and ja_tem[0].get("responsavel_id"):
            return jsonify({"error": "Este município já tem coordenador(a) cadastrado(a). Fale com o administrador."}), 409
        if (db.table("coordenadores_cadastro").select("user_id").eq("cpf", cpf).limit(1).execute().data or []):
            return jsonify({"error": "Já existe um cadastro com este CPF. Entre com o seu e-mail e senha."}), 409
        try:
            criado = db.auth.admin.create_user({
                "email": email,
                "password": senha,
                "email_confirm": True,  # sem envio de e-mail por enquanto
                "user_metadata": {"nome": nome},
            })
        except Exception as e:  # noqa: BLE001
            texto = str(e).lower()
            if "already" in texto or "registered" in texto or "exists" in texto:
                return jsonify({"error": "Este e-mail já está cadastrado. Entre com o seu e-mail e senha."}), 409
            raise
        uid = criado.user.id
        db.table("perfis").upsert(
            {"id": uid, "nome": nome, "role": "municipio", "municipio_id": None}, on_conflict="id"
        ).execute()
        db.table("coordenadores_cadastro").upsert(
            {"user_id": uid, "nome": nome, "cpf": cpf, "rg": rg, "telefone1": telefone1,
             "telefone2": telefone2, "email": email, "municipio_id": municipio_id},
            on_conflict="user_id",
        ).execute()
        limpar_caches_perfil()
        return jsonify({"ok": True}), 201
    except Exception as e:  # noqa: BLE001
        if uid:  # não deixa um login "pela metade"
            try:
                db.auth.admin.delete_user(uid)
            except Exception:  # noqa: BLE001
                pass
        return jsonify({"error": f"Não foi possível concluir o cadastro: {e}"}), 500


def _eh_coordenador(user):
    return DEV_SKIP_AUTH or carregar_perfil(user).get("role") == "municipio"


def _ids_grupos_documentos(db):
    """Ids da(s) linha(s) de ações_pedagogicas que são "Documentos" (PDF). Eles não passam por aprovação,
    mas o Apoiador de Relatórios analisa igual às ações."""
    return [a["id"] for a in (db.table("acoes_pedagogicas").select("id").eq("exige_pdf", True).execute().data or [])]


def _em_paralelo(*tarefas):
    """Roda consultas independentes ao mesmo tempo e devolve os resultados na mesma ordem.

    Cada consulta ocupa uma vaga do limite global (_VAGAS_PARALELO). Se algo falhar no modo
    paralelo (ex.: o erro de soquete do Windows), refaz uma a uma, que é mais calmo."""
    def rodar(tarefa):
        with _VAGAS_PARALELO:
            return _com_tentativas(tarefa)

    if len(tarefas) == 1:
        return [rodar(tarefas[0])]
    try:
        with ThreadPoolExecutor(max_workers=len(tarefas)) as pool:
            return list(pool.map(rodar, tarefas))
    except Exception as erro:  # noqa: BLE001
        print(f"[adesao] consultas em paralelo falharam ({erro}); repetindo uma a uma")
        return [tarefa() for tarefa in tarefas]


def _hash_conteudo_adesao(campos, municipio_id, itens):
    """Impressão digital dos dados que aparecem no termo (campos, município e escolas com números).
    Serve para saber se a ficha mudou depois de o termo ser assinado."""
    base = {
        "campos": {k: (campos.get(k) or None) for k in sorted(CAMPOS_ADESAO)},
        "municipio_id": int(municipio_id) if municipio_id else None,
        "escolas": sorted(
            [str(i["escola_id"]), int(i.get("quantidade_professores") or 0), int(i.get("matricula_infantil_3") or 0),
             int(i.get("matricula_infantil_4") or 0), int(i.get("matricula_infantil_5") or 0)]
            for i in itens
        ),
    }
    return hashlib.sha256(json.dumps(base, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def _info_termo_assinado(row, itens):
    """None se não há termo assinado; senão nome, data e se ainda vale para os dados atuais da ficha."""
    if not row.get("termo_assinado_drive_id"):
        return None
    atual = _hash_conteudo_adesao(row, row.get("municipio_id"), itens)
    return {"nome": row.get("termo_assinado_nome"), "em": row.get("termo_assinado_em"),
            "atualizado": atual == row.get("termo_assinado_hash")}


def _adesao_com_escolas(db, adesao, coord=None, ciclo_nome=None):
    """Anexa à adesão as escolas escolhidas (com nome) e os dados do município/coordenador.
    As consultas que não dependem umas das outras rodam ao mesmo tempo (a ficha abria devagar
    por esperar uma ida ao banco por vez)."""
    municipio_id = adesao.get("municipio_id")
    ciclo_id = adesao.get("ciclo_id")
    itens, m, c, ci = _em_paralelo(
        lambda: db.table("adesao_escolas").select("*").eq("adesao_id", adesao["id"]).execute().data or [],
        lambda: (db.table("municipios").select("id, nome").eq("id", municipio_id).limit(1).execute().data or []) if municipio_id else [],
        lambda: [] if coord is not None else (db.table("coordenadores_cadastro").select("*").eq("user_id", adesao["coordenador_id"]).limit(1).execute().data or []),
        lambda: [] if (ciclo_nome is not None or not ciclo_id) else (db.table("ciclos").select("nome").eq("id", ciclo_id).limit(1).execute().data or []),
    )
    nomes = {e["id"]: e for e in _escolas_por_ids(db, [i["escola_id"] for i in itens], "id, nome, tipo, endereco")}
    adesao["termo_assinado"] = _info_termo_assinado(adesao, itens)
    adesao.pop("termo_assinado_drive_id", None)
    adesao.pop("termo_assinado_hash", None)
    adesao["escolas"] = sorted(
        [{**i, "nome": (nomes.get(i["escola_id"]) or {}).get("nome", "—"),
          "tipo": (nomes.get(i["escola_id"]) or {}).get("tipo"),
          "endereco": (nomes.get(i["escola_id"]) or {}).get("endereco")} for i in itens],
        key=lambda x: (x["nome"] or "").lower(),
    )
    if municipio_id:
        adesao["municipio_nome"] = m[0]["nome"] if m else None
    if coord is not None:
        adesao["coordenador"] = coord  # o chamador já tinha buscado: poupa uma ida ao banco
    else:
        adesao["coordenador"] = c[0] if c else None
    if ciclo_nome is not None:
        adesao["ciclo_nome"] = ciclo_nome
    elif ciclo_id:
        adesao["ciclo_nome"] = ci[0]["nome"] if ci else None
    return adesao


@app.get("/api/adesao/municipios")
def adesao_municipios():
    """Municípios para escolher na ficha; tira da lista os que já têm adesão enviada/aprovada (termo assinado) de OUTRA pessoa."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    if not _eh_coordenador(user):
        return jsonify({"error": "Apenas coordenadores preenchem a ficha de adesão."}), 403
    try:
        db = get_client()
        municipios = _em_cache("adesao_municipios_base", 300, lambda: db.table("municipios").select("id, nome").order("nome").execute().data or [])
        ciclo_id = _ciclo_ativo_id(db)
        ocupados = set()
        if ciclo_id:
            linhas = (
                db.table("adesoes").select("municipio_id, coordenador_id")
                .eq("ciclo_id", ciclo_id).in_("status", ["enviada", "aprovada"]).execute().data or []
            )
            ocupados = {l["municipio_id"] for l in linhas if l["coordenador_id"] != getattr(user, "id", None)}
        # município com termo assinado de OUTRA pessoa sai da lista (o do próprio coordenador continua, para ele ver a escolha)
        return jsonify([{"id": m["id"], "nome": m["nome"], "ocupado": False} for m in municipios if m["id"] not in ocupados])
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.get("/api/adesao/escolas")
def adesao_escolas_do_municipio():
    """Escolas de um município, para o coordenador marcar as que vão participar."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    if not _eh_coordenador(user):
        return jsonify({"error": "Apenas coordenadores preenchem a ficha de adesão."}), 403
    municipio_id = request.args.get("municipio_id", type=int)
    try:
        db = get_client()
        # quem já tem município (liberado ou escolhido no cadastro) só vê as escolas dele
        fixo = carregar_perfil(user).get("municipio_id")
        if fixo is None and not DEV_SKIP_AUTH:
            cad = db.table("coordenadores_cadastro").select("municipio_id").eq("user_id", user.id).limit(1).execute().data or []
            fixo = cad[0].get("municipio_id") if cad else None
        if fixo is not None:
            municipio_id = int(fixo)
        if not municipio_id:
            return jsonify({"error": "Informe o município."}), 400
        escolas = _em_cache(
            f"adesao_escolas|{municipio_id}", 120,
            lambda: fetch_all(
                lambda: db.table("escolas").select("id, nome, tipo, endereco, latitude, longitude").eq("municipio_id", municipio_id).eq("tipo", TIPO_ESCOLA_PAINEL)
                .order("nome").order("id")
            ),
        )
        return jsonify(escolas)
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.put("/api/adesao/escola")
def adesao_atualizar_escola():
    """Coordenador corrige os dados de uma escola do SEU município enquanto monta a adesão.

    Serve também antes da aprovação (quando o município ainda não está no perfil e, por isso,
    o PUT /api/escolas, que depende da permissão do banco, não deixaria). A trava aqui é
    o município: só escolas do município escolhido no cadastro / já liberado.
    """
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    if not _eh_coordenador(user):
        return jsonify({"error": "Apenas coordenadores editam escolas pela ficha de adesão."}), 403

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
        db = get_client()
        fixo = carregar_perfil(user).get("municipio_id")
        if fixo is None and not DEV_SKIP_AUTH:
            cad = db.table("coordenadores_cadastro").select("municipio_id").eq("user_id", user.id).limit(1).execute().data or []
            fixo = cad[0].get("municipio_id") if cad else None
        if fixo is None and not DEV_SKIP_AUTH:
            return jsonify({"error": "Seu cadastro ainda não tem município."}), 403

        atual = db.table("escolas").select("municipio_id, nome").eq("id", escola_id).limit(1).execute().data or []
        if not atual or (fixo is not None and int(atual[0]["municipio_id"]) != int(fixo)):
            return jsonify({"error": "Escola não encontrada no seu município."}), 404

        if "nome" in payload and _norm_nome(atual[0]["nome"]) != _norm_nome(payload["nome"]):
            outras = fetch_all(lambda: db.table("escolas").select("id, nome").eq("municipio_id", atual[0]["municipio_id"]).order("id"))
            if any(o["id"] != escola_id and _norm_nome(o["nome"]) == _norm_nome(payload["nome"]) for o in outras):
                return jsonify({"error": "Já existe outra escola com esse nome neste município."}), 409

        atualizadas = db.table("escolas").update(payload).eq("id", escola_id).execute().data
        if not atualizadas:
            return jsonify({"error": "Escola não encontrada no seu município."}), 404
        _CACHE_ESCOLAS.clear()
        _CACHE_GERAL.clear()  # o mapa público usa latitude/longitude
        return jsonify(atualizadas[0])
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


TERMO_MAX_BYTES = 4 * 1024 * 1024  # limite de ~4,5 MB por requisição no Vercel


@app.post("/api/adesao/termo-assinado")
def enviar_termo_assinado():
    """O coordenador anexa o PDF do termo já assinado digitalmente (antes de enviar a adesão)."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    if not _eh_coordenador(user):
        return jsonify({"error": "Apenas coordenadores anexam o termo assinado."}), 403

    arquivo = request.files.get("file")
    if not arquivo:
        return jsonify({"error": "Escolha o arquivo PDF do termo assinado."}), 400
    conteudo = arquivo.read()
    if len(conteudo) > TERMO_MAX_BYTES:
        return jsonify({"error": "O arquivo passa de 4 MB. Gere o PDF assinado de novo, em tamanho menor."}), 413
    if not conteudo.startswith(b"%PDF"):
        return jsonify({"error": "Envie o termo em PDF."}), 400

    try:
        db = get_client()
        ciclo_id = _ciclo_ativo_id(db)
        linhas = (
            db.table("adesoes").select("*").eq("ciclo_id", ciclo_id).eq("coordenador_id", user.id).limit(1).execute().data or []
        ) if ciclo_id else []
        if not linhas:
            return jsonify({"error": "Salve a ficha antes de anexar o termo assinado."}), 400
        adesao = linhas[0]
        if adesao["status"] == "aprovada":
            return jsonify({"error": "Esta adesão já foi aprovada."}), 403
        if not adesao.get("municipio_id"):
            return jsonify({"error": "Escolha o município antes de anexar o termo."}), 400
        itens = db.table("adesao_escolas").select("*").eq("adesao_id", adesao["id"]).execute().data or []
        if not itens:
            return jsonify({"error": "Marque as escolas participantes antes de anexar o termo."}), 400

        mun = db.table("municipios").select("nome").eq("id", adesao["municipio_id"]).limit(1).execute().data or []
        nome_mun = mun[0]["nome"] if mun else str(adesao["municipio_id"])
        agora = datetime.now(timezone.utc)
        nome_arquivo = f"Termo de Adesão assinado - {nome_mun} - {agora.strftime('%Y-%m-%d %H-%M')}.pdf"

        service = get_drive_service()
        pasta_municipio = garantir_pasta_municipio(db, adesao["municipio_id"], service)
        pasta_termo = get_or_create_subfolder(service, pasta_municipio, "Termo de Adesão")
        novo_id = upload_arquivo_privado(service, pasta_termo, nome_arquivo, conteudo, "application/pdf")

        antigo = adesao.get("termo_assinado_drive_id")
        db.table("adesoes").update({
            "termo_assinado_drive_id": novo_id,
            "termo_assinado_nome": nome_arquivo,
            "termo_assinado_em": agora.isoformat(),
            "termo_assinado_hash": _hash_conteudo_adesao(adesao, adesao["municipio_id"], itens),
        }).eq("id", adesao["id"]).execute()
        if antigo:
            try:
                apagar_arquivo(service, antigo)
            except Exception as e:  # noqa: BLE001 - o arquivo antigo sobrando não atrapalha
                print(f"[termo] não consegui apagar o termo anterior {antigo}: {e}")
        return jsonify({"ok": True, "termo_assinado": {"nome": nome_arquivo, "em": agora.isoformat(), "atualizado": True}})
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.get("/api/adesao/termo-assinado")
def baixar_termo_assinado():
    """Abre o PDF assinado: o próprio coordenador (sem parâmetro) ou o admin (?id=<adesão>)."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    try:
        db = get_client()
        adesao_id = request.args.get("id")
        if adesao_id:
            if not require_admin(jwt, user):
                return jsonify({"error": "Apenas administradores."}), 403
            linhas = db.table("adesoes").select("termo_assinado_drive_id").eq("id", adesao_id).limit(1).execute().data or []
        else:
            if not _eh_coordenador(user):
                return jsonify({"error": "Apenas coordenadores."}), 403
            ciclo_id = _ciclo_ativo_id(db)
            linhas = (
                db.table("adesoes").select("termo_assinado_drive_id").eq("ciclo_id", ciclo_id).eq("coordenador_id", user.id).limit(1).execute().data or []
            ) if ciclo_id else []
        if not linhas or not linhas[0].get("termo_assinado_drive_id"):
            return jsonify({"error": "Nenhum termo assinado foi anexado."}), 404
        conteudo = baixar_arquivo(get_drive_service(), linhas[0]["termo_assinado_drive_id"])
        disposicao = "attachment" if request.args.get("baixar") else "inline"
        return Response(conteudo, mimetype="application/pdf", headers={
            "Content-Disposition": f'{disposicao}; filename="termo-de-adesao-assinado.pdf"',
            "Cache-Control": "private, no-store",
        })
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.get("/api/adesao")
def obter_adesao():
    """A adesão do coordenador logado no ciclo ativo (ou, para o admin, ?id=<adesão>)."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    try:
        db = get_client()
        adesao_id = request.args.get("id")
        if adesao_id:
            if not require_admin(jwt, user):
                return jsonify({"error": "Apenas administradores."}), 403
            linhas = db.table("adesoes").select("*").eq("id", adesao_id).limit(1).execute().data or []
            if not linhas:
                return jsonify({"error": "Adesão não encontrada."}), 404
            return jsonify({"adesao": _adesao_com_escolas(db, linhas[0])})

        if not _eh_coordenador(user):
            return jsonify({"error": "Apenas coordenadores preenchem a ficha de adesão."}), 403
        ciclos, cad, perfil = _em_paralelo(
            lambda: db.table("ciclos").select("id, nome").eq("ativo", True).limit(1).execute().data or [],
            lambda: db.table("coordenadores_cadastro").select("*").eq("user_id", user.id).limit(1).execute().data or [],
            lambda: carregar_perfil(user),
        )
        ciclo = ciclos[0] if ciclos else None
        coordenador = cad[0] if cad else {"nome": perfil.get("nome"), "email": getattr(user, "email", None)}
        adesao = None
        if ciclo:
            linhas = (
                db.table("adesoes").select("*").eq("ciclo_id", ciclo["id"]).eq("coordenador_id", user.id)
                .limit(1).execute().data or []
            )
            adesao = _adesao_com_escolas(db, linhas[0], coord=cad[0] if cad else None, ciclo_nome=ciclo["nome"]) if linhas else None
        return jsonify({
            "ciclo": ciclo,
            "coordenador": coordenador,
            "municipio_fixo": perfil.get("municipio_id") or coordenador.get("municipio_id"),
            "adesao": adesao,
        })
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


CAMPOS_ADESAO = {
    "prefeito_nome": 150, "prefeito_rg": 30, "prefeito_cpf": 20, "prefeitura_endereco": 200,
    "prefeitura_cep": 10, "prefeitura_telefone": 20, "prefeitura_email": 120,
    "secretario_nome": 150, "secretario_cpf": 20, "secretaria_endereco": 200,
    "secretaria_telefone": 20, "secretaria_email": 120, "responsavel_preenchimento": 150,
}


@app.post("/api/adesao")
def salvar_adesao():
    """Salva como rascunho (acao='rascunho') ou envia para aprovação (acao='enviar')."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    if not _eh_coordenador(user):
        return jsonify({"error": "Apenas coordenadores preenchem a ficha de adesão."}), 403

    body = request.get_json(force=True, silent=True) or {}
    enviar = body.get("acao") == "enviar"
    municipio_id = body.get("municipio_id")
    try:
        municipio_id = int(municipio_id) if municipio_id not in (None, "") else None
    except (TypeError, ValueError):
        return jsonify({"error": "Município inválido."}), 400
    campos = {k: _texto(body.get(k), lim) for k, lim in CAMPOS_ADESAO.items()}
    escolas_in = body.get("escolas") or []

    try:
        db = get_client()
        perfil = carregar_perfil(user)
        fixo = perfil.get("municipio_id")
        if fixo is None:
            cad_mun = db.table("coordenadores_cadastro").select("municipio_id").eq("user_id", user.id).limit(1).execute().data or []
            fixo = cad_mun[0].get("municipio_id") if cad_mun else None
        if fixo is not None:
            municipio_id = int(fixo)  # o município escolhido no cadastro é o da adesão

        ciclo_id = _ciclo_ativo_id(db)
        if not ciclo_id:
            return jsonify({"error": "Não há edição ativa no momento. Fale com o administrador."}), 400

        existente = (
            db.table("adesoes").select("id, status, termo_assinado_drive_id, termo_assinado_nome, termo_assinado_em, termo_assinado_hash").eq("ciclo_id", ciclo_id).eq("coordenador_id", user.id)
            .limit(1).execute().data or []
        )
        existente = existente[0] if existente else None
        if existente and existente["status"] == "aprovada":
            return jsonify({"error": "Esta adesão já foi aprovada. Para mudar algo, fale com o administrador."}), 403

        if municipio_id:
            if not (db.table("municipios").select("id").eq("id", municipio_id).limit(1).execute().data or []):
                return jsonify({"error": "Município não encontrado."}), 400
            outro = (
                db.table("adesoes").select("id").eq("ciclo_id", ciclo_id).eq("municipio_id", municipio_id)
                .in_("status", ["enviada", "aprovada"]).neq("coordenador_id", user.id).limit(1).execute().data or []
            )
            if outro:
                return jsonify({"error": "Este município já tem uma adesão enviada por outro coordenador."}), 409

        # escolas: só do município escolhido, sem repetir
        itens, vistos = [], set()
        for e in escolas_in:
            escola_id = e.get("escola_id")
            if not escola_id or escola_id in vistos:
                continue
            vistos.add(escola_id)
            itens.append({
                "escola_id": escola_id,
                "quantidade_professores": _inteiro(e.get("professores")),
                "matricula_infantil_3": _inteiro(e.get("infantil3")),
                "matricula_infantil_4": _inteiro(e.get("infantil4")),
                "matricula_infantil_5": _inteiro(e.get("infantil5")),
            })
        if itens:
            if not municipio_id:
                return jsonify({"error": "Escolha o município antes de marcar as escolas."}), 400
            validas = {x["id"] for x in _escolas_por_ids(db, [i["escola_id"] for i in itens], "id, municipio_id")
                       if x["municipio_id"] == municipio_id}
            if len(validas) != len(itens):
                return jsonify({"error": "Há escola marcada que não pertence ao município escolhido."}), 400

        if enviar:
            faltando = []
            if not municipio_id:
                faltando.append("município")
            for chave, rotulo in (("prefeito_nome", "nome do prefeito(a)"), ("secretario_nome", "nome do secretário(a) de educação"),
                                  ("responsavel_preenchimento", "responsável pelo preenchimento")):
                if not campos.get(chave):
                    faltando.append(rotulo)
            if not itens:
                faltando.append("pelo menos uma escola participante")
            if faltando:
                return jsonify({"error": "Para enviar, preencha: " + ", ".join(faltando) + "."}), 400
            for chave, rotulo in (("prefeito_cpf", "CPF do prefeito(a)"), ("secretario_cpf", "CPF do secretário(a)")):
                if campos.get(chave) and not _cpf_valido(campos[chave]):
                    return jsonify({"error": f"{rotulo} inválido."}), 400
            # o termo assinado (PDF) é obrigatório e precisa ser o desta versão da ficha
            if not (existente and existente.get("termo_assinado_drive_id")):
                return jsonify({"error": "Anexe o termo assinado (PDF) antes de enviar a adesão."}), 400
            if _hash_conteudo_adesao(campos, municipio_id, itens) != existente.get("termo_assinado_hash"):
                return jsonify({"error": "Os dados da ficha mudaram depois do termo assinado. Gere o termo de novo, assine e anexe o novo PDF."}), 400

        agora = datetime.now(timezone.utc).isoformat()
        dados = {
            **campos,
            "ciclo_id": ciclo_id,
            "coordenador_id": user.id,
            "municipio_id": municipio_id,
            "total_escolas_informado": len(itens),
            "total_professores_informado": sum(i["quantidade_professores"] for i in itens),
            "status": "enviada" if enviar else "rascunho",
            "updated_at": agora,
        }
        if enviar:
            dados["enviada_em"] = agora
            dados["observacao_admin"] = None  # o recado do admin só some quando o coordenador reenvia
        if existente:
            db.table("adesoes").update(dados).eq("id", existente["id"]).execute()
            adesao_id = existente["id"]
        else:
            adesao_id = db.table("adesoes").insert(dados).execute().data[0]["id"]

        db.table("adesao_escolas").delete().eq("adesao_id", adesao_id).execute()
        if itens:
            db.table("adesao_escolas").insert([{**i, "adesao_id": adesao_id} for i in itens]).execute()

        _CACHE_RESUMO.clear()
        _CACHE_GERAL.pop("cadastro_municipios", None)  # a lista pública de municípios depende das adesões enviadas
        termo = None
        if existente and existente.get("termo_assinado_drive_id"):
            termo = {"nome": existente.get("termo_assinado_nome"), "em": existente.get("termo_assinado_em"),
                     "atualizado": _hash_conteudo_adesao(campos, municipio_id, itens) == existente.get("termo_assinado_hash")}
        return jsonify({"ok": True, "id": adesao_id, "status": dados["status"], "termo_assinado": termo})
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# Assinatura do Termo de Adesão por e-mail
#
# O coordenador envia o termo para 3 pessoas (prefeito, presidente do sindicato, coordenador).
# Cada uma recebe um link único, pede um código de 6 dígitos (enviado ao mesmo e-mail) e assina.
# Com as 3 assinaturas, o PDF final é gerado, guardado no Drive e preenche termo_assinado_* da adesão.
# Tabelas: assinatura_pedidos e assinatura_signatarios (sql/migration_assinatura_email.sql).
# ------------------------------------------------------------
PAPEIS_ASSINATURA = {
    "prefeito": "Prefeito(a) Municipal",
    "secretario": "Secretário(a) de Educação",
    "sindicato": "Presidente do Sindicato Rural",
    "coordenador": "Coordenador(a) do Projeto",
}
ORDEM_PAPEIS = ["prefeito", "secretario", "sindicato", "coordenador"]


def _papeis_ativos():
    """Quem assina por e-mail neste momento. O coordenador sempre assina; prefeito e sindicato são liberados depois,
    sem mexer no código: ASSINATURA_PAPEIS=coordenador,prefeito,secretario,sindicato (no .env e no Vercel)."""
    pedidos = [x.strip().lower() for x in (os.environ.get("ASSINATURA_PAPEIS") or "coordenador").split(",")]
    ativos = [p for p in ORDEM_PAPEIS if p in pedidos or p == "coordenador"]
    return ativos


CODIGO_VALIDADE_MIN = 15
CODIGO_MAX_TENTATIVAS = 5
CODIGO_INTERVALO_S = 60


def _sha(texto):
    return hashlib.sha256(str(texto).encode("utf-8")).hexdigest()


def _email_valido(email):
    return bool(re.fullmatch(r"[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+", email or ""))


def _agora():
    return datetime.now(timezone.utc)


def _dt(valor):
    """Lê a data que o Supabase devolve (aceita frações de segundo de qualquer tamanho)."""
    if not valor:
        return None
    texto = re.sub(r"(\.\d{1,6})\d*", lambda m: m.group(1).ljust(7, "0"), str(valor).replace("Z", "+00:00"))
    try:
        return datetime.fromisoformat(texto)
    except ValueError:
        return None


def _mascarar_email(email):
    usuario, _, dominio = (email or "").partition("@")
    return f"{usuario[:1]}{'*' * max(len(usuario) - 1, 3)}@{dominio}"


def _link_base():
    return (os.environ.get("APP_URL") or request.headers.get("Origin") or request.host_url).rstrip("/")


def _adesao_do_coordenador(db, user):
    ciclo_id = _ciclo_ativo_id(db)
    if not ciclo_id:
        return None
    linhas = db.table("adesoes").select("*").eq("ciclo_id", ciclo_id).eq("coordenador_id", user.id).limit(1).execute().data or []
    return linhas[0] if linhas else None


def _snapshot_termo(db, adesao):
    """Cópia do termo como as pessoas vão ler e assinar (fica guardada no pedido)."""
    completo = _adesao_com_escolas(db, dict(adesao))
    snap = {k: completo.get(k) for k in list(CAMPOS_ADESAO) + ["municipio_nome", "ciclo_nome"]}
    c = completo.get("coordenador") or {}
    snap["coordenador"] = {k: c.get(k) for k in ("nome", "email", "rg", "cpf", "telefone1", "telefone2")}
    snap["escolas"] = [
        {k: e.get(k) for k in ("escola_id", "nome", "tipo", "endereco", "quantidade_professores",
                               "matricula_infantil_3", "matricula_infantil_4", "matricula_infantil_5")}
        for e in completo["escolas"]
    ]
    return snap


def _resumo_pedido(db, adesao, pedido):
    sigs = db.table("assinatura_signatarios").select("papel, nome, email, assinado_em, convite_enviado_em") \
        .eq("pedido_id", pedido["id"]).execute().data or []
    sigs.sort(key=lambda s: ORDEM_PAPEIS.index(s["papel"]) if s["papel"] in ORDEM_PAPEIS else 9)
    itens = db.table("adesao_escolas").select("*").eq("adesao_id", adesao["id"]).execute().data or []
    return {
        "id": pedido["id"],
        "status": pedido["status"],
        "criado_em": pedido["created_at"],
        "concluido_em": pedido.get("concluido_em"),
        "atualizado": _hash_conteudo_adesao(adesao, adesao.get("municipio_id"), itens) == pedido["hash_termo"],
        "todos_assinaram": bool(sigs) and all(s.get("assinado_em") for s in sigs),
        "signatarios": sigs,
    }


def _pedido_vigente(db, adesao_id):
    linhas = db.table("assinatura_pedidos").select("*").eq("adesao_id", adesao_id).in_("status", ["pendente", "concluido"]) \
        .order("created_at", desc=True).limit(1).execute().data or []
    return linhas[0] if linhas else None


def _motivo_falha_email(erro):
    """Explica em português por que o e-mail não saiu (para aparecer na tela, sem precisar olhar o terminal)."""
    if isinstance(erro, smtplib.SMTPAuthenticationError):
        return ("O Gmail recusou o login. Confira se SMTP_PASSWORD é a SENHA DE APP de 16 letras (não a senha normal) "
                "e se a verificação em duas etapas está ativa na conta que envia.")
    if isinstance(erro, smtplib.SMTPRecipientsRefused):
        return "O servidor recusou o endereço de destino."
    if isinstance(erro, (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, TimeoutError, ConnectionError, OSError)):
        return ("Não consegui conectar ao servidor de e-mail (smtp.gmail.com). Pode ser internet, firewall ou antivírus "
                "bloqueando a porta 465; tente SMTP_PORT=587.")
    if isinstance(erro, RuntimeError):
        return str(erro)
    return f"Erro do servidor de e-mail: {str(erro)[:200]}"


def _enviar_convite(sig, token, pedido, quem_enviou):
    snap = pedido["snapshot"]
    link = f"{_link_base()}/assinar?t={token}"
    assunto, texto, html = montar_convite(
        sig["nome"], PAPEIS_ASSINATURA[sig["papel"]], snap.get("municipio_nome") or "", snap.get("ciclo_nome") or "", link, quem_enviou,
    )
    enviar_email(sig["email"], assunto, texto, html)


@app.get("/api/adesao/assinaturas")
def assinatura_status():
    """Situação das assinaturas por e-mail da adesão do coordenador logado."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    if not _eh_coordenador(user):
        return jsonify({"error": "Apenas coordenadores."}), 403
    try:
        db = get_client()
        adesao = _adesao_do_coordenador(db, user)
        resposta = {"configurado": email_configurado(), "papeis_ativos": _papeis_ativos(), "pedido": None, "sugestoes": {}}
        if not adesao:
            return jsonify(resposta)
        pedido = _pedido_vigente(db, adesao["id"])
        if pedido:
            resposta["pedido"] = _resumo_pedido(db, adesao, pedido)
        # reaproveita o que já foi digitado numa rodada anterior (inclusive cancelada)
        ultimo = db.table("assinatura_pedidos").select("id").eq("adesao_id", adesao["id"]).order("created_at", desc=True).limit(1).execute().data or []
        if ultimo:
            antigos = db.table("assinatura_signatarios").select("papel, nome, email, cpf").eq("pedido_id", ultimo[0]["id"]).execute().data or []
            resposta["sugestoes"] = {s["papel"]: {"nome": s["nome"], "email": s["email"], "cpf": s.get("cpf")} for s in antigos}
        return jsonify(resposta)
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.post("/api/adesao/assinaturas/enviar")
def assinatura_enviar():
    """Cria um pedido de assinatura (cancelando o anterior pendente) e envia o convite aos 3 e-mails."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    if not _eh_coordenador(user):
        return jsonify({"error": "Apenas coordenadores enviam o termo para assinatura."}), 403
    if not email_configurado():
        return jsonify({"error": "O envio de e-mail ainda não foi configurado no sistema. Fale com o administrador."}), 503

    body = request.get_json(force=True, silent=True) or {}
    try:
        db = get_client()
        adesao = _adesao_do_coordenador(db, user)
        if not adesao:
            return jsonify({"error": "Salve a ficha antes de enviar o termo para assinatura."}), 400
        if adesao["status"] == "aprovada":
            return jsonify({"error": "Esta adesão já foi aprovada."}), 403
        if not adesao.get("municipio_id"):
            return jsonify({"error": "Escolha o município antes de enviar o termo para assinatura."}), 400
        ativos = _papeis_ativos()
        if "prefeito" in ativos and not adesao.get("prefeito_nome"):
            return jsonify({"error": "Preencha o nome do(a) prefeito(a) na ficha antes de enviar o termo."}), 400
        if "secretario" in ativos and not adesao.get("secretario_nome"):
            return jsonify({"error": "Preencha o nome do(a) secretário(a) de educação na ficha antes de enviar o termo."}), 400
        itens = db.table("adesao_escolas").select("*").eq("adesao_id", adesao["id"]).execute().data or []
        if not itens:
            return jsonify({"error": "Marque as escolas participantes antes de enviar o termo para assinatura."}), 400

        cad = db.table("coordenadores_cadastro").select("nome, email, cpf").eq("user_id", user.id).limit(1).execute().data or []
        coord_nome = (cad[0].get("nome") if cad else None) or carregar_perfil(user).get("nome") or "Coordenador(a)"
        coord_email = ((cad[0].get("email") if cad else None) or getattr(user, "email", "") or "").strip().lower()

        candidatos = {
            "prefeito": ("prefeito", adesao.get("prefeito_nome"), _texto(body.get("prefeito_email"), 120),
                         _so_digitos(adesao.get("prefeito_cpf"))),
            "secretario": ("secretario", adesao.get("secretario_nome"),
                           _texto(body.get("secretario_email"), 120) or adesao.get("secretaria_email"),
                           _so_digitos(adesao.get("secretario_cpf"))),
            "sindicato": ("sindicato", _texto(body.get("sindicato_nome"), 150), _texto(body.get("sindicato_email"), 120),
                          _so_digitos(body.get("sindicato_cpf"))),
            "coordenador": ("coordenador", coord_nome, coord_email, _so_digitos(cad[0].get("cpf") if cad else "")),
        }
        onde_corrigir = {
            "prefeito": "Corrija na aba Município e prefeitura da ficha.",
            "secretario": "Corrija na aba Secretaria de Educação da ficha.",
            "sindicato": "Informe o CPF do(a) presidente do sindicato.",
            "coordenador": "Corrija o CPF no cadastro do coordenador.",
        }
        previstos = [candidatos[p] for p in ativos]
        for papel, nome, email, cpf in previstos:
            rotulo = PAPEIS_ASSINATURA[papel]
            if not nome:
                return jsonify({"error": f"Informe o nome de: {rotulo}."}), 400
            if not _email_valido((email or "").lower()):
                return jsonify({"error": f"Informe um e-mail válido para: {rotulo}."}), 400
            if not _cpf_valido(cpf):
                return jsonify({"error": f"O CPF de {rotulo} está vazio ou inválido (ele precisa constar no termo). {onde_corrigir[papel]}"}), 400
        emails = [(e or "").lower() for _, _, e, _ in previstos]
        # dentro do mesmo termo (município) o e-mail não pode repetir; o mesmo e-mail pode ser usado em OUTRO município
        if len(set(emails)) != len(emails):
            return jsonify({"error": "Cada pessoa deste termo precisa de um e-mail diferente (o link e o código vão para o e-mail de quem assina). O mesmo e-mail pode ser usado em outro município."}), 400

        db.table("assinatura_pedidos").update({"status": "cancelado"}).eq("adesao_id", adesao["id"]).eq("status", "pendente").execute()
        pedido = db.table("assinatura_pedidos").insert({
            "adesao_id": adesao["id"],
            "hash_termo": _hash_conteudo_adesao(adesao, adesao["municipio_id"], itens),
            "snapshot": _snapshot_termo(db, adesao),
        }).execute().data[0]

        falhas = []
        for (papel, nome, _, cpf), email in zip(previstos, emails):
            token = secrets.token_urlsafe(32)
            sig = db.table("assinatura_signatarios").insert({
                "pedido_id": pedido["id"], "papel": papel, "nome": nome, "email": email, "cpf": cpf, "token_hash": _sha(token),
            }).execute().data[0]
            try:
                _enviar_convite(sig, token, pedido, coord_nome)
                db.table("assinatura_signatarios").update({"convite_enviado_em": _agora().isoformat()}).eq("id", sig["id"]).execute()
            except Exception as erro:  # noqa: BLE001
                print(f"[assinatura] falha ao enviar convite para {email}: {erro!r}")
                falhas.append({"papel": papel, "email": email, "motivo": _motivo_falha_email(erro)})
        if len(falhas) == len(previstos):
            db.table("assinatura_pedidos").update({"status": "cancelado"}).eq("id", pedido["id"]).execute()
            return jsonify({"error": "Não consegui enviar os e-mails. " + falhas[0]["motivo"]}), 502
        return jsonify({"ok": True, "falhas": falhas, "pedido": _resumo_pedido(db, adesao, pedido)})
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.post("/api/adesao/assinaturas/reenviar")
def assinatura_reenviar():
    """Reenvia o convite de quem ainda não assinou (novo link; o anterior deixa de valer). Pode corrigir o e-mail."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    if not _eh_coordenador(user):
        return jsonify({"error": "Apenas coordenadores."}), 403
    if not email_configurado():
        return jsonify({"error": "O envio de e-mail ainda não foi configurado no sistema."}), 503
    body = request.get_json(force=True, silent=True) or {}
    papel = body.get("papel")
    if papel not in PAPEIS_ASSINATURA:
        return jsonify({"error": "Escolha quem vai receber o e-mail."}), 400
    try:
        db = get_client()
        adesao = _adesao_do_coordenador(db, user)
        pedido = _pedido_vigente(db, adesao["id"]) if adesao else None
        if not pedido or pedido["status"] != "pendente":
            return jsonify({"error": "Não há pedido de assinatura em andamento."}), 404
        sig = (db.table("assinatura_signatarios").select("*").eq("pedido_id", pedido["id"]).eq("papel", papel).limit(1).execute().data or [None])[0]
        if not sig:
            return jsonify({"error": "Signatário não encontrado."}), 404
        if sig.get("assinado_em"):
            return jsonify({"error": "Esta pessoa já assinou."}), 409
        novo_email = (_texto(body.get("email"), 120) or sig["email"]).lower()
        if not _email_valido(novo_email):
            return jsonify({"error": "Informe um e-mail válido."}), 400
        outros = db.table("assinatura_signatarios").select("email").eq("pedido_id", pedido["id"]).neq("papel", papel).execute().data or []
        if novo_email in {o["email"].lower() for o in outros}:
            return jsonify({"error": "Outra pessoa deste termo já usa esse e-mail."}), 400
        token = secrets.token_urlsafe(32)
        atual = {**sig, "email": novo_email}
        db.table("assinatura_signatarios").update({
            "email": novo_email, "token_hash": _sha(token), "codigo_hash": None, "codigo_expira_em": None, "codigo_tentativas": 0,
        }).eq("id", sig["id"]).execute()
        cad = db.table("coordenadores_cadastro").select("nome").eq("user_id", user.id).limit(1).execute().data or []
        try:
            _enviar_convite(atual, token, pedido, (cad[0].get("nome") if cad else None) or "O(A) coordenador(a)")
        except Exception as erro:  # noqa: BLE001
            print(f"[assinatura] falha ao reenviar convite para {novo_email}: {erro!r}")
            return jsonify({"error": "Não consegui reenviar. " + _motivo_falha_email(erro)}), 502
        db.table("assinatura_signatarios").update({"convite_enviado_em": _agora().isoformat()}).eq("id", sig["id"]).execute()
        return jsonify({"ok": True, "pedido": _resumo_pedido(db, adesao, pedido)})
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": f"Não consegui reenviar: {e}"}), 500


@app.post("/api/adesao/assinaturas/cancelar")
def assinatura_cancelar():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    if not _eh_coordenador(user):
        return jsonify({"error": "Apenas coordenadores."}), 403
    try:
        db = get_client()
        adesao = _adesao_do_coordenador(db, user)
        if adesao:
            db.table("assinatura_pedidos").update({"status": "cancelado"}).eq("adesao_id", adesao["id"]).eq("status", "pendente").execute()
        return jsonify({"ok": True})
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.post("/api/adesao/assinaturas/finalizar")
def assinatura_finalizar():
    """Tenta de novo gerar o PDF/guardar no Drive quando as 3 assinaturas já existem mas a conclusão falhou."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    if not _eh_coordenador(user):
        return jsonify({"error": "Apenas coordenadores."}), 403
    try:
        db = get_client()
        adesao = _adesao_do_coordenador(db, user)
        pedido = _pedido_vigente(db, adesao["id"]) if adesao else None
        if not pedido:
            return jsonify({"error": "Não há pedido de assinatura."}), 404
        if pedido["status"] == "pendente":
            _concluir_pedido(db, pedido["id"])
        return jsonify({"ok": True, "pedido": _resumo_pedido(db, adesao, _pedido_vigente(db, adesao["id"]))})
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": f"Não consegui concluir: {e}"}), 500


def _concluir_pedido(db, pedido_id):
    """Quando as 3 pessoas assinaram: gera o PDF, guarda no Drive e atualiza a adesão. Só uma chamada vence."""
    agora = _agora()
    reivindicado = db.table("assinatura_pedidos").update({"status": "concluido", "concluido_em": agora.isoformat()}) \
        .eq("id", pedido_id).eq("status", "pendente").execute().data
    if not reivindicado:
        return False
    pedido = reivindicado[0]
    try:
        sigs = db.table("assinatura_signatarios").select("*").eq("pedido_id", pedido_id).execute().data or []
        if not sigs or not all(s.get("assinado_em") for s in sigs):
            raise RuntimeError("Faltam assinaturas.")
        snap = pedido["snapshot"]
        pdf = gerar_pdf_termo(snap, sigs, pedido["hash_termo"], pedido["id"])
        adesao = db.table("adesoes").select("*").eq("id", pedido["adesao_id"]).limit(1).execute().data[0]
        nome_mun = snap.get("municipio_nome") or str(adesao["municipio_id"])
        nome_arquivo = f"Termo de Adesão assinado - {nome_mun} - {agora.strftime('%Y-%m-%d %H-%M')}.pdf"

        service = get_drive_service()
        pasta_municipio = garantir_pasta_municipio(db, adesao["municipio_id"], service)
        pasta_termo = get_or_create_subfolder(service, pasta_municipio, "Termo de Adesão")
        novo_id = upload_arquivo_privado(service, pasta_termo, nome_arquivo, pdf, "application/pdf")

        antigo = adesao.get("termo_assinado_drive_id")
        db.table("adesoes").update({
            "termo_assinado_drive_id": novo_id,
            "termo_assinado_nome": nome_arquivo,
            "termo_assinado_em": agora.isoformat(),
            "termo_assinado_hash": pedido["hash_termo"],
        }).eq("id", adesao["id"]).execute()
        db.table("assinatura_pedidos").update({"pdf_drive_id": novo_id}).eq("id", pedido_id).execute()
        if antigo:
            try:
                apagar_arquivo(service, antigo)
            except Exception as e:  # noqa: BLE001
                print(f"[assinatura] não consegui apagar o termo anterior {antigo}: {e}")
    except Exception:
        # volta a "pendente": o coordenador pode tentar de novo (botão "Concluir")
        db.table("assinatura_pedidos").update({"status": "pendente", "concluido_em": None}).eq("id", pedido_id).execute()
        raise

    for s in sigs:  # aviso final com o PDF; se algum e-mail falhar, o termo já está guardado
        try:
            assunto, texto, html = montar_concluido(s["nome"], nome_mun)
            enviar_email(s["email"], assunto, texto, html, anexos=[(nome_arquivo, pdf, "application/pdf")])
        except Exception as erro:  # noqa: BLE001
            print(f"[assinatura] aviso final não enviado para {s['email']}: {erro}")
    _CACHE_RESUMO.clear()
    return True


# ---- páginas PÚBLICAS (quem assina não tem login; o link único é a credencial) ----
def _signatario_por_token(db, token):
    token = (token or "").strip()
    if not token or len(token) > 200:
        return None, None
    sigs = db.table("assinatura_signatarios").select("*").eq("token_hash", _sha(token)).limit(1).execute().data or []
    if not sigs:
        return None, None
    pedidos = db.table("assinatura_pedidos").select("*").eq("id", sigs[0]["pedido_id"]).limit(1).execute().data or []
    return sigs[0], (pedidos[0] if pedidos else None)


_ERRO_LINK = ({"error": "Link inválido ou expirado. Peça ao coordenador para reenviar o e-mail."}, 404)
_ERRO_CANCELADO = ({"error": "Este pedido de assinatura foi substituído ou cancelado. Use o e-mail mais recente que você recebeu ou peça um novo ao coordenador."}, 410)


@app.get("/api/assinar/info")
def assinar_info():
    try:
        db = get_client()
        sig, pedido = _signatario_por_token(db, request.args.get("t"))
        if not sig or not pedido:
            return jsonify(_ERRO_LINK[0]), _ERRO_LINK[1]
        if pedido["status"] == "cancelado":
            return jsonify(_ERRO_CANCELADO[0]), _ERRO_CANCELADO[1]
        todos = db.table("assinatura_signatarios").select("papel, nome, cpf, assinado_em").eq("pedido_id", pedido["id"]).execute().data or []
        todos = [{k: x.get(k) for k in ("papel", "nome", "cpf", "assinado_em")} for x in todos]
        for x in todos:
            x["cpf"] = x.get("cpf") or _cpf_do_papel(pedido["snapshot"], x["papel"]) or None
        todos.sort(key=lambda s: ORDEM_PAPEIS.index(s["papel"]) if s["papel"] in ORDEM_PAPEIS else 9)
        return jsonify({
            "papel": sig["papel"], "papel_rotulo": PAPEIS_ASSINATURA[sig["papel"]], "nome": sig["nome"],
            "email_mascarado": _mascarar_email(sig["email"]),
            "assinado_em": sig.get("assinado_em"), "pedido_status": pedido["status"],
            "termo": pedido["snapshot"], "assinaturas": todos,
        })
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.post("/api/assinar/codigo")
def assinar_pedir_codigo():
    """Envia um código de 6 dígitos para o e-mail de quem vai assinar."""
    body = request.get_json(force=True, silent=True) or {}
    try:
        db = get_client()
        sig, pedido = _signatario_por_token(db, body.get("t"))
        if not sig or not pedido:
            return jsonify(_ERRO_LINK[0]), _ERRO_LINK[1]
        if pedido["status"] == "cancelado":
            return jsonify(_ERRO_CANCELADO[0]), _ERRO_CANCELADO[1]
        if sig.get("assinado_em"):
            return jsonify({"error": "Você já assinou este termo."}), 409
        ultimo = _dt(sig.get("codigo_enviado_em"))
        if ultimo and (_agora() - ultimo).total_seconds() < CODIGO_INTERVALO_S:
            return jsonify({"error": "Aguarde um minuto antes de pedir outro código."}), 429
        codigo = f"{secrets.randbelow(10 ** 6):06d}"
        agora = _agora()
        db.table("assinatura_signatarios").update({
            "codigo_hash": _sha(f"{sig['token_hash']}:{codigo}"),
            "codigo_expira_em": (agora + timedelta(minutes=CODIGO_VALIDADE_MIN)).isoformat(),
            "codigo_tentativas": 0,
            "codigo_enviado_em": agora.isoformat(),
        }).eq("id", sig["id"]).execute()
        contexto = f"{(pedido.get('snapshot') or {}).get('municipio_nome') or ''} - {PAPEIS_ASSINATURA.get(sig['papel'], '')}".strip(" -")
        assunto, texto, html = montar_codigo(sig["nome"], codigo, contexto)
        try:
            enviar_email(sig["email"], assunto, texto, html)
        except Exception as erro:  # noqa: BLE001
            print(f"[assinatura] falha ao enviar código para {sig['email']}: {erro!r}")
            return jsonify({"error": "Não consegui enviar o código agora. Tente de novo em instantes."}), 502
        return jsonify({"ok": True, "email_mascarado": _mascarar_email(sig["email"]), "validade_minutos": CODIGO_VALIDADE_MIN})
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.post("/api/assinar/confirmar")
def assinar_confirmar():
    """Confere o código e registra a assinatura (data, hora, IP e navegador)."""
    body = request.get_json(force=True, silent=True) or {}
    codigo = _so_digitos(body.get("codigo"))
    try:
        db = get_client()
        sig, pedido = _signatario_por_token(db, body.get("t"))
        if not sig or not pedido:
            return jsonify(_ERRO_LINK[0]), _ERRO_LINK[1]
        if pedido["status"] == "cancelado":
            return jsonify(_ERRO_CANCELADO[0]), _ERRO_CANCELADO[1]
        if sig.get("assinado_em"):
            return jsonify({"error": "Você já assinou este termo."}), 409
        if body.get("aceito") is not True:
            return jsonify({"error": "Marque a declaração de que leu e concorda com o termo."}), 400
        if not sig.get("codigo_hash"):
            return jsonify({"error": "Peça o código de confirmação primeiro."}), 400
        if int(sig.get("codigo_tentativas") or 0) >= CODIGO_MAX_TENTATIVAS:
            return jsonify({"error": "Muitas tentativas erradas. Peça um novo código."}), 429
        expira = _dt(sig.get("codigo_expira_em"))
        if not expira or _agora() > expira:
            return jsonify({"error": "O código expirou. Peça um novo código."}), 400
        if not hmac.compare_digest(_sha(f"{sig['token_hash']}:{codigo}"), sig["codigo_hash"]):
            tentativas = int(sig.get("codigo_tentativas") or 0) + 1
            db.table("assinatura_signatarios").update({"codigo_tentativas": tentativas}).eq("id", sig["id"]).execute()
            restantes = CODIGO_MAX_TENTATIVAS - tentativas
            return jsonify({"error": "Código incorreto." + (f" Restam {restantes} tentativa(s)." if restantes > 0 else " Peça um novo código.")}), 400

        gravado = db.table("assinatura_signatarios").update({
            "assinado_em": _agora().isoformat(),
            "assinado_nome_digitado": sig["nome"],  # o nome já cadastrado para este signatário
            "ip": _ip_da_requisicao(),
            "user_agent": (request.headers.get("User-Agent") or "")[:300],
            "codigo_hash": None, "codigo_expira_em": None,
        }).eq("id", sig["id"]).is_("assinado_em", "null").execute().data
        if not gravado:
            return jsonify({"error": "Você já assinou este termo."}), 409

        todos = db.table("assinatura_signatarios").select("assinado_em").eq("pedido_id", pedido["id"]).execute().data or []
        concluido = False
        if todos and all(s.get("assinado_em") for s in todos):
            try:
                concluido = _concluir_pedido(db, pedido["id"])
            except Exception as erro:  # noqa: BLE001 - a assinatura já foi registrada; o coordenador pode concluir depois
                print(f"[assinatura] pedido {pedido['id']} assinado por todos, mas a conclusão falhou: {erro}")
        return jsonify({"ok": True, "concluido": concluido})
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


def _cpf_do_papel(snap, papel):
    """CPF de quem assina, tirado dos dados do termo (vale também para pedidos criados antes de o CPF ser gravado na assinatura)."""
    snap = snap or {}
    if papel == "prefeito":
        return _so_digitos(snap.get("prefeito_cpf"))
    if papel == "secretario":
        return _so_digitos(snap.get("secretario_cpf"))
    if papel == "coordenador":
        return _so_digitos((snap.get("coordenador") or {}).get("cpf"))
    return ""


def _resumo_assinaturas_por_adesao(db, adesao_ids):
    """Para o painel do admin: a rodada de assinatura mais recente (pendente ou concluída) de cada adesão."""
    if not adesao_ids:
        return {}
    try:
        ultimo = {}
        for i in range(0, len(adesao_ids), 60):  # em lotes, para a consulta não ficar grande demais
            lote = adesao_ids[i:i + 60]
            pedidos = db.table("assinatura_pedidos").select("id, adesao_id, status, created_at, concluido_em") \
                .in_("adesao_id", lote).in_("status", ["pendente", "concluido"]).order("created_at", desc=True).execute().data or []
            for p in pedidos:
                ultimo.setdefault(p["adesao_id"], p)
        if not ultimo:
            return {}
        ids_pedidos = [p["id"] for p in ultimo.values()]
        por_pedido = {}
        for i in range(0, len(ids_pedidos), 60):
            sigs = db.table("assinatura_signatarios").select("pedido_id, papel, nome, email, assinado_em") \
                .in_("pedido_id", ids_pedidos[i:i + 60]).execute().data or []
            for sg in sigs:
                por_pedido.setdefault(sg["pedido_id"], []).append(sg)
        saida = {}
        for adesao_id, p in ultimo.items():
            ss = sorted(por_pedido.get(p["id"], []), key=lambda x: ORDEM_PAPEIS.index(x["papel"]) if x["papel"] in ORDEM_PAPEIS else 9)
            ss = [{k: x.get(k) for k in ("papel", "nome", "email", "assinado_em")} for x in ss]
            saida[adesao_id] = {
                "pedido_id": p["id"], "status": p["status"], "criado_em": p["created_at"], "concluido_em": p.get("concluido_em"),
                "total": len(ss), "assinados": sum(1 for x in ss if x.get("assinado_em")), "signatarios": ss,
            }
        return saida
    except Exception as e:  # noqa: BLE001 - se as tabelas novas ainda não existem, a lista de adesões continua funcionando
        print(f"[assinatura] não consegui montar o resumo de assinaturas: {e}")
        return {}


@app.get("/api/admin/adesoes/assinatura")
def admin_ver_assinatura():
    """ADMIN: o termo exatamente como foi enviado para assinatura por e-mail, com quem já assinou."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores."}), 403
    adesao_id = request.args.get("id")
    if not adesao_id:
        return jsonify({"error": "Informe a adesão."}), 400
    try:
        db = get_client()
        pedido = _pedido_vigente(db, adesao_id)
        if not pedido:
            return jsonify({"error": "Esta adesão não foi enviada para assinatura por e-mail."}), 404
        sigs = db.table("assinatura_signatarios").select("papel, nome, email, cpf, assinado_em, assinado_nome_digitado, ip, convite_enviado_em") \
            .eq("pedido_id", pedido["id"]).execute().data or []
        sigs.sort(key=lambda x: ORDEM_PAPEIS.index(x["papel"]) if x["papel"] in ORDEM_PAPEIS else 9)
        publicos = ("papel", "nome", "email", "cpf", "assinado_em", "assinado_nome_digitado", "ip", "convite_enviado_em")
        sigs = [{k: x.get(k) for k in publicos} for x in sigs]  # nunca devolve hashes de link/código
        for x in sigs:
            x["cpf"] = x.get("cpf") or _cpf_do_papel(pedido["snapshot"], x["papel"]) or None
        adesao = (db.table("adesoes").select("*").eq("id", adesao_id).limit(1).execute().data or [None])[0]
        atualizado = None
        if adesao:
            itens = db.table("adesao_escolas").select("*").eq("adesao_id", adesao_id).execute().data or []
            atualizado = _hash_conteudo_adesao(adesao, adesao.get("municipio_id"), itens) == pedido["hash_termo"]
        return jsonify({
            "pedido": {"id": pedido["id"], "status": pedido["status"], "criado_em": pedido["created_at"],
                       "concluido_em": pedido.get("concluido_em"), "atualizado": atualizado},
            "termo": pedido["snapshot"],
            "assinaturas": sigs,
        })
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.get("/api/admin/adesoes")
def listar_adesoes_admin():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores."}), 403
    try:
        db = get_client()
        ciclo_id = request.args.get("ciclo_id") or _ciclo_ativo_id(db)
        query = db.table("adesoes").select("*").order("updated_at", desc=True)
        if ciclo_id:
            query = query.eq("ciclo_id", ciclo_id)
        adesoes = query.execute().data or []
        ids_mun = list({a["municipio_id"] for a in adesoes if a.get("municipio_id")})
        nomes_mun = {}
        if ids_mun:
            nomes_mun = {m["id"]: m["nome"] for m in db.table("municipios").select("id, nome").in_("id", ids_mun).execute().data or []}
        ids_coord = list({a["coordenador_id"] for a in adesoes})
        coords = {}
        if ids_coord:
            coords = {c["user_id"]: c for c in db.table("coordenadores_cadastro").select("user_id, nome, telefone1, email").in_("user_id", ids_coord).execute().data or []}
        assinaturas = _resumo_assinaturas_por_adesao(db, [a["id"] for a in adesoes])
        for a in adesoes:
            a["assinatura"] = assinaturas.get(a["id"])
            a["municipio_nome"] = nomes_mun.get(a.get("municipio_id"))
            c = coords.get(a["coordenador_id"]) or {}
            a["coordenador_nome"] = c.get("nome")
            a["coordenador_telefone"] = c.get("telefone1")
            a["coordenador_email"] = c.get("email")
        return jsonify(adesoes)
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.get("/api/admin/coordenadores-cadastros")
def listar_coordenadores_cadastrados():
    """Coordenadores que se cadastraram sozinhos em /adesao e ainda NÃO foram liberados.

    Aparecem na tela Coordenadores (aba "Aguardando"). Saem daqui quando o admin aprova
    a adesão deles (aí viram o Coordenador Geral do município). Traz a situação da ficha
    no ciclo ativo: sem ficha, rascunho ou enviada (com o id para abrir o termo).
    """
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores."}), 403
    try:
        db = get_client()
        cadastros = fetch_all(lambda: db.table("coordenadores_cadastro").select("*").order("created_at", desc=True).order("user_id"))
        liberados = {
            r["responsavel_id"]
            for r in (db.table("municipios_extra").select("responsavel_id").execute().data or [])
            if r.get("responsavel_id")
        }
        cadastros = [c for c in cadastros if c["user_id"] not in liberados]

        ids_mun = list({c["municipio_id"] for c in cadastros if c.get("municipio_id")})
        nomes_mun = {}
        if ids_mun:
            nomes_mun = {m["id"]: m["nome"] for m in db.table("municipios").select("id, nome").in_("id", ids_mun).execute().data or []}

        adesoes = {}
        ciclo_id = _ciclo_ativo_id(db)
        if ciclo_id and cadastros:
            linhas = db.table("adesoes").select("id, coordenador_id, status, enviada_em").eq("ciclo_id", ciclo_id).in_("coordenador_id", [c["user_id"] for c in cadastros]).execute().data or []
            adesoes = {l["coordenador_id"]: l for l in linhas}

        return jsonify([
            {
                "user_id": c["user_id"],
                "nome": c.get("nome"),
                "email": c.get("email"),
                "cpf": c.get("cpf"),
                "telefone1": c.get("telefone1"),
                "telefone2": c.get("telefone2"),
                "municipio_id": c.get("municipio_id"),
                "municipio_nome": nomes_mun.get(c.get("municipio_id")),
                "cadastrado_em": c.get("created_at"),
                "adesao_id": (adesoes.get(c["user_id"]) or {}).get("id"),
                "adesao_status": (adesoes.get(c["user_id"]) or {}).get("status") or "sem_ficha",
                "adesao_enviada_em": (adesoes.get(c["user_id"]) or {}).get("enviada_em"),
            }
            for c in cadastros
        ])
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.post("/api/admin/adesoes/aprovar")
def aprovar_adesao():
    """Aprova: liga o coordenador ao município e coloca as escolas escolhidas no programa do ciclo."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores."}), 403
    body = request.get_json(force=True, silent=True) or {}
    try:
        db = get_client()
        linhas = db.table("adesoes").select("*").eq("id", body.get("id")).limit(1).execute().data or []
        if not linhas:
            return jsonify({"error": "Adesão não encontrada."}), 404
        adesao = linhas[0]
        if adesao["status"] not in ("enviada", "aprovada"):
            return jsonify({"error": "Só dá para aprovar uma adesão que já foi enviada."}), 400
        if not adesao.get("municipio_id"):
            return jsonify({"error": "A adesão está sem município."}), 400

        extra = db.table("municipios_extra").select("responsavel_id, responsavel_nome").eq("municipio_id", adesao["municipio_id"]).limit(1).execute().data or []
        atual = extra[0].get("responsavel_id") if extra else None
        if atual and atual != adesao["coordenador_id"]:
            return jsonify({"error": f"Este município já tem outro coordenador ({extra[0].get('responsavel_nome') or 'sem nome'}). Remova-o em Coordenadores antes de aprovar."}), 409

        itens = db.table("adesao_escolas").select("escola_id").eq("adesao_id", adesao["id"]).execute().data or []
        for i in range(0, len(itens), 100):
            db.table("escolas_ciclos").upsert(
                [{"escola_id": x["escola_id"], "ciclo_id": adesao["ciclo_id"]} for x in itens[i:i + 100]],
                on_conflict="escola_id,ciclo_id", ignore_duplicates=True,
            ).execute()

        cad = db.table("coordenadores_cadastro").select("nome, email").eq("user_id", adesao["coordenador_id"]).limit(1).execute().data or []
        cad = cad[0] if cad else {}
        db.table("perfis").update({"municipio_id": adesao["municipio_id"]}).eq("id", adesao["coordenador_id"]).execute()
        db.table("municipios_extra").upsert(
            {"municipio_id": adesao["municipio_id"], "responsavel_id": adesao["coordenador_id"],
             "responsavel_nome": cad.get("nome"), "responsavel_email": cad.get("email")},
            on_conflict="municipio_id",
        ).execute()
        db.table("adesoes").update({
            "status": "aprovada", "aprovada_em": datetime.now(timezone.utc).isoformat(),
            "aprovada_por": getattr(user, "id", None), "observacao_admin": None,
        }).eq("id", adesao["id"]).execute()
        try:
            garantir_pasta_municipio(db, adesao["municipio_id"])
        except Exception as drive_error:  # noqa: BLE001
            print(f"[drive] Não consegui criar a pasta do município {adesao['municipio_id']}: {drive_error}")

        limpar_caches_perfil()
        _CACHE_GERAL.pop("cadastro_municipios", None)
        _CACHE_ESCOLAS.clear()
        _CACHE_GERAL.clear()
        return jsonify({"ok": True, "escolas_no_programa": len(itens)})
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.post("/api/admin/adesoes/devolver")
def devolver_adesao():
    """Devolve para o coordenador corrigir (volta a rascunho, com um recado)."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores."}), 403
    body = request.get_json(force=True, silent=True) or {}
    try:
        db = get_client()
        linhas = db.table("adesoes").select("id, status").eq("id", body.get("id")).limit(1).execute().data or []
        if not linhas:
            return jsonify({"error": "Adesão não encontrada."}), 404
        if linhas[0]["status"] != "enviada":
            return jsonify({"error": "Só dá para devolver uma adesão que está aguardando aprovação."}), 400
        recado = _texto(body.get("observacao"), 500)
        if not recado:
            return jsonify({"error": "Escreva o que o coordenador precisa corrigir."}), 400
        db.table("adesoes").update({
            "status": "rascunho", "observacao_admin": recado,
        }).eq("id", linhas[0]["id"]).execute()
        _CACHE_GERAL.pop("cadastro_municipios", None)  # o município volta a ficar disponível
        return jsonify({"ok": True})
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500



def _aquecer_escolas():
    """Busca a lista completa de escolas logo ao ligar o servidor (visão do administrador)."""
    try:
        db = get_client()

        def build_query(com_total=False):
            q = db.table("escolas").select(COLUNAS_ESCOLA, count="exact") if com_total else db.table("escolas").select(COLUNAS_ESCOLA)
            return q.eq("tipo", TIPO_ESCOLA_PAINEL).order("nome").order("id")

        _CACHE_ESCOLAS["|todos"] = (time.time(), fetch_all_paralelo(build_query))
        print(f"[escolas] lista pronta em memória ({len(_CACHE_ESCOLAS['|todos'][1])} escolas)")
    except Exception as erro:  # noqa: BLE001
        print(f"[escolas] não deu para aquecer o cache: {erro}")


# ------------------------------------------------------------
# CANAL DE COMUNICAÇÃO
# O administrador envia comunicados (avisos) para um ou mais públicos:
#   - Coordenadores e equipe de apoio: recebem DENTRO do sistema (têm login, com "Novo" e controle de leitura)
#     e TAMBÉM por e-mail;
#   - Secretários de educação: NÃO têm login (são contatos da ficha de adesão), então recebem SÓ por e-mail.
# Tabelas em sql/migration_comunicados.sql. Só o servidor acessa essas tabelas:
# aqui conferimos o perfil de quem está logado antes de qualquer coisa.
# ------------------------------------------------------------
_COLUNA_DO_PAPEL = {  # que "caixinha" do comunicado cada perfil precisa ter para enxergá-lo no sistema
    "municipio": "para_coordenadores",
    "apoiador_visitas": "para_apoiadores",
    "apoiador_relatorios": "para_apoiadores",
}
_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_EMAIL_COMUNICADO_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_COLUNAS_COMUNICADO = (
    "id, titulo, mensagem, link, para_coordenadores, para_apoiadores, para_secretarios, "
    "fixado, criado_por_nome, criado_em, atualizado_em"
)
_LOTE_EMAILS = 8  # e-mails por chamada: o servidor da Vercel tem limite de 60 s; a tela chama de novo até acabar
_ROTULO_TIPO_EMAIL = {"coordenador": "Coordenador(a)", "apoiador": "Apoiador(a)", "secretario": "Secretário(a) de Educação"}


def _alcance(role):
    """(eh_admin, coluna). `coluna` = o que o comunicado precisa ter marcado para este perfil ver; None = não recebe nada."""
    if role == "admin":
        return True, None
    return False, _COLUNA_DO_PAPEL.get(role)


def _comunicados_visiveis(db, role, colunas, limite=100):
    eh_admin, coluna = _alcance(role)
    if not eh_admin and not coluna:
        return []
    consulta = db.table("comunicados").select(colunas).eq("arquivado", False)
    if coluna:
        consulta = consulta.eq(coluna, True)
    return consulta.order("fixado", desc=True).order("criado_em", desc=True).limit(limite).execute().data or []


def _ids_lidos(db, usuario_id, ids):
    if not ids or not usuario_id:
        return set()
    linhas = (
        db.table("comunicados_leituras").select("comunicado_id")
        .eq("usuario_id", usuario_id).in_("comunicado_id", ids).execute().data or []
    )
    return {r["comunicado_id"] for r in linhas}


def _contar_perfis(db, roles):
    resposta = db.table("perfis").select("id", count="exact").in_("role", list(roles)).limit(1).execute()
    return int(resposta.count or 0)


def _roles_do_comunicado(c):
    """Perfis que recebem o comunicado DENTRO do sistema (secretários recebem só por e-mail)."""
    roles = []
    if c.get("para_coordenadores"):
        roles.append("municipio")
    if c.get("para_apoiadores"):
        roles.extend(PAPEIS_APOIADOR)
    return roles


def _validar_comunicado(body):
    """Confere os campos enviados pelo administrador. Devolve (campos, None) ou (None, mensagem de erro)."""
    titulo = (body.get("titulo") or "").strip()
    mensagem = (body.get("mensagem") or "").strip()
    link = (body.get("link") or "").strip() or None
    para_coord = bool(body.get("para_coordenadores"))
    para_apoio = bool(body.get("para_apoiadores"))
    para_secr = bool(body.get("para_secretarios"))
    if not titulo:
        return None, "Escreva o título do comunicado."
    if len(titulo) > 150:
        return None, "O título pode ter no máximo 150 caracteres."
    if not mensagem:
        return None, "Escreva a mensagem do comunicado."
    if len(mensagem) > 5000:
        return None, "A mensagem pode ter no máximo 5000 caracteres."
    if not (para_coord or para_apoio or para_secr):
        return None, "Escolha para quem o comunicado será enviado (coordenadores, equipe de apoio, secretários ou mais de um)."
    if link and not re.match(r"^https?://\S+$", link):
        return None, "O link precisa começar com http:// ou https:// (ou deixe o campo vazio)."
    return {
        "titulo": titulo, "mensagem": mensagem, "link": link, "fixado": bool(body.get("fixado")),
        "para_coordenadores": para_coord, "para_apoiadores": para_apoio, "para_secretarios": para_secr,
    }, None


def _emails_dos_usuarios(db, ids):
    """E-mail de login de cada usuário (id -> e-mail). Lê a lista do Supabase Auth em páginas, de uma vez só."""
    alvo = set(ids)
    achados = {}
    pagina = 1
    while alvo - set(achados) and pagina <= 20:
        usuarios = db.auth.admin.list_users(page=pagina, per_page=1000) or []
        for u in usuarios:
            email = (getattr(u, "email", None) or "").strip().lower()
            if u.id in alvo and email:
                achados[u.id] = email
        if len(usuarios) < 1000:
            break
        pagina += 1
    return achados


def _perfis_destinatarios(db, roles, tipo):
    """Pessoas com login (coordenadores ou equipe de apoio) com e-mail válido. Devolve (lista, sem_email)."""
    pessoas = db.table("perfis").select("id, nome, role, municipio_id").in_("role", list(roles)).limit(1000).execute().data or []
    emails = _emails_dos_usuarios(db, [p["id"] for p in pessoas])
    lista, sem_email = [], 0
    for p in pessoas:
        email = emails.get(p["id"])
        if not email or not _EMAIL_COMUNICADO_RE.match(email):
            sem_email += 1
            continue
        lista.append({
            "tipo": tipo, "usuario_id": p["id"], "municipio_id": p.get("municipio_id"),
            "nome": (p.get("nome") or "").strip() or _ROTULO_TIPO_EMAIL[tipo], "email": email,
        })
    return lista, sem_email


def _secretarios_destinatarios(db):
    """Secretários(as) de educação com e-mail válido na ficha de adesão (enviada ou aprovada) da edição ativa.
    Devolve (lista, sem_email). Um mesmo e-mail só aparece uma vez."""
    ciclo_id = _ciclo_ativo_ou_recente()
    if not ciclo_id:
        return [], 0
    adesoes = (
        db.table("adesoes").select("municipio_id, secretario_nome, secretaria_email, status")
        .eq("ciclo_id", ciclo_id).in_("status", ["enviada", "aprovada"]).limit(1000).execute().data or []
    )
    vistos, lista, sem_email = set(), [], 0
    for a in adesoes:
        email = (a.get("secretaria_email") or "").strip().lower()
        if not _EMAIL_COMUNICADO_RE.match(email):
            sem_email += 1
            continue
        if email in vistos:
            continue
        vistos.add(email)
        lista.append({
            "tipo": "secretario", "usuario_id": None, "municipio_id": a.get("municipio_id"),
            "nome": (a.get("secretario_nome") or "").strip() or _ROTULO_TIPO_EMAIL["secretario"], "email": email,
        })
    return lista, sem_email


def _destinatarios_email(db, para_coordenadores, para_apoiadores, para_secretarios):
    """Todos que devem receber o e-mail, sem repetir endereço. Devolve (lista, resumo_por_tipo)."""
    grupos = []
    if para_coordenadores:
        grupos.append(("coordenador",) + _perfis_destinatarios(db, ["municipio"], "coordenador"))
    if para_apoiadores:
        grupos.append(("apoiador",) + _perfis_destinatarios(db, PAPEIS_APOIADOR, "apoiador"))
    if para_secretarios:
        grupos.append(("secretario",) + _secretarios_destinatarios(db))
    vistos, lista = set(), []
    resumo = {}
    for tipo, pessoas, sem_email in grupos:
        unicos = 0
        for d in pessoas:
            if d["email"] in vistos:
                continue
            vistos.add(d["email"])
            lista.append(d)
            unicos += 1
        resumo[tipo] = {"com_email": unicos, "sem_email": sem_email}
    return lista, resumo


def _resumo_envios(linhas):
    contagem = {"pendente": 0, "enviado": 0, "erro": 0}
    for r in linhas:
        contagem[r["status"]] = contagem.get(r["status"], 0) + 1
    return {"total": sum(contagem.values()), "enviados": contagem["enviado"], "erros": contagem["erro"], "pendentes": contagem["pendente"]}


@app.get("/api/comunicados")
def listar_comunicados():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    try:
        role = carregar_perfil(user).get("role")
        eh_admin, _coluna = _alcance(role)
        db = get_client()
        itens = _comunicados_visiveis(db, role, _COLUNAS_COMUNICADO)
        ids = [i["id"] for i in itens]
        if eh_admin:
            n_coord = _contar_perfis(db, ["municipio"])
            n_apoio = _contar_perfis(db, PAPEIS_APOIADOR)
            lidos, envios = {}, {}
            if ids:
                linhas = db.table("comunicados_leituras_contagem").select("comunicado_id, lidos").in_("comunicado_id", ids).execute().data or []
                lidos = {r["comunicado_id"]: r["lidos"] for r in linhas}
                for r in db.table("comunicados_envios_contagem").select("comunicado_id, status, qtd").in_("comunicado_id", ids).execute().data or []:
                    envios.setdefault(r["comunicado_id"], []).extend([{"status": r["status"]}] * int(r["qtd"]))
            for i in itens:
                i["destinatarios"] = (n_coord if i["para_coordenadores"] else 0) + (n_apoio if i["para_apoiadores"] else 0)
                i["lidos"] = lidos.get(i["id"], 0)
                i["emails"] = _resumo_envios(envios.get(i["id"], []))
            nao_lidos = 0
        else:
            ja_lidos = _ids_lidos(db, getattr(user, "id", None), ids)
            for i in itens:
                i["lido"] = i["id"] in ja_lidos
            nao_lidos = sum(1 for i in itens if not i["lido"])
        return jsonify({"comunicados": itens, "pode_enviar": eh_admin, "nao_lidos": nao_lidos})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.get("/api/comunicados/nao-lidos")
def contar_comunicados_nao_lidos():
    """Só o número, para a bolinha no menu (chamada leve, feita de minuto em minuto)."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    try:
        role = carregar_perfil(user).get("role")
        eh_admin, coluna = _alcance(role)
        if eh_admin or not coluna:  # administrador ou perfil sem acesso: nada a ler
            return jsonify({"nao_lidos": 0})
        db = get_client()
        visiveis = [r["id"] for r in _comunicados_visiveis(db, role, "id")]
        ja_lidos = _ids_lidos(db, getattr(user, "id", None), visiveis)
        return jsonify({"nao_lidos": sum(1 for i in visiveis if i not in ja_lidos)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/comunicados")
def criar_comunicado():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem enviar comunicados."}), 403
    campos, erro = _validar_comunicado(request.get_json(force=True, silent=True) or {})
    if erro:
        return jsonify({"error": erro}), 400
    try:
        campos["criado_por"] = getattr(user, "id", None)
        campos["criado_por_nome"] = carregar_perfil(user).get("nome") or getattr(user, "email", None)
        salvo = get_client().table("comunicados").insert(campos).execute().data or []
        return jsonify(salvo[0] if salvo else {}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.put("/api/comunicados")
def editar_comunicado():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem editar comunicados."}), 403
    body = request.get_json(force=True, silent=True) or {}
    cid = str(body.get("id") or "")
    if not _UUID_RE.match(cid):
        return jsonify({"error": "Comunicado inválido."}), 400
    campos, erro = _validar_comunicado(body)
    if erro:
        return jsonify({"error": erro}), 400
    try:
        campos["atualizado_em"] = datetime.now(timezone.utc).isoformat()
        salvo = get_client().table("comunicados").update(campos).eq("id", cid).execute().data or []
        if not salvo:
            return jsonify({"error": "Comunicado não encontrado."}), 404
        return jsonify(salvo[0])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.delete("/api/comunicados")
def excluir_comunicado():
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem excluir comunicados."}), 403
    cid = request.args.get("id") or ""
    if not _UUID_RE.match(cid):
        return jsonify({"error": "Comunicado inválido."}), 400
    try:
        get_client().table("comunicados").delete().eq("id", cid).execute()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/comunicados/lido")
def marcar_comunicados_lidos():
    """Quem recebe marca como lido (a página faz isso sozinha ao abrir). O administrador não é destinatário."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, _ = auth
    usuario_id = getattr(user, "id", None)
    try:
        eh_admin, coluna = _alcance(carregar_perfil(user).get("role"))
        body = request.get_json(force=True, silent=True) or {}
        ids = [str(i) for i in (body.get("ids") or []) if _UUID_RE.match(str(i))][:100]
        if eh_admin or not coluna or not ids or not usuario_id:
            return jsonify({"marcados": 0})
        db = get_client()
        validos = [
            r["id"] for r in (
                db.table("comunicados").select("id").in_("id", ids).eq(coluna, True).eq("arquivado", False).execute().data or []
            )
        ]
        if validos:
            db.table("comunicados_leituras").upsert(
                [{"comunicado_id": i, "usuario_id": usuario_id} for i in validos],
                on_conflict="comunicado_id,usuario_id", ignore_duplicates=True,
            ).execute()
        return jsonify({"marcados": len(validos)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.get("/api/comunicados/leituras")
def leituras_do_comunicado():
    """Administrador: quem já leu / ainda não leu (dentro do sistema) e como foi o envio dos e-mails."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores."}), 403
    cid = request.args.get("id") or ""
    if not _UUID_RE.match(cid):
        return jsonify({"error": "Comunicado inválido."}), 400
    try:
        db = get_client()
        achado = db.table("comunicados").select("id, para_coordenadores, para_apoiadores, para_secretarios").eq("id", cid).limit(1).execute().data or []
        if not achado:
            return jsonify({"error": "Comunicado não encontrado."}), 404
        roles = _roles_do_comunicado(achado[0])
        pessoas = db.table("perfis").select("id, nome, role, municipio_id").in_("role", roles).limit(1000).execute().data or [] if roles else []
        lidas = {
            r["usuario_id"]: r["lido_em"] for r in (
                db.table("comunicados_leituras").select("usuario_id, lido_em").eq("comunicado_id", cid).limit(1000).execute().data or []
            )
        }
        envios = db.table("comunicados_envios").select("tipo, municipio_id, nome, email, status, erro, enviado_em").eq("comunicado_id", cid).limit(1000).execute().data or []
        ids_mun = sorted({p["municipio_id"] for p in pessoas + envios if p.get("municipio_id") is not None})
        nomes_mun = {}
        if ids_mun:
            nomes_mun = {m["id"]: m["nome"] for m in (db.table("municipios").select("id, nome").in_("id", ids_mun).limit(1000).execute().data or [])}
        lista = [
            {
                "nome": p.get("nome") or "(sem nome)",
                "role": p.get("role"),
                "municipio": nomes_mun.get(p.get("municipio_id")),
                "lido": p["id"] in lidas,
                "lido_em": lidas.get(p["id"]),
            }
            for p in pessoas
        ]
        lista.sort(key=lambda x: (x["lido"], (x["nome"] or "").lower()))  # quem ainda NÃO leu aparece primeiro
        ordem = {"erro": 0, "pendente": 1, "enviado": 2}
        emails = sorted(
            [
                {"tipo": e.get("tipo"), "nome": e.get("nome"), "municipio": nomes_mun.get(e.get("municipio_id")), "email": e.get("email"),
                 "status": e.get("status"), "erro": e.get("erro"), "enviado_em": e.get("enviado_em")}
                for e in envios
            ],
            key=lambda x: (ordem.get(x["status"], 9), (x["nome"] or "").lower()),  # falhas primeiro
        )
        return jsonify({"pessoas": lista, "lidos": sum(1 for x in lista if x["lido"]), "total": len(lista), "emails": emails})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.get("/api/comunicados/contagem-email")
def contar_destinatarios_email():
    """Administrador: quantas pessoas de cada público têm e-mail (e se o envio de e-mail está configurado)."""
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores."}), 403
    try:
        db = get_client()
        _lista, resumo = _destinatarios_email(db, True, True, True)
        saida = {"coordenadores": resumo["coordenador"], "apoiadores": resumo["apoiador"], "secretarios": resumo["secretario"]}
        saida["email_configurado"] = email_configurado()
        return jsonify(saida)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/comunicados/enviar-email")
def enviar_comunicado_email():
    """Envia o comunicado por e-mail a todos os públicos marcados, em lotes pequenos.

    A tela chama de novo até `feito` ficar true (o servidor tem limite de tempo por chamada). Cada pessoa
    fica registrada em comunicados_envios (pendente / enviado / erro), então nunca recebe duas vezes e dá para
    retomar de onde parou ou reenviar só quem falhou (`reenviar_erros`).
    """
    auth = require_user()
    if not auth:
        return jsonify({"error": "Não autenticado"}), 401
    user, jwt = auth
    if not require_admin(jwt, user):
        return jsonify({"error": "Apenas administradores podem enviar comunicados."}), 403
    body = request.get_json(force=True, silent=True) or {}
    cid = str(body.get("id") or "")
    if not _UUID_RE.match(cid):
        return jsonify({"error": "Comunicado inválido."}), 400
    if not email_configurado():
        return jsonify({"error": "O envio de e-mail não está configurado no servidor (faltam SMTP_USER e SMTP_PASSWORD)."}), 400
    try:
        tamanho = max(1, min(int(body.get("tamanho") or _LOTE_EMAILS), 10))
    except (TypeError, ValueError):
        tamanho = _LOTE_EMAILS
    try:
        db = get_client()
        achado = (
            db.table("comunicados").select("id, titulo, mensagem, link, para_coordenadores, para_apoiadores, para_secretarios")
            .eq("id", cid).limit(1).execute().data or []
        )
        if not achado:
            return jsonify({"error": "Comunicado não encontrado."}), 404
        com = achado[0]

        # 1) garante uma linha "pendente" para cada pessoa (só acrescenta quem ainda não está na lista)
        destinatarios, _resumo = _destinatarios_email(db, com["para_coordenadores"], com["para_apoiadores"], com["para_secretarios"])
        existentes = {r["email"] for r in (db.table("comunicados_envios").select("email").eq("comunicado_id", cid).limit(1000).execute().data or [])}
        novos = [
            {"comunicado_id": cid, "tipo": d["tipo"], "usuario_id": d["usuario_id"], "municipio_id": d["municipio_id"],
             "nome": d["nome"], "email": d["email"], "status": "pendente"}
            for d in destinatarios if d["email"] not in existentes
        ]
        if novos:
            db.table("comunicados_envios").insert(novos).execute()
        if body.get("reenviar_erros"):
            db.table("comunicados_envios").update({"status": "pendente", "erro": None}).eq("comunicado_id", cid).eq("status", "erro").execute()

        # 2) envia o próximo lote
        quem = carregar_perfil(user).get("nome") or getattr(user, "email", None) or "a coordenação do projeto"
        no_sistema = f"{url_base()}/comunicados"
        lote = (
            db.table("comunicados_envios").select("id, nome, email, tipo").eq("comunicado_id", cid).eq("status", "pendente")
            .order("id").limit(tamanho).execute().data or []
        )
        for item in lote:
            try:
                # coordenadores e equipe de apoio também veem no sistema; secretários só por e-mail
                link_sistema = no_sistema if item["tipo"] in ("coordenador", "apoiador") else None
                assunto, texto, html = montar_comunicado(item["nome"], com["titulo"], com["mensagem"], com.get("link"), quem, link_sistema)
                enviar_email(item["email"], assunto, texto, html)
                db.table("comunicados_envios").update({"status": "enviado", "erro": None, "enviado_em": datetime.now(timezone.utc).isoformat()}).eq("id", item["id"]).execute()
            except smtplib.SMTPAuthenticationError:
                # login recusado: não adianta insistir nos outros; este e os demais continuam pendentes
                return jsonify({"error": "O servidor de e-mail recusou o login. Confira SMTP_USER e SMTP_PASSWORD (senha de app) nas configurações."}), 502
            except Exception as falha:  # noqa: BLE001 - um e-mail com problema não pode parar os outros
                db.table("comunicados_envios").update({"status": "erro", "erro": str(falha)[:300]}).eq("id", item["id"]).execute()

        resumo = _resumo_envios(db.table("comunicados_envios").select("status").eq("comunicado_id", cid).limit(1000).execute().data or [])
        resumo["feito"] = resumo["pendentes"] == 0
        return jsonify(resumo)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # com debug=True o Flask liga duas vezes; aquece só no processo que de fato atende
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
        threading.Thread(target=_aquecer_escolas, daemon=True).start()
    app.run(debug=True, port=port)
