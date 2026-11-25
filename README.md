# pulso

Medio de noticias cortas para gente joven (16-30 años) en España. Se lanza el sábado 28 de noviembre de 2026, víspera de las elecciones generales del **29N**: por eso el 29N tiene su sección, su cuenta atrás y su bloque en portada, aunque pulso cubre toda la actualidad.
Cada noticia va resumida con nuestras palabras y enlaza siempre a su fuente original.

Es una web estática: HTML, CSS y JavaScript puros, sin frameworks ni compilación. Está publicada en **https://pulsomedio.es** (Cloudflare Pages).

---

## 1. Estructura

```
NWS/
├── index.html          La página: cabecera, zona de noticias, ficha (<dialog>) y avisos
├── css/estilos.css     Todo el diseño: colores, tipografía, modo Flash, modo Lista, animaciones
├── js/app.js           Lee data/noticias.json y pinta la web. No hace falta tocarlo para publicar
├── data/noticias.json  LAS NOTICIAS. Es el único archivo que edita el agente redactor
├── img/                Fotos con licencia libre de las noticias
├── _headers            Cabeceras de Cloudflare (caché y seguridad)
├── AGENTE.md           Manual del agente redactor que prepara la edición de cada día
├── scripts/validar.py  Comprueba el JSON antes de publicar
├── .github/workflows/  Publicación automática en Cloudflare al subir cambios a main
└── README.md           Este archivo
```

### Cómo está organizada la web

**Cabecera** (fija, de cristal): menú ☰, logo, fecha, cuenta atrás al 29N, interruptor Flash/Lista y fila de secciones.
En el móvil la cabecera se simplifica (menú, logo y cuenta atrás): el interruptor Flash/Lista, el buscador y las preferencias están en el menú lateral.
Cada visita empieza en el modo del dispositivo: **Flash en el móvil y Lista en el ordenador**. Si el lector lo cambia, se respeta mientras tenga la pestaña abierta.
Al bajar, el logo «pulso» se pliega en «p» con una animación de muelles. Al pasar el ratón por encima, las letras saltan en ola.

**Modo Lista** (por defecto en el ordenador), portada con estructura de periódico:
1. **Última hora**: cinta con los titulares más recientes.
2. **Banda del día**: fecha, hora de la última actualización, cuenta atrás y los momentos del día (Mañana / Tarde / Noche).
3. **Apertura**: la noticia `destacado` con su sumario (los puntos) y, al lado, **Lo último** con la hora de cada noticia.
4. **Un bloque por sección** que tenga 2 o más noticias: pieza principal con tapa de color y el resto como titulares en lista. Botón «Ver todo».
5. **Un solo hueco de publicidad**, a mitad de portada.
6. **Breves**: las secciones con una sola noticia ese día.
7. **Pie**: secciones, «Cómo trabajamos», redes, páginas legales y hora de actualización.

Al elegir una sección se ve su cabecera, la primera noticia destacada y el resto en rejilla.

**Modo Flash** (por defecto en el móvil): una noticia por pantalla, deslizando como las stories.

**Ficha** de cada noticia: titular, entradilla, puntos, «Por qué te importa», «Cómo lo titulan», fuentes, firma y «Más de [sección]».

**Menú ☰**: buscador, secciones, especial 29N, modo de lectura y **preferencias de lectura**:
tema Auto / Claro (versión en blanco) / Oscuro, y tamaño de letra normal, grande o muy grande. Se recuerdan en el navegador.
En el ordenador también hay atajos en la cabecera: lupa (buscar) y «Aa» (lectura).

- Cada noticia tiene su enlace propio: `https://pulsomedio.es/#id-de-la-noticia` abre directamente su ficha.
- Las guardadas y el modo elegido se recuerdan en el navegador (localStorage). No hay cuentas de usuario.
- Cada 5 minutos la web mira si `actualizado` ha cambiado en el JSON. Si ha cambiado, muestra el aviso «Hay noticias nuevas».

