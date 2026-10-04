// Couche données Supabase (remplace localStorage).
// Mappe les champs JS (camelCase) <-> colonnes SQL (snake_case).
// Chaque fonction est privée à l'utilisateur connecté via RLS (user_id = auth.uid()).
import { supabase } from "./supabaseClient.js";

// ---------- mapping book <-> row ----------
export function rowToBook(r) {
  return {
    id: r.id, titre: r.titre || "", serie: r.serie || "",
    tome: r.tome == null ? "" : r.tome,
    auteur: r.auteur || "", editeur: r.editeur || "",
    annee: r.annee == null ? "" : r.annee,
    isbn: r.isbn || "", statut: r.statut || "jai",
    note: r.note || 0, commentaire: r.commentaire || "",
    cover: r.cover || "", _coverOk: !!r.cover_ok,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
  };
}
function bookToRow(b, userId) {
  const row = {
    user_id: userId,
    titre: b.titre || "", serie: b.serie || "",
    tome: (b.tome === "" || b.tome == null) ? null : Number(b.tome),
    auteur: b.auteur || "", editeur: b.editeur || "",
    annee: (b.annee === "" || b.annee == null) ? null : Number(b.annee),
    isbn: b.isbn || "", statut: b.statut || "jai",
    note: Number(b.note) || 0, commentaire: b.commentaire || "",
    cover: b.cover || "", cover_ok: !!b._coverOk,
  };
  // id : seulement si c'est un uuid (sinon laissé à Postgres)
  if (b.id && /^[0-9a-f-]{36}$/i.test(b.id)) row.id = b.id;
  return row;
}

async function uid() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

// ---------- BOOKS ----------
export async function fetchBooks() {
  const { data, error } = await supabase.from("books").select("*").order("created_at", { ascending: false });
  if (error) { console.warn("fetchBooks", error); return []; }
  return (data || []).map(rowToBook);
}
export async function insertBook(b) {
  const userId = await uid(); if (!userId) return null;
  const { data, error } = await supabase.from("books").insert(bookToRow(b, userId)).select().single();
  if (error) { console.warn("insertBook", error); return null; }
  return rowToBook(data);
}
export async function insertBooks(list) {
  const userId = await uid(); if (!userId || !list.length) return [];
  const rows = list.map(b => bookToRow(b, userId));
  const { data, error } = await supabase.from("books").insert(rows).select();
  if (error) { console.warn("insertBooks", error); return []; }
  return (data || []).map(rowToBook);
}
export async function updateBook(id, patch) {
  const userId = await uid(); if (!userId) return null;
  const row = bookToRow({ ...patch, id }, userId); delete row.user_id;
  const { data, error } = await supabase.from("books").update(row).eq("id", id).select().single();
  if (error) { console.warn("updateBook", error); return null; }
  return rowToBook(data);
}
export async function deleteBook(id) {
  const { error } = await supabase.from("books").delete().eq("id", id);
  if (error) { console.warn("deleteBook", error); return false; }
  return true;
}

// ---------- REF CATALOG ----------
export async function fetchRefCatalog() {
  const { data, error } = await supabase.from("ref_catalog").select("*");
  if (error) { console.warn("fetchRefCatalog", error); return []; }
  return (data || []).map(r => ({ titre: r.titre||"", serie: r.serie||"", tome: r.tome==null?"":r.tome, auteur: r.auteur||"", editeur: r.editeur||"", annee: r.annee||"", isbn: r.isbn||"", cover: r.cover||"" }));
}
export async function replaceRefCatalog(cat) {
  const userId = await uid(); if (!userId) return false;
  await supabase.from("ref_catalog").delete().eq("user_id", userId);
  if (!cat.length) return true;
  const rows = cat.map(c => ({ user_id: userId, titre: c.titre||"", serie: c.serie||"", tome: (c.tome===""||c.tome==null)?null:Number(c.tome), auteur: c.auteur||"", editeur: c.editeur||"", annee: String(c.annee||""), isbn: c.isbn||"", cover: c.cover||"" }));
  // insertion par lots de 500
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("ref_catalog").insert(rows.slice(i, i+500));
    if (error) { console.warn("replaceRefCatalog", error); return false; }
  }
  return true;
}

// ---------- SERIES META ----------
export async function fetchSeriesMeta() {
  const { data, error } = await supabase.from("series_meta").select("*");
  if (error) { console.warn("fetchSeriesMeta", error); return {}; }
  const out = {};
  (data || []).forEach(r => { out[r.serie_key] = { total: r.total==null?"":r.total, source: r.source||"", checkedAt: r.checked_at }; });
  return out;
}
export async function upsertSeriesMeta(serieKey, meta) {
  const userId = await uid(); if (!userId) return false;
  const row = { user_id: userId, serie_key: serieKey, total: (meta.total===""||meta.total==null)?null:Number(meta.total), source: meta.source||"", checked_at: meta.checkedAt || new Date().toISOString(), updated_at: new Date().toISOString() };
  const { error } = await supabase.from("series_meta").upsert(row, { onConflict: "user_id,serie_key" });
  if (error) { console.warn("upsertSeriesMeta", error); return false; }
  return true;
}

// ---------- BLACKLIST ----------
export async function fetchBlacklist() {
  const { data, error } = await supabase.from("blacklist").select("*");
  if (error) { console.warn("fetchBlacklist", error); return { series: [], albums: [] }; }
  const series = [], albums = [];
  (data || []).forEach(r => {
    const item = { key: r.key, name: r.label || r.key, label: r.label || r.key, serie: r.serie||"", tome: r.tome==null?"":r.tome, isbn: r.isbn||"", addedAt: r.added_at ? new Date(r.added_at).getTime() : Date.now() };
    if (r.kind === "serie") series.push(item); else albums.push(item);
  });
  return { series, albums };
}
export async function addBlacklist(kind, entry) {
  const userId = await uid(); if (!userId) return false;
  const row = { user_id: userId, kind, key: entry.key, label: entry.label || entry.name || entry.key, serie: entry.serie||"", tome: (entry.tome===""||entry.tome==null)?null:Number(entry.tome), isbn: entry.isbn||"" };
  const { error } = await supabase.from("blacklist").upsert(row, { onConflict: "user_id,kind,key" });
  if (error) { console.warn("addBlacklist", error); return false; }
  return true;
}
export async function removeBlacklist(kind, key) {
  const userId = await uid(); if (!userId) return false;
  const { error } = await supabase.from("blacklist").delete().eq("user_id", userId).eq("kind", kind).eq("key", key);
  if (error) { console.warn("removeBlacklist", error); return false; }
  return true;
}
