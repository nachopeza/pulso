// =====================================================================
//  pulso — panel de redacción (admin.js)
//  Una sola página que cambia según la dirección:
//    #/hoy           la edición que ha preparado el agente
//    #/noticias      buscador de todas las noticias
//    #/editar/<id>   editar una noticia     #/nueva  escribir una desde cero
//    #/portada       orden de la portada y anuncio
//    #/momentos      "mañana, tarde y noche"
//    #/redes         escaleta de redes sociales del community manager
//    #/usuarios      quién entra al panel (solo administración)
//  Todo se guarda a través de /api/… (carpeta functions/ del proyecto).
// =====================================================================
{
  const CATS = {
    elecciones: '29N', espana: 'España', mundo: 'Mundo', economia: 'Economía',
    tecnologia: 'Tecnología', clima: 'Clima', cultura: 'Cultura', deportes: 'Deportes'
  };
  const MOMENTOS = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };
  const ROLES = { admin: 'Administración', editor: 'Edición', redactor: 'Redacción' };
  const ROLES_AYUDA = {
    admin: 'Todo, también gestionar usuarios',
    editor: 'Escribe, edita y publica',
    redactor: 'Escribe borradores; otra persona los publica'
  };
  const IMPORTANCIA = { 5: '5 · Lo más importante del día', 4: '4 · Muy importante', 3: '3 · Normal', 2: '2 · Menor', 1: '1 · Relleno' };
  const SITUACION = {
    visible: 'En la web', programada: 'Programada', borrador: 'Borrador',
    retirada: 'Retirada', descartada: 'Descartada', nueva: 'Nueva'
  };

  // ---------- 1. Herramientas ----------

  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const vista = $('#vista');
  let yo = null;                // quién ha entrado
  const puedePublicar = () => yo && yo.rol !== 'redactor';

  // Llama al servidor. Si la sesión ha caducado, vuelve a la pantalla de entrar.
  async function api(ruta, { metodo = 'GET', cuerpo, tipo } = {}) {
    const op = { method: metodo, headers: {}, credentials: 'same-origin' };
    if (cuerpo !== undefined) {
      op.headers['Content-Type'] = tipo || 'application/json';
      op.body = tipo ? cuerpo : JSON.stringify(cuerpo);
    }
    const r = await fetch(`/api/${ruta}`, op);
    let d = null;
    try { d = await r.json(); } catch (e) { /* respuesta sin JSON */ }
    if (r.status === 401 && ruta.startsWith('admin/')) {
      yo = null;
      pintarEntrar(d?.error);
      throw new Error(d?.error || 'Entra de nuevo');
    }
    if (!r.ok) {
      const e = new Error(d?.error || `Error ${r.status}`);
      e.errores = d?.errores;
      throw e;
    }
    return d;
  }

  function avisar(texto, mal = false) {
    const a = document.createElement('div');
    a.className = `aviso${mal ? ' mal' : ''}`;
    a.textContent = texto;
    $('#avisos').append(a);
    setTimeout(() => a.remove(), mal ? 7000 : 3500);
  }

  // Horas, siempre en la de Madrid
  const fmt = (op) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', ...op });
  const hora = (ms) => fmt({ hour: '2-digit', minute: '2-digit' }).format(ms);
  const fecha = (ms) => fmt({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);
  const diaLargo = (ymd) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${ymd}T12:00:00Z`));
  const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(Date.now());
  function dentroDe(ms) {
    const min = Math.round((ms - Date.now()) / 60000);
    if (min < 1) return 'en un momento';
    if (min < 60) return `dentro de ${min} min`;
    const h = Math.floor(min / 60);
    return `dentro de ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  }
  // "2026-11-26T07:30" para los campos de fecha y hora (hora de este dispositivo)
  const aLocal = (ms) => {
    const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  };

  const rutaFoto = (src) => (src && /^img\//.test(src) ? `/${src}` : src || '');
  const mini = (n) => (n.datos?.imagen?.src
    ? `<img class="mini" src="${esc(rutaFoto(n.datos.imagen.src))}" alt="" loading="lazy">`
    : `<span class="mini" data-cat="${esc(n.categoria)}"></span>`);
  function chip(n) {
    let t = SITUACION[n.situacion] || n.situacion;
    if (n.situacion === 'programada') t = `Sale ${fecha(n.publicar_en)}`;
    return `<span class="situ situ-${esc(n.situacion)}">${esc(t)}</span>`;
  }
  const seccion = (c) => `<span class="sec" data-cat="${esc(c)}">${esc(CATS[c] || 'Sin sección')}</span>`;
  const urlNoticia = (id) => `${location.origin}/#${id}`;

  // ---------- 2. Entrar y salir ----------

  function pintarEntrar(error) {
    $('#barra').hidden = true;
    vista.innerHTML = `<div class="entrar">
      <span class="logo">pulso<span class="latido" aria-hidden="true"></span></span>
      <h1>Entra en la redacción</h1>
      <p>Te mandamos un enlace a tu email. No hace falta contraseña.</p>
      ${error ? `<p class="errores">${esc(error)}</p>` : ''}
      <form id="f-entrar">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" autocomplete="email" required placeholder="hola@pulso.com.es">
        <button class="btn btn-principal" type="submit">Enviarme el enlace</button>
      </form>
    </div>`;
    $('#f-entrar').addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = e.submitter || $('button', e.target);
      b.disabled = true;
      try {
        const d = await api('acceso/pedir', { metodo: 'POST', cuerpo: { email: e.target.email.value } });
        e.target.outerHTML = `<p class="mensaje-ok">${esc(d.mensaje)}</p>`;
      } catch (err) {
        avisar(err.message, true);
        b.disabled = false;
      }
    });
  }

  $('#salir').addEventListener('click', async () => {
    await api('acceso/salir', { metodo: 'POST', cuerpo: {} }).catch(() => {});
    yo = null;
    pintarEntrar();
  });

  // ---------- 3. Navegación ----------

  let sucio = false;      // hay cambios sin guardar en el editor
  let hashAnterior = location.hash;
  addEventListener('beforeunload', (e) => { if (sucio) e.preventDefault(); });

  async function navegar() {
    if (!yo) return;
    if (sucio && location.hash !== hashAnterior) {
      if (!confirm('Hay cambios sin guardar. ¿Salir sin guardarlos?')) {
        history.replaceState(null, '', hashAnterior);
        return;
      }
      sucio = false;
    }
    hashAnterior = location.hash;
    const [, nombre = 'hoy', arg] = location.hash.split('/');
    $$('#nav a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.ruta === nombre || (nombre === 'editar' || nombre === 'nueva') && a.dataset.ruta === 'noticias'));
    $$('#nav a[aria-current]').forEach((a) => a.setAttribute('aria-current', 'page'));
    const vistas = { hoy: vistaHoy, noticias: vistaNoticias, editar: () => vistaEditor(decodeURIComponent(arg || '')),
      nueva: () => vistaEditor(null), portada: vistaPortada, momentos: vistaMomentos, redes: () => vistaRedes(arg), usuarios: vistaUsuarios };
    const f = vistas[nombre] || vistaHoy;
    try {
      await f();
    } catch (e) {
      if (yo) vista.innerHTML = `<div class="vacio"><b>No se ha podido cargar.</b>${esc(e.message)}</div>`;
    }
    vista.focus({ preventScroll: true });
  }
  addEventListener('hashchange', navegar);

  // ---------- 4. Hoy: la edición del agente ----------

  async function vistaHoy() {
    const e = await api('admin/edicion');
    const hoy = hoyMadrid();
    const vivas = e.noticias.filter((n) => n.estado !== 'descartada');
    const marcadas = vivas.filter((n) => n.situacion === 'visible' || n.situacion === 'programada');
    let estadoEd = '';
    if (!e.dia) estadoEd = '';
    else if (e.autoEn) estadoEd = `Se publica sola a las <b>${hora(e.autoEn)}</b> (${dentroDe(e.autoEn)}) si nadie la publica antes.`;
    else if (e.yaPublicada) estadoEd = 'Ya está publicada. Puedes seguir quitando, añadiendo o corrigiendo noticias.';
    else estadoEd = 'No hay ninguna noticia marcada para publicar.';

    vista.innerHTML = `
      <div class="cabeza">
        <div><h1>Hoy</h1><p>${esc(diaLargo(hoy))}</p></div>
        <div class="acciones"><a class="btn" href="#/nueva">Escribir una noticia</a></div>
      </div>
      ${!e.dia ? `<div class="vacio"><b>Todavía no ha llegado ninguna edición del agente.</b>Llegan tres al día (sobre las 6:30, 13:30 y 20:30) y con cada una te llega un email.</div>` : `
      <section class="bloque">
        <div class="cabeza" style="margin-bottom:8px">
          <div>
            <h2>Edición ${esc(e.nombre || '')} del ${esc(diaLargo(e.dia))}</h2>
            ${e.dia !== hoy ? '<p class="nota">Es la última que ha llegado. La de hoy suele llegar sobre las 6:30.</p>' : ''}
            ${e.tipo && e.tipo !== 'manana' ? '<p class="nota">Es una actualización: solo trae lo nuevo. Lo demás sigue en la web.</p>' : ''}
          </div>
          ${e.autoEn && puedePublicar() ? `<button class="btn btn-principal" id="publicar-ed" type="button">Publicar ahora (${marcadas.length})</button>` : ''}
        </div>
        <p>${estadoEd}</p>
        <div class="resumen">
          <div><b>${marcadas.length}</b>para publicar</div>
          <div><b>${vivas.length}</b>propuestas en total</div>
          <div><b>${e.sinRevisar}</b>sin revisar</div>
          <div><b>${e.enPortada}</b>en la web ahora</div>
        </div>
        <p class="nota" style="margin-bottom:12px">El interruptor decide si una noticia sale con la edición. Pulsa el titular para revisarla o corregirla.</p>
        <ul class="lista">${e.noticias.map(filaEdicion).join('')}</ul>
      </section>`}
      <section class="bloque">
        <h2>Visitas</h2>
        <p class="nota">Las estadísticas están en Cloudflare Web Analytics: sin cookies y gratis.</p>
        <p style="margin-top:10px"><a class="btn" href="https://dash.cloudflare.com/?to=/:account/web-analytics" target="_blank" rel="noopener">Abrir estadísticas</a></p>
      </section>`;

    $$('.lista input[data-id]').forEach((i) => i.addEventListener('change', async () => {
      const n = e.noticias.find((x) => x.id === i.dataset.id);
      i.disabled = true;
      try {
        let accion;
        if (i.checked) accion = e.autoEn ? { accion: 'programar', cuando: e.autoEn } : { accion: 'publicar' };
        else accion = n.situacion === 'visible' ? { accion: 'retirar' } : { accion: 'borrador' };
        await api(`admin/noticias/${encodeURIComponent(n.id)}`, { metodo: 'POST', cuerpo: accion });
        await vistaHoy();
      } catch (err) {
        avisar(err.message, true);
        i.checked = !i.checked;
        i.disabled = false;
      }
    }));
    $('#publicar-ed')?.addEventListener('click', async (ev) => {
      const fuera = vivas.length - marcadas.length;
      if (!confirm(`Se publican ahora ${marcadas.length} noticias${fuera ? ` y se descartan ${fuera}` : ''}. ¿Seguimos?`)) return;
      ev.target.disabled = true;
      try {
        await api('admin/edicion', { metodo: 'POST', cuerpo: { accion: 'publicar', ids: marcadas.map((n) => n.id) } });
        avisar('Edición publicada');
        await vistaHoy();
      } catch (err) { avisar(err.message, true); ev.target.disabled = false; }
    });
  }

  function filaEdicion(n) {
    const desc = n.estado === 'descartada';
    const marcada = n.situacion === 'visible' || n.situacion === 'programada';
    return `<li class="fila${desc ? ' fila-desc' : ''}">
      <span class="interruptor"><input type="checkbox" role="switch" data-id="${esc(n.id)}" ${marcada ? 'checked' : ''}
        ${!puedePublicar() || desc ? 'disabled' : ''} aria-label="Publicar «${esc(n.titular)}»"></span>
      ${mini(n)}
      <div class="fila-txt">
        <a href="#/editar/${encodeURIComponent(n.id)}">${esc(n.titular)}</a>
        <div class="meta">${seccion(n.categoria)}${n.destacado ? '<span class="estrella">★ Destacada</span>' : ''}
          ${n.datos?.sustituye ? '<span>Actualización</span>' : ''}<span>Importancia ${n.importancia}</span>${n.datos?.montaje ? `<span title="${esc(n.datos.montaje)}">🎨 Pide montaje</span>` : ''}
          ${n.propuesta ? '<span>Propuesta del agente</span>' : '<span>Extra</span>'}${n.revisada ? '' : '<span>Sin revisar</span>'}</div>
      </div>
      ${chip(n)}
    </li>`;
  }

  // ---------- 5. Todas las noticias ----------

  const filtro = { q: '', situacion: '', cat: '', pagina: 0 };

  async function vistaNoticias() {
    vista.innerHTML = `
      <div class="cabeza">
        <div><h1>Noticias</h1><p>Todas las que se han escrito, publicadas o no.</p></div>
        <a class="btn btn-principal" href="#/nueva">Escribir una noticia</a>
      </div>
      <div class="filtros">
        <input type="search" id="q" placeholder="Buscar por titular o texto" value="${esc(filtro.q)}" aria-label="Buscar">
        <select id="situacion" aria-label="Situación">
          ${[['', 'Todas'], ['visible', 'En la web'], ['programada', 'Programadas'], ['pendiente', 'Sin revisar'], ['borrador', 'Borradores'], ['retirada', 'Retiradas'], ['descartada', 'Descartadas']]
            .map(([v, t]) => `<option value="${v}" ${filtro.situacion === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <select id="cat" aria-label="Sección">
          <option value="">Todas las secciones</option>
          ${Object.entries(CATS).map(([k, t]) => `<option value="${k}" ${filtro.cat === k ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <ul class="lista" id="resultados"></ul>
      <p style="margin-top:16px"><button class="btn" id="mas" type="button" hidden>Ver más</button></p>`;
    let espera;
    $('#q').addEventListener('input', (e) => {
      clearTimeout(espera);
      espera = setTimeout(() => { filtro.q = e.target.value; buscar(true); }, 300);
    });
    $('#situacion').addEventListener('change', (e) => { filtro.situacion = e.target.value; buscar(true); });
    $('#cat').addEventListener('change', (e) => { filtro.cat = e.target.value; buscar(true); });
    $('#mas').addEventListener('click', () => { filtro.pagina++; buscar(false); });
    filtro.pagina = 0;
    await buscar(true);
  }

  async function buscar(deCero) {
    if (deCero) filtro.pagina = 0;
    const p = new URLSearchParams({ q: filtro.q, situacion: filtro.situacion, cat: filtro.cat, pagina: filtro.pagina });
    const d = await api(`admin/noticias?${p}`);
    const ul = $('#resultados');
    if (!ul) return;
    const html = d.noticias.map((n) => `<li class="fila fila-sin-interruptor">
      ${mini(n)}
      <div class="fila-txt">
        <a href="#/editar/${encodeURIComponent(n.id)}">${esc(n.titular)}</a>
        <div class="meta">${seccion(n.categoria)}<span>${n.publicar_en ? fecha(n.publicar_en) : `Creada ${fecha(n.creada)}`}</span>
          ${n.destacado ? '<span class="estrella">★</span>' : ''}${n.fijada ? '<span>Fijada</span>' : ''}<span>${esc(n.autor || '')}</span></div>
      </div>
      ${chip(n)}
    </li>`).join('');
    if (deCero) ul.innerHTML = html || '<li class="vacio"><b>No hay noticias con esos filtros.</b>Prueba con otra búsqueda.</li>';
    else ul.insertAdjacentHTML('beforeend', html);
    $('#mas').hidden = !d.mas;
  }

  // ---------- 6. Editor de una noticia ----------

  const NUEVA = () => ({
    id: null, estado: 'borrador', situacion: 'nueva', categoria: '',
    datos: { categoria: '', momento: 'manana', titular: '', entradilla: '', puntos: ['', '', ''], porque: '', fuentes: [{ medio: '', url: '' }], titulares: [], imagen: null }
  });

  async function vistaEditor(id) {
    let n;
    let versiones = [];
    if (id) ({ noticia: n, versiones } = await api(`admin/noticias/${encodeURIComponent(id)}`));
    else n = NUEVA();
    const d = n.datos;
    let foto = d.imagen ? { ...d.imagen } : null;
    const editable = puedePublicar() || n.estado === 'borrador' || !id;

    vista.innerHTML = `
      <div class="cabeza">
        <div><p><a href="#/noticias">← Todas las noticias</a></p><h1 style="margin-top:6px">${id ? 'Editar noticia' : 'Nueva noticia'}</h1></div>
      </div>
      <div class="editor">
        <form id="form" novalidate>
          <div id="errores"></div>
          ${editable ? '' : '<p class="errores">Esta noticia está publicada: solo un editor puede cambiarla.</p>'}
          <fieldset ${editable ? '' : 'disabled'} style="border:0;padding:0;margin:0;min-width:0">
          <div class="dos">
            <div class="campo"><label for="categoria">Sección</label>
              <select id="categoria" name="categoria" required>
                <option value="">Elige…</option>
                ${Object.entries(CATS).map(([k, t]) => `<option value="${k}" ${d.categoria === k ? 'selected' : ''}>${t}</option>`).join('')}
              </select></div>
            <div class="campo"><label for="momento">Momento del día <span class="ayuda">cuándo interesa más</span></label>
              <select id="momento" name="momento">
                ${Object.entries(MOMENTOS).map(([k, t]) => `<option value="${k}" ${d.momento === k ? 'selected' : ''}>${t}</option>`).join('')}
              </select></div>
          </div>
          <div class="campo"><label for="importancia">Importancia <span class="ayuda">decide el orden en portada: cuanto más alta, más arriba y más tiempo aguanta</span></label>
            <select id="importancia" name="importancia">
              ${[5, 4, 3, 2, 1].map((k) => `<option value="${k}" ${(n.importancia ?? 3) === k ? 'selected' : ''}>${IMPORTANCIA[k]}</option>`).join('')}
            </select></div>
          <div class="campo"><label for="titular">Titular <span class="contador" id="cont-titular"></span></label>
            <textarea id="titular" name="titular" class="titular-input" rows="2" maxlength="160" required>${esc(d.titular)}</textarea>
            <p class="ayuda">Propio, claro, unos 90 caracteres como mucho. Nunca copiado de otro medio.</p></div>
          <div class="campo"><label for="entradilla">Entradilla <span class="ayuda">una o dos frases con lo esencial</span></label>
            <textarea id="entradilla" name="entradilla" rows="2">${esc(d.entradilla)}</textarea></div>
          <div class="campo"><span class="etiqueta">Puntos clave <span class="ayuda">2 o 3 frases cortas con los datos</span></span>
            <div class="repetible" id="puntos"></div>
            <button type="button" class="btn btn-fino" id="mas-punto">Añadir punto</button></div>
          <div class="campo"><label for="porque">Por qué te importa <span class="ayuda">qué cambia para alguien de 16 a 30 años</span></label>
            <textarea id="porque" name="porque" rows="2">${esc(d.porque)}</textarea></div>
          <div class="campo"><span class="etiqueta">Fuentes <span class="ayuda">siempre al menos una, con enlace a la información original</span></span>
            <div class="repetible" id="fuentes"></div>
            <button type="button" class="btn btn-fino" id="mas-fuente">Añadir fuente</button></div>
          <div class="campo"><span class="etiqueta">Cómo lo titulan <span class="ayuda">titulares literales de otros medios, mejor de líneas distintas</span></span>
            <div class="repetible" id="titulares"></div>
            <button type="button" class="btn btn-fino" id="mas-titular">Añadir titular</button></div>
          <div class="campo"><span class="etiqueta">Foto <span class="ayuda">propia o con licencia libre, siempre con autoría</span></span>
            <div id="foto"></div></div>
          <div class="campo"><label for="correccion">Corrección <span class="ayuda">solo si se corrige un error; se ve en la noticia</span></label>
            <textarea id="correccion" name="correccion" rows="2">${esc(d.correccion || '')}</textarea></div>
          ${n.situacion === 'visible' ? `<label class="casilla"><input type="checkbox" id="actualizacion">
            <span><b>Es una actualización</b> <span class="ayuda">al guardar, la web pone «actualizada» con la hora y la noticia vuelve a subir en portada${d.actualizada ? `. Última: ${esc(fecha(Date.parse(d.actualizada)))}` : ''}</span></span></label>` : ''}
          </fieldset>
        </form>
        <aside class="lateral" id="lateral"></aside>
      </div>
      <div class="pie-editor" id="pie-editor"></div>`;

    const form = $('#form');

    // --- Listas que se pueden alargar: puntos, fuentes y titulares de otros medios
    const listas = {
      puntos: { datos: d.puntos?.length ? [...d.puntos] : ['', ''], max: 4,
        html: (v, i) => `<div class="repe-campos"><input type="text" aria-label="Punto ${i + 1}" data-campo="texto" value="${esc(v)}" maxlength="400"></div>` },
      fuentes: { datos: d.fuentes?.length ? d.fuentes.map((x) => ({ ...x })) : [{ medio: '', url: '' }], max: 8,
        html: (v, i) => `<div class="repe-campos fuente"><input type="text" aria-label="Medio de la fuente ${i + 1}" placeholder="Medio" data-campo="medio" value="${esc(v.medio)}">
          <input type="url" aria-label="Enlace de la fuente ${i + 1}" placeholder="https://…" data-campo="url" value="${esc(v.url)}"></div>` },
      titulares: { datos: (d.titulares || []).map((x) => ({ ...x })), max: 6,
        html: (v, i) => `<div class="repe-campos"><div class="dos"><input type="text" aria-label="Medio ${i + 1}" placeholder="Medio" data-campo="medio" value="${esc(v.medio)}">
          <input type="url" aria-label="Enlace ${i + 1}" placeholder="https://…" data-campo="url" value="${esc(v.url)}"></div>
          <input type="text" aria-label="Titular literal ${i + 1}" placeholder="Titular literal, tal cual lo publica" data-campo="titular" value="${esc(v.titular)}"></div>` }
    };
    function pintarLista(nombre) {
      const l = listas[nombre];
      $(`#${nombre}`).innerHTML = l.datos.map((v, i) => `<div class="repe-fila" data-i="${i}">${l.html(v, i)}
        <button type="button" class="btn btn-icono btn-fino" data-quitar="${i}" aria-label="Quitar">✕</button></div>`).join('');
      const boton = $(`#mas-${{ puntos: 'punto', fuentes: 'fuente', titulares: 'titular' }[nombre]}`);
      boton.hidden = l.datos.length >= l.max;
    }
    function leerLista(nombre) {
      return $$(`#${nombre} .repe-fila`).map((fila) => {
        const campos = Object.fromEntries($$('[data-campo]', fila).map((i) => [i.dataset.campo, i.value.trim()]));
        return nombre === 'puntos' ? campos.texto : campos;
      });
    }
    for (const nombre of Object.keys(listas)) {
      pintarLista(nombre);
      $(`#${nombre}`).addEventListener('click', (e) => {
        const q = e.target.closest('[data-quitar]');
        if (!q) return;
        listas[nombre].datos = leerLista(nombre);
        listas[nombre].datos.splice(Number(q.dataset.quitar), 1);
        pintarLista(nombre);
        sucio = true;
      });
    }
    const vacio = { puntos: '', fuentes: { medio: '', url: '' }, titulares: { medio: '', titular: '', url: '' } };
    [['punto', 'puntos'], ['fuente', 'fuentes'], ['titular', 'titulares']].forEach(([b, nombre]) => {
      $(`#mas-${b}`).addEventListener('click', () => {
        listas[nombre].datos = [...leerLista(nombre), structuredClone(vacio[nombre])];
        pintarLista(nombre);
        $$(`#${nombre} .repe-fila:last-child input`)[0]?.focus();
      });
    });

    // --- Contador del titular
    const contar = () => {
      const largo = $('#titular').value.trim().length;
      const c = $('#cont-titular');
      c.textContent = `${largo}/110`;
      c.classList.toggle('pasado', largo > 110);
    };
    $('#titular').addEventListener('input', contar);
    contar();

    // --- Foto
    function pintarFoto() {
      const caja = $('#foto');
      caja.innerHTML = `
        <div class="foto-previa">${foto?.src ? `<img src="${esc(rutaFoto(foto.src))}" alt="" style="object-position:${esc(foto.posicion || '50% 50%')}">` : 'Sin foto: la web pondrá el nombre de la sección en grande'}</div>
        <div class="acciones" style="margin-bottom:12px">
          <label class="btn btn-fino" style="margin:0">Subir foto<input type="file" accept="image/*" id="subir" class="oculto"></label>
          <button type="button" class="btn btn-fino" id="buscar-commons">Buscar foto libre</button>
          ${foto ? '<button type="button" class="btn btn-fino btn-peligro" id="quitar-foto">Quitar foto</button>' : ''}
        </div>
        ${foto ? `
        <div class="campo"><label for="f-alt">Descripción de la foto <span class="ayuda">para quien no la ve</span></label>
          <input type="text" id="f-alt" data-foto="alt" value="${esc(foto.alt)}"></div>
        <div class="dos">
          <div class="campo"><label for="f-credito">Autoría</label><input type="text" id="f-credito" data-foto="credito" value="${esc(foto.credito)}"></div>
          <div class="campo"><label for="f-licencia">Licencia</label><input type="text" id="f-licencia" data-foto="licencia" value="${esc(foto.licencia)}"></div>
        </div>
        <div class="dos">
          <div class="campo"><label for="f-enlace">Enlace de la foto <span class="ayuda">opcional</span></label><input type="url" id="f-enlace" data-foto="enlace" value="${esc(foto.enlace || '')}"></div>
          <div class="campo"><label for="f-pos">Encuadre</label>
            <select id="f-pos" data-foto="posicion">
              ${[['50% 50%', 'Centro'], ['50% 20%', 'Arriba'], ['50% 80%', 'Abajo']].map(([v, t]) => `<option value="${v}" ${(foto.posicion || '50% 50%') === v ? 'selected' : ''}>${t}</option>`).join('')}
            </select></div>
        </div>` : ''}`;
      $('#subir').addEventListener('change', (e) => e.target.files[0] && subirFoto(e.target.files[0]));
      $('#buscar-commons').addEventListener('click', abrirCommons);
      $('#quitar-foto')?.addEventListener('click', () => { foto = null; sucio = true; pintarFoto(); });
      $$('[data-foto]', caja).forEach((i) => i.addEventListener('input', () => {
        foto[i.dataset.foto] = i.value;
        if (i.dataset.foto === 'posicion') $('.foto-previa img').style.objectPosition = i.value;
      }));
    }
    async function subirFoto(archivo) {
      avisar('Subiendo la foto…');
      try {
        const blob = await reducir(archivo);
        const nombre = ($('#titular').value || 'foto').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 40);
        const r = await api(`admin/fotos?nombre=${encodeURIComponent(nombre)}`, { metodo: 'POST', cuerpo: blob, tipo: 'image/jpeg' });
        foto = { src: r.src, alt: foto?.alt || '', credito: yo.nombre, licencia: 'Foto propia', posicion: '50% 50%' };
        sucio = true;
        pintarFoto();
        $('#f-alt').focus();
        avisar('Foto subida. Escribe una descripción.');
      } catch (e) { avisar(e.message, true); }
    }
    function abrirCommons() {
      const m = $('#modal');
      $('#modal-cuerpo').innerHTML = `
        <div class="modal-cab"><h2>Buscar foto libre</h2><button type="button" class="btn btn-fino" id="cerrar-modal">Cerrar</button></div>
        <p class="nota">Fotos de Wikimedia Commons con licencia que permite publicarlas citando la autoría. Busca mejor en inglés.</p>
        <form id="f-commons" class="filtros" style="grid-template-columns:minmax(0,1fr) auto;margin-top:12px">
          <input type="search" id="cq" value="${esc($('#titular').value.split(/[:,.]/)[0].slice(0, 60))}" aria-label="Buscar en Commons">
          <button class="btn btn-principal" type="submit">Buscar</button>
        </form>
        <div class="rejilla-fotos" id="rejilla"></div>`;
      m.showModal();
      $('#cerrar-modal').addEventListener('click', () => m.close());
      let fotos = [];
      $('#f-commons').addEventListener('submit', async (e) => {
        e.preventDefault();
        $('#rejilla').innerHTML = '<p class="nota">Buscando…</p>';
        try {
          ({ fotos } = await api(`admin/commons?q=${encodeURIComponent($('#cq').value)}`));
          $('#rejilla').innerHTML = fotos.length ? fotos.map((f, i) => `<button type="button" class="foto-op" data-i="${i}">
            <img src="${esc(f.miniatura)}" alt="${esc(f.titulo)}" loading="lazy"><span>${esc(f.credito)}, ${esc(f.licencia)}</span></button>`).join('')
            : '<p class="nota">No hay resultados. Prueba con otras palabras.</p>';
        } catch (err) { $('#rejilla').innerHTML = `<p class="errores">${esc(err.message)}</p>`; }
      });
      $('#rejilla').addEventListener('click', async (e) => {
        const b = e.target.closest('.foto-op');
        if (!b) return;
        const f = fotos[Number(b.dataset.i)];
        $('#rejilla').innerHTML = '<p class="nota">Copiando la foto…</p>';
        try {
          const nombre = ($('#titular').value || 'foto').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 40);
          const r = await api('admin/commons', { metodo: 'POST', cuerpo: { url: f.url, nombre } });
          foto = { src: r.src, alt: f.descripcion || f.titulo, credito: f.credito, licencia: f.licencia, enlace: f.enlace, posicion: '50% 50%' };
          sucio = true;
          m.close();
          pintarFoto();
          avisar('Foto añadida. Revisa la descripción.');
        } catch (err) { $('#rejilla').innerHTML = `<p class="errores">${esc(err.message)}</p>`; }
      });
      $('#f-commons').requestSubmit();
    }
    pintarFoto();

    form.addEventListener('input', () => { sucio = true; });

    // --- Leer el formulario y guardar
    function leerFormulario() {
      const v = (nombre) => form.elements[nombre].value.trim();
      const datos = {
        categoria: v('categoria'), momento: v('momento'), titular: v('titular').replace(/\s+/g, ' '),
        entradilla: v('entradilla'), puntos: leerLista('puntos').filter(Boolean), porque: v('porque'),
        fuentes: leerLista('fuentes').filter((f) => f.medio || f.url),
        titulares: leerLista('titulares').filter((t) => t.medio || t.titular || t.url),
        imagen: foto ? { ...foto } : null
      };
      if (v('correccion')) datos.correccion = v('correccion');
      return datos;
    }
    function mostrarErrores(err) {
      const lista = err?.errores?.length ? err.errores : err ? [err.message] : [];
      $('#errores').innerHTML = lista.length ? `<div class="errores" role="alert"><b>Revisa esto:</b><ul>${lista.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
      if (lista.length) $('#errores').scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    async function guardar({ silencioso = false } = {}) {
      mostrarErrores(null);
      try {
        if (!n.id) {
          const r = await api('admin/noticias', { metodo: 'POST', cuerpo: { datos: leerFormulario(), importancia: Number(form.elements.importancia.value) } });
          sucio = false;
          n.id = r.id;
          hashAnterior = `#/editar/${encodeURIComponent(r.id)}`;
          history.replaceState(null, '', hashAnterior);
          if (!silencioso) avisar('Borrador guardado');
          return true;
        }
        if (!sucio) return true;
        const actualizacion = !!$('#actualizacion')?.checked;
        await api(`admin/noticias/${encodeURIComponent(n.id)}`, { metodo: 'PUT', cuerpo: { datos: leerFormulario(), importancia: Number(form.elements.importancia.value), actualizacion } });
        sucio = false;
        if (actualizacion) { $('#actualizacion').checked = false; avisar('Guardada como actualización: ya sube en portada'); }
        else if (!silencioso) avisar('Cambios guardados');
        return true;
      } catch (e) {
        mostrarErrores(e);
        avisar('No se ha guardado: revisa los avisos', true);
        return false;
      }
    }
    async function hacer(accion, extra = {}, mensaje = 'Hecho') {
      if (!(await guardar({ silencioso: true }))) return;
      try {
        await api(`admin/noticias/${encodeURIComponent(n.id)}`, { metodo: 'POST', cuerpo: { accion, ...extra } });
        avisar(mensaje);
        await vistaEditor(n.id);
      } catch (e) { mostrarErrores(e); avisar(e.message, true); }
    }

    // --- Columna lateral: estado, portada, compartir e historial
    const lat = $('#lateral');
    const sit = n.situacion;
    let estadoTxt = '';
    if (sit === 'visible') estadoTxt = `En la web desde el ${fecha(n.publicar_en)}.`;
    else if (sit === 'programada') estadoTxt = `Saldrá sola el ${fecha(n.publicar_en)} (${dentroDe(n.publicar_en)}).`;
    else if (sit === 'nueva') estadoTxt = 'Todavía no se ha guardado.';
    else if (sit === 'borrador') estadoTxt = 'Nadie la ve hasta que se publique.';
    else estadoTxt = 'No se ve en la web.';
    if (n.retirar_en && sit === 'visible') estadoTxt += ` Se retira el ${fecha(n.retirar_en)}.`;

    const pub = puedePublicar();
    lat.innerHTML = `
      <section class="bloque">
        <h3>Estado</h3>
        <p style="margin-bottom:8px">${chip(n)}</p>
        <p class="nota" style="margin-bottom:14px">${estadoTxt}</p>
        <div class="acciones">
          ${editable ? '<button class="btn" type="button" data-hacer="guardar">Guardar</button>' : ''}
          ${pub && sit !== 'visible' ? '<button class="btn btn-principal" type="button" data-hacer="publicar">Publicar ahora</button>' : ''}
        </div>
        ${pub && sit !== 'visible' ? `
        <div style="margin-top:14px">
          <label for="cuando">${sit === 'programada' ? 'Cambiar la hora' : 'O programarla para'}</label>
          <div class="filtros" style="grid-template-columns:minmax(0,1fr) auto;margin:0">
            <input type="datetime-local" id="cuando" value="${aLocal(sit === 'programada' ? n.publicar_en : Date.now() + 60 * 60 * 1000)}">
            <button class="btn" type="button" data-hacer="programar">Programar</button>
          </div>
        </div>` : ''}
        <div class="acciones" style="margin-top:14px">
          ${pub && sit === 'visible' ? '<button class="btn btn-peligro" type="button" data-hacer="retirar">Retirar de la web</button>' : ''}
          ${pub && sit === 'programada' ? '<button class="btn" type="button" data-hacer="borrador">Pasar a borrador</button>' : ''}
          ${n.id && sit === 'borrador' ? '<button class="btn btn-fino btn-peligro" type="button" data-hacer="descartar">Descartar</button>' : ''}
        </div>
      </section>
      ${n.id && pub ? `
      <section class="bloque">
        <h3>En portada</h3>
        <div class="acciones">
          <button class="btn btn-fino" type="button" data-hacer="${n.destacado ? 'quitar-destacado' : 'destacar'}">${n.destacado ? '★ Quitar de destacada' : '☆ Hacerla la destacada'}</button>
          <button class="btn btn-fino" type="button" data-hacer="${n.fijada ? 'soltar' : 'fijar'}">${n.fijada ? 'Soltar' : 'Fijar en portada'}</button>
        </div>
        <p class="nota" style="margin-top:8px">Fijada: sigue en portada aunque pasen 48 horas (útil para guías).</p>
      </section>` : ''}
      ${sit === 'visible' ? `
      <section class="bloque">
        <h3>Compartir</h3>
        <div class="acciones">
          <a class="btn btn-fino" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(n.titular)}&url=${encodeURIComponent(urlNoticia(n.id))}">En X</a>
          <a class="btn btn-fino" target="_blank" rel="noopener" href="https://bsky.app/intent/compose?text=${encodeURIComponent(`${n.titular} ${urlNoticia(n.id)}`)}">En Bluesky</a>
          <button class="btn btn-fino" type="button" id="copiar">Copiar enlace</button>
          <a class="btn btn-fino" target="_blank" rel="noopener" href="${esc(urlNoticia(n.id))}">Ver en la web</a>
        </div>
      </section>` : ''}
      ${versiones.length ? `
      <section class="bloque">
        <h3>Historial</h3>
        <ul class="historial">${versiones.map((v, i) => `<li><div>${esc(v.accion)}<small>${esc(fecha(v.fecha))}, ${esc(v.autor)}</small></div>
          ${i > 0 && pub ? `<button class="btn btn-fino" type="button" data-version="${v.n}">Volver a esta</button>` : i === 0 ? '<small>actual</small>' : ''}</li>`).join('')}</ul>
      </section>` : ''}`;

    $('#pie-editor').innerHTML = `${editable ? '<button class="btn" type="button" data-hacer="guardar">Guardar</button>' : ''}
      ${pub && sit !== 'visible' ? '<button class="btn btn-principal" type="button" data-hacer="publicar">Publicar ahora</button>' : ''}`;

    const mensajes = { publicar: 'Publicada', retirar: 'Retirada de la web', borrador: 'Pasada a borrador', descartar: 'Descartada',
      destacar: 'Ahora es la destacada', 'quitar-destacado': 'Ya no es la destacada', fijar: 'Fijada en portada', soltar: 'Ya no está fijada' };
    $$('[data-hacer]').forEach((b) => b.addEventListener('click', async () => {
      const a = b.dataset.hacer;
      b.disabled = true;
      if (a === 'guardar') { if (await guardar() && !id) await vistaEditor(n.id); }
      else if (a === 'programar') {
        const cuando = new Date($('#cuando').value).getTime();
        if (!cuando) avisar('Elige día y hora', true);
        else await hacer('programar', { cuando }, `Programada para el ${fecha(cuando)}`);
      } else if (a === 'retirar' && !confirm('La noticia dejará de verse en la web. ¿Seguro?')) { /* nada */ }
      else if (a === 'descartar' && !confirm('¿Descartar este borrador?')) { /* nada */ }
      else await hacer(a, {}, mensajes[a]);
      b.disabled = false;
    }));
    $$('[data-version]').forEach((b) => b.addEventListener('click', async () => {
      if (sucio && !confirm('Perderás los cambios sin guardar. ¿Seguimos?')) return;
      sucio = false;
      await hacer('restaurar', { version: Number(b.dataset.version) }, 'Recuperada esa versión');
    }));
    $('#copiar')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(urlNoticia(n.id)); avisar('Enlace copiado'); }
      catch (e) { prompt('Copia el enlace:', urlNoticia(n.id)); }
    });
    sucio = false;
  }

  // Reduce la foto a 1600 px como mucho antes de subirla (las del móvil pesan mucho)
  async function reducir(archivo) {
    const bmp = await createImageBitmap(archivo);
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * escala);
    c.height = Math.round(bmp.height * escala);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error('No se ha podido leer la foto'))), 'image/jpeg', 0.82));
  }

  // ---------- 7. Portada: orden y anuncio ----------

  async function vistaPortada() {
    const d = await api('admin/portada');
    let ids = d.noticias.map((n) => n.id);
    const porId = Object.fromEntries(d.noticias.map((n) => [n.id, n]));
    const pub = puedePublicar();
    vista.innerHTML = `
      <div class="cabeza">
        <div><h1>Portada</h1><p>Lo que ven ahora los lectores, en este orden. La destacada va siempre primero.</p></div>
        ${pub ? '<button class="btn btn-principal" type="button" id="guardar-orden" disabled>Guardar orden</button>' : ''}
      </div>
      <p class="nota" style="margin-bottom:14px">${d.aMano
        ? 'Ahora manda el <b>orden que fijaste a mano</b>, hasta la próxima edición del agente.'
        : 'Orden <b>automático</b>: cada noticia pesa según su importancia y va bajando con las horas; si se actualiza, vuelve a subir. Si lo cambias a mano, manda tu orden hasta la próxima edición.'}
        ${d.aMano && pub ? ' <button class="btn btn-fino" type="button" id="orden-auto">Volver al orden automático</button>' : ''}</p>
      <ul class="lista" id="orden"></ul>
      <section class="bloque" style="margin-top:28px">
        <h2>Anuncio</h2>
        <p class="nota" style="margin-bottom:14px">Aparece como «Publicidad» en la portada. Déjalo vacío para mostrar «Espacio publicitario».</p>
        <form id="f-anuncio">
          <fieldset ${pub ? '' : 'disabled'} style="border:0;padding:0;margin:0">
          <div class="dos">
            <div class="campo"><label for="a-texto">Texto</label><input type="text" id="a-texto" maxlength="140" value="${esc(d.anuncio?.texto || '')}"></div>
            <div class="campo"><label for="a-url">Enlace</label><input type="url" id="a-url" value="${esc(d.anuncio?.url || '')}" placeholder="https://…"></div>
          </div>
          <button class="btn" type="submit">Guardar anuncio</button>
          </fieldset>
        </form>
      </section>`;
    function pintar() {
      $('#orden').innerHTML = ids.map((id, i) => {
        const n = porId[id];
        return `<li class="fila">
          <span class="orden-botones">${pub ? `<button class="btn btn-icono btn-fino" type="button" data-mover="${i}" data-dir="-1" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn btn-icono btn-fino" type="button" data-mover="${i}" data-dir="1" aria-label="Bajar" ${i === ids.length - 1 ? 'disabled' : ''}>↓</button>` : `${i + 1}`}</span>
          ${mini(n)}
          <div class="fila-txt"><a href="#/editar/${encodeURIComponent(id)}">${esc(n.titular)}</a>
            <div class="meta">${seccion(n.categoria)}${n.destacado ? '<span class="estrella">★ Destacada</span>' : ''}${n.fijada ? '<span>Fijada</span>' : ''}<span>Importancia ${n.importancia}</span><span>${fecha(n.publicar_en)}</span>${n.datos?.actualizada ? '<span>Actualizada</span>' : ''}</div></div>
          <span></span>
        </li>`;
      }).join('') || '<li class="vacio"><b>No hay noticias en la web.</b></li>';
    }
    pintar();
    $('#orden').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mover]');
      if (!b) return;
      const i = Number(b.dataset.mover);
      const j = i + Number(b.dataset.dir);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      pintar();
      $(`[data-mover="${j}"][data-dir="${b.dataset.dir}"]`)?.focus() || $(`[data-mover="${j}"]`)?.focus();
      $('#guardar-orden').disabled = false;
    });
    $('#guardar-orden')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try { await api('admin/portada', { metodo: 'PUT', cuerpo: { orden: ids } }); avisar('Orden guardado'); }
      catch (err) { avisar(err.message, true); e.target.disabled = false; }
    });
    $('#orden-auto')?.addEventListener('click', async () => {
      try { await api('admin/portada', { metodo: 'PUT', cuerpo: { orden: 'automatico' } }); avisar('Vuelve el orden automático'); await vistaPortada(); }
      catch (err) { avisar(err.message, true); }
    });
    $('#f-anuncio').addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = $('#a-texto').value.trim();
      const url = $('#a-url').value.trim();
      try {
        await api('admin/portada', { metodo: 'PUT', cuerpo: { anuncio: texto || url ? { texto, url } : null } });
        avisar(texto ? 'Anuncio guardado' : 'Anuncio quitado');
      } catch (err) { avisar(err.message, true); }
    });
  }

  // ---------- 8. Momentos: mañana, tarde y noche ----------

  async function vistaMomentos(cual) {
    const d = await api('admin/momentos');
    const elegido = cual || (d.siguiente ? 'siguiente' : 'actual');
    const m = d[elegido] || { desde: null, datos: { manana: { titulo: 'Para empezar el día', puntos: [] }, tarde: { titulo: 'A media tarde', puntos: [] }, noche: { titulo: 'Para cerrar el día', puntos: [] } } };
    const pub = puedePublicar();
    const opciones = (sel) => `<option value="">Elige noticia…</option>${d.opciones.map((o) =>
      `<option value="${esc(o.id)}" ${o.id === sel ? 'selected' : ''}>${esc(o.titular.slice(0, 80))}</option>`).join('')}`;
    vista.innerHTML = `
      <div class="cabeza">
        <div><h1>Momentos</h1><p>El bloque «Mañana, tarde y noche» de la portada: qué leer en cada momento del día.</p></div>
      </div>
      ${d.siguiente ? `<div class="pestanas" role="group" aria-label="Qué momentos editar">
        <button type="button" data-cual="actual" aria-pressed="${elegido === 'actual'}">Los de ahora</button>
        <button type="button" data-cual="siguiente" aria-pressed="${elegido === 'siguiente'}">Próxima edición (${hora(d.siguiente.desde)})</button>
      </div>` : ''}
      <form class="bloque" id="f-momentos">
        <fieldset ${pub ? '' : 'disabled'} style="border:0;padding:0;margin:0">
        ${Object.entries(MOMENTOS).map(([k, t]) => `
          <div class="momento" data-momento="${k}">
            <h2>${t}</h2>
            <div class="campo" style="margin-top:10px"><label for="t-${k}">Título</label><input type="text" id="t-${k}" data-titulo value="${esc(m.datos[k]?.titulo || '')}" maxlength="60"></div>
            <div data-puntos>${[0, 1, 2, 3].map((i) => {
              const p = m.datos[k]?.puntos?.[i] || {};
              return `<div class="punto"><input type="text" aria-label="${t}, punto ${i + 1}" placeholder="Frase corta" value="${esc(p.texto || '')}" maxlength="140">
                <select aria-label="${t}, noticia del punto ${i + 1}">${opciones(p.id)}</select><span></span></div>`;
            }).join('')}</div>
          </div>`).join('')}
        <p class="nota" style="margin:12px 0">Los puntos vacíos no se muestran. Lo normal son 3 por momento.</p>
        <button class="btn btn-principal" type="submit">Guardar momentos</button>
        </fieldset>
      </form>`;
    $$('[data-cual]').forEach((b) => b.addEventListener('click', () => vistaMomentos(b.dataset.cual)));
    $('#f-momentos').addEventListener('submit', async (e) => {
      e.preventDefault();
      const datos = {};
      $$('[data-momento]').forEach((bloque) => {
        datos[bloque.dataset.momento] = {
          titulo: $('[data-titulo]', bloque).value.trim(),
          puntos: $$('.punto', bloque).map((p) => ({ texto: $('input', p).value.trim(), id: $('select', p).value })).filter((p) => p.texto && p.id)
        };
      });
      try {
        await api('admin/momentos', { metodo: 'PUT', cuerpo: { desde: m.desde, datos } });
        avisar('Momentos guardados');
      } catch (err) { avisar(err.message, true); }
    });
  }

  // ---------- 9. Redes: la escaleta del community manager ----------

  const REDES = { bluesky: 'Bluesky', x: 'X', tiktok: 'TikTok', instagram: 'Instagram' };
  const LIMITE = { bluesky: 300, x: 280, tiktok: 2200, instagram: 2200 };
  const ESTADO_PIEZA = { revisar: 'Por revisar', aprobada: 'Aprobada', cambiar: 'Cambiar', descartada: 'Descartada', publicada: 'Publicada' };
  const TANDAS = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche', manual: 'A mano' };
  // Igual que cuenta cada red: en X los enlaces valen 23
  function largo(t, red) {
    let s = String(t || '');
    if (red === 'x') s = s.replace(/https?:\/\/\S+/g, 'x'.repeat(23));
    try { return [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(s)].length; } catch (e) { return [...s].length; }
  }
  const sumarDias = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  // Enlace para abrir la red con el texto ya escrito (TikTok e Instagram no lo permiten: se copia)
  const componer = (p) => ({
    x: `https://x.com/intent/post?text=${encodeURIComponent(p.texto)}`,
    bluesky: `https://bsky.app/intent/compose?text=${encodeURIComponent(p.texto)}`
  }[p.red]);

  async function vistaRedes(diaPedido) {
    const d = await api(`admin/redes${/^\d{4}-\d{2}-\d{2}$/.test(diaPedido || '') ? `?dia=${diaPedido}` : ''}`);
    const pub = puedePublicar();
    const cuenta = (e) => d.piezas.filter((p) => p.estado === e).length;
    const esc_ = d.escaleta || {};
    const tandas = Object.keys(TANDAS).filter((t) => esc_[t] && (esc_[t].resumen || esc_[t].alertas?.length || esc_[t].video || esc_[t].comunidad || esc_[t].ideas));
    vista.innerHTML = `
      <div class="cabeza">
        <div><h1>Redes</h1><p>La escaleta del community manager: nada sale sin tu aprobación.</p></div>
        <div class="acciones">
          <a class="btn btn-fino" href="#/redes/${sumarDias(d.dia, -1)}" aria-label="Día anterior">←</a>
          <span class="dia-redes">${esc(diaLargo(d.dia))}</span>
          <a class="btn btn-fino" href="#/redes/${sumarDias(d.dia, 1)}" aria-label="Día siguiente">→</a>
          ${d.dia !== hoyMadrid() ? '<a class="btn btn-fino" href="#/redes">Hoy</a>' : ''}
        </div>
      </div>
      ${!d.piezas.length && !tandas.length ? `<div class="vacio"><b>No hay escaleta para este día.</b>El community manager la prepara cada mañana sobre las 7:15 y añade piezas a las 14:15 y a las 21:15. Te llega un email con cada una.</div>` : `
      <div class="resumen">
        <div><b>${cuenta('revisar')}</b>por revisar</div>
        <div><b>${cuenta('aprobada')}</b>aprobadas</div>
        <div><b>${cuenta('publicada')}</b>publicadas</div>
        <div><b>${cuenta('cambiar') + cuenta('descartada')}</b>con cambios o descartadas</div>
      </div>
      ${tandas.map((t) => {
        const x = esc_[t];
        return `<section class="bloque">
          <h2>${TANDAS[t]}</h2>
          ${x.resumen ? `<p class="texto-libre">${esc(x.resumen)}</p>` : ''}
          ${x.alertas?.length ? `<ul class="alertas">${x.alertas.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
          ${[['video', 'Vídeo del día'], ['comunidad', 'Comunidad'], ['ideas', 'Ideas para mañana']].filter(([k]) => x[k]).map(([k, tit]) =>
            `<details class="desplegable"><summary>${tit}</summary><p class="texto-libre">${esc(x[k])}</p></details>`).join('')}
        </section>`;
      }).join('')}`}
      <ul class="piezas" id="piezas">${d.piezas.map(pieza).join('')}</ul>
      <details class="bloque desplegable" style="margin-top:20px">
        <summary>Añadir una pieza a mano</summary>
        <form id="f-pieza" style="margin-top:12px">
          <div class="dos">
            <div class="campo"><label for="p-red">Red</label><select id="p-red">${Object.entries(REDES).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
            <div class="campo"><label for="p-hora">Hora</label><input type="time" id="p-hora"></div>
          </div>
          <div class="campo"><label for="p-texto">Texto <span class="ayuda">el post completo, con el enlace</span></label><textarea id="p-texto" rows="4" required></textarea></div>
          <button class="btn" type="submit">Añadir</button>
        </form>
      </details>`;

    function pieza(p) {
      const n = largo(p.texto, p.red);
      return `<li class="pieza pieza-${esc(p.estado)}" data-id="${p.id}">
        <div class="pieza-cab">
          <b class="pieza-hora">${esc(p.hora || '--:--')}</b>
          <span class="red red-${esc(p.red)}">${esc(REDES[p.red])}</span>
          ${p.serie ? `<span class="nota">${esc(p.serie)}</span>` : ''}
          <span class="situ situ-pieza-${esc(p.estado)}">${esc(ESTADO_PIEZA[p.estado])}</span>
        </div>
        ${p.noticia ? `<p class="nota">Noticia: <a href="#/editar/${encodeURIComponent(p.noticia)}">${esc(p.titular_noticia || p.noticia)}</a></p>` : ''}
        <div class="campo" style="margin:8px 0">
          <label class="oculto" for="t-${p.id}">Texto</label>
          <textarea id="t-${p.id}" data-texto rows="${Math.min(10, Math.max(3, Math.ceil(p.texto.length / 70)))}">${esc(p.texto)}</textarea>
          <span class="contador${n > LIMITE[p.red] ? ' pasado' : ''}" data-contador>${n}/${LIMITE[p.red]}</span>
        </div>
        ${p.visual || p.alt ? `<details class="desplegable"><summary>Imagen</summary>
          ${p.visual ? `<p class="texto-libre"><b>Visual:</b> ${esc(p.visual)}</p>` : ''}
          ${p.alt ? `<p class="texto-libre"><b>Texto alternativo:</b> ${esc(p.alt)} <button class="btn btn-fino" type="button" data-copiar-alt>Copiar</button></p>` : ''}
        </details>` : ''}
        ${p.nota ? `<p class="nota"><b>Nota:</b> ${esc(p.nota)}</p>` : ''}
        ${p.enlace ? `<p class="nota"><a href="${esc(p.enlace)}" target="_blank" rel="noopener">Ver la publicación</a></p>` : ''}
        <div class="acciones">
          <button class="btn btn-fino" type="button" data-copiar>Copiar texto</button>
          ${componer(p) ? `<a class="btn btn-fino" href="${esc(componer(p))}" target="_blank" rel="noopener">Abrir en ${esc(REDES[p.red])}</a>` : ''}
          ${pub && p.estado !== 'aprobada' && p.estado !== 'publicada' ? '<button class="btn btn-fino" type="button" data-estado="aprobada">Aprobar</button>' : ''}
          ${pub && p.estado !== 'publicada' ? '<button class="btn btn-fino btn-principal" type="button" data-estado="publicada">Marcar publicada</button>' : ''}
          ${p.estado !== 'cambiar' && p.estado !== 'publicada' ? '<button class="btn btn-fino" type="button" data-estado="cambiar">Pedir cambio</button>' : ''}
          ${pub && p.estado !== 'descartada' && p.estado !== 'publicada' ? '<button class="btn btn-fino btn-peligro" type="button" data-estado="descartada">Descartar</button>' : ''}
          ${pub && (p.estado === 'descartada' || p.estado === 'publicada') ? '<button class="btn btn-fino" type="button" data-estado="revisar">Volver a revisar</button>' : ''}
        </div>
      </li>`;
    }

    const lista = $('#piezas');
    const guardar = async (id, cuerpo, msg) => {
      try { await api(`admin/redes/${id}`, { metodo: 'PUT', cuerpo }); if (msg) avisar(msg); return true; }
      catch (e) { avisar(e.message, true); return false; }
    };
    lista.addEventListener('input', (e) => {
      if (!e.target.matches('[data-texto]')) return;
      const li = e.target.closest('.pieza');
      const red = d.piezas.find((p) => p.id === Number(li.dataset.id)).red;
      const n = largo(e.target.value, red);
      const c = $('[data-contador]', li);
      c.textContent = `${n}/${LIMITE[red]}`;
      c.classList.toggle('pasado', n > LIMITE[red]);
    });
    lista.addEventListener('change', async (e) => {
      if (!e.target.matches('[data-texto]')) return;
      const id = Number(e.target.closest('.pieza').dataset.id);
      if (await guardar(id, { texto: e.target.value }, 'Texto guardado')) d.piezas.find((p) => p.id === id).texto = e.target.value.trim();
    });
    lista.addEventListener('click', async (e) => {
      const li = e.target.closest('.pieza');
      if (!li) return;
      const p = d.piezas.find((x) => x.id === Number(li.dataset.id));
      const copiar = async (t, msg) => {
        try { await navigator.clipboard.writeText(t); avisar(msg); } catch (err) { prompt('Copia el texto:', t); }
      };
      if (e.target.closest('[data-copiar]')) return copiar($('[data-texto]', li).value, 'Texto copiado');
      if (e.target.closest('[data-copiar-alt]')) return copiar(p.alt, 'Texto alternativo copiado');
      const b = e.target.closest('[data-estado]');
      if (!b) return;
      const estado = b.dataset.estado;
      const cuerpo = { estado };
      if (estado === 'cambiar') {
        const nota = prompt('¿Qué hay que cambiar?', p.nota || '');
        if (nota === null) return;
        cuerpo.nota = nota;
        if (!pub) delete cuerpo.estado;
      }
      if (estado === 'publicada') {
        const enlace = prompt('Pega el enlace de la publicación (opcional):', p.enlace || '');
        if (enlace === null) return;
        cuerpo.enlace = enlace;
      }
      b.disabled = true;
      if (await guardar(p.id, cuerpo, ESTADO_PIEZA[estado] || 'Guardado')) await vistaRedes(d.dia);
      else b.disabled = false;
    });
    $('#f-pieza').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('admin/redes', { metodo: 'POST', cuerpo: { dia: d.dia, red: $('#p-red').value, hora: $('#p-hora').value, texto: $('#p-texto').value } });
        avisar('Pieza añadida');
        await vistaRedes(d.dia);
      } catch (err) { avisar(err.message, true); }
    });
  }

  // ---------- 10. Usuarios ----------

  async function vistaUsuarios() {
    if (yo.rol !== 'admin') { vista.innerHTML = '<div class="vacio"><b>Solo administración puede ver esta página.</b></div>'; return; }
    const { usuarios } = await api('admin/usuarios');
    const selRol = (actual, attrs) => `<select ${attrs}>${Object.entries(ROLES).map(([k, t]) => `<option value="${k}" ${k === actual ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    vista.innerHTML = `
      <div class="cabeza"><div><h1>Usuarios</h1><p>Quién puede entrar en la redacción y qué puede hacer.</p></div></div>
      <ul class="lista" style="margin-bottom:28px">${usuarios.map((u) => `<li class="fila fila-sin-interruptor${u.activo ? '' : ' fila-desc'}">
        <div class="fila-txt" style="grid-column:span 2"><b>${esc(u.nombre)}</b><div class="meta"><span>${esc(u.email)}</span>${u.activo ? '' : '<span>Sin acceso</span>'}</div></div>
        <div class="acciones">${selRol(u.rol, `data-rol="${esc(u.email)}" aria-label="Perfil de ${esc(u.nombre)}"`)}
          <button class="btn btn-fino" type="button" data-activo="${esc(u.email)}" data-valor="${u.activo ? 0 : 1}">${u.activo ? 'Quitar acceso' : 'Dar acceso'}</button></div>
      </li>`).join('')}</ul>
      <form class="bloque" id="f-usuario">
        <h2>Dar acceso a alguien</h2>
        <div class="dos" style="margin-top:12px">
          <div class="campo"><label for="u-nombre">Nombre</label><input type="text" id="u-nombre" required maxlength="80"></div>
          <div class="campo"><label for="u-email">Email</label><input type="email" id="u-email" required></div>
        </div>
        <div class="campo"><label for="u-rol">Perfil</label>${selRol('redactor', 'id="u-rol"')}
          <p class="ayuda" style="margin-top:6px">${Object.entries(ROLES).map(([k, t]) => `<b>${t}:</b> ${ROLES_AYUDA[k]}.`).join(' ')}</p></div>
        <button class="btn btn-principal" type="submit">Dar acceso</button>
        <p class="nota" style="margin-top:10px">Entrará con un enlace que le llegará a ese email cuando lo pida en la pantalla de entrada.</p>
      </form>`;
    const cambiar = async (cuerpo) => {
      try { await api('admin/usuarios', { metodo: 'PUT', cuerpo }); avisar('Guardado'); }
      catch (e) { avisar(e.message, true); }
      await vistaUsuarios();
    };
    $$('[data-rol]').forEach((s) => s.addEventListener('change', () => cambiar({ email: s.dataset.rol, rol: s.value })));
    $$('[data-activo]').forEach((b) => b.addEventListener('click', () => cambiar({ email: b.dataset.activo, activo: b.dataset.valor === '1' })));
    $('#f-usuario').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('admin/usuarios', { metodo: 'POST', cuerpo: { nombre: $('#u-nombre').value, email: $('#u-email').value, rol: $('#u-rol').value } });
        avisar('Acceso creado');
        await vistaUsuarios();
      } catch (err) { avisar(err.message, true); }
    });
  }

  // ---------- 11. Arranque ----------

  async function iniciar() {
    // ¿Venimos del enlace del email?
    const token = new URLSearchParams(location.search).get('entrar');
    if (token) {
      history.replaceState(null, '', location.pathname + location.hash);
      try { await api('acceso/verificar', { metodo: 'POST', cuerpo: { token } }); }
      catch (e) { pintarEntrar(e.message); return; }
    }
    try { ({ usuario: yo } = await api('admin/yo')); }
    catch (e) { if (!yo && !$('.entrar')) pintarEntrar(); return; }
    $('#barra').hidden = false;
    $$('[data-solo="admin"]').forEach((a) => { a.hidden = yo.rol !== 'admin'; });
    if (!location.hash) history.replaceState(null, '', '#/hoy');
    hashAnterior = location.hash;
    navegar();
  }
  iniciar();
}