Para cambiar colores o tamaños, edita las variables del principio de `css/estilos.css`.
En `js/app.js`, arriba del todo, están la fecha de las elecciones (`DIA_29N`), los perfiles de redes (`REDES`) y las páginas legales (`LEGAL`).

### Pendiente antes de lanzar (lo que todo medio necesita)

- [ ] **Aviso legal, privacidad y cookies.** En España son obligatorios (LSSI y RGPD). Cuando existan, pon su dirección en `LEGAL` (`js/app.js`) y aparecerán en el pie.
- [ ] **Contacto** (correo o formulario), también en `LEGAL`.
- [x] **Perfiles de Bluesky y X** en `REDES` (@pulsomedio en las dos).
- [ ] **Imagen para redes** (`og:image`, 1200×630) en `index.html`, para que los enlaces compartidos lleven imagen.
- [x] **Dominio propio**: pulsomedio.es.
- [ ] Si hay publicidad real, datos del anunciante en `anuncio`.
- [ ] Limitación conocida: como las noticias se abren con `#id`, al compartir una noticia la vista previa en redes muestra el título general de pulso, no el de la noticia. Para tener vista previa por noticia haría falta generar una página por noticia.

---

## 2. Verla en un Mac

El navegador no deja leer `noticias.json` si abres `index.html` con doble clic. Necesitas un servidor local (Python ya viene con el Mac):

1. Abre **Terminal**.
2. Entra en la carpeta del proyecto:
   ```
   cd ~/Developer/NWS
   ```
3. Arranca el servidor:
   ```
   python3 -m http.server
   ```
4. Abre **http://localhost:8000** en el navegador.

Para pararlo, vuelve a Terminal y pulsa `Ctrl + C`.

### Verla en el móvil

El móvil y el Mac tienen que estar conectados a la **misma wifi**.

1. Con el servidor en marcha, abre otra ventana de Terminal y averigua la IP del Mac:
   ```
   ipconfig getifaddr en0
   ```
   Te devolverá algo como `192.168.1.34`.
2. En el navegador del móvil, abre `http://192.168.1.34:8000` (con tu IP).

Si no carga, mira si el cortafuegos del Mac está bloqueando Python (Ajustes del Sistema → Red → Cortafuegos).

### Cómo se publica

- La web vive en **Cloudflare Pages** (proyecto `pulso`) con el dominio **pulsomedio.es**. El dominio se compró en Hostinger, pero sus DNS los gestiona Cloudflare. El correo sigue en Hostinger: sus registros (MX, SPF, DKIM, DMARC) están copiados en Cloudflare.
- Cada `git push` a `main` lanza `.github/workflows/publicar.yml`: valida el JSON y sube la web a Cloudflare. Necesita dos secretos en el repositorio: `CLOUDFLARE_API_TOKEN` (con permiso *Cloudflare Pages: Edit*) y `CLOUDFLARE_ACCOUNT_ID`.
- **Edición diaria:** una rutina de Claude Code en la nube («pulso: edición diaria», cada día a las 6:30 de Madrid) sigue `AGENTE.md`, actualiza `data/noticias.json` y hace push.
- Para publicar a mano desde el Mac: `npx wrangler pages deploy <carpeta con la web> --project-name pulso --branch main`.

---

## 3. Formato de `data/noticias.json` (para el agente)

El agente **solo** edita este archivo. Cada vez que lo cambie, debe actualizar `actualizado` con la hora actual: así los lectores reciben el aviso de noticias nuevas.

```json
{
  "actualizado": "2026-11-24T18:30:00+01:00",
  "anuncio": null,
  "momentos": {
    "manana": { "titulo": "Para empezar el día", "puntos": [{ "texto": "Frase corta", "id": "id-de-una-noticia" }] },
    "tarde":  { "titulo": "A media tarde",       "puntos": [] },
    "noche":  { "titulo": "Para cerrar el día",  "puntos": [] }
  },
  "noticias": [
    {
      "id": "slug-unico",
      "categoria": "elecciones",
      "momento": "manana",
      "fecha": "2026-11-24T08:10:00+01:00",
      "destacado": false,
      "ejemplo": false,
      "titular": "Titular propio",
      "entradilla": "Una o dos frases propias.",
      "puntos": ["Punto 1", "Punto 2", "Punto 3"],
      "porque": "Por qué le importa a alguien de 16-30 años.",
      "fuentes": [{ "medio": "Nombre de la fuente", "url": "https://..." }],
      "titulares": [{ "medio": "Nombre del medio", "titular": "Su titular literal", "url": "https://..." }],
      "imagen": null
    }
  ]
}
```

