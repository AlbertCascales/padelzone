# EmpiezaPadel (empiezapadel.es)

Web estática de reseñas y guías de material de pádel, con monetización por afiliación.
**El directorio se llama `padelzone` (y el repo también), pero el sitio es EmpiezaPadel** — nombre antiguo.
Repo: `https://github.com/AlbertCascales/padelzone.git` · Deploy: Cloudflare Pages (push a `main` despliega).

Es el mismo patrón que `empiezalibros.es` (en `Downloads/empiezalibros`) aplicado a pádel.

## Arquitectura: index.html es la única fuente de la verdad

Los datos de **productos y guías viven dentro de `index.html`**, en literales JavaScript. No hay base
de datos. `tools/generate-pages.js` los extrae parseando `index.html` y genera las fichas
(`/palas/<slug>/`, `/zapatillas/<slug>/`, `/accesorios/<slug>/`), las guías, los hubs y el `sitemap.xml`.

**Para añadir contenido: se edita `index.html` y se ejecuta `node tools/generate-pages.js`.** Nunca
editar a mano las páginas generadas.

## Scripts (`tools/`)

| Script | Qué hace |
|---|---|
| `generate-pages.js` | Regenera páginas y sitemap desde `index.html`. Ejecutar tras cada cambio de contenido. |
| `telegram-send.js` | `publish` publica 1 elemento pendiente en `@Empiezapadel`; `status` muestra cuántos quedan sin publicar nada. |

## Estado de las rutinas (dentro del repo)

- `telegram-radar/known.json` — qué se ha publicado ya en Telegram. La cola de pendientes se calcula
  cruzando esto con lo que hay en `index.html`.
- `telegram-radar/rotation.json` — rotación de contenido.
- `reddit-radar/vistos.txt` — hilos de Reddit ya procesados.

La rutina de Telegram es **independiente** de la generación de contenido web: publica el pendiente más
antiguo de la cola, no lo generado ese día.

## Secretos

Fuera del repo: token del bot en `C:\Users\marti\.empiezapadel-secrets\telegram-bot.token`.
Nunca imprimirlo ni commitearlo.

## Rutinas programadas

En `C:\Users\marti\.claude\scheduled-tasks\`: `empiezapadel-contenido-auto`,
`empiezapadel-telegram-auto`, `empiezapadel-newsletter-auto`, `empiezapadel-reddit-radar`.

## Convenciones

- Commits en español, en imperativo, describiendo el efecto ("Añadir pala X y guía sobre Y").
- El "producto del momento" rota cada 2 días entre cualquier categoría.
- Iconos propios (pala, pelota) en vez de emojis en la web; en Telegram sí se usa 🏓.
- `_headers`: caché larga de imágenes y cabeceras de seguridad (convención de Cloudflare Pages).
- Servidor local: `npx serve .` (ya definido en `.claude/launch.json`).

## Mantenimiento de este fichero

Si un cambio contradice algo que este fichero afirma (rutas, flujo de despliegue, scripts, secretos,
decisiones con historia), **actualízalo en el mismo commit que el cambio**. Un CLAUDE.md
desactualizado es peor que no tenerlo: se cree sin verificar y lleva a actuar sobre supuestos falsos.

**No es un changelog.** No se anota aquí el contenido añadido ni el trabajo de cada sesión: solo lo
estructural, lo que no se deduce leyendo el código, y lo que costó descubrir una vez y no debería
costar dos. Si supera las ~120 líneas, recortar lo que ya sea evidente desde el propio código.
