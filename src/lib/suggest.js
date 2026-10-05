// Assistant de rangement : repère les similitudes dans la collection et propose des reclassements.
// Proposition = { key, type, icon, title, detail, items, changes:[{id, patch} | {id, del:true}],
//                 make?(nom) -> changes, target?, choices?, editable? }
import { normTitle, extractTome, cleanIsbn, isbnVariants, guessGenre, GENRES, GENRE_KEYS, OWNED, STATUS_LABELS } from "./store.js";

export const SUGG_TYPES = [
  { type: "dup", label: "👯 Doublons", hint: "Le même album apparaît plusieurs fois. On garde l’exemplaire le plus complet (✅) et on supprime les autres (🗑️)." },
  { type: "merge", label: "🔗 Séries à fusionner", hint: "La même série écrite de plusieurs façons (majuscules, accents, collection de l’éditeur, faute de frappe…). Clique sur le nom à garder." },
  { type: "assign", label: "📥 Albums à ranger dans une série", hint: "Albums sans série dont le titre correspond à une série que tu as déjà." },
  { type: "new", label: "🆕 Nouvelles séries", hint: "Titres du type « Série — T.3 » sans série renseignée. Tu peux corriger le nom avant d’appliquer." },
  { type: "tome", label: "🔢 Numéros de tome", hint: "Le numéro est dans le titre mais pas dans le champ Tome." },
  { type: "genre", label: "🌍 Genres", hint: "Franco-belge, manga ou comics : sert aux stats et à l’étagère (mangas plus petits)." },
];

// mots qui désignent une collection d'éditeur, pas une série (« Soleil manga seinen »…)
const COLL = new Set(["manga", "mangas", "seinen", "shonen", "shounen", "shojo", "shoujo", "josei", "kodomo", "collection", "coll",
  "soleil", "glenat", "kana", "pika", "ki", "oon", "kurokawa", "delcourt", "tonkam", "panini", "urban", "comics", "dargaud",
  "dupuis", "casterman", "lombard", "edition", "editions", "poche"]);
const isCollWord = (w) => COLL.has(w);

