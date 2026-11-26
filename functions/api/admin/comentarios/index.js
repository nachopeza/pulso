// GET /api/admin/comentarios?ver=denunciados|ocultos|todos → para moderar (los denunciados primero)
import { json } from '../../../../servidor/comun.js';

export async function onRequestGet({ request, env }) {
  const ver = new URL(request.url).searchParams.get('ver') || 'todos';
  const donde = ver === 'denunciados' ? 'c.denuncias > 0' : ver === 'ocultos' ? "c.estado = 'oculto'" : '1 = 1';
  const { results } = await env.DB.prepare(
    `SELECT c.*, n.titular FROM comentarios c LEFT JOIN noticias n ON n.id = c.noticia
     WHERE ${donde} ORDER BY (c.denuncias > 0 AND c.estado = 'visible') DESC, c.creado DESC LIMIT 200`
  ).all();
  const { pendientes } = await env.DB.prepare("SELECT count(*) AS pendientes FROM comentarios WHERE denuncias > 0 AND estado = 'visible'").first();
  return json({ comentarios: results, pendientes });
}
