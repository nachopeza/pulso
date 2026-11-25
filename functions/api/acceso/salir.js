// POST /api/acceso/salir → cierra la sesión en este dispositivo
import { json, huella, leerCookie, COOKIE } from '../../../servidor/comun.js';

export async function onRequestPost({ request, env }) {
  const s = leerCookie(request, COOKIE);
  if (s) await env.DB.prepare('DELETE FROM sesiones WHERE huella = ?').bind(await huella(s)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0` });
}
