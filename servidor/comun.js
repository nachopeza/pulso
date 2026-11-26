// Piezas que comparten todas las funciones del servidor (carpeta functions/).
// Cloudflare las junta en un solo archivo al publicar.

export const CATEGORIAS = ['elecciones', 'espana', 'mundo', 'economia', 'tecnologia', 'clima', 'cultura', 'deportes'];
export const MOMENTOS = ['manana', 'tarde', 'noche'];
export const ROLES = ['admin', 'editor', 'redactor'];
const HORA = 60 * 60 * 1000;
export const PORTADA_HORAS = 48;

// Tres ediciones al día. La de la mañana es la completa; las otras actualizan.
// La clave de la edición ("2026-11-26 2-tarde") se ordena bien como texto.
export const EDICIONES = {
  manana: { n: 1, hora: '07:00', nombre: 'de la mañana' },
  tarde: { n: 2, hora: '14:00', nombre: 'de la tarde' },
  noche: { n: 3, hora: '21:00', nombre: 'de la noche' }
};
export const claveEdicion = (dia, tipo) => `${dia} ${EDICIONES[tipo].n}-${tipo}`;
export function leerEdicion(clave) {
  const [dia, resto = '1-manana'] = String(clave || '').split(' ');
  const tipo = resto.split('-')[1] || 'manana';
  return { dia, tipo, ...EDICIONES[tipo] };
}

// ---------- Orden de la portada ----------

// Cada noticia vale su importancia (1 a 5) y pierde la mitad cada 8 horas.
// Si se actualiza, cuenta desde la actualización: vuelve a subir.
// Las que se han ordenado a mano en el panel van primero, en ese orden.
const MEDIA_VIDA_H = 8;
export function puntuacion(f, ahora = Date.now()) {
  const d = typeof f.datos === 'string' ? JSON.parse(f.datos) : f.datos || {};
  const desde = Math.max(f.publicar_en || 0, Date.parse(d.actualizada || '') || 0);
  const horas = Math.max(0, (ahora - desde) / HORA);
  return (f.importancia || 3) * 0.5 ** (horas / MEDIA_VIDA_H);
}
export function ordenarPortada(filas, ahora = Date.now()) {
  return [...filas].sort((a, b) =>
    (a.orden ?? Infinity) - (b.orden ?? Infinity) || puntuacion(b, ahora) - puntuacion(a, ahora));
}

// ---------- Respuestas ----------

export function json(datos, estado = 200, cabeceras = {}) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cabeceras }
  });
}
export const fallo = (mensaje, estado = 400) => json({ error: mensaje }, estado);

export async function leerJSON(request) {
  try { return await request.json(); } catch (e) { return null; }
}

// ---------- Horas (siempre pensando en Madrid) ----------

