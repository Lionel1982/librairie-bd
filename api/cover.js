// Fonction serverless Vercel : /api/cover?isbn=978...
// Renvoie { cover } = première URL d'image de couverture RÉELLEMENT valide,
// testée côté serveur (BnF via ARK -> Google Books -> OpenLibrary L/M).
// Évite les images "vides" (OpenLibrary renvoie un 1x1 ou 404 quand absente).

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

async function fetchText(url, timeout = 7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; bd-library/1.0)" } });
    clearTimeout(t); if (!r.ok) return ""; return await r.text();
  } catch { clearTimeout(t); return ""; }
}

// Vérifie qu'une URL renvoie bien une image non vide (content-type image + taille > seuil)
async function imageOk(url) {
  if (!url) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; bd-library/1.0)" } });
    clearTimeout(t);
    if (!r.ok) return false;
    const ct = r.headers.get("content-type") || "";
    if (!/image\//i.test(ct)) return false;
    const len = Number(r.headers.get("content-length") || "0");
    // OpenLibrary renvoie parfois une image placeholder ~ 807 octets : on exige > 1500 o
    if (len && len < 1500) return false;
    return true;
  } catch { clearTimeout(t); return false; }
}

// BnF : récupère l'ARK via SRU puis construit l'URL de couverture
async function bnfCover(isbn) {
  const url = "https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve"
    + "&query=" + encodeURIComponent('bib.ean all "' + isbn + '"')
    + "&recordSchema=unimarcxchange&maximumRecords=1";
  const xml = await fetchText(url, 8000);
  if (!xml) return "";
  const ark = xml.match(/ark:\/12148\/(cb[0-9a-z]+)/i);
  if (!ark) return "";
  return "https://catalogue.bnf.fr/couverture?appName=NE&idArk=ark:/12148/" + ark[1] + "&couverture=1";
}

// Google Books : thumbnail depuis l'API volumes
async function googleCover(isbn) {
  const txt = await fetchText("https://www.googleapis.com/books/v1/volumes?q=isbn:" + isbn, 6000);
  if (!txt) return "";
  try {
    const j = JSON.parse(txt);
    const v = j && j.items && j.items[0] && j.items[0].volumeInfo;
    if (v && v.imageLinks) return (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail || "").replace("http:", "https:").replace("&edge=curl", "");
  } catch {}
  return "";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=604800, stale-while-revalidate");
  const isbn = clean((req.query && req.query.isbn) || "");
  if (!isbn || (isbn.length !== 13 && isbn.length !== 10)) {
    return res.status(400).json({ error: "ISBN invalide", isbn });
  }
  const vs = variants(isbn);
  const isbn13 = vs.find(v => v.length === 13) || vs[0];

  const candidates = [];
  // 1) BnF
  try { const c = await bnfCover(isbn13); if (c) candidates.push(c); } catch {}
  // 2) Google Books
  for (const v of vs) { try { const c = await googleCover(v); if (c) { candidates.push(c); break; } } catch {} }
  // 3) OpenLibrary L puis M
  for (const v of vs) { candidates.push("https://covers.openlibrary.org/b/isbn/" + v + "-L.jpg"); }

  for (const url of candidates) {
    if (await imageOk(url)) return res.status(200).json({ found: true, isbn: isbn13, cover: url });
  }
  return res.status(200).json({ found: false, isbn: isbn13, cover: "" });
}
