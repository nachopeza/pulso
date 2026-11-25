// POST /api/agente/escaleta → el community manager entrega aquí la escaleta de redes.
// Necesita la cabecera "Authorization: Bearer <AGENTE_KEY>" (la misma clave que el redactor).
//
// Cuerpo: {
//   tanda: 'manana' | 'tarde' | 'noche',   (la de la mañana es la escaleta completa; las otras añaden piezas)
//   dia: "2026-11-26",                     (opcional: hoy, en Madrid)
//   resumen: "…", alertas: ["…"], video: "…guion…", comunidad: "…", ideas: "…",
//   piezas: [{ hora: "07:45", red: "bluesky"|"x"|"tiktok"|"instagram", serie, noticia: "id",
//              texto: "el post completo, con el enlace", visual, alt }]
// }
// Si se reenvía la misma tanda, se sustituyen las piezas que nadie ha tocado todavía.
import {
  json, fallo, leerJSON, igualesSeguro, enviarEmail, diaMadrid, limpiarPieza, REDES, EDICIONES
} from '../../../servidor/comun.js';

const textoLibre = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function onRequestPost({ request, env }) {
  const clave = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.AGENTE_KEY || !clave || !(await igualesSeguro(clave, env.AGENTE_KEY))) return fallo('Clave del agente no válida.', 401);

  const c = await leerJSON(request);
  const tanda = c?.tanda || 'manana';
  if (!EDICIONES[tanda]) return fallo('La tanda tiene que ser "manana", "tarde" o "noche".');
  const ahora = Date.now();
  const dia = c?.dia || diaMadrid(ahora);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return fallo('El día va como "2026-11-26".');
  if (!Array.isArray(c?.piezas) || !c.piezas.length) return fallo('La escaleta no trae piezas.');
  if (c.piezas.length > 30) return fallo('Como mucho 30 piezas por envío.');

  // 1. Comprobar todas las piezas antes de guardar nada
  const errores = [];
  const piezas = [];
  for (const [i, e] of c.piezas.entries()) {
    const { pieza, errores: er } = limpiarPieza(e);
    er.forEach((x) => errores.push(`pieza ${i + 1} (${pieza.hora || 'sin hora'}, ${pieza.red}): ${x}`));
    if (pieza.noticia && !(await env.DB.prepare('SELECT 1 FROM noticias WHERE id = ?').bind(pieza.noticia).first())) {
      errores.push(`pieza ${i + 1}: la noticia «${pieza.noticia}» no existe en pulso`);
    }
    piezas.push(pieza);
  }
  if (errores.length) return json({ error: 'La escaleta tiene errores', errores }, 400);

  // 2. Guardar: la parte de texto de esta tanda y sus piezas
  const previa = await env.DB.prepare('SELECT datos FROM escaletas WHERE dia = ?').bind(dia).first();
  const datos = previa ? JSON.parse(previa.datos) : {};
  datos[tanda] = {
    resumen: textoLibre(c.resumen, 1500),
    alertas: (Array.isArray(c.alertas) ? c.alertas : []).map((a) => textoLibre(a, 300)).filter(Boolean).slice(0, 10),
    video: textoLibre(c.video, 6000),
    comunidad: textoLibre(c.comunidad, 3000),
    ideas: textoLibre(c.ideas, 3000),
    llegada: ahora
  };
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO escaletas (dia, datos, actualizada) VALUES (?, ?, ?)
       ON CONFLICT (dia) DO UPDATE SET datos = excluded.datos, actualizada = excluded.actualizada`
    ).bind(dia, JSON.stringify(datos), ahora),
    env.DB.prepare("DELETE FROM piezas WHERE dia = ? AND tanda = ? AND estado = 'revisar' AND autor = 'agente'").bind(dia, tanda),
    ...piezas.map((p) => env.DB.prepare(
      `INSERT INTO piezas (dia, tanda, hora, red, serie, noticia, texto, visual, alt, autor, creada, actualizada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'agente', ?, ?)`
    ).bind(dia, tanda, p.hora, p.red, p.serie, p.noticia, p.texto, p.visual, p.alt, ahora, ahora))
  ]);

  // 3. Aviso por email
  const { results: equipo } = await env.DB.prepare("SELECT email FROM usuarios WHERE activo = 1 AND rol IN ('admin', 'editor')").all();
  const orden = [...piezas].sort((a, b) => a.hora.localeCompare(b.hora));
  const emailOk = equipo.length ? await enviarEmail(env, {
    para: equipo.map((u) => u.email),
    asunto: `Escaleta de redes ${EDICIONES[tanda].nombre}: ${piezas.length} piezas por revisar`,
    texto: [
      'Hola:',
      `El community manager ha preparado ${piezas.length} piezas para redes. No sale nada sin tu aprobación.`,
      `Revisarlas, aprobarlas y copiarlas: ${env.SITIO}/admin/#/redes`,
      datos[tanda].resumen,
      datos[tanda].alertas.length ? `ALERTAS:\n${datos[tanda].alertas.map((a) => `- ${a}`).join('\n')}` : '',
      ...orden.map((p) => `${p.hora || '--:--'} · ${REDES[p.red]}${p.serie ? ` · ${p.serie}` : ''}\n${p.texto}`),
      'pulso'
    ].filter(Boolean).join('\n\n')
  }) : false;

  return json({ ok: true, dia, tanda, piezas: piezas.length, email: emailOk });
}
