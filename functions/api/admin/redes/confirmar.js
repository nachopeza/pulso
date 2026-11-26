// POST /api/admin/redes/confirmar { dia } → aprueba de una vez todas las piezas «Por revisar» de ese día.
// Las que tienen «Cambiar» o «Descartada» no se tocan. Bluesky sale solo, cada pieza a su hora;
// si alguna ya tenía que haber salido (dentro del margen de 2 horas), sale en este momento.
import { json, fallo, leerJSON, diaMadrid, puede } from '../../../../servidor/comun.js';
import { publicarPendientes } from '../../../../servidor/bluesky.js';

export async function onRequestPost({ request, env, data, waitUntil }) {
  if (!puede.publicar(data.usuario)) return fallo('Solo un editor puede confirmar la escaleta.', 403);
  const c = (await leerJSON(request)) || {};
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(c.dia || '') ? c.dia : diaMadrid(Date.now());
  const r = await env.DB.prepare(
    "UPDATE piezas SET estado = 'aprobada', actualizada = ? WHERE dia = ? AND estado = 'revisar'"
  ).bind(Date.now(), dia).run();
  // Lo que ya toca, sale ahora sin esperar a la siguiente vuelta del reloj
  waitUntil(publicarPendientes(env).catch(() => null));
  return json({ ok: true, dia, aprobadas: r.meta?.changes || 0, bluesky: Boolean(env.BSKY_USUARIO && env.BSKY_CLAVE_APP) });
}
