"""
Termo de Compromisso do(a) Coordenador(a) do Projeto Valores.

O texto fica aqui (um lugar só): a tela mostra exatamente o que o PDF assinado traz.
Para mudar uma cláusula, edite CLAUSULAS; quem já assinou continua com a cópia que assinou.
"""

import hashlib
import json

from fpdf import FPDF

from lib.edicao import rotulo_edicao
from lib.termo_pdf import BORDA, CINZA, VERDE, VERDE_ESCURO, _t, cpf_formatado, data_hora_br, os, RAIZ

TITULO = "Termo de Compromisso do(a) Coordenador(a) Municipal"

# Texto oficial. Cada parágrafo é uma lista de pedaços [texto, negrito?].
PARAGRAFOS = [
    [("Pelo presente Termo de Compromisso, o(a) Coordenador(a) Municipal acima identificado(a) declara estar ciente de sua indicação e nomeação para exercer a função de "
      "Coordenador(a) Municipal do Programa, comprometendo-se a desempenhar as atribuições e responsabilidades inerentes à função, com responsabilidade, organização e "
      "compromisso com os objetivos e as diretrizes estabelecidas pelo Programa.", False)],
    [("O(A) Coordenador(a) Municipal declara estar ciente de que são suas principais atribuições e responsabilidades:", False)],
    [("I – Acompanhar a execução do Programa no município", True),
     (", assegurando o desenvolvimento das atividades previstas e articulando-se com os responsáveis locais para o cumprimento dos objetivos estabelecidos;", False)],
    [("II – Realizar as formações junto aos professores das escolas contempladas pelo Programa", True),
     (", conforme as orientações, os conteúdos e o cronograma definidos pela coordenação responsável;", False)],
    [("III – Elaborar e encaminhar os relatórios e demais documentos solicitados", True),
     (", respeitando os prazos estabelecidos no cronograma do Programa, de modo a garantir o acompanhamento e o registro das atividades desenvolvidas.", False)],
    [("O(A) Coordenador(a) Municipal declara, ainda, que recebeu as informações necessárias sobre suas atribuições e responsabilidades e que se compromete a cumpri-las durante "
      "o período de exercício da função, mantendo comunicação com a coordenação responsável e informando eventuais dificuldades que possam comprometer a execução das atividades previstas.", False)],
    [("Por estar ciente de suas atribuições e responsabilidades, firma o presente Termo de Compromisso, assumindo o compromisso de desempenhar a função para a qual foi indicado(a), "
      "contribuindo para a adequada execução do Programa no município.", False)],
]


def montar_texto(dados: dict) -> dict:
    """Termo completo com a identificação de quem assina (nome, CPF, e-mail, município e edição)."""
    edicao = rotulo_edicao(dados.get("ciclo_nome")) or ""
    return {
        "titulo": TITULO,
        "identificacao": [
            ["Coordenador(a) Municipal", dados.get("nome") or "-"],
            ["CPF", cpf_formatado(dados.get("cpf")) if dados.get("cpf") else "(informado na assinatura)"],
            ["E-mail", dados.get("email") or "-"],
            ["Município", f"{dados['municipio_nome']} - CE" if dados.get("municipio_nome") else "-"],
            ["Edição", edicao or "-"],
        ],
        "paragrafos": [[[t, n] for t, n in par] for par in PARAGRAFOS],
        "municipio": dados.get("municipio_nome") or "",
        "escolas": list(dados.get("escolas") or []),
    }


