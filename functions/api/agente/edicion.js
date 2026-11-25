// POST /api/agente/edicion → el agente redactor entrega aquí cada edición.
// Necesita la cabecera "Authorization: Bearer <AGENTE_KEY>".
//
// Cuerpo: {
//   tipo: 'manana' | 'tarde' | 'noche',   (opcional, 'manana' por defecto)
//   noticias: [{ id, …campos de la noticia…, propuesta: true|false, importancia: 1-5,
//                destacado?: true, fijada?: true, sustituye?: "id" }],
//   momentos: { manana, tarde, noche },   (opcional; los que no vengan se quedan como estaban)
//   retirar:  ["id", …]                   (opcional: noticias que ya no deben estar en portada)
// }
// Las "propuesta: true" quedan programadas para la hora de la edición (7:00, 14:00 o 21:00 en Madrid);
// el resto, en borrador. Si nadie las revisa antes, a esa hora salen solas.
// "sustituye" es para las actualizaciones: la nueva sale como «Actualizada» y la vieja se retira a la vez.
import {
  json, fallo, leerJSON, igualesSeguro, limpiarNoticia, importarFoto, versionStmt, enviarEmail,
  diaMadrid, horaMadrid, isoMadrid, VISIBLE, MOMENTOS, EDICIONES, claveEdicion
} from '../../../servidor/comun.js';

