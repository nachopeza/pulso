// POST /api/lector/verificar { token }            → entrar con el enlace del email
// POST /api/lector/verificar { email, codigo }    → entrar con el código de 6 cifras
// Si todo va bien, crea la cuenta (si no existía) y abre una sesión de un año en este dispositivo.
// Igual que en el panel, se hace con POST desde la página: los programas de correo que
// "abren" los enlaces para revisarlos no gastan el enlace.
import { json, fallo, leerJSON, aleatorio, huella, huellaCodigo, cookieLector, DURA_LECTOR, igualesSeguro } from '../../../servidor/comun.js';

const MAX_INTENTOS = 5;

export async function onRequestPost({ request, env }) {
  const c = await leerJSON(request);
  const ahora = Date.now();
  let email = null;

  if (c?.token) {
    const token = String(c.token);
    if (!/^[\w-]{20,}$/.test(token)) return fallo('Enlace no válido.');
    const enlace = await env.DB.prepare(
      "UPDATE enlaces SET usado = 1 WHERE huella = ? AND para = 'lector' AND usado = 0 AND expira > ? RETURNING email"
    ).bind(await huella(token), ahora).first();
    if (!enlace) return fallo('El enlace ha caducado o ya se ha usado. Pide otro código desde el menú.', 401);
    email = enlace.email;
  } else {
    email = String(c?.email || '').trim().toLowerCase();
    const codigo = String(c?.codigo || '').replace(/\D/g, '');
    if (!email || codigo.length !== 6) return fallo('Escribe las 6 cifras del código.');
    // Solo vale el último código pedido, y con 5 intentos como mucho
    const e = await env.DB.prepare(
      "SELECT huella, codigo, intentos FROM enlaces WHERE email = ? AND para = 'lector' AND usado = 0 AND expira > ? AND codigo IS NOT NULL ORDER BY creado DESC LIMIT 1"
    ).bind(email, ahora).first();
    if (!e) return fallo('El código ha caducado o ya se ha usado. Pide otro.', 401);
    if (e.intentos >= MAX_INTENTOS) return fallo('Demasiados intentos. Pide un código nuevo.', 429);
    if (!(await igualesSeguro(await huellaCodigo(email, codigo), e.codigo))) {
      await env.DB.prepare('UPDATE enlaces SET intentos = intentos + 1 WHERE huella = ?').bind(e.huella).run();
      const quedan = MAX_INTENTOS - e.intentos - 1;
      return fallo(quedan > 0 ? `Ese código no es. Te quedan ${quedan} ${quedan === 1 ? 'intento' : 'intentos'}.` : 'Demasiados intentos. Pide un código nuevo.', 401);
    }
    await env.DB.prepare('UPDATE enlaces SET usado = 1 WHERE huella = ?').bind(e.huella).run();
  }

  const sesion = aleatorio(32);
  // Pedir el código exige tener cuenta o aceptar la privacidad y confirmar la edad: lo apuntamos al crearla
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO lectores (email, creado, acepto, ultimo) VALUES (?1, ?2, ?2, ?2)
                    ON CONFLICT (email) DO UPDATE SET ultimo = ?2`).bind(email, ahora),
    env.DB.prepare('DELETE FROM sesiones WHERE expira < ?').bind(ahora),
    env.DB.prepare("INSERT INTO sesiones (huella, email, expira, creada, para) VALUES (?, ?, ?, ?, 'lector')")
      .bind(await huella(sesion), email, ahora + DURA_LECTOR, ahora)
  ]);
  return json({ ok: true, lector: { email } }, 200, { 'Set-Cookie': cookieLector(sesion, DURA_LECTOR) });
}
