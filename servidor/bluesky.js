// Publicación automática en Bluesky de las piezas aprobadas en el panel.
//
// Cómo funciona:
// - Cada pocos minutos alguien llama a publicarPendientes() (el workflow de GitHub "Redes"
//   o el botón «Confirmar escaleta» del panel).
// - Busca piezas de Bluesky en estado "aprobada" cuya hora (de Madrid) ya ha llegado.
// - Si la hora pasó hace más de MARGEN, no la publica: ya no es actualidad y la decide una persona.
// - Antes de publicar, "reserva" la pieza pasándola a "publicada" de forma atómica:
//   así, aunque dos llamadas coincidan, nunca sale dos veces.
// - Si Bluesky falla, la pieza pasa a "cambiar" con una nota que explica el motivo.
//
// Necesita en Cloudflare:
// - BSKY_USUARIO (variable, en wrangler.toml): la cuenta, p. ej. "pulsomedio.bsky.social"
// - BSKY_CLAVE_APP (secreto): una contraseña de app de Bluesky (Ajustes → Privacidad y seguridad →
//   Contraseñas de app). Nunca la contraseña normal de la cuenta.
import { horaMadrid } from './comun.js';

const API = 'https://bsky.social/xrpc';
export const MARGEN = 2 * 60 * 60 * 1000; // 2 horas
const MAX_POR_VUELTA = 5;                 // por si se acumulan: mejor repartir que soltar diez de golpe
const MAX_MINIATURA = 950 * 1000;         // Bluesky no acepta imágenes de más de ~1 MB

// ¿Le toca salir ya a esta pieza? "pronto" | "toca" | "tarde" | "sin-hora"
export function momentoPieza(p, ahora = Date.now()) {
  if (!/^\d{2}:\d{2}$/.test(p.hora || '')) return 'sin-hora';
  const cuando = horaMadrid(p.dia, p.hora);
  if (cuando > ahora) return 'pronto';
  return ahora - cuando <= MARGEN ? 'toca' : 'tarde';
}

export async function publicarPendientes(env, ahora = Date.now()) {
  if (!env.BSKY_USUARIO || !env.BSKY_CLAVE_APP) {
    return { ok: false, motivo: 'Falta BSKY_USUARIO o BSKY_CLAVE_APP en Cloudflare: no se publica nada.', publicadas: [] };
  }
  // Candidatas: aprobadas de Bluesky de ayer, hoy o mañana (el filtro fino por hora va después)
  const { results } = await env.DB.prepare(
    `SELECT * FROM piezas WHERE red = 'bluesky' AND estado = 'aprobada' AND hora != ''
     AND dia BETWEEN date(?, '-1 day') AND date(?, '+1 day') ORDER BY dia, hora, id`
  ).bind(new Date(ahora).toISOString().slice(0, 10), new Date(ahora).toISOString().slice(0, 10)).all();
  const listas = results.filter((p) => momentoPieza(p, ahora) === 'toca').slice(0, MAX_POR_VUELTA);
  if (!listas.length) return { ok: true, publicadas: [], fallidas: [] };

  let sesion;
  try {
    sesion = await entrar(env);
  } catch (e) {
    return { ok: false, motivo: `No se puede entrar en Bluesky: ${e.message}`, publicadas: [] };
  }

  const publicadas = [];
  const fallidas = [];
  for (const p of listas) {
    // Reserva atómica: solo sigue quien consigue pasarla de "aprobada" a "publicada"
    const r = await env.DB.prepare(
      "UPDATE piezas SET estado = 'publicada', actualizada = ? WHERE id = ? AND estado = 'aprobada'"
    ).bind(Date.now(), p.id).run();
    if (!r.meta || r.meta.changes !== 1) continue;
    try {
      const enlace = await publicarPieza(env, sesion, p);
      await env.DB.prepare("UPDATE piezas SET enlace = ?, nota = ?, actualizada = ? WHERE id = ?")
        .bind(enlace, 'Publicada sola en Bluesky.', Date.now(), p.id).run();
      publicadas.push({ id: p.id, hora: p.hora, enlace });
    } catch (e) {
      await env.DB.prepare("UPDATE piezas SET estado = 'cambiar', nota = ?, actualizada = ? WHERE id = ?")
        .bind(`No se ha podido publicar en Bluesky: ${String(e.message).slice(0, 300)}. Revísala y vuelve a aprobarla.`, Date.now(), p.id).run();
      fallidas.push({ id: p.id, hora: p.hora, error: e.message });
    }
  }
  return { ok: true, publicadas, fallidas };
}

