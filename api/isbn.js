// Fonction serverless Vercel : /api/isbn?isbn=978...
// Résout un ISBN en { titre, auteur, editeur, annee, cover } en enchaînant
// plusieurs sources GRATUITES côté serveur (pas de souci CORS, pas de clé).
// Ordre : BnF (dépôt légal FR, couvre les BD franco-belges) -> Google Books ->
//         OpenLibrary -> recherche libraires FR -> ISBNdb (si clé). La couverture
//         vient d'OpenLibrary par ISBN en secours quand la source n'en fournit pas.

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

// ---- Source FR PRINCIPALE : BnF (dépôt légal français — couvre toutes les BD FR) ----
// API SRU publique, sans clé, renvoie du XML UNIMARC. Idéale pour les BD franco-belges
// absentes de Google Books / OpenLibrary.
function xmlField(xml, tag) {
  // récupère le contenu du 1er <...>tag<...> quel que soit le préfixe de namespace
  const re = new RegExp("<[^>]*\\b" + tag + "\\b[^>]*>([\\s\\S]*?)<\\/[^>]*" + tag + "[^>]*>", "i");
  const m = xml.match(re);
  return m ? m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}
// UNIMARC : les zones sont des <mxc:datafield tag="200"> avec des <mxc:subfield code="a">…
function unimarcSub(xml, fieldTag, subCode) {
  const fre = new RegExp('<[^>]*datafield[^>]*tag="' + fieldTag + '"[^>]*>([\\s\\S]*?)<\\/[^>]*datafield>', "i");
  const fm = xml.match(fre);
  if (!fm) return "";
  const sre = new RegExp('<[^>]*subfield[^>]*code="' + subCode + '"[^>]*>([\\s\\S]*?)<\\/[^>]*subfield>', "i");
  const sm = fm[1].match(sre);
  return sm ? sm[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}
function unimarcAllSub(xml, fieldTag, subCode) {
  const out = [];
  const fre = new RegExp('<[^>]*datafield[^>]*tag="' + fieldTag + '"[^>]*>([\\s\\S]*?)<\\/[^>]*datafield>', "ig");
  let fm;
  while ((fm = fre.exec(xml)) !== null) {
    const sre = new RegExp('<[^>]*subfield[^>]*code="' + subCode + '"[^>]*>([\\s\\S]*?)<\\/[^>]*subfield>', "ig");
    let sm;
    while ((sm = sre.exec(fm[1])) !== null) {
      const v = sm[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (v) out.push(v);
    }
  }
  return out;
}

async function tryBnF(isbn) {
  const url = "https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve"
    + "&query=" + encodeURIComponent('bib.ean all "' + isbn + '"')
    + "&recordSchema=unimarcxchange&maximumRecords=1";
  const xml = await fetchText(url, 8000);
  if (!xml || !/numberOfRecords/i.test(xml)) return null;
  const nb = xml.match(/<[^>]*numberOfRecords[^>]*>\s*(\d+)/i);
  if (nb && nb[1] === "0") return null;

  // UNIMARC : 200$a titre, 210$c éditeur (prendre le DERNIER $c), 210$d date, 225$a collection(série)
  // 200$a titre, 200$h n° de partie, 200$i titre de partie ; 461$t/$v = série et n° de volume.
  // 225$a = collection ÉDITEUR (ex. « Soleil manga seinen ») : ce n'est PAS la série.
  const t200 = unimarcSub(xml, "200", "a");
  const h200 = unimarcSub(xml, "200", "h");
  const i200 = unimarcSub(xml, "200", "i");
  const s461 = unimarcSub(xml, "461", "t");
  const v461 = unimarcSub(xml, "461", "v");
  const c225 = unimarcSub(xml, "225", "a");
  const numOf = (s) => { const m = String(s || "").match(/\d{1,3}/); return m ? parseInt(m[0], 10) : ""; };
  const tome = numOf(h200) || numOf(v461) || "";
  const isEditorCollection = /manga|seinen|sh[oō]nen|sh[oō]jo|collection|poche|[ée]dition|soleil|gl[ée]nat|kana|pika|ki-oon|kurokawa|delcourt|dargaud|dupuis|casterman|lombard|panini|urban/i.test(c225);
  const serie = s461 || ((h200 || i200) ? t200 : "") || (c225 && !isEditorCollection ? c225 : "");
  const partTitle = i200 || (t200 && serie && t200.toLowerCase() !== serie.toLowerCase() ? t200 : "");
  const titre = t200;
  const authNames = [];
  ["700", "701", "702"].forEach(f => {
    const noms = unimarcAllSub(xml, f, "a");
    const prenoms = unimarcAllSub(xml, f, "b");
    noms.forEach((nom, k) => { const pre = prenoms[k] || ""; authNames.push((pre + " " + nom).trim()); });
  });
  const auteur = authNames.join(", ");
  // éditeur : il peut y avoir plusieurs $c (co-éditions) — on prend le dernier non vide
  const editeurs = unimarcAllSub(xml, "210", "c");
  let editeur = editeurs.length ? editeurs[editeurs.length - 1] : "";
  // fallback robuste : chercher un éditeur BD FR connu dans le texte brut du XML
  if (!editeur) {
    const known = ["Dargaud","Dupuis","Casterman","Delcourt","Glénat","Glenat","Le Lombard","Lombard","Soleil","Urban Comics","Panini","Bamboo","Fluide Glacial","Rue de Sèvres","Dupuis","Kana","Pika","Ki-oon","Vents d'Ouest","Les Humanoïdes Associés","L'Atalante","Albin Michel","Gallimard","Milan","Nucléa","Hors Collection","Robert Laffont","Éditions du Signe","Pointe Noire","Les Arènes"];
    const text = xml.replace(/<[^>]+>/g, " ");
    for (const k of known) { if (new RegExp("\\b" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(text)) { editeur = k; break; } }
  }
  const dmatch = (unimarcSub(xml, "210", "d") || xml).match(/\b(19|20)\d{2}\b/);
  const annee = dmatch ? dmatch[0] : "";

  // couverture : vignette BnF via l'ARK (ex: ark:/12148/cb48630154f) si présent
  let cover = "";
  const ark = xml.match(/ark:\/12148\/(cb[0-9a-z]+)/i);
  if (ark) cover = "https://catalogue.bnf.fr/couverture?appName=NE&idArk=ark:/12148/" + ark[1] + "&couverture=1";

  if (!titre) return null;
  // même format que l'import BDGest : « Série — T.n — Titre »
  let full = titre;
  if (serie && tome && partTitle) full = serie + " — T." + tome + " — " + partTitle;
  else if (serie && tome) full = serie + " — T." + tome;
  else if (serie && partTitle) full = serie + " — " + partTitle;
  return { titre: full, auteur, editeur: editeur || "", annee, cover, serie, tome, source: "bnf" };
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
  // BnF d'abord (dépôt légal FR : couvre les BD franco-belges)
  for (const v of vs) { const r = await tryBnF(v); if (r && r.titre) { result = r; break; } }
  if (!result || !result.titre) {
    for (const v of vs) { const r = await tryGoogle(v); if (r && r.titre) { result = r; break; } }
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
    return res.status(200).json({ found: false, isbn: isbn13, titre: "", auteur: "", editeur: "", annee: "", cover: "" });
  }
  // couverture de secours si absente
  result.found = true; result.isbn = isbn13;
  return res.status(200).json(result);
}
