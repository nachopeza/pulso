// GET /api/agente/fotos?q=… → fotos libres de Wikimedia Commons para el agente redactor.
// Necesita "Authorization: Bearer <AGENTE_KEY>". Existe porque desde el entorno del agente
// Commons a veces no responde; desde aquí (Cloudflare) sí. Devuelve cada foto ya con el formato
// del campo "imagen" de una noticia (solo falta escribir "alt").
import { json, fallo, igualesSeguro, buscarCommons } from '../../../servidor/comun.js';

export async function onRequestGet({ request, env }) {
  const clave = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.AGENTE_KEY || !clave || !(await igualesSeguro(clave, env.AGENTE_KEY))) return fallo('Clave del agente no válida.', 401);
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 100);
  if (!q) return fallo('Falta ?q= con lo que buscas.');
  const fotos = await buscarCommons(q, 12);
  if (!fotos) return fallo('Wikimedia Commons no responde ahora.', 502);
  return json({
    q,
    fotos: fotos.map((f) => ({
      descripcion: f.descripcion || f.titulo,
      tamano: `${f.ancho}x${f.alto}`,
      imagen: { src: f.url, alt: '', credito: f.credito, licencia: f.licencia, enlace: f.enlace }
    }))
  });
}