// ---------- Bluesky ----------

async function llamar(metodo, cuerpo, token, tipo = 'application/json') {
  const r = await fetch(`${API}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': tipo, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: tipo === 'application/json' ? JSON.stringify(cuerpo) : cuerpo
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || d.error || `Bluesky respondió ${r.status}`);
  return d;
}

async function entrar(env) {
  const d = await llamar('com.atproto.server.createSession', { identifier: env.BSKY_USUARIO, password: env.BSKY_CLAVE_APP });
  return { token: d.accessJwt, did: d.did, handle: d.handle };
}

async function publicarPieza(env, sesion, p) {
  const texto = p.texto.trim();
  const facetas = facetasDe(texto);
  const registro = { $type: 'app.bsky.feed.post', text: texto, createdAt: new Date().toISOString(), langs: ['es'] };
  if (facetas.length) registro.facets = facetas;

  // Tarjeta de vista previa del primer enlace a pulso (con la foto de la noticia o la imagen de marca)
  const enlace = facetas.map((f) => f.features[0].uri).find((u) => u && /^https:\/\/(www\.)?pulso\.com\.es/i.test(u));
  if (enlace) {
    try { registro.embed = await tarjeta(env, sesion, p, enlace); } catch (e) { /* sin tarjeta, el post sale igual */ }
  }
  const d = await llamar('com.atproto.repo.createRecord',
    { repo: sesion.did, collection: 'app.bsky.feed.post', record: registro }, sesion.token);
  const clave = String(d.uri || '').split('/').pop();
  return `https://bsky.app/profile/${sesion.handle}/post/${clave}`;
}

// Enlaces y hashtags del texto, con sus posiciones en bytes UTF-8 (así las pide Bluesky)
export function facetasDe(texto) {
  const bytes = (s) => new TextEncoder().encode(s).length;
  const facetas = [];
  const reEnlace = /(https?:\/\/[^\s]+|\b(?:www\.)?pulso\.com\.es(?:\/[^\s]*)?)/gi;
  for (const m of texto.matchAll(reEnlace)) {
    let t = m[0].replace(/[.,;:!?)»”"']+$/, '');
    const inicio = bytes(texto.slice(0, m.index));
    facetas.push({
      index: { byteStart: inicio, byteEnd: inicio + bytes(t) },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: /^https?:\/\//i.test(t) ? t : `https://${t}` }]
    });
  }
  for (const m of texto.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)) {
    const pos = m.index + m[1].length;
    const inicio = bytes(texto.slice(0, pos));
    facetas.push({
      index: { byteStart: inicio, byteEnd: inicio + bytes(`#${m[2]}`) },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[2] }]
    });
  }
  return facetas.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

async function tarjeta(env, sesion, p, enlace) {
  let titulo = 'pulso, noticias en corto';
  let descripcion = 'Las noticias del día, en corto y con fuentes.';
  let foto = '/img/compartir.png';
  if (p.noticia) {
    const n = await env.DB.prepare('SELECT titular, datos FROM noticias WHERE id = ?').bind(p.noticia).first();
    if (n) {
      const datos = JSON.parse(n.datos || '{}');
      titulo = n.titular;
      descripcion = datos.entradilla || descripcion;
      if (datos.imagen?.src) foto = datos.imagen.src;
    }
  }
  const external = { uri: enlace, title: titulo.slice(0, 300), description: descripcion.slice(0, 1000) };
  const url = /^https?:\/\//.test(foto) ? foto : `${env.SITIO}/${foto.replace(/^\//, '')}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'pulso-redes/1.0 (https://pulso.com.es)' } });
  const tipo = (r.headers.get('Content-Type') || '').split(';')[0];
  if (r.ok && /^image\/(jpeg|png|webp)$/.test(tipo)) {
    const imagen = await r.arrayBuffer();
    if (imagen.byteLength <= MAX_MINIATURA) {
      const b = await llamar('com.atproto.repo.uploadBlob', imagen, sesion.token, tipo);
      external.thumb = b.blob;
    }
  }
  return { $type: 'app.bsky.embed.external', external };
}
