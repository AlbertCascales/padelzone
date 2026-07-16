/*
 * Publica en el canal de Telegram @Empiezapadel UN (1) elemento pendiente al día.
 *
 * Rutina INDEPENDIENTE de la generación de contenido de la web: cada ejecución mira
 * qué hay publicado en la web (index.html) y qué NO se ha publicado todavía en
 * Telegram (según telegram-radar/known.json), y publica el primero pendiente.
 * No tiene por qué ser el generado ese mismo día: se va vaciando la cola poco a poco.
 *
 * Uso:
 *   node tools/telegram-send.js publish   -> publica 1 elemento pendiente (el más antiguo en cola)
 *   node tools/telegram-send.js status    -> muestra cuántos quedan pendientes, sin publicar nada
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://empiezapadel.es';
const CHANNEL = '@Empiezapadel';
const TOKEN_PATH = 'C:\\Users\\marti\\.empiezapadel-secrets\\telegram-bot.token';
const STATE_DIR = path.join(ROOT, 'telegram-radar');
const KNOWN_PATH = path.join(STATE_DIR, 'known.json');

function readToken() {
  if (!fs.existsSync(TOKEN_PATH)) throw new Error('Falta el token en ' + TOKEN_PATH);
  const t = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
  if (!t) throw new Error('El archivo del token está vacío: ' + TOKEN_PATH);
  return t;
}

// ---------- Extracción de datos (misma lógica que tools/generate-pages.js) ----------
const indexSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function extractLiteral(src, marker, open, close) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('No encontrado: ' + marker);
  const openIdx = src.indexOf(open, start);
  let depth = 0, inStr = false, strCh = '', esc = false;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === strCh) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  throw new Error('Literal sin cerrar: ' + marker);
}
function evalLiteral(lit) { return new Function('return (' + lit + ')')(); }
function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function stripHtml(s) { return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function truncate(s, n) { s = s.trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; }

const palas      = evalLiteral(extractLiteral(indexSrc, 'const palas =', '[', ']'));
const zapatillas = evalLiteral(extractLiteral(indexSrc, 'const zapatillas =', '[', ']'));
const accesorios = evalLiteral(extractLiteral(indexSrc, 'const accesorios =', '[', ']'));
const guides     = evalLiteral(extractLiteral(indexSrc, 'const guides =', '{', '}'));

const CATS = { palas: 'palas', zapatillas: 'zapatillas', accesorios: 'accesorios' };

function buildCatalog() {
  const items = [];
  for (const [dir, arr] of [['palas', palas], ['zapatillas', zapatillas], ['accesorios', accesorios]]) {
    for (const p of arr) {
      const fullName = `${p.brand} ${p.name}`;
      const url = `${SITE}/${dir}/${slugify(fullName)}/`;
      items.push({
        key: url, type: 'producto',
        title: fullName,
        desc: truncate(stripHtml(p.desc || ''), 160) + (p.price ? ` Precio orientativo: ${p.price}€.` : ''),
        image: `${SITE}/${String(p.img).replace(/^\/+/, '')}`,
        url,
      });
    }
  }
  for (const id of Object.keys(guides)) {
    const g = guides[id];
    const url = `${SITE}/guias/${slugify(g.title)}/`;
    items.push({
      key: url, type: 'guía',
      title: g.title,
      desc: truncate(stripHtml(g.body || g.meta || ''), 160),
      image: `${SITE}/img/og-cover.jpg`,
      url,
    });
  }
  return items;
}

// ---------- Estado local (no se sube al repo) ----------
function ensureStateDir() { fs.mkdirSync(STATE_DIR, { recursive: true }); }
function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}
function saveJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }

// ---------- Telegram ----------
function sendPhoto(token, caption, imageUrl) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      chat_id: CHANNEL, photo: imageUrl, caption, parse_mode: 'HTML',
    }).toString();
    const req = https.request({
      hostname: 'api.telegram.org', path: `/bot${token}/sendPhoto`, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.ok) resolve(j.result); else reject(new Error(j.description || 'Error desconocido de Telegram'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function captionFor(item) {
  const icon = item.type === 'guía' ? '📖' : '🏓';
  return `${icon} <b>${escapeHtml(item.title)}</b>\n${escapeHtml(item.desc)}\n\n👉 ${item.url}`;
}
function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Elementos que están en la web pero todavía no se han publicado en Telegram.
function pendientes() {
  const known = loadJson(KNOWN_PATH, {});
  return buildCatalog().filter((it) => !known[it.key]);
}

async function cmdPublish() {
  ensureStateDir();
  const cola = pendientes();
  if (!cola.length) {
    console.log('Nada pendiente: todo el contenido de la web ya está publicado en Telegram.');
    return;
  }

  // Publica UNO por ejecución (el más antiguo pendiente); el resto queda en cola.
  const item = cola[0];
  const restantes = cola.length - 1;
  const token = readToken();
  try {
    await sendPhoto(token, captionFor(item), item.image);
    const known = loadJson(KNOWN_PATH, {});
    known[item.key] = true;
    saveJson(KNOWN_PATH, known);
    console.log('Publicado:', item.title, '->', item.url,
      restantes ? `(quedan ${restantes} pendientes en cola)` : '(cola vacía: web y Telegram al día)');
  } catch (e) {
    console.error('ERROR publicando', item.title, ':', e.message,
      '(no se marca como publicado; se reintentará en la próxima ejecución)');
    process.exit(1);
  }
}

function cmdStatus() {
  const catalog = buildCatalog();
  const cola = pendientes();
  console.log(`Catálogo en la web: ${catalog.length} elementos`);
  console.log(`Ya publicados en Telegram: ${catalog.length - cola.length}`);
  console.log(`Pendientes de publicar: ${cola.length}`);
  cola.slice(0, 5).forEach((it, i) => console.log(`  ${i + 1}. ${it.title}`));
  if (cola.length > 5) console.log(`  … y ${cola.length - 5} más`);
}

const cmd = process.argv[2];
(async () => {
  try {
    if (cmd === 'publish') await cmdPublish();
    else if (cmd === 'status') cmdStatus();
    else { console.error('Uso: node tools/telegram-send.js <publish|status>'); process.exit(1); }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
