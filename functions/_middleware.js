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
  return next();
}
