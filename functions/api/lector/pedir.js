// POST /api/lector/pedir { email, acepto: true, volver: "id-de-noticia" }
// → manda un enlace para crear la cuenta o entrar. No hay contraseñas.
// Responde siempre lo mismo, tenga o no cuenta ese email.
import { json, fallo, leerJSON, aleatorio, huella, enviarEmail } from '../../../servidor/comun.js';

const VALIDEZ = 30 * 60 * 1000;   // el enlace caduca a los 30 minutos
const POR_EMAIL = 3;              // enlaces por hora para el mismo email
const AL_DIA = 200;               // Brevo gratis manda 300 emails al día: guardamos sitio para los del panel

export async function onRequestPost({ request, env }) {
  const c = await leerJSON(request);
  const email = String(c?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return fallo('Escribe un email válido.');
  if (c?.acepto !== true) return fallo('Para crear la cuenta tienes que confirmar que tienes 14 años o más y aceptar la privacidad.');
  const volver = /^[a-z0-9-]{1,120}$/.test(c?.volver || '') ? c.volver : '';

  const ahora = Date.now();
  const { n } = await env.DB.prepare("SELECT count(*) AS n FROM enlaces WHERE email = ? AND para = 'lector' AND creado > ?")
    .bind(email, ahora - 60 * 60 * 1000).first();
  if (n >= POR_EMAIL) return fallo('Ya te hemos mandado varios enlaces. Mira tu correo (también en spam) o espera un rato.', 429);
  const { hoy } = await env.DB.prepare("SELECT count(*) AS hoy FROM enlaces WHERE para = 'lector' AND creado > ?")
    .bind(ahora - 24 * 60 * 60 * 1000).first();
  if (hoy >= AL_DIA) return fallo('Hoy ya no podemos mandar más enlaces. Vuelve a intentarlo mañana.', 503);

  const token = aleatorio(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM enlaces WHERE expira < ?').bind(ahora - 2 * 24 * 60 * 60 * 1000),
    env.DB.prepare("INSERT INTO enlaces (huella, email, expira, creado, para) VALUES (?, ?, ?, ?, 'lector')")
      .bind(await huella(token), email, ahora + VALIDEZ, ahora)
  ]);
  const yaTiene = await env.DB.prepare('SELECT 1 FROM lectores WHERE email = ?').bind(email).first();
  const enlace = `${new URL(request.url).origin}/?entrar=${token}${volver ? `#${volver}` : ''}`;
  const enviado = await enviarEmail(env, {
    para: [email],
    asunto: yaTiene ? 'Tu enlace para entrar en pulso' : 'Confirma tu cuenta de pulso',
    boton: { texto: yaTiene ? 'Entrar en pulso' : 'Confirmar mi cuenta', url: enlace },
    texto: [
      'Hola:',
      yaTiene
        ? 'Para entrar en tu cuenta de pulso, abre este enlace en los próximos 30 minutos:'
        : 'Para crear tu cuenta gratis de pulso, abre este enlace en los próximos 30 minutos:',
      enlace,
      'Con la cuenta guardas noticias en todos tus dispositivos y lees sin límite. No hay contraseña: cada vez que quieras entrar en un dispositivo nuevo, te mandamos un enlace como este.',
      'Si no lo has pedido tú, ignora este mensaje: no se crea nada sin abrir el enlace.',
      'pulso'
    ].join('\n\n')
  });
  if (!enviado) return fallo('No hemos podido mandar el email. Inténtalo de nuevo en un rato.', 503);
  return json({ ok: true, mensaje: `Te hemos mandado un enlace a ${email}. Ábrelo en este dispositivo para entrar.` });
}
