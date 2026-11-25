// Gestión de quién entra al panel (solo administradores)
// GET  → lista   POST { email, nombre, rol } → alta   PUT { email, nombre?, rol?, activo? } → cambios
import { json, fallo, leerJSON, puede, ROLES } from '../../../servidor/comun.js';

const noAdmin = (u) => (puede.usuarios(u) ? null : fallo('Solo un administrador puede gestionar usuarios.', 403));

export async function onRequestGet({ env, data }) {
  const no = noAdmin(data.usuario); if (no) return no;
  const { results } = await env.DB.prepare('SELECT email, nombre, rol, activo, creado FROM usuarios ORDER BY activo DESC, rol, nombre').all();
  return json({ usuarios: results });
}

export async function onRequestPost({ request, env, data }) {
  const no = noAdmin(data.usuario); if (no) return no;
  const c = await leerJSON(request);
  const email = String(c?.email || '').trim().toLowerCase();
  const nombre = String(c?.nombre || '').trim().slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fallo('Escribe un email válido.');
  if (!nombre) return fallo('Escribe el nombre.');
  if (!ROLES.includes(c?.rol)) return fallo('Elige un perfil.');
  const ya = await env.DB.prepare('SELECT email FROM usuarios WHERE email = ?').bind(email).first();
  if (ya) return fallo('Ese email ya tiene acceso.');
  await env.DB.prepare('INSERT INTO usuarios (email, nombre, rol, activo, creado) VALUES (?, ?, ?, 1, ?)')
    .bind(email, nombre, c.rol, Date.now()).run();
  return json({ ok: true }, 201);
}

export async function onRequestPut({ request, env, data }) {
  const no = noAdmin(data.usuario); if (no) return no;
  const c = await leerJSON(request);
  const u = await env.DB.prepare('SELECT * FROM usuarios WHERE email = ?').bind(String(c?.email || '')).first();
  if (!u) return fallo('No existe ese usuario.', 404);
  const rol = c.rol ?? u.rol;
  const activo = c.activo === undefined ? u.activo : (c.activo ? 1 : 0);
  const nombre = String(c.nombre ?? u.nombre).trim().slice(0, 80) || u.nombre;
  if (!ROLES.includes(rol)) return fallo('Perfil no válido.');
  // Nunca se puede quedar el panel sin ningún administrador
  if (u.rol === 'admin' && (rol !== 'admin' || !activo)) {
    const { n } = await env.DB.prepare("SELECT count(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1").first();
    if (n <= 1) return fallo('Tiene que quedar al menos un administrador.');
  }
  const stmts = [env.DB.prepare('UPDATE usuarios SET nombre = ?, rol = ?, activo = ? WHERE email = ?').bind(nombre, rol, activo, u.email)];
  // Si se le quita el acceso, se cierran sus sesiones abiertas
  if (!activo) stmts.push(env.DB.prepare('DELETE FROM sesiones WHERE email = ?').bind(u.email));
  await env.DB.batch(stmts);
  return json({ ok: true, yo: u.email === data.usuario.email });
}
