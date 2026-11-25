// POST /api/agente/edicion → el agente redactor entrega aquí la edición de la mañana.
// Necesita la cabecera "Authorization: Bearer <AGENTE_KEY>".
//
// Cuerpo: {
//   noticias: [{ id, …campos de la noticia…, propuesta: true|false, destacado?: true, fijada?: true }],
//   momentos: { manana, tarde, noche },   (opcional)
//   retirar:  ["id", …]                   (opcional: noticias que ya no deben estar en portada)
// }
// Las "propuesta: true" quedan programadas para las 7:00 (hora de Madrid); el resto, en borrador.
// Si nadie las revisa antes, a las 7:00 salen solas.
import {
  json, fallo, leerJSON, igualesSeguro, limpiarNoticia, importarFoto, versionStmt, enviarEmail,
  diaMadrid, horaMadrid, isoMadrid, VISIBLE, MOMENTOS
} from '../../../servidor/comun.js';

const HORA_AUTOMATICA = '07:00';

export async function onRequestPost({ request, env }) {
  const clave = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.AGENTE_KEY || !clave || !(await igualesSeguro(clave, env.AGENTE_KEY))) return fallo('Clave del agente no válida.', 401);

  const c = await leerJSON(request);
  if (!Array.isArray(c?.noticias) || !c.noticias.length) return fallo('La edición no trae noticias.');
  if (c.noticias.length > 20) return fallo('Como mucho 20 noticias por edición.');

  const ahora = Date.now();
  const dia = diaMadrid(ahora);
  // Sale sola a las 7:00; si el agente llega tarde, media hora después de entregarla
  const autoEn = Math.max(horaMadrid(dia, HORA_AUTOMATICA), ahora + 30 * 60 * 1000);

  // 1. Comprobar todo antes de guardar nada: si algo falla, no entra nada y el agente lo corrige
  const errores = [];
  const preparadas = [];
  const ids = new Set();
  for (const [i, n] of c.noticias.entries()) {
    const id = String(n?.id || '');
    const donde = id || `noticia ${i + 1}`;
    if (!/^[a-z0-9-]{3,70}$/.test(id)) { errores.push(`${donde}: el id solo puede tener minúsculas, números y guiones`); continue; }
    if (ids.has(id)) errores.push(`${id}: id repetido`);
    ids.add(id);
    const previa = await env.DB.prepare('SELECT edicion, revisada FROM noticias WHERE id = ?').bind(id).first();
    // Se puede reenviar la misma edición (por ejemplo, tras corregir un error) mientras nadie la haya tocado
    if (previa && !(previa.edicion === dia && !previa.revisada)) errores.push(`${id}: ya existe una noticia con ese id; usa otro`);
    const { datos, errores: e } = limpiarNoticia(n);
    e.forEach((x) => errores.push(`${id}: ${x}`));
    preparadas.push({ id, datos, propuesta: !!n.propuesta, destacado: !!n.destacado, fijada: !!n.fijada, existe: !!previa });
  }
  if (!preparadas.some((p) => p.propuesta)) errores.push('Marca con "propuesta": true las que recomiendas publicar.');
  if (preparadas.filter((p) => p.destacado).length > 1) errores.push('Solo puede haber una destacada.');
  let momentos = null;
  if (c.momentos) {
    momentos = {};
    for (const k of MOMENTOS) {
      const m = c.momentos[k];
      if (!m?.titulo || !Array.isArray(m.puntos)) { errores.push(`momentos.${k}: falta título o puntos`); continue; }
      momentos[k] = { titulo: String(m.titulo).slice(0, 60), puntos: m.puntos.slice(0, 4).map((p) => ({ texto: String(p?.texto || '').slice(0, 140), id: String(p?.id || '') })) };
    }
  }
  if (errores.length) return json({ error: 'La edición tiene errores', errores }, 400);

  // 2. Fotos de Wikimedia Commons: se copian a nuestro almacén (si falla, se enlaza la original)
  for (const p of preparadas) {
    if (p.datos.imagen && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(p.datos.imagen.src)) {
      const src = await importarFoto(env, p.datos.imagen.src, p.id);
      if (src) p.datos.imagen.src = src;
    }
  }

  // 3. Guardar
  const stmts = [env.DB.prepare('UPDATE noticias SET orden = NULL WHERE orden IS NOT NULL')];
  for (const p of preparadas) {
    if (p.propuesta) p.datos.fecha = isoMadrid(autoEn);
    else delete p.datos.fecha;
    if (p.existe) stmts.push(env.DB.prepare('DELETE FROM noticias WHERE id = ?').bind(p.id));
    stmts.push(env.DB.prepare(
      `INSERT INTO noticias (id, estado, publicar_en, revisada, propuesta, destacado, fijada, categoria, titular, datos, edicion, autor, creada, actualizada)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'agente', ?, ?)`
    ).bind(p.id, p.propuesta ? 'publicada' : 'borrador', p.propuesta ? autoEn : null, p.propuesta ? 1 : 0,
      p.destacado ? 1 : 0, p.fijada ? 1 : 0, p.datos.categoria, p.datos.titular, JSON.stringify(p.datos), dia, ahora, ahora),
    versionStmt(env, p.id, 'agente', p.propuesta ? 'propuesta por el agente' : 'borrador del agente'));
  }
  for (const id of (Array.isArray(c.retirar) ? c.retirar : []).slice(0, 40)) {
    stmts.push(env.DB.prepare(`UPDATE noticias SET retirar_en = ?2, actualizada = ?1 WHERE id = ?3 AND ${VISIBLE} AND fijada = 0`)
      .bind(ahora, autoEn, String(id)), versionStmt(env, String(id), 'agente', 'el agente propone retirarla a las 7:00'));
  }
  if (momentos) {
    stmts.push(env.DB.prepare(
      `INSERT INTO momentos (desde, datos, autor, actualizado) VALUES (?, ?, 'agente', ?)
       ON CONFLICT (desde) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado`
    ).bind(autoEn, JSON.stringify(momentos), ahora));
  }
  await env.DB.batch(stmts);

  // 4. Aviso por email a quien puede publicar
  const { results: equipo } = await env.DB.prepare("SELECT email FROM usuarios WHERE activo = 1 AND rol IN ('admin', 'editor')").all();
  const propuestas = preparadas.filter((p) => p.propuesta);
  const hora = isoMadrid(autoEn).slice(11, 16);
  const emailOk = equipo.length ? await enviarEmail(env, {
    para: equipo.map((u) => u.email),
    asunto: `Edición lista: ${preparadas.length} borradores, se publica sola a las ${hora}`,
    texto: `Buenos días:\n\nEl agente ha preparado la edición de hoy con ${preparadas.length} noticias. Propone publicar ${propuestas.length}:\n\n${
      propuestas.map((p) => `- ${p.datos.titular}`).join('\n')}\n\nSi no la revisas antes, se publica sola a las ${hora}.\n\nRevisarla: ${env.SITIO}/admin/\n\npulso`
  }) : false;

  return json({ ok: true, dia, publicaA: isoMadrid(autoEn), noticias: preparadas.length, propuestas: propuestas.length, email: emailOk });
}
