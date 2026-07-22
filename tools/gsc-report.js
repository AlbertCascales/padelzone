/*
 * Informe de Search Console para EmpiezaPadel. Solo lectura.
 *
 * Autentica con la cuenta de servicio (JWT RS256, sin dependencias externas: usa
 * únicamente módulos nativos de Node) y consulta la API de Search Console. La clave
 * vive fuera del repo, en C:\Users\marti\.empiezapadel-secrets\gsc-service-account.json.
 *
 * Da dos cosas:
 *   1. RENDIMIENTO (Search Analytics): mejores keywords, mejores páginas y las
 *      "a un empujón" (posición 8-20, donde subir a la página 1 es lo más rentable).
 *   2. INDEXACIÓN (URL Inspection): estado de cada URL del sitemap, agrupado por
 *      veredicto. Reconstruye la lista de "Descubierta: sin indexar" con su motivo;
 *      esa lista NO se puede descargar en bloque por la API, pero inspeccionar cada
 *      URL da lo mismo, una a una.
 *
 * Uso:  node tools/gsc-report.js            (rendimiento + indexación)
 *       node tools/gsc-report.js --perf     (solo rendimiento, 1 llamada, rápido)
 *       node tools/gsc-report.js --index    (solo indexación, ~85 llamadas, lento)
 */

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

const KEY_PATH = 'C:/Users/marti/.empiezapadel-secrets/gsc-service-account.json';
const SITE = 'sc-domain:empiezapadel.es';
const ROOT = path.join(__dirname, '..');

if (!fs.existsSync(KEY_PATH)) {
  console.error('No encuentro la clave en ' + KEY_PATH + '. Ver CLAUDE.md § Search Console.');
  process.exit(1);
}
const KEY = require(KEY_PATH);

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function request(host, pathName, method, body, token) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    if (token) { headers['Authorization'] = 'Bearer ' + token; headers['Content-Type'] = 'application/json'; }
    else headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const req = https.request({ host, path: pathName, method, headers }, (r) => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => resolve({ status: r.statusCode, body: d }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: KEY.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + claim);
  const jwt = `${header}.${claim}.${b64url(signer.sign(KEY.private_key))}`;
  const res = await request('oauth2.googleapis.com', '/token', 'POST',
    `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`, null);
  if (res.status !== 200) throw new Error('Auth falló (' + res.status + '): ' + res.body.slice(0, 200));
  return JSON.parse(res.body).access_token;
}

function ymd(d) { return d.toISOString().slice(0, 10); }
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const num = (n) => Number(n).toLocaleString('es-ES');

async function searchAnalytics(token, dimensions, rowLimit = 25) {
  const end = new Date(); const start = new Date(); start.setMonth(start.getMonth() - 3);
  const body = JSON.stringify({ startDate: ymd(start), endDate: ymd(end), dimensions, rowLimit });
  const res = await request('searchconsole.googleapis.com',
    `/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`, 'POST', body, token);
  if (res.status !== 200) throw new Error('searchAnalytics (' + res.status + '): ' + res.body.slice(0, 200));
  return JSON.parse(res.body).rows || [];
}

function printRows(title, rows, label) {
  console.log('\n' + title);
  if (!rows.length) { console.log('  (sin datos en el periodo)'); return; }
  console.log('  ' + pad(label, 52) + pad('Impr', 8) + pad('Clics', 7) + pad('CTR', 7) + 'Pos');
  for (const r of rows) {
    console.log('  ' + pad(r.keys[0], 52) + pad(num(r.impressions), 8) +
      pad(num(r.clicks), 7) + pad((r.ctr * 100).toFixed(1) + '%', 7) + r.position.toFixed(1));
  }
}

async function perf(token) {
  console.log('\n===== RENDIMIENTO (últimos 3 meses) =====');
  const queries = await searchAnalytics(token, ['query'], 25);
  printRows('▸ Mejores keywords (por impresiones)', queries.slice(0, 15), 'Keyword');

  const pages = await searchAnalytics(token, ['page'], 25);
  printRows('▸ Mejores páginas', pages.slice(0, 12), 'Página');

  // "A un empujón": posición 8-20 con impresiones reales pero pocos clics.
  const striking = queries
    .filter(r => r.position >= 8 && r.position <= 20 && r.impressions >= 5)
    .sort((a, b) => b.impressions - a.impressions).slice(0, 15);
  printRows('▸ A un empujón de la página 1 (pos 8-20) — lo más rentable de trabajar', striking, 'Keyword');

  const totalImpr = queries.reduce((s, r) => s + r.impressions, 0);
  const totalClicks = queries.reduce((s, r) => s + r.clicks, 0);
  console.log(`\n  Totales (top 25 queries): ${num(totalImpr)} impresiones, ${num(totalClicks)} clics.`);
}

function sitemapUrls() {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
}

async function inspect(token, url) {
  const body = JSON.stringify({ inspectionUrl: url, siteUrl: SITE, languageCode: 'es-ES' });
  const res = await request('searchconsole.googleapis.com',
    '/v1/urlInspection/index:inspect', 'POST', body, token);
  if (res.status !== 200) return { url, verdict: 'ERROR', state: res.status + ': ' + res.body.slice(0, 80) };
  const r = JSON.parse(res.body).inspectionResult?.indexStatusResult || {};
  return { url, verdict: r.verdict || '?', state: r.coverageState || '?' };
}

async function indexation(token) {
  console.log('\n===== INDEXACIÓN (URL por URL del sitemap) =====');
  const urls = sitemapUrls();
  console.log(`Inspeccionando ${urls.length} URLs (va despacio, ~1s cada una)...`);
  const results = [];
  for (const u of urls) {
    results.push(await inspect(token, u));
    process.stdout.write('.');
  }
  console.log('');

  // Agrupa por coverageState (el motivo textual que muestra Search Console).
  const byState = {};
  for (const r of results) (byState[r.state] ||= []).push(r.url);
  console.log('\n▸ Resumen por estado:');
  Object.entries(byState).sort((a, b) => b[1].length - a[1].length)
    .forEach(([state, list]) => console.log(`  ${pad(state, 48)} ${list.length}`));

  // Detalla las que no están indexadas (lo que de verdad frena el alcance).
  const notIndexed = results.filter(r => r.verdict !== 'PASS');
  if (notIndexed.length) {
    console.log(`\n▸ No indexadas (${notIndexed.length}) — URL y motivo:`);
    notIndexed.forEach(r => console.log(`  [${r.state}] ${r.url.replace('https://empiezapadel.es', '')}`));
  }
}

(async () => {
  const token = await accessToken();
  const only = process.argv.slice(2);
  if (!only.includes('--index')) await perf(token);
  if (!only.includes('--perf')) await indexation(token);
})().catch(e => { console.error('\nERROR:', e.message); process.exit(1); });
