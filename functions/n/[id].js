// GET /n/<id> → página para compartir una noticia en redes.
// Las redes (X, Bluesky, WhatsApp…) leen estas etiquetas para pintar la tarjeta del enlace
// con el titular, la entradilla y la foto de ESA noticia. Las personas que pulsan el enlace
// van directas a la noticia dentro de la web (/#<id>).
import { VISIBLE } from '../../servidor/comun.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequestGet({ env, params }) {
  const id = String(params.id || '');
  const sitio = env.SITIO || 'https://pulso.com.es';
  const f = /^[a-z0-9-]{3,70}$/.test(id)
    ? await env.DB.prepare(`SELECT id, titular, datos FROM noticias WHERE id = ?2 AND ${VISIBLE}`).bind(Date.now(), id).first()
    : null;
  if (!f) return Response.redirect(`${sitio}/`, 302);

  const d = JSON.parse(f.datos || '{}');
  const src = d.imagen?.src;
  const imagen = !src ? `${sitio}/img/compartir.png` : /^https?:\/\//.test(src) ? src : `${sitio}/${src.replace(/^\//, '')}`;
  const destino = `${sitio}/#${f.id}`;
  const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<title>${esc(f.titular)} · pulso</title>
<meta name="description" content="${esc(d.entradilla || '')}">
<link rel="canonical" href="${esc(destino)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="pulso">
<meta property="og:title" content="${esc(f.titular)}">
<meta property="og:description" content="${esc(d.entradilla || 'Las noticias del día, en corto y con fuentes.')}">
<meta property="og:url" content="${esc(`${sitio}/n/${f.id}`)}">
<meta property="og:image" content="${esc(imagen)}">
${src ? '' : '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'}
<meta property="og:image:alt" content="${esc(d.imagen?.alt || 'pulso: las noticias del día, en corto y con fuentes.')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@pulsomedio">
<meta http-equiv="refresh" content="0; url=${esc(destino)}">
</head><body>
<p><a href="${esc(destino)}">${esc(f.titular)}</a></p>
<script>
// Pasa a la web de dónde venía la persona (?ref= o la página anterior), para las estadísticas
var ref = new URLSearchParams(location.search).get('ref') || '';
try { if (!ref && document.referrer) ref = new URL(document.referrer).hostname; } catch (e) {}
location.replace(ref ? ${JSON.stringify(`${sitio}/?ref=`)} + encodeURIComponent(ref) + ${JSON.stringify(`#${f.id}`)} : ${JSON.stringify(destino)});
</script>
</body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
