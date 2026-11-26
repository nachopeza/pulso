#!/bin/sh
# Copia en web/ solo los archivos que se publican (lo usan el workflow y las pruebas en local).
# Las funciones del servidor (functions/) las añade Cloudflare por su cuenta al publicar.
set -e
cd "$(dirname "$0")/.."
rm -rf web
mkdir web
cp -R index.html aviso-legal.html privacidad.html cookies.html _headers favicon.svg apple-touch-icon.png manifest.webmanifest \
  css js data img fonts admin web/

# Versión en los CSS y JS (?v=…): cada publicación cambia la dirección, así ningún navegador
# se queda con una copia vieja del diseño o del código. Solo se toca la copia de web/.
VERSION=$(git rev-parse --short HEAD 2>/dev/null || date +%s)
for f in web/index.html web/aviso-legal.html web/privacidad.html web/cookies.html web/admin/index.html; do
  sed -i.bak -E "s#(href|src)=\"(css/[a-z]+\.css|js/app\.js|admin\.css|admin\.js)\"#\1=\"\2?v=$VERSION\"#g" "$f" && rm -f "$f.bak"
done
