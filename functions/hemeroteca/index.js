// GET /hemeroteca → todos los días con noticias, agrupados por mes. Cada día lleva a /hemeroteca/AAAA-MM-DD.
import { PUBLICADA, diaMadrid } from '../../servidor/comun.js';
import { esc, pagina, html } from '../../servidor/paginas.js';

export async function onRequestGet({ env }) {
  const sitio = env.SITIO || 'https://pulso.com.es';
  const ahora = Date.now();
  // Solo la hora de publicación: es ligero aunque haya miles de noticias
  const { results } = await env.DB.prepare(`SELECT publicar_en FROM noticias WHERE ${PUBLICADA} ORDER BY publicar_en DESC LIMIT 20000`)
    .bind(ahora).all();

  const porDia = new Map();
  for (const r of results) {
    const d = diaMadrid(r.publicar_en);
    porDia.set(d, (porDia.get(d) || 0) + 1);
  }
  const porMes = new Map();
  for (const [dia, n] of porDia) {
    const mes = dia.slice(0, 7);
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push([dia, n]);
  }
  const nombreMes = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const nombreDia = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

  const meses = [...porMes].map(([mes, dias]) => `<section><h2>${esc(nombreMes(mes))}</h2>
    <ul class="hem-dias">${dias.map(([d, n]) => `<li><a href="/hemeroteca/${d}"><b>${esc(nombreDia(d))}</b><span>${n} ${n === 1 ? 'noticia' : 'noticias'}</span></a></li>`).join('')}</ul></section>`).join('');

  const cuerpo = `<h1>Hemeroteca</h1>
    <p class="fecha">Todas las noticias de pulso, día a día. Ninguna se borra: cuando salen de la portada, siguen aquí.</p>
    ${meses || '<p>Todavía no hay noticias.</p>'}`;
  return html(pagina({
    titulo: 'Hemeroteca · pulso', descripcion: 'Todas las noticias publicadas en pulso, ordenadas por día.',
    canonica: `${sitio}/hemeroteca`, cuerpo, sitio
  }));
}
