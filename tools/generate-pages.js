/*
 * Generador de páginas estáticas para EmpiezaPadel.
 *
 * Lee los datos de productos y guías que viven dentro de index.html
 * (única fuente de la verdad) y genera:
 *   - /palas/<slug>/index.html, /zapatillas/..., /accesorios/...  (análisis de cada producto)
 *   - /guias/<slug>/index.html                                    (cada guía)
 *   - /palas/index.html, /zapatillas/, /accesorios/, /guias/      (páginas hub por categoría)
 *   - sitemap.xml                                                 (con todas las URLs)
 *
 * Uso:  node tools/generate-pages.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://empiezapadel.es';
const STORE_ID = 'albertomart09-21';
const BRAND_NAME = 'EmpiezaPadel';
const TODAY = '2026-06-29';

// ---------- 1. Extraer los datos desde index.html ----------
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

function evalLiteral(lit) {
  // Datos propios y de confianza dentro de nuestro repositorio.
  return new Function('return (' + lit + ')')();
}

const palas      = evalLiteral(extractLiteral(indexSrc, 'const palas =', '[', ']'));
const zapatillas = evalLiteral(extractLiteral(indexSrc, 'const zapatillas =', '[', ']'));
const accesorios = evalLiteral(extractLiteral(indexSrc, 'const accesorios =', '[', ']'));
const guides     = evalLiteral(extractLiteral(indexSrc, 'const guides =', '{', '}'));

// ---------- 2. Utilidades ----------
function slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function stripHtml(s) { return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function truncate(s, n) { s = s.trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; }
function priceNum(p) { return String(p).replace(/\./g, '').replace(',', '.'); }
function amazon(query) { return `${SITE.replace('https://empiezapadel.es','https://www.amazon.es')}/s?k=${encodeURIComponent(query)}&tag=${STORE_ID}`; }
function amazonUrl(query) { return `https://www.amazon.es/s?k=${encodeURIComponent(query)}&tag=${STORE_ID}`; }
function imgAbs(img) { return '/' + String(img).replace(/^\/+/, ''); }
function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

const CATS = {
  palas:      { dir: 'palas',      arr: palas,      sing: 'Pala',     label: 'Palas',      hubTitle: 'Mejores palas de pádel 2026: análisis y guía de compra' },
  zapatillas: { dir: 'zapatillas', arr: zapatillas, sing: 'Zapatilla',label: 'Zapatillas', hubTitle: 'Mejores zapatillas de pádel 2026: análisis y comparativa' },
  accesorios: { dir: 'accesorios', arr: accesorios, sing: 'Accesorio',label: 'Accesorios', hubTitle: 'Paleteros, pelotas y accesorios de pádel 2026' },
};

function productSlug(p) { return slugify(p.brand + ' ' + p.name); }
function productPath(catDir, p) { return `/${catDir}/${productSlug(p)}/`; }
function guideSlug(id) { return slugify(guides[id].title); }
function guidePath(id) { return `/guias/${guideSlug(id)}/`; }

// ---------- 3. Plantilla base (CSS + cascarón) ----------
const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--green:#1a7a4a;--green-l:#e6f4ec;--green-d:#0f4f2f;--lime:#c8f135;--black:#0d0d0d;--white:#fff;--gray-1:#f5f5f3;--gray-2:#e8e8e4;--gray-3:#b0b0a8;--gray-4:#6b6b63;--text:#1a1a18}
body{font-family:'DM Sans',sans-serif;background:var(--white);color:var(--text);font-size:16px;line-height:1.7}
a{color:var(--green);text-decoration:none}
a:hover{text-decoration:underline}
.nav{position:sticky;top:0;z-index:100;background:var(--black);display:flex;align-items:center;justify-content:space-between;padding:0 1.5rem;height:58px;border-bottom:2px solid var(--lime)}
.nav .logo{font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--white);letter-spacing:-1px}
.nav .logo span{color:var(--lime)}
.nav .logo:hover{text-decoration:none}
.wrap{max-width:860px;margin:0 auto;padding:1.5rem 1.25rem 3rem}
.crumbs{font-size:.8rem;color:var(--gray-4);margin:.5rem 0 1.25rem}
.crumbs a{color:var(--gray-4)}
h1{font-family:'DM Serif Display',serif;font-size:clamp(1.7rem,4.5vw,2.5rem);line-height:1.15;color:var(--black);margin-bottom:.4rem}
.sub{color:var(--gray-4);font-size:1rem;margin-bottom:1.5rem}
h2{font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--black);margin:2rem 0 .75rem}
h4{font-family:'DM Serif Display',serif;color:var(--black);margin:1.25rem 0 .4rem;font-size:1.08rem}
p{margin-bottom:.85rem}
.hero{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;align-items:center;background:var(--gray-1);border:1.5px solid var(--gray-2);border-radius:16px;padding:1.5rem;margin-bottom:1.5rem}
.hero-img{display:flex;align-items:center;justify-content:center;min-height:240px}
.hero-img img{max-width:100%;max-height:300px;object-fit:contain;mix-blend-mode:multiply}
.tag{display:inline-block;background:var(--lime);color:var(--black);font-size:.66rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 10px;border-radius:20px;margin-bottom:.6rem}
.brand{font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--green)}
.stars{color:#f5a623;font-size:.95rem;margin:.4rem 0}
.stars span{color:var(--gray-4);font-size:.78rem;margin-left:6px}
.price{font-family:'DM Serif Display',serif;font-size:1.9rem;color:var(--black);margin:.5rem 0}
.price small{font-size:.72rem;color:var(--gray-3);font-family:'DM Sans',sans-serif;display:block;font-weight:400}
.btn{display:inline-block;background:#ff9900;color:#0d0d0d!important;font-weight:700;padding:.85rem 1.5rem;border-radius:10px;text-align:center;font-size:1rem;transition:filter .2s}
.btn:hover{filter:brightness(.95);text-decoration:none}
.btn.block{display:block}
.specs{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin:1rem 0 1.5rem}
.spec{background:var(--gray-1);border-radius:8px;padding:.6rem .85rem;font-size:.85rem}
.spec b{display:block;color:var(--gray-4);font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:1px;font-weight:600}
.pc{display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin:1.5rem 0}
.pc h4{margin-top:0}
.pc ul{list-style:none}
.pc li{font-size:.9rem;color:var(--gray-4);padding:3px 0;display:flex;gap:7px;align-items:flex-start}
.pros h4{color:var(--green)}.cons h4{color:#c0392b}
.pros li::before{content:'✓';color:var(--green);font-weight:700}
.cons li::before{content:'✗';color:#c0392b;font-weight:700}
.verdict{background:var(--green-l);border-left:3px solid var(--green);border-radius:0 8px 8px 0;padding:1rem 1.25rem;margin:1.5rem 0;color:var(--green-d)}
.verdict b{display:block;text-transform:uppercase;font-size:.74rem;letter-spacing:.07em;margin-bottom:.3rem}
.cta-box{border:1.5px solid var(--gray-2);border-radius:14px;padding:1.5rem;text-align:center;margin:2rem 0}
.cta-box .price{margin-top:0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem;margin:1.5rem 0}
.card{border:1.5px solid var(--gray-2);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;transition:box-shadow .2s,transform .2s}
.card:hover{box-shadow:0 8px 28px rgba(26,122,74,.13);transform:translateY(-2px);text-decoration:none}
.card-img{background:var(--gray-1);height:160px;display:flex;align-items:center;justify-content:center;padding:1rem}
.card-img img{max-width:100%;max-height:100%;object-fit:contain;mix-blend-mode:multiply}
.card-b{padding:.85rem 1rem 1.1rem}
.card-b .brand{font-size:.66rem}
.card-name{font-weight:600;color:var(--black);margin:.15rem 0 .35rem;line-height:1.25}
.card-meta{font-size:.8rem;color:var(--gray-4)}
.related{border-top:1.5px solid var(--gray-2);margin-top:2.5rem;padding-top:1.5rem}
.related a{display:inline-block;margin:.2rem .6rem .2rem 0}
.disclosure{font-size:.62rem;color:var(--gray-4);opacity:.7;margin-top:1rem;line-height:1.4}
footer{background:var(--black);color:var(--gray-3);padding:2.25rem 1.5rem;text-align:center;font-size:.8rem;line-height:1.7;margin-top:2rem}
footer .logo{font-family:'DM Serif Display',serif;font-size:1.3rem;color:var(--white)}
footer .logo span{color:var(--lime)}
@media(max-width:640px){.hero{grid-template-columns:1fr}.specs,.pc{grid-template-columns:1fr}}
`;

function shell({ title, description, canonical, jsonLd, body }) {
  const ld = (jsonLd || []).map(o => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>`).join('\n');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="${BRAND_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/img/og-cover.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
${ld}
</head>
<body>
<nav class="nav"><a class="logo" href="/">Empieza<span>Padel</span></a></nav>
<main class="wrap">
${body}
</main>
<footer>
<div class="logo">Empieza<span>Padel</span></div>
<p>Reviews honestas de equipamiento de pádel · Actualizadas en 2026.</p>
<p class="disclosure">Como Afiliado de Amazon, ${BRAND_NAME} obtiene ingresos por las compras adscritas.</p>
</footer>
</body>
</html>`;
}

function crumbs(parts) {
  // parts: [{name, url}] — el último sin enlace
  return '<nav class="crumbs">' + parts.map((p, i) =>
    i < parts.length - 1 ? `<a href="${p.url}">${esc(p.name)}</a> › ` : `<span>${esc(p.name)}</span>`
  ).join('') + '</nav>';
}
function breadcrumbLd(parts) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: parts.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, item: SITE + p.url }))
  };
}

// ---------- 4. Página de producto ----------
function renderProductPage(catKey, p) {
  const cat = CATS[catKey];
  const slug = productSlug(p);
  const url = productPath(cat.dir, p);
  const canonical = SITE + url;
  const aff = amazonUrl(p.query);
  const fullName = `${p.brand} ${p.name}`;
  const title = `${fullName}: análisis y opinión 2026 | ${BRAND_NAME}`;
  const description = truncate(`Análisis de la ${fullName} (${p.level}). ${stripHtml(p.desc)} Precio orientativo ${p.price}€.`, 158);

  const specsHtml = Object.entries(p.specs).map(([k, v]) =>
    `<div class="spec"><b>${esc(k)}</b>${esc(v)}</div>`).join('');
  const prosHtml = p.pros.map(x => `<li>${esc(x)}</li>`).join('');
  const consHtml = p.cons.map(x => `<li>${esc(x)}</li>`).join('');

  // Productos relacionados de la misma categoría
  const related = cat.arr.filter(x => x.id !== p.id).slice(0, 4);
  const relatedHtml = related.length ? `
  <section class="related">
    <h2>Otras ${cat.label.toLowerCase()} que te pueden interesar</h2>
    <div class="grid">
      ${related.map(r => `<a class="card" href="${productPath(cat.dir, r)}">
        <div class="card-img"><img src="${imgAbs(r.img)}" alt="${esc(r.brand + ' ' + r.name)}" loading="lazy"></div>
        <div class="card-b"><div class="brand">${esc(r.brand)}</div><div class="card-name">${esc(r.name)}</div><div class="card-meta">${esc(r.level)} · ${esc(r.price)}€</div></div>
      </a>`).join('')}
    </div>
  </section>` : '';

  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'Product',
      name: fullName, brand: { '@type': 'Brand', name: p.brand },
      category: cat.sing + ' de pádel', description: stripHtml(p.desc),
      image: SITE + imgAbs(p.img),
      review: {
        '@type': 'Review',
        author: { '@type': 'Organization', name: BRAND_NAME },
        reviewRating: { '@type': 'Rating', ratingValue: p.stars, bestRating: 5 }
      },
      offers: {
        '@type': 'Offer', price: priceNum(p.price), priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock', url: aff
      }
    },
    breadcrumbLd([{ name: 'Inicio', url: '/' }, { name: cat.label, url: `/${cat.dir}/` }, { name: fullName, url }])
  ];

  const body = `
${crumbs([{ name: 'Inicio', url: '/' }, { name: cat.label, url: `/${cat.dir}/` }, { name: fullName, url }])}
<div class="brand">${esc(p.brand)}</div>
<h1>${esc(fullName)}</h1>
<p class="sub">Análisis, opinión y dónde comprar — ${esc(p.level)}</p>
<div class="hero">
  <div class="hero-img"><img src="${imgAbs(p.img)}" alt="${esc(fullName)}" onerror="this.style.display='none'"></div>
  <div>
    ${p.badge === 'top' ? '<span class="tag">Más vendida</span>' : ''}${p.badge === 'new' ? '<span class="tag">Novedad 2026</span>' : ''}
    <div class="stars">${stars(p.stars)} <span>Valoración de ${BRAND_NAME}</span></div>
    <div class="price">${esc(p.price)} €<small>Precio orientativo en Amazon.es</small></div>
    <a class="btn block" href="${aff}" target="_blank" rel="sponsored noopener">🛒 Ver precio en Amazon</a>
  </div>
</div>

<h2>Nuestro análisis</h2>
<p>${esc(p.desc)}</p>

<h2>Características</h2>
<div class="specs">${specsHtml}</div>

<h2>Pros y contras</h2>
<div class="pc">
  <div class="pros"><h4>A favor</h4><ul>${prosHtml}</ul></div>
  <div class="cons"><h4>En contra</h4><ul>${consHtml}</ul></div>
</div>

<div class="verdict"><b>Veredicto de ${BRAND_NAME}</b>${esc(p.verdict)}</div>

<div class="cta-box">
  <div class="price">${esc(p.price)} €<small>Precio orientativo en Amazon.es</small></div>
  <a class="btn" href="${aff}" target="_blank" rel="sponsored noopener">🛒 Ver ${esc(fullName)} en Amazon</a>
</div>
${relatedHtml}
`;

  return { url, html: shell({ title, description, canonical, jsonLd, body }) };
}

// ---------- 5. Página de guía ----------
function renderGuidePage(id) {
  const g = guides[id];
  const slug = guideSlug(id);
  const url = guidePath(id);
  const canonical = SITE + url;
  const title = `${g.title} | ${BRAND_NAME}`;
  const description = truncate(stripHtml(g.body), 158);

  const linksHtml = (g.links || []).map(l =>
    `<a class="btn block" style="margin-bottom:.6rem" href="${amazonUrl(l.query)}" target="_blank" rel="sponsored noopener">🛒 ${esc(l.text)}</a>`
  ).join('');

  // Otras guías
  const others = Object.keys(guides).filter(k => k !== id).slice(0, 6);
  const othersHtml = `
  <section class="related">
    <h2>Más guías de compra</h2>
    ${others.map(k => `<a href="${guidePath(k)}">${esc(guides[k].title)}</a>`).join('')}
  </section>`;

  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: g.title, inLanguage: 'es-ES',
      image: SITE + '/img/og-cover.jpg',
      author: { '@type': 'Organization', name: BRAND_NAME },
      publisher: { '@type': 'Organization', name: BRAND_NAME },
      datePublished: TODAY, dateModified: TODAY,
      mainEntityOfPage: canonical
    },
    breadcrumbLd([{ name: 'Inicio', url: '/' }, { name: 'Guías', url: '/guias/' }, { name: g.title, url }])
  ];

  const body = `
${crumbs([{ name: 'Inicio', url: '/' }, { name: 'Guías', url: '/guias/' }, { name: g.title, url }])}
<div class="brand">${esc(g.cat)}</div>
<h1>${esc(g.title)}</h1>
<p class="sub">${esc(g.meta)}</p>
<article>${g.body}</article>
${linksHtml ? `<div class="cta-box"><b style="display:block;margin-bottom:.75rem;text-transform:uppercase;font-size:.74rem;letter-spacing:.07em;color:var(--gray-4)">Productos recomendados</b>${linksHtml}</div>` : ''}
${othersHtml}
`;

  return { url, html: shell({ title, description, canonical, jsonLd, body }) };
}

// ---------- 6. Páginas hub por categoría ----------
function renderProductHub(catKey) {
  const cat = CATS[catKey];
  const url = `/${cat.dir}/`;
  const canonical = SITE + url;
  const title = `${cat.hubTitle} | ${BRAND_NAME}`;
  const description = truncate(`Análisis y comparativa de las mejores ${cat.label.toLowerCase()} de pádel 2026. Opiniones honestas y precios para ayudarte a elegir.`, 158);
  const cards = cat.arr.map(p => `<a class="card" href="${productPath(cat.dir, p)}">
    <div class="card-img"><img src="${imgAbs(p.img)}" alt="${esc(p.brand + ' ' + p.name)}" loading="lazy"></div>
    <div class="card-b"><div class="brand">${esc(p.brand)}</div><div class="card-name">${esc(p.name)}</div><div class="card-meta">${esc(p.level)} · ${esc(p.price)}€</div></div>
  </a>`).join('');
  const body = `
${crumbs([{ name: 'Inicio', url: '/' }, { name: cat.label, url }])}
<h1>${esc(cat.hubTitle)}</h1>
<p class="sub">${cat.arr.length} ${cat.label.toLowerCase()} analizadas para la temporada 2026.</p>
<div class="grid">${cards}</div>`;
  const jsonLd = [breadcrumbLd([{ name: 'Inicio', url: '/' }, { name: cat.label, url }])];
  return { url, html: shell({ title, description, canonical, jsonLd, body }) };
}

function renderGuidesHub() {
  const url = '/guias/';
  const canonical = SITE + url;
  const title = `Guías de compra de pádel 2026 | ${BRAND_NAME}`;
  const description = 'Todas las guías de compra de pádel: cómo elegir pala, zapatillas y accesorios según tu nivel. Consejos honestos para principiantes y avanzados.';
  const cards = Object.keys(guides).map(k => `<a class="card" href="${guidePath(k)}" style="padding:1.1rem 1.25rem">
    <div class="brand">${esc(guides[k].cat)}</div>
    <div class="card-name" style="margin-top:.3rem">${esc(guides[k].title)}</div>
    <div class="card-meta">${esc(guides[k].meta)}</div>
  </a>`).join('');
  const body = `
${crumbs([{ name: 'Inicio', url: '/' }, { name: 'Guías', url }])}
<h1>Guías de compra de pádel 2026</h1>
<p class="sub">${Object.keys(guides).length} guías para ayudarte a acertar con tu equipación.</p>
<div class="grid">${cards}</div>`;
  const jsonLd = [breadcrumbLd([{ name: 'Inicio', url: '/' }, { name: 'Guías', url }])];
  return { url, html: shell({ title, description, canonical, jsonLd, body }) };
}

// ---------- 7. Escribir ficheros ----------
function writePage(url, html) {
  const dir = path.join(ROOT, url.replace(/^\/|\/$/g, ''));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

const allUrls = ['/'];
let count = 0;

for (const catKey of Object.keys(CATS)) {
  const hub = renderProductHub(catKey);
  writePage(hub.url, hub.html); allUrls.push(hub.url); count++;
  for (const p of CATS[catKey].arr) {
    const page = renderProductPage(catKey, p);
    writePage(page.url, page.html); allUrls.push(page.url); count++;
  }
}

const gh = renderGuidesHub();
writePage(gh.url, gh.html); allUrls.push(gh.url); count++;
for (const id of Object.keys(guides)) {
  const page = renderGuidePage(id);
  writePage(page.url, page.html); allUrls.push(page.url); count++;
}

// ---------- 8. Sitemap ----------
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${SITE}${u}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${u === '/' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);

console.log(`Generadas ${count} páginas + sitemap con ${allUrls.length} URLs.`);
console.log(`Productos: palas=${palas.length} zapatillas=${zapatillas.length} accesorios=${accesorios.length} | guías=${Object.keys(guides).length}`);
