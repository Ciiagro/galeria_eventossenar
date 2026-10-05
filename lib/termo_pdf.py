"""
Gera o PDF final do Termo de Adesão (conteúdo + folha de assinaturas eletrônicas).

O conteúdo vem do `snapshot` guardado no pedido de assinatura (a cópia do termo no momento
do envio), então o PDF mostra exatamente o que as pessoas leram e assinaram.
"""

import os
import re
from datetime import datetime, timedelta, timezone

from fpdf import FPDF

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VERDE = (47, 107, 79)
VERDE_ESCURO = (30, 70, 50)
CINZA = (110, 101, 85)
FUNDO = (241, 239, 227)
BORDA = (216, 208, 184)
FORTALEZA = timezone(timedelta(hours=-3))  # Ceará não tem horário de verão

ROTULO_PAPEL = {
    "prefeito": "Prefeito(a) Municipal",
    "secretario": "Secretário(a) de Educação",
    "sindicato": "Presidente do Sindicato Rural",
    "coordenador": "Coordenador(a) do Projeto",
}


def _t(texto) -> str:
    """Texto seguro para a fonte padrão do PDF (Latin-1: acentos do português funcionam)."""
    s = "" if texto is None else str(texto)
    for a, b in (("—", "-"), ("–", "-"), ("“", '"'), ("”", '"'), ("‘", "'"), ("’", "'"), ("…", "..."), ("•", "-")):
        s = s.replace(a, b)
    return s.encode("latin-1", "replace").decode("latin-1")


def cpf_formatado(valor) -> str:
    d = re.sub(r"\D", "", str(valor or ""))
    if len(d) != 11:
        return str(valor or "")
    return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"


def data_hora_br(valor) -> str:
    if not valor:
        return "-"
    try:
        dt = datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
        return dt.astimezone(FORTALEZA).strftime("%d/%m/%Y %H:%M:%S (horário de Fortaleza)")
    except ValueError:
        return str(valor)


class _Pdf(FPDF):
    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*CINZA)
        self.cell(0, 6, _t(f"Termo de Adesão - Projeto Valores  |  página {self.page_no()}/{{nb}}"), align="C")


