"""Busca fotos libres (Wikimedia Commons) para una noticia de pulso.

Uso:  python3 scripts/fotos.py "La Restinga El Hierro"
      python3 scripts/fotos.py "Congreso de los Diputados hemiciclo" 5     (cuántas enseñar; 6 por defecto)

Cada resultado sale con el bloque "imagen" listo para copiar en edicion.json: solo falta escribir "alt"
(qué se ve en la foto). Pregunta primero a pulso (que busca en Commons por nosotros) y, si no puede,
va directo a Commons identificándose (Commons rechaza a quien no se identifica).
Usa PULSO_AGENTE_KEY como enviar.py. PULSO_URL cambia la web (por defecto https://pulso.com.es).
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

AGENTE = "pulso-agente/1.0 (https://pulso.com.es; hola@pulso.com.es)"
LIBRE = re.compile(r"^(cc0|cc by(-sa)? [\d.]+|public domain|pd|attribution)", re.I)


def pedir(url, cabeceras):
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE, **cabeceras})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)


def desde_pulso(q):
    clave = os.environ.get("PULSO_AGENTE_KEY")
    if not clave:
        return None
    webs = [os.environ["PULSO_URL"].rstrip("/")] if os.environ.get("PULSO_URL") else ["https://pulso.com.es", "https://pulsomedio.es"]
    for web in webs:
        try:
            return pedir(f"{web}/api/agente/fotos?q={urllib.parse.quote(q)}", {"Authorization": f"Bearer {clave}"})["fotos"]
        except Exception as e:  # probamos la siguiente
            print(f"(pulso no responde en {web}: {e})", file=sys.stderr)
    return None


def sin_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]*>", "", s or "")).strip()


def desde_commons(q):
    p = urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": "6",
        "gsrsearch": f"{q} filetype:bitmap", "gsrlimit": "12", "prop": "imageinfo",
        "iiprop": "url|extmetadata|size", "iiurlwidth": "1200"})
    d = pedir(f"https://commons.wikimedia.org/w/api.php?{p}", {})
    fotos = []
    for pag in sorted(d.get("query", {}).get("pages", {}).values(), key=lambda x: x.get("index", 0)):
        i = (pag.get("imageinfo") or [{}])[0]
        m = i.get("extmetadata", {})
        lic = sin_html(m.get("LicenseShortName", {}).get("value"))
        if not i.get("thumburl") or not LIBRE.match(lic):
            continue
        fotos.append({
            "descripcion": sin_html(m.get("ImageDescription", {}).get("value"))[:200] or pag["title"],
            "tamano": f"{i.get('width')}x{i.get('height')}",
            "imagen": {"src": i["thumburl"].split("?")[0], "alt": "", "credito": sin_html(m.get("Artist", {}).get("value"))[:120] or "Autoría en Wikimedia Commons",
                       "licencia": lic, "enlace": i.get("descriptionurl")}})
    return fotos


if len(sys.argv) < 2:
    print(__doc__)
    sys.exit(2)
consulta = sys.argv[1]
cuantas = int(sys.argv[2]) if len(sys.argv) > 2 else 6
fotos = desde_pulso(consulta)
if fotos is None:
    try:
        fotos = desde_commons(consulta)
    except Exception as e:
        print(f"No se ha podido buscar en Commons: {e}")
        sys.exit(1)
if not fotos:
    print(f"Sin fotos libres para «{consulta}». Prueba con otras palabras (lugar, edificio, objeto) o en inglés.")
    sys.exit(0)
for n, f in enumerate(fotos[:cuantas], 1):
    print(f"\n[{n}] {f['descripcion']} ({f['tamano']})")
    print(json.dumps(f["imagen"], ensure_ascii=False))
