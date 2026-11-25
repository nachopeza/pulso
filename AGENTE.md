# Agente redactor de pulso

Instrucciones para el agente que prepara la edición diaria de **pulso** (pulsomedio.es).
El agente **solo edita `data/noticias.json`** y, si añade fotos, la carpeta `img/`. Nunca toca el código (`index.html`, `css/`, `js/`).

## Cuándo

Cada día, a primera hora (sobre las 6:30, hora de Madrid). Si hay algo muy importante durante el día, se puede lanzar otra vez a mano.

## Paso a paso

1. **Lee** `data/noticias.json` para saber qué hay publicado.
2. **Busca la actualidad del día** en España y el mundo, pensando en lectores de 16 a 30 años. Puntos de partida útiles:
   - Agendas de EFE en Infobae: «Temas del día de EFE España» y «Hoy será noticia» (busca la del día).
   - Medios de distinta línea editorial (por ejemplo: El País, El Mundo, elDiario.es, El Español, ABC, La Vanguardia, Público, 20minutos, RTVE).
   - Fuentes oficiales: BOE, ministerios, AEMET, INE, UEFA, organismos europeos.
3. **Elige entre 6 y 10 noticias nuevas** repartidas por secciones. Comprueba cada dato en al menos una fuente fiable; si dos fuentes no coinciden, cuenta solo lo que coincide o dilo.
4. **Escribe cada noticia** con las reglas de abajo.
5. **Retira lo caducado**: noticias de hace más de 48 horas, salvo las guías útiles (cómo votar, D'Hondt, jornada de reflexión…) mientras sigan teniendo sentido. Actualiza las que hayan cambiado (por ejemplo, un partido que ayer era previa y hoy tiene resultado: mismo `id`, nuevo texto).
6. **Marca una sola noticia como `"destacado": true`**: la más importante del día.
7. **Rehaz `momentos`** (mañana, tarde, noche) con 3 puntos cada uno que apunten a `id` existentes.
8. **Pon `actualizado`** con la hora actual de Madrid (formato `2026-11-25T06:30:00+01:00`).
9. **Valida**: `python3 scripts/validar.py`. Si da errores, corrígelos y vuelve a validar.
10. **Publica**: commit en `main` con el mensaje `Edición del <día> de <mes>` y `git push`. Al hacer push, GitHub publica la web en Cloudflare automáticamente.

## Cómo se escribe una noticia

| Campo | Regla |
| --- | --- |
| `id` | Minúsculas y guiones, único y estable: `champions-miercoles-25`. |
| `categoria` | `elecciones`, `espana`, `mundo`, `economia`, `tecnologia`, `clima`, `cultura` o `deportes`. |
| `momento` | `manana`, `tarde` o `noche`: cuándo le interesa más al lector. |
| `fecha` | Hora de publicación (Madrid), nunca en el futuro. |
| `titular` | Propio, claro, máximo unos 90 caracteres. Nunca copiado de otro medio. |
| `entradilla` | Una o dos frases con lo esencial. |
| `puntos` | **2 o 3** frases cortas con los datos clave (en Flash no cabe más). |
| `porque` | «Por qué te importa»: una frase que conecte con la vida de alguien de 16 a 30 años. |
| `fuentes` | Siempre al menos una, con `medio` y `url` a la información original. |
| `titulares` | «Cómo lo titulan»: titulares **literales** de otros medios, con su nombre y enlace. Mejor si son de líneas editoriales distintas. Puede ir vacío. |
| `imagen` | `null` o una foto con licencia libre (ver abajo). |
| `correccion` | Solo si se corrige un error: qué se ha corregido. |

## Reglas editoriales (no negociables)

- **Nada inventado.** Ni cifras, ni citas, ni horas. Si no está en una fuente, no se publica.
- **Neutralidad política.** Mismo trato a todos los partidos. Nada de adjetivos valorativos. Cuando se cuenta la agenda de campaña, se reparte entre formaciones.
- **Encuestas:** del martes 24 al domingo 29 de noviembre de 2026 la ley prohíbe publicar sondeos electorales nuevos. No se publican.
- **Jornada de reflexión** (sábado 28): nada que pida el voto ni campaña; solo información práctica.
- **Fotos:** solo con licencia libre (Wikimedia Commons, Unsplash) o propias. Nunca fotos de otros medios ni de agencias. Siempre con `credito`, `licencia` y `enlace` a la página de la foto. Se guardan en `img/<id>.jpg` a unos 1200 px de ancho. Si no hay una foto adecuada, `null`: la web pone el nombre de la sección en letra gigante.
- **Lenguaje claro**, frases cortas, sin jerga. Se explica lo que no es obvio.
- **Errores:** si una noticia publicada tenía un error, se corrige y se explica en `correccion`.

## Fotos de Wikimedia Commons

Búsqueda por la API pública (sin datos personales en la petición):

```
https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrsearch=<búsqueda>&gsrlimit=8&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200
```

De `extmetadata` salen el autor (`Artist`) y la licencia (`LicenseShortName`). Si la API responde «429», espera unos segundos y vuelve a intentarlo.
