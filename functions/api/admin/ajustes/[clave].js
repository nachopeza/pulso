// GET /api/admin/ajustes/<clave> → el ajuste guardado (o null)
// PUT /api/admin/ajustes/<clave> { valor } → guardarlo (valor null = quitarlo). Solo editores.
// Ajustes que se pueden tocar desde aquí:
//   cita    → la cuenta atrás de la cabecera (elecciones, un partido, lo que toque)
//   banners → la publicidad de la web (de momento, solo en el ordenador)
//   comentarios → abrir/cerrar los comentarios y una pausa con fechas (jornada de reflexión)
import { json, fallo, leerJSON, puede, CATEGORIAS, aleatorio } from '../../../../servidor/comun.js';

const txt = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const dia = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(Date.parse(v)) ? v : '');

const LIMPIAR = {
  cita(v) {
    const c = {
      titulo: txt(v?.titulo, 30),
      fecha: dia(v?.fecha),
      hasta: dia(v?.hasta),
      seccion: CATEGORIAS.includes(v?.seccion) ? v.seccion : '',
      antes: txt(v?.antes, 40),
      hoy: txt(v?.hoy, 60),
      despues: txt(v?.despues, 40),
      detalle: txt(v?.detalle, 90)
    };
    const errores = [];
    if (!c.titulo) errores.push('Ponle un nombre corto (por ejemplo «29N»).');
    if (!c.fecha) errores.push('Falta la fecha del día señalado.');
    if (!c.antes) errores.push('Falta el texto de la cuenta atrás (por ejemplo «para el 29N»).');
    if (!c.hasta) c.hasta = c.fecha;
    if (c.fecha && c.hasta < c.fecha) errores.push('«Visible hasta» no puede ser antes de la fecha.');
    return { valor: c, errores };
  },
  comentarios(v) {
    const c = { activo: v?.activo !== false };
    const errores = [];
    if (v?.pausa && (v.pausa.desde || v.pausa.hasta)) {
      const desde = txt(v.pausa.desde, 40);
      const hasta = txt(v.pausa.hasta, 40);
      if (Number.isNaN(Date.parse(desde)) || Number.isNaN(Date.parse(hasta)) || Date.parse(hasta) <= Date.parse(desde)) errores.push('Las fechas de la pausa no son válidas.');
      c.pausa = { desde, hasta, motivo: txt(v.pausa.motivo, 160) };
    }
    return { valor: c, errores };
  },
  banners(v) {
    const errores = [];
    if (!Array.isArray(v)) return { valor: [], errores: ['Formato de banners no válido.'] };
    const lista = v.slice(0, 12).map((b, i) => {
      const x = {
        id: /^[\w-]{4,40}$/.test(b?.id || '') ? b.id : aleatorio(6),
        activo: b?.activo === true,
        hueco: ['portada', 'secciones'].includes(b?.hueco) ? b.hueco : 'portada',
        tipo: b?.tipo === 'imagen' ? 'imagen' : 'casa',
        anunciante: txt(b?.anunciante, 60),
        titulo: txt(b?.titulo, 90),
        texto: txt(b?.texto, 220),
        boton: txt(b?.boton, 30),
        enlace: txt(b?.enlace, 500),
        imagen: txt(b?.imagen, 500),
        alt: txt(b?.alt, 200)
      };
      const n = `Banner ${i + 1}`;
      if (x.enlace && !/^(https:\/\/\S+|mailto:[^\s@]+@[^\s@]+\.\S+)$/i.test(x.enlace)) errores.push(`${n}: el enlace tiene que empezar por https:// o mailto:`);
      if (x.tipo === 'casa' && !x.titulo) errores.push(`${n}: falta el titular.`);
      if (x.tipo === 'imagen') {
        if (!/^(\/fotos\/|https:\/\/)\S+$/i.test(x.imagen)) errores.push(`${n}: sube una imagen.`);
        if (!x.alt) errores.push(`${n}: describe la imagen (texto alternativo).`);
        if (!x.enlace) errores.push(`${n}: un banner de imagen necesita enlace.`);
      }
      return x;
    });
    return { valor: lista, errores };
  }
};

export async function onRequestGet({ env, params }) {
  if (!LIMPIAR[params.clave]) return fallo('Ese ajuste no existe.', 404);
  const f = await env.DB.prepare('SELECT valor FROM ajustes WHERE clave = ?').bind(params.clave).first();
  return json({ valor: f?.valor ? JSON.parse(f.valor) : null });
}

export async function onRequestPut({ request, env, params, data }) {
  const limpiar = LIMPIAR[params.clave];
  if (!limpiar) return fallo('Ese ajuste no existe.', 404);
  if (!puede.publicar(data.usuario)) return fallo('Solo un editor puede cambiar esto.', 403);
  const c = await leerJSON(request);
  if (!c || !('valor' in c)) return fallo('No hay nada que guardar.');
  if (c.valor === null) {
    await env.DB.prepare('DELETE FROM ajustes WHERE clave = ?').bind(params.clave).run();
    return json({ ok: true, valor: null });
  }
  const { valor, errores } = limpiar(c.valor);
  if (errores.length) return json({ error: errores[0], errores }, 400);
  await env.DB.prepare(
    `INSERT INTO ajustes (clave, valor, autor, actualizado) VALUES (?, ?, ?, ?)
     ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, autor = excluded.autor, actualizado = excluded.actualizado`
  ).bind(params.clave, JSON.stringify(valor), data.usuario.email, Date.now()).run();
  return json({ ok: true, valor });
}
