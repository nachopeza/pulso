// POST /api/admin/fotos?nombre=… (cuerpo: la imagen) → la guarda y devuelve su ruta "/fotos/…".
// El panel ya la reduce a 1600 px antes de subirla.
import { json, fallo, guardarFoto } from '../../../servidor/comun.js';

export async function onRequestPost({ request, env }) {
  const tipo = (request.headers.get('Content-Type') || '').split(';')[0];
  const largo = Number(request.headers.get('Content-Length') || 0);
  if (largo > 6 * 1024 * 1024) return fallo('La foto pesa demasiado (máximo 6 MB).', 413);
  const cuerpo = await request.arrayBuffer();
  if (!cuerpo.byteLength || cuerpo.byteLength > 6 * 1024 * 1024) return fallo('La foto está vacía o pesa demasiado.', 413);
  const src = await guardarFoto(env, cuerpo, tipo, new URL(request.url).searchParams.get('nombre'));
  if (!src) return fallo('Formato no admitido: usa JPG, PNG o WebP.', 415);
  return json({ ok: true, src }, 201);
}
