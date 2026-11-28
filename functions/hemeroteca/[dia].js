// GET /hemeroteca/AAAA-MM-DD → las noticias publicadas ese día (hora de Madrid), por secciones.
import { PUBLICADA, diaMadrid, horaMadrid } from '../../servidor/comun.js';
import { esc, pagina, html, noExiste, publiHTML, bloqueAdsense, fechaLarga, hora, CATS } from '../../servidor/paginas.js';

export async function onRequestGet({ env, params }) {
  const sitio = env.SITIO || 'https://pulso.com.es';
  const dia = String(params.dia || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(Date.parse(dia))) return noExiste(sitio);
  const ahora = Date.now();
  const desde = horaMadrid(dia, '00:00');
  const manana = diaMadrid(desde + 30 * 3600000);
  const hasta = horaMadrid(manana, '00:00');

  const [{ results }, antes, despues, bloque] = await Promise.all([
    env.DB.prepare(`SELECT id, titular, categoria, publicar_en, datos FROM noticias WHERE ${PUBLICADA} AND publicar_en >= ?2 AND publicar_en < ?3
      ORDER BY importancia DESC, publicar_en DESC`).bind(ahora, desde, hasta).all(),
    env.DB.prepare(`SELECT publicar_en FROM noticias WHERE ${PUBLICADA} AND publicar_en < ?2 ORDER BY publicar_en DESC LIMIT 1`).bind(ahora, desde).first(),
    env.DB.prepare(`SELECT publicar_en FROM noticias WHERE ${PUBLICADA} AND publicar_en >= ?2 ORDER BY publicar_en ASC LIMIT 1`).bind(ahora, hasta).first(),
    bloqueAdsense(env)
  ]);
  if (!results.length) return noExiste(sitio, 'Ese día no hay noticias en la hemeroteca.');

  const secciones = Object.keys(CATS).map((k) => [k, results.filter((r) => r.categoria === k)]).filter(([, ns]) => ns.length);
  const item = (r) => {
    const d = JSON.parse(r.datos || '{}');
    return `<li><span class="mini">${esc(hora(r.publicar_en))}</span><a href="/noticia/${esc(r.id)}">${esc(r.titular)}</a>
      ${d.entradilla ? `<p>${esc(d.entradilla)}</p>` : ''}</li>`;
  };
  const bloques = secciones.map(([k, ns], i) => `<section class="hem-seccion" data-cat="${k}"><h2>${esc(CATS[k])}</h2>
    <ul class="hem-lista">${ns.map(item).join('')}</ul></section>${i === 1 ? publiHTML(bloque) : ''}`).join('');
  const nav = `<nav class="hem-nav" aria-label="Otros días">
    ${antes ? `<a href="/hemeroteca/${diaMadrid(antes.publicar_en)}" rel="prev">← Día anterior</a>` : '<span></span>'}
    <a href="/hemeroteca">Todos los días</a>
    ${despues ? `<a href="/hemeroteca/${diaMadrid(despues.publicar_en)}" rel="next">Día siguiente →</a>` : '<span></span>'}
  </nav>`;

  const titulo = fechaLarga(desde + 12 * 3600000);
  const cuerpo = `<p class="art-etq"><a href="/hemeroteca">Hemeroteca</a></p>
    <h1>${esc(titulo.charAt(0).toUpperCase() + titulo.slice(1))}</h1>
    <p class="fecha">${results.length} ${results.length === 1 ? 'noticia' : 'noticias'}</p>
    ${bloques}
    ${secciones.length < 2 ? publiHTML(bloque) : ''}
    ${nav}`;
  return html(pagina({
    titulo: `Noticias del ${titulo} · pulso`, descripcion: `Las ${results.length} noticias que publicó pulso el ${titulo}.`,
    canonica: `${sitio}/hemeroteca/${dia}`, cuerpo, sitio
  }));
}
