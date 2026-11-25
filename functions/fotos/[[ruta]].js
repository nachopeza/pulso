// GET /fotos/<nombre> → sirve las fotos guardadas en el almacén R2.
// Cada foto tiene un nombre único, así que el navegador puede guardarla un año.
export async function onRequestGet({ env, params }) {
  const clave = (params.ruta || []).join('/');
  if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(clave)) return new Response('No existe', { status: 404 });
  const foto = await env.FOTOS.get(clave);
  if (!foto) return new Response('No existe', { status: 404 });
  return new Response(foto.body, {
    headers: {
      'Content-Type': foto.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
