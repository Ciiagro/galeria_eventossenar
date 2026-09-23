"""
Entrada única do backend no Vercel.

Em vez de manter uma cópia de cada rota em api/*.py (que ficavam
desatualizadas em relação ao app.py), o Vercel roda o MESMO Flask do
app.py que você usa localmente. O vercel.json manda todo /api/* pra cá.
"""
import importlib.util
import os
import sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, RAIZ)

# Carrega app.py pelo caminho (existe também a pasta app/ do Next.js,
# então "import app" poderia ser ambíguo).
_spec = importlib.util.spec_from_file_location("backend_flask", os.path.join(RAIZ, "app.py"))
_modulo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_modulo)

app = _modulo.app
