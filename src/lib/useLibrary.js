// Hook central : charge les données depuis Supabase et expose des actions async.
// Modèle optimiste : on met à jour l'état local immédiatement, puis on persiste.
import { useState, useEffect, useCallback } from "react";
import * as DB from "./db.js";
import * as S from "./store.js";
import * as API from "./api.js";

export function useLibrary(userId) {
  const [books, setBooks] = useState([]);
  const [refCatalog, setRefCatalog] = useState([]);
  const [seriesMeta, setSeriesMeta] = useState({});
  const [blacklist, setBlacklist] = useState({ series: [], albums: [] });
  const [loading, setLoading] = useState(true);

  // Chargement initial à la connexion
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [b, rc, sm, bl] = await Promise.all([
        DB.fetchBooks(), DB.fetchRefCatalog(), DB.fetchSeriesMeta(), DB.fetchBlacklist(),
      ]);
      if (!alive) return;
      setBooks(b); setRefCatalog(rc); setSeriesMeta(sm); setBlacklist(bl);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [userId]);

  // ---------- BOOKS ----------
  const addBook = useCallback(async (data) => {
    const saved = await DB.insertBook(data);
    if (saved) setBooks(bs => [saved, ...bs]);
    return saved;
  }, []);

  const addBooksBulk = useCallback(async (list) => {
    const saved = await DB.insertBooks(list);   // peut lever une erreur (remontée à l'appelant)
    if (saved.length) setBooks(bs => [...saved, ...bs]);
    return saved;
  }, []);

  const editBook = useCallback(async (id, patch) => {
    setBooks(bs => bs.map(b => b.id === id ? { ...b, ...patch } : b)); // optimiste
    await DB.updateBook(id, patch);
  }, []);

  const removeBook = useCallback(async (id) => {
    setBooks(bs => bs.filter(b => b.id !== id)); // optimiste
    await DB.deleteBook(id);
  }, []);

  // ---------- REF CATALOG ----------
  const replaceCatalog = useCallback(async (cat) => {
    setRefCatalog(cat);
    await DB.replaceRefCatalog(cat);
  }, []);

  // ---------- SERIES META ----------
  const setSerieMeta = useCallback(async (key, meta) => {
    setSeriesMeta(m => ({ ...m, [key]: { ...(m[key] || {}), ...meta } }));
    await DB.upsertSeriesMeta(key, meta);
  }, []);

  // ---------- BLACKLIST ----------
  const addBlSerie = useCallback(async (name) => {
    const key = S.normTitle(name || "");
    setBlacklist(bl => S.blacklistSerie(bl, name));
    await DB.addBlacklist("serie", { key, label: name, name });
  }, []);
  const addBlAlbum = useCallback(async (a) => {
    const key = S.albumKey(a);
    const label = (a.serie ? a.serie + " " : "") + (a.tome ? "T." + a.tome + " " : "") + (a.titre || "");
    setBlacklist(bl => S.blacklistAlbum(bl, a));
    await DB.addBlacklist("album", { key, label: label.trim() || a.titre || key, serie: a.serie, tome: a.tome, isbn: a.isbn });
  }, []);
  const removeBlSerie = useCallback(async (key) => {
    setBlacklist(bl => S.unblacklistSerie(bl, key));
    await DB.removeBlacklist("serie", key);
  }, []);
  const removeBlAlbum = useCallback(async (key) => {
    setBlacklist(bl => S.unblacklistAlbum(bl, key));
    await DB.removeBlacklist("album", key);
  }, []);

  // enrichit les couvertures manquantes (ciblé) — met à jour localement puis persiste
  const enrichCovers = useCallback(async (ids) => {
    const idSet = ids && ids.length ? new Set(ids) : null;
    let targets = [];
    setBooks(bs => { targets = bs.filter(b => (!idSet || idSet.has(b.id)) && b.titre && (!b.cover || !b._coverOk)); return bs; });
    for (const b of targets) {
      let patch = null;
      if (b.cover && await API.validateImage(b.cover)) patch = { _coverOk: true };
      else if (b.isbn) { const c = await API.resolveCover(S.cleanIsbn(b.isbn), ""); if (c) patch = { cover: c, _coverOk: true }; }
      if (patch) { setBooks(bs => bs.map(x => x.id === b.id ? { ...x, ...patch } : x)); await DB.updateBook(b.id, patch); }
      await new Promise(r => setTimeout(r, 120));
    }
  }, []);

  // Supprime les entrées parasites (lignes d'exemple/template importées par erreur :
  // "Serie — T.TypeObjet — Descriptif", "Revue — T.Num — Titre", "Largeur / Profondeur"...).
  const cleanupJunk = useCallback(async () => {
    const junkRe = /(T\.TypeObjet|T\.Num|TypeObjet|Descriptif|Largeur\s*\/\s*Profondeur|^Serie\b|^Revue\b)/i;
    let targets = [];
    setBooks(bs => {
      targets = bs.filter(b => {
        const hay = (b.serie || "") + " " + (b.titre || "");
        const noIsbn = !b.isbn || String(b.isbn).replace(/[^0-9Xx]/g, "").length < 10;
        return junkRe.test(hay) && noIsbn;
      });
      return bs;
    });
    for (const b of targets) {
      setBooks(bs => bs.filter(x => x.id !== b.id));
      await DB.deleteBook(b.id);
    }
    return { removed: targets.length };
  }, []);

  // Nettoyage des couvertures : pour TOUS les albums ayant un ISBN, récupère une
  // couverture valide (BnF -> Google -> OpenLibrary) via /api/cover. onProgress(i,total,titre).
  const refreshCoversBnF = useCallback(async (onProgress) => {
    let targets = [];
    setBooks(bs => { targets = bs.filter(b => (b.isbn && String(b.isbn).replace(/[^0-9Xx]/g, "").length >= 10)); return bs; });
    let updated = 0;
    for (let i = 0; i < targets.length; i++) {
      const b = targets[i];
      if (onProgress) onProgress(i + 1, targets.length, b.titre || b.isbn);
      try {
        const cover = await API.fetchCover(b.isbn);
        if (cover && cover !== b.cover) {
          setBooks(bs => bs.map(x => x.id === b.id ? { ...x, cover, _coverOk: true } : x));
          await DB.updateBook(b.id, { cover, _coverOk: true });
          updated++;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 60));
    }
    return { updated, total: targets.length };
  }, []);

  return {
    books, refCatalog, seriesMeta, blacklist, loading,
    setBooks, // exposé pour cas particuliers
    addBook, addBooksBulk, editBook, removeBook,
    replaceCatalog, setSerieMeta,
    addBlSerie, addBlAlbum, removeBlSerie, removeBlAlbum,
    enrichCovers, refreshCoversBnF, cleanupJunk,
  };
}
