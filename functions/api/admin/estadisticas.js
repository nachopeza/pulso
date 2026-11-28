// GET /api/admin/estadisticas?dias=7 → todo lo que pinta la página «Estadísticas» del panel:
// visitas y lecturas por día, noticias más leídas, de dónde llega la gente, lectores registrados,
// comentarios y guardadas, y cómo van los posts de Bluesky (su API pública, sin clave).
import { json, diaMadrid } from '../../../servidor/comun.js';
import { momentoPieza } from '../../../servidor/bluesky.js';

const BSKY = 'https://public.api.bsky.app/xrpc';

export async function onRequestGet({ request, env }) {
  const dias = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get('dias'), 10) || 7, 1), 90);
  const ahora = Date.now();
  const hoy = diaMadrid(ahora);
  const desde = diaMadrid(ahora - (dias - 1) * 86400000);
  const desdeMs = ahora - dias * 86400000;

  // Las huellas de visitantes solo sirven el mismo día: fuera las de hace más de 2 días
  await env.DB.prepare('DELETE FROM unicos WHERE dia < ?').bind(diaMadrid(ahora - 2 * 86400000)).run();

  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  const [porDia, top, origenes, disp, lectores, actividad, redes, aprobadas] = await env.DB.batch([
    q(`SELECT dia, tipo, sum(n) AS n FROM visitas WHERE dia >= ? AND tipo IN ('pagina', 'unicos', 'lectura', 'compartir')
       GROUP BY dia, tipo`, desde),
    q(`SELECT v.clave AS id, n.titular, n.categoria,
         sum(CASE WHEN v.tipo = 'lectura' THEN v.n ELSE 0 END) AS lecturas,
         sum(CASE WHEN v.tipo = 'compartir' THEN v.n ELSE 0 END) AS compartida
       FROM visitas v LEFT JOIN noticias n ON n.id = v.clave
       WHERE v.dia >= ? AND v.tipo IN ('lectura', 'compartir')
       GROUP BY v.clave ORDER BY lecturas DESC, compartida DESC LIMIT 15`, desde),
    q(`SELECT clave, sum(n) AS n FROM visitas WHERE dia >= ? AND tipo = 'origen' GROUP BY clave ORDER BY n DESC`, desde),
    q(`SELECT clave, sum(n) AS n FROM visitas WHERE dia >= ? AND tipo = 'disp' GROUP BY clave ORDER BY n DESC`, desde),
    q(`SELECT count(*) AS total, sum(creado >= ?1) AS nuevos, sum(ultimo >= ?1) AS activos FROM lectores`, desdeMs),
    q(`SELECT (SELECT count(*) FROM comentarios WHERE creado >= ?1) AS comentarios,
              (SELECT count(*) FROM comentarios WHERE creado >= ?1 AND estado = 'oculto') AS ocultos,
              (SELECT count(*) FROM guardadas WHERE creada >= ?1) AS guardadas,
              (SELECT count(*) FROM guardadas) AS guardadasTotal`, desdeMs),
    q(`SELECT red, estado, count(*) AS n FROM piezas WHERE dia >= ? AND dia <= ? GROUP BY red, estado`, desde, hoy),
    q(`SELECT dia, hora FROM piezas WHERE red = 'bluesky' AND estado = 'aprobada' AND dia >= ?`, desde)
  ]);

  // Serie completa, con ceros en los días sin datos
  const serie = [];
  for (let i = dias - 1; i >= 0; i--) serie.push({ dia: diaMadrid(ahora - i * 86400000), pagina: 0, unicos: 0, lectura: 0, compartir: 0 });
  for (const f of porDia.results) {
    const d = serie.find((s) => s.dia === f.dia);
    if (d) d[f.tipo] = f.n;
  }

  return json({
    dias, desde, hoy, serie,
    top: top.results,
    origenes: origenes.results,
    dispositivos: disp.results,
    lectores: lectores.results[0],
    actividad: actividad.results[0],
    redes: redes.results,
    // Aprobadas de Bluesky cuya hora pasó hace más de 2 horas: ya no saldrán solas
    atascadas: aprobadas.results.filter((p) => momentoPieza(p, ahora) === 'tarde').length,
    bluesky: await bluesky(env)
  });
}

// Seguidores y últimos posts de la cuenta de Bluesky, con sus me gusta, reposts y respuestas
async function bluesky(env) {
  const cuenta = env.BSKY_USUARIO;
  if (!cuenta) return null;
  try {
    const [p, f] = await Promise.all([
      fetch(`${BSKY}/app.bsky.actor.getProfile?actor=${cuenta}`).then((r) => r.json()),
      fetch(`${BSKY}/app.bsky.feed.getAuthorFeed?actor=${cuenta}&limit=20&filter=posts_no_replies`).then((r) => r.json())
    ]);
    const posts = (f.feed || []).filter((it) => it.post?.author?.handle === cuenta).map(({ post }) => ({
      fecha: post.record?.createdAt,
      texto: recortar(String(post.record?.text || ''), 140),
      gusta: post.likeCount || 0,
      reposts: (post.repostCount || 0) + (post.quoteCount || 0),
      respuestas: post.replyCount || 0,
      enlace: `https://bsky.app/profile/${cuenta}/post/${String(post.uri).split('/').pop()}`
    }));
    return { cuenta, seguidores: p.followersCount || 0, siguiendo: p.followsCount || 0, publicados: p.postsCount || 0, posts };
  } catch (e) {
    return { cuenta, error: 'No se ha podido leer Bluesky ahora mismo.' };
  }
}

const recortar = (t, max) => (t.length <= max ? t : `${t.slice(0, max).replace(/\s+\S*$/, '')}…`);
