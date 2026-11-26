// POST /api/agente/redes → publica en Bluesky las piezas aprobadas a las que ya les toca.
// Lo llama cada 5 minutos el workflow de GitHub «Redes» (.github/workflows/redes.yml).
// Necesita la cabecera "Authorization: Bearer <AGENTE_KEY>" (la misma clave que los agentes).
import { json, fallo, igualesSeguro } from '../../../servidor/comun.js';
import { publicarPendientes } from '../../../servidor/bluesky.js';

export async function onRequestPost({ request, env }) {
  const clave = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.AGENTE_KEY || !clave || !(await igualesSeguro(clave, env.AGENTE_KEY))) return fallo('Clave no válida.', 401);
  return json(await publicarPendientes(env));
}
