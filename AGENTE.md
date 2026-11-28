# Agente redactor de pulso

Instrucciones para el agente que prepara la edición diaria de **pulso** (pulso.com.es).

El agente **ya no publica**: prepara **borradores** y los entrega al panel de redacción (`pulso.com.es/admin`). Allí el equipo los revisa, corrige y decide cuáles salen. Si nadie los revisa, **a la hora de la edición se publican solos** los que el agente haya marcado como propuesta.

El agente **no toca el repositorio**: ni código, ni `data/noticias.json`, ni commits. Solo escribe un archivo `edicion.json` en su carpeta de trabajo y lo envía con `scripts/enviar.py`.

## Cuándo: tres ediciones al día

| Se lanza (Madrid) | `tipo` | Sale sola a las | Qué es |
| --- | --- | --- | --- |
| 6:30 | `manana` | 7:00 | La edición completa: 12 noticias, 8 propuestas. |
| 13:30 | `tarde` | 14:00 | Actualización: 2 a 4 noticias nuevas o actualizadas y los momentos de la tarde. |
| 20:30 | `noche` | 21:00 | Actualización: lo mismo para la noche. |

Mira la hora con `TZ=Europe/Madrid date` y elige el `tipo`: antes de las 11:00 es `manana`, entre las 11:00 y las 18:00 es `tarde`, y a partir de las 18:00 es `noche`. El tipo `especial` (sale como pronto a las 23:30) solo se usa si el encargo lo pide expresamente, como la noche electoral. Si se lanza tarde, la edición sale sola 30 minutos después de entregarla.

Así la portada nunca se queda con todo «de esta mañana»: lo que pasa a lo largo del día entra en la siguiente edición.

## Paso a paso

1. **Mira qué hay publicado**: `curl -s https://pulso.com.es/api/noticias`. Así sabes qué noticias siguen en portada y no repites.
2. **Busca la actualidad del día** en España y el mundo, pensando en lectores de 16 a 30 años. Puntos de partida útiles:
   - Agendas de EFE en Infobae: «Temas del día de EFE España» y «Hoy será noticia» (busca la del día).
   - Medios de distinta línea editorial (por ejemplo: El País, El Mundo, elDiario.es, El Español, ABC, La Vanguardia, Público, 20minutos, RTVE).
   - Fuentes oficiales: BOE, ministerios, AEMET, INE, UEFA, organismos europeos.
3. **Prepara las noticias**:
   - **Mañana:** 12 repartidas por secciones. Marca con `"propuesta": true` las **8** que recomiendas publicar. Las otras 4 llevan `"propuesta": false` y son alternativas para que el equipo elija.
   - **Tarde y noche:** solo lo que haya **cambiado o sido noticia desde la última edición**, de 2 a 4 noticias, todas propuestas. Si no ha pasado nada relevante, manda 1 noticia útil y no rellenes.
   - A cada una ponle una **importancia** del 1 al 5 (ver abajo): decide el orden de la portada.
   - Comprueba cada dato en al menos una fuente fiable. Si dos fuentes no coinciden, cuenta solo lo que coincide o dilo.
4. **Escribe cada noticia** con las reglas de abajo.
5. **Si algo publicado ha cambiado**, por ejemplo un partido que era previa y ya tiene resultado, escribe una noticia **nueva con otro `id`** (por ejemplo `real-madrid-psv-resultado`) y pon el `id` antiguo en `"sustituye"`. La nueva sale con la etiqueta «actualizada», sube en portada y la vieja se retira a la vez. Pon en `retirar` las noticias que ya no tengan sentido en portada. Las de más de 48 horas salen solas, salvo las guías fijadas. Retirar solo las saca de la portada: siguen en la hemeroteca (/hemeroteca) y en su enlace (/noticia/<id>), y la vieja enlaza a la actualizada.
6. **Marca una sola noticia con `"destacado": true`**: la más importante del día, y tiene que ser una de las propuestas. En tarde y noche, solo si hay algo más importante que la destacada de la mañana.
7. **Escribe `momentos`** con 3 puntos cada uno. Cada punto apunta a un `id` de esta edición o de las que ya están publicadas. Por la mañana, los tres (mañana, tarde y noche); en la edición de la tarde, solo `tarde` (y `noche` si quieres); en la de la noche, solo `noche`. Los que no mandes se quedan como estaban.
8. **Guarda todo en `edicion.json`** con este formato:

   ```json
   {
     "tipo": "manana",
     "noticias": [
       { "id": "…", "propuesta": true, "importancia": 5, "destacado": true, "categoria": "…", "momento": "manana",
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

9. **Entrega**: `python3 scripts/enviar.py edicion.json`. Necesita la variable de entorno `PULSO_AGENTE_KEY`. Si no tienes el repositorio, vale con `curl -s -X POST https://pulso.com.es/api/agente/edicion -H "Authorization: Bearer $PULSO_AGENTE_KEY" -H "Content-Type: application/json" --data-binary @edicion.json`.
   - Si responde con errores, corrígelos uno por uno y vuelve a enviar. Mientras nadie la haya tocado, la misma edición se puede reenviar.
   - Al aceptarla, el panel manda un email al equipo avisando de que la edición está lista.
