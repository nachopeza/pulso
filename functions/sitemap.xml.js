// GET /sitemap.xml → la lista de todas las páginas de pulso para Google y otros buscadores:
// portada, hemeroteca (cada día) y cada noticia publicada en su página /noticia/<id>.
import { PUBLICADA, diaMadrid, isoMadrid } from '../servidor/comun.js';

export async function onRequestGet({ env }) {
  const sitio = env.SITIO || 'https://pulso.com.es';
  const ahora = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT id, publicar_en, actualizada FROM noticias WHERE ${PUBLICADA} ORDER BY publicar_en DESC LIMIT 45000`
  ).bind(ahora).all();

  const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const entrada = (loc, mod, freq) => `<url><loc>${x(loc)}</loc>${mod ? `<lastmod>${isoMadrid(mod)}</lastmod>` : ''}${freq ? `<changefreq>${freq}</changefreq>` : ''}</url>`;
  const dias = new Map();
  for (const r of results) {
    const d = diaMadrid(r.publicar_en);
    dias.set(d, Math.max(dias.get(d) || 0, Math.min(r.actualizada || r.publicar_en, ahora)));
  }
  const urls = [
    entrada(`${sitio}/`, results[0]?.publicar_en, 'hourly'),
    entrada(`${sitio}/hemeroteca`, results[0]?.publicar_en, 'daily'),
    ...[...dias].map(([d, mod]) => entrada(`${sitio}/hemeroteca/${d}`, mod)),
    ...results.map((r) => entrada(`${sitio}/noticia/${r.id}`, Math.min(Math.max(r.publicar_en, r.actualizada || 0), ahora))),
    ...['aviso-legal', 'privacidad', 'cookies'].map((p) => entrada(`${sitio}/${p}`))
  ];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } });
}
