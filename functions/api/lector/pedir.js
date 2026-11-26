// POST /api/lector/pedir { email, modo: 'entrar' | 'crear', acepto, volver }
// → manda un email con un código de 6 cifras y un enlace para entrar. No hay contraseñas.
//   · Si ya tiene cuenta: código para entrar (da igual el modo).
//   · Si no la tiene y acepta (14 años o más y privacidad): código para crearla.
//   · Si no la tiene y quería «entrar»: un email que le dice que no hay cuenta y cómo crearla.
// Responde siempre lo mismo: así nadie puede averiguar quién tiene cuenta.
import { json, fallo, leerJSON, aleatorio, huella, huellaCodigo, enviarEmail } from '../../../servidor/comun.js';

const VALIDEZ = 30 * 60 * 1000;   // código y enlace caducan a los 30 minutos
const POR_EMAIL = 4;              // emails por hora para el mismo email
const AL_DIA = 200;               // Brevo gratis manda 300 emails al día: guardamos sitio para los del panel

// 6 cifras al azar, sin sesgo
function codigoAlAzar() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

export async function onRequestPost({ request, env }) {
  const c = await leerJSON(request);
  const email = String(c?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return fallo('Escribe un email válido.');
  const crear = c?.modo !== 'entrar';
  if (crear && c?.acepto !== true) return fallo('Para crear la cuenta tienes que confirmar que tienes 14 años o más y aceptar la privacidad.');
  const volver = /^[a-z0-9-]{1,120}$/.test(c?.volver || '') ? c.volver : '';

  const ahora = Date.now();
  const { n } = await env.DB.prepare("SELECT count(*) AS n FROM enlaces WHERE email = ? AND para = 'lector' AND creado > ?")
    .bind(email, ahora - 60 * 60 * 1000).first();
  if (n >= POR_EMAIL) return fallo('Ya te hemos mandado varios emails. Mira tu correo (también en spam) o espera un rato.', 429);
  const { hoy } = await env.DB.prepare("SELECT count(*) AS hoy FROM enlaces WHERE para = 'lector' AND creado > ?")
    .bind(ahora - 24 * 60 * 60 * 1000).first();
  if (hoy >= AL_DIA) return fallo('Hoy ya no podemos mandar más emails. Vuelve a intentarlo mañana.', 503);

  const origen = new URL(request.url).origin;
  const yaTiene = await env.DB.prepare('SELECT 1 FROM lectores WHERE email = ?').bind(email).first();
  // Siempre igual, haya cuenta o no (la web pide el código en los dos casos)
  const respuesta = { ok: true, codigo: true, mensaje: `Te hemos mandado un email a ${email}.` };

  // Quería entrar pero no hay cuenta: se lo decimos por email (no aquí) y le damos el camino para crearla
  if (!yaTiene && !crear) {
    // Cuenta para el límite por hora aunque no lleve código
    await env.DB.prepare("INSERT INTO enlaces (huella, email, expira, creado, para, usado) VALUES (?, ?, ?, ?, 'lector', 1)")
      .bind(await huella(aleatorio(16)), email, ahora, ahora).run();
    const enviado = await enviarEmail(env, {
      para: [email],
      asunto: 'No tienes cuenta en pulso (todavía)',
      boton: { texto: 'Crear mi cuenta gratis', url: `${origen}/?cuenta=crear` },
      texto: [
        'Hola:',
        'Alguien (seguramente tú) ha intentado entrar en pulso con este email, pero no hay ninguna cuenta con él.',
        'Crearla es gratis y lleva un minuto: guardas noticias en todos tus dispositivos y lees sin límite.',
        'Si no has sido tú, ignora este mensaje.',
        'pulso'
      ].join('\n\n')
    });
    if (!enviado) return fallo('No hemos podido mandar el email. Inténtalo de nuevo en un rato.', 503);
    return json(respuesta);
  }

  const token = aleatorio(32);
  const codigo = codigoAlAzar();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM enlaces WHERE expira < ?').bind(ahora - 2 * 24 * 60 * 60 * 1000),
    // Los códigos anteriores de este email dejan de valer: solo sirve el último
    env.DB.prepare("UPDATE enlaces SET usado = 1 WHERE email = ? AND para = 'lector' AND usado = 0").bind(email),
    env.DB.prepare("INSERT INTO enlaces (huella, email, expira, creado, para, codigo) VALUES (?, ?, ?, ?, 'lector', ?)")
      .bind(await huella(token), email, ahora + VALIDEZ, ahora, await huellaCodigo(email, codigo))
  ]);
  const enlace = `${origen}/?entrar=${token}${volver ? `#${volver}` : ''}`;
  const legible = `${codigo.slice(0, 3)} ${codigo.slice(3)}`;
  const enviado = await enviarEmail(env, {
    para: [email],
    asunto: `${legible} es tu código para ${yaTiene ? 'entrar en' : 'crear tu cuenta de'} pulso`,
    codigo: legible,
    boton: { texto: yaTiene ? 'O entra con un toque' : 'O confírmala con un toque', url: enlace },
    texto: [
      'Hola:',
      yaTiene
        ? 'Escribe este código en pulso para entrar en tu cuenta. Vale durante 30 minutos:'
        : 'Escribe este código en pulso para crear tu cuenta gratis. Vale durante 30 minutos:',
      `Código: ${legible}`,
      `Si lo prefieres, abre este enlace: ${enlace}`,
      'Una vez dentro, el dispositivo te recuerda durante un año: no tendrás que volver a hacerlo.',
      'Si no lo has pedido tú, ignora este mensaje: no pasa nada sin el código.',
      'pulso'
    ].join('\n\n')
  });
  if (!enviado) return fallo('No hemos podido mandar el email. Inténtalo de nuevo en un rato.', 503);
  return json(respuesta);
}
