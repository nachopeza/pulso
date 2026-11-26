// GET  /api/admin/commons?q=…        → busca fotos libres en Wikimedia Commons
// POST /api/admin/commons { url, nombre } → copia la elegida a nuestro almacén
import { json, fallo, leerJSON, importarFoto } from '../../../servidor/comun.js';

const AGENTE = { 'User-Agent': 'pulso-noticias/1.0 (https://pulso.com.es)' };
// Commons devuelve autor y licencia con HTML dentro: nos quedamos con el texto
const sinHTML = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
// Solo licencias que permiten publicar con crédito
const LIBRE = /^(cc0|cc by(-sa)? [\d.]+|public domain|pd|attribution)/i;

export async function onRequestGet({ request }) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 100);
  if (!q) return fallo('Escribe qué buscas.');
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrsearch: `${q} filetype:bitmap`,
    gsrlimit: '24', prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '1200'
  }).forEach(([k, v]) => api.searchParams.set(k, v));
  const r = await fetch(api, { headers: AGENTE });
  if (!r.ok) return fallo('Wikimedia Commons no responde ahora. Prueba en un momento.', 502);
  const d = await r.json();
  const fotos = Object.values(d.query?.pages || {})
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map((p) => {
      const i = p.imageinfo?.[0];
      const m = i?.extmetadata || {};
      return i && {
        titulo: sinHTML(m.ObjectName?.value) || p.title.replace(/^File:|\.\w+$/g, ''),
        miniatura: i.thumburl,
        url: i.thumburl,
        ancho: i.width,
        alto: i.height,
        credito: sinHTML(m.Artist?.value).slice(0, 120) || 'Autoría en Wikimedia Commons',
        licencia: sinHTML(m.LicenseShortName?.value),
        enlace: i.descriptionurl,
        descripcion: sinHTML(m.ImageDescription?.value).slice(0, 200)
      };
    })
    .filter((f) => f && f.miniatura && LIBRE.test(f.licencia));
  return json({ fotos });
}

export async function onRequestPost({ request, env }) {
  const c = await leerJSON(request);
  const src = await importarFoto(env, c?.url, c?.nombre);
  if (!src) return fallo('No se ha podido copiar esa foto.', 502);
  return json({ ok: true, src });
}
