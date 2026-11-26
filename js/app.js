// =====================================================================
//  pulso — app.js
//  Lee las noticias de /api/noticias (o, si no hay servidor, de data/noticias.json)
//  y pinta la web en dos modos:
//    · Flash: una noticia por pantalla, deslizando (como stories).
//    · Lista: portada con última hora, la noticia destacada, lo último y la rejilla.
//  Las noticias se gestionan en el panel (/admin); este archivo no se toca.
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
  const ZONA = 'Europe/Madrid';
  const CADA_CUANTO = 5 * 60 * 1000;      // cada 5 minutos mira si hay noticias nuevas
  const PUBLI_CADA = 6;                   // en la lista, un espacio publicitario cada 6 noticias
  // Redes donde publicamos los titulares. Pon aquí la dirección de cada perfil cuando exista.
  const REDES = [
    { nombre: 'Bluesky', usuario: '@pulsomedio', url: 'https://bsky.app/profile/pulsomedio.bsky.social',
      icono: 'M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z' },
    { nombre: 'X', usuario: '@pulsomedio', url: 'https://x.com/pulsomedio',
      icono: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' }
  ];
  // Páginas legales que todo medio en España debe tener (aviso legal, privacidad, cookies)
  // y una vía de contacto. Pon la dirección cuando existan; mientras estén vacías no se muestran.
  const LEGAL = [
    { nombre: 'Aviso legal', url: 'aviso-legal.html' },
    { nombre: 'Privacidad', url: 'privacidad.html' },
    { nombre: 'Cookies', url: 'cookies.html' },
    { nombre: 'Contacto', url: 'mailto:hola@pulso.com.es' }
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
  // Enlaces de la propia web (páginas legales) y de correo: solo para lo que escribimos nosotros en LEGAL
  const enlacePropio = (u) => (/^(mailto:[^\s"<>]+|[\w-]+\.html)$/i.test(u || '') ? esc(u) : '');
  // Imágenes: enlace https o ruta propia tipo img/foto.jpg
  const rutaImg = (u) => (/^https:\/\//i.test(u || '') || /^[\w\-./]+$/.test(u || '') ? esc(u) : '');
  const cat = (n) => (CATS[n.categoria] ? n.categoria : 'espana');

  const hora = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: ZONA });
  // Cuándo es una noticia, sin el «hace 17 h» que la hace parecer vieja:
  // menos de 3 horas → "hace 20 min" o "hace 2 h"; de hoy → "7:00"; de ayer → "ayer, 21:00"; antes → "24 nov".
  // Si la fecha es futura, muestra la hora.
  function hace(iso) {
    const t = new Date(iso);
    const min = Math.round((Date.now() - t) / 60000);
    if (Number.isNaN(min)) return '';
    if (min < 0) return hora(iso);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    if (min < 180) return `hace ${Math.floor(min / 60)} h`;
    const dia = (d) => d.toLocaleDateString('en-CA', { timeZone: ZONA });
    if (dia(t) === dia(new Date())) return hora(iso);
    if (dia(t) === dia(new Date(Date.now() - 864e5))) return `ayer, ${hora(iso)}`;
    return t.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: ZONA });
  }
  // Lo que se enseña junto a la sección: la hora de publicación o la de la última actualización
  const cuando = (n) => (n.actualizada ? `actualizada ${hace(n.actualizada)}` : hace(n.fecha));
  const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA }); // "2026-11-24"
  const fechaLarga = () => new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA }).replace(',', '');
  function momentoActual() {
    const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: ZONA }));
    return h < 14 ? 'manana' : h < 20 ? 'tarde' : 'noche';
  }

  // Cuenta atrás de la cabecera ("cita"): se edita en el panel (Portada) y sirve para
  // unas elecciones, un partido o lo que toque. Sin cita, no aparece nada.
  //   num / txt: para el bloque amarillo (número grande + texto)
  //   fuerte / resto: para la cabecera, más corto ("5 días" + "para el 29N")
  function cuenta() {
    const ci = estado.datos?.cita;
    if (!ci?.fecha) return null;
    const dias = Math.round((Date.parse(ci.fecha) - Date.parse(hoyISO())) / 86400000);
    const base = { seccion: CATS[ci.seccion] ? ci.seccion : '', detalle: ci.detalle || '' };
    if (dias > 1) return { ...base, num: dias, txt: `días ${ci.antes}`, fuerte: `${dias} días`, resto: ci.antes };
    if (dias === 1) return { ...base, num: 1, txt: `día ${ci.antes}`, fuerte: '1 día', resto: ci.antes };
    if (dias === 0) return { ...base, num: 'Hoy', txt: ci.hoy || ci.titulo, fuerte: 'Hoy', resto: ci.hoy || ci.titulo };
    return { ...base, num: ci.titulo, txt: ci.despues || ci.titulo, fuerte: ci.despues || ci.titulo, resto: '' };
  }
  // Qué edición se está leyendo, según la hora de Madrid (sale a las 7:00, 14:00 y 21:00)
  function edicionActual() {
    const h = Number(new Date().toLocaleString('es-ES', { hour: 'numeric', hour12: false, timeZone: ZONA }));
    return h >= 7 && h < 14 ? 'de la mañana' : h >= 14 && h < 21 ? 'de la tarde' : 'de la noche';
  }
  // Fecha con jerarquía: "Jueves 26" fuerte, "de noviembre" suave
  function fechaHTML() {
    const ahora = new Date();
    const dia = ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', timeZone: ZONA }).replace(',', '');
    const mes = ahora.toLocaleDateString('es-ES', { month: 'long', timeZone: ZONA });
    return `<b>${esc(dia)}</b><span>de ${esc(mes)}</span>`;
  }

  // Iconos (SVG en línea: heredan el color del texto)
  const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const ICONO_ABAJO = svg('<path d="M6 9l6 6 6-6"/>');
  const ICONO_X = svg('<path d="M6 6l12 12M18 6L6 18"/>');
  const ICONO_GUARDAR = svg('<path d="M6 3.5h12v17l-6-4.2-6 4.2z"/>');
  const ICONO_CUENTA = svg('<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1.2-3.8 4.2-5.6 7.5-5.6s6.3 1.8 7.5 5.6"/>');
  const ICONO_COMENTAR = svg('<path d="M4 5.5h16v10.5h-9.5L6 20v-4H4z"/>');
  const ICONO_COMPARTIR = svg('<path d="M12 3v12M7 8l5-5 5 5M5 13v6.5h14V13"/>');
  const ICONO_FUENTES = svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>');
  const ICONO_COMPARA = svg('<path d="M4 6h16M4 12h10M4 18h13"/>');

  // ---------- 3. Estado de la página ----------

  const estado = {
    datos: null,
    sueltas: {}, // noticias antiguas abiertas desde un enlace compartido
    cat: 'todo',
    // Cada visita empieza en el modo de su dispositivo: Flash en el móvil, Lista en el ordenador.
    // Si el lector lo cambia, se respeta hasta que cierre la pestaña.
    modo: leerSesion('pulso-modo') || (innerWidth < 900 ? 'flash' : 'lista'),
    momento: momentoActual(),
    guardadas: new Set((() => { try { return JSON.parse(leer('pulso-guardadas') || '[]'); } catch (e) { return []; } })()),
    // Cuenta de lector: mientras se comprueba, damos por buena la del último día (así no parpadea el límite)
    lector: leer('pulso-lector') ? { email: leer('pulso-lector') } : null
  };

  const main = $('#main');
  const top = $('#top');
  const chips = $('#chips');
  const ficha = $('#ficha');
  const fichaCuerpo = $('#ficha-cuerpo');
  const menu = $('#menu');
  const aviso = $('#aviso');

  // Todas las noticias: la destacada primero y después en el orden que manda el servidor
  // (importancia y edad, o el fijado a mano en el panel); si no hay orden, de más nueva a más antigua
  const ordenadas = () => [...(estado.datos?.noticias || [])].sort((a, b) =>
    (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0)
    || (a.orden ?? Infinity) - (b.orden ?? Infinity)
    || new Date(b.fecha) - new Date(a.fecha));
  // Las de la sección elegida
  function visibles() {
    const todas = ordenadas();
    if (estado.cat === 'todo') return todas;
    if (estado.cat === 'guardadas') return [...estado.guardadas].reverse().map(buscar).filter(Boolean);
    return todas.filter((n) => cat(n) === estado.cat);
  }
  // Solo por fecha (para "Última hora" y "Lo último")
  const ultimaVez = (n) => new Date(n.actualizada || n.fecha);
  const recientes = () => [...(estado.datos?.noticias || [])].sort((a, b) => ultimaVez(b) - ultimaVez(a));
  const buscar = (id) => (estado.datos?.noticias || []).find((n) => n.id === id) || estado.sueltas[id];
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
    if (!c) return '';
    return `<button type="button" class="dia-num" ${c.seccion ? `data-filtro="${c.seccion}"` : 'tabindex="-1"'}>
      <b>${esc(c.num)}</b>
      <span><strong>${esc(c.txt)}</strong>${esc(c.detalle)}</span>
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
  // Comentar: lleva a los comentarios de la noticia (con cuántos hay)
  const botonComentar = (n, soloIcono) => {
    const k = n.comentarios || 0;
    return soloIcono
      ? `<button type="button" class="btn icono btn-com" data-comentar="${esc(n.id)}" aria-label="Comentar${k ? ` (${k} comentarios)` : ''}">${ICONO_COMENTAR}${k ? `<b class="com-num">${k > 99 ? '99+' : k}</b>` : ''}</button>`
      : `<button type="button" class="btn" data-comentar="${esc(n.id)}">${ICONO_COMENTAR}<span>Comentar${k ? ` (${k})` : ''}</span></button>`;
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
          <span class="etq"><b>${CATS[c]}</b><span class="hora">${cuando(n)}${n.ejemplo ? ', ejemplo' : ''}</span></span>
          <span class="cont">${i + 1} de ${total}</span>
        </div>
        ${imagenHTML(n, 'foto') || `<div class="hueco">${gigante(c)}</div>`}
        <div class="cuerpo">
          <h2>${esc(n.titular)}</h2>
          ${bloqueada(n) ? muroHTML(n) : `${puntos ? `<ul class="puntos">${puntos}</ul>` : ''}
          ${n.porque ? `<p class="porque"><b>Por qué te importa.</b> ${esc(n.porque)}</p>` : ''}`}
        </div>
        <div class="pie-carta">
          ${n.fuentes?.length ? `<p class="fuentes">Con información de ${fuentesHTML(n)}</p>` : ''}
          <div class="acciones">
            <button type="button" class="btn lleno" data-abrir="${esc(n.id)}">${n.titulares?.length ? 'Cómo lo titulan' : 'Leer más'}</button>
            ${botonComentar(n, true)}
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
          <p class="como">${COMO_TRABAJAMOS}</p>
        </div>
        <div class="acciones"><button type="button" class="btn" data-arriba>Volver al principio</button></div>
      </div>
    </section>` : '';

    // Última pantalla: el pie (quiénes somos, redes, legal), como en cualquier web
    const pie = `<section class="slide" aria-label="Sobre pulso">
      <footer class="carta pie-flash">
        <div>
          <p class="logo-pie notranslate" translate="no">pulso<span class="latido" aria-hidden="true"></span></p>
          <p class="pie-lema">Lo importante del día, en corto y con fuentes.</p>
        </div>
        <p class="como">${COMO_TRABAJAMOS}</p>
        ${redesHTML()}
        <nav class="pie-flash-secciones" aria-label="Secciones">
          ${presentes().map((k) => `<button type="button" data-filtro="${k}" data-cat="${k}"><i aria-hidden="true"></i>${CATS[k]}</button>`).join('')}
        </nav>
        <div class="pie-flash-base">
          ${legalHTML('legal')}
          <p class="pie-copy">© ${new Date().getFullYear()} pulso · <a href="mailto:hola@pulso.com.es">hola@pulso.com.es</a></p>
        </div>
      </footer>
    </section>`;
    return portada + lista.map((n, i) => cartaHTML(n, i, lista.length)).join('') + vacio + final + (lista.length ? pie : '');
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
        <span class="etq"><b>${CATS[c]}</b><span class="hora">${cuando(n)}</span></span>
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
      <p class="item-meta">${conSeccion ? `<b>${CATS[c]}</b>` : ''}<time datetime="${esc(n.actualizada || n.fecha)}">${cuando(n)}</time></p>
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

  // Publicidad: los banners se gestionan en el panel (Publicidad). De momento solo se ven en
  // el ordenador (el CSS los oculta en pantallas pequeñas). Si hay varios para el mismo hueco,
  // sale uno al azar. Siempre llevan la etiqueta «Publicidad»: la ley pide que se distinga.
  const enlaceBanner = (u) => (/^(https:\/\/\S+|mailto:\S+)$/i.test(u || '') ? esc(u) : '');
  function publiHTML(hueco) {
    const posibles = (estado.datos?.banners || []).filter((b) => b.hueco === hueco);
    if (!posibles.length) return '';
    const b = posibles[Math.floor(Math.random() * posibles.length)];
    const url = enlaceBanner(b.enlace);
    const fuera = url.startsWith('https') ? ' target="_blank" rel="sponsored noopener"' : '';
    if (b.tipo === 'imagen' && rutaImg(b.imagen) && url) {
      return `<aside class="publi publi-img" aria-label="Publicidad">
        <span class="publi-etq">Publicidad${b.anunciante ? ` · ${esc(b.anunciante)}` : ''}</span>
        <a href="${url}"${fuera}><img src="${rutaImg(b.imagen)}" alt="${esc(b.alt)}" loading="lazy"></a>
      </aside>`;
    }
    return `<aside class="publi publi-casa" aria-label="Publicidad">
        <span class="publi-etq">Publicidad${b.anunciante ? ` · ${esc(b.anunciante)}` : ''}</span>
        <div class="publi-txt">
          <p class="publi-tit">${esc(b.titulo)}</p>
          ${b.texto ? `<p>${esc(b.texto)}</p>` : ''}
        </div>
        ${url && b.boton ? `<a class="btn publi-btn" href="${url}"${fuera}>${esc(b.boton)}</a>` : ''}
      </aside>`;
  }

  // Versión corta de "Cómo trabajamos" para la última pantalla del modo Flash y el menú
  const COMO_TRABAJAMOS = '<b>Cómo trabajamos.</b> Leemos varios medios, te lo contamos con nuestras palabras y siempre te dejamos el enlace al original, para que lo compruebes tú.';

  // Pie: marca, secciones, cómo trabajamos y (si están configuradas) redes y páginas legales
  const pieHTML = () => {
    return `<footer class="pie" id="como-trabajamos">
      <div class="pie-marca">
        <p class="logo-pie notranslate" translate="no">pulso<span class="latido" aria-hidden="true"></span></p>
        <p>Noticias cortas para estar al día sin perder la tarde.</p>
        ${redesHTML()}
      </div>
      <nav class="pie-secciones" aria-label="Todas las secciones">
        <h2>Secciones</h2>
        <ul>${presentes().map((k) => `<li><button type="button" data-filtro="${k}" data-cat="${k}">${CATS[k]}</button></li>`).join('')}</ul>
      </nav>
      <div class="pie-como">
        <h2>Cómo trabajamos</h2>
        <p>Cada día leemos un montón de medios para que tú no tengas que hacerlo. Te contamos lo importante con nuestras palabras, en corto, y siempre con el enlace a la fuente: si quieres saber más, lo tienes a un toque.</p>
        <p>En «Cómo lo titulan» ves titulares reales de otros medios, tal cual y con su enlace. Así compruebas cómo cambia una misma noticia según quién la cuente.</p>
        <p>No somos de ningún partido ni vamos a decirte qué pensar. Las fotos son nuestras, libres o con permiso, y siempre llevan el nombre de quien las hizo.</p>
        <p>¿Nos hemos equivocado? Puede pasar. Lo corregimos y lo contamos al final de la noticia. Y si ves algo raro, escríbenos a hola@pulso.com.es.</p>
      </div>
      <div class="pie-base">
        ${legalHTML('legal')}
      </div>
    </footer>`;
  };

  // Enlaces legales (aviso legal, privacidad, cookies, contacto): en el pie y en el menú,
  // porque en el móvil se lee en modo Flash y el pie casi no se ve
  const legalHTML = (clase) => {
    const legales = LEGAL.filter((x) => enlacePropio(x.url));
    return legales.length ? `<p class="${clase}">${legales.map((x) => `<a href="${enlacePropio(x.url)}">${esc(x.nombre)}</a>`).join('')}</p>` : '';
  };


  const redesHTML = () => {
    const r = REDES.filter((x) => enlace(x.url));
    // Cada red: su icono y el usuario. El nombre de la red va oculto para lectores de pantalla
    return r.length ? `<p class="redes">${r.map((x) => `<a href="${enlace(x.url)}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${x.icono}"/></svg><span class="oculto">${esc(x.nombre)}: </span>${esc(x.usuario)}</a>`).join('')}</p>` : '';
  };

  // Banda del día: fecha, hora de actualización, cuenta atrás y momentos del día
  const diaHTML = () => `<section class="dia">
      <div class="dia-izq">
        <h1>${esc(fechaLarga())}</h1>
        <p class="lema">Lo importante de hoy, en corto y con fuentes. <span>Edición ${edicionActual()}</span></p>
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
    const extraCita = c ? `<span class="bloque-extra">${esc(c.fuerte)} ${esc(c.resto)}</span>` : '';

    // Un único hueco de publicidad, a mitad de portada
    const html = bloques.map(([k, ns], i) =>
      bloqueHTML(k, ns, c && k === c.seccion ? extraCita : '') + (i === 1 ? publiHTML('portada') : '')).join('');

    return `<div class="lista">
      ${cintaHTML()}
      ${diaHTML()}
      ${apertura ? `<div class="apertura">${tarjetaHTML(apertura, true)}${rioHTML()}</div>` : ''}
      ${html}
      ${bloques.length < 2 ? publiHTML('portada') : ''}
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
      + ((i + 1) % PUBLI_CADA === 0 && i < resto.length - 1 ? publiHTML('secciones') : '')).join('');
    return `<div class="lista">
      <header class="seccion-cab" ${k !== 'guardadas' ? `data-cat="${k}"` : ''}>
        <h1>${esc(titulo)}</h1>
        <p>${lista.length} ${lista.length === 1 ? 'noticia' : 'noticias'}${cuenta() && k === cuenta().seccion ? ` · ${esc(cuenta().fuerte)} ${esc(cuenta().resto)}` : ''}</p>
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
        <span class="medio notranslate" translate="no">${esc(t.medio)}</span>
        <q class="notranslate" translate="no" lang="es">${esc(t.titular)}</q>
        ${enlace(t.url) ? `<a href="${enlace(t.url)}" target="_blank" rel="noopener">Leer en ${esc(t.medio)}</a>` : ''}
      </li>`).join('');
    const fuentes = (n.fuentes || []).map((f) =>
      `<li>${enlace(f.url) ? `<a href="${enlace(f.url)}" target="_blank" rel="noopener">${esc(f.medio)}</a>` : esc(f.medio)}</li>`).join('');
    const fecha = new Date(n.fecha).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: ZONA });
    // Hasta 3 noticias más de la misma sección, para seguir leyendo
    const relacionadas = recientes().filter((x) => cat(x) === c && x.id !== n.id).slice(0, 3).map((x) => itemHTML(x, false)).join('');
    return `<div class="f-tapa" data-cat="${c}">
        <span class="etq"><b>${CATS[c]}</b><span class="hora">${cuando(n)}</span></span>
        <button type="button" class="cerrar" data-cerrar aria-label="Cerrar">${ICONO_X}</button>
      </div>
      <div class="f-txt">
        <h2 id="ficha-titulo">${esc(n.titular)}</h2>
        ${n.entradilla ? `<p class="entradilla">${esc(n.entradilla)}</p>` : ''}
        ${imagenHTML(n, 'foto')}
        ${bloqueada(n) ? muroHTML(n) : `
        ${puntos ? `<ul class="puntos">${puntos}</ul>` : ''}
        ${n.porque ? `<p class="porque"><b>Por qué te importa.</b> ${esc(n.porque)}</p>` : ''}
        ${n.correccion ? `<p class="correccion"><b>Corrección.</b> ${esc(n.correccion)}</p>` : ''}
        ${titulares ? `<h3>Cómo lo titulan</h3><ul class="titulares">${titulares}</ul>` : ''}
        ${fuentes ? `<h3>Fuentes</h3><ul class="lista-fuentes">${fuentes}</ul>` : ''}
        <p class="firma">Redactado por pulso a partir de las fuentes citadas. Publicado el ${esc(fecha)}.${n.ejemplo ? ' Contenido de ejemplo.' : ''}</p>`}
        <div class="acciones">
          ${botonComentar(n)}
          ${botonGuardar(n)}
          ${botonCompartir(n)}
        </div>
        ${bloqueada(n) ? '' : `<section class="comentarios" id="comentarios" data-noticia="${esc(n.id)}" aria-labelledby="com-titulo">
          <h3 id="com-titulo">Comentarios</h3>
          <div class="com-cuerpo"><p class="com-vacio">Cargando…</p></div>
        </section>`}
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
    // Orden del menú, de lo que más se usa a lo que menos:
    // buscar (con tu cuenta al lado si has entrado) → cuenta atrás → «Regístrate» (si no has entrado)
    // → secciones → ajustes de lectura.
    // Quiénes somos, redes y legal van en el pie (también en el modo Flash, en su última pantalla).
    return `<div class="menu-cab">
        <p class="logo-pie notranslate" translate="no">pulso<span class="latido" aria-hidden="true"></span></p>
        <button type="button" class="cerrar" data-cerrar-menu aria-label="Cerrar el menú">${ICONO_X}</button>
      </div>
      <div class="buscar" role="search">
        <div class="buscar-fila${estado.lector ? '' : ' sin-cuenta'}">
          <label for="buscar" class="oculto">Buscar noticias</label>
          <input type="search" id="buscar" placeholder="Buscar noticias" autocomplete="off" enterkeyhint="search">
          ${estado.lector ? `<button type="button" class="btn-cuenta dentro" data-cuenta aria-label="Tu cuenta (${esc(estado.lector.email)})">${ICONO_CUENTA}</button>` : ''}
        </div>
        <div id="resultados" aria-live="polite"></div>
      </div>
      ${c ? `<button type="button" class="menu-29n" ${c.seccion ? `data-filtro="${c.seccion}"` : 'tabindex="-1"'}>
          <b>${esc(c.num)}</b><span><strong>${esc(c.txt)}</strong>${esc(c.detalle)}</span>
        </button>` : ''}
      ${estado.lector ? '' : `<button type="button" class="menu-cuenta-btn" data-cuenta><b>Regístrate o inicia sesión</b><span>Es gratis: guarda noticias en todos tus dispositivos, comenta y lee sin límite</span></button>`}
      <nav class="menu-bloque" aria-labelledby="menu-tit-secciones">
        <h2 class="menu-tit" id="menu-tit-secciones">Secciones</h2>
        <ul class="menu-secciones">
          <li><button type="button" data-filtro="todo" aria-pressed="${estado.cat === 'todo'}"><i aria-hidden="true"></i>Portada</button></li>
          ${secciones}
          <li><button type="button" data-filtro="guardadas" aria-pressed="${estado.cat === 'guardadas'}"><i aria-hidden="true"></i>Guardadas</button></li>
        </ul>
      </nav>
      <section class="menu-bloque lectura" id="lectura" aria-labelledby="lectura-titulo">
        <h2 class="menu-tit" id="lectura-titulo">Lectura</h2>
        <div class="pref">
          <p id="pref-modo">Modo</p>
          <div class="modo modo-menu" data-modo="${estado.modo}" role="group" aria-labelledby="pref-modo">
            <button type="button" data-poner-modo="flash" aria-pressed="${estado.modo === 'flash'}">Flash</button>
            <button type="button" data-poner-modo="lista" aria-pressed="${estado.modo === 'lista'}">Lista</button>
          </div>
        </div>
        <div class="pref menu-idioma notranslate" translate="no">
          <p id="pref-idioma">Idioma</p>
          <div class="seg" role="group" aria-labelledby="pref-idioma">
            ${Object.entries(IDIOMAS).map(([k, t]) => `<button type="button" data-idioma="${k}" lang="${k}" aria-label="${t}" title="${t}" aria-pressed="${idiomaGuardado() === k}">${k.toUpperCase()}</button>`).join('')}
          </div>
        </div>
        ${idiomaGuardado() === 'es' ? '' : '<p class="pref-nota notranslate" translate="no">Traducción automática de Google. El original está en castellano.</p>'}
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
      </section>`;
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
    const pastilla = $('#cuenta');
    pastilla.hidden = !c;
    if (c) {
      pastilla.innerHTML = `<strong>${esc(c.fuerte)}</strong>${c.resto ? ` <span>${esc(c.resto)}</span>` : ''}`;
      if (c.seccion) pastilla.dataset.filtro = c.seccion; else delete pastilla.dataset.filtro;
    }
    $('#top-fecha').innerHTML = fechaHTML();
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
  //   3.º .sin-minimo   → la foto cede su altura mínima
  //   4.º .recortada    → solo 2 puntos y sin la línea de fuentes
  //   5.º .minima       → solo el primer punto
  // Lo que se oculta sigue en la ficha ("Leer más"). La tarjeta NUNCA tiene scroll propio:
  // si lo tuviera, el dedo movería el interior de la tarjeta y no pasaría a la siguiente.
  const PASOS = ['apretada', 'muy-apretada', 'sin-minimo', 'recortada', 'minima'];
  // Con foto, la foto es lo último que se encoge: antes se recortan puntos (siguen en «Leer más»)
  const PASOS_FOTO = ['apretada', 'recortada', 'muy-apretada', 'minima', 'sin-minimo'];
  function ajustarCartas() {
    const noCabe = (c) => c.scrollHeight > c.clientHeight + 1;
    main.querySelectorAll('.carta[data-cat]').forEach((c) => {
      c.classList.remove(...PASOS, 'sin-foto');
      for (const paso of (c.querySelector('.foto img') ? PASOS_FOTO : PASOS)) {
        if (!noCabe(c)) break;
        c.classList.add(paso);
      }
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
      medirCabecera();   // primero la cabecera: de ella depende el alto de las tarjetas
      if (estado.modo === 'flash') ajustarCartas();
      encajarPalabras();
      moverIndicador(false);
    }, 150);
  });

  // La cabecera flota encima del contenido (por el efecto cristal).
  // Guardamos su altura en --cab para que el contenido empiece justo debajo.
  // Si cambia, las tarjetas Flash cambian de alto: hay que volver a encajarlas.
  let altoCab = 0;
  function medirCabecera() {
    const alto = top.offsetHeight;
    if (alto === altoCab) return;
    altoCab = alto;
    document.documentElement.style.setProperty('--cab', `${alto}px`);
    if (estado.datos && estado.modo === 'flash') { ajustarCartas(); encajarPalabras(); }
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(medirCabecera).observe(top);
    // En el móvil, la barra del navegador se esconde al bajar y la pantalla útil crece o mengua:
    // volvemos a encajar las tarjetas para que ninguna se salga
    let altoMain = 0;
    new ResizeObserver(() => {
      if (main.clientHeight === altoMain) return;
      altoMain = main.clientHeight;
      if (estado.datos && estado.modo === 'flash') { ajustarCartas(); encajarPalabras(); }
    }).observe(main);
  }
  medirCabecera();

  // Guardada como app en el iPhone (barra de la hora transparente), el «100 %» de alto se queda corto:
  // descuenta la barra de la hora y deja una franja vacía abajo y las tarjetas descuadradas.
  // Medimos el alto real de la pantalla y se lo damos a la página.
  const comoApp = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (comoApp) {
    const ajustarAlto = () => {
      const alto = `${Math.max(innerHeight, document.documentElement.clientHeight)}px`;
      document.documentElement.style.height = alto;
      document.body.style.height = alto;
    };
    ajustarAlto();
    addEventListener('resize', ajustarAlto);
    addEventListener('orientationchange', () => setTimeout(ajustarAlto, 300));
  }

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
        if (en.target.id.startsWith('s-')) contarLectura(en.target.id.slice(2));
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
    if (!n) {
      cerrarFicha();
      // Puede ser una noticia que ya no está en portada: se pide sola al servidor
      if (/^[a-z0-9-]+$/.test(id) && estado.datos && !(id in estado.sueltas)) {
        estado.sueltas[id] = null;
        fetch(`/api/noticias/${id}`).then((r) => (r.ok ? r.json() : null)).then((x) => {
          if (!x) return;
          estado.sueltas[id] = x;
          if (decodeURIComponent(location.hash.slice(1)) === id) abrirDesdeHash();
        }).catch(() => {});
      }
      return;
    }
    if (menu.open) menu.close();
    contarLectura(n.id);
    ficha.classList.remove('saliendo');
    fichaCuerpo.innerHTML = fichaHTML(n);
    if (!ficha.open) {
      ficha.showModal();
      ficha.classList.toggle('sin-anillo', !conTeclado);
      ficha.querySelector('.cerrar').focus({ focusVisible: conTeclado });
    }
    ficha.scrollTop = 0;
    if (fichaCuerpo.querySelector('#comentarios')) cargarComentarios(n.id);
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
    if (estado.lector) sincronizarGuardadas(g ? { anadir: [id] } : { quitar: [id] });
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
    avisar(g ? (estado.lector ? 'Guardada en tu cuenta' : 'Guardada en este dispositivo') : 'Quitada de guardadas');
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
    } else if (d.idioma && t.tagName === 'BUTTON') {
      if (d.idioma !== idiomaGuardado()) ponerIdioma(d.idioma);
    } else if ('saltar' in d) {
      e.preventDefault();
      main.focus();
    } else if ('cerrarMenu' in d) {
      cerrarMenu();
    } else if (d.filtro) {
      if (menu.open) cerrarMenu();
      if (ficha.open) cerrarFicha();
      estado.cat = d.filtro;
      cambiar(pintar);
      if (d.filtro === 'guardadas') traerGuardadas();
    } else if (d.momento) {
      estado.momento = d.momento;
      pintarMomentos();
    } else if (d.ir) {
      const slide = document.getElementById(`s-${d.ir}`);
      if (estado.modo === 'flash' && slide) slide.scrollIntoView({ behavior: suave });
      else abrir(d.ir);
    } else if (d.abrir) {
      abrir(d.abrir);
    } else if (d.cuentaModo) {
      const actual = $('#form-cuenta')?.dataset.modo;
      fichaCuerpo.innerHTML = cuentaLectorHTML($('#form-cuenta')?.dataset.volver, d.cuentaModo === 'otra' ? actual : d.cuentaModo);
      $('#cuenta-email')?.focus();
    } else if ('cuenta' in d) {
      abrirCuenta(d.cuenta, d.modo);
    } else if ('salir' in d) {
      salirCuenta();
    } else if ('borrarCuenta' in d) {
      borrarCuenta();
    } else if (d.comentar) {
      irAComentarios(d.comentar);
    } else if (d.borrarCom) {
      borrarComentario(d.borrarCom);
    } else if (d.denunciar) {
      denunciarComentario(d.denunciar, t);
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

  // Primero el servidor; si no responde (abierta en local o en GitHub Pages), el archivo
  async function pedirNoticias() {
    for (const url of ['/api/noticias', 'data/noticias.json']) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.ok && (r.headers.get('Content-Type') || '').includes('json')) return await r.json();
      } catch (e) { /* probamos la siguiente */ }
    }
    throw new Error('No hay noticias');
  }

  async function cargar() {
    try {
      const primera = !estado.datos;
      estado.datos = await pedirNoticias();
      pintar();
      // Primera carga: la página entra en una secuencia escalonada (una sola vez)
      if (primera && !pocoMovimiento) {
        main.classList.add('entrada');
        setTimeout(() => main.classList.remove('entrada'), 1000);
      }
      abrirDesdeHash();
      // Cuando termina de llegar la tipografía, los textos cambian de tamaño: reajustamos
      document.fonts?.ready.then(() => {
        medirCabecera();
        if (estado.modo === 'flash') ajustarCartas();
        encajarPalabras();
        moverIndicador(false);
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
      const nuevo = await pedirNoticias();
      if (nuevo.actualizado && nuevo.actualizado !== estado.datos.actualizado) avisar('Hay noticias nuevas', 'Actualizar');
    } catch (e) { /* sin conexión: ya lo intentaremos luego */ }
  }

  // ---------- 11. Idiomas (traductor de Google) ----------
  // pulso se escribe en castellano. Para leerlo en catalán, euskera o gallego usamos,
  // de momento, el traductor de Google. Su código solo se carga si alguien elige otro idioma
  // y acepta el aviso: hasta entonces Google no recibe nada.
  // Google recuerda el idioma con la cookie "googtrans" (/es/ca); nosotros, con "pulso-idioma".
  const IDIOMAS = { es: 'Castellano', ca: 'Català', eu: 'Euskara', gl: 'Galego' };
  const idiomaGuardado = () => (IDIOMAS[leer('pulso-idioma')] ? leer('pulso-idioma') : 'es');
  function borrarCookieTraductor() {
    const partes = location.hostname.split('.');
    const dominios = ['', location.hostname, `.${location.hostname}`];
    for (let i = 1; i < partes.length - 1; i++) dominios.push(`.${partes.slice(i).join('.')}`);
    for (const d of dominios) document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? `; domain=${d}` : ''}`;
  }
  function cargarTraductor() {
    if (window.google?.translate || document.getElementById('gt-script')) return;
    const caja = document.createElement('div');
    caja.id = 'gt-caja';
    caja.hidden = true;
    document.body.append(caja);
    window.iniciarTraductorPulso = () => new window.google.translate.TranslateElement(
      { pageLanguage: 'es', includedLanguages: 'ca,eu,gl', autoDisplay: false }, 'gt-caja');
    const sc = document.createElement('script');
    sc.id = 'gt-script';
    sc.src = 'https://translate.google.com/translate_a/element.js?cb=iniciarTraductorPulso';
    document.head.append(sc);
  }
  // Barra fina bajo la cabecera: avisa de que es una traducción y deja volver al original
  function barraTraduccion(idioma) {
    if (document.getElementById('barra-idioma')) return;
    const b = document.createElement('div');
    b.id = 'barra-idioma';
    b.className = 'barra-idioma notranslate';
    b.setAttribute('translate', 'no');
    const aviso = { ca: 'Traducció automàtica de Google', eu: 'Google-ren itzulpen automatikoa', gl: 'Tradución automática de Google' }[idioma];
    b.innerHTML = `<span lang="${idioma}">${aviso}</span>
      <button type="button" data-idioma="es">Ver en castellano</button>`;
    $('#top').append(b);
    requestAnimationFrame(() => medirCabecera());
  }
  function ponerIdioma(idioma, { preguntar = true } = {}) {
    if (!IDIOMAS[idioma]) return;
    if (idioma === 'es') {
      escribir('pulso-idioma', 'es');
      borrarCookieTraductor();
      const u = new URL(location.href);
      u.searchParams.delete('lang');
      location.replace(u.toString());
      return;
    }
    if (preguntar && leer('pulso-traductor') !== 'si' && !confirm(
      `Para leer pulso en ${IDIOMAS[idioma]} usamos el traductor de Google: el texto de la página se envía a Google, ` +
      'que lo traduce automáticamente y puede usar sus propias cookies. Las noticias originales están en castellano. ¿Seguimos?')) return;
    escribir('pulso-traductor', 'si');
    escribir('pulso-idioma', idioma);
    borrarCookieTraductor();
    document.cookie = `googtrans=/es/${idioma}; path=/; max-age=31536000; SameSite=Lax`;
    location.reload();
  }
  // Al entrar: ?lang=ca en la dirección (enlace compartido) o el idioma que elegiste otra vez
  (function arrancarIdioma() {
    const pedido = new URL(location.href).searchParams.get('lang');
    if (pedido && IDIOMAS[pedido] && pedido !== idiomaGuardado()) {
      if (pedido === 'es') { escribir('pulso-idioma', 'es'); borrarCookieTraductor(); return; }
      ponerIdioma(pedido);
      return;
    }
    const idioma = idiomaGuardado();
    if (idioma !== 'es' && leer('pulso-traductor') === 'si') {
      if (!document.cookie.includes(`googtrans=/es/${idioma}`)) document.cookie = `googtrans=/es/${idioma}; path=/; max-age=31536000; SameSite=Lax`;
      barraTraduccion(idioma);
      cargarTraductor();
    } else borrarCookieTraductor();
  })();

  // ---------- 13. Comentarios ----------
  // Los escriben lectores con cuenta y salen al momento. Se pueden denunciar (con 3 denuncias se
  // ocultan hasta que la redacción los revisa) y cada cual puede borrar los suyos.
  let comentariosAbiertos = null; // id de la noticia cuyos comentarios están pintados
  let irAComentariosDe = null;

  function irAComentarios(id) {
    const enFicha = ficha.open && decodeURIComponent(location.hash.slice(1)) === id;
    if (enFicha) { bajarAComentarios(); return; }
    irAComentariosDe = id;
    abrir(id);
  }
  function bajarAComentarios() {
    const sec = $('#comentarios');
    if (!sec) return;
    sec.scrollIntoView({ behavior: suave, block: 'start' });
  }
  const fechaCom = (ms) => hace(new Date(ms).toISOString());
  function comentarioHTML(c) {
    const acc = c.mio
      ? `<button type="button" class="enlace-txt" data-borrar-com="${c.id}">Borrar</button>`
      : estado.lector
        ? (c.denunciado ? '<span>Denunciado</span>' : `<button type="button" class="enlace-txt" data-denunciar="${c.id}">Denunciar</button>`)
        : '';
    return `<article class="com" id="com-${c.id}">
        <p class="com-cab"><b class="notranslate" translate="no">${esc(c.nombre)}</b><span>${esc(fechaCom(c.creado))}</span></p>
        <p class="com-txt">${esc(c.texto).replace(/\n/g, '<br>')}</p>
        ${acc ? `<p class="com-acc">${acc}</p>` : ''}
      </article>`;
  }
  function formComentarHTML(r, id) {
    if (!r.abiertos) return `<p class="com-aviso">${esc(r.motivo)}</p>`;
    if (!estado.lector) {
      return `<div class="com-aviso">
          <p>Para comentar necesitas una cuenta. Es gratis.</p>
          <p class="com-botones"><button type="button" class="btn lleno" data-cuenta="${esc(id)}" data-modo="entrar">Iniciar sesión</button>
          <button type="button" class="btn" data-cuenta="${esc(id)}" data-modo="crear">Crear cuenta</button></p>
        </div>`;
    }
    return `<form id="form-comentar" class="form-comentar" data-noticia="${esc(id)}" novalidate>
        ${r.nombre ? '' : `<label for="com-nombre">Tu nombre público</label>
          <input type="text" id="com-nombre" maxlength="30" autocomplete="nickname" placeholder="Cómo quieres que te vean (tu email nunca se enseña)">`}
        <label for="com-texto" class="oculto">Tu comentario</label>
        <textarea id="com-texto" maxlength="800" rows="3" placeholder="${r.nombre ? `Comenta como ${esc(r.nombre)}…` : '¿Qué opinas?'}"></textarea>
        <div class="com-pie"><span id="com-cuenta" class="com-cuenta">0/800</span><button type="submit" class="btn lleno">Publicar</button></div>
        <p class="com-normas">Con respeto: sin insultos, sin datos personales y sin spam. Lo que no cumpla, se borra.</p>
        <p id="com-msg" class="cuenta-msg" role="status" aria-live="polite"></p>
      </form>`;
  }
  async function cargarComentarios(id) {
    comentariosAbiertos = id;
    const sec = $('#comentarios');
    try {
      const r = await (await fetch(`/api/comentarios?noticia=${encodeURIComponent(id)}`, { credentials: 'same-origin' })).json();
      if (comentariosAbiertos !== id || !sec.isConnected) return;
      sec.querySelector('#com-titulo').textContent = r.comentarios.length ? `Comentarios (${r.comentarios.length})` : 'Comentarios';
      sec.querySelector('.com-cuerpo').innerHTML = formComentarHTML(r, id)
        + `<div class="com-lista">${r.comentarios.map(comentarioHTML).join('') || '<p class="com-vacio">Todavía no hay comentarios. Abre tú la conversación.</p>'}</div>`;
      ponerCuentaComentarios(id, r.comentarios.length);
    } catch (e) {
      sec.querySelector('.com-cuerpo').innerHTML = '<p class="com-vacio">No se han podido cargar los comentarios.</p>';
    }
    if (irAComentariosDe === id) {
      irAComentariosDe = null;
      bajarAComentarios();
      if (conTeclado) $('#com-texto')?.focus({ preventScroll: true });
    }
  }
  // Actualiza el número en los botones «Comentar» de esa noticia
  function ponerCuentaComentarios(id, k) {
    const n = buscar(id);
    if (n) n.comentarios = k;
    if (!n) return;
    document.querySelectorAll(`[data-comentar="${CSS.escape(id)}"]`).forEach((b) => {
      const solo = b.classList.contains('icono');
      b.outerHTML = botonComentar(n, solo);
    });
  }
  document.addEventListener('input', (e) => {
    if (e.target.id === 'com-texto') $('#com-cuenta').textContent = `${e.target.value.length}/800`;
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'form-comentar') return;
    e.preventDefault();
    const form = e.target;
    const id = form.dataset.noticia;
    const texto = $('#com-texto').value.trim();
    const nombre = $('#com-nombre')?.value.trim();
    const msg = $('#com-msg');
    if (texto.length < 2) { msg.textContent = 'Escribe algo antes de publicar.'; $('#com-texto').focus(); return; }
    if ($('#com-nombre') && (!nombre || nombre.length < 2)) { msg.textContent = 'Elige un nombre público (2 a 30 letras).'; $('#com-nombre').focus(); return; }
    const boton = form.querySelector('button[type=submit]');
    boton.disabled = true;
    msg.textContent = 'Publicando…';
    try {
      await pedirJSON('/api/lector/comentarios', 'POST', { noticia: id, texto, nombre });
      await cargarComentarios(id);
      avisar('Comentario publicado');
    } catch (err) { msg.textContent = err.message; boton.disabled = false; }
  });
  async function borrarComentario(cid) {
    if (!confirm('¿Borrar tu comentario?')) return;
    try {
      await pedirJSON(`/api/lector/comentarios/${cid}`, 'DELETE');
      if (comentariosAbiertos) await cargarComentarios(comentariosAbiertos);
      avisar('Comentario borrado');
    } catch (e) { avisar(e.message); }
  }
  async function denunciarComentario(cid, boton) {
    if (!confirm('¿Denunciar este comentario? La redacción lo revisará.')) return;
    try {
      await pedirJSON(`/api/lector/comentarios/${cid}`, 'POST', { denunciar: true });
      boton.outerHTML = '<span>Denunciado</span>';
      avisar('Gracias. Lo revisaremos');
    } catch (e) { avisar(e.message); }
  }

  // ---------- 12. Cuenta de lector y límite de lectura ----------
  // La cuenta es gratis y sin contraseña: se entra con un enlace que llega al email.
  // Sirve para guardar noticias en todos los dispositivos y leer sin límite.
  // Sin cuenta se pueden leer unas cuantas noticias completas cada semana (lo decide el ajuste
  // "lectura" del servidor: { gratis: 5, dias: 7 }; sin ajuste no hay límite). Los titulares
  // se ven siempre, y una noticia ya leída se puede volver a abrir.

  const pedirJSON = async (url, metodo = 'GET', cuerpo) => {
    const r = await fetch(url, {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || 'No se ha podido conectar. Inténtalo de nuevo.');
    return datos;
  };

  // Límite: null si no hay
  const limite = () => {
    const l = estado.datos?.lectura;
    return l && l.gratis > 0 ? { gratis: l.gratis, dias: l.dias || 7 } : null;
  };
  // Noticias leídas sin cuenta dentro del periodo: { id: cuándo }
  function leidas() {
    const l = limite();
    let todas = {};
    try { todas = JSON.parse(leer('pulso-leidas') || '{}'); } catch (e) { /* empezamos de cero */ }
    if (!l) return todas;
    const desde = Date.now() - l.dias * 86400000;
    return Object.fromEntries(Object.entries(todas).filter(([, t]) => t > desde));
  }
  function bloqueada(n) {
    const l = limite();
    if (!l || estado.lector) return false;
    const ya = leidas();
    return !(n.id in ya) && Object.keys(ya).length >= l.gratis;
  }
  function contarLectura(id) {
    const l = limite();
    if (!l || estado.lector) return;
    const ya = leidas();
    if (id in ya || Object.keys(ya).length >= l.gratis) return;
    ya[id] = Date.now();
    escribir('pulso-leidas', JSON.stringify(ya));
    // Con la última gratis, las tarjetas que aún no has visto pasan a pedir la cuenta
    if (Object.keys(ya).length >= l.gratis) aplicarMuro();
  }
  function aplicarMuro() {
    main.querySelectorAll('.slide[id^="s-"]').forEach((s) => {
      const n = buscar(s.id.slice(2));
      const cuerpo = s.querySelector('.cuerpo');
      if (!n || !cuerpo || !bloqueada(n) || cuerpo.querySelector('.muro')) return;
      cuerpo.innerHTML = `<h2>${esc(n.titular)}</h2>${muroHTML(n)}`;
    });
  }
  function muroHTML(n) {
    const l = limite();
    const periodo = l.dias === 7 ? 'esta semana' : l.dias === 1 ? 'hoy' : `en ${l.dias} días`;
    return `<div class="muro">
        <p><b>Ya has leído tus ${l.gratis} noticias sin cuenta de ${periodo}.</b> Regístrate o inicia sesión para seguir leyendo sin límite. Es gratis.</p>
        <button type="button" class="btn lleno" data-cuenta="${esc(n.id)}" data-modo="crear">Registrarme gratis</button>
        <p class="muro-ya">¿Ya tienes cuenta? <button type="button" data-cuenta="${esc(n.id)}" data-modo="entrar">Inicia sesión</button></p>
      </div>`;
  }


  function cuentaLectorHTML(volver, modo) {
    const tapa = `<div class="f-tapa cuenta-tapa">
        <span class="etq"><b>Tu cuenta</b></span>
        <button type="button" class="cerrar" data-cerrar aria-label="Cerrar">${ICONO_X}</button>
      </div>`;
    if (estado.lector) {
      const n = estado.guardadas.size;
      return `${tapa}<div class="f-txt f-cuenta">
          <h2 id="ficha-titulo">Tu cuenta de pulso</h2>
          <p class="entradilla">Has entrado como <b class="notranslate" translate="no">${esc(estado.lector.email)}</b>. Lo que guardes aparece en todos los dispositivos donde entres con este email.</p>
          <div class="acciones">
            <button type="button" class="btn lleno" data-filtro="guardadas">${ICONO_GUARDAR}<span>Tus guardadas (${n})</span></button>
            <button type="button" class="btn" data-salir>Cerrar sesión</button>
          </div>
          <p class="cuenta-nota">Es gratis y sin publicidad. No mandamos correos salvo los enlaces para entrar.</p>
          <p class="cuenta-nota"><button type="button" class="enlace-txt" data-borrar-cuenta>Borrar mi cuenta</button> (se borran tu email y tus guardadas).</p>
        </div>`;
    }
    // Sin cuenta: dos pestañas (Iniciar sesión / Crear cuenta) y dos pasos (email → código de 6 cifras)
    const entrar = modo !== 'crear';
    return `${tapa}<div class="f-txt f-cuenta">
        <div class="seg cuenta-pestanas" role="tablist" aria-label="Tu cuenta">
          <button type="button" role="tab" data-cuenta-modo="entrar" aria-selected="${entrar}" aria-pressed="${entrar}">Iniciar sesión</button>
          <button type="button" role="tab" data-cuenta-modo="crear" aria-selected="${!entrar}" aria-pressed="${!entrar}">Crear cuenta</button>
        </div>
        <h2 id="ficha-titulo">${entrar ? 'Entra en tu cuenta' : 'Crea tu cuenta gratis'}</h2>
        <p class="entradilla">${entrar
          ? 'Escribe tu email y te mandamos un código de 6 cifras. Sin contraseñas, y este dispositivo te recuerda durante un año.'
          : 'Guarda noticias en todos tus dispositivos y lee sin límite. Te mandamos un código al email y listo.'}</p>
        <form id="form-cuenta" class="form-cuenta" data-volver="${esc(volver || '')}" data-modo="${entrar ? 'entrar' : 'crear'}" novalidate>
          <label for="cuenta-email">Tu email</label>
          <input type="email" id="cuenta-email" autocomplete="email" inputmode="email" required placeholder="tu@email.com" value="${esc(leer('pulso-ultimo-email') || '')}">
          ${entrar ? '' : `<label class="casilla"><input type="checkbox" id="cuenta-acepto" required>
            <span>Tengo 14 años o más y acepto la <a href="privacidad.html" target="_blank" rel="noopener">política de privacidad</a>.</span></label>`}
          <button type="submit" class="btn lleno">Mandarme el código</button>
          <p id="cuenta-msg" class="cuenta-msg" role="status" aria-live="polite"></p>
        </form>
        <p class="cuenta-nota">pulso es gratis. Solo usamos tu email para que entres.</p>
      </div>`;
  }
  // Segundo paso: escribir el código que ha llegado al email
  function pasoCodigoHTML(email) {
    return `<p class="cuenta-ok"><b>Mira tu correo.</b> Te hemos mandado un código a <b class="notranslate" translate="no">${esc(email)}</b>. Si no llega en un minuto, busca en spam.</p>
      <label for="cuenta-codigo">Código de 6 cifras</label>
      <input type="text" id="cuenta-codigo" class="campo-codigo" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" maxlength="7" placeholder="000 000" required>
      <button type="submit" class="btn lleno">Entrar</button>
      <p id="cuenta-msg" class="cuenta-msg" role="status" aria-live="polite"></p>
      <p class="cuenta-nota"><button type="button" class="enlace-txt" data-cuenta-modo="otra">Usar otro email o pedir otro código</button></p>`;
  }

  function abrirCuenta(volver, modo) {
    if (menu.open) menu.close();
    if (ficha.open) quitarHash();
    ficha.classList.remove('saliendo');
    fichaCuerpo.innerHTML = cuentaLectorHTML(volver, modo);
    if (!ficha.open) ficha.showModal();
    ficha.scrollTop = 0;
    const campo = $('#cuenta-email');
    if (campo && conTeclado) campo.focus();
    else ficha.querySelector('.cerrar').focus({ focusVisible: conTeclado });
  }

  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'form-cuenta') return;
    e.preventDefault();
    const form = e.target;
    const msg = () => $('#cuenta-msg');
    const boton = form.querySelector('button[type=submit]');

    // Paso 2: comprobar el código
    if (form.dataset.paso === 'codigo') {
      const codigo = $('#cuenta-codigo').value.replace(/\D/g, '');
      if (codigo.length !== 6) { msg().textContent = 'Escribe las 6 cifras.'; $('#cuenta-codigo').focus(); return; }
      boton.disabled = true;
      msg().textContent = 'Comprobando…';
      try {
        const r = await pedirJSON('/api/lector/verificar', 'POST', { email: form.dataset.email, codigo });
        ponerLector(r.lector);
        await arrancarCuenta();
        const volver = form.dataset.volver;
        // Cerrar sin animación y volver al inicio: en el iPhone, el teclado desplaza la página
        // y al cerrar la ventana se quedaba la pantalla corrida (en blanco)
        if (ficha.open) ficha.close();
        irAlInicio();
        avisar('¡Dentro! Ya puedes leer sin límite');
        if (volver) setTimeout(() => abrir(volver), 300);
      } catch (err) { msg().textContent = err.message; boton.disabled = false; $('#cuenta-codigo').select(); }
      return;
    }

    // Paso 1: pedir el código
    const email = $('#cuenta-email').value.trim().toLowerCase();
    const crear = form.dataset.modo === 'crear';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg().textContent = 'Escribe un email válido.'; $('#cuenta-email').focus(); return; }
    if (crear && !$('#cuenta-acepto').checked) { msg().textContent = 'Marca la casilla para seguir.'; return; }
    boton.disabled = true;
    msg().textContent = 'Enviando…';
    try {
      await pedirJSON('/api/lector/pedir', 'POST', { email, modo: crear ? 'crear' : 'entrar', acepto: crear || undefined, volver: form.dataset.volver || undefined });
      escribir('pulso-ultimo-email', email);
      form.dataset.paso = 'codigo';
      form.dataset.email = email;
      form.innerHTML = pasoCodigoHTML(email);
      $('#cuenta-codigo').focus();
    } catch (err) {
      msg().textContent = err.message;
      boton.disabled = false;
    }
  });
  // Al pegar o escribir 6 cifras, se envía solo
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'cuenta-codigo') return;
    const cifras = e.target.value.replace(/\D/g, '').slice(0, 6);
    e.target.value = cifras.length > 3 ? `${cifras.slice(0, 3)} ${cifras.slice(3)}` : cifras;
    if (cifras.length === 6) e.target.form.requestSubmit();
  });

  // Portada, arriba del todo y sin nada desplazado
  function irAlInicio() {
    document.activeElement?.blur?.();
    estado.cat = 'todo';
    pintar();
    scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    main.scrollTo(0, 0);
  }

  async function sincronizarGuardadas(cambios) {
    try {
      const r = await pedirJSON('/api/lector/guardadas', 'POST', cambios);
      estado.guardadas = new Set([...r.guardadas].reverse());
      escribir('pulso-guardadas', JSON.stringify([...estado.guardadas]));
      pintarChips(false);
    } catch (e) { avisar(e.message); }
  }

  // Las guardadas que ya no están en portada se piden al servidor
  async function traerGuardadas() {
    const faltan = [...estado.guardadas].filter((id) => !buscar(id));
    if (!faltan.length) return;
    try {
      if (estado.lector) {
        const r = await pedirJSON('/api/lector/guardadas');
        r.noticias.forEach((n) => { if (!buscar(n.id)) estado.sueltas[n.id] = n; });
      } else {
        await Promise.all(faltan.slice(0, 30).map((id) => fetch(`/api/noticias/${encodeURIComponent(id)}`)
          .then((r) => (r.ok ? r.json() : null)).then((n) => { if (n) estado.sueltas[id] = n; }).catch(() => {})));
      }
    } catch (e) { return; }
    if (estado.cat === 'guardadas') pintar();
  }

  function ponerLector(lector) {
    const antes = !!estado.lector;
    estado.lector = lector;
    if (lector) escribir('pulso-lector', lector.email);
    else try { localStorage.removeItem('pulso-lector'); } catch (e) { /* nada */ }
    // Si cambia y hay límite, las tarjetas y la ficha abierta cambian (muro sí o no)
    if (antes !== !!lector && limite()) {
      pintar();
      if (ficha.open && location.hash) abrirDesdeHash();
    }
  }

  async function salirCuenta() {
    try { await pedirJSON('/api/lector/yo', 'POST', { salir: true }); } catch (e) { /* la cerramos igual aquí */ }
    ponerLector(null);
    // En un dispositivo compartido, lo guardado se va con la cuenta
    estado.guardadas = new Set();
    escribir('pulso-guardadas', '[]');
    cerrarFicha();
    pintar();
    avisar('Has cerrado sesión');
  }

  async function borrarCuenta() {
    if (!confirm('¿Borrar tu cuenta? Se borran tu email y tus noticias guardadas. No se puede deshacer.')) return;
    try {
      await pedirJSON('/api/lector/yo', 'DELETE');
      ponerLector(null);
      estado.guardadas = new Set();
      escribir('pulso-guardadas', '[]');
      cerrarFicha();
      pintar();
      avisar('Cuenta borrada');
    } catch (e) { avisar(e.message); }
  }

  async function arrancarCuenta() {
    // ¿Venimos del enlace del email? (?entrar=…)
    const url = new URL(location.href);
    // ?cuenta=crear (viene del email «No tienes cuenta»): abre directamente el registro
    if (url.searchParams.get('cuenta') === 'crear') {
      url.searchParams.delete('cuenta');
      try { history.replaceState(null, '', url.pathname + url.search + url.hash); } catch (e) { /* nada */ }
      setTimeout(() => abrirCuenta(null, 'crear'), 400);
    }
    const token = url.searchParams.get('entrar');
    if (token) {
      url.searchParams.delete('entrar');
      try { history.replaceState(null, '', url.pathname + url.search + url.hash); } catch (e) { /* nada */ }
      try {
        const r = await pedirJSON('/api/lector/verificar', 'POST', { token });
        ponerLector(r.lector);
        if (!location.hash) irAlInicio();
        avisar('¡Dentro! Ya puedes leer sin límite');
      } catch (e) { avisar(e.message); }
    }
    // ¿Quién soy? Si hay cuenta, se juntan las guardadas de este dispositivo con las de la cuenta
    try {
      const r = await pedirJSON('/api/lector/yo');
      ponerLector(r.lector);
      if (r.lector) {
        const nuevas = [...estado.guardadas].filter((id) => !r.guardadas.includes(id));
        if (nuevas.length) await sincronizarGuardadas({ anadir: nuevas });
        else {
          estado.guardadas = new Set([...r.guardadas].reverse());
          escribir('pulso-guardadas', JSON.stringify([...estado.guardadas]));
          pintarChips(false);
        }
      }
    } catch (e) { /* sin servidor (archivo local): la web funciona sin cuentas */ }
  }

  setInterval(comprobarNovedades, CADA_CUANTO);
  setInterval(() => { if (estado.datos) pintarCabecera(); }, 60 * 1000);
  cargar();
  arrancarCuenta();
}
