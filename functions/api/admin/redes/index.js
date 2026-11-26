// GET  /api/admin/redes?dia=2026-11-26 → la escaleta de ese día (por defecto, hoy) y sus piezas
// POST /api/admin/redes { dia, hora, red, texto, … } → añadir una pieza escrita a mano
import { json, fallo, leerJSON, diaMadrid, limpiarPieza } from '../../../../servidor/comun.js';
import { momentoPieza } from '../../../../servidor/bluesky.js';

export async function onRequestGet({ request, env }) {
  const pedido = new URL(request.url).searchParams.get('dia');
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(pedido || '') ? pedido : diaMadrid(Date.now());
  const esc = await env.DB.prepare('SELECT datos FROM escaletas WHERE dia = ?').bind(dia).first();
  const { results: piezas } = await env.DB.prepare(
    `SELECT p.*, n.titular AS titular_noticia, n.categoria AS categoria_noticia,
            json_extract(n.datos, '$.imagen.src') AS imagen_noticia
     FROM piezas p LEFT JOIN noticias n ON n.id = p.noticia
     WHERE p.dia = ? ORDER BY p.hora = '', p.hora, p.id`
  ).bind(dia).all();
  // Días con escaleta, para moverse entre ellos
  const { results: dias } = await env.DB.prepare('SELECT dia FROM escaletas ORDER BY dia DESC LIMIT 30').all();
  // En Bluesky, las aprobadas salen solas: "pronto" (a su hora), "toca" (en la próxima vuelta),
  // "tarde" (pasó su hora hace más de 2 horas: ya no sale sola) o "sin-hora"
  const ahora = Date.now();
  for (const p of piezas) p.momento = p.red === 'bluesky' && p.estado === 'aprobada' ? momentoPieza(p, ahora) : null;
  const bluesky = Boolean(env.BSKY_USUARIO && env.BSKY_CLAVE_APP);
  return json({ dia, escaleta: esc ? JSON.parse(esc.datos) : null, piezas, dias: dias.map((d) => d.dia), bluesky });
}

export async function onRequestPost({ request, env, data }) {
  const c = await leerJSON(request);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(c?.dia || '') ? c.dia : diaMadrid(Date.now());
  const { pieza: p, errores } = limpiarPieza(c);
  if (errores.length) return json({ error: errores[0], errores }, 400);
  const ahora = Date.now();
  const r = await env.DB.prepare(
    `INSERT INTO piezas (dia, tanda, hora, red, serie, noticia, texto, visual, alt, autor, creada, actualizada)
     VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(dia, p.hora, p.red, p.serie, p.noticia, p.texto, p.visual, p.alt, data.usuario.email, ahora, ahora).first();
  return json({ ok: true, id: r.id }, 201);
}