export function looseKey(name) {
  return normTitle(String(name || "").replace(/&/g, " et ")).replace(/^(les|le|la|l|the|un|une|des)\s+/, "").trim();
}
function stripLeadingColl(k) { const w = k.split(" "); let i = 0; while (i < w.length - 1 && isCollWord(w[i])) i++; return w.slice(i).join(" "); }
function isCollectionOnly(name) { const k = looseKey(name); return !!k && k.split(" ").every(isCollWord); }
// « soleil manga dai dark » = « dai dark » entouré de mots de collection
function wrapsWithCollection(longK, shortK) {
  if (shortK.length < 3 || longK === shortK) return false;
  let extra = null;
  if (longK.startsWith(shortK + " ")) extra = longK.slice(shortK.length + 1);
  else if (longK.endsWith(" " + shortK)) extra = longK.slice(0, longK.length - shortK.length - 1);
  return !!extra && extra.split(" ").every(isCollWord);
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const digitsOf = (s) => (s.match(/\d+/g) || []).join(",");
function similar(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (wrapsWithCollection(a, b) || wrapsWithCollection(b, a)) return true;
  const min = Math.min(a.length, b.length);
  if (min < 6 || digitsOf(a) !== digitsOf(b)) return false;        // « Spirou 2 » ≠ « Spirou 3 »
  return lev(a, b) <= (min >= 12 ? 2 : 1);                         // fautes de frappe
}
function numberAfter(k, serieK) {
  if (!serieK || !k.startsWith(serieK + " ")) return "";
  const m = k.slice(serieK.length + 1).match(/^(?:t|tome|vol|volume|n|no)?\s*(\d{1,3})\b/);
  return m ? Number(m[1]) : "";
}
const TOME_RE = /^(.{2,}?)[\s—–\-,:.]*(?:\bt\.?\s*|\btome\s*|\bvol\.?\s*|\bvolume\s*|#\s*|\bn[°o]\.?\s*)(\d{1,3})\b/i;
const TRAIL_RE = /^(.{3,}?)\s+(\d{1,3})$/;
const hasTome = (b) => b.tome !== "" && b.tome != null;
const label = (b) => b.titre || (b.isbn ? "ISBN " + b.isbn : "?");
function cleanPrefix(p) {
  const segs = String(p).replace(/[\s—–\-,:.]+$/, "").trim().split(/\s+[—–-]\s+/);
  while (segs.length > 1 && isCollectionOnly(segs[0])) segs.shift();
  return segs.join(" — ").trim();
}

export function buildSuggestions(books, ignored = new Set()) {
  const out = [];
  const push = (s) => { if (!ignored.has(s.key) && s.changes && s.changes.length) out.push(s); };
  books = books || [];

  // séries existantes (nom affiché -> albums) ; une « série » qui n'est qu'une collection éditeur ne compte pas
  const series = new Map();
  books.forEach(b => { const s = (b.serie || "").trim(); if (s && !isCollectionOnly(s)) { if (!series.has(s)) series.set(s, []); series.get(s).push(b); } });
  const names = [...series.keys()];

  // ---- 1) doublons : même ISBN, ou même série + même tome (sans ISBN différents)
  const inDup = new Set(), dupGroups = [];
  const byIsbn = new Map();
  books.forEach(b => { const vs = isbnVariants(cleanIsbn(b.isbn)); const k = vs.find(v => v.length === 13) || vs[0]; if (k && k.length >= 10) { if (!byIsbn.has(k)) byIsbn.set(k, []); byIsbn.get(k).push(b); } });
  byIsbn.forEach(list => { if (list.length > 1) { dupGroups.push(list); list.forEach(b => inDup.add(b.id)); } });
  const bySt = new Map();
  books.forEach(b => { if (inDup.has(b.id) || !(b.serie || "").trim() || !hasTome(b)) return; const k = looseKey(b.serie) + "|" + Number(b.tome); if (!bySt.has(k)) bySt.set(k, []); bySt.get(k).push(b); });
  bySt.forEach(list => { if (list.length > 1 && list.some(b => cleanIsbn(b.isbn).length < 10)) dupGroups.push(list); });
  const score = (b) => (OWNED.includes(b.statut) ? 4 : 0) + (b.cover ? 2 : 0) + (b.serie ? 1 : 0) + (hasTome(b) ? 1 : 0) + (b.note ? 1 : 0) + (b.statut === "lu" ? 0.5 : 0) + (b.commentaire ? 0.25 : 0);
  dupGroups.forEach(list => {
    const sorted = list.slice().sort((a, b) => score(b) - score(a));
    const drop = sorted.slice(1);
    push({ key: "dup:" + list.map(b => b.id).sort().join(","), type: "dup", icon: "👯", title: "Doublon : " + label(sorted[0]),
      detail: "Garder 1 exemplaire, supprimer " + drop.length + " copie(s)",
      items: sorted.map((b, i) => (i === 0 ? "✅ " : "🗑️ ") + label(b) + " [" + (STATUS_LABELS[b.statut] || b.statut) + "]"),
      changes: drop.map(b => ({ id: b.id, del: true })) });
  });

  // ---- 2) variantes d'une même série -> fusion
  const keys = names.map(looseKey);
  const parent = names.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    if (find(i) !== find(j) && similar(keys[i], keys[j])) parent[find(j)] = find(i);
  }
  const groups = new Map();
  names.forEach((n, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(n); });
  const canon = new Map();     // nom -> nom retenu
  const pen = (n) => looseKey(n).split(" ").filter(isCollWord).length;
  groups.forEach(g => {
    const ranked = g.slice().sort((a, b) => pen(a) - pen(b) || series.get(b).length - series.get(a).length || a.length - b.length);
    const target = ranked[0];
    g.forEach(n => canon.set(n, target));
    if (g.length < 2) return;
    const make = (t) => g.filter(n => n !== t).flatMap(n => series.get(n).map(b => ({ id: b.id, patch: { serie: t } })));
    push({ key: "merge:" + g.slice().sort().join("|"), type: "merge", icon: "🔗", title: "Fusionner " + g.length + " variantes d’une même série",
      detail: g.map(n => "« " + n + " » (" + series.get(n).length + ")").join(" · "), choices: ranked, target, make, changes: make(target), items: [] });
  });

  // ---- 3) albums sans série (ou rangés dans une « collection éditeur »)
  const canonNames = [...new Set(names.map(n => canon.get(n)))];
  const loose = canonNames.map(n => ({ name: n, k: looseKey(n) })).filter(s => s.k.length >= 3).sort((a, b) => b.k.length - a.k.length);
  const newGroups = new Map();
  books.filter(b => !(b.serie || "").trim() || isCollectionOnly(b.serie)).forEach(b => {
    const tn = stripLeadingColl(looseKey(b.titre));
    if (!tn || tn.startsWith("isbn")) return;
    const m = loose.find(s => tn === s.k || tn.startsWith(s.k + " ") || wrapsWithCollection(looseKey(b.titre), s.k));
    if (m) {
      const t = hasTome(b) ? "" : (extractTome(b.titre) || numberAfter(tn, m.k));
      const patch = { serie: m.name }; if (t !== "" && t) patch.tome = Number(t);
      push({ key: "assign:" + b.id + ":" + m.k, type: "assign", icon: "📥", title: "Ranger dans « " + m.name + " »",
        detail: label(b) + (patch.tome ? " → T." + patch.tome : ""), items: [], changes: [{ id: b.id, patch }] });
      return;
    }
    let mm = String(b.titre || "").match(TOME_RE), strong = !!mm;
    if (!mm) mm = String(b.titre || "").match(TRAIL_RE);
    if (!mm) return;
    const name = cleanPrefix(mm[1]); const pk = looseKey(name);
    if (!pk || pk.length < 2 || pk.startsWith("isbn") || isCollectionOnly(name)) return;
    if (!newGroups.has(pk)) newGroups.set(pk, { name, items: [] });
    newGroups.get(pk).items.push({ b, tome: hasTome(b) ? "" : Number(mm[2]), strong });
  });
  newGroups.forEach((g, pk) => {
    if (g.items.length < 2 && !g.items.some(x => x.strong)) return;   // « Paris 2024 » seul : pas assez sûr
    const make = (name) => g.items.map(({ b, tome }) => ({ id: b.id, patch: tome ? { serie: name, tome } : { serie: name } }));
    push({ key: "new:" + pk, type: "new", icon: "🆕", title: "Créer la série « " + g.name + " »", detail: g.items.length + " album(s)",
      editable: true, target: g.name, make, changes: make(g.name),
      items: g.items.map(x => label(x.b) + (x.tome ? " (T." + x.tome + ")" : "")) });
  });

  // ---- 4) numéro de tome présent dans le titre mais pas dans le champ
  series.forEach((list, name) => {
    const k = looseKey(name);
    const taken = new Set(list.filter(hasTome).map(b => Number(b.tome)));
    list.forEach(b => {
      if (hasTome(b)) return;
      let t = extractTome(b.titre);
      if (t === "" || !t) t = numberAfter(stripLeadingColl(looseKey(b.titre)), k);
      if (t === "" || !t) return;
      push({ key: "tome:" + b.id + ":" + t, type: "tome", icon: "🔢", title: "T." + t + " dans « " + name + " »",
        detail: label(b) + (taken.has(Number(t)) ? " · ⚠️ ce tome existe déjà dans la série" : ""), items: [], changes: [{ id: b.id, patch: { tome: Number(t) } }] });
    });
  });

  // ---- 5) genre par série (franco-belge / manga / comics)
  const bySerie = new Map();
  names.forEach(n => { const c = canon.get(n); if (!bySerie.has(c)) bySerie.set(c, []); bySerie.get(c).push(...series.get(n)); });
  bySerie.forEach((list, name) => {
    const explicit = list.filter(b => GENRE_KEYS.includes(b.format));
    const missing = list.length - explicit.length;
    let g = "", why = "";
    if (explicit.length) {
      const votes = {}; explicit.forEach(b => { votes[b.format] = (votes[b.format] || 0) + 1; });
      const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
      g = ranked[0][0];
      if (ranked.length > 1) why = "genres mélangés dans la série";
      else if (missing) why = missing + " tome(s) sans genre";
      else return;
    } else {
      const votes = {}; list.forEach(b => { const x = guessGenre(b); if (x) votes[x] = (votes[x] || 0) + 1; });
      const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
      if (!ranked.length) return;
      g = ranked[0][0];
      const ed = (list.find(b => guessGenre(b) === g && b.editeur) || {}).editeur;
      why = ed ? "déduit de l’éditeur « " + ed + " »" : "déduit du titre";
    }
    push({ key: "genre:" + looseKey(name) + ":" + g, type: "genre", icon: GENRES[g].icon, title: "« " + name + " » → " + GENRES[g].label,
      detail: list.length + " album(s) · " + why, items: [], changes: list.filter(b => b.format !== g).map(b => ({ id: b.id, patch: { format: g } })) });
  });

  return out;
}
