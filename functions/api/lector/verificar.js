// POST /api/lector/verificar { token } → si el enlace es bueno, crea la cuenta (si no existía)
// y abre una sesión de un año en este dispositivo.
// Igual que en el panel, se hace con POST desde la página: los programas de correo que
// "abren" los enlaces para revisarlos no gastan el enlace.
import { json, fallo, leerJSON, aleatorio, huella, cookieLector, DURA_LECTOR } from '../../../servidor/comun.js';

export async function onRequestPost({ request, env }) {
  const c = await leerJSON(request);
  const token = String(c?.token || '');
  if (!/^[\w-]{20,}$/.test(token)) return fallo('Enlace no válido.');
  const ahora = Date.now();
  const enlace = await env.DB.prepare(
    "UPDATE enlaces SET usado = 1 WHERE huella = ? AND para = 'lector' AND usado = 0 AND expira > ? RETURNING email"
  ).bind(await huella(token), ahora).first();
  if (!enlace) return fallo('El enlace ha caducado o ya se ha usado. Pide otro desde el menú.', 401);

  const sesion = aleatorio(32);
  // Pedir el enlace exige aceptar la privacidad y confirmar la edad: lo apuntamos al crear la cuenta
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO lectores (email, creado, acepto, ultimo) VALUES (?1, ?2, ?2, ?2)
                    ON CONFLICT (email) DO UPDATE SET ultimo = ?2`).bind(enlace.email, ahora),
    env.DB.prepare('DELETE FROM sesiones WHERE expira < ?').bind(ahora),
    env.DB.prepare("INSERT INTO sesiones (huella, email, expira, creada, para) VALUES (?, ?, ?, ?, 'lector')")
      .bind(await huella(sesion), enlace.email, ahora + DURA_LECTOR, ahora)
  ]);
  return json({ ok: true, lector: { email: enlace.email } }, 200, { 'Set-Cookie': cookieLector(sesion, DURA_LECTOR) });
}
