#!/bin/sh
# Copia en web/ solo los archivos que se publican (lo usan el workflow y las pruebas en local).
# Las funciones del servidor (functions/) las añade Cloudflare por su cuenta al publicar.
set -e
cd "$(dirname "$0")/.."
rm -rf web
mkdir web
cp -R index.html aviso-legal.html privacidad.html cookies.html _headers favicon.svg apple-touch-icon.png \
  css js data img fonts admin web/