| Campo | Qué es |
|---|---|
| `actualizado` | Fecha y hora de la última edición, en formato ISO 8601 con zona (`+01:00`). |
| `anuncio` | `null` (se ve «Espacio publicitario») o `{ "texto": "...", "url": "https://..." }`. Solo hay un anuncio. |
| `momentos` | Resumen de Mañana, Tarde y Noche: 2-3 puntos, cada uno con el `id` de la noticia a la que salta. |
| `id` | Único, en minúsculas, sin tildes ni espacios (`como-votar-29n`). Es el enlace que se comparte: no lo cambies después de publicar. |
| `categoria` | `elecciones`, `espana`, `mundo`, `economia`, `tecnologia`, `clima`, `cultura` o `deportes`. |
| `momento` | `manana`, `tarde` o `noche`. |
| `fecha` | Fecha de publicación (ISO 8601). Se muestra como «hace 2 h». |
| `destacado` | `true` en una sola noticia: sale la primera y ocupa dos columnas en la Lista. |
| `ejemplo` | `true` solo en contenido de prueba. |
| `titular` | Propio, **máx. ~80 caracteres** para que quepa bien en el móvil. |
| `entradilla` | 1-2 frases propias. |
| `puntos` | **Máximo 3**, de una o dos líneas cada uno. |
| `porque` | «Por qué te importa», una frase. En móviles bajos se ve solo en la ficha. |
| `fuentes` | Una o más fuentes originales, siempre con enlace `https://`. |
| `titulares` | Opcional. Titulares literales de otros medios para «Cómo lo titulan». |
| `correccion` | Opcional. Si una noticia se corrige, explica aquí qué cambió. Sale al final de la ficha. |
| `imagen` | `null` (sin foto: sale el nombre de la sección en letra gigante) o `{ "src": "img/foto.jpg", "alt": "...", "credito": "Autor", "licencia": "CC BY 4.0", "enlace": "https://commons.wikimedia.org/wiki/File:...", "posicion": "50% 30%" }`. `enlace` (página de la foto con su licencia) y `posicion` (qué parte se ve al recortar) son opcionales. Las fotos van en la carpeta `img/`, a unos 1200 px de ancho. Las actuales son de Wikimedia Commons, con licencia libre. |

Si un texto es demasiado largo para la pantalla, la tarjeta se «aprieta» sola (oculta «Por qué te importa» y reduce un poco la letra). Aun así, cuanto más corto, mejor.

Seguridad: todo el texto del JSON se escapa antes de mostrarse (no se puede colar HTML) y solo se aceptan enlaces `http://` o `https://`.

Antes de subir, comprueba que el JSON es válido, por ejemplo con:
```
python3 -m json.tool data/noticias.json > /dev/null && echo OK
```

---

## 4. Reglas editoriales (obligatorias)

1. **Titular y resumen propios.** Nunca se copian textos de otros medios.
2. **Siempre se enlaza la fuente original** en `fuentes`.
3. **Titulares de otros medios** solo en `titulares` («Cómo lo titulan»): literales, cortos, con el nombre del medio y su enlace.
4. **Nada de fotos de internet.** Solo imágenes propias, con licencia libre o compradas, siempre con autor y licencia en `credito` y `licencia`. Por defecto, sin foto: la «imagen» es el nombre de la sección en letra gigante.
5. **Neutralidad política.** La sección 29N va en amarillo de marca. En elementos políticos no se usan rojo, azul, verde ni morado, porque se asocian a partidos.
6. Una sola publicidad, discreta y marcada como tal.

Estas reglas se explican a los lectores en el pie «Cómo trabajamos».
