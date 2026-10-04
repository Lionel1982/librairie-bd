// Couche API : recherche multi-sources, enrichissement couvertures, Wikipédia, CSV BDGest
import { cleanIsbn, isbnVariants, normTitle } from "./store.js";

let apiCooldownUntil = 0;
function apiOnCooldown() { return Date.now() < apiCooldownUntil; }

export async function fetchJson(url, opts = {}) {
  const timeout = opts.timeout || 7000, retries = opts.retries ?? 1;
  const isGoogle = url.includes("googleapis.com");
  if (isGoogle && apiOnCooldown()) throw new Error("API en pause (429)");
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (r.status === 429) { if (isGoogle) apiCooldownUntil = Date.now() + 60000; throw new Error("HTTP 429"); }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const t = await r.text();
      if (!t || !t.trim()) throw new Error("réponse vide");
      return JSON.parse(t);
    } catch (e) {
      clearTimeout(timer);
      if (String(e).includes("429")) throw e;
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
    }
  }
}

export function validateImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const img = new Image(); let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
    const timer = setTimeout(() => finish(false), 6000);
    img.onload = () => { clearTimeout(timer); finish(img.naturalWidth > 2 && img.naturalHeight > 2); };
    img.onerror = () => { clearTimeout(timer); finish(false); };
    img.src = url;
  });
}
export async function resolveCover(isbn, googleCover) {
  const tries = [];
  if (isbn) { tries.push("https://covers.openlibrary.org/b/isbn/" + isbn + "-L.jpg?default=false"); tries.push("https://covers.openlibrary.org/b/isbn/" + isbn + "-M.jpg?default=false"); }
  if (googleCover) tries.push(googleCover);
  for (const u of tries) { if (await validateImage(u)) return u.replace("?default=false", ""); }
  return "";
}

export async function lookupByISBN(isbnRaw) {
  const isbn = cleanIsbn(isbnRaw), variants = isbnVariants(isbn);
  const coverIsbn = variants.find(v => v.length === 13) || variants[0] || isbn;
  let cover = await resolveCover(coverIsbn, "");
  let best = { titre: "", auteur: "", editeur: "", annee: "", isbn: coverIsbn, cover };
  for (const v of variants) {
    if (!apiOnCooldown()) {
      try {
        const j = await fetchJson("https://www.googleapis.com/books/v1/volumes?q=isbn:" + v, { retries: 0 });
        if (j?.totalItems > 0 && j.items?.length) {
          const info = j.items[0].volumeInfo || {};
          let gc = ""; if (info.imageLinks) gc = (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail || "").replace("http:", "https:").replace("&edge=curl", "");
          const fc = cover || await resolveCover(v, gc);
          const res = { titre: info.title || "", auteur: (info.authors || []).join(", "), editeur: info.publisher || "", annee: info.publishedDate ? parseInt(info.publishedDate.slice(0, 4)) : "", cover: fc, isbn: v };
          if (res.titre) return res; best = res;
        }
      } catch {}
    }
    try {
      const j = await fetchJson("https://openlibrary.org/isbn/" + v + ".json", { retries: 0 });
      if (j?.title) {
        return { titre: j.title + (j.subtitle ? " — " + j.subtitle : ""), auteur: best.auteur, editeur: (j.publishers && j.publishers[0]) || best.editeur || "", annee: (j.publish_date && (j.publish_date.match(/\d{4}/) || [""])[0]) || best.annee || "", cover: cover || await resolveCover(v, ""), isbn: v };
      }
    } catch {}
  }
  return best;
}

async function olSearch(url) {
  const res = [];
  try {
    const j = await fetchJson(url, { timeout: 8000, retries: 0 });
    if (j?.docs) for (const d of j.docs) {
      let isbn = (d.isbn && d.isbn.find(x => x.length === 13)) || (d.isbn && d.isbn[0]) || "";
      let cover = d.cover_i ? "https://covers.openlibrary.org/b/id/" + d.cover_i + "-M.jpg" : (isbn ? "https://covers.openlibrary.org/b/isbn/" + isbn + "-M.jpg" : "");
      res.push({ titre: d.title || "", sousTitre: "", auteur: (d.author_name || []).join(", "), editeur: (d.publisher && d.publisher[0]) || "", annee: d.first_publish_year ? String(d.first_publish_year) : "", isbn, cover, _fr: (d.language || []).includes("fre") });
    }
  } catch {}
  return res;
}

