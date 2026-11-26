// POST /api/lector/comentarios { noticia, texto, nombre? } → publicar un comentario (sale al momento)
// La primera vez hay que elegir un nombre público; el email nunca se enseña.
import { json, fallo, leerJSON, VISIBLE, estadoComentarios } from '../../../../servidor/comun.js';

const POR_HORA = 10;

export async function onRequestPost({ request, env, data }) {
  if (!data.lector) return fallo('Inicia sesión para comentar.', 401);
  const estado = await estadoComentarios(env);
  if (!estado.abiertos) return fallo(estado.motivo, 403);
  const c = (await leerJSON(request)) || {};
  const id = String(c.noticia || '');
  const texto = String(c.texto || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!/^[a-z0-9-]{1,120}$/.test(id)) return fallo('Noticia no válida.');
  if (texto.length < 2) return fallo('Escribe algo antes de publicar.');
  if (texto.length > 800) return fallo(`Es un poco largo: ${texto.length} caracteres (máximo 800).`);
  const ahora = Date.now();
  if (!(await env.DB.prepare(`SELECT 1 FROM noticias WHERE id = ?2 AND ${VISIBLE}`).bind(ahora, id).first())) return fallo('Esa noticia no existe.', 404);

  let nombre = data.lector.nombre;
  if (!nombre) {
    nombre = String(c.nombre || '').replace(/\s+/g, ' ').trim();
    if (nombre.length < 2 || nombre.length > 30) return fallo('Elige un nombre público de 2 a 30 caracteres.');
    if (/@|https?:|www\./i.test(nombre)) return fallo('El nombre no puede llevar emails ni enlaces.');
    if (/pulso/i.test(nombre)) return fallo('Ese nombre está reservado. Elige otro.');
    await env.DB.prepare('UPDATE lectores SET nombre = ? WHERE email = ?').bind(nombre, data.lector.email).run();
  }

  const { n } = await env.DB.prepare('SELECT count(*) AS n FROM comentarios WHERE email = ? AND creado > ?')
    .bind(data.lector.email, ahora - 60 * 60 * 1000).first();
  if (n >= POR_HORA) return fallo('Has comentado mucho en la última hora. Descansa un rato y vuelve.', 429);

  const r = await env.DB.prepare(
    'INSERT INTO comentarios (noticia, email, nombre, texto, creado) VALUES (?, ?, ?, ?, ?) RETURNING id'
  ).bind(id, data.lector.email, nombre, texto, ahora).first();
  return json({ ok: true, comentario: { id: r.id, nombre, texto, creado: ahora, mio: true, denunciado: false } }, 201);
}
