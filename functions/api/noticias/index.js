// GET /api/noticias → lo que ve el lector, con el mismo formato que tenía data/noticias.json.
// Las programadas aparecen solas al llegar su hora: no hace falta que nada "las publique".
import { json, VISIBLE, PORTADA_HORAS, isoMadrid, ordenarPortada } from '../../../servidor/comun.js';

export async function onRequestGet({ env }) {
  const ahora = Date.now();
  const desde = ahora - PORTADA_HORAS * 60 * 60 * 1000;

  let { results: filas } = await env.DB.prepare(
    `SELECT * FROM noticias WHERE ${VISIBLE} AND (publicar_en >= ?2 OR fijada = 1) ORDER BY publicar_en DESC LIMIT 60`
  ).bind(ahora, desde).all();
  // Si un día falla todo, la portada no se queda vacía: enseña las últimas publicadas
  if (filas.length < 6) {
    ({ results: filas } = await env.DB.prepare(
      `SELECT * FROM noticias WHERE ${VISIBLE} ORDER BY publicar_en DESC LIMIT 12`
    ).bind(ahora).all());
  }

  // Solo una destacada: la más reciente de las marcadas
  const destacada = filas.find((f) => f.destacado)?.id;
  // El orden lo decide la importancia y la edad (ver ordenarPortada): cambia a lo largo del día
  const noticias = ordenarPortada(filas, ahora).map((f, i) => {
    const d = JSON.parse(f.datos);
    return { ...d, id: f.id, categoria: f.categoria, destacado: f.id === destacada, orden: i + 1,
      fecha: d.fecha || isoMadrid(f.publicar_en) };
  });
  const ids = new Set(noticias.map((n) => n.id));

  const mom = await env.DB.prepare('SELECT * FROM momentos WHERE desde <= ? ORDER BY desde DESC LIMIT 1').bind(ahora).first();
  let momentos = null;
  if (mom) {
    momentos = JSON.parse(mom.datos);
    for (const m of Object.values(momentos)) m.puntos = (m.puntos || []).filter((p) => ids.has(p.id));
  }
  const anuncio = await env.DB.prepare("SELECT valor FROM ajustes WHERE clave = 'anuncio'").first();
  // Límite de lectura sin cuenta: { gratis: 5, dias: 7, desde: "2026-11-30T00:00:00+01:00" }
  // (sin ajuste, con gratis 0 o antes de "desde" → sin límite)
  const ajusteLectura = await env.DB.prepare("SELECT valor FROM ajustes WHERE clave = 'lectura'").first();
  let lectura = ajusteLectura?.valor ? JSON.parse(ajusteLectura.valor) : null;
  if (lectura?.desde && Date.parse(lectura.desde) > ahora) lectura = null;

  // "Actualizado": lo último que ha cambiado de lo que se ve
  const ultima = Math.max(0, mom?.desde || 0, mom?.actualizado || 0,
    ...filas.map((f) => Math.max(f.publicar_en, Math.min(f.actualizada, ahora))));

  return json({
    actualizado: isoMadrid(ultima || ahora),
    anuncio: anuncio?.valor ? JSON.parse(anuncio.valor) : null,
    lectura: lectura ? { gratis: lectura.gratis, dias: lectura.dias } : null,
    momentos,
    noticias
  }, 200, { 'Cache-Control': 'no-cache' });
}
