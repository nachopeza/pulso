"""Entrega al panel de pulso una edición (agente redactor) o una escaleta de redes (community manager).

Uso:  python3 scripts/enviar.py edicion.json
      python3 scripts/enviar.py escaleta.json     (si el archivo trae "piezas", es una escaleta)
      python3 scripts/enviar.py ultimahora.json   (si trae "ultimaHora", pone o quita la «Última hora»)

Necesita la variable de entorno PULSO_AGENTE_KEY (la clave del agente).
PULSO_URL cambia la web de destino (por defecto https://pulso.com.es; en local http://localhost:8788).
Si no se puede conectar con pulso.com.es, lo intenta con el dominio antiguo, pulsomedio.es, cuya /api/ sigue activa.
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

es_escaleta = isinstance(edicion, dict) and "piezas" in edicion
es_ultima = isinstance(edicion, dict) and "ultimaHora" in edicion
ruta = "/api/agente/ultimahora" if es_ultima else "/api/agente/escaleta" if es_escaleta else "/api/agente/edicion"
if es_ultima:
    # {"ultimaHora": {...}} la pone (o la cambia); {"ultimaHora": null} la quita
    edicion = edicion["ultimaHora"] or {"quitar": True}
if os.environ.get("PULSO_URL"):
    destinos = [os.environ["PULSO_URL"].rstrip("/")]
else:
    # Dominio nuevo primero; el antiguo de reserva (por si la red del entorno aún no permite el nuevo)
    destinos = ["https://pulso.com.es", "https://pulsomedio.es"]
cuerpo = json.dumps(edicion, ensure_ascii=False).encode("utf-8")

for i, base in enumerate(destinos):
    url = base + ruta
    peticion = urllib.request.Request(
        url, data=cuerpo,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {clave}",
                 "User-Agent": "pulso-agente/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(peticion, timeout=120) as r:
            d = json.load(r)
        if es_escaleta:
            print(f"Escaleta entregada: {d['piezas']} piezas ({d['tanda']}, {d['dia']}). Nacho las revisa en el panel.")
        else:
            print(f"Edición {d['tipo']} entregada: {d['noticias']} noticias, {d['propuestas']} propuestas para publicar.")
            print(f"Se publica sola a las {d['publicaA'][11:16]} si nadie la revisa antes.")
        print("Email de aviso enviado." if d.get("email") else "OJO: no se ha podido enviar el email de aviso.")
        sys.exit(0)
    except urllib.error.HTTPError as e:
        # El servidor ha respondido: el problema es el contenido, no la conexión. No se prueba otro dominio.
        try:
            d = json.load(e)
        except Exception:
            d = {"error": e.reason}
        print(f"El panel lo ha rechazado ({e.code}): {d.get('error')}")
        for x in d.get("errores", []):
            print(" -", x)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"No se puede conectar con {url}: {e.reason}")
        if i + 1 < len(destinos):
            print(f"Pruebo con {destinos[i + 1]}…")

print("Si es una sesión en la nube, el dominio tiene que estar permitido en la red del entorno.")
sys.exit(1)
