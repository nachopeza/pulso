// GET /api/admin/yo → quién soy (sirve también para saber si la sesión sigue abierta)
import { json } from '../../../servidor/comun.js';

export function onRequestGet({ env, data }) {
  return json({ usuario: data.usuario, email: !!env.BREVO_KEY || env.DEV === '1' });
}