export async function searchCandidates(query, max = 8, refCatalog = []) {
  let out = [];
  const asIsbn = cleanIsbn(query);
  const looksIsbn = (asIsbn.length === 10 || asIsbn.length === 13) && asIsbn.length === query.replace(/[^0-9Xx]/g, "").length;
  // 0) catalogue local (BDGest) prioritaire
  if (refCatalog.length && !looksIsbn) {
    const stop = new Set(["and","les","des","the","de","du","la","le","un","une","et"]);
    const qw = normTitle(query).split(" ").filter(w => w.length >= 3 && !stop.has(w));
    if (qw.length) {
      const local = [];
      refCatalog.forEach(c => {
        const hay = normTitle((c.serie||"")+" "+(c.titre||"")); const ha = normTitle(c.auteur||"");
        let sc = 0, inT = 0; qw.forEach(w => { if (hay.includes(w)) { sc+=2; inT++; } else if (ha.includes(w)) sc+=3; });
        if (sc>0 && inT/qw.length>=0.5) local.push({ ...c, _score: sc+10, _ref: true });
      });
      local.sort((a,b)=>b._score-a._score); out = out.concat(local.slice(0, max));
      if (out.length >= max) return out.slice(0, max);
    }
  }
  if (looksIsbn) {
    out = out.concat(await olSearch("https://openlibrary.org/search.json?isbn=" + asIsbn + "&limit=" + max));
  } else {
    const clean = query.replace(/&/g, " ").replace(/\s+/g, " ").trim();
    const words = clean.split(" ");
    const attempts = [clean];
    if (words.length > 2) attempts.push(words.slice(0, 2).join(" "));
    if (words.length > 1) attempts.push(words[0]);
    for (const q of attempts) {
      out = out.concat(await olSearch("https://openlibrary.org/search.json?title=" + encodeURIComponent(q) + "&limit=" + (max + 8)));
      if (out.length < 3) out = out.concat(await olSearch("https://openlibrary.org/search.json?q=" + encodeURIComponent(q) + "&limit=" + (max + 8)));
      if (!apiOnCooldown()) {
        try {
          const j = await fetchJson("https://www.googleapis.com/books/v1/volumes?q=" + encodeURIComponent(q) + "&maxResults=" + max, { retries: 0 });
          if (j?.items) j.items.forEach(it => { const v = it.volumeInfo || {}; const ids = v.industryIdentifiers || []; let isbn=""; ids.forEach(x=>{if(x.type==="ISBN_13")isbn=x.identifier;}); if(!isbn&&ids[0])isbn=ids[0].identifier; let cover=v.imageLinks?(v.imageLinks.thumbnail||v.imageLinks.smallThumbnail||"").replace("http:","https:").replace("&edge=curl",""):""; if(!cover&&isbn)cover="https://covers.openlibrary.org/b/isbn/"+isbn+"-M.jpg"; out.push({titre:v.title||"",sousTitre:v.subtitle||"",auteur:(v.authors||[]).join(", "),editeur:v.publisher||"",annee:(v.publishedDate||"").slice(0,4),isbn,cover}); });
        } catch {}
      }
      if (out.length >= 3) break;
    }
  }
  out = out.filter(c => c.titre && c.titre.trim());
  // dédoublonnage
  const seen = new Set(), dedup = [];
  for (const c of out) { const k = normTitle(c.titre) + "|" + (c.annee || ""); if (seen.has(k)) continue; seen.add(k); dedup.push(c); }
  if (!looksIsbn) {
    const stop = new Set(["and","les","des","the","de","du","la","le","un","une","et"]);
    const qw = normTitle(query).split(" ").filter(w => w.length >= 3 && !stop.has(w));
    dedup.forEach(c => {
      const hay = normTitle((c.serie||"")+" "+c.titre+" "+(c.sousTitre||"")), ha = normTitle(c.auteur||"");
      let sc = c._ref ? 10 : 0, inT = 0; qw.forEach(w=>{ if(hay.includes(w)){sc+=2;inT++;} else if(ha.includes(w))sc+=3; });
      c._score = sc; c._ratio = qw.length ? inT/qw.length : 1;
    });
    let filtered = dedup.filter(c => c._ratio >= 0.5 || c._score >= 10);
    if (!filtered.length) filtered = dedup.filter(c => c._score > 0);
    if (!filtered.length) filtered = dedup;
    filtered.sort((a,b)=>(b._score-a._score)||((b._fr?1:0)-(a._fr?1:0))||((b.cover?1:0)-(a.cover?1:0)));
    return filtered.slice(0, max);
  }
  dedup.sort((a,b)=>((b._fr?1:0)-(a._fr?1:0))||((b.cover?1:0)-(a.cover?1:0)));
  return dedup.slice(0, max);
}

