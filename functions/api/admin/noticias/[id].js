// GET  /api/admin/noticias/<id>                → la noticia y su historial
// PUT  /api/admin/noticias/<id> { datos, importancia?, actualizacion? } → guarda los cambios del texto
//      (actualizacion: true pone «Actualizada» en la web y la sube en portada)
// POST /api/admin/noticias/<id> { accion, … }  → publicar, programar, retirar, destacar…
import {
  json, fallo, leerJSON, limpiarNoticia, filaPanel, leerFila, versionStmt, puede, isoMadrid
} from '../../../../servidor/comun.js';

export async function onRequestGet({ env, params }) {
  const f = await leerFila(env, params.id);
  if (!f) return fallo('No existe esa noticia', 404);
  const { results } = await env.DB.prepare(
    'SELECT n, fecha, autor, accion FROM versiones WHERE noticia = ? ORDER BY n DESC LIMIT 50'
  ).bind(params.id).all();
  return json({ noticia: filaPanel(f), versiones: results });
}

// ¿Está (o va a estar) a la vista de los lectores?
const enLaWeb = (f) => f.estado === 'publicada' && (!f.retirar_en || f.retirar_en > Date.now());

export async function onRequestPut({ request, env, params, data }) {
  const u = data.usuario;
  const f = await leerFila(env, params.id);
  if (!f) return fallo('No existe esa noticia', 404);
  if (enLaWeb(f) && !puede.publicar(u)) return fallo('Solo un editor puede cambiar una noticia publicada.', 403);
  const cuerpo = await leerJSON(request);
  const { datos, errores } = limpiarNoticia(cuerpo?.datos, { borrador: !enLaWeb(f) });
  if (errores.length) return json({ error: errores[0], errores }, 400);
  // La hora de publicación y la de actualización las pone el servidor, no el formulario
  const antes = JSON.parse(f.datos);
  const ahora = Date.now();
  datos.fecha = antes.fecha || '';
  if (!datos.fecha) delete datos.fecha;
  delete datos.actualizada;
  if (antes.actualizada) datos.actualizada = antes.actualizada;
  if (antes.sustituye) datos.sustituye = antes.sustituye;
  const marcar = cuerpo.actualizacion === true && enLaWeb(f) && f.publicar_en <= ahora;
  if (marcar) datos.actualizada = isoMadrid(ahora);
  const imp = Number(cuerpo.importancia);
  const importancia = imp >= 1 && imp <= 5 ? Math.round(imp) : f.importancia;
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE noticias SET datos = ?, titular = ?, categoria = ?, importancia = ?, revisada = 1, autor = ?, actualizada = ? WHERE id = ?`
    ).bind(JSON.stringify(datos), datos.titular, datos.categoria, importancia, u.email, ahora, params.id),
    versionStmt(env, params.id, u.email, marcar ? 'actualizada (se ve en la web)' : 'editada')
  ]);
  return json({ ok: true, noticia: filaPanel(await leerFila(env, params.id)) });
}

export async function onRequestPost({ request, env, params, data }) {
  const u = data.usuario;
  const f = await leerFila(env, params.id);
  if (!f) return fallo('No existe esa noticia', 404);
  const cuerpo = (await leerJSON(request)) || {};
  const accion = cuerpo.accion;
  const ahora = Date.now();
  const datos = JSON.parse(f.datos);
  const sets = []; // [columna, valor]

  // Todo menos descartar un borrador propio necesita poder publicar
  const soloEditores = !(accion === 'descartar' && f.estado === 'borrador');
  if (soloEditores && !puede.publicar(u)) return fallo('Esta acción solo la puede hacer un editor.', 403);

  const ponerEnLaWeb = (cuando) => {
    const { errores } = limpiarNoticia(datos);
    if (errores.length) return errores;
    // Primera vez que sale: su fecha visible es la de publicación
    if (f.estado !== 'publicada' || !datos.fecha || f.publicar_en > ahora) datos.fecha = isoMadrid(cuando);
    sets.push(['estado', 'publicada'], ['publicar_en', cuando], ['retirar_en', null], ['revisada', 1], ['datos', JSON.stringify(datos)]);
    return null;
  };

  let nombre = accion;
  switch (accion) {
    case 'publicar': {
      const err = ponerEnLaWeb(ahora);
      if (err) return json({ error: `Antes de publicar: ${err[0]}`, errores: err }, 400);
      break;
    }
    case 'programar': {
      const cuando = Number(cuerpo.cuando);
      if (!(cuando > ahora + 30 * 1000)) return fallo('Elige una hora futura.');
      const err = ponerEnLaWeb(cuando);
      if (err) return json({ error: `Antes de programar: ${err[0]}`, errores: err }, 400);
      nombre = `programada para ${isoMadrid(cuando).slice(0, 16).replace('T', ' ')}`;
      break;
    }
    case 'borrador': sets.push(['estado', 'borrador'], ['revisada', 1]); nombre = 'pasada a borrador'; break;
    case 'retirar': sets.push(['estado', 'retirada'], ['revisada', 1]); nombre = 'retirada'; break;
    case 'descartar': sets.push(['estado', 'descartada'], ['revisada', 1]); nombre = 'descartada'; break;
    case 'fijar': sets.push(['fijada', 1]); nombre = 'fijada en portada'; break;
    case 'soltar': sets.push(['fijada', 0]); nombre = 'ya no está fijada'; break;
    case 'quitar-destacado': sets.push(['destacado', 0]); nombre = 'ya no es la destacada'; break;
    case 'destacar': {
      // Solo una destacada a la vez
      await env.DB.prepare('UPDATE noticias SET destacado = 0 WHERE destacado = 1 AND id != ?').bind(params.id).run();
      sets.push(['destacado', 1]); nombre = 'destacada';
      break;
    }
    case 'restaurar': {
      const v = await env.DB.prepare('SELECT * FROM versiones WHERE n = ? AND noticia = ?').bind(Number(cuerpo.version), params.id).first();
      if (!v) return fallo('No existe esa versión.');
      const fila = JSON.parse(v.fila);
      sets.push(['estado', fila.estado], ['publicar_en', fila.publicar_en], ['retirar_en', fila.retirar_en],
        ['fijada', fila.fijada], ['importancia', fila.importancia ?? f.importancia], ['categoria', fila.categoria], ['titular', fila.titular],
        ['datos', JSON.stringify(fila.datos)], ['revisada', 1]);
      nombre = `vuelta a la versión del ${isoMadrid(v.fecha).slice(0, 16).replace('T', ' ')}`;
      break;
    }
    default: return fallo('Acción desconocida.');
  }

  sets.push(['autor', u.email], ['actualizada', ahora]);
  await env.DB.batch([
    env.DB.prepare(`UPDATE noticias SET ${sets.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .bind(...sets.map(([, x]) => x), params.id),
    versionStmt(env, params.id, u.email, nombre)
  ]);
  return json({ ok: true, noticia: filaPanel(await leerFila(env, params.id)) });
}
