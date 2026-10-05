"""
Envio de e-mail por SMTP (Gmail / Google Workspace), sem serviço pago.

Variáveis de ambiente (.env local e Environment Variables no Vercel):
  SMTP_HOST      padrão smtp.gmail.com
  SMTP_PORT      padrão 465 (SSL). Use 587 para STARTTLS.
  SMTP_USER      a conta que envia, ex.: geovana@senarce.org.br
  SMTP_PASSWORD  "senha de app" de 16 letras gerada na conta Google (NÃO é a senha normal)
  SMTP_FROM_NOME padrão "Projeto Valores Humanos - SENAR CE"
  APP_URL        endereço público do sistema, ex.: https://seu-sistema.vercel.app
                 (usado nos links dos e-mails)
"""

import html as _html
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from lib.edicao import rotulo_edicao


def email_configurado() -> bool:
    return bool(os.environ.get("SMTP_USER") and os.environ.get("SMTP_PASSWORD"))


def url_base() -> str:
    return (os.environ.get("APP_URL") or "http://localhost:3000").rstrip("/")


def enviar_email(destino: str, assunto: str, texto: str, html: str | None = None, anexos=None) -> None:
    """Envia um e-mail. `anexos` = lista de (nome_arquivo, bytes, mimetype). Levanta exceção se falhar."""
    if not email_configurado():
        raise RuntimeError("O envio de e-mail não está configurado (faltam SMTP_USER e SMTP_PASSWORD).")

    usuario = os.environ["SMTP_USER"]
    senha = os.environ["SMTP_PASSWORD"].replace(" ", "")  # a senha de app costuma ser copiada com espaços
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    porta = int(os.environ.get("SMTP_PORT", "465"))
    nome = os.environ.get("SMTP_FROM_NOME", "Projeto Valores Humanos - SENAR CE")

    msg = EmailMessage()
    msg["Subject"] = assunto
    msg["From"] = formataddr((nome, usuario))
    msg["To"] = destino
    msg.set_content(texto)
    if html:
        msg.add_alternative(html, subtype="html")
    for nome_arq, conteudo, mimetype in (anexos or []):
        tipo, _, sub = mimetype.partition("/")
        msg.add_attachment(conteudo, maintype=tipo, subtype=sub or "octet-stream", filename=nome_arq)

    contexto = ssl.create_default_context()
    if porta == 465:
        with smtplib.SMTP_SSL(host, porta, context=contexto, timeout=20) as servidor:
            servidor.login(usuario, senha)
            servidor.send_message(msg)
    else:
        with smtplib.SMTP(host, porta, timeout=20) as servidor:
            servidor.starttls(context=contexto)
            servidor.login(usuario, senha)
            servidor.send_message(msg)


def _caixa(titulo: str, corpo_html: str, botao_texto: str | None = None, botao_link: str | None = None) -> str:
    botao = ""
    if botao_texto and botao_link:
        botao = (
            f'<p style="margin:24px 0"><a href="{botao_link}" style="background:#2F6B4F;color:#fff;'
            f'text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">'
            f"{botao_texto}</a></p>"
            f'<p style="font-size:12px;color:#6E6555">Se o botão não abrir, copie e cole este endereço no navegador:<br>'
            f'<span style="word-break:break-all">{botao_link}</span></p>'
        )
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#2A2620">'
        f'<h2 style="color:#1E4632;border-bottom:3px solid #2F6B4F;padding-bottom:8px">{titulo}</h2>'
        f"{corpo_html}{botao}"
        '<p style="font-size:11px;color:#6E6555;margin-top:28px;border-top:1px solid #D8D0B8;padding-top:10px">'
        "Projeto Valores Humanos — FAEC/SENAR Ceará. Mensagem automática, não responda a este e-mail.</p>"
        "</div>"
    )


def montar_convite(nome: str, papel_rotulo: str, municipio: str, ciclo: str, link: str, quem_enviou: str):
    """Retorna (assunto, texto, html) do convite para assinar."""
    ciclo = rotulo_edicao(ciclo)  # "Edição 2026"
    assunto = f"Assinatura do Termo de Adesão — Projeto Valores — {municipio} ({papel_rotulo})"
    e = _html.escape
    nome_h, papel_h, mun_h, ciclo_h, quem_h = e(nome), e(papel_rotulo), e(municipio), e(ciclo), e(quem_enviou)
    texto = (
        f"Olá, {nome}.\n\n"
        f"{quem_enviou} enviou o Termo de Adesão ao Projeto Valores{(' (' + ciclo + ')') if ciclo else ''} "
        f"do município de {municipio} para a sua assinatura, como {papel_rotulo}.\n\n"
        f"Para ler o termo e assinar, abra o link abaixo (ele é pessoal, não encaminhe):\n{link}\n\n"
        "Ao abrir, você receberá um código de 6 dígitos neste mesmo e-mail para confirmar a assinatura.\n"
    )
    html = _caixa(
        "Termo de Adesão — Projeto Valores",
        f"<p>Olá, <strong>{nome_h}</strong>.</p>"
        f"<p>{quem_h} enviou o Termo de Adesão ao Projeto Valores{(' (' + ciclo_h + ')') if ciclo else ''} "
        f"do município de <strong>{mun_h}</strong> para a sua assinatura, como <strong>{papel_h}</strong>.</p>"
        "<p>O link é pessoal — não o encaminhe. Ao abrir, você receberá um código de 6 dígitos "
        "neste mesmo e-mail para confirmar a assinatura.</p>",
        "Ler e assinar o termo",
        _html.escape(link, quote=True),
    )
    return assunto, texto, html


def montar_codigo(nome: str, codigo: str, contexto: str = ""):
    """`contexto` = "Município - Papel": ajuda quando a mesma caixa de e-mail recebe códigos de vários termos."""
    assunto = f"Seu código para assinar o termo: {codigo}" + (f" ({contexto})" if contexto else "")
    texto = (
        f"Olá, {nome}.\n\nSeu código de confirmação é: {codigo}\n"
        + (f"Termo: {contexto}\n" if contexto else "")
        + "Ele vale por 15 minutos. Se não foi você, ignore esta mensagem.\n"
    )
    html = _caixa(
        "Código de confirmação",
        f"<p>Olá, <strong>{_html.escape(nome)}</strong>.</p><p>Seu código para assinar o termo é:</p>"
        + (f"<p style=\"color:#6E6555;margin:0\">Termo: <strong>{_html.escape(contexto)}</strong></p>" if contexto else "")
        +
        f'<p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#1E4632;margin:12px 0">{codigo}</p>'
        "<p>Ele vale por 15 minutos. Se não foi você quem pediu, ignore esta mensagem.</p>",
    )
    return assunto, texto, html


def montar_concluido(nome: str, municipio: str):
    assunto = f"Termo de Adesão assinado — {municipio}"
    texto = (
        f"Olá, {nome}.\n\nAs assinaturas por e-mail do Termo de Adesão de {municipio} foram concluídas. "
        "O PDF assinado, com a folha de comprovação, segue em anexo.\n"
    )
    html = _caixa(
        "Termo assinado",
        f"<p>Olá, <strong>{_html.escape(nome)}</strong>.</p>"
        f"<p>As assinaturas por e-mail do Termo de Adesão de <strong>{_html.escape(municipio)}</strong> foram concluídas. "
        "O PDF assinado, com a folha de comprovação, segue em anexo.</p>",
    )
    return assunto, texto, html
