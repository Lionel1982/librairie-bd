import React, { useState, useEffect, useMemo, useCallback } from "react";
import * as S from "./lib/store.js";
import * as API from "./lib/api.js";
import LibraryGrid from "./components/LibraryGrid.jsx";
import SeriesView from "./components/SeriesView.jsx";
import StatsView from "./components/StatsView.jsx";
import BookModal from "./components/BookModal.jsx";
import FindModal from "./components/FindModal.jsx";
import TinderMode from "./components/TinderMode.jsx";
import ShelfView from "./components/ShelfView.jsx";
import GapsView from "./components/GapsView.jsx";
import MonthlyPlan from "./components/MonthlyPlan.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import Scanner from "./components/Scanner.jsx";
import Menu from "./components/Menu.jsx";
import Toast from "./components/Toast.jsx";

const APP_VERSION = "2.3.1-react";

export default function App() {
  const [books, setBooks] = useState(() => S.loadBooks());
  const [refCatalog, setRefCatalog] = useState(() => S.loadRefCatalog());
  const [seriesMeta, setSeriesMeta] = useState(() => S.loadSeriesMeta());
  const [blacklist, setBlacklist] = useState(() => S.loadBlacklist());
  const [viewMode, setViewMode] = useState("biblio");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(undefined); // undefined=closed, null=new, id=edit
  const [findOpen, setFindOpen] = useState(false);
  const [tinderOpen, setTinderOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [toast, setToast] = useState("");

  // Déclenchement auto de l'assistant de complétion au 1er lancement du mois
  useEffect(() => {
    const key = "bd-library-last-plan-month-v1";
    const now = new Date();
    const tag = now.getFullYear() + "-" + (now.getMonth() + 1);
    const last = localStorage.getItem(key);
    if (last !== tag && books.length > 0) {
      localStorage.setItem(key, tag);
      const t = setTimeout(() => setPlanOpen(true), 900);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line

  useEffect(() => { S.saveBooks(books); }, [books]);
  useEffect(() => { S.saveRefCatalog(refCatalog); }, [refCatalog]);
  useEffect(() => { S.saveSeriesMeta(seriesMeta); }, [seriesMeta]);
  useEffect(() => { S.saveBlacklist(blacklist); }, [blacklist]);

  const notify = useCallback((m) => { setToast(m); }, []);

  const pending = useMemo(() => books.filter(b => b.statut === "a-confirmer").length, [books]);

  // enrichit les couvertures manquantes (ciblé)
  const enrich = useCallback(async (ids) => {
    const idSet = ids && ids.length ? new Set(ids) : null;
    const targets = books.filter(b => (!idSet || idSet.has(b.id)) && b.titre && (!b.cover || !b._coverOk));
    if (!targets.length) return;
    for (const b of targets) {
      let cover = b.cover;
      if (cover && await API.validateImage(cover)) { b._coverOk = true; }
      else if (b.isbn) { const c = await API.resolveCover(S.cleanIsbn(b.isbn), ""); if (c) { b.cover = c; b._coverOk = true; } }
      else {
        try { const info = await API.lookupByISBN(b.isbn || ""); } catch {}
      }
      await new Promise(r => setTimeout(r, 120));
    }
    setBooks(bs => [...bs]);
  }, [books]);

  function addScanned(book) {
    setBooks(bs => {
      if (S.findDuplicate(bs, book)) { notify("Déjà présent : " + (book.titre || book.isbn)); return bs; }
      return [...bs, book];
    });
  }
  function upsertBook(data, id) {
    setBooks(bs => {
      if (id) return bs.map(b => b.id === id ? { ...b, ...data } : b);
      return [...bs, { id: S.uid(), createdAt: Date.now(), ...data }];
    });
  }
  function deleteBook(id) { setBooks(bs => bs.filter(b => b.id !== id)); notify("🗑️ Supprimée"); }
  function tinderCommit(id, act) {
    if (act === "retirer") { setBooks(bs => bs.filter(b => b.id !== id)); return; }
    setBooks(bs => bs.map(b => b.id === id ? { ...b, statut: act } : b));
  }
  function blSerie(name) { setBlacklist(bl => S.blacklistSerie(bl, name)); notify("⛔ Série ignorée : " + name); }
  function blAlbum(a) { setBlacklist(bl => S.blacklistAlbum(bl, a)); notify("⛔ Album ignoré"); }
  function unblSerie(key) { setBlacklist(bl => S.unblacklistSerie(bl, key)); notify("✅ Série réautorisée"); }
  function unblAlbum(key) { setBlacklist(bl => S.unblacklistAlbum(bl, key)); notify("✅ Album réautorisé"); }
  function addGapWish(r, tome) {
    const cand = { titre: r.name + " — T." + tome, serie: r.name, tome, statut: "veux", note: 0,
      commentaire: "Tome manquant (vue À compléter)", auteur: r.auteur || "", editeur: r.editeur || "", annee: "", isbn: "", cover: "" };
    setBooks(bs => { if (S.findDuplicate(bs, cand)) { notify("Déjà dans ta liste"); return bs; } const nb = { id: S.uid(), createdAt: Date.now(), ...cand }; notify("💜 " + r.name + " T." + tome + " ajouté"); setTimeout(() => enrich([nb.id]), 100); return [...bs, nb]; });
  }
  function tinderAddMany(origId, items) {
    setBooks(bs => {
      const ex = bs.filter(b => b.id !== origId);   // retire la fiche générique
      let add = 0; const ids = [];
      items.forEach(nb => { if (!S.findDuplicate(ex, nb)) { ex.push(nb); ids.push(nb.id); add++; } });
      notify("✅ " + add + " tome(s) ajouté(s) à trier");
      setTimeout(() => enrich(ids), 100);
      return ex;
    });
  }
  function setStatus(id, statut) {
    if (statut === "retirer") { deleteBook(id); return; }
    setBooks(bs => bs.map(b => b.id === id ? { ...b, statut } : b));
  }

  function importBdgest(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = API.parseCSV(reader.result, ";");
      if (rows.length < 2) { notify("⚠️ CSV vide"); return; }
      const header = rows[0].map(h => h.trim()); const col = {}; header.forEach((h, i) => col[h] = i);
      const get = (r, n) => (col[n] != null ? (r[col[n]] || "").trim() : "");
      const yearOf = (s) => { const m = String(s || "").match(/(\d{4})/); return m ? parseInt(m[1]) : ""; };
      const note5 = (s) => { s = String(s||"").replace(",",".").trim(); const v=parseFloat(s); if(isNaN(v))return 0; if(v>10)return Math.round(v/4); if(v>5)return Math.round(v/2); return Math.round(v); };
      const newBooks = [], catalog = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || r.length < 3) continue;
        const serie = get(r,"Serie"), num = get(r,"Num"), t = get(r,"Titre").replace(/^[«»\s]+|[«»\s]+$/g,"");
        if (!serie && !t) continue;
        const titre = (serie&&num&&t)?(serie+" — T."+num+" — "+t):(serie&&t)?(serie+" — "+t):(t||serie);
        const isbn = S.cleanIsbn(get(r,"ISBN"));
        const statut = get(r,"Wishlist")==="1"?"veux":(get(r,"Lu")==="1"?"lu":"jai");
        const auteur = [get(r,"Scenariste"),get(r,"Dessinateur")].filter(Boolean).filter((v,k,a)=>a.indexOf(v)===k).join(" / ");
        const tomeNum = /^\d+$/.test(num)?parseInt(num):"";
        const cover = isbn?("https://covers.openlibrary.org/b/isbn/"+isbn+"-L.jpg"):"";
        catalog.push({ titre: t||titre, serie, tome: tomeNum, auteur, editeur: get(r,"Editeur"), annee: yearOf(get(r,"DL"))+"", isbn, cover });
        newBooks.push({ id: S.uid(), createdAt: Date.now()-i, statut, titre, serie, tome: tomeNum, auteur, editeur: get(r,"Editeur"), annee: yearOf(get(r,"DL")), isbn, note: note5(get(r,"Note")), commentaire: get(r,"PrixAchat")?("Acheté "+get(r,"PrixAchat")+"€"):"", cover, _coverOk: false });
      }
      setBooks(bs => { const ex = bs.slice(); let add=0; newBooks.forEach(nb => { if(!S.findDuplicate(ex, nb)){ ex.push(nb); add++; } }); notify("📚 "+add+" album(s) importé(s)"); return ex; });
      setRefCatalog(rc => { const merged = rc.slice(); const key=c=>c.isbn?S.cleanIsbn(c.isbn):S.normTitle((c.serie||"")+"|"+(c.titre||""))+"|"+(c.tome||""); const seen=new Set(merged.map(key)); catalog.forEach(c=>{const k=key(c); if(!seen.has(k)){seen.add(k);merged.push(c);}}); return merged; });
    };
    reader.readAsText(file, "UTF-8");
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(books, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ma-bibliotheque-bd.json"; a.click();
  }

  const tabs = [
    ["biblio", "📚 Bibliothèque"], ["series", "🗂️ Séries"], ["etagere", "📖 Étagère"],
    ["trous", "🧩 À compléter"], ["wishlist", "💜 Wishlist"], ["stats", "📊 Stats"],
  ];

  return (
    <div id="app">
      <header className="app-header">
        <div className="header-left">
          <h1 className="logo">📚 Ma Bibliothèque BD</h1>
          <span className="app-version">v{APP_VERSION}</span>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={() => setFindOpen(true)}>🔎 Chercher un album</button>
          <button className={"btn btn-ghost" + (pending ? " has-pending" : "")} onClick={() => setTinderOpen(true)}>🔥 Trier{pending ? " (" + pending + ")" : ""}</button>
          <button className="btn btn-ghost" onClick={() => setPlanOpen(true)}>🎯 Compléter</button>

          <Menu align="right" trigger={<>⚙️</>} buttonClass="btn btn-ghost" className="gear-menu">
            {(close) => (<>
              <label className="hdr-menu-item" onClick={() => setTimeout(close, 0)}>📚 Importer BDGest<input type="file" accept=".csv" hidden onChange={e => { if (e.target.files[0]) importBdgest(e.target.files[0]); close(); }} /></label>
              <button className="hdr-menu-item" onClick={() => { exportJson(); close(); }}>⬇️ Exporter (JSON)</button>
              <div className="hdr-menu-sep" />
              <button className="hdr-menu-item" onClick={() => { setSettingsOpen(true); close(); }}>⚙️ Paramètres (liste noire)</button>
            </>)}
          </Menu>

          <Menu align="right" trigger={<>➕ Ajouter</>} buttonClass="btn btn-primary" className="add-menu">
            {(close) => (<>
              <button className="hdr-menu-item" onClick={() => { setEditingId(null); close(); }}>✏️ Ajouter manuellement</button>
              <button className="hdr-menu-item" onClick={() => { setScanOpen(true); close(); }}>📷 Scanner un code-barre</button>
            </>)}
          </Menu>
        </div>
      </header>

      <div className="mode-tabs">
        {tabs.map(([m, label]) => (
          <button key={m} className={"mode-tab" + (viewMode === m ? " active" : "")} onClick={() => setViewMode(m)}>{label}</button>
        ))}
      </div>

      <div className="toolbar">
        <div className="search-wrap"><span className="search-icon">🔍</span>
          <input type="text" placeholder="Filtrer ma bibliothèque..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>

      <main className="library">
        {viewMode === "biblio" && <LibraryGrid books={books.filter(b => b.statut === "lu" || b.statut === "jai")} query={query} onOpen={setEditingId} />}
        {viewMode === "wishlist" && <LibraryGrid books={books.filter(b => b.statut === "veux")} query={query} onOpen={setEditingId} wishlist />}
        {viewMode === "series" && <SeriesView books={books.filter(S.inLibrary)} seriesMeta={seriesMeta} setSeriesMeta={setSeriesMeta} query={query} blacklist={blacklist} onOpen={setEditingId} />}
        {viewMode === "etagere" && <ShelfView books={books.filter(S.inLibrary)} query={query} onOpen={setEditingId} />}
        {viewMode === "trous" && <GapsView books={books.filter(S.inLibrary)} seriesMeta={seriesMeta} query={query} blacklist={blacklist} onAddWish={addGapWish} onBlacklistSerie={blSerie} onBlacklistAlbum={blAlbum} />}
        {viewMode === "stats" && <StatsView books={books.filter(S.inLibrary)} seriesMeta={seriesMeta} />}
      </main>

      {editingId !== undefined && (
        <BookModal id={editingId} books={books} refCatalog={refCatalog}
          onSave={(data, id) => { upsertBook(data, id); setEditingId(undefined); notify("✅ Enregistré"); }}
          onDelete={(id) => { deleteBook(id); setEditingId(undefined); }}
          onClose={() => setEditingId(undefined)} />
      )}
      {findOpen && (
        <FindModal books={books} refCatalog={refCatalog}
          onAdd={(items) => { setBooks(bs => { const ex = bs.slice(); let add=0; const ids=[]; items.forEach(nb=>{ if(!S.findDuplicate(ex,nb)){ex.push(nb);ids.push(nb.id);add++;} }); notify("✅ "+add+" ajouté(s)"); setTimeout(()=>enrich(ids), 100); return ex; }); setFindOpen(false); }}
          onClose={() => setFindOpen(false)} />
      )}
      {tinderOpen && (
        <TinderMode books={books} refCatalog={refCatalog}
          onCommit={tinderCommit} onAddMany={tinderAddMany}
          onClose={() => setTinderOpen(false)} />
      )}
      {planOpen && (
        <MonthlyPlan books={books.filter(S.inLibrary)} seriesMeta={seriesMeta} blacklist={blacklist}
          onAddWish={addGapWish} onBlacklistSerie={blSerie} onBlacklistAlbum={blAlbum} onClose={() => setPlanOpen(false)} />
      )}
      {scanOpen && (
        <Scanner onAdd={addScanned} onClose={() => setScanOpen(false)} />
      )}
      {settingsOpen && (
        <SettingsModal blacklist={blacklist}
          onUnblacklistSerie={unblSerie} onUnblacklistAlbum={unblAlbum}
          onClose={() => setSettingsOpen(false)} />
      )}
      <Toast message={toast} onDone={() => setToast("")} />
    </div>
  );
}