def _secao(pdf: _Pdf, n: int, titulo: str):
    pdf.ln(3)
    pdf.set_fill_color(*FUNDO)
    pdf.set_draw_color(*VERDE)
    pdf.set_text_color(*VERDE_ESCURO)
    pdf.set_font("Helvetica", "B", 11)
    y = pdf.get_y()
    pdf.cell(0, 8, _t(f"  {n}. {titulo}"), fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.set_line_width(1.2)
    pdf.line(pdf.l_margin, y, pdf.l_margin, y + 8)
    pdf.set_line_width(0.2)
    pdf.ln(1.5)


def _campos(pdf: _Pdf, pares):
    """Campos em 2 colunas: rótulo pequeno em cima, valor em negrito embaixo."""
    largura = (pdf.w - pdf.l_margin - pdf.r_margin) / 2
    for i in range(0, len(pares), 2):
        y0 = pdf.get_y()
        alturas = []
        for j, (rotulo, valor) in enumerate(pares[i:i + 2]):
            x = pdf.l_margin + j * largura
            pdf.set_xy(x, y0)
            pdf.set_font("Helvetica", "", 7)
            pdf.set_text_color(*CINZA)
            pdf.cell(largura - 4, 3.5, _t(rotulo.upper()), new_x="LEFT", new_y="NEXT")
            pdf.set_x(x)
            pdf.set_font("Helvetica", "B", 9.5)
            pdf.set_text_color(42, 38, 32)
            pdf.multi_cell(largura - 4, 4.6, _t(valor or "-"), new_x="LEFT", new_y="NEXT")
            alturas.append(pdf.get_y())
        pdf.set_xy(pdf.l_margin, max(alturas) + 1.5)


def _tabela(pdf: _Pdf, cabecalho, linha, negrito_ultima=True):
    n = len(cabecalho)
    largura = (pdf.w - pdf.l_margin - pdf.r_margin) / n
    pdf.set_draw_color(*BORDA)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.set_fill_color(*FUNDO)
    pdf.set_text_color(*VERDE_ESCURO)
    for h in cabecalho:
        pdf.cell(largura, 6, _t(h), border=1, align="C", fill=True)
    pdf.ln()
    pdf.set_text_color(42, 38, 32)
    for k, v in enumerate(linha):
        pdf.set_font("Helvetica", "B" if (negrito_ultima and k == n - 1) else "", 9)
        pdf.cell(largura, 6, _t(v), border=1, align="C")
    pdf.ln(8)


def gerar_pdf_termo(snapshot: dict, signatarios: list, hash_termo: str, pedido_id: str) -> bytes:
    a = snapshot
    c = a.get("coordenador") or {}
    escolas = a.get("escolas") or []
    ano = a.get("ciclo_nome") or ""

    pdf = _Pdf(format="A4", unit="mm")
    pdf.alias_nb_pages()
    pdf.set_margins(15, 14, 15)
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()

    # logos (se os arquivos estiverem presentes no deploy)
    for arquivo, x, w in (("logo-senar-termo.png", 15, 38), ("logo-valores-termo.png", 142, 52)):
        caminho = os.path.join(RAIZ, "public", arquivo)
        if os.path.exists(caminho):
            try:
                pdf.image(caminho, x=x, y=12, w=w)
            except Exception:  # noqa: BLE001 - o logo faltando não pode impedir o termo
                pass
    pdf.set_y(30)
    pdf.set_draw_color(*VERDE)
    pdf.set_line_width(0.8)
    pdf.line(15, pdf.get_y(), 195, pdf.get_y())
    pdf.set_line_width(0.2)
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*VERDE)
    pdf.cell(0, 5, "FAEC - SENAR CEARÁ".encode("latin-1", "replace").decode("latin-1"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*VERDE_ESCURO)
    pdf.cell(0, 8, _t(f"Termo de Adesão - Projeto Valores{(' - ' + ano) if ano else ''}"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*CINZA)
    pdf.cell(0, 5, _t("Projeto Valores Humanos - Brincando e cultivando os valores humanos"), new_x="LMARGIN", new_y="NEXT")

    _secao(pdf, 1, "Identificação do Município")
    _campos(pdf, [
        ("Município", f"{a.get('municipio_nome')} - CE" if a.get("municipio_nome") else None),
        ("Prefeito(a)", a.get("prefeito_nome")),
        ("RG do Prefeito(a)", a.get("prefeito_rg")),
        ("CPF do Prefeito(a)", cpf_formatado(a.get("prefeito_cpf")) if a.get("prefeito_cpf") else None),
        ("Endereço da Prefeitura", a.get("prefeitura_endereco")),
        ("CEP", a.get("prefeitura_cep")),
        ("Telefone", a.get("prefeitura_telefone")),
        ("E-mail", a.get("prefeitura_email")),
    ])

    _secao(pdf, 2, "Secretaria de Educação")
    _campos(pdf, [
        ("Secretário(a)", a.get("secretario_nome")),
        ("CPF", cpf_formatado(a.get("secretario_cpf")) if a.get("secretario_cpf") else None),
        ("Endereço", a.get("secretaria_endereco")),
        ("Contato", a.get("secretaria_telefone")),
        ("E-mail", a.get("secretaria_email")),
    ])

    _secao(pdf, 3, "Coordenador(a) do Projeto")
    _campos(pdf, [
        ("Nome", c.get("nome")),
        ("E-mail", c.get("email")),
        ("RG", c.get("rg")),
        ("CPF", cpf_formatado(c.get("cpf")) if c.get("cpf") else None),
        ("Telefone(s)", " / ".join(x for x in (c.get("telefone1"), c.get("telefone2")) if x)),
    ])

    soma = lambda k: sum(int(e.get(k) or 0) for e in escolas)  # noqa: E731
    t3, t4, t5 = soma("matricula_infantil_3"), soma("matricula_infantil_4"), soma("matricula_infantil_5")
    _secao(pdf, 4, "Censo da Rede Municipal (escolas participantes)")
    _campos(pdf, [("Total de escolas participantes", str(len(escolas))), ("Total de professores", str(soma("quantidade_professores")))])
    _tabela(pdf, ["Infantil 3", "Infantil 4", "Infantil 5", "Total de alunos"], [t3, t4, t5, t3 + t4 + t5])

    _secao(pdf, 5, "Escolas participantes")
    if not escolas:
        pdf.set_font("Helvetica", "", 9.5)
        pdf.cell(0, 6, "Nenhuma escola cadastrada nesta adesão.", new_x="LMARGIN", new_y="NEXT")
    for i, e in enumerate(escolas, 1):
        if pdf.get_y() > pdf.h - 50:
            pdf.add_page()
        pdf.set_font("Helvetica", "B", 9.5)
        pdf.set_text_color(*VERDE_ESCURO)
        pdf.multi_cell(0, 5, _t(f"{i}. {e.get('nome')}"), new_x="LMARGIN", new_y="NEXT")
        sub = " · ".join(x for x in (e.get("tipo"), e.get("endereco")) if x)
        if sub:
            pdf.set_font("Helvetica", "", 8.5)
            pdf.set_text_color(74, 69, 58)
            pdf.multi_cell(0, 4.2, _t(sub), new_x="LMARGIN", new_y="NEXT")
        p, i3, i4, i5 = (int(e.get(k) or 0) for k in ("quantidade_professores", "matricula_infantil_3", "matricula_infantil_4", "matricula_infantil_5"))
        pdf.ln(0.5)
        _tabela(pdf, ["Professores", "Infantil 3", "Infantil 4", "Infantil 5", "Total de alunos"], [p, i3, i4, i5, i3 + i4 + i5])

    pdf.add_page()
    _secao(pdf, 6, "Termo de Adesão e Compromisso")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(42, 38, 32)
    pdf.set_fill_color(251, 250, 243)
    texto1 = (
        f"Pelo presente termo, o município de {a.get('municipio_nome')}, por meio de seus representantes abaixo assinados, "
        f"formaliza sua adesão ao Projeto Valores{(' para o ciclo ' + ano) if ano else ''}, comprometendo-se a viabilizar a execução do "
        "programa junto às escolas listadas neste documento, garantindo a participação de gestores, professores e alunos nas atividades "
        "previstas, bem como o correto envio das informações de acompanhamento solicitadas pela coordenação do projeto."
    )
    texto2 = (
        "Da veracidade e do uso dos dados. O município declara que as informações prestadas neste Termo são verdadeiras e atualizadas, "
        "responsabilizando-se por sua exatidão e por comunicar eventuais alterações à coordenação do projeto. Os dados pessoais aqui "
        "informados serão tratados pela FAEC/SENAR exclusivamente para as finalidades do Projeto Valores, em conformidade com a Lei nº "
        "13.709/2018 (LGPD). A informação inverídica poderá ensejar a suspensão ou o cancelamento da adesão."
    )
    pdf.multi_cell(0, 5.4, _t(texto1), border=1, fill=True, new_x="LMARGIN", new_y="NEXT", padding=3)
    pdf.ln(2.5)
    pdf.multi_cell(0, 5.4, _t(texto2), border=1, fill=True, new_x="LMARGIN", new_y="NEXT", padding=3)

    # ---- assinaturas eletrônicas ----
    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*CINZA)
    pdf.cell(0, 6, "Assinaturas eletrônicas".encode("latin-1", "replace").decode("latin-1"), new_x="LMARGIN", new_y="NEXT")
    ordem = {"prefeito": 0, "secretario": 1, "sindicato": 2, "coordenador": 3}
    for s in sorted(signatarios, key=lambda x: ordem.get(x["papel"], 9)):
        if pdf.get_y() > pdf.h - 40:
            pdf.add_page()
        pdf.set_draw_color(*BORDA)
        pdf.set_fill_color(251, 250, 243)
        y = pdf.get_y()
        pdf.rect(pdf.l_margin, y, pdf.w - pdf.l_margin - pdf.r_margin, 22, style="DF")
        pdf.set_xy(pdf.l_margin + 3, y + 2)
        pdf.set_font("Helvetica", "B", 10.5)
        pdf.set_text_color(*VERDE_ESCURO)
        pdf.cell(0, 5, _t(f"{s.get('assinado_nome_digitado') or s['nome']}"), new_x="LEFT", new_y="NEXT")
        pdf.set_x(pdf.l_margin + 3)
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_text_color(*CINZA)
        pdf.cell(0, 4.5, _t(ROTULO_PAPEL.get(s["papel"], s["papel"])), new_x="LEFT", new_y="NEXT")
        pdf.set_x(pdf.l_margin + 3)
        pdf.set_text_color(42, 38, 32)
        pdf.cell(0, 4.5, _t(f"Assinado eletronicamente em {data_hora_br(s.get('assinado_em'))}"), new_x="LEFT", new_y="NEXT")
        pdf.set_x(pdf.l_margin + 3)
        pdf.cell(0, 4.5, _t(f"E-mail: {s['email']}   |   IP: {s.get('ip') or '-'}"), new_x="LEFT", new_y="NEXT")
        pdf.set_y(y + 25)

    # quem não assinou por e-mail (ex.: prefeito e sindicato, enquanto não liberados): linha para assinar fora do sistema
    assinaram = {s["papel"] for s in signatarios}
    faltam = [pp for pp in ("prefeito", "secretario", "sindicato", "coordenador") if pp not in assinaram]
    if faltam:
        if pdf.get_y() > pdf.h - 24 - 22 * len(faltam):
            pdf.add_page()
        pdf.ln(2)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*CINZA)
        pdf.cell(0, 6, _t("Demais assinaturas (fora do sistema)"), new_x="LMARGIN", new_y="NEXT")
        nomes = {"prefeito": a.get("prefeito_nome"), "secretario": a.get("secretario_nome"), "coordenador": c.get("nome")}
        for pp in faltam:
            pdf.ln(10)
            y = pdf.get_y()
            pdf.set_draw_color(42, 38, 32)
            pdf.line(pdf.l_margin, y, pdf.l_margin + 85, y)
            pdf.set_xy(pdf.l_margin, y + 1)
            if nomes.get(pp):
                pdf.set_font("Helvetica", "B", 9.5)
                pdf.set_text_color(42, 38, 32)
                pdf.cell(0, 4.8, _t(nomes[pp]), new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 8.5)
            pdf.set_text_color(*CINZA)
            pdf.cell(0, 4.5, _t(ROTULO_PAPEL.get(pp, pp)), new_x="LMARGIN", new_y="NEXT")

    # ---- folha de comprovação ----
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(*VERDE_ESCURO)
    pdf.cell(0, 9, _t("Folha de comprovação das assinaturas"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(42, 38, 32)
    pdf.multi_cell(
        0, 5,
        _t(
            "As assinaturas deste documento foram colhidas pelo Painel do Projeto Valores Humanos por meio de link pessoal enviado ao "
            "e-mail de cada signatário e confirmação com código de 6 dígitos enviado ao mesmo e-mail. Trata-se de assinatura eletrônica "
            "simples, nos termos do art. 4º, inciso I, da Lei nº 14.063/2020. Cada assinatura registra data, hora, endereço IP e navegador."
        ),
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(4)
    for s in sorted(signatarios, key=lambda x: ordem.get(x["papel"], 9)):
        pdf.set_font("Helvetica", "B", 9.5)
        pdf.set_text_color(*VERDE_ESCURO)
        pdf.cell(0, 5.5, _t(f"{ROTULO_PAPEL.get(s['papel'], s['papel'])}: {s['nome']}"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_text_color(42, 38, 32)
        pdf.cell(0, 4.5, _t(f"E-mail: {s['email']}"), new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 4.5, _t(f"Nome digitado na assinatura: {s.get('assinado_nome_digitado') or '-'}"), new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 4.5, _t(f"Data e hora: {data_hora_br(s.get('assinado_em'))}"), new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 4.5, _t(f"IP: {s.get('ip') or '-'}"), new_x="LMARGIN", new_y="NEXT")
        pdf.multi_cell(0, 4.5, _t(f"Navegador: {(s.get('user_agent') or '-')[:180]}"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*VERDE_ESCURO)
    pdf.cell(0, 5.5, _t("Identificação do documento"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Courier", "", 8)
    pdf.set_text_color(42, 38, 32)
    pdf.multi_cell(0, 4.2, _t(f"Pedido: {pedido_id}\nImpressão digital (SHA-256) dos dados do termo:\n{hash_termo}"), new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())
