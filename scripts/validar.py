"""Comprueba que data/noticias.json está bien antes de publicarlo.

Uso:  python3 scripts/validar.py
Si todo está bien, termina con "Todo correcto". Si no, explica cada error y sale con código 1.
"""
import json
import os
import re
import sys
from datetime import datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATEGORIAS = {"elecciones", "espana", "mundo", "economia", "tecnologia", "clima", "cultura", "deportes"}
MOMENTOS = {"manana", "tarde", "noche"}
OBLIGATORIOS = ["id", "categoria", "momento", "fecha", "titular", "entradilla", "puntos", "fuentes"]

errores = []


def error(texto):
    errores.append(texto)


def es_url(u):
    return isinstance(u, str) and re.match(r"^https?://", u)


def fecha_ok(f):
    try:
        datetime.fromisoformat(f)
        return True
    except (TypeError, ValueError):
        return False


try:
    datos = json.load(open(os.path.join(RAIZ, "data", "noticias.json"), encoding="utf-8"))
except Exception as e:  # JSON roto: no tiene sentido seguir
    print(f"El JSON no se puede leer: {e}")
    sys.exit(1)

if not fecha_ok(datos.get("actualizado")):
    error("'actualizado' no es una fecha válida (ejemplo: 2026-11-25T07:30:00+01:00)")

noticias = datos.get("noticias", [])
ids = set()
for n in noticias:
    nid = n.get("id", "¿sin id?")
    for campo in OBLIGATORIOS:
        if not n.get(campo):
            error(f"{nid}: falta '{campo}'")
    if nid in ids:
        error(f"{nid}: id repetido")
    ids.add(nid)
    if not re.match(r"^[a-z0-9-]+$", nid):
        error(f"{nid}: el id solo puede tener minúsculas, números y guiones")
    if n.get("categoria") not in CATEGORIAS:
        error(f"{nid}: categoría desconocida '{n.get('categoria')}'")
    if n.get("momento") not in MOMENTOS:
        error(f"{nid}: momento desconocido '{n.get('momento')}'")
    if not fecha_ok(n.get("fecha")):
        error(f"{nid}: fecha no válida")
    if len(n.get("titular", "")) > 110:
        error(f"{nid}: titular demasiado largo ({len(n['titular'])} caracteres, máximo 110)")
    if len(n.get("puntos", [])) > 4:
        error(f"{nid}: más de 4 puntos (en Flash no caben; usa 2 o 3)")
    for f in n.get("fuentes", []):
        if not f.get("medio") or not es_url(f.get("url")):
            error(f"{nid}: fuente sin medio o sin enlace http(s)")
    for t in n.get("titulares") or []:
        if not t.get("medio") or not t.get("titular") or not es_url(t.get("url")):
            error(f"{nid}: titular comparado incompleto (medio, titular literal y enlace)")
    im = n.get("imagen")
    if im:
        if not im.get("alt") or not im.get("credito") or not im.get("licencia"):
            error(f"{nid}: la foto necesita alt, credito y licencia")
        src = im.get("src", "")
        if not es_url(src) and not os.path.exists(os.path.join(RAIZ, src)):
            error(f"{nid}: no existe el archivo de la foto {src}")

destacadas = [n["id"] for n in noticias if n.get("destacado")]
if len(destacadas) != 1:
    error(f"Tiene que haber exactamente 1 noticia destacada y hay {len(destacadas)}: {destacadas}")

for clave, m in (datos.get("momentos") or {}).items():
    if clave not in MOMENTOS:
        error(f"momento desconocido '{clave}'")
    for p in m.get("puntos", []):
        if p.get("id") not in ids:
            error(f"momentos.{clave}: apunta a una noticia que no existe ({p.get('id')})")

if errores:
    print("Hay que corregir esto:")
    for e in errores:
        print(" -", e)
    sys.exit(1)
print(f"Todo correcto: {len(noticias)} noticias.")