// Diferencia entre la hora de Madrid y la UTC en ese momento (cambia en verano)
function desfaseMadrid(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
// "2026-11-26" del día de Madrid en ese momento
export function diaMadrid(ms) {
  return new Date(ms + desfaseMadrid(ms)).toISOString().slice(0, 10);
}
// Milisegundos de una hora de Madrid: horaMadrid('2026-11-26', '07:00')
export function horaMadrid(dia, hhmm) {
  const aprox = Date.parse(`${dia}T${hhmm}:00Z`);
  return aprox - desfaseMadrid(aprox - desfaseMadrid(aprox));
}
// "2026-11-26T07:00:00+01:00", el formato que usa la web
export function isoMadrid(ms) {
  const d = desfaseMadrid(ms);
  const h = Math.abs(d) / HORA;
  const zona = `${d < 0 ? '-' : '+'}${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  return new Date(ms + d).toISOString().slice(0, 19) + zona;
}

// ---------- Seguridad ----------

export function aleatorio(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function huella(texto) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
// Compara dos textos tardando lo mismo aunque fallen al principio (evita adivinar claves por tiempo)
export async function igualesSeguro(a, b) {
  const [x, y] = await Promise.all([huella(String(a)), huella(String(b))]);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return dif === 0;
}
export function leerCookie(request, nombre) {
  const c = request.headers.get('Cookie') || '';
  const m = c.match(new RegExp(`(?:^|;\\s*)${nombre}=([^;]+)`));
  return m ? m[1] : null;
}
export const COOKIE = '__Host-pulso';

export const puede = {
  publicar: (u) => u.rol === 'admin' || u.rol === 'editor',
  usuarios: (u) => u.rol === 'admin'
};

// ---------- Validar una noticia ----------

const esURL = (u) => typeof u === 'string' && /^https?:\/\/\S+$/i.test(u) && u.length < 2000;
const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Limpia lo que llega (del panel o del agente) y dice qué falta.
// Devuelve { datos, errores }. Con "borrador" se permite que falten cosas.
export function limpiarNoticia(entrada, { borrador = false } = {}) {
  const e = entrada || {};
  const errores = [];
  const d = {
    categoria: texto(e.categoria, 20),
    momento: texto(e.momento, 10) || 'manana',
    fecha: texto(e.fecha, 40),
    ejemplo: false,
    titular: texto(e.titular, 160),
    entradilla: texto(e.entradilla, 600),
    puntos: (Array.isArray(e.puntos) ? e.puntos : []).map((p) => texto(p, 400)).filter(Boolean).slice(0, 4),
    porque: texto(e.porque, 400),
    fuentes: (Array.isArray(e.fuentes) ? e.fuentes : [])
      .map((f) => ({ medio: texto(f?.medio, 80), url: texto(f?.url, 2000) }))
      .filter((f) => f.medio || f.url).slice(0, 8),
    titulares: (Array.isArray(e.titulares) ? e.titulares : [])
      .map((t) => ({ medio: texto(t?.medio, 80), titular: texto(t?.titular, 300), url: texto(t?.url, 2000) }))
      .filter((t) => t.medio || t.titular || t.url).slice(0, 6),
    imagen: null
  };
  const corr = texto(e.correccion, 600);
  if (corr) d.correccion = corr;
  // "Actualizada a las…": la pone el servidor, aquí solo se conserva
  const act = texto(e.actualizada, 40);
  if (act && !Number.isNaN(Date.parse(act))) d.actualizada = act;
  if (e.imagen && typeof e.imagen === 'object' && e.imagen.src) {
    d.imagen = {
      src: texto(e.imagen.src, 2000),
      alt: texto(e.imagen.alt, 300),
      credito: texto(e.imagen.credito, 200),
      licencia: texto(e.imagen.licencia, 80),
      enlace: texto(e.imagen.enlace, 2000)
    };
    const pos = texto(e.imagen.posicion, 20);
    if (/^[\d.% a-z]+$/i.test(pos)) d.imagen.posicion = pos;
    if (!d.imagen.enlace) delete d.imagen.enlace;
  }

  if (!CATEGORIAS.includes(d.categoria)) errores.push('Elige una sección.');
  if (!MOMENTOS.includes(d.momento)) errores.push('El momento del día no es válido.');
  if (d.fecha && Number.isNaN(Date.parse(d.fecha))) errores.push('La fecha no es válida.');
  if (!d.titular) errores.push('Falta el titular.');
  if (d.titular.length > 110) errores.push(`El titular es demasiado largo (${d.titular.length} caracteres, máximo 110).`);
  for (const f of d.fuentes) if (!f.medio || !esURL(f.url)) errores.push('Cada fuente necesita el nombre del medio y un enlace que empiece por http.');
  for (const t of d.titulares) if (!t.medio || !t.titular || !esURL(t.url)) errores.push('Cada «Cómo lo titulan» necesita medio, titular literal y enlace.');
  if (d.imagen) {
    if (!d.imagen.alt || !d.imagen.credito || !d.imagen.licencia) errores.push('La foto necesita descripción, autoría y licencia.');
    if (!/^(https:\/\/|\/?fotos\/|img\/)[\w\-./%:~()]+$/i.test(d.imagen.src)) errores.push('La dirección de la foto no es válida.');
    if (d.imagen.enlace && !esURL(d.imagen.enlace)) errores.push('El enlace de la foto tiene que empezar por http.');
  }
  if (!borrador) {
    if (!d.entradilla) errores.push('Falta la entradilla.');
    if (!d.puntos.length) errores.push('Pon al menos un punto clave.');
    if (!d.fuentes.length) errores.push('Pon al menos una fuente.');
  }
  return { datos: d, errores: [...new Set(errores)] };
}

// "Ley de IA europea" → "ley-de-ia-europea-k3x9"
export function crearId(titular) {
  const base = (titular || 'noticia').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 7).join('-') || 'noticia';
  return `${base}-${aleatorio(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`.slice(0, 70);
}

// ---------- Leer y guardar noticias ----------

export const VISIBLE = `estado = 'publicada' AND publicar_en <= ?1 AND (retirar_en IS NULL OR retirar_en > ?1)`;

// Fila de la base de datos → objeto para el panel
export function filaPanel(f, ahora = Date.now()) {
  const visible = f.estado === 'publicada' && f.publicar_en <= ahora && (!f.retirar_en || f.retirar_en > ahora);
  let situacion = f.estado;
  if (visible) situacion = 'visible';
  else if (f.estado === 'publicada') situacion = f.publicar_en > ahora ? 'programada' : 'retirada';
  return {
    id: f.id, estado: f.estado, situacion, visible,
    publicar_en: f.publicar_en, retirar_en: f.retirar_en,
    revisada: !!f.revisada, propuesta: !!f.propuesta, destacado: !!f.destacado, fijada: !!f.fijada,
    orden: f.orden, importancia: f.importancia ?? 3, categoria: f.categoria, titular: f.titular, edicion: f.edicion,
    autor: f.autor, creada: f.creada, actualizada: f.actualizada,
    datos: JSON.parse(f.datos)
  };
}

export async function leerFila(env, id) {
  return env.DB.prepare('SELECT * FROM noticias WHERE id = ?').bind(id).first();
}

// Sentencia que apunta en el historial cómo ha quedado una noticia
export function versionStmt(env, id, autor, accion) {
  return env.DB.prepare(
    `INSERT INTO versiones (noticia, fecha, autor, accion, fila)
     SELECT id, ?2, ?3, ?4, json_object('estado', estado, 'publicar_en', publicar_en, 'retirar_en', retirar_en,
       'destacado', destacado, 'fijada', fijada, 'importancia', importancia, 'categoria', categoria, 'titular', titular, 'datos', json(datos))
     FROM noticias WHERE id = ?1`
  ).bind(id, Date.now(), autor, accion);
}

// ---------- Redes sociales ----------

export const REDES = { bluesky: 'Bluesky', x: 'X', tiktok: 'TikTok', instagram: 'Instagram' };
export const LIMITE_RED = { bluesky: 300, x: 280, tiktok: 2200, instagram: 2200 };
export const ESTADOS_PIEZA = ['revisar', 'aprobada', 'cambiar', 'descartada', 'publicada'];
// Caracteres como los cuenta cada red: emojis y letras con tilde cuentan uno;
// en X cada enlace cuenta 23, lo largo que sea.
export function largoRed(t, red) {
  let s = String(t || '');
  if (red === 'x') s = s.replace(/https?:\/\/\S+/g, 'x'.repeat(23));
  try { return [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(s)].length; }
  catch (e) { return [...s].length; }
}
// Limpia una pieza de la escaleta y dice qué falla
export function limpiarPieza(e) {
  const p = {
    hora: texto(e?.hora, 5), red: texto(e?.red, 12).toLowerCase(), serie: texto(e?.serie, 60),
    noticia: texto(e?.noticia, 70) || null, texto: texto(e?.texto, 3000),
    visual: texto(e?.visual, 600), alt: texto(e?.alt, 1000)
  };
  const errores = [];
  if (!REDES[p.red]) errores.push(`la red tiene que ser ${Object.keys(REDES).join(', ')}`);
  if (p.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.hora)) errores.push('la hora va como "07:45"');
  if (!p.texto) errores.push('falta el texto');
  else if (REDES[p.red] && largoRed(p.texto, p.red) > LIMITE_RED[p.red]) {
    errores.push(`el texto tiene ${largoRed(p.texto, p.red)} caracteres y en ${REDES[p.red]} caben ${LIMITE_RED[p.red]}`);
  }
  if (p.noticia && !/^[a-z0-9-]{3,70}$/.test(p.noticia)) errores.push('el id de la noticia no es válido');
  return { pieza: p, errores };
}

// ---------- Fotos ----------

// Descarga una foto de Wikimedia Commons y la guarda en nuestro almacén.
// Devuelve la ruta "/fotos/…" o null si no se puede.
export async function importarFoto(env, url, nombre) {
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  if (u.protocol !== 'https:' || !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(u.hostname)) return null;
  const r = await fetch(u.toString(), { headers: { 'User-Agent': 'pulso-noticias/1.0 (https://pulso.com.es)' } });
  const tipo = r.headers.get('Content-Type') || '';
  if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(tipo)) return null;
  const cuerpo = await r.arrayBuffer();
  if (cuerpo.byteLength > 8 * 1024 * 1024) return null;
  return guardarFoto(env, cuerpo, tipo, nombre);
}
export async function guardarFoto(env, cuerpo, tipo, nombre) {
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[tipo];
  if (!ext) return null;
  const base = String(nombre || 'foto').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 50) || 'foto';
  const clave = `${base}-${aleatorio(4).toLowerCase().replace(/[^a-z0-9]/g, '')}.${ext}`;
  await env.FOTOS.put(clave, cuerpo, { httpMetadata: { contentType: tipo } });
  return `/fotos/${clave}`;
}

// ---------- Email (Brevo) ----------

// Sin la clave BREVO_KEY no se envía nada; en local (DEV=1) el mensaje sale por la consola.
export async function enviarEmail(env, { para, asunto, texto: cuerpo }) {
  if (env.DEV === '1') {
    console.log(`\n=== EMAIL a ${para.join(', ')} ===\n${asunto}\n\n${cuerpo}\n`);
    return true;
  }
  // La clave se pega desde el portapapeles: quitamos espacios o saltos de línea que se cuelen
  const clave = (env.BREVO_KEY || '').trim();
  if (!clave) return false;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': clave, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'pulso', email: env.REMITENTE },
        to: para.map((email) => ({ email })),
        subject: asunto,
        textContent: cuerpo
      })
    });
    if (!r.ok) console.log('Brevo no ha enviado el email:', r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.log('No se ha podido contactar con Brevo:', e.message);
    return false;
  }
}
