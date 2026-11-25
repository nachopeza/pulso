// GET /api/admin/momentos → los "mañana, tarde y noche" que se ven ahora y, si hay, los de la próxima edición
// PUT /api/admin/momentos { desde, datos } → los cambia
import { json, fallo, leerJSON, puede, MOMENTOS, VISIBLE } from '../../../servidor/comun.js';

export async function onRequestGet({ env }) {
  const ahora = Date.now();
  const actual = await env.DB.prepare('SELECT * FROM momentos WHERE desde <= ? ORDER BY desde DESC LIMIT 1').bind(ahora).first();
  const siguiente = await env.DB.prepare('SELECT * FROM momentos WHERE desde > ? ORDER BY desde LIMIT 1').bind(ahora).first();
  // Noticias a las que pueden apuntar: las que se ven y las programadas
  const { results } = await env.DB.prepare(
    `SELECT id, titular, publicar_en FROM noticias WHERE (${VISIBLE}) OR (estado = 'publicada' AND publicar_en > ?1)
     ORDER BY publicar_en DESC LIMIT 80`
  ).bind(ahora).all();
  const leer = (m) => (m ? { desde: m.desde, datos: JSON.parse(m.datos), autor: m.autor } : null);
  return json({ actual: leer(actual), siguiente: leer(siguiente), opciones: results });
}

export async function onRequestPut({ request, env, data }) {
  if (!puede.publicar(data.usuario)) return fallo('Solo un editor puede cambiar los momentos.', 403);
  const cuerpo = await leerJSON(request);
  const limpio = {};
  for (const k of MOMENTOS) {
    const m = cuerpo?.datos?.[k] || {};
    limpio[k] = {
      titulo: String(m.titulo || '').trim().slice(0, 60),
      puntos: (Array.isArray(m.puntos) ? m.puntos : [])
        .map((p) => ({ texto: String(p?.texto || '').trim().slice(0, 140), id: String(p?.id || '') }))
        .filter((p) => p.texto && p.id).slice(0, 4)
    };
    if (!limpio[k].titulo) return fallo('Cada momento necesita un título.');
  }
  const ahora = Date.now();
  const desde = Number(cuerpo?.desde);
  const existe = desde && await env.DB.prepare('SELECT desde FROM momentos WHERE desde = ?').bind(desde).first();
  if (existe) {
    await env.DB.prepare('UPDATE momentos SET datos = ?, autor = ?, actualizado = ? WHERE desde = ?')
      .bind(JSON.stringify(limpio), data.usuario.email, ahora, desde).run();
  } else {
    await env.DB.prepare('INSERT INTO momentos (desde, datos, autor, actualizado) VALUES (?, ?, ?, ?)')
      .bind(ahora, JSON.stringify(limpio), data.usuario.email, ahora).run();
  }
  return json({ ok: true });
}
