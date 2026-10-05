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


def data_hora_curta(valor) -> str:
    if not valor:
        return "-"
    try:
        dt = datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
        return dt.astimezone(FORTALEZA).strftime("%d/%m/%Y %H:%M:%S")
    except ValueError:
        return str(valor)


def _linhas(pdf, largura, texto, estilo="", tam=9):
    """Quantas linhas o texto ocupa na largura dada (para calcular a altura das linhas da tabela)."""
    pdf.set_font("Helvetica", estilo, tam)
    return max(1, len(pdf.multi_cell(largura, 1, _t(texto), dry_run=True, output="LINES")))


class _Pdf(FPDF):
    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*CINZA)
        self.cell(0, 6, _t(f"Termo de Adesão - Projeto Valores  |  página {self.page_no()}/{{nb}}"), align="C")


def _secao(pdf: _Pdf, n: int, titulo: str):
    pdf.ln(2)
    pdf.set_fill_color(*FUNDO)
    pdf.set_draw_color(*VERDE)
    pdf.set_text_color(*VERDE_ESCURO)
    pdf.set_font("Helvetica", "B", 11)
    y = pdf.get_y()
    pdf.cell(0, 7, _t(f"  {n}. {titulo}"), fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.set_line_width(1.2)
    pdf.line(pdf.l_margin, y, pdf.l_margin, y + 7)
    pdf.set_line_width(0.2)
    pdf.ln(1)


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
        pdf.set_xy(pdf.l_margin, max(alturas) + 0.8)


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


def _tabela_escolas_cabecalho(pdf, larg_nome, larg_num):
    pdf.set_draw_color(*BORDA)
    pdf.set_fill_color(*FUNDO)
    pdf.set_text_color(*VERDE_ESCURO)
    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(larg_nome, 6, "Escola", border=1, fill=True)
    for h in ("Professores", "Infantil 3", "Infantil 4", "Infantil 5", "Total alunos"):
        pdf.cell(larg_num, 6, h, border=1, align="C", fill=True)
    pdf.ln()


def _tabela_escolas(pdf, escolas):
    """Todas as escolas numa única tabela (uma linha por escola): ocupa bem menos espaço que um quadro por escola."""
    usavel = pdf.w - pdf.l_margin - pdf.r_margin
    larg_nome = 84
    larg_num = (usavel - larg_nome) / 5
    _tabela_escolas_cabecalho(pdf, larg_nome, larg_num)
    for i, e in enumerate(escolas, 1):
        nome = f"{i}. {e.get('nome') or '-'}"
        sub = " · ".join(x for x in (e.get("tipo"), e.get("endereco")) if x)
        n1 = _linhas(pdf, larg_nome - 3, nome, "B", 8.5)
        n2 = _linhas(pdf, larg_nome - 3, sub, "", 7) if sub else 0
        altura = max(7.5, 1.6 + n1 * 3.9 + n2 * 3.2 + 1.4)
        if pdf.get_y() + altura > pdf.h - 18:
            pdf.add_page()
            _tabela_escolas_cabecalho(pdf, larg_nome, larg_num)
        x0, y0 = pdf.l_margin, pdf.get_y()
        pdf.set_draw_color(*BORDA)
        pdf.rect(x0, y0, larg_nome, altura)
        pdf.set_xy(x0 + 1.5, y0 + 1.6)
        pdf.set_font("Helvetica", "B", 8.5)
        pdf.set_text_color(*VERDE_ESCURO)
        pdf.multi_cell(larg_nome - 3, 3.9, _t(nome), new_x="LEFT", new_y="NEXT")
        if sub:
            pdf.set_x(x0 + 1.5)
            pdf.set_font("Helvetica", "", 7)
            pdf.set_text_color(74, 69, 58)
            pdf.multi_cell(larg_nome - 3, 3.2, _t(sub), new_x="LEFT", new_y="NEXT")
        p, i3, i4, i5 = (int(e.get(k) or 0) for k in ("quantidade_professores", "matricula_infantil_3", "matricula_infantil_4", "matricula_infantil_5"))
        valores = [p, i3, i4, i5, i3 + i4 + i5]
        for k, v in enumerate(valores):
            x = x0 + larg_nome + k * larg_num
            if k == 4:
                pdf.set_fill_color(251, 250, 243)
                pdf.rect(x, y0, larg_num, altura, style="DF")
            else:
                pdf.rect(x, y0, larg_num, altura)
            pdf.set_xy(x, y0 + (altura - 5) / 2)
            pdf.set_font("Helvetica", "B" if k == 4 else "", 9)
            pdf.set_text_color(42, 38, 32)
            pdf.cell(larg_num, 5, str(v), align="C")
        pdf.set_y(y0 + altura)
    pdf.ln(2)


def _bloco_assinaturas(pdf, a, c, signatarios):
    """Grade 2x2 com os 4 signatários: quem assinou por e-mail aparece assinado; os demais, com linha para assinar."""
    ordem_papeis = ["prefeito", "secretario", "sindicato", "coordenador"]
    por_papel = {s["papel"]: s for s in signatarios}
    nomes = {"prefeito": a.get("prefeito_nome"), "secretario": a.get("secretario_nome"), "coordenador": c.get("nome")}
    cpfs_ficha = {"prefeito": a.get("prefeito_cpf"), "secretario": a.get("secretario_cpf"), "coordenador": c.get("cpf")}
    usavel = pdf.w - pdf.l_margin - pdf.r_margin
    folga = 8
    larg = (usavel - folga) / 2
    altura = 29
    for linha in (0, 2):
        y0 = pdf.get_y()
        for col in (0, 1):
            papel = ordem_papeis[linha + col]
            x = pdf.l_margin + col * (larg + folga)
            s = por_papel.get(papel)
            if s:
                pdf.set_draw_color(*VERDE)
                pdf.set_fill_color(247, 251, 248)
                pdf.rect(x, y0, larg, altura, style="DF")
                pdf.set_xy(x + 3, y0 + 2)
                pdf.set_font("Helvetica", "B", 7.5)
                pdf.set_text_color(*VERDE)
                pdf.cell(larg - 6, 4, _t("ASSINADO ELETRONICAMENTE"), new_x="LEFT", new_y="NEXT")
                pdf.set_x(x + 3)
                pdf.set_font("Helvetica", "B", 10)
                pdf.set_text_color(*VERDE_ESCURO)
                pdf.cell(larg - 6, 5, _t(s["nome"]), new_x="LEFT", new_y="NEXT")
                pdf.set_x(x + 3)
                pdf.set_font("Helvetica", "", 8.5)
                pdf.set_text_color(*CINZA)
                pdf.cell(larg - 6, 4.2, _t(ROTULO_PAPEL.get(papel, papel)), new_x="LEFT", new_y="NEXT")
                pdf.set_x(x + 3)
                pdf.set_text_color(42, 38, 32)
                pdf.set_font("Helvetica", "B", 8.5)
                pdf.cell(larg - 6, 4.4, _t(f"CPF {cpf_formatado(s.get('cpf') or cpfs_ficha.get(papel)) or '-'}"), new_x="LEFT", new_y="NEXT")
                pdf.set_x(x + 3)
                pdf.set_font("Helvetica", "", 8)
                pdf.cell(larg - 6, 4.2, _t(f"{data_hora_curta(s.get('assinado_em'))}  |  IP {s.get('ip') or '-'}"), new_x="LEFT", new_y="NEXT")
            else:
                pdf.set_draw_color(42, 38, 32)
                pdf.line(x, y0 + 13, x + larg, y0 + 13)
                pdf.set_xy(x, y0 + 14)
                if nomes.get(papel):
                    pdf.set_font("Helvetica", "B", 9.5)
                    pdf.set_text_color(42, 38, 32)
                    pdf.cell(larg, 4.6, _t(nomes[papel]), new_x="LEFT", new_y="NEXT")
                pdf.set_x(x)
                pdf.set_font("Helvetica", "", 8.5)
                pdf.set_text_color(*CINZA)
                pdf.cell(larg, 4.4, _t(ROTULO_PAPEL.get(papel, papel)), new_x="LEFT", new_y="NEXT")
                pdf.set_x(x)
                pdf.set_text_color(42, 38, 32)
                pdf.set_font("Helvetica", "B", 8.5)
                cpf_conhecido = cpfs_ficha.get(papel)
                pdf.cell(larg, 4.4, _t(f"CPF {cpf_formatado(cpf_conhecido)}" if cpf_conhecido else "CPF: ______________________"), new_x="LEFT", new_y="NEXT")
        pdf.set_y(y0 + altura + 3)


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
    for arquivo, x, w in (("logo-senar-termo.png", 15, 34), ("logo-valores-termo.png", 144, 48)):
        caminho = os.path.join(RAIZ, "public", arquivo)
        if os.path.exists(caminho):
            try:
                pdf.image(caminho, x=x, y=11, w=w)
            except Exception:  # noqa: BLE001 - o logo faltando não pode impedir o termo
                pass
    pdf.set_y(27)
    pdf.set_draw_color(*VERDE)
    pdf.set_line_width(0.8)
    pdf.line(15, pdf.get_y(), 195, pdf.get_y())
    pdf.set_line_width(0.2)
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*VERDE)
    pdf.cell(0, 4, _t("FAEC - SENAR CEARÁ"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 15)
    pdf.set_text_color(*VERDE_ESCURO)
    pdf.cell(0, 7.5, _t(f"Termo de Adesão - Projeto Valores{(' - ' + ano) if ano else ''}"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(*CINZA)
    pdf.cell(0, 4.5, _t("Projeto Valores Humanos - Brincando e cultivando os valores humanos"), new_x="LMARGIN", new_y="NEXT")

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
    else:
        _tabela_escolas(pdf, escolas)

    # termo + assinaturas ficam juntos; só muda de página se não couberem no que sobrou
    if pdf.get_y() > pdf.h - 16 - 126:
        pdf.add_page()
    _secao(pdf, 6, "Termo de Adesão e Compromisso")
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(42, 38, 32)
    pdf.set_fill_color(251, 250, 243)
    pdf.set_draw_color(*BORDA)
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
    pdf.multi_cell(0, 5, _t(texto1), border=1, fill=True, new_x="LMARGIN", new_y="NEXT", padding=2.5)
    pdf.ln(2)
    pdf.multi_cell(0, 5, _t(texto2), border=1, fill=True, new_x="LMARGIN", new_y="NEXT", padding=2.5)

    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.set_text_color(*CINZA)
    pdf.cell(0, 5, "Assinaturas", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
    _bloco_assinaturas(pdf, a, c, signatarios)

    # ---- comprovação das assinaturas eletrônicas (no mesmo fluxo, sem página nova à toa) ----
    ordem = {"prefeito": 0, "secretario": 1, "sindicato": 2, "coordenador": 3}
    ordenados = sorted(signatarios, key=lambda x: ordem.get(x["papel"], 9))
    cpf_da_ficha = {"prefeito": a.get("prefeito_cpf"), "secretario": a.get("secretario_cpf"), "coordenador": c.get("cpf")}
    if pdf.get_y() > pdf.h - 16 - (34 + 13 * len(ordenados)):
        pdf.add_page()
    pdf.ln(2)
    pdf.set_draw_color(*BORDA)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*VERDE_ESCURO)
    pdf.cell(0, 5, _t("Comprovação das assinaturas eletrônicas"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(42, 38, 32)
    pdf.multi_cell(
        0, 3.8,
        _t(
            "Assinaturas colhidas pelo Painel do Projeto Valores Humanos por link pessoal enviado ao e-mail de cada signatário, "
            "com confirmação por código de 6 dígitos enviado ao mesmo e-mail. Assinatura eletrônica simples (art. 4º, inciso I, "
            "da Lei nº 14.063/2020), com registro de data, hora, endereço IP e navegador."
        ),
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(1.5)
    for s in ordenados:
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*VERDE_ESCURO)
        pdf.cell(0, 4.2, _t(f"{ROTULO_PAPEL.get(s['papel'], s['papel'])}: {s['nome']} - CPF {cpf_formatado(s.get('cpf') or cpf_da_ficha.get(s['papel'])) or '-'} <{s['email']}>"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(42, 38, 32)
        pdf.cell(0, 3.8, _t(f"{data_hora_curta(s.get('assinado_em'))} (horário de Fortaleza)  |  IP {s.get('ip') or '-'}"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 6.5)
        pdf.set_text_color(*CINZA)
        pdf.multi_cell(0, 3.3, _t(f"Navegador: {(s.get('user_agent') or '-')[:140]}"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1.2)

    pdf.set_font("Courier", "", 6.5)
    pdf.set_text_color(42, 38, 32)
    pdf.multi_cell(0, 3.3, _t(f"Pedido: {pedido_id}\nSHA-256 dos dados do termo: {hash_termo}"), new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())
