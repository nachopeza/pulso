// GET /api/comentarios?noticia=<id> → los comentarios visibles de una noticia (los más nuevos primero)
// Si quien pregunta tiene cuenta, se marcan los suyos (para poder borrarlos) y los que ya ha denunciado.
import { json, fallo, lectorDe, estadoComentarios } from '../../../servidor/comun.js';

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('noticia') || '';
  if (!/^[a-z0-9-]{1,120}$/.test(id)) return fallo('Noticia no válida.');
  const lector = await lectorDe(request, env);
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.nombre, c.texto, c.creado, c.email,
            ${lector ? '(SELECT 1 FROM denuncias d WHERE d.comentario = c.id AND d.email = ?2)' : '0'} AS denunciado
     FROM comentarios c WHERE c.noticia = ?1 AND c.estado = 'visible' ORDER BY c.creado DESC LIMIT 200`
  ).bind(...(lector ? [id, lector.email] : [id])).all();
  const estado = await estadoComentarios(env);
  return json({
    abiertos: estado.abiertos,
    motivo: estado.motivo,
    nombre: lector?.nombre || null,
    comentarios: results.map((c) => ({
      id: c.id, nombre: c.nombre, texto: c.texto, creado: c.creado,
      mio: !!lector && c.email === lector.email, denunciado: !!c.denunciado
    }))
  }, 200, { 'Cache-Control': 'no-store' });
}
