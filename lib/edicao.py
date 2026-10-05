# -*- coding: utf-8 -*-
"""Nome da edição para mostrar em textos (termo, PDF, e-mails)."""

import re


def rotulo_edicao(nome) -> str:
    """'Ciclo 2026' ou 'Edição 2026' -> 'Edição 2026'; '2026' -> 'Edição 2026'; vazio -> ''.
    Assim os textos saem certos mesmo que o nome gravado no banco ainda comece com 'Ciclo'."""
    resto = re.sub(r"^\s*(ciclo|edi[cç][aã]o)\b[\s\-:]*", "", str(nome or ""), flags=re.I).strip()
    return f"Edição {resto}" if resto else ""
