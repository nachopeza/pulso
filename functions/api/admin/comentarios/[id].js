// PUT    /api/admin/comentarios/<id> { estado: 'visible' | 'oculto' } → mostrar u ocultar
//        (al volver a mostrarlo se ponen a cero las denuncias: ya está revisado)
// DELETE /api/admin/comentarios/<id> → borrarlo del todo
import { json, fallo, leerJSON, puede } from '../../../../servidor/comun.js';

export async function onRequestPut({ request, env, params, data }) {
  if (!puede.publicar(data.usuario)) return fallo('Solo un editor puede moderar.', 403);
  const c = await leerJSON(request);
  if (!['visible', 'oculto'].includes(c?.estado)) return fallo('Estado no válido.');
  const id = Number(params.id);
  await env.DB.batch([
    env.DB.prepare(`UPDATE comentarios SET estado = ?${c.estado === 'visible' ? ', denuncias = 0' : ''} WHERE id = ?`).bind(c.estado, id),
    ...(c.estado === 'visible' ? [env.DB.prepare('DELETE FROM denuncias WHERE comentario = ?').bind(id)] : [])
  ]);
  return json({ ok: true });
}

export async function onRequestDelete({ env, params, data }) {
  if (!puede.publicar(data.usuario)) return fallo('Solo un editor puede moderar.', 403);
  const id = Number(params.id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM comentarios WHERE id = ?').bind(id),
    env.DB.prepare('DELETE FROM denuncias WHERE comentario = ?').bind(id)
  ]);
  return json({ ok: true });
}