10. **Termina** con un resumen: cuántas noticias, cuáles propones y cualquier duda que el equipo deba revisar, por ejemplo un dato que no has podido confirmar.

## Cómo se escribe una noticia

| Campo | Regla |
| --- | --- |
| `id` | Minúsculas y guiones, único: `champions-miercoles-25`. Nunca reutilices el de una noticia ya publicada. |
| `propuesta` | `true` si recomiendas publicarla, `false` si es alternativa. |
| `importancia` | Del 1 al 5. **5:** lo más importante del día (1 o 2 como mucho). **4:** muy relevante. **3:** normal, la mayoría. **2:** menor. **1:** relleno. La portada se ordena con este número y la edad: cada 8 horas una noticia «pesa» la mitad. |
| `sustituye` | Opcional. `id` de una noticia publicada que esta actualiza. La vieja se retira cuando sale la nueva. |
| `categoria` | `elecciones`, `espana`, `mundo`, `economia`, `tecnologia`, `clima`, `cultura` o `deportes`. |
| `momento` | `manana`, `tarde` o `noche`: cuándo le interesa más al lector. |
| `titular` | Propio, claro, máximo unos 90 caracteres (el panel no acepta más de 110). Nunca copiado de otro medio. |
| `entradilla` | Una o dos frases con lo esencial. |
| `puntos` | **2 o 3** frases cortas con los datos clave (en Flash no cabe más). |
| `porque` | «Por qué te importa»: una frase que conecte con la vida de alguien de 16 a 30 años. |
| `fuentes` | Siempre al menos una, con `medio` y `url` a la información original. |
| `titulares` | «Cómo lo titulan»: titulares **literales** de otros medios, con su nombre y enlace. Mejor si son de líneas editoriales distintas. Puede ir vacío. |
| `imagen` | `null` o una foto con licencia libre (ver abajo). |
| `montaje` | Opcional. Si no hay foto buena y la noticia lo merece: la idea de montaje en una frase. No se ve en la web. |
| `fijada` | Opcional. `true` solo para guías que deben seguir en portada más de 48 horas. |

No pongas `fecha`: la pone el panel al publicar.

## Reglas editoriales (no negociables)

- **Nada inventado.** Ni cifras, ni citas, ni horas. Si no está en una fuente, no se publica.
- **Neutralidad política.** pulso es transversal: mismo trato a todos los partidos y ninguna información se evita por su tema. Nada de adjetivos valorativos. Cuando se cuenta la agenda de campaña, se reparte entre formaciones.
- **Encuestas:** del martes 24 al domingo 29 de noviembre de 2026 la ley prohíbe publicar sondeos electorales nuevos. No se publican.
- **Jornada de reflexión** (sábado 28): nada que pida el voto ni campaña; solo información práctica.
- **Fotos:** solo con licencia libre (Wikimedia Commons) o propias. Nunca fotos de otros medios ni de agencias. Si no hay una foto adecuada, `null`: la web pone el nombre de la sección en letra gigante. Si la noticia ganaría mucho con imagen (importancia 4 o 5, o destacada), añade además `"montaje": "idea en una frase"` (qué montaje gráfico harías: elementos, sin fotos de otros medios); Nacho lo ve en el email y en el panel y decide si lo hace. No pidas montaje en más de 3 noticias por edición.
- **Lenguaje claro**, frases cortas, sin jerga. Se explica lo que no es obvio.

## Fotos de Wikimedia Commons

**Busca siempre con el script**, no con curl ni con Python a mano: Commons rechaza (error 403 o respuesta vacía) a quien no se identifica, y desde tu entorno a veces no responde. El script pregunta a pulso, que busca por ti, y si no puede va a Commons identificándose:

```
python3 scripts/fotos.py "La Restinga El Hierro puerto"
```

- Cada resultado trae el bloque `imagen` listo para pegar (`src`, `credito`, `licencia`, `enlace`). Solo tienes que escribir `alt`: qué se ve en la foto.
- Solo salen licencias libres (CC0, CC BY, CC BY-SA, dominio público).
- **Objetivo: foto en al menos la mitad de las noticias**, y siempre que se pueda en la destacada y en las de importancia 4 o 5.
- Busca por lo que se ve, no por la noticia:
  - el lugar, el edificio, el objeto o el evento («Congreso de los Diputados», «urna electoral», «Estadio Metropolitano»);
  - si en castellano no sale nada, prueba en inglés.
- **Personas:** solo fotos de Commons de la propia persona, sin montajes.
- Si después de 2 o 3 búsquedas no hay foto que encaje, `imagen: null` y, si la noticia lo merece, `montaje`.
- El panel copia la foto a su propio almacén, así que no hace falta descargarla.
