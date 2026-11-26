// POST /api/acceso/verificar { token } → si el enlace es bueno, abre una sesión de 30 días.
// Se hace con POST desde la página (no al abrir el enlace) porque algunos programas de
// correo "abren" los enlaces para revisarlos y gastarían el enlace antes que tú.
import { json, fallo, leerJSON, aleatorio, huella, COOKIE } from '../../../servidor/comun.js';

const DURACION = 30 * 24 * 60 * 60 * 1000;

export async function onRequestPost({ request, env }) {
  const cuerpo = await leerJSON(request);
  const token = String(cuerpo?.token || '');
  if (!/^[\w-]{20,}$/.test(token)) return fallo('Enlace no válido.');
  const ahora = Date.now();
  const h = await huella(token);
  // Se marca como usado en el mismo paso: un enlace solo sirve una vez
  const enlace = await env.DB.prepare(
    'UPDATE enlaces SET usado = 1 WHERE huella = ? AND para = \'panel\' AND usado = 0 AND expira > ? RETURNING email'
  ).bind(h, ahora).first();
  if (!enlace) return fallo('El enlace ha caducado o ya se ha usado. Pide otro.', 401);
  const u = await env.DB.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').bind(enlace.email).first();
  if (!u) return fallo('Este usuario ya no tiene acceso.', 403);

  const sesion = aleatorio(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sesiones WHERE expira < ?').bind(ahora),
    env.DB.prepare('INSERT INTO sesiones (huella, email, expira, creada) VALUES (?, ?, ?, ?)')
      .bind(await huella(sesion), u.email, ahora + DURACION, ahora)
  ]);
  return json({ ok: true, usuario: { email: u.email, nombre: u.nombre, rol: u.rol } }, 200, {
    'Set-Cookie': `${COOKIE}=${sesion}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${DURACION / 1000}`
  });
}
