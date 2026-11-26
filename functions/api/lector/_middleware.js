// Se ejecuta antes de cualquier /api/lector/…
// Deja en context.data.lector quién es el lector (o null si no ha entrado) y
// solo acepta cambios que vengan de la propia web.
import { fallo, lectorDe } from '../../../servidor/comun.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') {
    const origen = request.headers.get('Origin');
    if (origen && origen !== new URL(request.url).origin) return fallo('Petición no permitida.', 403);
    // Lo que trae datos tiene que ser JSON (DELETE no trae nada)
    if (request.method !== 'DELETE' && !(request.headers.get('Content-Type') || '').startsWith('application/json')) return fallo('Petición no permitida.', 415);
  }
  context.data.lector = await lectorDe(request, env);
  return context.next();
}
