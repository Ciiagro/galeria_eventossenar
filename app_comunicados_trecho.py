# PASSO A PASSO (só use este arquivo se você NÃO puder substituir o app.py inteiro):
#  1) No app.py, na linha que começa com  from lib.email_client import ...  acrescente  , montar_comunicado, url_base  no fim.
#  2) Cole TODO o bloco abaixo no app.py, logo ANTES da linha:  if __name__ == "__main__":
#     (se já tinha colado a versão anterior deste bloco, apague a anterior primeiro)
#  3) Substitua também o arquivo lib/email_client.py pelo deste pacote (ele ganhou a função montar_comunicado).

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
