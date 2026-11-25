"""Pasa data/noticias.json a la base de datos (se usa una sola vez, al estrenar el panel).

Uso:
  python3 scripts/importar.py > /tmp/importar.sql
  npx wrangler d1 execute pulso --remote --file /tmp/importar.sql
"""
import json
import os
import time
from datetime import datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Guías que se quedan en portada aunque pasen 48 horas
FIJADAS = {"como-votar-29n", "dhondt-explicado", "jornada-reflexion", "detectar-bulos"}


def sql(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(int(v))
    return "'" + str(v).replace("'", "''") + "'"


datos = json.load(open(os.path.join(RAIZ, "data", "noticias.json"), encoding="utf-8"))
ahora = int(time.time() * 1000)
print("DELETE FROM noticias; DELETE FROM versiones; DELETE FROM momentos;")
for n in datos["noticias"]:
    n = dict(n)
    nid = n.pop("id")
    destacado = 1 if n.pop("destacado", False) else 0
    ms = int(datetime.fromisoformat(n["fecha"]).timestamp() * 1000)
    fila = (nid, "publicada", ms, 1, 0, destacado, 1 if nid in FIJADAS else 0, n["categoria"], n["titular"],
            json.dumps(n, ensure_ascii=False), None, "importada", ms, ahora)
    print("INSERT INTO noticias (id, estado, publicar_en, revisada, propuesta, destacado, fijada, categoria, titular, "
          "datos, edicion, autor, creada, actualizada) VALUES (" + ", ".join(sql(x) for x in fila) + ");")
    print("INSERT INTO versiones (noticia, fecha, autor, accion, fila) SELECT id, %d, 'importada', 'importada desde noticias.json', "
          "json_object('estado', estado, 'publicar_en', publicar_en, 'retirar_en', retirar_en, 'destacado', destacado, "
          "'fijada', fijada, 'categoria', categoria, 'titular', titular, 'datos', json(datos)) FROM noticias WHERE id = %s;"
          % (ahora, sql(nid)))
if datos.get("momentos"):
    print("INSERT INTO momentos (desde, datos, autor, actualizado) VALUES (%d, %s, 'importada', %d);"
          % (ahora - 60000, sql(json.dumps(datos["momentos"], ensure_ascii=False)), ahora))
if datos.get("anuncio"):
    print("INSERT OR REPLACE INTO ajustes (clave, valor, autor, actualizado) VALUES ('anuncio', %s, 'importada', %d);"
          % (sql(json.dumps(datos["anuncio"], ensure_ascii=False)), ahora))
