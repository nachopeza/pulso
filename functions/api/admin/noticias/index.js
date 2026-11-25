// GET  /api/admin/noticias?q=&situacion=&cat=&pagina=  → buscador de todas las noticias
// POST /api/admin/noticias { datos }                     → crea una noticia nueva (como borrador)
import { json, fallo, leerJSON, limpiarNoticia, crearId, filaPanel, versionStmt, CATEGORIAS } from '../../../../servidor/comun.js';

const POR_PAGINA = 40;

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const ahora = Date.now();
  const donde = [];
  const valores = [];
  const v = (x) => { valores.push(x); return `?${valores.length}`; };

  switch (p.get('situacion')) {
    case 'visible': donde.push(`estado = 'publicada' AND publicar_en <= ${v(ahora)} AND (retirar_en IS NULL OR retirar_en > ${v(ahora)})`); break;
    case 'programada': donde.push(`estado = 'publicada' AND publicar_en > ${v(ahora)}`); break;
    case 'pendiente': donde.push(`revisada = 0 AND estado IN ('borrador', 'publicada')`); break;
    case 'borrador': donde.push(`estado = 'borrador'`); break;
    case 'retirada': donde.push(`(estado = 'retirada' OR (estado = 'publicada' AND retirar_en <= ${v(ahora)}))`); break;
    case 'descartada': donde.push(`estado = 'descartada'`); break;
    default: donde.push(`estado != 'descartada'`);
  }
  const cat = p.get('cat');
  if (CATEGORIAS.includes(cat)) donde.push(`categoria = ${v(cat)}`);
  const q = (p.get('q') || '').trim().slice(0, 80);
  if (q) { const like = `%${q.replace(/[%_]/g, '')}%`; donde.push(`(titular LIKE ${v(like)} OR datos LIKE ${v(like)} OR id LIKE ${v(like)})`); }
  const pagina = Math.max(0, parseInt(p.get('pagina'), 10) || 0);

  const { results } = await env.DB.prepare(
    `SELECT * FROM noticias WHERE ${donde.join(' AND ')}
     ORDER BY COALESCE(publicar_en, actualizada) DESC LIMIT ${POR_PAGINA + 1} OFFSET ${pagina * POR_PAGINA}`
  ).bind(...valores).all();
  return json({
    noticias: results.slice(0, POR_PAGINA).map((f) => filaPanel(f, ahora)),
    mas: results.length > POR_PAGINA
  });
}

export async function onRequestPost({ request, env, data }) {
  const cuerpo = await leerJSON(request);
  const { datos, errores } = limpiarNoticia(cuerpo?.datos, { borrador: true });
  if (errores.length) return json({ error: errores[0], errores }, 400);
  delete datos.actualizada;
  const id = crearId(datos.titular);
  const ahora = Date.now();
  const imp = Number(cuerpo.importancia);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO noticias (id, estado, revisada, importancia, categoria, titular, datos, autor, creada, actualizada)
       VALUES (?, 'borrador', 1, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, imp >= 1 && imp <= 5 ? Math.round(imp) : 3, datos.categoria, datos.titular, JSON.stringify(datos), data.usuario.email, ahora, ahora),
    versionStmt(env, id, data.usuario.email, 'creada')
  ]);
  return json({ ok: true, id }, 201);
}
