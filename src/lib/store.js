// Helpers purs (ISBN, titres, doublons, liste noire…) — la persistance est dans db.js (Supabase)
export const OWNED = ["jai", "lu", "en-cours", "a-lire"];
export const STATUS_LABELS = { "a-lire": "À lire", "en-cours": "En cours", "lu": "Lu", "jai": "J’ai", "veux": "Je veux", "a-confirmer": "À confirmer" };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Préférence (par appareil) : un scan ajoute directement à la collection au lieu de « à trier »
const SCAN_DIRECT_KEY = "bdlib-scan-direct";
export function getScanDirect() { try { return localStorage.getItem(SCAN_DIRECT_KEY) === "1"; } catch { return false; } }
export function setScanDirect(v) { try { localStorage.setItem(SCAN_DIRECT_KEY, v ? "1" : "0"); } catch {} }

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
    const bi = cleanIsbn(b.isbn);
    if (ci && bi && isbnVariants(bi).some(v => cv.includes(v))) return true;
    if (ci.length >= 10 && bi.length >= 10) return false; // ISBN différents => albums différents (tomes d'une série)
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


// Cherche un album dans le catalogue de référence local (BDGest) par ISBN.
// Instantané, pas d'API — couvre les BD FR absentes de Google Books/OpenLibrary.
export function lookupInCatalog(refCatalog, isbnRaw) {
  const variants = isbnVariants(cleanIsbn(isbnRaw));
  if (!variants.length) return null;
  const vset = new Set(variants);
  const hit = (refCatalog || []).find(c => {
    const ci = cleanIsbn(c.isbn || "");
    if (!ci) return false;
    return isbnVariants(ci).some(v => vset.has(v));
  });
  if (!hit) return null;
  const serie = hit.serie || "";
  const t = hit.titre || "";
  const titre = (serie && hit.tome && t) ? (serie + " — T." + hit.tome + " — " + t)
              : (serie && t) ? (serie + " — " + t) : (t || serie);
  return {
    titre: titre || ("ISBN " + variants[0]), serie, tome: hit.tome ?? "",
    auteur: hit.auteur || "", editeur: hit.editeur || "", annee: hit.annee || "",
    isbn: hit.isbn || variants[0], cover: hit.cover || "",
  };
}


// URL de vignette « meilleure source » (BnF -> Google -> OpenLibrary, validée côté serveur).
// Utilisable directement dans <img src>. "" si ISBN invalide.
export function coverThumbUrl(isbnRaw) {
  const vs = isbnVariants(cleanIsbn(isbnRaw));
  const i = vs.find(v => v.length === 13) || vs[0] || "";
  return (i.length === 13 || i.length === 10) ? "/api/cover?img=1&isbn=" + i : "";
}


// Liste des séries existantes : [{ name, count, tomes:[1,2,4] }] (exclut éventuellement un album)
export function buildSeriesList(books, excludeId) {
  const m = new Map();
  (books || []).forEach(b => {
    if (excludeId && b.id === excludeId) return;
    const name = (b.serie || "").trim(); if (!name) return;
    const k = normTitle(name);
    const e = m.get(k) || { name, count: 0, tomes: [] };
    e.count++;
    if (b.tome !== "" && b.tome != null && !e.tomes.includes(Number(b.tome))) e.tomes.push(Number(b.tome));
    m.set(k, e);
  });
  return [...m.values()].map(e => ({ ...e, tomes: e.tomes.sort((a, b) => a - b) }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
}

// Tri des albums. mode : recent | ancien | titre | serie | auteur | annee | note
export const SORT_LABELS = { recent: "🕒 Ajout récent", ancien: "🕰️ Ajout ancien", titre: "🔤 Titre A→Z", serie: "🗂️ Série puis tome", auteur: "✍️ Auteur", annee: "📅 Année", note: "⭐ Note" };
export function sortBooks(list, mode) {
  const cmp = (a, b) => String(a || "").localeCompare(String(b || ""), "fr", { sensitivity: "base", numeric: true });
  const num = (v) => (v === "" || v == null ? -1 : Number(v));
  const out = list.slice();
  switch (mode) {
    case "ancien": return out.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    case "titre": return out.sort((a, b) => cmp(a.titre, b.titre));
    case "serie": return out.sort((a, b) => cmp(a.serie || a.titre, b.serie || b.titre) || (num(a.tome) - num(b.tome)));
    case "auteur": return out.sort((a, b) => cmp(a.auteur || "~", b.auteur || "~") || cmp(a.titre, b.titre));
    case "annee": return out.sort((a, b) => num(b.annee) - num(a.annee) || cmp(a.titre, b.titre));
    case "note": return out.sort((a, b) => (b.note || 0) - (a.note || 0) || cmp(a.titre, b.titre));
    default: return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
}
