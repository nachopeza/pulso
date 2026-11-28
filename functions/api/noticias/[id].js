// GET /api/noticias/<id> → una noticia publicada aunque ya no esté en portada.
// Así un enlace compartido hace semanas sigue abriendo su noticia.
import { json, fallo, PUBLICADA, isoMadrid } from '../../../servidor/comun.js';

export async function onRequestGet({ env, params }) {
  const f = await env.DB.prepare(`SELECT * FROM noticias WHERE id = ?2 AND ${PUBLICADA}`).bind(Date.now(), params.id).first();
  if (!f) return fallo('No existe esa noticia', 404);
  const d = JSON.parse(f.datos);
  return json({ ...d, id: f.id, categoria: f.categoria, destacado: false, fecha: d.fecha || isoMadrid(f.publicar_en) },
    200, { 'Cache-Control': 'public, max-age=300' });
}
