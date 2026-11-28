// Piezas de las páginas que pinta el servidor (noticia suelta y hemeroteca).
// Son páginas sencillas, sin la app: cargan rápido, se leen sin JavaScript y Google las entiende.
// Usan el mismo estilo que las páginas legales (css/legal.css).

export const ADSENSE = 'ca-pub-1521987978164089';
export const CATS = {
  elecciones: '29N', espana: 'España', mundo: 'Mundo', economia: 'Economía',
  tecnologia: 'Tecnología', clima: 'Clima', cultura: 'Cultura', deportes: 'Deportes'
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Solo enlaces http(s): nada de javascript: ni cosas raras en un href
export const url = (u) => (/^https?:\/\/[^\s"<>]+$/i.test(u || '') ? esc(u) : '');

const ZONA = 'Europe/Madrid';
export const fechaLarga = (ms) => new Date(ms).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONA });
export const fechaHora = (ms) => new Date(ms).toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: ZONA });
export const hora = (ms) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: ZONA });

// Ruta de una foto (las nuestras están en /fotos/…, las de ejemplo en img/…)
export function rutaFoto(src, sitio) {
  if (!src) return '';
  if (/^https:\/\//i.test(src)) return src;
  return `${sitio}/${String(src).replace(/^\//, '')}`;
}

// El bloque de AdSense activo (el primero encendido en el panel), o null
export async function bloqueAdsense(env) {
  const f = await env.DB.prepare("SELECT valor FROM ajustes WHERE clave = 'banners'").first();
  const lista = f?.valor ? JSON.parse(f.valor) : [];
  return lista.find((b) => b.activo && b.tipo === 'adsense' && /^\d{6,20}$/.test(b.slot || '')) || null;
}
// Hueco de publicidad discreto. No ocupa sitio hasta que Google pone un anuncio (ver legal.css)
export const publiHTML = (b) => (b ? `<aside class="publi publi-ads" aria-label="Publicidad">
  <span class="publi-etq">Publicidad</span>
  <ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE}" data-ad-slot="${esc(b.slot)}" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
  <script>(window.adsbygoogle = window.adsbygoogle || []).push({});</script>
</aside>` : '');

// Página completa: cabecera, contenido y pie con los enlaces legales
export function pagina({ titulo, descripcion, canonica, cabeza = '', cuerpo, sitio }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="${esc(canonica)}">
<meta name="theme-color" content="#1c1d21">
<meta name="google-adsense-account" content="${ADSENSE}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/archivo-latin-wdth-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/legal.css">
<!-- Google AdSense: anuncios y aviso de cookies (el aviso se configura en AdSense → Privacidad y mensajes) -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>
${cabeza}
</head>
<body>
<header class="cabecera">
  <a class="logo" href="/">pulso<span>.</span></a>
  <nav class="cab-nav" aria-label="Principal"><a href="/hemeroteca">Hemeroteca</a><a class="volver" href="/">Portada</a></nav>
</header>
<main>
${cuerpo}
</main>
<footer class="pie">
  <a href="/hemeroteca">Hemeroteca</a><a href="/aviso-legal.html">Aviso legal</a><a href="/privacidad.html">Privacidad</a><a href="/cookies.html">Cookies</a><a href="/cookies.html#configurar" data-config-cookies>Configurar cookies</a><a href="mailto:hola@pulso.com.es">Contacto</a>
</footer>
<script src="/js/legal.js" defer></script>
</body>
</html>`;
}

export const html = (texto, estado = 200, cache = 'public, max-age=300') =>
  new Response(texto, { status: estado, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache } });

// Página de «no existe» con enlaces útiles (status 404 de verdad, para que Google no la indexe)
export function noExiste(sitio, mensaje = 'Esta página no existe o ya no está disponible.') {
  return html(pagina({
    titulo: 'No encontrada · pulso', descripcion: mensaje, canonica: `${sitio}/hemeroteca`, sitio,
    cabeza: '<meta name="robots" content="noindex">',
    cuerpo: `<h1>No la encontramos</h1><p class="fecha">${esc(mensaje)}</p>
      <p><a href="/">Ir a la portada</a> · <a href="/hemeroteca">Buscar en la hemeroteca</a></p>`
  }), 404, 'no-store');
}
