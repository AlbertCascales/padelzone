/*
 * Publica en el canal de Telegram @Empiezapadel las novedades de la web
 * y, cada día, un producto ya existente del catálogo (goteo).
 *
 * Uso:
 *   node tools/telegram-send.js announce   -> anuncia productos/guías NUEVOS desde la última ejecución
 *   node tools/telegram-send.js daily      -> publica el siguiente producto del catálogo (rotación)
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
const ROTATION_PATH = path.join(STATE_DIR, 'rotation.json');

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

function captionFor(item, { isNew }) {
  const tag = isNew ? '🆕 Nuevo en EmpiezaPadel' : '📌 Del catálogo';
  const icon = item.type === 'guía' ? '📖' : '🎾';
  return `${tag}\n${icon} <b>${escapeHtml(item.title)}</b>\n${escapeHtml(item.desc)}\n\n👉 ${item.url}`;
}
function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function cmdAnnounce() {
  ensureStateDir();
  const catalog = buildCatalog();
  const bootstrap = !fs.existsSync(KNOWN_PATH);
  const known = loadJson(KNOWN_PATH, {});

  if (bootstrap) {
    catalog.forEach((it) => (known[it.key] = true));
    saveJson(KNOWN_PATH, known);
    console.log(`Primera ejecución: se ha marcado el catálogo actual (${catalog.length} elementos) como ya conocido. No se anuncia nada retroactivamente. A partir de ahora solo se anunciarán las novedades reales.`);
    return;
  }

  const nuevos = catalog.filter((it) => !known[it.key]);
  if (!nuevos.length) {
    console.log('Sin novedades desde la última ejecución.');
    return;
  }

  const token = readToken();
  for (const item of nuevos) {
    try {
      await sendPhoto(token, captionFor(item, { isNew: true }), item.image);
      known[item.key] = true;
      saveJson(KNOWN_PATH, known); // guarda tras cada envío por si algo falla a mitad
      console.log('Anunciado:', item.title, '->', item.url);
    } catch (e) {
      console.error('ERROR anunciando', item.title, ':', e.message);
    }
  }
}

async function cmdDaily() {
  ensureStateDir();
  const catalog = buildCatalog();
  if (!catalog.length) { console.log('Catálogo vacío, nada que publicar.'); return; }
  const rotation = loadJson(ROTATION_PATH, { index: 0 });
  const idx = ((rotation.index % catalog.length) + catalog.length) % catalog.length;
  const item = catalog[idx];

  const token = readToken();
  await sendPhoto(token, captionFor(item, { isNew: false }), item.image);
  rotation.index = idx + 1;
  saveJson(ROTATION_PATH, rotation);
  console.log('Publicado del catálogo:', item.title, '->', item.url, `(posición ${idx + 1}/${catalog.length})`);
}

const cmd = process.argv[2];
(async () => {
  try {
    if (cmd === 'announce') await cmdAnnounce();
    else if (cmd === 'daily') await cmdDaily();
    else { console.error('Uso: node tools/telegram-send.js <announce|daily>'); process.exit(1); }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
