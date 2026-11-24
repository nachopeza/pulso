// =====================================================================
//  pulso — app.js
//  Lee data/noticias.json y pinta la web en dos modos:
//    · Flash: una noticia por pantalla, deslizando (como stories).
//    · Lista: portada con última hora, la noticia destacada, lo último y la rejilla.
//  El agente solo tiene que actualizar noticias.json; este archivo no se toca.
// =====================================================================
{
  // ---------- 1. Configuración ----------

  // Nombre visible de cada sección. La clave es la que va en "categoria" del JSON.
  // El orden de esta lista es el orden de los chips y del menú.
  const CATS = {
    elecciones: '29N',
    espana: 'España',
    mundo: 'Mundo',
    economia: 'Economía',
    tecnologia: 'Tecnología',
    clima: 'Clima',
    cultura: 'Cultura',
    deportes: 'Deportes'
  };
  const MOMENTOS = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };
  const DIA_29N = '2026-11-29';           // fecha de las elecciones (para la cuenta atrás)
  const ZONA = 'Europe/Madrid';
  const CADA_CUANTO = 5 * 60 * 1000;      // cada 5 minutos mira si hay noticias nuevas
  const PUBLI_CADA = 6;                   // en la lista, un espacio publicitario cada 6 noticias
  // Redes donde publicamos los titulares. Pon aquí la dirección de cada perfil cuando exista.
  const REDES = [
    { nombre: 'Bluesky', url: '' },
    { nombre: 'X', url: '' }
  ];
  // Páginas legales que todo medio en España debe tener (aviso legal, privacidad, cookies)
  // y una vía de contacto. Pon la dirección cuando existan; mientras estén vacías no se muestran.
  const LEGAL = [
    { nombre: 'Aviso legal', url: '' },
    { nombre: 'Privacidad', url: '' },
    { nombre: 'Cookies', url: '' },
    { nombre: 'Contacto', url: '' }
  ];

  // ---------- 2. Pequeñas herramientas ----------

  const $ = (sel) => document.querySelector(sel);
  const pocoMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const suave = pocoMovimiento ? 'auto' : 'smooth';

  // localStorage puede fallar (modo privado, iframes): por eso va siempre dentro de try/catch
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin memoria, no pasa nada */ } };
  // Lo mismo, pero solo mientras la pestaña esté abierta (sessionStorage)
  const leerSesion = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const escribirSesion = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* nada */ } };

  // Todo lo que viene del JSON se trata como TEXTO, nunca como HTML.
  // esc() convierte < > & " ' en entidades para que nadie pueda colar código en la web.
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Solo aceptamos enlaces http(s). Cualquier otra cosa (javascript:, data:…) se descarta.
  const enlace = (u) => (/^https?:\/\//i.test(u || '') ? esc(u) : '');
  // Imágenes: enlace https o ruta propia tipo img/foto.jpg
  const rutaImg = (u) => (/^https:\/\//i.test(u || '') || /^[\w\-./]+$/.test(u || '') ? esc(u) : '');
  const cat = (n) => (CATS[n.categoria] ? n.categoria : 'espana');

  const hora = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: ZONA });
  // "hace 20 min", "hace 3 h", "ayer"… Si la fecha es futura, muestra la hora.
  function hace(iso) {
    const min = Math.round((Date.now() - new Date(iso)) / 60000);
    if (Number.isNaN(min)) return '';
    if (min < 0) return hora(iso);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'ayer' : `hace ${d} días`;
  }
  const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA }); // "2026-11-24"
  const fechaLarga = () => new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA }).replace(',', '');
  function momentoActual() {
    const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: ZONA }));
    return h < 14 ? 'manana' : h < 20 ? 'tarde' : 'noche';
  }

  // Cuenta atrás al 29N
  //   num / txt: para el bloque amarillo (número grande + texto)
  //   fuerte / resto: para la cabecera, más corto ("5 días" + "para el 29N")
  function cuenta() {
    const dias = Math.round((Date.parse(DIA_29N) - Date.parse(hoyISO())) / 86400000);
    if (dias > 1) return { num: dias, txt: 'días para el 29N', fuerte: `${dias} días`, resto: 'para el 29N' };
    if (dias === 1) return { num: 1, txt: 'día para el 29N', fuerte: '1 día', resto: 'para el 29N' };
    if (dias === 0) return { num: 'Hoy', txt: 'se vota. Colegios abiertos de 9:00 a 20:00', fuerte: 'Hoy', resto: 'se vota' };
    return { num: '29N', txt: 'resultados y lo que viene ahora', fuerte: 'Resultados', resto: 'del 29N' };
  }

  // Iconos (SVG en línea: heredan el color del texto)
  const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const ICONO_ABAJO = svg('<path d="M6 9l6 6 6-6"/>');
  const ICONO_X = svg('<path d="M6 6l12 12M18 6L6 18"/>');
  const ICONO_GUARDAR = svg('<path d="M6 3.5h12v17l-6-4.2-6 4.2z"/>');
  const ICONO_COMPARTIR = svg('<path d="M12 3v12M7 8l5-5 5 5M5 13v6.5h14V13"/>');
  const ICONO_FUENTES = svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>');
  const ICONO_COMPARA = svg('<path d="M4 6h16M4 12h10M4 18h13"/>');

  // ---------- 3. Estado de la página ----------

  const estado = {
    datos: null,
    cat: 'todo',
    // Cada visita empieza en el modo de su dispositivo: Flash en el móvil, Lista en el ordenador.
    // Si el lector lo cambia, se respeta hasta que cierre la pestaña.
    modo: leerSesion('pulso-modo') || (innerWidth < 900 ? 'flash' : 'lista'),
    momento: momentoActual(),
    guardadas: new Set((() => { try { return JSON.parse(leer('pulso-guardadas') || '[]'); } catch (e) { return []; } })())
  };

  const main = $('#main');
  const top = $('#top');
  const chips = $('#chips');
  const ficha = $('#ficha');
  const fichaCuerpo = $('#ficha-cuerpo');
  const menu = $('#menu');
  const aviso = $('#aviso');

  // Todas las noticias: destacadas primero, luego de más nueva a más antigua
  const ordenadas = () => [...(estado.datos?.noticias || [])].sort((a, b) =>
    (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0) || new Date(b.fecha) - new Date(a.fecha));
  // Las de la sección elegida
  function visibles() {
    const todas = ordenadas();
    if (estado.cat === 'todo') return todas;
    if (estado.cat === 'guardadas') return todas.filter((n) => estado.guardadas.has(n.id));
    return todas.filter((n) => cat(n) === estado.cat);
  }
  // Solo por fecha (para "Última hora" y "Lo último")
  const recientes = () => [...(estado.datos?.noticias || [])].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const buscar = (id) => (estado.datos?.noticias || []).find((n) => n.id === id);
  const presentes = () => Object.keys(CATS).filter((k) => (estado.datos?.noticias || []).some((n) => cat(n) === k));

  // ---------- 4. Piezas de HTML ----------

  // Barra de secciones: Portada (con punto "en vivo"), una por sección con su color y, aparte,
  // Guardadas. Una pastilla suave, teñida del color de la sección, se desliza bajo la elegida.
  function chipsHTML() {
    const boton = (id, contenido, conColor, clase = '') =>
      `<button type="button" class="chip ${clase}" data-filtro="${id}" ${conColor ? `data-cat="${id}"` : ''} aria-pressed="${estado.cat === id}">${contenido}</button>`;
    return '<i class="indicador" aria-hidden="true"></i>'
      + boton('todo', '<span class="vivo" aria-hidden="true"></span>Portada', false)
      + presentes().map((k) => boton(k, CATS[k], true)).join('')
      + boton('guardadas', `${ICONO_GUARDAR}Guardadas`, false, 'chip-guardadas');
  }

  // Actualiza la barra sin reconstruirla (así la pastilla de color puede deslizarse).
  // Solo se reconstruye si cambian las secciones que hay.
  function pintarChips(animar = true) {
    const clave = presentes().join(',');
    if (chips.dataset.clave !== clave) {
      chips.innerHTML = chipsHTML();
      chips.dataset.clave = clave;
      animar = false;
    } else {
      chips.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.filtro === estado.cat));
    }
    moverIndicador(animar);
  }

  function cuentaHTML() {
    const c = cuenta();
    return `<button type="button" class="dia-num" data-filtro="elecciones">
      <b>${esc(c.num)}</b>
      <span><strong>${esc(c.txt)}</strong>Elecciones generales, domingo 29 de noviembre</span>
    </button>`;
  }

  function momentosHTML() {
    const m = estado.datos?.momentos?.[estado.momento];
    const tabs = Object.entries(MOMENTOS).map(([k, nombre]) =>
      `<button type="button" role="tab" data-momento="${k}" aria-selected="${estado.momento === k}">${nombre}</button>`).join('');
    const puntos = (m?.puntos || []).map((p) => {
      const n = buscar(p.id);
      return `<li><button type="button" data-ir="${esc(p.id)}" ${n ? `data-cat="${cat(n)}"` : ''}>${esc(p.texto)}</button></li>`;
    }).join('');
    return `<div class="momentos">
      <div class="momentos-cab">
        <h2>${esc(m?.titulo || 'Lo que tienes que saber')}</h2>
        <div class="tabs" role="tablist" aria-label="Momentos del día">${tabs}</div>
      </div>
      ${puntos ? `<ul>${puntos}</ul>` : '<p class="vacio-txt" style="padding:0">Todavía no hay resumen para este momento.</p>'}
    </div>`;
  }

  const fuentesHTML = (n) => (n.fuentes || []).map((f) =>
    enlace(f.url) ? `<a href="${enlace(f.url)}" target="_blank" rel="noopener">${esc(f.medio)}</a>` : esc(f.medio)).join(', ');

  // En la tarjeta flash los botones son solo icono (ocupan menos); en la ficha llevan texto.
  const botonGuardar = (n, soloIcono) => {
    const g = estado.guardadas.has(n.id);
    const txt = g ? 'Guardada' : 'Guardar';
    return soloIcono
      ? `<button type="button" class="btn icono" data-guardar="${esc(n.id)}" data-icono aria-pressed="${g}" aria-label="${txt}">${ICONO_GUARDAR}</button>`
      : `<button type="button" class="btn" data-guardar="${esc(n.id)}" aria-pressed="${g}">${ICONO_GUARDAR}<span>${txt}</span></button>`;
  };
  const botonCompartir = (n, soloIcono) => soloIcono
    ? `<button type="button" class="btn icono" data-compartir="${esc(n.id)}" aria-label="Compartir">${ICONO_COMPARTIR}</button>`
    : `<button type="button" class="btn" data-compartir="${esc(n.id)}">${ICONO_COMPARTIR}<span>Compartir</span></button>`;

  // La etiqueta <img> de una foto. "posicion" (opcional) elige qué parte se ve al recortarla,
  // por ejemplo "50% 20%" para que no se corte una cara
  function fotoImg(im) {
    if (!im || !rutaImg(im.src)) return '';
    const pos = /^[\d.% a-z]+$/i.test(im.posicion || '') ? ` style="object-position:${im.posicion}"` : '';
    return `<img src="${rutaImg(im.src)}" alt="${esc(im.alt)}" loading="lazy" decoding="async"${pos}>`;
  }

  // Foto con su pie: autor y licencia (con enlace a la ficha de la licencia, si la hay)
  function imagenHTML(n, clase) {
    const im = n.imagen;
    const img = fotoImg(im);
    if (!img) return '';
    const credito = [im.credito, im.licencia].filter(Boolean).map(esc).join(', ');
    const pie = credito && enlace(im.enlace) ? `<a href="${enlace(im.enlace)}" target="_blank" rel="noopener">${credito}</a>` : credito;
    return `<figure class="${clase}">${img}${pie ? `<figcaption>Foto: ${pie}</figcaption>` : ''}</figure>`;
  }

  // La palabra gigante perfilada (la "imagen" tipográfica de cada noticia)
  const gigante = (c) => `<div class="gigante" aria-hidden="true">${CATS[c]}</div>`;

  // Una tarjeta del modo Flash
  function cartaHTML(n, i, total) {
    const c = cat(n);
    const puntos = (n.puntos || []).map((p) => `<li>${esc(p)}</li>`).join('');
    return `<section class="slide" id="s-${esc(n.id)}" aria-label="Noticia ${i + 1} de ${total}">
      <article class="carta" data-cat="${c}">
        <div class="cab">
          <span class="etq"><b>${CATS[c]}</b><span class="hora">${hace(n.fecha)}${n.ejemplo ? ', ejemplo' : ''}</span></span>
          <span class="cont">${i + 1} de ${total}</span>
        </div>
        ${imagenHTML(n, 'foto') || `<div class="hueco">${gigante(c)}</div>`}
        <div class="cuerpo">
          <h2>${esc(n.titular)}</h2>
          ${puntos ? `<ul class="puntos">${puntos}</ul>` : ''}
          ${n.porque ? `<p class="porque"><b>Por qué te importa.</b> ${esc(n.porque)}</p>` : ''}
        </div>
        <div class="pie-carta">
          ${n.fuentes?.length ? `<p class="fuentes">Con información de ${fuentesHTML(n)}</p>` : ''}
          <div class="acciones">
            <button type="button" class="btn lleno" data-abrir="${esc(n.id)}">${n.titulares?.length ? 'Cómo lo titulan' : 'Leer más'}</button>
            ${botonGuardar(n, true)}
            ${botonCompartir(n, true)}
          </div>
        </div>
      </article>
    </section>`;
  }

  function flashHTML(lista) {
    const portada = `<section class="slide" aria-label="Portada">
      <div class="carta portada">
        <div class="saludo">
          <h1>${esc(fechaLarga())}</h1>
          <p>Lo importante de hoy, en corto y con fuentes.</p>
        </div>
        ${cuentaHTML()}
        ${momentosHTML()}
        <p class="pista">${ICONO_ABAJO}${lista.length ? `Desliza para ver ${lista.length} ${lista.length === 1 ? 'noticia' : 'noticias'}` : 'No hay noticias en esta sección'}</p>
      </div>
    </section>`;

    const vacio = !lista.length ? `<section class="slide"><div class="carta final">
        <h2>${estado.cat === 'guardadas' ? 'Aún no has guardado nada' : 'Nada por aquí todavía'}</h2>
        <p class="resumen">${estado.cat === 'guardadas' ? 'Toca el icono de guardar en cualquier noticia y la tendrás aquí para leerla luego.' : 'En cuanto haya noticias de esta sección aparecerán aquí.'}</p>
        <span></span>
        <div class="acciones"><button type="button" class="btn" data-filtro="todo">Ver todas las noticias</button></div>
      </div></section>` : '';

    const final = lista.length ? `<section class="slide" aria-label="Final">
      <div class="carta final">
        <p class="hora">${esc(fechaLarga())}</p>
        <h2>Ya estás al día.</h2>
        <div style="display:grid;gap:14px;align-content:start">
          <p class="resumen">Has repasado ${lista.length} ${lista.length === 1 ? 'noticia' : 'noticias'}. Actualizamos por la mañana, por la tarde y por la noche.</p>
          ${publiHTML()}
          <p class="como">${COMO_TRABAJAMOS}</p>
        </div>
        <div class="acciones"><button type="button" class="btn" data-arriba>Volver al principio</button></div>
      </div>
    </section>` : '';

    return portada + lista.map((n, i) => cartaHTML(n, i, lista.length)).join('') + vacio + final;
  }

  // Metadatos de una noticia: número de fuentes y de titulares comparados
  function metaHTML(n) {
    const k = n.fuentes?.length || 0;
    const t = n.titulares?.length || 0;
    return `<div class="meta">
      <span>${ICONO_FUENTES}${k} ${k === 1 ? 'fuente' : 'fuentes'}</span>
      ${t ? `<span>${ICONO_COMPARA}${t} ${t === 1 ? 'titular comparado' : 'titulares comparados'}</span>` : ''}
      ${n.ejemplo ? '<span>Ejemplo</span>' : ''}
    </div>`;
  }

  // Una tarjeta del modo Lista (con tapa de color).
  //   destacada: ocupa 2 columnas y muestra el sumario (los puntos clave)
  function tarjetaHTML(n, destacada) {
    const c = cat(n);
    const sumario = destacada && n.puntos?.length
      ? `<ul class="sumario">${n.puntos.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '';
    return `<article class="tarjeta ${destacada ? 'destacada' : ''}" data-cat="${c}">
      <div class="tapa">
        ${fotoImg(n.imagen) || `<div class="marco">${gigante(c)}</div>`}
      </div>
      <div class="txt">
        <span class="etq"><b>${CATS[c]}</b><span class="hora">${hace(n.fecha)}</span></span>
        <h3><a href="#${esc(n.id)}">${esc(n.titular)}</a></h3>
        <p class="entr">${esc(n.entradilla)}</p>
        ${sumario}
        ${metaHTML(n)}
      </div>
    </article>`;
  }

  // Un ítem de solo texto (titular + entradilla corta), como en las columnas de los periódicos
  function itemHTML(n, conSeccion) {
    const c = cat(n);
    // Si la noticia tiene foto, va en miniatura a la derecha (decorativa: el titular ya lo dice todo)
    const mini = fotoImg(n.imagen) ? `<div class="item-foto" aria-hidden="true">${fotoImg({ ...n.imagen, alt: '' })}</div>` : '';
    return `<article class="item ${mini ? 'con-foto' : ''}" data-cat="${c}">
      ${mini}
      <p class="item-meta">${conSeccion ? `<b>${CATS[c]}</b>` : ''}<time datetime="${esc(n.fecha)}">${hace(n.fecha)}</time></p>
      <h3><a href="#${esc(n.id)}">${esc(n.titular)}</a></h3>
      <p class="item-entr">${esc(n.entradilla)}</p>
    </article>`;
  }

  // Bloque de una sección en la portada: cabecera + pieza principal + titulares en lista
  function bloqueHTML(k, noticias, extra = '') {
    const [principal, ...resto] = noticias;
    return `<section class="bloque" data-cat="${k}" aria-labelledby="b-${k}">
      <div class="bloque-cab">
        <h2 id="b-${k}"><i aria-hidden="true"></i>${CATS[k]}</h2>
        ${extra}
        <button type="button" class="ver-todo" data-filtro="${k}">Ver todo</button>
      </div>
      <div class="bloque-cuerpo ${resto.length ? '' : 'solo'}">
        ${tarjetaHTML(principal, false)}
        ${resto.length ? `<div class="items">${resto.slice(0, 4).map((n) => itemHTML(n, false)).join('')}</div>` : ''}
      </div>
    </section>`;
  }

  // "Lo último": columna con las noticias más recientes, con su hora (como un teletipo)
  function rioHTML() {
    const items = recientes().slice(0, 6).map((n) => {
      const c = cat(n);
      return `<li data-cat="${c}">
        <time datetime="${esc(n.fecha)}">${hora(n.fecha)}</time>
        <a href="#${esc(n.id)}"><span class="mini">${CATS[c]}</span>${esc(n.titular)}</a>
      </li>`;
    }).join('');
    return `<aside class="rio" aria-labelledby="rio-titulo">
      <h2 id="rio-titulo"><span class="vivo" aria-hidden="true"></span>Lo último</h2>
      <ol>${items}</ol>
    </aside>`;
  }

  // Cinta de "Última hora": los titulares más recientes pasando de lado
  function cintaHTML() {
    const items = recientes().slice(0, 6).map((n) =>
      `<a href="#${esc(n.id)}" data-cat="${cat(n)}"><i aria-hidden="true"></i>${esc(n.titular)}</a>`).join('');
    // Se repite dos veces para que el bucle no tenga corte; la copia la ignoran los lectores de pantalla
    return `<section class="cinta" aria-label="Última hora">
      <span class="cinta-titulo"><span class="vivo" aria-hidden="true"></span>Última hora</span>
      <div class="cinta-pista"><div class="cinta-mov">
        <div class="cinta-grupo">${items}</div>
        <div class="cinta-grupo" aria-hidden="true" inert>${items}</div>
      </div></div>
    </section>`;
  }

  function publiHTML() {
    const a = estado.datos?.anuncio;
    if (a && enlace(a.url)) {
      return `<div class="publi"><p>Publicidad: <a href="${enlace(a.url)}" target="_blank" rel="sponsored noopener">${esc(a.texto)}</a></p></div>`;
    }
    return '<div class="publi"><p>Espacio publicitario</p></div>';
  }

  // Versión corta de "Cómo trabajamos" para la última pantalla del modo Flash y el menú
  const COMO_TRABAJAMOS = '<b>Cómo trabajamos.</b> Resumimos cada noticia con nuestras palabras y enlazamos siempre a la fuente original. Solo usamos fotos propias, libres o compradas, con su autoría.';

  // Pie: marca, secciones, cómo trabajamos y (si están configuradas) redes y páginas legales
  const pieHTML = () => {
    const legales = LEGAL.filter((x) => enlace(x.url));
    return `<footer class="pie" id="como-trabajamos">
      <div class="pie-marca">
        <p class="logo-pie">pulso<span class="latido" aria-hidden="true"></span></p>
        <p>Noticias cortas para estar al día sin perder la tarde.</p>
        ${redesHTML()}
      </div>
      <nav class="pie-secciones" aria-label="Todas las secciones">
        <h2>Secciones</h2>
        <ul>${presentes().map((k) => `<li><button type="button" data-filtro="${k}" data-cat="${k}">${CATS[k]}</button></li>`).join('')}</ul>
      </nav>
      <div class="pie-como">
        <h2>Cómo trabajamos</h2>
        <p>Contamos cada noticia con nuestras palabras a partir de varias fuentes, y enlazamos siempre a la original. Cuando comparamos titulares de otros medios, los citamos tal cual, con su nombre y un enlace.</p>
        <p>No usamos fotos sin permiso: solo imágenes propias, con licencia libre o compradas, siempre con su autoría. No tomamos partido: la sección del 29N va en amarillo, el color de pulso, y no en los colores de ningún partido.</p>
        <p>Si nos equivocamos, lo corregimos y lo indicamos al final de la noticia.</p>
      </div>
      <div class="pie-base">
        <p>Actualizado el ${esc(actualizadoTxt())}</p>
        ${legales.length ? `<p class="legal">${legales.map((x) => `<a href="${enlace(x.url)}">${esc(x.nombre)}</a>`).join('')}</p>` : ''}
      </div>
    </footer>`;
  };

  // "24 de noviembre a las 19:15", a partir del campo "actualizado" del JSON
  function actualizadoTxt() {
    const f = new Date(estado.datos?.actualizado);
    if (Number.isNaN(f.getTime())) return '';
    const dia = f.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: ZONA });
    return `${dia} a las ${hora(f)}`;
  }

  const redesHTML = () => {
    const r = REDES.filter((x) => enlace(x.url));
    return r.length ? `<p class="redes">${r.map((x) => `<a href="${enlace(x.url)}" target="_blank" rel="noopener">${esc(x.nombre)}</a>`).join('')}</p>` : '';
  };

  // Banda del día: fecha, hora de actualización, cuenta atrás y momentos del día
  const diaHTML = () => `<section class="dia">
      <div class="dia-izq">
        <h1>${esc(fechaLarga())}</h1>
        <p class="lema">Lo importante de hoy, en corto y con fuentes. <span>Actualizado a las ${esc(hora(estado.datos?.actualizado || Date.now()))}</span></p>
        ${cuentaHTML()}
      </div>
      <div>${momentosHTML()}</div>
    </section>`;

  // PORTADA (modo Lista, sección "Portada"). Estructura de periódico:
  //   1. Cinta de última hora
  //   2. Banda del día
  //   3. Apertura: la noticia principal con su sumario + columna "Lo último"
  //   4. Un bloque por sección (pieza principal + titulares), en el orden de CATS
  //   5. Breves: las secciones que hoy solo tienen una noticia
  //   6. Pie
  function portadaHTML(lista) {
    const [apertura, ...resto] = lista;
    const porSeccion = Object.keys(CATS)
      .map((k) => [k, resto.filter((n) => cat(n) === k)])
      .filter(([, ns]) => ns.length);
    const bloques = porSeccion.filter(([, ns]) => ns.length > 1);
    const breves = porSeccion.filter(([, ns]) => ns.length === 1).map(([, ns]) => ns[0]);
    const c = cuenta();
    const extra29 = `<span class="bloque-extra">${esc(c.fuerte)} ${esc(c.resto)}</span>`;

    // Un único hueco de publicidad, a mitad de portada
    const html = bloques.map(([k, ns], i) =>
      bloqueHTML(k, ns, k === 'elecciones' ? extra29 : '') + (i === 1 ? publiHTML() : '')).join('');

    return `<div class="lista">
      ${cintaHTML()}
      ${diaHTML()}
      ${apertura ? `<div class="apertura">${tarjetaHTML(apertura, true)}${rioHTML()}</div>` : ''}
      ${html}
      ${bloques.length < 2 ? publiHTML() : ''}
      ${breves.length ? `<section class="bloque breves" aria-labelledby="b-breves">
        <div class="bloque-cab"><h2 id="b-breves">Breves</h2></div>
        <div class="items rejilla-items">${breves.map((n) => itemHTML(n, true)).join('')}</div>
      </section>` : ''}
      ${pieHTML()}
    </div>`;
  }

  // Una sección concreta (o Guardadas): cabecera grande + la primera destacada + el resto en rejilla
  function seccionHTML(lista) {
    const k = estado.cat;
    const titulo = k === 'guardadas' ? 'Guardadas' : CATS[k];
    const vacio = `<p class="vacio-txt" style="padding:0">${k === 'guardadas' ? 'Aún no has guardado nada. Toca «Guardar» en cualquier noticia y la tendrás aquí.' : 'Todavía no hay noticias en esta sección.'}</p>`;
    const [primera, ...resto] = lista;
    const items = resto.map((n, i) => tarjetaHTML(n, false)
      + ((i + 1) % PUBLI_CADA === 0 && i < resto.length - 1 ? publiHTML() : '')).join('');
    return `<div class="lista">
      <header class="seccion-cab" ${k !== 'guardadas' ? `data-cat="${k}"` : ''}>
        <h1>${esc(titulo)}</h1>
        <p>${lista.length} ${lista.length === 1 ? 'noticia' : 'noticias'}${k === 'elecciones' ? ` · ${esc(cuenta().fuerte)} ${esc(cuenta().resto)}` : ''}</p>
        <button type="button" class="ver-todo" data-filtro="todo">Volver a la portada</button>
      </header>
      ${primera ? `<div class="rejilla">${tarjetaHTML(primera, true)}${items}</div>` : vacio}
      ${pieHTML()}
    </div>`;
  }

  const listaHTML = (lista) => (estado.cat === 'todo' ? portadaHTML(lista) : seccionHTML(lista));

  function fichaHTML(n) {
    const c = cat(n);
    const puntos = (n.puntos || []).map((p) => `<li>${esc(p)}</li>`).join('');
    const titulares = (n.titulares || []).map((t) => `<li>
        <span class="medio">${esc(t.medio)}</span>
        <q>${esc(t.titular)}</q>
        ${enlace(t.url) ? `<a href="${enlace(t.url)}" target="_blank" rel="noopener">Leer en ${esc(t.medio)}</a>` : ''}
      </li>`).join('');
    const fuentes = (n.fuentes || []).map((f) =>
      `<li>${enlace(f.url) ? `<a href="${enlace(f.url)}" target="_blank" rel="noopener">${esc(f.medio)}</a>` : esc(f.medio)}</li>`).join('');
    const fecha = new Date(n.fecha).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: ZONA });
    // Hasta 3 noticias más de la misma sección, para seguir leyendo
    const relacionadas = recientes().filter((x) => cat(x) === c && x.id !== n.id).slice(0, 3).map((x) => itemHTML(x, false)).join('');
    return `<div class="f-tapa" data-cat="${c}">
        <span class="etq"><b>${CATS[c]}</b><span class="hora">${hace(n.fecha)}</span></span>
        <button type="button" class="cerrar" data-cerrar aria-label="Cerrar">${ICONO_X}</button>
      </div>
      <div class="f-txt">
        <h2 id="ficha-titulo">${esc(n.titular)}</h2>
        ${n.entradilla ? `<p class="entradilla">${esc(n.entradilla)}</p>` : ''}
        ${imagenHTML(n, 'foto')}
        ${puntos ? `<ul class="puntos">${puntos}</ul>` : ''}
        ${n.porque ? `<p class="porque"><b>Por qué te importa.</b> ${esc(n.porque)}</p>` : ''}
        ${n.correccion ? `<p class="correccion"><b>Corrección.</b> ${esc(n.correccion)}</p>` : ''}
        ${titulares ? `<h3>Cómo lo titulan</h3><ul class="titulares">${titulares}</ul>` : ''}
        ${fuentes ? `<h3>Fuentes</h3><ul class="lista-fuentes">${fuentes}</ul>` : ''}
        <p class="firma">Redactado por pulso a partir de las fuentes citadas. Publicado el ${esc(fecha)}.${n.ejemplo ? ' Contenido de ejemplo.' : ''}</p>
        <div class="acciones">
          ${botonGuardar(n)}
          ${botonCompartir(n)}
        </div>
        ${relacionadas ? `<h3>Más de ${CATS[c]}</h3><div class="items">${relacionadas}</div>` : ''}
      </div>`;
  }

  function menuHTML() {
    const secciones = presentes().map((k) =>
      `<li><button type="button" data-filtro="${k}" data-cat="${k}" aria-pressed="${estado.cat === k}">
        <i aria-hidden="true"></i>${CATS[k]}</button></li>`).join('');
    const c = cuenta();
    const opcion = (grupo, valor, texto, actual) =>
      `<button type="button" data-${grupo}="${valor}" aria-pressed="${actual === valor}">${texto}</button>`;
    const tema = document.documentElement.dataset.tema || 'auto';
    const letra = document.documentElement.dataset.letra || 'normal';
    return `<div class="menu-cab">
        <p class="logo-pie">pulso<span class="latido" aria-hidden="true"></span></p>
        <button type="button" class="cerrar" data-cerrar-menu aria-label="Cerrar el menú">${ICONO_X}</button>
      </div>
      <div class="buscar" role="search">
        <label for="buscar" class="oculto">Buscar noticias</label>
        <input type="search" id="buscar" placeholder="Buscar noticias" autocomplete="off" enterkeyhint="search">
        <div id="resultados" aria-live="polite"></div>
      </div>
      <div class="menu-modo">
        <p>Leer en modo</p>
        <div class="modo modo-menu" data-modo="${estado.modo}" role="group" aria-label="Cómo quieres leer">
          <button type="button" data-poner-modo="flash" aria-pressed="${estado.modo === 'flash'}">Flash</button>
          <button type="button" data-poner-modo="lista" aria-pressed="${estado.modo === 'lista'}">Lista</button>
        </div>
      </div>
      <nav aria-label="Ir a una sección">
        <ul class="menu-secciones">
          <li><button type="button" data-filtro="todo" aria-pressed="${estado.cat === 'todo'}"><i aria-hidden="true"></i>Portada</button></li>
          ${secciones}
          <li><button type="button" data-filtro="guardadas" aria-pressed="${estado.cat === 'guardadas'}"><i aria-hidden="true"></i>Guardadas</button></li>
        </ul>
      </nav>
      <button type="button" class="menu-29n" data-filtro="elecciones">
        <b>${esc(c.num)}</b><span><strong>${esc(c.txt)}</strong>Todo sobre las elecciones generales</span>
      </button>
      <section class="lectura" id="lectura" aria-labelledby="lectura-titulo">
        <h2 id="lectura-titulo">Lectura</h2>
        <div class="pref">
          <p id="pref-tema">Tema</p>
          <div class="seg" role="group" aria-labelledby="pref-tema">
            ${opcion('tema', 'auto', 'Auto', tema)}${opcion('tema', 'claro', 'Claro', tema)}${opcion('tema', 'oscuro', 'Oscuro', tema)}
          </div>
        </div>
        <div class="pref">
          <p id="pref-letra">Tamaño de letra</p>
          <div class="seg" role="group" aria-labelledby="pref-letra">
            ${opcion('letra', 'normal', '<span class="a1">A</span><span class="oculto">Normal</span>', letra)}${opcion('letra', 'grande', '<span class="a2">A</span><span class="oculto">Grande</span>', letra)}${opcion('letra', 'enorme', '<span class="a3">A</span><span class="oculto">Muy grande</span>', letra)}
          </div>
        </div>
      </section>
      <p class="menu-como">${COMO_TRABAJAMOS}</p>
      ${redesHTML()}`;
  }

  // ---------- Buscador ----------
  // Quita tildes y pasa a minúsculas, para que "economia" encuentre "Economía"
  const normal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function buscarNoticias(texto) {
    const palabras = normal(texto).split(/\s+/).filter(Boolean);
    const caja = $('#resultados');
    if (!caja) return;
    if (!palabras.length) { caja.innerHTML = ''; return; }
    const encontradas = recientes().filter((n) => {
      const todo = normal([n.titular, n.entradilla, ...(n.puntos || []), CATS[cat(n)]].join(' '));
      return palabras.every((p) => todo.includes(p));
    });
    caja.innerHTML = encontradas.length
      ? `<p class="res-num">${encontradas.length} ${encontradas.length === 1 ? 'resultado' : 'resultados'}</p><div class="items">${encontradas.slice(0, 8).map((n) => itemHTML(n, true)).join('')}</div>`
      : `<p class="res-num">No hay noticias con «${esc(texto)}». Prueba con otra palabra.</p>`;
  }

  // ---------- Preferencias de lectura ----------
  // Tema: auto (el del sistema), claro u oscuro. Letra: normal, grande o enorme.
  function ponerPref(clave, valor) {
    document.documentElement.dataset[clave] = valor;
    escribir(`pulso-${clave}`, valor);
    document.querySelectorAll(`[data-${clave}]`).forEach((b) => {
      if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', b.dataset[clave] === valor);
    });
    // Con otra letra o tema cambian los tamaños: reajustamos lo que se mide
    requestAnimationFrame(() => {
      if (estado.modo === 'flash') ajustarCartas();
      encajarPalabras();
      medirCabecera();
    });
  }

  // ---------- 5. Pintar ----------

  function pintarCabecera() {
    const c = cuenta();
    $('#cuenta').innerHTML = `<strong>${esc(c.fuerte)}</strong> <span>${esc(c.resto)}</span>`;
    $('#top-fecha').textContent = fechaLarga();
    $('#btn-flash').setAttribute('aria-pressed', estado.modo === 'flash');
    $('#btn-lista').setAttribute('aria-pressed', estado.modo === 'lista');
    $('#modo').dataset.modo = estado.modo;
    pintarChips();
  }

  // Línea que se desliza bajo la sección elegida
  // La pastilla de color se desliza hasta la sección elegida y toma su color
  function moverIndicador(animar = true) {
    const activo = chips.querySelector('.chip[aria-pressed=true]');
    const ind = chips.querySelector('.indicador');
    if (!activo || !ind) return;
    ind.style.transition = animar && !pocoMovimiento ? '' : 'none';
    ind.style.width = `${activo.offsetWidth}px`;
    ind.style.transform = `translateX(${activo.offsetLeft}px)`;
    const color = getComputedStyle(activo).getPropertyValue('--c').trim();
    if (color) ind.style.setProperty('--c', color); else ind.style.removeProperty('--c');
    ind.classList.toggle('con-color', !!color);   // Portada y Guardadas: pastilla gris suave
    // La sección elegida se centra en la fila (sin mover el resto de la página)
    const centro = activo.offsetLeft - (chips.clientWidth - activo.offsetWidth) / 2;
    chips.scrollTo({ left: Math.max(0, centro), behavior: animar ? suave : 'auto' });
    bordesChips();
  }

  // Difumina los bordes de la barra solo por el lado donde quedan secciones ocultas
  function bordesChips() {
    const resto = chips.scrollWidth - chips.clientWidth - chips.scrollLeft;
    chips.style.setProperty('--fi', chips.scrollLeft > 2 ? '32px' : '0px');
    chips.style.setProperty('--fd', resto > 2 ? '32px' : '0px');
  }
  chips.addEventListener('scroll', bordesChips, { passive: true });

  function pintar() {
    if (!estado.datos) return;
    pintarCabecera();
    const lista = visibles();
    main.className = estado.modo === 'flash' ? 'flash' : 'en-lista';
    main.innerHTML = estado.modo === 'flash'
      ? `<div class="progreso" aria-hidden="true"><i></i></div>${flashHTML(lista)}`
      : listaHTML(lista);
    main.scrollTop = 0;
    if (estado.modo === 'flash') { ajustarCartas(); observarSlides(); }
    encajarPalabras();
    logo.reiniciar();
  }

  // Cambiar de sección o de modo con una transición suave (si el navegador la tiene)
  function cambiar(fn) {
    if (document.startViewTransition && !pocoMovimiento) document.startViewTransition(fn);
    else fn();
  }

  // Si una tarjeta Flash no cabe en la pantalla (titular largo, móvil bajito…),
  // la "apretamos" por pasos hasta que quepa:
  //   1.º .apretada     → se oculta "Por qué te importa" (se sigue leyendo en la ficha)
  //   2.º .muy-apretada → titular y puntos un poco más pequeños
  function ajustarCartas() {
    const noCabe = (c) => c.scrollHeight > c.clientHeight + 1;
    main.querySelectorAll('.carta[data-cat]').forEach((c) => {
      c.classList.remove('apretada', 'muy-apretada', 'sin-minimo', 'sin-foto');
      if (noCabe(c)) c.classList.add('apretada');
      if (noCabe(c)) c.classList.add('muy-apretada');
      if (noCabe(c)) c.classList.add('sin-minimo');   // último recurso: la foto cede su altura mínima
      // Si la foto se queda en una tira estrecha (móviles muy bajos), mejor no mostrarla
      const foto = c.querySelector('.foto');
      c.classList.toggle('sin-foto', !!foto && foto.clientHeight < 72);
    });
  }

  // La palabra gigante se ajusta a su hueco para verse ENTERA, nunca cortada a media letra.
  // Medimos lo que ocupa a 100 px y calculamos el tamaño que llena el hueco a lo ancho o a lo alto.
  function encajarPalabras() {
    main.querySelectorAll('.gigante').forEach((g) => {
      const caja = g.parentElement;
      g.style.fontSize = '100px';
      const ancho = g.offsetWidth || 1;
      const porAncho = (caja.clientWidth / ancho) * 100;
      const porAlto = caja.clientHeight / 0.8;          // line-height 0.8
      const tam = Math.min(porAncho, porAlto, 260);
      g.style.fontSize = `${Math.floor(tam)}px`;
      g.classList.toggle('oculta', tam < 44);            // si quedaría diminuta, mejor no mostrarla
    });
  }

  // Al girar el móvil o cambiar el tamaño de la ventana, se vuelve a ajustar
  let esperaResize;
  addEventListener('resize', () => {
    clearTimeout(esperaResize);
    esperaResize = setTimeout(() => {
      if (estado.modo === 'flash') ajustarCartas();
      encajarPalabras();
      moverIndicador(false);
      medirCabecera();
    }, 150);
  });

  // La cabecera flota encima del contenido (por el efecto cristal).
  // Guardamos su altura en --cab para que el contenido empiece justo debajo.
  function medirCabecera() {
    document.documentElement.style.setProperty('--cab', `${top.offsetHeight}px`);
  }
  if ('ResizeObserver' in window) new ResizeObserver(medirCabecera).observe(top);
  medirCabecera();

  // Detecta qué tarjeta está en pantalla: le pone la clase .activa (lanza su animación)
  // y mueve la barra de progreso.
  let observador;
  function observarSlides() {
    observador?.disconnect();
    const slides = [...main.querySelectorAll('.slide')];
    const barra = main.querySelector('.progreso i');
    observador = new IntersectionObserver((entradas) => {
      entradas.forEach((en) => {
        if (!en.isIntersecting) { en.target.classList.remove('activa'); return; }
        en.target.classList.add('activa');
        const i = slides.indexOf(en.target);
        if (barra) barra.style.setProperty('--p', slides.length > 1 ? i / (slides.length - 1) : 1);
      });
    }, { root: main, threshold: 0.6 });
    slides.forEach((s) => observador.observe(s));
  }

  // Cambiar de pestaña de momento sin repintar todo (así no se pierde la posición)
  function pintarMomentos() {
    document.querySelectorAll('.momentos').forEach((el) => { el.outerHTML = momentosHTML(); });
    document.querySelectorAll('.momentos').forEach((el) => el.classList.add('aparece'));
  }

  // ---------- 6. El logo interactivo ----------
  // Al bajar, "pulso" se pliega en "p•": las letras u-l-s-o se encogen y se apagan en ola,
  // de derecha a izquierda, y el punto amarillo se desliza hasta la p y da un latido al llegar.
  // Al volver arriba, las letras vuelven a crecer de izquierda a derecha.
  // Cada letra tiene su propio "muelle" (física sencilla): el movimiento es orgánico
  // y, si cambias de dirección a mitad de camino, sigue fluido desde donde estaba.
  const logo = (() => {
    const el = $('#logo');
    const letras = [...el.querySelectorAll('.lt')].slice(1);   // u, l, s, o (la p se queda)
    let piezas = [];
    let objetivo = 0;              // 0 = logo completo, 1 = plegado
    let corriendo = false;
    let ultimo = 0;
    let aterrizado = false;

    function medir() {
      // Medimos con el logo desplegado
      el.style.minWidth = '';
      letras.forEach((x) => { x.style.width = ''; x.style.opacity = ''; x.style.scale = ''; x.style.translate = ''; });
      // El hueco del logo no cambia de tamaño: así la fecha y la cuenta atrás no se mueven
      el.style.minWidth = `${el.getBoundingClientRect().width}px`;
      piezas = letras.map((x, i) => {
        const k = 300 + i * 30;                            // rigidez: cada letra algo distinta
        return { x, ancho: x.getBoundingClientRect().width, p: 0, v: 0, k, c: 2 * Math.sqrt(k) * 0.92, espera: 0 };
      });
    }

    // p = 0 → letra entera; p = 1 → letra plegada (ancho 0, invisible)
    function dibujar() {
      for (const q of piezas) {
        const t = Math.min(Math.max(q.p, 0), 1);
        // El ancho cae más deprisa que la opacidad: la letra se ve encogerse hasta el final
        // y no queda un hueco vacío entre la p y el punto
        q.x.style.width = `${(q.ancho * (1 - t) ** 2).toFixed(2)}px`;
        q.x.style.opacity = (1 - t).toFixed(3);
        q.x.style.scale = (1 - 0.35 * t).toFixed(3);
        q.x.style.translate = `0 ${(-0.12 * t).toFixed(3)}em`;
      }
    }

    function fotograma(ahora) {
      const dt = Math.min((ahora - ultimo) / 1000, 0.032);   // si la pestaña se congela, sin saltos
      ultimo = ahora;
      let activo = false;
      for (const q of piezas) {
        if (ahora < q.espera) { activo = true; continue; }
        q.v += (q.k * (objetivo - q.p) - q.c * q.v) * dt;
        q.p += q.v * dt;
        if (Math.abs(objetivo - q.p) > 0.001 || Math.abs(q.v) > 0.001) activo = true;
      }
      dibujar();
      // Cuando la última letra casi ha desaparecido, el punto "aterriza" con un latido
      if (objetivo === 1 && !aterrizado && piezas.every((q) => q.p > 0.85)) { aterrizado = true; latir(); }
      if (activo) requestAnimationFrame(fotograma);
      else corriendo = false;
    }

    function ir(destino) {
      if (destino === objetivo) return;
      objetivo = destino;
      aterrizado = false;
      el.classList.toggle('plegado', destino === 1);
      if (pocoMovimiento) { piezas.forEach((q) => { q.p = destino; q.v = 0; }); dibujar(); return; }
      const ahora = performance.now();
      // Efecto ola: al plegar, primero la "o"; al desplegar, primero la "u"
      piezas.forEach((q, i) => { q.espera = ahora + (destino ? piezas.length - 1 - i : i) * 38; });
      if (!corriendo) { corriendo = true; ultimo = ahora; requestAnimationFrame(fotograma); }
    }

    // Latido fuerte del punto (al aterrizar y al saludar)
    function latir() {
      if (pocoMovimiento) return;
      el.classList.remove('late');
      void el.offsetWidth;            // truco para reiniciar una animación CSS
      el.classList.add('late');
    }

    // Dos umbrales (70 y 24 px) evitan parpadeos cuando el scroll está justo en el límite
    let esperando = false;
    main.addEventListener('scroll', () => {
      if (esperando) return;
      esperando = true;
      requestAnimationFrame(() => {
        esperando = false;
        const y = main.scrollTop;
        ir(objetivo ? (y >= 24 ? 1 : 0) : (y > 70 ? 1 : 0));
        top.classList.toggle('con-sombra', y > 4);
      });
    }, { passive: true });

    // Al pasar el ratón o tocarlo, las letras dan un pequeño salto en ola y el punto late fuerte
    function saludar() {
      if (pocoMovimiento) return;
      el.classList.remove('saluda');
      void el.offsetWidth;
      el.classList.add('saluda');
      latir();
    }
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') saludar(); });
    el.addEventListener('animationend', (e) => {
      if (e.animationName === 'latido-fuerte') el.classList.remove('late');
      if (e.animationName === 'salto') el.classList.remove('saluda');
    });

    return {
      reiniciar() { objetivo = 0; aterrizado = false; el.classList.remove('plegado'); medir(); dibujar(); top.classList.remove('con-sombra'); },
      medir,
      saludar
    };
  })();
  document.fonts?.ready.then(() => logo.reiniciar());

  // ---------- 7. Efectos de puntero en la Lista ----------
  // La tarjeta bajo el ratón recibe un brillo que sigue al cursor (variables --mx y --my)
  main.addEventListener('pointermove', (e) => {
    const t = e.target.closest('.tarjeta');
    if (!t || e.pointerType !== 'mouse') return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', `${e.clientX - r.left}px`);
    t.style.setProperty('--my', `${e.clientY - r.top}px`);
  });

  // ---------- 8. Abrir, guardar, compartir ----------

  // Las fichas usan el "hash" de la dirección: pulso.es/#recta-final-29n abre esa noticia.
  // Así cualquier enlace compartido lleva directo a la noticia.
  function abrirDesdeHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const n = id && buscar(id);
    if (!n) { cerrarFicha(); return; }
    if (menu.open) menu.close();
    ficha.classList.remove('saliendo');
    fichaCuerpo.innerHTML = fichaHTML(n);
    if (!ficha.open) {
      ficha.showModal();
      ficha.classList.toggle('sin-anillo', !conTeclado);
      ficha.querySelector('.cerrar').focus({ focusVisible: conTeclado });
    }
    ficha.scrollTop = 0;
  }
  function abrir(id) {
    if (location.hash === `#${id}`) abrirDesdeHash();
    else location.hash = id;
  }
  function quitarHash() {
    if (!location.hash) return;
    try { history.replaceState(null, '', location.pathname + location.search); }
    catch (e) { location.hash = ''; }
  }

  function guardar(id, boton) {
    if (estado.guardadas.has(id)) estado.guardadas.delete(id);
    else estado.guardadas.add(id);
    escribir('pulso-guardadas', JSON.stringify([...estado.guardadas]));
    const g = estado.guardadas.has(id);
    // Actualiza todos los botones de esa noticia (tarjeta y ficha) sin repintar la página
    document.querySelectorAll(`[data-guardar="${CSS.escape(id)}"]`).forEach((b) => {
      b.setAttribute('aria-pressed', g);
      if ('icono' in b.dataset) b.setAttribute('aria-label', g ? 'Guardada' : 'Guardar');
      else b.innerHTML = `${ICONO_GUARDAR}<span>${g ? 'Guardada' : 'Guardar'}</span>`;
    });
    // Pequeño "pop" en el botón que se ha pulsado
    boton?.classList.remove('pop');
    void boton?.offsetWidth;
    if (g) boton?.classList.add('pop');
    pintarChips(false);
    avisar(g ? 'Guardada' : 'Quitada de guardadas');
  }

  async function compartir(id) {
    const n = buscar(id);
    if (!n) return;
    const url = `${location.href.split('#')[0]}#${id}`;
    // En el móvil abre el menú nativo de compartir (WhatsApp, Instagram…)
    if (navigator.share) {
      try { await navigator.share({ title: n.titular, text: n.titular, url }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    // Si no hay menú nativo, copia el enlace
    try { await navigator.clipboard.writeText(url); avisar('Enlace copiado'); }
    catch (e) { avisar('No se ha podido copiar. Copia la dirección del navegador.'); }
  }

  let temporizador;
  function avisar(texto, accion) {
    aviso.innerHTML = `<span>${esc(texto)}</span>${accion ? `<button type="button" data-actualizar>${esc(accion)}</button>` : ''}`;
    aviso.classList.add('ver');
    clearTimeout(temporizador);
    if (!accion) temporizador = setTimeout(() => aviso.classList.remove('ver'), 2400);
  }

  // donde: 'buscar' pone el cursor en el buscador; 'lectura' baja hasta las preferencias
  function abrirMenu(donde) {
    $('#menu-cuerpo').innerHTML = menuHTML();
    menu.showModal();
    // El anillo de foco solo se ve si se abrió con el teclado (con el dedo o el ratón molesta)
    const anillo = { focusVisible: conTeclado };
    menu.classList.toggle('sin-anillo', !conTeclado);
    if (donde === 'buscar') $('#buscar').focus();
    else if (donde === 'lectura') {
      const l = $('#lectura');
      l.scrollIntoView({ block: 'center' });
      l.querySelector('button[aria-pressed=true]')?.focus(anillo);
    } else menu.querySelector('.cerrar').focus(anillo);
  }
  // El buscador filtra mientras escribes
  menu.addEventListener('input', (e) => { if (e.target.id === 'buscar') buscarNoticias(e.target.value); });
  // Cerrar la ficha con su animación de salida (baja y se desvanece)
  function cerrarFicha() {
    if (!ficha.open || ficha.classList.contains('saliendo')) return;
    if (pocoMovimiento) { ficha.close(); return; }
    ficha.classList.add('saliendo');
    setTimeout(() => { ficha.classList.remove('saliendo'); ficha.style.translate = ''; ficha.close(); }, 250);
  }
  // Cerrar el menú con su animación de salida
  function cerrarMenu() {
    if (!menu.open) return;
    if (pocoMovimiento) { menu.close(); return; }
    menu.classList.add('saliendo');
    setTimeout(() => { menu.classList.remove('saliendo'); menu.style.translate = ''; menu.close(); }, 300);
  }

  function ponerModo(m) {
    estado.modo = m;
    escribirSesion('pulso-modo', m);
    cambiar(pintar);
  }

  // Deslizar con el dedo para cerrar: el menú hacia la izquierda, la ficha (en el móvil) hacia abajo.
  // El panel sigue al dedo; si lo sueltas lejos o con impulso se cierra, si no vuelve a su sitio.
  function arrastrable(panel, eje, cerrar, zona) {
    let x0 = null; let y0 = 0; let d = 0; let t0 = 0; let decidido = false;
    panel.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || (zona && !e.target.closest(zona))) return;
      x0 = e.clientX; y0 = e.clientY; d = 0; t0 = performance.now(); decidido = false;
    });
    panel.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      // Esperamos a que el gesto tenga una dirección clara (8 px).
      // Si va en el otro eje (p. ej. hacer scroll en el menú), no lo tocamos.
      if (!decidido) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        const enSuEje = eje === 'x' ? Math.abs(dx) > Math.abs(dy) : Math.abs(dy) > Math.abs(dx);
        if (!enSuEje) { x0 = null; return; }
        decidido = true;
      }
      d = eje === 'x' ? Math.min(0, dx) : Math.max(0, dy);
      panel.style.transition = 'none';
      panel.style.translate = eje === 'x' ? `${d}px 0` : `0 ${d}px`;
    });
    const soltar = () => {
      if (x0 === null) return;
      x0 = null;
      panel.style.transition = '';
      const velocidad = Math.abs(d) / Math.max(performance.now() - t0, 1);   // px por ms
      if (Math.abs(d) > 90 || (Math.abs(d) > 20 && velocidad > 0.5)) cerrar();
      else panel.style.translate = '';
    };
    panel.addEventListener('pointerup', soltar);
    panel.addEventListener('pointercancel', soltar);
  }
  arrastrable(menu, 'x', () => cerrarMenu());
  arrastrable(ficha, 'y', () => cerrarFicha(), '.f-tapa');

  // ¿El lector está usando el teclado? (para decidir si mostramos el anillo de foco al abrir paneles)
  let conTeclado = false;
  addEventListener('keydown', () => {
    conTeclado = true;
    menu.classList.remove('sin-anillo');
    ficha.classList.remove('sin-anillo');
  }, true);
  addEventListener('pointerdown', () => { conTeclado = false; }, true);

  // ---------- 9. Eventos (uno solo para toda la página) ----------

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    const d = t.dataset;

    if (t.id === 'btn-flash' || t.id === 'btn-lista') {
      ponerModo(t.id === 'btn-flash' ? 'flash' : 'lista');
    } else if (d.ponerModo) {
      cerrarMenu();
      ponerModo(d.ponerModo);
    } else if (t.id === 'btn-menu') {
      abrirMenu();
    } else if (d.abrirMenu) {
      abrirMenu(d.abrirMenu);
    } else if (d.tema && t.tagName === 'BUTTON') {
      ponerPref('tema', d.tema);
    } else if (d.letra && t.tagName === 'BUTTON') {
      ponerPref('letra', d.letra);
    } else if ('saltar' in d) {
      e.preventDefault();
      main.focus();
    } else if ('cerrarMenu' in d) {
      cerrarMenu();
    } else if (d.filtro) {
      if (menu.open) cerrarMenu();
      estado.cat = d.filtro;
      cambiar(pintar);
    } else if (d.momento) {
      estado.momento = d.momento;
      pintarMomentos();
    } else if (d.ir) {
      const slide = document.getElementById(`s-${d.ir}`);
      if (estado.modo === 'flash' && slide) slide.scrollIntoView({ behavior: suave });
      else abrir(d.ir);
    } else if (d.abrir) {
      abrir(d.abrir);
    } else if (d.guardar) {
      guardar(d.guardar, t);
    } else if (d.compartir) {
      compartir(d.compartir);
    } else if ('cerrar' in d) {
      cerrarFicha();
    } else if ('arriba' in d) {
      main.scrollTo({ top: 0, behavior: suave });
    } else if ('actualizar' in d) {
      aviso.classList.remove('ver');
      cargar();
    } else if ('reintentar' in d) {
      cargar();
    } else if (t.id === 'logo') {
      e.preventDefault();
      logo.saludar();
      if (estado.cat !== 'todo') { estado.cat = 'todo'; cambiar(pintar); }
      else main.scrollTo({ top: 0, behavior: suave });
    }
  });

  // Tocar fuera de la ficha o del menú los cierra
  ficha.addEventListener('click', (e) => { if (e.target === ficha) cerrarFicha(); });
  ficha.addEventListener('cancel', (e) => { e.preventDefault(); cerrarFicha(); });
  menu.addEventListener('click', (e) => { if (e.target === menu) cerrarMenu(); });
  menu.addEventListener('cancel', (e) => { e.preventDefault(); cerrarMenu(); });
  ficha.addEventListener('close', quitarHash);
  addEventListener('hashchange', abrirDesdeHash);

  // Teclado en el ordenador: flechas o j/k pasan de tarjeta en el modo Flash
  document.addEventListener('keydown', (e) => {
    if (estado.modo !== 'flash' || ficha.open || menu.open || e.target.closest('input, textarea')) return;
    const abajo = ['ArrowDown', 'PageDown', 'j'].includes(e.key);
    const arriba = ['ArrowUp', 'PageUp', 'k'].includes(e.key);
    if (!abajo && !arriba) return;
    e.preventDefault();
    const alto = main.querySelector('.slide')?.offsetHeight || main.clientHeight;
    main.scrollBy({ top: (abajo ? 1 : -1) * alto, behavior: suave });
  });

  // ---------- 10. Cargar datos ----------

  async function cargar() {
    try {
      const r = await fetch('data/noticias.json', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const primera = !estado.datos;
      estado.datos = await r.json();
      pintar();
      // Primera carga: la página entra en una secuencia escalonada (una sola vez)
      if (primera && !pocoMovimiento) {
        main.classList.add('entrada');
        setTimeout(() => main.classList.remove('entrada'), 1000);
      }
      abrirDesdeHash();
      // Cuando termina de llegar la tipografía, los textos cambian de tamaño: reajustamos
      document.fonts?.ready.then(() => {
        if (estado.modo === 'flash') ajustarCartas();
        encajarPalabras();
        moverIndicador(false);
        medirCabecera();
      });
    } catch (err) {
      main.className = '';
      main.innerHTML = `<div class="lista"><div class="vacio-txt" style="padding:0">
        <p><b>No se han podido cargar las noticias.</b></p>
        <p>Si has abierto el archivo con doble clic, el navegador no deja leer el JSON. Ábrelo con un servidor local: en Terminal, entra en la carpeta del proyecto y escribe <code>python3 -m http.server</code>, luego visita <code>http://localhost:8000</code>.</p>
        <p style="margin-top:12px"><button type="button" class="btn" data-reintentar>Reintentar</button></p>
      </div></div>`;
    }
  }

  // Cada 5 minutos comprueba si el agente ha subido noticias nuevas.
  // No repinta solo (perderías por dónde ibas): te avisa y tú decides.
  async function comprobarNovedades() {
    if (document.hidden || !estado.datos) return;
    try {
      const r = await fetch('data/noticias.json', { cache: 'no-store' });
      const nuevo = await r.json();
      if (nuevo.actualizado && nuevo.actualizado !== estado.datos.actualizado) avisar('Hay noticias nuevas', 'Actualizar');
    } catch (e) { /* sin conexión: ya lo intentaremos luego */ }
  }

  setInterval(comprobarNovedades, CADA_CUANTO);
  setInterval(() => { if (estado.datos) pintarCabecera(); }, 60 * 1000);
  cargar();
}