export async function onRequestPost({ request, env }) {
  const clave = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.AGENTE_KEY || !clave || !(await igualesSeguro(clave, env.AGENTE_KEY))) return fallo('Clave del agente no válida.', 401);

  const c = await leerJSON(request);
  if (!Array.isArray(c?.noticias) || !c.noticias.length) return fallo('La edición no trae noticias.');
  if (c.noticias.length > 20) return fallo('Como mucho 20 noticias por edición.');
  const tipo = c.tipo || 'manana';
  if (!EDICIONES[tipo]) return fallo('El tipo de edición tiene que ser "manana", "tarde" o "noche".');

  const ahora = Date.now();
  const dia = diaMadrid(ahora);
  const edicion = claveEdicion(dia, tipo);
  // Sale sola a su hora; si el agente llega tarde, media hora después de entregarla
  const autoEn = Math.max(horaMadrid(dia, EDICIONES[tipo].hora), ahora + 30 * 60 * 1000);

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
    if (previa && !(previa.edicion === edicion && !previa.revisada)) errores.push(`${id}: ya existe una noticia con ese id; usa otro`);
    const { datos, errores: e } = limpiarNoticia(n);
    e.forEach((x) => errores.push(`${id}: ${x}`));
    const imp = n.importancia === undefined ? 3 : Number(n.importancia);
    if (!(Number.isInteger(imp) && imp >= 1 && imp <= 5)) errores.push(`${id}: la importancia va de 1 a 5`);
    let sustituye = null;
    if (n.sustituye) {
      sustituye = String(n.sustituye);
      const vieja = await env.DB.prepare(`SELECT id FROM noticias WHERE id = ?2 AND ${VISIBLE}`).bind(ahora, sustituye).first();
      if (!vieja) errores.push(`${id}: «sustituye» apunta a ${sustituye}, que no está en la web`);
      if (!n.propuesta) errores.push(`${id}: una actualización tiene que ir con "propuesta": true`);
    }
    delete datos.actualizada;
    preparadas.push({ id, datos, propuesta: !!n.propuesta, destacado: !!n.destacado, fijada: !!n.fijada,
      importancia: imp, sustituye, existe: !!previa });
  }
  if (!preparadas.some((p) => p.propuesta)) errores.push('Marca con "propuesta": true las que recomiendas publicar.');
  if (preparadas.filter((p) => p.destacado).length > 1) errores.push('Solo puede haber una destacada.');
  let momentos = null;
  if (c.momentos) {
    momentos = {};
    for (const k of MOMENTOS) {
      const m = c.momentos[k];
      if (m === undefined) continue;
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
  // Una edición nueva devuelve la portada al orden automático
  const stmts = [env.DB.prepare('UPDATE noticias SET orden = NULL WHERE orden IS NOT NULL')];
  const retirar = new Set((Array.isArray(c.retirar) ? c.retirar : []).slice(0, 40).map(String));
  for (const p of preparadas) {
    if (p.propuesta) p.datos.fecha = isoMadrid(autoEn);
    else delete p.datos.fecha;
    if (p.sustituye) { p.datos.actualizada = isoMadrid(autoEn); p.datos.sustituye = p.sustituye; retirar.add(p.sustituye); }
    if (p.existe) stmts.push(env.DB.prepare('DELETE FROM noticias WHERE id = ?').bind(p.id));
    stmts.push(env.DB.prepare(
      `INSERT INTO noticias (id, estado, publicar_en, revisada, propuesta, destacado, fijada, importancia, categoria, titular, datos, edicion, autor, creada, actualizada)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'agente', ?, ?)`
    ).bind(p.id, p.propuesta ? 'publicada' : 'borrador', p.propuesta ? autoEn : null, p.propuesta ? 1 : 0,
      p.destacado ? 1 : 0, p.fijada ? 1 : 0, p.importancia, p.datos.categoria, p.datos.titular, JSON.stringify(p.datos), edicion, ahora, ahora),
    versionStmt(env, p.id, 'agente', p.sustituye ? `actualiza a ${p.sustituye}` : p.propuesta ? 'propuesta por el agente' : 'borrador del agente'));
  }
  const hora = isoMadrid(autoEn).slice(11, 16);
  for (const id of retirar) {
    stmts.push(env.DB.prepare(`UPDATE noticias SET retirar_en = ?2, actualizada = ?1 WHERE id = ?3 AND ${VISIBLE} AND fijada = 0`)
      .bind(ahora, autoEn, id), versionStmt(env, id, 'agente', `el agente propone retirarla a las ${hora}`));
  }
  if (momentos && Object.keys(momentos).length) {
    // Los momentos que no manda (por ejemplo, la mañana en la edición de la tarde) se quedan como estaban
    const previos = await env.DB.prepare('SELECT datos FROM momentos WHERE desde <= ? ORDER BY desde DESC LIMIT 1').bind(autoEn).first();
    const juntos = { ...(previos ? JSON.parse(previos.datos) : {}), ...momentos };
    stmts.push(env.DB.prepare(
      `INSERT INTO momentos (desde, datos, autor, actualizado) VALUES (?, ?, 'agente', ?)
       ON CONFLICT (desde) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado`
    ).bind(autoEn, JSON.stringify(juntos), ahora));
  }
  await env.DB.batch(stmts);

  // 4. Aviso por email a quien puede publicar, con toda la edición para revisarla desde el móvil
  const { results: equipo } = await env.DB.prepare("SELECT email FROM usuarios WHERE activo = 1 AND rol IN ('admin', 'editor')").all();
  const propuestas = preparadas.filter((p) => p.propuesta);
  const alternativas = preparadas.filter((p) => !p.propuesta);
  const ficha = (p) => {
    const d = p.datos;
    return [
      `${p.destacado ? '★ DESTACADA · ' : ''}${d.categoria.toUpperCase()} · importancia ${p.importancia}/5${p.sustituye ? ' · ACTUALIZACIÓN' : ''}${p.fijada ? ' · fijada' : ''}`,
      d.titular,
      d.entradilla,
      ...(d.puntos || []).map((x) => `  · ${x}`),
      d.porque ? `Por qué te importa: ${d.porque}` : '',
      `Fuentes: ${(d.fuentes || []).map((f) => `${f.medio} (${f.url})`).join(', ')}`,
      d.imagen ? `Foto: ${d.imagen.credito || 'sí'}` : 'Sin foto',
      `Editar: ${env.SITIO}/admin/#/editar/${p.id}`
    ].filter(Boolean).join('\n');
  };
  const retiradas = [];
  for (const id of retirar) {
    const f = await env.DB.prepare('SELECT titular FROM noticias WHERE id = ? AND retirar_en = ?').bind(id, autoEn).first();
    if (f) retiradas.push(`- ${f.titular}`);
  }
  const ed = EDICIONES[tipo];
  const emailOk = equipo.length ? await enviarEmail(env, {
    para: equipo.map((u) => u.email),
    asunto: `Edición ${ed.nombre} lista: ${propuestas.length} propuestas de ${preparadas.length}, sale sola a las ${hora}`,
    texto: [
      tipo === 'manana' ? 'Buenos días:' : 'Hola:',
      `El agente ha preparado la edición ${ed.nombre} con ${preparadas.length} noticias. Propone publicar ${propuestas.length}. Si no haces nada, salen solas a las ${hora}.`,
      `Para aceptarla tal cual, cambiar cuáles salen o publicarla ya: ${env.SITIO}/admin/#/hoy`,
      `══ PROPUESTAS (${propuestas.length}) ══`,
      ...propuestas.map(ficha),
      alternativas.length ? `══ ALTERNATIVAS (${alternativas.length}), no salen si no las activas ══` : '',
      ...alternativas.map(ficha),
      retiradas.length ? `══ SE QUITAN DE PORTADA A LAS ${hora} ══\n${retiradas.join('\n')}` : '',
      'pulso'
    ].filter(Boolean).join('\n\n')
  }) : false;

  return json({ ok: true, dia, tipo, edicion, publicaA: isoMadrid(autoEn), noticias: preparadas.length, propuestas: propuestas.length, email: emailOk });
}
