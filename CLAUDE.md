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

## Estado de las rutinas (dentro del repo, en `.gitignore`)

- `telegram-radar/known.json` — qué se ha publicado ya en Telegram. **Única fuente de la verdad** de la
  cola: los pendientes se calculan cruzando esto con lo que hay en `index.html`.
  Ojo: el arranque inicial marcó todo el catálogo como "ya conocido" sin publicarlo de verdad, así que
  hay elementos antiguos que nunca saldrán en el canal. Es intencionado (evita inundarlo de golpe).
- `reddit-radar/vistos.txt` — hilos de Reddit ya procesados.

## Secretos

Fuera del repo, en `C:\Users\marti\.empiezapadel-secrets\`: `telegram-bot.token` y `mailerlite.key`.
Nunca imprimirlos ni commitearlos. Los scripts los leen solos de esa ruta; no hace falta pasarlos por
el chat.

## Rutinas programadas

En `C:\Users\marti\.claude\scheduled-tasks\`. Son **independientes entre sí**; ninguna espera a la otra:

| Rutina | Hora | Qué hace |
|---|---|---|
| `empiezapadel-contenido-auto` | 04:00 diario | Añade 1 producto + 1 guía a `index.html`, regenera y hace push. Termina ahí: no toca Telegram. |
| `empiezapadel-telegram-auto` | 05:00 diario | Publica en `@Empiezapadel` 1 elemento de la web que aún no esté en `known.json`. No tiene por qué ser el del día. |
| `empiezapadel-reddit-radar` | diario | Vigila r/Padelracket y r/padel; **solo prepara borradores**, nunca publica. |

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

- **Datos estructurados**: Google descarta las `review` cuyo `author` es la propia `Organization`
  (autorreseña) → Search Console las reporta como ausentes. Usar `aggregateRating`, y que **coincida
  con lo visible en la página** (por eso las fichas muestran el nº de valoraciones).
  El bloque "producto del momento" de la home **no lleva JSON-LD** a propósito: al ser rotativo por JS,
  cualquier schema estático se desincronizaría del contenido visible.
- **`_redirects` de Cloudflare Pages no hace redirecciones por dominio** (solo por ruta). El
  www→apex no está montado; lo cubre el `canonical`. Si se quiere de verdad, es una Redirect Rule
  del panel de Cloudflare, no un archivo del repo.
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
