// DELETE /api/lector/comentarios/<id>          → borrar un comentario tuyo
// POST   /api/lector/comentarios/<id> { denunciar: true } → avisar a la redacción de un comentario
//        Con 3 denuncias de personas distintas se oculta solo hasta que la redacción lo revise.
import { json, fallo, leerJSON } from '../../../../servidor/comun.js';

const OCULTAR_CON = 3;

export async function onRequestDelete({ env, params, data }) {
  if (!data.lector) return fallo('Inicia sesión.', 401);
  const r = await env.DB.prepare('DELETE FROM comentarios WHERE id = ? AND email = ?').bind(Number(params.id), data.lector.email).run();
  if (!r.meta.changes) return fallo('Ese comentario no es tuyo o ya no existe.', 404);
  await env.DB.prepare('DELETE FROM denuncias WHERE comentario = ?').bind(Number(params.id)).run();
  return json({ ok: true });
}

export async function onRequestPost({ request, env, params, data }) {
  if (!data.lector) return fallo('Inicia sesión para denunciar.', 401);
  const c = await leerJSON(request);
  if (c?.denunciar !== true) return fallo('No sé qué hacer con esto.');
  const id = Number(params.id);
  const com = await env.DB.prepare('SELECT email FROM comentarios WHERE id = ?').bind(id).first();
  if (!com) return fallo('Ese comentario ya no existe.', 404);
  if (com.email === data.lector.email) return fallo('No puedes denunciar tu propio comentario.');
  const r = await env.DB.prepare('INSERT OR IGNORE INTO denuncias (comentario, email, creada) VALUES (?, ?, ?)')
    .bind(id, data.lector.email, Date.now()).run();
  if (r.meta.changes) {
    await env.DB.prepare(
      `UPDATE comentarios SET denuncias = denuncias + 1,
         estado = CASE WHEN denuncias + 1 >= ? THEN 'oculto' ELSE estado END WHERE id = ?`
    ).bind(OCULTAR_CON, id).run();
  }
  return json({ ok: true });
}
