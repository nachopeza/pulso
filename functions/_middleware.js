// Redirección de dominio: pulso vive en pulso.com.es.
// Quien entre por pulsomedio.es (o por www.) va a la misma página en pulso.com.es con un 301,
// así no se pierden los enlaces ya publicados en redes. El #id de cada noticia lo conserva
// el navegador al redirigir.
// /api/ no se redirige: así los agentes y el panel siguen funcionando aunque alguno
// apunte todavía al dominio viejo.
const DESTINO = 'pulso.com.es';
const REDIRIGIR = new Set(['pulsomedio.es', 'www.pulsomedio.es', 'www.pulso.com.es']);

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (REDIRIGIR.has(url.hostname) && !url.pathname.startsWith('/api/')) {
    url.hostname = DESTINO;
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  const res = await next();
  // Cabeceras de seguridad también en las páginas que pinta el servidor (noticia, hemeroteca, API):
  // _headers solo se aplica a los archivos fijos. Si ya vienen puestas, no se tocan.
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SEGURIDAD)) if (!r.headers.has(k)) r.headers.set(k, v);
  return r;
}

// Compatibles con Google AdSense (que carga scripts y marcos de muchos dominios de Google):
// por eso la CSP no limita de dónde vienen los scripts, pero sí cierra lo demás:
// nada de plugins, nadie puede cambiar la base de los enlaces, los formularios solo van a pulso,
// nadie puede meter pulso dentro de un marco ajeno y todo va por HTTPS.
const SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests",
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
};