// Wikipédia : nombre de tomes d'une série
export async function wikipediaSeriesTomes(serie) {
  const api = "https://fr.wikipedia.org/w/api.php?origin=*&format=json&";
  let title = "";
  try {
    const s = await fetchJson(api + "action=query&list=search&srlimit=5&srsearch=" + encodeURIComponent(serie + " bande dessinée"), { retries: 0 });
    const hits = s?.query?.search || []; if (!hits.length) return { total: "" };
    const nt = normTitle(serie);
    title = (hits.find(h => normTitle(h.title).includes(nt)) || hits[0]).title;
  } catch { return { total: "" }; }
  let text = "";
  try {
    const c = await fetchJson(api + "action=query&prop=extracts&explaintext=1&titles=" + encodeURIComponent(title), { retries: 0 });
    const pages = c?.query?.pages; if (pages) text = Object.values(pages)[0]?.extract || "";
  } catch { return { total: "", title }; }
  if (!text) return { total: "", title };
  let total = "";
  let m = text.match(/(?:compos[ée]e?\s+de|comporte|compte|s[ée]rie\s+de)\s+(\d{1,3})\s+(?:tomes?|albums?|volumes?)/i);
  if (m) total = parseInt(m[1]);
  if (!total) {
    const nums = []; const re = /(?:tome|t\.?|n[°o]\.?|volume)\s*(\d{1,3})/gi; let mm;
    while ((mm = re.exec(text)) !== null) { const v = parseInt(mm[1]); if (v > 0 && v < 200) nums.push(v); }
    if (nums.length >= 2) total = Math.max(...nums);
  }
  return { total: total || "", title, ongoing: /en cours/i.test(text), source: "wikipedia:" + title };
}

// Parseur CSV BDGest
export function parseCSV(text, sep = ";") {
  text = text.replace(/^\uFEFF/, ""); const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch; }
    else { if (ch === '"') inQ = true; else if (ch === sep) { row.push(field); field = ""; } else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; } else if (ch !== "\r") field += ch; }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}


// Résout un ISBN via la fonction serverless /api/isbn (multi-sources côté serveur :
// Google Books + OpenLibrary + libraires FR). Évite les limites CORS/BD-FR du client.
// Renvoie { titre, auteur, editeur, annee, cover, found } ou null si échec réseau.
export async function lookupByISBNRemote(isbnRaw) {
  const isbn = cleanIsbn(isbnRaw);
  if (!isbn) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch("/api/isbn?isbn=" + encodeURIComponent(isbn), { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j) return null;
    return { titre: j.titre || "", auteur: j.auteur || "", editeur: j.editeur || "", annee: j.annee || "", cover: j.cover || "", isbn: j.isbn || isbn, found: !!j.found };
  } catch { return null; }
}


// Récupère une couverture valide via la fonction serverless /api/cover (BnF + Google + OpenLibrary).
// Renvoie l'URL de la 1ère image réellement valide, ou "" si aucune.
export async function fetchCover(isbnRaw) {
  const isbn = cleanIsbn(isbnRaw);
  if (!isbn) return "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch("/api/cover?isbn=" + encodeURIComponent(isbn), { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return "";
    const j = await r.json();
    return (j && j.cover) ? j.cover : "";
  } catch { return ""; }
}
