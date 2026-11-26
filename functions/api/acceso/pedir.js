// POST /api/acceso/pedir { email } → manda un enlace para entrar al panel.
// Responde siempre lo mismo, exista o no el email: así nadie puede averiguar quién tiene cuenta.
import { json, fallo, leerJSON, aleatorio, huella, enviarEmail } from '../../../servidor/comun.js';

const VALIDEZ = 20 * 60 * 1000; // el enlace caduca a los 20 minutos

export async function onRequestPost({ request, env }) {
  const cuerpo = await leerJSON(request);
  const email = String(cuerpo?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fallo('Escribe un email válido.');
  const respuesta = { ok: true, mensaje: 'Si ese email tiene acceso, te hemos enviado un enlace. Caduca en 20 minutos.' };

  const u = await env.DB.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').bind(email).first();
  if (!u) return json(respuesta);

  // Como mucho 5 enlaces por hora para el mismo email
  const ahora = Date.now();
  const { n } = await env.DB.prepare('SELECT count(*) AS n FROM enlaces WHERE email = ? AND para = \'panel\' AND creado > ?')
    .bind(email, ahora - 60 * 60 * 1000).first();
  if (n >= 5) return fallo('Has pedido demasiados enlaces. Espera un rato y vuelve a intentarlo.', 429);

  const token = aleatorio(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM enlaces WHERE expira < ?').bind(ahora - 24 * 60 * 60 * 1000),
    env.DB.prepare('INSERT INTO enlaces (huella, email, expira, creado) VALUES (?, ?, ?, ?)')
      .bind(await huella(token), email, ahora + VALIDEZ, ahora)
  ]);
  const origen = new URL(request.url).origin;
  const enlace = `${origen}/admin/?entrar=${token}`;
  const enviado = await enviarEmail(env, {
    para: [email],
    asunto: 'Tu enlace para entrar en la redacción de pulso',
    boton: { texto: 'Entrar en la redacción', url: enlace },
    texto: `Hola, ${u.nombre}:\n\nPara entrar en el panel de pulso, abre este enlace en los próximos 20 minutos:\n\n${enlace}\n\nSi no lo has pedido tú, ignora este mensaje: nadie puede entrar sin él.\n\npulso`
  });
  if (!enviado) return fallo('No se ha podido enviar el email. Revisa la configuración de Brevo.', 503);
  return json(respuesta);
}