def hash_texto(texto: dict) -> str:
    return hashlib.sha256(json.dumps(texto, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


class _PdfCompromisso(FPDF):
    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*CINZA)
        self.cell(0, 6, _t(f"Termo de Compromisso - Projeto Valores  |  página {self.page_no()}/{{nb}}"), align="C")


def gerar_pdf_compromisso(texto: dict, assinatura: dict) -> bytes:
    """`assinatura` = {nome, cpf, email, assinado_em, ip, user_agent, id, texto_hash}."""
    pdf = _PdfCompromisso(format="A4", unit="mm")
    pdf.alias_nb_pages()
    pdf.set_margins(15, 14, 15)
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()

    for arquivo, altura, proporcao, lado in (
        ("logo-valores-termo.png", 14.0, 298 / 136, "esquerda"),
        ("logo-senar-termo.png", 12.9, 370 / 140, "direita"),
    ):
        caminho = os.path.join(RAIZ, "public", arquivo)
        if os.path.exists(caminho):
            try:
                largura = altura * proporcao
                x = 15 if lado == "esquerda" else 195 - largura
                pdf.image(caminho, x=x, y=10 + (14.0 - altura) / 2, w=largura, h=altura)
            except Exception:  # noqa: BLE001 - logo faltando não impede o termo
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
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(*VERDE_ESCURO)
    pdf.multi_cell(0, 7, _t(texto["titulo"]), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # identificação de quem assina
    pdf.set_fill_color(251, 250, 243)
    pdf.set_draw_color(*BORDA)
    pdf.set_text_color(42, 38, 32)
    for rotulo, valor in texto["identificacao"]:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(52, 6, _t(rotulo + ":"), fill=True, border="LTB")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(0, 6, _t(" " + str(valor)), fill=True, border="RTB", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    escolas = texto.get("escolas") or []
    if escolas:
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*VERDE_ESCURO)
        pdf.cell(0, 6, _t(f"Escolas sob a coordenação ({len(escolas)}):"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9.5)
        pdf.set_text_color(42, 38, 32)
        for i, nome_escola in enumerate(escolas, 1):
            pdf.multi_cell(0, 5, _t(f"{i}. {nome_escola}"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)
    else:
        pdf.ln(2)
    pdf.set_text_color(42, 38, 32)

    pdf.set_font("Helvetica", "", 10.5)
    for par in texto["paragrafos"]:
        md = "".join(("**" + t + "**") if n else t for t, n in par)
        pdf.multi_cell(0, 5.6, _t(md), align="J", markdown=True, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2.5)

    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 10.5)
    pdf.cell(28, 6, _t("Município:"))
    pdf.set_font("Helvetica", "", 10.5)
    pdf.cell(0, 6, _t(texto.get("municipio") or ""), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 10.5)
    pdf.cell(28, 6, _t("Data:"))
    pdf.set_font("Helvetica", "", 10.5)
    pdf.cell(0, 6, _t("(preenchida na assinatura)" if assinatura.get("previa") else data_hora_br(assinatura.get("assinado_em"))[:10]), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 6, _t("Assinatura do(a) Coordenador(a) Municipal (assinatura eletrônica abaixo)"), new_x="LMARGIN", new_y="NEXT")

    if assinatura.get("previa"):
        pdf.ln(6)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*CINZA)
        pdf.multi_cell(0, 5.5, _t("PRÉVIA: este termo ainda não foi assinado. A assinatura eletrônica é feita pelo coordenador, "
                                  "no sistema, com um código enviado ao e-mail cadastrado."), align="C", new_x="LMARGIN", new_y="NEXT")
        return bytes(pdf.output())

    # comprovação da assinatura eletrônica
    if pdf.get_y() > pdf.h - 70:
        pdf.add_page()
    pdf.ln(5)
    pdf.set_draw_color(*BORDA)
    pdf.set_fill_color(241, 239, 227)
    pdf.set_font("Helvetica", "B", 10.5)
    pdf.set_text_color(*VERDE_ESCURO)
    pdf.cell(0, 7, _t("  Assinatura eletrônica"), fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(42, 38, 32)
    linhas = [
        ("Assinado por", f"{assinatura.get('nome') or ''} (CPF {cpf_formatado(assinatura.get('cpf'))})"),
        ("E-mail de confirmação", assinatura.get("email") or "-"),
        ("Data e hora", data_hora_br(assinatura.get("assinado_em"))),
        ("Endereço IP", assinatura.get("ip") or "-"),
        ("Navegador", (assinatura.get("user_agent") or "-")[:110]),
        ("Código do documento", assinatura.get("id") or "-"),
        ("Impressão digital do texto", assinatura.get("texto_hash") or "-"),
    ]
    for rotulo, valor in linhas:
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(48, 5.2, _t(rotulo + ":"))
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(0, 5.2, _t(valor), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*CINZA)
    pdf.multi_cell(0, 4.2, _t("Assinatura eletrônica simples (Lei nº 14.063/2020): a identidade foi confirmada pelo login no sistema e por um código de "
                              "6 dígitos enviado ao e-mail cadastrado."), align="J", new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())
