# EmpiezaPadel (empiezapadel.es)

Web estática de reseñas y guías de material de pádel, con monetización por afiliación.
**El directorio se llama `padelzone` (y el repo también), pero el sitio es EmpiezaPadel** — nombre antiguo.
Repo: `https://github.com/AlbertCascales/padelzone.git` · Deploy: Cloudflare Pages (push a `main` despliega).

Es el mismo patrón que `empiezalibros.es` (en `Downloads/empiezalibros`) aplicado a pádel.

## Arquitectura: index.html es la única fuente de la verdad

Los datos de **productos y guías viven dentro de `index.html`**, en literales JavaScript. No hay base
de datos. `tools/generate-pages.js` los extrae parseando `index.html` y genera las fichas
(`/palas/<slug>/`, `/zapatillas/<slug>/`, `/accesorios/<slug>/`), las guías, los hubs, el `sitemap.xml`
y el `rss.xml`.

**Para añadir contenido: se edita `index.html` y se ejecuta `node tools/generate-pages.js`.** Nunca
editar a mano las páginas generadas.

Tag de afiliado Amazon: `albertomart09-21` (constante `STORE_ID` en `index.html`).

## Scripts (`tools/`)

| Script | Qué hace |
|---|---|
| `generate-pages.js` | Regenera páginas y sitemap desde `index.html`. Ejecutar tras cada cambio de contenido. |
| `telegram-send.js` | `publish` publica 1 elemento pendiente en `@Empiezapadel`; `status` muestra cuántos quedan sin publicar nada. |
| `indexnow-send.js` | Avisa a IndexNow de las URLs con `lastmod` de hoy. Ejecutar **después** de `generate-pages.js`. `--dry` para ver qué enviaría. |
| `gsc-report.js` | Informe de Search Console (solo lectura). `--perf` rendimiento (rápido), `--index` estado URL a URL (~95 llamadas, lento), sin flag ambos. Sin dependencias: JWT RS256 con módulos nativos. |

### Fechas: se sacan de git, no del reloj

`lastmod` (sitemap) y `datePublished`/`dateModified` (JSON-LD de guías) salen del historial de git
de cada página generada: primer commit = publicación, último commit = modificación. Es deliberado y
frágil de tocar:

- **Con la fecha de hoy sin más, el sitemap anunciaría las 85 URLs como "modificadas hoy" cada día**
  y Google acabaría ignorando el `lastmod`. Antes estaba hardcodeada a un día fijo, que es el otro
  extremo: páginas nuevas nacían diciendo que no se tocaban desde antes de existir.
- `datePublished` **no puede depender del reloj**: al regenerar a diario, reescribiría la fecha, el
  fichero quedaría sucio otra vez y se recommitearía solo en bucle. Por eso es el primer commit.
- La mtime del fichero no vale: el generador reescribe los 84 ficheros en cada ejecución.

## Estado de las rutinas (dentro del repo, en `.gitignore`)

- `telegram-radar/known.json` — qué se ha publicado ya en Telegram. **Única fuente de la verdad** de la
  cola: los pendientes se calculan cruzando esto con lo que hay en `index.html`.
  Ojo: el arranque inicial marcó todo el catálogo como "ya conocido" sin publicarlo de verdad, así que
  hay elementos antiguos que nunca saldrán en el canal. Es intencionado (evita inundarlo de golpe).
- `reddit-radar/vistos.txt` — residuo del radar de Reddit, ya eliminado (ver abajo). No lo lee nadie.

## Indexación

- **IndexNow**: la clave es `38f885e5cfd8d972588aa9d2ec5e4f2b`, servida en
  `/38f885e5cfd8d972588aa9d2ec5e4f2b.txt` (ese fichero **debe estar publicado** o IndexNow rechaza el
  envío). No es un secreto: es pública por diseño. **Google no usa IndexNow** — solo Bing y compañía;
  para Google el único canal sigue siendo el sitemap.
- El cuello de botella no es técnico: Search Console reportaba (17/07/2026) 53 URLs en
  **"Descubierta: actualmente sin indexar"** — Google las conoce y elige no rastrearlas. Eso es señal
  de valor percibido del contenido, no de configuración; no se arregla con sitemaps ni con pings.

## Secretos

