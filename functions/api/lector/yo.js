// GET    /api/lector/yo → { lector: { email } | null, guardadas: [ids] }
// POST   /api/lector/yo { salir: true } → cierra la sesión en este dispositivo
// DELETE /api/lector/yo → borra la cuenta, sus guardadas y todas sus sesiones
import { json, fallo, leerJSON, huella, leerCookie, COOKIE_LECTOR, cookieLector } from '../../../servidor/comun.js';

export async function onRequestGet({ env, data }) {
  if (!data.lector) return json({ lector: null, guardadas: [] }, 200, { 'Cache-Control': 'no-store' });
  const { results } = await env.DB.prepare('SELECT noticia FROM guardadas WHERE email = ? ORDER BY creada DESC')
    .bind(data.lector.email).all();
  return json({ lector: { email: data.lector.email }, guardadas: results.map((r) => r.noticia) }, 200, { 'Cache-Control': 'no-store' });
}

export async function onRequestPost({ request, env }) {
  const c = await leerJSON(request);
  if (c?.salir !== true) return fallo('No sé qué hacer con esto.');
  const s = leerCookie(request, COOKIE_LECTOR);
  if (s) await env.DB.prepare("DELETE FROM sesiones WHERE huella = ? AND para = 'lector'").bind(await huella(s)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': cookieLector('', 0) });
}

export async function onRequestDelete({ env, data }) {
  if (!data.lector) return fallo('No has entrado en ninguna cuenta.', 401);
  const email = data.lector.email;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM guardadas WHERE email = ?').bind(email),
    env.DB.prepare("DELETE FROM sesiones WHERE email = ? AND para = 'lector'").bind(email),
    env.DB.prepare("DELETE FROM enlaces WHERE email = ? AND para = 'lector'").bind(email),
    env.DB.prepare('DELETE FROM lectores WHERE email = ?').bind(email)
  ]);
  return json({ ok: true }, 200, { 'Set-Cookie': cookieLector('', 0) });
}
