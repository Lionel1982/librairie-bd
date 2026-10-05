// Hook central : charge les données depuis Supabase et expose des actions async.
// Modèle optimiste : on met à jour l'état local immédiatement, puis on persiste.
import { useState, useEffect, useCallback, useRef } from "react";
import * as DB from "./db.js";
import * as S from "./store.js";
import * as API from "./api.js";

export function useLibrary(userId) {
  const [books, setBooks] = useState([]);
  const [refCatalog, setRefCatalog] = useState([]);
  const [seriesMeta, setSeriesMeta] = useState({});
  const [blacklist, setBlacklist] = useState({ series: [], albums: [] });
  const [loading, setLoading] = useState(true);
  const booksRef = useRef([]);                       // dernière liste connue (lecture fiable hors rendu)
  useEffect(() => { booksRef.current = books; }, [books]);

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
    let backup = null;
    setBooks(bs => bs.map(b => { if (b.id === id) { backup = b; return { ...b, ...patch }; } return b; })); // optimiste
    try {
      const saved = await DB.updateBook(id, patch);
      if (saved) setBooks(bs => bs.map(b => b.id === id ? saved : b)); // aligne sur la base
      return saved;
    } catch (e) {
      if (backup) setBooks(bs => bs.map(b => b.id === id ? backup : b)); // restaure : l'écran = la base
      throw e;
    }
  }, []);

  const removeBook = useCallback(async (id) => {
    let backup = null;
    setBooks(bs => { backup = bs.find(b => b.id === id); return bs.filter(b => b.id !== id); }); // optimiste
    try {
      await DB.deleteBook(id);
    } catch (e) {
      // échec en base : on restaure la carte (sinon elle revient "mystérieusement" au refresh)
      if (backup) setBooks(bs => [backup, ...bs]);
      throw e;
    }
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
    targets = booksRef.current.filter(b => (!idSet || idSet.has(b.id)) && (b.titre || b.isbn) && (!b.cover || !b._coverOk));
    for (const b of targets) {
      let patch = null;
      if (b.cover && await API.validateImage(b.cover)) patch = { _coverOk: true };
      else if (b.isbn) {
        let c = "";
        try { c = await API.fetchCover(b.isbn); } catch {}                    // BnF -> Google -> OpenLibrary (serveur)
        if (!c) { try { c = await API.resolveCover(S.cleanIsbn(b.isbn), ""); } catch {} }
        if (c) patch = { cover: c, _coverOk: true };
      }
      if (patch) {
        setBooks(bs => bs.map(x => x.id === b.id ? { ...x, ...patch } : x));
        try { await DB.updateBook(b.id, patch); } catch (e) { console.warn("enrichCovers update", e); }
      }
      await new Promise(r => setTimeout(r, 120));
    }
  }, []);

  // Supprime les entrées parasites (lignes d'exemple/template importées par erreur :
  // "Serie — T.TypeObjet — Descriptif", "Revue — T.Num — Titre", "Largeur / Profondeur"...).
  const cleanupJunk = useCallback(async () => {
    // D'abord : re-fetch frais depuis Supabase (évite d'agir sur un cache local périmé).
    let fresh = [];
    try { fresh = await DB.fetchBooks(); setBooks(fresh); }
    catch { setBooks(bs => { fresh = bs; return bs; }); }
    // Règle : supprime une entrée si elle n'a NI titre réel NI ISBN (déchet inexploitable).
    let targets = fresh.filter(b => {
      const titre = (b.titre || "").trim();
      const titreReel = titre && !/^ISBN\s/i.test(titre);
      const isbnClean = String(b.isbn || "").replace(/[^0-9Xx]/g, "");
      const hasIsbn = isbnClean.length >= 10;
      return !titreReel && !hasIsbn;
    });
    // (targets déjà calculé ci-dessus)

    let removed = 0, failed = 0, lastErr = "";
    for (const b of targets) {
      setBooks(bs => bs.filter(x => x.id !== b.id));
      try { await DB.deleteBook(b.id); removed++; }
      catch (e) { failed++; lastErr = e?.message || ""; setBooks(bs => [b, ...bs]); } // restaure si échec
    }
    return { removed, failed, lastErr };
  }, []);

  // Nettoyage des couvertures : pour TOUS les albums ayant un ISBN, récupère une
  // couverture valide (BnF -> Google -> OpenLibrary) via /api/cover. onProgress(i,total,titre).
  const refreshCoversBnF = useCallback(async (onProgress) => {
    let targets = [];
    targets = booksRef.current.filter(b => (b.isbn && String(b.isbn).replace(/[^0-9Xx]/g, "").length >= 10));
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

  // Récupère nombre de pages + format (bd/manga) via /api/isbn pour l'étagère. onProgress(i,total,titre)
  const fetchPagesFormat = useCallback(async (onProgress) => {
    const targets = booksRef.current.filter(b => S.cleanIsbn(b.isbn).length >= 10 && (b.pages === "" || b.pages == null || !b.format));
    let updated = 0;
    for (let i = 0; i < targets.length; i++) {
      const b = targets[i];
      if (onProgress) onProgress(i + 1, targets.length, b.titre || b.isbn);
      const r = await API.lookupByISBNRemote(b.isbn);
      const patch = {};
      if (r && r.pages && (b.pages === "" || b.pages == null)) patch.pages = Number(r.pages);
      if (r && r.format && !b.format) patch.format = r.format;
      if (Object.keys(patch).length) {
        await DB.updateBook(b.id, patch);           // lève une erreur si le SQL v3.17 manque -> on s'arrête
        setBooks(bs => bs.map(x => x.id === b.id ? { ...x, ...patch } : x));
        updated++;
      }
      await new Promise(res => setTimeout(res, 80));
    }
    return { updated, total: targets.length };
  }, []);

  return {
    books, refCatalog, seriesMeta, blacklist, loading,
    setBooks, // exposé pour cas particuliers
    addBook, addBooksBulk, editBook, removeBook,
    replaceCatalog, setSerieMeta,
    addBlSerie, addBlAlbum, removeBlSerie, removeBlAlbum,
    enrichCovers, refreshCoversBnF, cleanupJunk, fetchPagesFormat,
  };
}
