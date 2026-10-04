// Fonction serverless Vercel : /api/isbn?isbn=978...
// Résout un ISBN en { titre, auteur, editeur, annee, cover } en enchaînant
// plusieurs sources GRATUITES côté serveur (pas de souci CORS, pas de clé).
// Ordre : Google Books -> OpenLibrary -> Google Books (recherche large) ->
//         recherche libraires FR (OpenGraph) pour les BD franco-belges.

function clean(s) { return String(s || "").replace(/[^0-9Xx]/g, "").toUpperCase(); }

function isbn10to13(i) {
  i = clean(i); if (i.length !== 10) return "";
  const core = "978" + i.slice(0, 9); let sum = 0;
  for (let k = 0; k < 12; k++) sum += (k % 2 === 0 ? 1 : 3) * Number(core[k]);
  return core + ((10 - (sum % 10)) % 10);
}
function variants(i) {
  i = clean(i); const set = new Set();
  if (i) set.add(i);
  if (i.length === 10) { const v = isbn10to13(i); if (v) set.add(v); }
  return [...set];
}

async function fetchJson(url, timeout = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "bd-library/1.0" } });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch { clearTimeout(t); return null; }
}

async function fetchText(url, timeout = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; bd-library/1.0)" } });
    clearTimeout(t);
    if (!r.ok) return "";
    return await r.text();
  } catch { clearTimeout(t); return ""; }
}

// ---- Source 1 : Google Books ----
async function tryGoogle(isbn) {
  const j = await fetchJson("https://www.googleapis.com/books/v1/volumes?q=isbn:" + isbn);
  if (j && j.totalItems > 0 && j.items && j.items.length) {
    const v = j.items[0].volumeInfo || {};
    let cover = "";
    if (v.imageLinks) cover = (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail || "").replace("http:", "https:").replace("&edge=curl", "");
    if (v.title) return { titre: v.title + (v.subtitle ? " — " + v.subtitle : ""), auteur: (v.authors || []).join(", "), editeur: v.publisher || "", annee: (v.publishedDate || "").slice(0, 4), cover, source: "google" };
  }
  return null;
}

// ---- Source 2 : OpenLibrary ----
async function tryOpenLibrary(isbn) {
  const j = await fetchJson("https://openlibrary.org/isbn/" + isbn + ".json");
  if (j && j.title) {
    let auteur = "";
    try {
      if (j.authors && j.authors[0] && j.authors[0].key) {
        const a = await fetchJson("https://openlibrary.org" + j.authors[0].key + ".json");
        auteur = a && a.name ? a.name : "";
      }
    } catch {}
    const cover = "https://covers.openlibrary.org/b/isbn/" + isbn + "-L.jpg";
    return { titre: j.title + (j.subtitle ? " — " + j.subtitle : ""), auteur, editeur: (j.publishers && j.publishers[0]) || "", annee: (j.publish_date && (String(j.publish_date).match(/\d{4}/) || [""])[0]) || "", cover, source: "openlibrary" };
  }
  return null;
}

// ---- Source 3 : extraction OpenGraph d'une page libraire FR ----
// Beaucoup de libraires FR exposent des meta og:title / og:image indexées par ISBN.
function metaContent(html, prop) {
  // cherche <meta property="prop" content="..."> ou name="prop"
  const re = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop.replace(/[:]/g, "\\$&") + '["\'][^>]*content=["\']([^"\']+)["\']', "i");
  let m = html.match(re);
  if (m) return m[1];
  const re2 = new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']' + prop.replace(/[:]/g, "\\$&") + '["\']', "i");
  m = html.match(re2);
  return m ? m[1] : "";
}
function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&eacute;/g, "é").replace(/&egrave;/g, "è").replace(/&agrave;/g, "à").trim();
}