Fuera del repo, en `C:\Users\marti\.empiezapadel-secrets\`: `telegram-bot.token`, `mailerlite.key` y
`gsc-service-account.json` (cuenta de servicio de Google, lectura de Search Console; la cuenta
`gsc-lector@empiezapadel-gsc.iam.gserviceaccount.com` está añadida como usuario en la propiedad, que
es **de dominio**: `sc-domain:empiezapadel.es`). Nunca imprimirlos ni commitearlos. Los scripts los
leen solos de esa ruta; no hace falta pasarlos por el chat.

## Rutinas programadas

En `C:\Users\marti\.claude\scheduled-tasks\`. Son **independientes entre sí**; ninguna espera a la otra:

| Rutina | Hora | Qué hace |
|---|---|---|
| `empiezapadel-contenido-auto` | 04:00 diario | **PAUSADA el 22/07/2026** (`enabled: false`). Añadía 1 producto + 1 guía a `index.html`, regeneraba y hacía push. Se paró porque estaba metiendo páginas que Google no indexa (8 de 95 URLs indexadas; ver [[gsc-indexacion-critica]] en memoria) y solo diluían el dominio. No borrada: reactivar con `update_scheduled_task enabled:true` cuando el sitio remonte indexación y haya con qué aportar valor real. |
| `empiezapadel-telegram-auto` | 05:00 diario | **PAUSADA el 22/07/2026** (`enabled: false`) a petición del usuario. Publicaba en `@Empiezapadel` 1 elemento de la web que aún no estuviera en `known.json`. No añade páginas ni afecta a la indexación; se paró para dejar toda la automatización de padel en pausa mientras el sitio remonta. Reactivar con `update_scheduled_task enabled:true`. |

Hubo un `empiezapadel-reddit-radar` (vigilaba r/Padelracket y r/padel y preparaba borradores sin
publicar nunca). **Eliminado el 19/07/2026**: llevaba tiempo sin estar registrado en el programador
aunque su carpeta seguía en disco, así que no corría. Lo mismo pasa con `empiezapadel-newsletter-auto`.
Ojo con esto al auditar: **que exista una carpeta en `.claude\scheduled-tasks\` no significa que la
tarea esté activa** — la lista real es la que devuelve `list_scheduled_tasks`.

Ambas rutinas de padel refrescan al final `node "C:\Users\marti\Downloads\cuadro-mando\generar.js"`
(cuadro de mando de solo lectura, paso no crítico).

Las tareas programadas **solo corren con la app de Claude abierta**. Por eso la rotación del "producto
del momento" NO es una tarea: se calcula en el JS de la página (ver Convenciones).

## Convenciones

- Commits en español, en imperativo, describiendo el efecto ("Añadir pala X y guía sobre Y").
- El **"producto del momento"** (home) rota cada 2 días entre cualquier categoría. Es JS en la propia
  página (`renderFeatured()`), determinista por fecha: `Math.floor(Date.now()/(2*86400000)) % pool`.
  Así funciona 24/7 sin depender de tareas ni despliegues.
- Iconos propios (pala, pelota) en vez de emojis en la web; en Telegram sí se usa 🏓 (no existe emoji
  de pala de pádel en Unicode; se valoraron 🎾/🏸/ninguno y se eligió 🏓 conscientemente).
- `_headers`: caché larga de imágenes y cabeceras de seguridad (convención de Cloudflare Pages).
- Servidor local: `npx serve .` (ya definido en `.claude/launch.json`, con `autoPort` porque otra
  sesión suele tener el 5173 ocupado).

## Trampas ya pisadas (no repetirlas)

- **Datos estructurados: las fichas NO llevan `aggregateRating`, y no es un olvido.** Google descarta
  las `review` cuyo `author` es la propia `Organization` (autorreseña) y Search Console las reporta
  como ausentes. El arreglo que se aplicó entonces —pasar a `aggregateRating` con un `reviewCount`
  inventado para que "coincidiera con lo visible"— **fue mucho peor que el problema**: convirtió una
  opinión propia (que Google solo ignoraba) en la afirmación de que N usuarios reales habían valorado
  el producto, o sea, dato fabricado y violación de las políticas de spam. Se revirtió el 17/07/2026:
  fuera el `aggregateRating` y fuera el campo `reviews` de los 56 productos.
  `stars` es **la nota editorial**: se muestra como "Nuestra valoración" y no se marca con schema.
  No hay forma legítima de expresar "la nota que le ponemos nosotros" en `aggregateRating`; si la
  ausencia de estrellas en el SERP vuelve a picar, la respuesta es que no se marca — no buscar otro
  campo con el que colarlo.
  El bloque "producto del momento" de la home **no lleva JSON-LD** a propósito: al ser rotativo por JS,
  cualquier schema estático se desincronizaría del contenido visible.
- **`_redirects` de Cloudflare Pages no hace redirecciones por dominio** (solo por ruta): eso se monta
  como Redirect Rule en el panel de Cloudflare, no con un archivo del repo. Ya está hecho y
  funcionando (verificado 17/07/2026): `www` → 301 → `https://empiezapadel.es/`, y `http` → 301 →
  `https`. No hay `_redirects` en el repo y no hace falta.
- **Dominio y correo**: dominio en DonDominio pero **DNS y hosting en Cloudflare** (los nameservers
  apuntan allí; DonDominio ya no gestiona el DNS). El dominio está autenticado en MailerLite y el
  remitente verificado es `newsletter@empiezapadel.es`.
- **Newsletter**: el formulario de MailerLite sigue vivo en la web y capta suscriptores, pero la rutina
  de envío automático se eliminó a petición del usuario. Si se retoma, el grupo es `SuscriptoresPadel`
  y RSS-to-email es de pago (el plan gratuito solo tiene campaña regular y A/B).

## Mantenimiento de este fichero

Si un cambio contradice algo que este fichero afirma (rutas, flujo de despliegue, scripts, secretos,
decisiones con historia), **actualízalo en el mismo commit que el cambio**. Un CLAUDE.md
desactualizado es peor que no tenerlo: se cree sin verificar y lleva a actuar sobre supuestos falsos.

**No es un changelog.** No se anota aquí el contenido añadido ni el trabajo de cada sesión: solo lo
estructural, lo que no se deduce leyendo el código, y lo que costó descubrir una vez y no debería
costar dos. Si supera las ~120 líneas, recortar lo que ya sea evidente desde el propio código.
