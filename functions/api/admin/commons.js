// GET  /api/admin/commons?q=…        → busca fotos libres en Wikimedia Commons
// POST /api/admin/commons { url, nombre } → copia la elegida a nuestro almacén
import { json, fallo, leerJSON, importarFoto, buscarCommons } from '../../../servidor/comun.js';

export async function onRequestGet({ request }) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 100);
  if (!q) return fallo('Escribe qué buscas.');
  const fotos = await buscarCommons(q);
  if (!fotos) return fallo('Wikimedia Commons no responde ahora. Prueba en un momento.', 502);
  return json({ fotos });
}

export async function onRequestPost({ request, env }) {
  const c = await leerJSON(request);
  const src = await importarFoto(env, c?.url, c?.nombre);
  if (!src) return fallo('No se ha podido copiar esa foto.', 502);
  return json({ ok: true, src });
}
