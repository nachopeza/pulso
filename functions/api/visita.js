// POST /api/visita → la web avisa de una entrada, una lectura o un compartir (con navigator.sendBeacon).
// Cuerpo: { tipo: 'pagina' | 'lectura' | 'compartir', id?, origen?, disp? }
// Sin cookies y sin guardar la IP: solo se suman contadores por día (tabla visitas).
import { diaMadrid, huella } from '../../servidor/comun.js';

const ORIGENES = ['directo', 'bluesky', 'x', 'google', 'instagram', 'tiktok', 'whatsapp', 'facebook', 'telegram', 'otros'];
const ROBOT = /bot|crawl|spider|slurp|preview|fetch|monitor|headless|lighthouse/i;

export async function onRequestPost({ request, env }) {
  const nada = new Response(null, { status: 204 });
  if (ROBOT.test(request.headers.get('User-Agent') || '')) return nada;
  let c;
  try { c = JSON.parse(await request.text()); } catch (e) { return nada; }
  const dia = diaMadrid(Date.now());
  const sumar = (tipo, clave = '') => env.DB.prepare(
    'INSERT INTO visitas (dia, tipo, clave, n) VALUES (?, ?, ?, 1) ON CONFLICT (dia, tipo, clave) DO UPDATE SET n = n + 1'
  ).bind(dia, tipo, clave);

  if (c?.tipo === 'pagina') {
    const origen = ORIGENES.includes(c.origen) ? c.origen : 'otros';
    const disp = c.disp === 'movil' ? 'movil' : 'ordenador';
    const lotes = [sumar('pagina'), sumar('origen', origen), sumar('disp', disp)];
    // ¿Primera vez hoy de esta persona? La huella cambia cada día (lleva el día y una clave secreta)
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const h = (await huella(`${env.AGENTE_KEY || 'pulso'}|${dia}|${ip}|${request.headers.get('User-Agent') || ''}`)).slice(0, 20);
    const r = await env.DB.prepare('INSERT OR IGNORE INTO unicos (dia, h) VALUES (?, ?)').bind(dia, h).run();
    if (r.meta?.changes === 1) lotes.push(sumar('unicos'));
    await env.DB.batch(lotes);
  } else if ((c?.tipo === 'lectura' || c?.tipo === 'compartir') && /^[a-z0-9-]{1,100}$/.test(c.id || '')) {
    await sumar(c.tipo, c.id).run();
  }
  return nada;
}
