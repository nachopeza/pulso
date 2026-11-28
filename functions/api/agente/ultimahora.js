// POST /api/agente/ultimahora → el agente pone (o quita) la «Última hora» de la portada.
// Necesita la cabecera "Authorization: Bearer <AGENTE_KEY>".
// Cuerpo: { texto, detalle: ["línea", …] (hasta 5), id?: "noticia-enlazada", horas?: 1-48 (3 por defecto) }
//         o { quitar: true }
// Sale al momento (no espera a ninguna edición): es para resultados y noticias que no pueden esperar.
// Si se vuelve a enviar, sustituye a la anterior (así se van actualizando los resultados).
import { json, fallo, leerJSON, igualesSeguro, guardarUltimaHora } from '../../../servidor/comun.js';

export async function onRequestPost({ request, env }) {
  const clave = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.AGENTE_KEY || !clave || !(await igualesSeguro(clave, env.AGENTE_KEY))) return fallo('Clave del agente no válida.', 401);
  const c = await leerJSON(request);
  if (!c) return fallo('Falta el cuerpo (JSON).');
  if (c.id) {
    const existe = await env.DB.prepare("SELECT id FROM noticias WHERE id = ? AND estado = 'publicada'").bind(String(c.id)).first();
    if (!existe) return fallo(`No hay ninguna noticia publicada con id «${c.id}». Publícala antes o quita "id".`);
  }
  try { await guardarUltimaHora(env, c.quitar ? null : c, 'agente'); }
  catch (e) { return fallo(e.message); }
  return json({ ok: true });
}
