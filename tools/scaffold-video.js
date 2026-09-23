/*
 * scaffold-video.js — Convierte una guía de EmpiezaPadel en un proyecto de vídeo
 * HyperFrames (vertical TikTok) casi listo para renderizar, para no tener que
 * escribir a mano el storyboard/guion de cada vídeo.
 *
 * Uso:   node tools/scaffold-video.js <idGuía>        (p. ej. g8)
 *        node tools/scaffold-video.js --list          (lista las guías)
 *
 * Qué genera en videos/<slug>/ :
 *   - BRIEF.md, capture/extracted/{visible-text.txt,tokens.json}
 *   - frame.md, referencia-demo.html, cover.html (plantilla de portada) y assets/fonts/
 *     (copiados de tools/video-assets/; estilo "producto 3D en pista de noche", aprobado
 *     el 23/09/2026 — el blockframe lima/negro anterior queda en frame-blockframe.md)
 *   - assets/img/<id>.png: foto REAL de cada producto que nombra la guía, sin fondo
 *     (tools/video-assets/recortar-fondo.py)
 *   - STORYBOARD.md + SCRIPT.md  (listicle: gancho + N puntos + CTA, con el ESCENARIO
 *     COMPARTIDO ya escrito y las ventanas de plano por tiempos)
 *
 * Luego solo quedan los pasos "de máquina/agente" (ver README al final de la salida):
 *   voz TTS → construir frames → ensamblar → render.
 *
 * DISEÑO: la construcción de los frames HTML la hace un agente (workers de HyperFrames),
 * así que esto NO produce el MP4 solo; automatiza todo lo de ANTES (que era el 80% del
 * trabajo manual). Los textos generados son un BORRADOR sólido: repasa gancho y VO.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REF = path.join(ROOT, 'tools', 'video-assets'); // estilo de vídeo versionado (frame.md, referencia, fuentes)
const MAX_POINTS = 6;         // tope de puntos (frames de contenido) por vídeo
const VOICE = '3daec88b3c1a49b7a5e10a211426fc81'; // HeyGen "Fernando Sanz" (Mateo sonaba anglosajón)
const SPEED = '1.5';          // ver memoria tiktok-video-pipeline

// ---- extracción de guides desde index.html (mismo enfoque que generate-pages.js) ----
const indexSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function extractLiteral(src, marker, open, close) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('No encontrado: ' + marker);
  const openIdx = src.indexOf(open, start);
  let depth = 0, inStr = false, strCh = '', esc = false;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === strCh) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  throw new Error('Literal sin cerrar: ' + marker);
}
const guides = new Function('return (' + extractLiteral(indexSrc, 'const guides =', '{', '}') + ')')();
const products = ['palas', 'zapatillas', 'accesorios'].flatMap((k) =>
  new Function('return (' + extractLiteral(indexSrc, 'const ' + k + ' =', '[', ']') + ')')());
function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
// Productos de index.html que nombra un texto (marca + modelo, o modelo si es largo), en orden de aparición.
function findProducts(text) {
  const h = ' ' + norm(text) + ' ';
  const pos = (pr) => {
    for (const k of [pr.brand + ' ' + pr.name, pr.name]) {
      const n = norm(k);
      if (n.length >= 6 && h.includes(' ' + n + ' ')) return h.indexOf(' ' + n + ' ');
    }
    // nombre abreviado en el texto ("Bullpadel Premium Pro" = "Premium Pro Padel Ball x3"): marca + las
    // primeras palabras del modelo (mínimo 2)
    const w = norm(pr.name).split(' ');
    for (let k = w.length - 1; k >= 2; k--) {
      const n = ' ' + norm(pr.brand) + ' ' + w.slice(0, k).join(' ') + ' ';
      if (h.includes(n)) return h.indexOf(n);
    }
    return -1;
  };
  return products.map((pr) => [pr, pos(pr)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([pr]) => pr);
}

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function stripHtml(s) { return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function firstSentence(s, max = 90) {
  const t = stripHtml(s);
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  let out = (m ? m[1] : t).trim();
  if (out.length > max) out = out.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return out;
}
function upper(s) { return String(s).toUpperCase(); }

// Acorta un titular para la tarjeta (quita "según…", ": …", paréntesis, y numeración/emoji inicial).
function shortHeading(h) {
  return stripHtml(h)
    .replace(/^\s*(?:[🥇🥈🥉0-9]+[.)\-–]?\s*)+/u, '')     // "1. ", "🥇 "
    .replace(/\s*[:(].*$/, '').replace(/\s+según.*$/i, '').trim();
}

// Extrae los puntos del cuerpo. Dos formatos habituales en las guías:
//  (a) educación/comparativa → cada <h4> es un punto (texto = <p> siguiente).
//  (b) "top N" → una <p> con lista separada por <br> (a veces con <strong>/números);
//      esos items son los puntos (el ranking). Si aparece una lista de >=3, gana.
function extractPoints(body) {
  // ¿hay una lista <br> de >=3 items dentro de algún <p>?
  const paras = [...body.matchAll(/<p[^>]*>(.*?)<\/p>/gis)].map((m) => m[1]);
  for (const p of paras) {
    if (!/<br\s*\/?>/i.test(p)) continue;
    const items = p.split(/<br\s*\/?>/i).map((s) => stripHtml(s)).filter((s) => s.length > 3);
    if (items.length >= 3) {
      return items.slice(0, MAX_POINTS).map((it) => {
        // "1. Nox ML10 – La más cómoda" → heading="Nox ML10", takeaway="La más cómoda"
        const m = it.match(/^(.*?)\s*[–\-—:]\s*(.+)$/);
        const heading = shortHeading(m ? m[1] : it);
        return { heading, takeaway: m ? m[2].trim() : it, full: it };
      });
    }
  }
  // fallback: secciones <h4> + <p>
  const pts = [];
  const re = /<h4[^>]*>(.*?)<\/h4>\s*<p[^>]*>(.*?)<\/p>/gis;
  let m;
  while ((m = re.exec(body)) && pts.length < MAX_POINTS) {
    pts.push({ heading: shortHeading(m[1]) || stripHtml(m[1]), takeaway: firstSentence(m[2]), full: stripHtml(m[2]) });
  }
  return pts;
}

function esc(s) { return String(s).replace(/"/g, '\\"'); }

// ------------------------------ CLI ------------------------------
const arg = process.argv[2];
if (!arg || arg === '--list') {
  console.log('Guías disponibles:\n');
  for (const id of Object.keys(guides)) console.log(`  ${id.padEnd(4)} ${guides[id].title}`);
  console.log('\nUso: node tools/scaffold-video.js <idGuía>');
  process.exit(0);
}
const id = arg;
const g = guides[id];
if (!g) { console.error(`Guía "${id}" no existe. Usa --list.`); process.exit(1); }

const points = extractPoints(g.body);
if (!points.length) { console.error('No se extrajeron puntos (¿la guía no tiene <h4>?).'); process.exit(1); }
// Cada punto: productos que nombra su sección; el principal es el primero que no fue principal antes.
const usados = new Set();
points.forEach((p) => {
  p.prods = findProducts(p.heading + ' ' + (p.full || p.takeaway));
  p.prod = p.prods.find((x) => !usados.has(x.id)) || null;
  if (p.prod) usados.add(p.prod.id);
});

const slug = slugify(g.title).slice(0, 60);
const projDir = path.join(ROOT, 'videos', slug);
if (fs.existsSync(projDir)) { console.error(`Ya existe ${path.relative(ROOT, projDir)} — bórralo o usa otro.`); process.exit(1); }

// ------------------------------ escribir proyecto ------------------------------
const mk = (p) => fs.mkdirSync(path.join(projDir, p), { recursive: true });
const wr = (p, c) => fs.writeFileSync(path.join(projDir, p), c);
mk('capture/extracted'); mk('.hyperframes'); mk('compositions/frames'); mk('assets/fonts'); mk('assets/img');

// estilo "producto 3D en pista de noche" (tools/video-assets/): guía, referencia, plantilla de portada, fuentes
const cp = (from, to) => { if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(projDir, to)); return true; } return false; };
cp(path.join(REF, 'frame.md'), 'frame.md');
cp(path.join(REF, 'caption-skin.html'), '.hyperframes/caption-skin.html');
cp(path.join(REF, 'estilo', 'referencia-demo.html'), 'referencia-demo.html');
cp(path.join(REF, 'estilo', 'portada-plantilla.html'), 'cover.html');
for (const f of fs.readdirSync(path.join(REF, 'fonts'))) cp(path.join(REF, 'fonts', f), 'assets/fonts/' + f);
// foto REAL de cada producto, sin fondo, para el 3D
const sinFoto = [];
new Set(points.flatMap((p) => p.prods)).forEach((pr) => {
  const src = path.join(ROOT, pr.img || '');
  if (!pr.img || !fs.existsSync(src)) { sinFoto.push(pr.id); return; }
  try {
    require('child_process').execFileSync('python', [path.join(REF, 'recortar-fondo.py'), src, path.join(projDir, 'assets', 'img', pr.id + '.png')], { stdio: 'ignore' });
  } catch (e) { cp(src, 'assets/img/' + pr.id + path.extname(src)); sinFoto.push(pr.id + ' (sin recortar)'); }
});

// capture
wr('capture/extracted/visible-text.txt', `${g.title}\n\n${stripHtml(g.body)}\n\nLa guía completa, en empiezapadel.es`);
wr('capture/extracted/tokens.json', JSON.stringify({
  title: g.title, description: firstSentence(g.body, 140),
  colors: ['#c8f135', '#0d0d0d', '#9ec22a'], fonts: ['DM Serif Display', 'DM Sans']
}, null, 2) + '\n');

// BRIEF.md
wr('BRIEF.md', `---
workflow: faceless-explainer
flow: automation
storyboard: no
message: "${esc(g.title)}"
destination: tiktok
aspect: "9:16"
language: es
audience: "Principiantes de pádel con presupuesto ajustado"
angle: listicle
voice_provider: heygen
---

## Intent
Vídeo TikTok generado desde la guía ${id} ("${g.title}") con el scaffolder. Voz honesta
anti-postureo (EmpiezaPadel). CTA a empiezapadel.es. REVISAR gancho y VO antes de renderizar.

## Notes
- Landing: /guias/${slugify(g.title)}/
- Nunca inventar datos.
`);

// STORYBOARD.md
const N = points.length;
let sb = `---
format: 1080x1920
duration: ${8 + N * 6}s
message: "${esc(g.title)}"
arc: "Hook → ${N} puntos → CTA"
audience: "Principiantes de pádel (TikTok)"
angle: listicle
mode: autonomous
music: "energetic upbeat sporty underscore, punchy, sin voz"
---

## Video direction
- **estilo**: "Producto 3D en pista de noche / motion comic" — LEER frame.md y referencia-demo.html (en este proyecto) antes de construir nada y reutilizar su CSS/patrones.
- **palette** (frame.md): #070907 + verde oscuro, lima #c8f135 = marca y dato clave, texto #f2f5ea, rojo #ff4d5e para "no lo necesitas". Nunca inventar colores.
- **motion**: eases power3/expo, VO-paced (cada pieza entra en su cue hablado). Reposo: producto girando despacio, focos oscilando, polvo. Fotograma 0 nunca vacío.
- **ESCENARIO COMPARTIDO (puntos)**: pill "Nº X" arriba · producto 3D con su FOTO REAL sin fondo (assets/img/<id>.png) que cae girando y aterriza (thock) · 1–2 viñetas de motion comic que ilustran el porqué del consejo (pista, trayectoria de bola, forma de pala, punto dulce…) · caption narrativo con la frase de la VO y la clave en lima. Puntos sin producto: solo viñeta.
- **negative list**: sin nav/cursores/chrome, sin bokeh ni degradados "AI", sin emojis. Contenido en el 83% superior (UI de TikTok tapa el borde inferior).

## Frame 1 — Gancho
- scene: Título-gancho a pantalla completa
- voiceover: "EDITAR gancho: engancha en 2s con el problema o la promesa de '${g.title}'."
- duration: 4s
- transition_in: cut
- status: outline
- type: hook
- persuasion: Direct address
- beat: intriga
- blueprint: kinetic-type-beats (Adapt)
- focal: la frase-gancho
- roles: frase = foreground · fondo negro dot-grid = background · pill = supporting
- src: compositions/frames/01-gancho.html

Scene 1 (0.0–1.3s): entra una primera línea de contexto (DM Sans, upper, centrado alto). Fondo negro dot-grid lima ~12%.
Scene 2 (1.3–2.7s): la línea-gancho hace scale-pop en DM Serif lima, dominando el centro.
Scene 3 (2.7–4.0s): remate + hold quieto.

narrativeRole: Abrir el hueco de curiosidad del tema.
keyMessage: ${firstSentence(g.body, 80)}
`;

let script = `# SCRIPT — ${slug}

**Voice:** HeyGen Narrator Mateo (${VOICE}) · --speed ${SPEED}
**Voice direction:** Cercano, directo, honesto, sin locución publicitaria. Ritmo ágil.

---

## Line 1 — Gancho (Frame 1)
**Delivery:** Reto directo a cámara.

    EDITAR: gancho de 1 frase que enganche en 2 segundos.
`;

points.forEach((p, i) => {
  const n = i + 2;               // frame number
  const fid = String(n).padStart(2, '0');
  sb += `
## Frame ${n} — Punto ${i + 1}: ${p.heading}
- scene: Nº ${i + 1} · ${p.prod ? `producto 3D "${esc(p.prod.brand + ' ' + p.prod.name)}"` : `viñeta "${esc(p.heading)}"`} · motion comic del porqué · caption
- voiceover: "${esc(p.heading)}: ${esc(firstSentence(p.takeaway, 70))}"
- duration: 6s
- transition_in: push-slide UP
- status: outline
- type: feature_showcase
- persuasion: Progressive disclosure
- beat: comprension
- blueprint: kinetic-type-beats (Adapt)
- focal: el titular "${upper(p.heading)}"
- roles: producto 3D = foreground · viñeta = foreground · caption = foreground · atmósfera = background
- sfx: thock, pop
- src: compositions/frames/${fid}-punto-${i + 1}.html
${p.prods.length ? p.prods.map((x) => `- producto${x === p.prod ? ' PRINCIPAL' : ''}: id ${x.id} · "${esc(x.brand + ' ' + x.name)}" · foto assets/img/${x.id}.png · ${x.level && /^pd/.test(x.id) ? "nivel " + x.level + " · " : ""}${x.price ? x.price + ' € · ' : ''}specs ${esc(JSON.stringify(x.specs || {}))}`).join('\n')
  : `- producto: ninguno con ficha en esta sección. Si es un consejo general, ilústralo solo con viñeta. Si nombra un producto concreto sin ficha, crea antes la ficha con datos verificados y su foto real.`}

Usa el ESCENARIO COMPARTIDO (frame.md + referencia-demo.html).
Scene 1 (0.0–1.3s): pill "Nº ${i + 1}" + ${p.prod ? 'el producto 3D cae girando y aterriza (thock)' : 'entra la viñeta del consejo'} mientras se dice el titular.
Scene 2 (1.3–4.4s): viñeta de motion comic con el porqué (1–2 golpes visuales); caption palabra a palabra con la frase de la VO.
Scene 3 (4.4–6.0s): ${p.prod ? 'vuelve el producto girando despacio + ' : ''}tag con "${esc(firstSentence(p.takeaway, 60))}"; hold.

narrativeRole: Enseñar el punto ${i + 1} del tema.
keyMessage: ${p.takeaway}
`;
  script += `
## Line ${n} — Punto ${i + 1} (Frame ${n})
**Delivery:** Claro, un punto por respiración.

    ${p.heading}: ${firstSentence(p.takeaway, 70)}
`;
});

const cta = N + 2;
sb += `
## Frame ${cta} — CTA
- scene: Wordmark EmpiezaPadel lima + URL empiezapadel.es
- voiceover: "La guía completa, gratis, en empiezapadel punto es."
- duration: 4s
- transition_in: crossfade
- status: outline
- type: cta
- persuasion: Callback + Distillation
- beat: resolucion
- blueprint: titlecard-reveal (Reproduce)
- focal: wordmark EmpiezaPadel + URL
- roles: wordmark = foreground · "gratis" pill = supporting · icono pala = supporting · fondo = background
- sfx: soft-chime
- src: compositions/frames/${String(cta).padStart(2, '0')}-cta.html

Reproduce de titlecard-reveal en el estilo de frame.md: productos de la guía en fila girando sobre la pista, wordmark con "Padel" en lima.
Scene 1 (0.0–1.4s): icono de pala + "EmpiezaPadel" (Padel en lima) slide-up al centro.
Scene 2 (1.4–2.8s): "La guía completa, GRATIS" debajo; "GRATIS" en pill lima.
Scene 3 (2.8–4.0s): "empiezapadel.es" subrayado en lima; hold.

narrativeRole: Convertir la atención en tráfico a la web.
keyMessage: La guía entera está gratis en empiezapadel.es.
`;

script += `
## Line ${cta} — CTA (Frame ${cta})
**Delivery:** Cálido; "gratis" con énfasis.

    La guía completa, gratis, en empiezapadel punto es.
`;

wr('STORYBOARD.md', sb);
wr('SCRIPT.md', script);

// ------------------------------ instrucciones ------------------------------
const rel = path.relative(ROOT, projDir).replace(/\\/g, '/');
const SK = 'C:/Users/marti/.claude/skills/faceless-explainer/scripts';
console.log(`✓ Proyecto creado: ${rel}
  guía: ${id} — "${g.title}"
  frames: 1 gancho + ${N} puntos + 1 CTA = ${N + 2}
  productos por punto: ${points.map((p, i) => (i + 1) + ') ' + (p.prods.length ? p.prods.map((x) => x.id + ' ' + x.name).join(', ') : 'consejo general')).join(' · ')}
${sinFoto.length ? '  ⚠ sin foto recortada: ' + sinFoto.join(', ') + '\n' : ''}
REVISA primero (borrador): el gancho (Frame 1 / Line 1) y las líneas de VO en SCRIPT.md.

Luego, pasos de máquina/agente (desde ${rel}/):
  1. Voz+música+SFX:  node "${SK}/audio.mjs" --script ./SCRIPT.md --storyboard ./STORYBOARD.md --hyperframes . --out ./audio_meta.json --voice ${VOICE} --speed ${SPEED}
  2. sync + sfx:      node "${SK}/audio.mjs" sync-durations --audio-meta ./audio_meta.json --storyboard ./STORYBOARD.md
                      node "${SK}/audio.mjs" fetch-sfx --storyboard ./STORYBOARD.md --hyperframes .
  3. packets:         node "${SK}/frame-packets.mjs" --project . --storyboard ./STORYBOARD.md
  4. Construir frames: despachar 1 worker por frame (Claude) con _role.md + su packet.
  5. Ensamblar:       node "${SK}/assemble-index.mjs" --storyboard ./STORYBOARD.md --hyperframes .
                      node "${SK}/transitions.mjs" inject --storyboard ./STORYBOARD.md --hyperframes .
  6. Check + render:  npx hyperframes@0.8.63 check  &&  npx hyperframes@0.8.63 render --skill=faceless-explainer --quality high --output renders/video.mp4
`);
