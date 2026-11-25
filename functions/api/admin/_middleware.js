// Se ejecuta antes de cualquier /api/admin/…: sin sesión válida no se pasa.
// Deja en context.data.usuario quién está haciendo la petición.
import { fallo, huella, leerCookie, COOKIE } from '../../../servidor/comun.js';

export async function onRequest(context) {
  const { request, env } = context;
  const s = leerCookie(request, COOKIE);
  if (!s) return fallo('Tienes que entrar de nuevo.', 401);
  const u = await env.DB.prepare(
    `SELECT u.email, u.nombre, u.rol FROM sesiones s JOIN usuarios u ON u.email = s.email
     WHERE s.huella = ? AND s.expira > ? AND u.activo = 1`
  ).bind(await huella(s), Date.now()).first();
  if (!u) return fallo('Tu sesión ha caducado. Entra de nuevo.', 401);

  // Los cambios solo pueden venir del propio panel, no de otra web que intente usar tu sesión
  if (request.method !== 'GET') {
    const origen = request.headers.get('Origin');
    if (origen && origen !== new URL(request.url).origin) return fallo('Petición no permitida.', 403);
    const tipo = request.headers.get('Content-Type') || '';
    if (!/^(application\/json|image\/(jpeg|png|webp))/.test(tipo)) return fallo('Petición no permitida.', 415);
  }
  context.data.usuario = u;
  return context.next();
}
