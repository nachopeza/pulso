// GET  /api/admin/edicion                          → la última edición que ha preparado el agente
// POST /api/admin/edicion { accion: 'publicar', ids } → publica ya las elegidas y descarta el resto
import { json, fallo, leerJSON, filaPanel, versionStmt, puede, isoMadrid, leerEdicion, VISIBLE } from '../../../servidor/comun.js';

// Clave de la última edición: "2026-11-26 2-tarde" (las antiguas son solo "2026-11-25")
async function ultimaEdicion(env) {
  const e = await env.DB.prepare('SELECT max(edicion) AS clave FROM noticias WHERE edicion IS NOT NULL').first();
  return e?.clave || null;
}

export async function onRequestGet({ env }) {
  const ahora = Date.now();
  const clave = await ultimaEdicion(env);
  const enPortada = await env.DB.prepare(`SELECT count(*) AS n FROM noticias WHERE ${VISIBLE}`).bind(ahora).first();
  if (!clave) return json({ dia: null, noticias: [], enPortada: enPortada.n });
  const { dia, tipo, nombre } = leerEdicion(clave);
  const { results } = await env.DB.prepare(
    `SELECT * FROM noticias WHERE edicion = ? ORDER BY propuesta DESC, destacado DESC, importancia DESC, creada`
  ).bind(clave).all();
  const noticias = results.map((f) => filaPanel(f, ahora));
  // Hora a la que sale sola (la de las propuestas que aún no se han publicado)
  const pendientes = results.filter((f) => f.estado === 'publicada' && f.publicar_en > ahora);
  const autoEn = pendientes.length ? Math.min(...pendientes.map((f) => f.publicar_en)) : null;
  return json({
    dia, tipo, nombre, noticias, autoEn, enPortada: enPortada.n,
    sinRevisar: results.filter((f) => !f.revisada).length,
    yaPublicada: results.some((f) => f.estado === 'publicada' && f.publicar_en <= ahora)
  });
}

export async function onRequestPost({ request, env, data }) {
  const u = data.usuario;
  if (!puede.publicar(u)) return fallo('Solo un editor puede publicar la edición.', 403);
  const cuerpo = await leerJSON(request);
  if (cuerpo?.accion !== 'publicar' || !Array.isArray(cuerpo.ids) || !cuerpo.ids.length) return fallo('Elige qué noticias publicar.');
  const clave = await ultimaEdicion(env);
  const ahora = Date.now();
  const { results } = await env.DB.prepare('SELECT * FROM noticias WHERE edicion = ?').bind(clave).all();
  const elegidas = new Set(cuerpo.ids);
  const stmts = [];
  for (const f of results) {
    const yaVisible = f.estado === 'publicada' && f.publicar_en <= ahora;
    if (yaVisible) continue;
    if (elegidas.has(f.id)) {
      const datos = JSON.parse(f.datos);
      datos.fecha = isoMadrid(ahora);
      // Si actualiza otra noticia, la vieja se quita ya, a la vez que sale la nueva
      if (datos.sustituye) {
        datos.actualizada = isoMadrid(ahora);
        stmts.push(env.DB.prepare('UPDATE noticias SET retirar_en = ?1, actualizada = ?1 WHERE id = ?2 AND retirar_en IS NOT NULL').bind(ahora, datos.sustituye));
      }
      stmts.push(env.DB.prepare(
        `UPDATE noticias SET estado = 'publicada', publicar_en = ?, retirar_en = NULL, revisada = 1, datos = ?, autor = ?, actualizada = ? WHERE id = ?`
      ).bind(ahora, JSON.stringify(datos), u.email, ahora, f.id), versionStmt(env, f.id, u.email, 'publicada con la edición'));
    } else if (f.estado !== 'descartada' && f.estado !== 'retirada') {
      stmts.push(env.DB.prepare(
        `UPDATE noticias SET estado = 'descartada', revisada = 1, autor = ?, actualizada = ? WHERE id = ?`
      ).bind(u.email, ahora, f.id), versionStmt(env, f.id, u.email, 'descartada al publicar la edición'));
    }
  }
  // Los "mañana, tarde y noche" de esta edición también salen ya
  stmts.push(env.DB.prepare('UPDATE momentos SET desde = ? WHERE desde = (SELECT min(desde) FROM momentos WHERE desde > ?)').bind(ahora, ahora));
  await env.DB.batch(stmts);
  return json({ ok: true });
}
