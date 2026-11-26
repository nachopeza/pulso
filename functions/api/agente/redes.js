// POST /api/agente/redes → publica en Bluesky las piezas aprobadas a las que ya les toca.
// Lo llama cada 5 minutos el workflow de GitHub «Redes» (.github/workflows/redes.yml).
// Necesita la cabecera "Authorization: Bearer <clave>", con REDES_KEY (clave propia del aviso de redes)
// o AGENTE_KEY (la de los agentes).
import { json, fallo, igualesSeguro } from '../../../servidor/comun.js';
import { publicarPendientes, entrar } from '../../../servidor/bluesky.js';

export async function onRequestPost({ request, env }) {
  const clave = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const validas = [env.REDES_KEY, env.AGENTE_KEY].filter(Boolean);
  let ok = false;
  for (const v of validas) if (clave && (await igualesSeguro(clave, v))) ok = true;
  if (!ok) return fallo('Clave no válida.', 401);
  // ?probar=1 → solo comprueba que se puede entrar en Bluesky, sin publicar nada
  if (new URL(request.url).searchParams.get('probar')) {
    if (!env.BSKY_USUARIO || !env.BSKY_CLAVE_APP) return json({ ok: false, motivo: 'Falta BSKY_CLAVE_APP en Cloudflare.' });
    try { const s = await entrar(env); return json({ ok: true, cuenta: s.handle }); }
    catch (e) { return json({ ok: false, motivo: `Bluesky no acepta la contraseña de app: ${e.message}` }); }
  }
  return json(await publicarPendientes(env));
}
