// GET /noticia/<id> → la noticia en su propia página, con dirección fija.
// Es la que ve Google (y la que enlaza la hemeroteca): texto completo, fuentes, foto con autoría,
// fecha y datos estructurados de «noticia». Sigue existiendo aunque la noticia ya no esté en portada.
// Solo desaparece si alguien la retira a mano en el panel.
import { PUBLICADA, isoMadrid, diaMadrid } from '../../servidor/comun.js';
import { esc, url, pagina, html, noExiste, publiHTML, bloqueAdsense, rutaFoto, fechaHora, hora, CATS } from '../../servidor/paginas.js';

export async function onRequestGet({ env, params }) {
  const sitio = env.SITIO || 'https://pulso.com.es';
  const id = String(params.id || '');
  const ahora = Date.now();
  if (!/^[a-z0-9-]{3,70}$/.test(id)) return noExiste(sitio);
  const f = await env.DB.prepare(`SELECT * FROM noticias WHERE id = ?2 AND ${PUBLICADA}`).bind(ahora, id).first();
  if (!f) return noExiste(sitio, 'Esta noticia no existe o se ha retirado.');

  const d = JSON.parse(f.datos || '{}');
  const c = CATS[f.categoria] ? f.categoria : 'espana';
  const publicada = Date.parse(d.fecha || '') || f.publicar_en;
  const actualizada = Date.parse(d.actualizada || '') || null;
  const canonica = `${sitio}/noticia/${f.id}`;
  const foto = d.imagen?.src ? rutaFoto(d.imagen.src, sitio) : '';

  // ¿Hay una versión más nueva (una actualización que la sustituye)? Y más noticias del mismo día
  const [nueva, mismoDia, bloque] = await Promise.all([
    env.DB.prepare(`SELECT id, titular FROM noticias WHERE json_extract(datos, '$.sustituye') = ?2 AND ${PUBLICADA} ORDER BY publicar_en DESC LIMIT 1`)
      .bind(ahora, f.id).first(),
    env.DB.prepare(`SELECT id, titular, categoria, publicar_en FROM noticias WHERE ${PUBLICADA} AND publicar_en BETWEEN ?2 AND ?3 AND id != ?4
       ORDER BY importancia DESC, publicar_en DESC LIMIT 6`).bind(ahora, f.publicar_en - 18 * 3600000, f.publicar_en + 18 * 3600000, f.id).all(),
    bloqueAdsense(env)
  ]);

  const puntos = (d.puntos || []).map((p) => `<li>${esc(p)}</li>`).join('');
  const fuentes = (d.fuentes || []).map((x) => `<li>${url(x.url) ? `<a href="${url(x.url)}" rel="noopener" target="_blank">${esc(x.medio)}</a>` : esc(x.medio)}</li>`).join('');
  const titulares = (d.titulares || []).map((t) => `<li><span class="medio">${esc(t.medio)}</span> <q>${esc(t.titular)}</q>
    ${url(t.url) ? ` <a href="${url(t.url)}" rel="noopener" target="_blank">Leer en ${esc(t.medio)}</a>` : ''}</li>`).join('');
  const credito = d.imagen ? [esc(d.imagen.credito), esc(d.imagen.licencia)].filter(Boolean).join(' · ') : '';
  const figura = foto ? `<figure class="art-foto">
      <img src="${esc(foto)}" alt="${esc(d.imagen.alt)}" width="1200" height="675" ${d.imagen.posicion ? `style="object-position:${esc(d.imagen.posicion)}"` : ''}>
      ${credito ? `<figcaption>${url(d.imagen.enlace) ? `<a href="${url(d.imagen.enlace)}" rel="noopener" target="_blank">${credito}</a>` : credito}</figcaption>` : ''}
    </figure>` : '';
  const otras = mismoDia.results.map((o) => `<li><span class="mini">${esc(CATS[o.categoria] || '')} · ${esc(hora(o.publicar_en))}</span>
    <a href="/noticia/${esc(o.id)}">${esc(o.titular)}</a></li>`).join('');

  // Datos estructurados: así Google sabe que es una noticia, de quién y de cuándo
  const ld = {
    '@context': 'https://schema.org', '@type': 'NewsArticle',
    headline: f.titular, description: d.entradilla || '', inLanguage: 'es-ES',
    datePublished: isoMadrid(publicada), dateModified: isoMadrid(actualizada || publicada),
    mainEntityOfPage: canonica, articleSection: CATS[c],
    image: foto ? [foto] : [`${sitio}/img/compartir.png`],
    author: { '@type': 'Organization', name: 'pulso', url: sitio },
    publisher: { '@type': 'Organization', name: 'pulso', url: sitio, logo: { '@type': 'ImageObject', url: `${sitio}/apple-touch-icon.png` } },
    isBasedOn: (d.fuentes || []).map((x) => x.url).filter(Boolean)
  };

  const cuerpo = `<article class="art">
    <p class="art-etq" data-cat="${c}"><a href="/hemeroteca/${diaMadrid(publicada)}">${esc(CATS[c])}</a></p>
    <h1>${esc(f.titular)}</h1>
    <p class="fecha"><time datetime="${isoMadrid(publicada)}">${esc(fechaHora(publicada))}</time>${actualizada ? ` · Actualizada a las ${esc(hora(actualizada))}` : ''}</p>
    ${nueva ? `<div class="resumen"><p><b>Hay una versión más reciente:</b> <a href="/noticia/${esc(nueva.id)}">${esc(nueva.titular)}</a></p></div>` : ''}
    ${d.entradilla ? `<p class="entradilla">${esc(d.entradilla)}</p>` : ''}
    ${figura}
    ${puntos ? `<h2>Las claves</h2><ul class="puntos">${puntos}</ul>` : ''}
    ${d.porque ? `<p class="porque"><b>Por qué te importa.</b> ${esc(d.porque)}</p>` : ''}
    ${d.correccion ? `<p class="porque"><b>Corrección.</b> ${esc(d.correccion)}</p>` : ''}
    ${titulares ? `<h2>Cómo lo titulan</h2><ul class="titulares">${titulares}</ul>` : ''}
    ${fuentes ? `<h2>Fuentes</h2><ul>${fuentes}</ul>` : ''}
    <p class="firma">Redactado por pulso a partir de las fuentes citadas. <a href="/aviso-legal.html">Cómo trabajamos</a>.</p>
    <p class="art-acciones"><a class="btn" href="/#${esc(f.id)}">Abrir en pulso para comentar o guardar</a></p>
  </article>
  ${publiHTML(bloque)}
  ${otras ? `<section class="art-mas"><h2>Más noticias de ese día</h2><ul class="hem-lista">${otras}</ul>
    <p><a href="/hemeroteca/${diaMadrid(publicada)}">Todas las noticias del ${esc(new Date(publicada).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }))}</a></p></section>` : ''}`;

  const cabeza = `<meta property="og:type" content="article">
<meta property="og:site_name" content="pulso">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="${esc(f.titular)}">
<meta property="og:description" content="${esc(d.entradilla || 'Las noticias del día, en corto y con fuentes.')}">
<meta property="og:url" content="${esc(canonica)}">
<meta property="og:image" content="${esc(foto || `${sitio}/img/compartir.png`)}">
<meta property="article:published_time" content="${isoMadrid(publicada)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@pulsomedio">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;

  return html(pagina({ titulo: `${f.titular} · pulso`, descripcion: d.entradilla || f.titular, canonica, cabeza, cuerpo, sitio }));
}
