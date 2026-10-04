// Couche données : persistance localStorage + helpers (portée depuis l'app v1.26 éprouvée)
const STORAGE_KEY = "bd-library-v1";
const REFCAT_KEY = "bd-library-refcat-v1";
const SERIES_META_KEY = "bd-library-series-meta-v1";
const BLACKLIST_KEY = "bd-library-blacklist-v1";
export const OWNED = ["jai", "lu", "en-cours", "a-lire"];
export const STATUS_LABELS = { "a-lire": "À lire", "en-cours": "En cours", "lu": "Lu", "jai": "J'ai", "veux": "Je veux", "a-confirmer": "À confirmer" };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function loadBooks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
export function saveBooks(books) { localStorage.setItem(STORAGE_KEY, JSON.stringify(books)); }

export function loadRefCatalog() { try { return JSON.parse(localStorage.getItem(REFCAT_KEY) || "[]"); } catch { return []; } }
export function saveRefCatalog(cat) { localStorage.setItem(REFCAT_KEY, JSON.stringify(cat)); }

export function loadSeriesMeta() { try { return JSON.parse(localStorage.getItem(SERIES_META_KEY) || "{}"); } catch { return {}; } }
export function saveSeriesMeta(m) { localStorage.setItem(SERIES_META_KEY, JSON.stringify(m)); }

// ---------- Helpers ISBN ----------
export function cleanIsbn(s) { return String(s || "").replace(/[^0-9Xx]/g, "").toUpperCase(); }
export function isbn10to13(i) {
  i = cleanIsbn(i); if (i.length !== 10) return "";
  const core = "978" + i.slice(0, 9); let sum = 0;
  for (let k = 0; k < 12; k++) sum += (k % 2 === 0 ? 1 : 3) * Number(core[k]);
  return core + ((10 - (sum % 10)) % 10);
}
export function isbn13to10(i) {
  i = cleanIsbn(i); if (i.length !== 13 || !i.startsWith("978")) return "";
  const core = i.slice(3, 12); let sum = 0;
  for (let k = 0; k < 9; k++) sum += (10 - k) * Number(core[k]);
  const c = (11 - (sum % 11)) % 11; return core + (c === 10 ? "X" : String(c));
}
export function isbnVariants(i) {
  i = cleanIsbn(i); const set = new Set();
  if (i) set.add(i);
  if (i.length === 10) { const v = isbn10to13(i); if (v) set.add(v); }
  if (i.length === 13) { const v = isbn13to10(i); if (v) set.add(v); }
  return [...set];
}
export function normTitle(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
export function findDuplicate(books, cand, ignoreId) {
  const ci = cleanIsbn(cand.isbn), cv = ci ? isbnVariants(ci) : [];
  const ct = normTitle(cand.titre), ctome = cand.tome || "";
  return books.find(b => {
    if (ignoreId && b.id === ignoreId) return false;
    if (ci && b.isbn && isbnVariants(cleanIsbn(b.isbn)).some(v => cv.includes(v))) return true;
    if (ct && normTitle(b.titre) === ct) {
      if (ctome !== "" && b.tome !== "" && b.tome != null) return String(b.tome) === String(ctome);
      return true;
    }
    return false;
  }) || null;
}
export function inLibrary(b) { return b.statut !== "a-confirmer"; }
export function amazonUrl(b) {
  const q = b.isbn ? b.isbn : [b.titre, b.serie, b.auteur].filter(Boolean).join(" ");
  return "https://www.amazon.fr/s?k=" + encodeURIComponent(q) + "&i=stripbooks";
}
export function extractTome(s) {
  s = " " + String(s || "") + " ";
  let m = s.match(/(?:tome|t\.?|#|vol\.?)\s*(\d{1,3})/i);
  if (m) return Number(m[1]);
  m = s.match(/\s-\s*(\d{1,3})\s*-/); if (m) return Number(m[1]);
  return "";
}


// ---------- Liste noire (séries / albums à ne plus proposer) ----------
export function loadBlacklist() {
  try { const b = JSON.parse(localStorage.getItem(BLACKLIST_KEY) || "{}"); return { series: b.series || [], albums: b.albums || [] }; }
  catch { return { series: [], albums: [] }; }
}
export function saveBlacklist(bl) { localStorage.setItem(BLACKLIST_KEY, JSON.stringify({ series: bl.series || [], albums: bl.albums || [] })); }

// clé album : ISBN si dispo, sinon titre normalisé + tome
export function albumKey(a) {
  const isbn = cleanIsbn(a.isbn || "");
  if (isbn) return "isbn:" + isbn;
  return "t:" + normTitle(a.titre || "") + "|" + (a.tome != null && a.tome !== "" ? a.tome : "");
}
export function isSerieBlacklisted(bl, serie) { return (bl.series || []).some(s => s.key === normTitle(serie || "")); }
export function isAlbumBlacklisted(bl, a) { const k = albumKey(a); return (bl.albums || []).some(x => x.key === k); }

export function blacklistSerie(bl, serie) {
  const key = normTitle(serie || ""); if (!key) return bl;
  if (bl.series.some(s => s.key === key)) return bl;
  return { ...bl, series: [...bl.series, { key, name: serie, addedAt: Date.now() }] };
}
export function blacklistAlbum(bl, a) {
  const key = albumKey(a);
  if (bl.albums.some(x => x.key === key)) return bl;
  const label = (a.serie ? a.serie + " " : "") + (a.tome ? "T." + a.tome + " " : "") + (a.titre || "");
  return { ...bl, albums: [...bl.albums, { key, label: label.trim() || a.titre || key, serie: a.serie || "", tome: a.tome ?? "", isbn: cleanIsbn(a.isbn || ""), addedAt: Date.now() }] };
}
export function unblacklistSerie(bl, key) { return { ...bl, series: bl.series.filter(s => s.key !== key) }; }
export function unblacklistAlbum(bl, key) { return { ...bl, albums: bl.albums.filter(x => x.key !== key) }; }