// Recherche web (DuckDuckGo HTML, sans clé) : renvoie les URLs de résultats pour une requête.
async function ddgSearch(query) {
  const html = await fetchText("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), 7000);
  if (!html) return [];
  const urls = [];
  // liens de résultats DDG : href="...uddg=<URL encodee>..." OU liens directs result__a
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null && urls.length < 8) {
    let href = m[1];
    // DDG encode parfois la vraie URL dans ?uddg=
    const ud = href.match(/[?&]uddg=([^&]+)/);
    if (ud) { try { href = decodeURIComponent(ud[1]); } catch {} }
    if (/^https?:\/\//.test(href)) urls.push(href);
  }
  return urls;
}

// Extrait titre/auteur/editeur/annee/cover d'une page libraire FR (plusieurs methodes).
function parseLibraireFiche(html) {
  if (!html) return null;
  const out = { titre: "", auteur: "", editeur: "", annee: "", cover: "" };
  // 1) OpenGraph
  out.cover = metaContent(html, "og:image") || "";
  let ogt = decodeEntities(metaContent(html, "og:title") || "");
  // 2) <title> en secours
  if (!ogt) { const tm = html.match(/<title[^>]*>([^<]+)<\/title>/i); if (tm) ogt = decodeEntities(tm[1]); }
  // nettoie suffixes " - Furet du Nord", " | Leslibraires", etc.
  ogt = ogt.replace(/\s*[-|–]\s*(furet.*|leslibraires.*|decitre.*|cultura.*|fnac.*|librairie.*)$/i, "").trim();
  out.titre = ogt;
  // 3) champs structurés visibles (Editeur / Date de parution / EAN) dans le texte
  const ed = html.match(/(?:Editeur|Éditeur|publisher)["'\s:>]*([A-Za-zÀ-ÿ0-9 .&'’-]{2,40})/i);
  if (ed) out.editeur = decodeEntities(ed[1]).trim();
  const an = html.match(/(?:Date de parution|parution|publishedDate|datePublished)["'\s:>]*[^\d]{0,8}(\d{4})/i);
  if (an) out.annee = an[1];
  // auteur : meta book:author ou "De : X" / "Auteur : X"
  let au = metaContent(html, "book:author") || "";
  if (!au) { const am = html.match(/(?:Auteur|De)\s*[:\u202f]\s*([A-Za-zÀ-ÿ .'’-]{3,40})/); if (am) au = am[1]; }
  out.auteur = decodeEntities(au).trim();
  return out.titre ? out : null;
}

async function tryLibrairieFR(isbn) {
  // 1) trouver des pages fiches via recherche web (sans clé)
  let urls = [];
  try { urls = await ddgSearch(isbn + " BD album"); } catch {}
  // priorise les libraires FR connus pour avoir des fiches riches
  const prefer = /(furet\.com|leslibraires|decitre\.fr|cultura\.com|fnac\.com|bdfugue\.com|placedeslibraires)/i;
  urls.sort((a, b) => (prefer.test(b) ? 1 : 0) - (prefer.test(a) ? 1 : 0));
  for (const url of urls.slice(0, 4)) {
    if (!/^https:\/\//.test(url)) continue;
    const html = await fetchText(url, 7000);
    const parsed = parseLibraireFiche(html);
    if (parsed && parsed.titre && parsed.titre.length > 2) { parsed.source = "libraire:" + (url.match(/https:\/\/(?:www\.)?([^\/]+)/) || [,""])[1]; return parsed; }
  }
  return null;
}

// ---- Source 4 : ISBNdb (API à clé, en DERNIER recours pour économiser le quota) ----
// N'est appelée que si la variable d'environnement ISBNDB_API_KEY est définie (côté serveur Vercel).
// Clé envoyée dans le header Authorization (jamais en query string).
async function tryISBNdb(isbn) {
  const key = process.env.ISBNDB_API_KEY;
  if (!key) return null; // pas de clé -> source inactive, aucune erreur
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch("https://api2.isbndb.com/book/" + encodeURIComponent(isbn), {
      signal: ctrl.signal,
      headers: { "Authorization": key, "Accept": "application/json" },
    });
    clearTimeout(t);
    if (!r.ok) return null; // 401/404/400 -> on ignore
    const j = await r.json();
    const b = j && j.book ? j.book : null;
    if (b && (b.title || b.title_long)) {
      const titre = b.title_long || b.title;
      const auteur = Array.isArray(b.authors) ? b.authors.join(", ") : (b.authors || "");
      const annee = b.date_published ? (String(b.date_published).match(/\d{4}/) || [""])[0] : "";
      return { titre, auteur, editeur: b.publisher || "", annee, cover: b.image || "", source: "isbndb" };
    }
  } catch { clearTimeout(t); }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate");
  const raw = (req.query && req.query.isbn) || "";
  const isbn = clean(raw);
  if (!isbn || (isbn.length !== 13 && isbn.length !== 10)) {
    return res.status(400).json({ error: "ISBN invalide", isbn });
  }
  const vs = variants(isbn);
  const isbn13 = vs.find(v => v.length === 13) || vs[0];

  // Essaie les sources dans l'ordre, en fusionnant ce qui manque
  let result = null;
  for (const v of vs) {
    result = await tryGoogle(v);
    if (result && result.titre) break;
  }
  if (!result || !result.titre) {
    for (const v of vs) { const r = await tryOpenLibrary(v); if (r && r.titre) { result = r; break; } }
  }
  if (!result || !result.titre) {
    const r = await tryLibrairieFR(isbn13);
    if (r && r.titre) result = r;
  }
  if (!result || !result.titre) {
    for (const v of vs) { const r = await tryISBNdb(v); if (r && r.titre) { result = r; break; } }
  }

  if (!result || !result.titre) {
    // au moins une couverture OpenLibrary par défaut
    return res.status(200).json({ found: false, isbn: isbn13, titre: "", auteur: "", editeur: "", annee: "", cover: "https://covers.openlibrary.org/b/isbn/" + isbn13 + "-L.jpg" });
  }
  // couverture de secours si absente
  if (!result.cover) result.cover = "https://covers.openlibrary.org/b/isbn/" + isbn13 + "-L.jpg";
  result.found = true; result.isbn = isbn13;
  return res.status(200).json(result);
}
