"""Entrega la edición del día al panel de pulso.

Uso:  python3 scripts/enviar.py edicion.json

Necesita la variable de entorno PULSO_AGENTE_KEY (la clave del agente).
PULSO_URL cambia la web de destino (por defecto https://pulsomedio.es; en local http://localhost:8788).
Si el servidor encuentra errores, los lista uno por uno y no guarda nada: corrígelos y vuelve a enviar.
"""
import json
import os
import sys
import urllib.error
import urllib.request

if len(sys.argv) != 2:
    print(__doc__)
    sys.exit(2)

clave = os.environ.get("PULSO_AGENTE_KEY")
if not clave:
    print("Falta la variable de entorno PULSO_AGENTE_KEY: sin ella el panel no acepta la edición.")
    sys.exit(1)

try:
    edicion = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception as e:  # JSON roto: mejor saberlo antes de enviar
    print(f"El archivo no es un JSON válido: {e}")
    sys.exit(1)

url = os.environ.get("PULSO_URL", "https://pulsomedio.es").rstrip("/") + "/api/agente/edicion"
peticion = urllib.request.Request(
    url,
    data=json.dumps(edicion, ensure_ascii=False).encode("utf-8"),
    headers={"Content-Type": "application/json", "Authorization": f"Bearer {clave}",
             "User-Agent": "pulso-agente/1.0"},
    method="POST",
)
try:
    with urllib.request.urlopen(peticion, timeout=120) as r:
        d = json.load(r)
    print(f"Edición entregada: {d['noticias']} noticias, {d['propuestas']} propuestas para publicar.")
    print(f"Se publica sola a las {d['publicaA'][11:16]} si nadie la revisa antes.")
    print("Email de aviso enviado." if d.get("email") else "OJO: no se ha podido enviar el email de aviso.")
except urllib.error.HTTPError as e:
    try:
        d = json.load(e)
    except Exception:
        d = {"error": e.reason}
    print(f"El panel ha rechazado la edición ({e.code}): {d.get('error')}")
    for x in d.get("errores", []):
        print(" -", x)
    sys.exit(1)
except urllib.error.URLError as e:
    print(f"No se puede conectar con {url}: {e.reason}")
    print("Si es una sesión en la nube, el dominio tiene que estar permitido en la red del entorno.")
    sys.exit(1)
