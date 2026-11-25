// PUT /api/admin/redes/<id> { texto?, hora?, estado?, nota?, enlace? } → corregir o decidir una pieza
// Cambiar el estado (aprobar, descartar, marcar como publicada) es cosa de un editor.
import { json, fallo, leerJSON, puede, limpiarPieza, ESTADOS_PIEZA } from '../../../../servidor/comun.js';

export async function onRequestPut({ request, env, params, data }) {
  const u = data.usuario;
  const f = await env.DB.prepare('SELECT * FROM piezas WHERE id = ?').bind(Number(params.id)).first();
  if (!f) return fallo('No existe esa pieza.', 404);
  const c = (await leerJSON(request)) || {};
  const sets = [];

  if ('texto' in c || 'hora' in c) {
    const { pieza, errores } = limpiarPieza({ ...f, texto: c.texto ?? f.texto, hora: c.hora ?? f.hora });
    if (errores.length) return json({ error: errores[0], errores }, 400);
    sets.push(['texto', pieza.texto], ['hora', pieza.hora]);
  }
  if ('nota' in c) sets.push(['nota', String(c.nota || '').trim().slice(0, 600)]);
  if ('estado' in c) {
    if (!ESTADOS_PIEZA.includes(c.estado)) return fallo('Estado desconocido.');
    if (!puede.publicar(u)) return fallo('Solo un editor puede aprobar o descartar piezas.', 403);
    sets.push(['estado', c.estado]);
  }
  if ('enlace' in c) {
    const e = String(c.enlace || '').trim();
    if (e && !/^https:\/\/\S+$/i.test(e)) return fallo('El enlace tiene que empezar por https://');
    sets.push(['enlace', e.slice(0, 500)]);
  }
  if (!sets.length) return fallo('No hay nada que guardar.');
  sets.push(['actualizada', Date.now()]);
  await env.DB.prepare(`UPDATE piezas SET ${sets.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .bind(...sets.map(([, v]) => v), f.id).run();
  return json({ ok: true, pieza: await env.DB.prepare('SELECT * FROM piezas WHERE id = ?').bind(f.id).first() });
}

export async function onRequestDelete({ env, params, data }) {
  if (!puede.publicar(data.usuario)) return fallo('Solo un editor puede borrar piezas.', 403);
  await env.DB.prepare('DELETE FROM piezas WHERE id = ?').bind(Number(params.id)).run();
  return json({ ok: true });
}
