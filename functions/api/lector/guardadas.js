// GET  /api/lector/guardadas → las noticias guardadas completas (aunque ya no estén en portada)
// POST /api/lector/guardadas { anadir: [ids], quitar: [ids] } → { guardadas: [ids] }
// Al entrar, la web manda aquí lo que se había guardado en el dispositivo sin cuenta.
import { json, fallo, leerJSON, PUBLICADA, isoMadrid } from '../../../servidor/comun.js';

const MAXIMO = 500;
const ids = (v) => (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && /^[a-z0-9-]{1,120}$/.test(x)).slice(0, MAXIMO);

export async function onRequestGet({ env, data }) {
  if (!data.lector) return fallo('Entra en tu cuenta para ver tus guardadas.', 401);
  const { results } = await env.DB.prepare(
    `SELECT n.* FROM guardadas g JOIN noticias n ON n.id = g.noticia
     WHERE g.email = ?2 AND ${PUBLICADA}
     ORDER BY g.creada DESC LIMIT ${MAXIMO}`
  ).bind(Date.now(), data.lector.email).all();
  const noticias = results.map((f) => {
    const d = JSON.parse(f.datos);
    return { ...d, id: f.id, categoria: f.categoria, destacado: false, fecha: d.fecha || isoMadrid(f.publicar_en) };
  });
  return json({ noticias }, 200, { 'Cache-Control': 'no-store' });
}

export async function onRequestPost({ request, env, data }) {
  if (!data.lector) return fallo('Entra en tu cuenta para guardar en todos tus dispositivos.', 401);
  const c = (await leerJSON(request)) || {};
  const email = data.lector.email;
  const anadir = ids(c.anadir);
  const quitar = ids(c.quitar);
  const { total } = await env.DB.prepare('SELECT count(*) AS total FROM guardadas WHERE email = ?').bind(email).first();
  if (total + anadir.length > MAXIMO) return fallo(`Puedes guardar hasta ${MAXIMO} noticias. Quita alguna antigua.`);
  const ahora = Date.now();
  const stmts = [
    ...anadir.map((id, i) => env.DB.prepare('INSERT OR IGNORE INTO guardadas (email, noticia, creada) VALUES (?, ?, ?)')
      .bind(email, id, ahora - i)),
    ...quitar.map((id) => env.DB.prepare('DELETE FROM guardadas WHERE email = ? AND noticia = ?').bind(email, id))
  ];
  if (stmts.length) await env.DB.batch(stmts);
  const { results } = await env.DB.prepare('SELECT noticia FROM guardadas WHERE email = ? ORDER BY creada DESC').bind(email).all();
  return json({ guardadas: results.map((r) => r.noticia) });
}
