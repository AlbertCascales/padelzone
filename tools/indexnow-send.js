/*
 * Avisa a IndexNow (Bing, Yandex, Seznam...) de las URLs publicadas hoy.
 *
 * Google NO usa IndexNow: su rastreo sigue dependiendo del sitemap. Esto solo
 * acelera a los buscadores que sí lo implementan.
 *
 * Las URLs a enviar salen del sitemap: las que tienen lastmod de hoy. Por eso
 * hay que ejecutarlo DESPUÉS de generate-pages.js, que es quien calcula el
 * lastmod real desde git.
 *
 * Uso:  node tools/indexnow-send.js          (envía)
 *       node tools/indexnow-send.js --dry    (solo muestra qué enviaría)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HOST = 'empiezapadel.es';
const KEY = '38f885e5cfd8d972588aa9d2ec5e4f2b';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const TODAY = new Date().toISOString().slice(0, 10);
const dry = process.argv.includes('--dry');

const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)]
  .filter(m => m[2].trim() === TODAY)
  .map(m => m[1].trim());

if (!urls.length) {
  console.log('IndexNow: nada con lastmod de hoy, no hay que avisar de nada.');
  process.exit(0);
}

console.log(`IndexNow: ${urls.length} URL(s) con lastmod ${TODAY}:`);
urls.forEach(u => console.log('  ' + u));

if (dry) {
  console.log('(--dry: no se ha enviado nada)');
  process.exit(0);
}

fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls })
})
  .then(r => {
    // 200 = aceptado, 202 = aceptado pero la clave aún se está validando.
    if (r.ok || r.status === 202) console.log(`IndexNow: enviado (HTTP ${r.status}).`);
    else console.error(`IndexNow: rechazado (HTTP ${r.status}). No es crítico; el sitemap sigue funcionando.`);
  })
  .catch(e => console.error('IndexNow: fallo de red (' + e.message + '). No es crítico.'));
