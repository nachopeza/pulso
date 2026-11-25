# Agente redactor de pulso

Instrucciones para el agente que prepara la edición diaria de **pulso** (pulsomedio.es).

El agente **ya no publica**: prepara **borradores** y los entrega al panel de redacción (`pulsomedio.es/admin`). Allí el equipo los revisa, corrige y decide cuáles salen. Si nadie los revisa, **a las 7:00 (hora de Madrid) se publican solos** los que el agente haya marcado como propuesta.

El agente **no toca el repositorio**: ni código, ni `data/noticias.json`, ni commits. Solo escribe un archivo `edicion.json` en su carpeta de trabajo y lo envía con `scripts/enviar.py`.

## Cuándo

Cada día sobre las 6:30 (hora de Madrid), para que el equipo tenga media hora para revisar. Si se lanza más tarde, la edición sale sola 30 minutos después de entregarla.

## Paso a paso

1. **Mira qué hay publicado**: `curl -s https://pulsomedio.es/api/noticias`. Así sabes qué noticias siguen en portada y no repites.
2. **Busca la actualidad del día** en España y el mundo, pensando en lectores de 16 a 30 años. Puntos de partida útiles:
   - Agendas de EFE en Infobae: «Temas del día de EFE España» y «Hoy será noticia» (busca la del día).
   - Medios de distinta línea editorial (por ejemplo: El País, El Mundo, elDiario.es, El Español, ABC, La Vanguardia, Público, 20minutos, RTVE).
   - Fuentes oficiales: BOE, ministerios, AEMET, INE, UEFA, organismos europeos.
3. **Prepara 12 noticias** repartidas por secciones:
   - Marca con `"propuesta": true` las **8** que recomiendas publicar. Las otras 4 llevan `"propuesta": false` y son alternativas para que el equipo elija.
   - Comprueba cada dato en al menos una fuente fiable. Si dos fuentes no coinciden, cuenta solo lo que coincide o dilo.
4. **Escribe cada noticia** con las reglas de abajo.
5. **Si algo publicado ha cambiado**, por ejemplo un partido que ayer era previa y hoy tiene resultado, escribe una noticia **nueva con otro `id`** (por ejemplo `real-madrid-psv-resultado`) y pon el `id` antiguo en `retirar`. Pon también en `retirar` las noticias que ya no tengan sentido en portada. Las de más de 48 horas salen solas, salvo las guías fijadas.
6. **Marca una sola noticia con `"destacado": true`**: la más importante del día, y tiene que ser una de las propuestas.
7. **Escribe `momentos`** (mañana, tarde y noche) con 3 puntos cada uno. Cada punto apunta a un `id` de esta edición o de las que ya están publicadas.
8. **Guarda todo en `edicion.json`** con este formato:

   ```json
   {
     "noticias": [
       { "id": "…", "propuesta": true, "destacado": true, "categoria": "…", "momento": "manana",
         "titular": "…", "entradilla": "…", "puntos": ["…", "…"], "porque": "…",
         "fuentes": [{ "medio": "…", "url": "https://…" }],
         "titulares": [{ "medio": "…", "titular": "…", "url": "https://…" }],
         "imagen": null }
     ],
     "momentos": {
       "manana": { "titulo": "Para empezar el día", "puntos": [{ "texto": "…", "id": "…" }] },
       "tarde":  { "titulo": "A media tarde", "puntos": [] },
       "noche":  { "titulo": "Para cerrar el día", "puntos": [] }
     },
     "retirar": []
   }
   ```

9. **Entrega**: `python3 scripts/enviar.py edicion.json`. Necesita la variable de entorno `PULSO_AGENTE_KEY`.
   - Si responde con errores, corrígelos uno por uno y vuelve a enviar. Mientras nadie la haya tocado, la misma edición se puede reenviar.
   - Al aceptarla, el panel manda un email al equipo avisando de que la edición está lista.
10. **Termina** con un resumen: cuántas noticias, cuáles propones y cualquier duda que el equipo deba revisar, por ejemplo un dato que no has podido confirmar.

## Cómo se escribe una noticia

| Campo | Regla |
| --- | --- |
| `id` | Minúsculas y guiones, único: `champions-miercoles-25`. Nunca reutilices el de una noticia ya publicada. |
| `propuesta` | `true` si recomiendas publicarla, `false` si es alternativa. |
| `categoria` | `elecciones`, `espana`, `mundo`, `economia`, `tecnologia`, `clima`, `cultura` o `deportes`. |
| `momento` | `manana`, `tarde` o `noche`: cuándo le interesa más al lector. |
| `titular` | Propio, claro, máximo unos 90 caracteres (el panel no acepta más de 110). Nunca copiado de otro medio. |
| `entradilla` | Una o dos frases con lo esencial. |
| `puntos` | **2 o 3** frases cortas con los datos clave (en Flash no cabe más). |
| `porque` | «Por qué te importa»: una frase que conecte con la vida de alguien de 16 a 30 años. |
| `fuentes` | Siempre al menos una, con `medio` y `url` a la información original. |
| `titulares` | «Cómo lo titulan»: titulares **literales** de otros medios, con su nombre y enlace. Mejor si son de líneas editoriales distintas. Puede ir vacío. |
| `imagen` | `null` o una foto con licencia libre (ver abajo). |
| `fijada` | Opcional. `true` solo para guías que deben seguir en portada más de 48 horas. |

No pongas `fecha`: la pone el panel al publicar.

## Reglas editoriales (no negociables)

- **Nada inventado.** Ni cifras, ni citas, ni horas. Si no está en una fuente, no se publica.
- **Neutralidad política.** pulso es transversal: mismo trato a todos los partidos y ninguna información se evita por su tema. Nada de adjetivos valorativos. Cuando se cuenta la agenda de campaña, se reparte entre formaciones.
- **Encuestas:** del martes 24 al domingo 29 de noviembre de 2026 la ley prohíbe publicar sondeos electorales nuevos. No se publican.
- **Jornada de reflexión** (sábado 28): nada que pida el voto ni campaña; solo información práctica.
- **Fotos:** solo con licencia libre (Wikimedia Commons) o propias. Nunca fotos de otros medios ni de agencias. Si no hay una foto adecuada, `null`: la web pone el nombre de la sección en letra gigante.
- **Lenguaje claro**, frases cortas, sin jerga. Se explica lo que no es obvio.

## Fotos de Wikimedia Commons

Búsqueda por la API pública (sin datos personales en la petición):

```
https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrsearch=<búsqueda>&gsrlimit=8&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200
```

- De `extmetadata` salen el autor (`Artist`, sin el HTML) y la licencia (`LicenseShortName`). Usa solo CC0, CC BY, CC BY-SA o dominio público.
- En `imagen` pon:
  - `src`: la `thumburl` (la de 1200 px);
  - `alt`: qué se ve en la foto;
  - `credito`;
  - `licencia`;
  - `enlace`: la `descriptionurl`.
- El panel copia la foto a su propio almacén, así que no hace falta descargarla.
- Si la API responde «429», espera unos segundos y vuelve a intentarlo.
