// GET /api/admin/portada → lo que ven ahora los lectores, en su orden, y el anuncio
// PUT /api/admin/portada { orden: [ids] } o { anuncio: {texto, url} | null }
import { json, fallo, leerJSON, filaPanel, puede, VISIBLE, PORTADA_HORAS } from '../../../servidor/comun.js';

export async function onRequestGet({ env }) {
  const ahora = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT * FROM noticias WHERE ${VISIBLE} AND (publicar_en >= ?2 OR fijada = 1)
     ORDER BY destacado DESC, orden IS NULL, orden, publicar_en DESC LIMIT 60`
  ).bind(ahora, ahora - PORTADA_HORAS * 60 * 60 * 1000).all();
  const a = await env.DB.prepare("SELECT valor FROM ajustes WHERE clave = 'anuncio'").first();
  return json({ noticias: results.map((f) => filaPanel(f, ahora)), anuncio: a?.valor ? JSON.parse(a.valor) : null });
}

export async function onRequestPut({ request, env, data }) {
  if (!puede.publicar(data.usuario)) return fallo('Solo un editor puede cambiar la portada.', 403);
  const cuerpo = await leerJSON(request);
  if (Array.isArray(cuerpo?.orden)) {
    const ids = cuerpo.orden.filter((x) => typeof x === 'string').slice(0, 60);
    await env.DB.batch([
      env.DB.prepare('UPDATE noticias SET orden = NULL WHERE orden IS NOT NULL'),
      ...ids.map((id, i) => env.DB.prepare('UPDATE noticias SET orden = ?, actualizada = ? WHERE id = ?').bind(i + 1, Date.now(), id))
    ]);
    return json({ ok: true });
  }
  if (cuerpo && 'anuncio' in cuerpo) {
    const a = cuerpo.anuncio;
    let valor = null;
    if (a && (a.texto || a.url)) {
      if (!a.texto || !/^https?:\/\/\S+$/i.test(a.url || '')) return fallo('El anuncio necesita un texto y un enlace que empiece por http.');
      valor = JSON.stringify({ texto: String(a.texto).slice(0, 140), url: String(a.url).slice(0, 2000) });
    }
    await env.DB.prepare(
      `INSERT INTO ajustes (clave, valor, autor, actualizado) VALUES ('anuncio', ?, ?, ?)
       ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, autor = excluded.autor, actualizado = excluded.actualizado`
    ).bind(valor, data.usuario.email, Date.now()).run();
    return json({ ok: true });
  }
  return fallo('No hay nada que guardar.');
}
