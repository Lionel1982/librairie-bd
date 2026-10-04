import React, { useState, useMemo, useEffect, useRef } from "react";
import * as S from "./lib/store.js";
import * as API from "./lib/api.js";
import { useSession } from "./lib/useSession.js";
import { useLibrary } from "./lib/useLibrary.js";
import { supabase } from "./lib/supabaseClient.js";
import AuthScreen from "./components/AuthScreen.jsx";
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

const APP_VERSION = "3.4.0-supabase";

export default function App() {
  const { session, user, loading: authLoading } = useSession();

  if (authLoading) return <div className="app-loading">⏳ Chargement…</div>;
  if (!session) return <AuthScreen />;
  return <LibraryApp key={user.id} user={user} />;
}

function LibraryApp({ user }) {
  const lib = useLibrary(user.id);
  const { books, refCatalog, seriesMeta, blacklist, loading } = lib;

  const [viewMode, setViewMode] = useState("biblio");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(undefined); // undefined=closed, null=new, id=edit
  const [findOpen, setFindOpen] = useState(false);
  const [tinderOpen, setTinderOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const notify = (m) => setToast(m);
  const pending = useMemo(() => books.filter(b => b.statut === "a-confirmer").length, [books]);

  // Déclenchement auto de l'assistant de complétion au 1er lancement du mois (par utilisateur)
  useEffect(() => {
    if (loading || !books.length) return;
    const key = "bd-library-last-plan-month-" + user.id;
    const now = new Date();
    const tag = now.getFullYear() + "-" + (now.getMonth() + 1);
    if (localStorage.getItem(key) !== tag) {
      localStorage.setItem(key, tag);
      const t = setTimeout(() => setPlanOpen(true), 900);
      return () => clearTimeout(t);
    }
  }, [loading]); // eslint-disable-line

  // ---------- actions ----------
  async function addScannedMany(list) {
    const toAdd = list.filter(nb => !S.findDuplicate(books, nb));
    const skipped = list.length - toAdd.length;
    try {
      const saved = toAdd.length ? await lib.addBooksBulk(toAdd) : [];
      let msg = "📷 " + saved.length + " album(s) scanné(s) ajouté(s)";
      if (skipped) msg += " · " + skipped + " doublon(s) ignoré(s)";
      notify(msg);
    } catch (err) {
      notify("❌ Ajout scan : " + (err?.message || "erreur"));
    }
    setScanOpen(false);
  }
  async function upsertBook(data, id) {
    if (id) { await lib.editBook(id, data); }
    else {
      const saved = await lib.addBook(data);
      if (saved) setTimeout(() => lib.enrichCovers([saved.id]), 100);
    }
  }
  async function deleteBook(id) { await lib.removeBook(id); notify("🗑️ Supprimée"); }
  async function tinderCommit(id, act) {
    if (act === "retirer") { await lib.removeBook(id); return; }
    await lib.editBook(id, { statut: act });
  }
  function blSerie(name) { lib.addBlSerie(name); notify("⛔ Série ignorée : " + name); }
  function blAlbum(a) { lib.addBlAlbum(a); notify("⛔ Album ignoré"); }
  function unblSerie(key) { lib.removeBlSerie(key); notify("✅ Série réautorisée"); }
  function unblAlbum(key) { lib.removeBlAlbum(key); notify("✅ Album réautorisé"); }

  async function addGapWish(r, tome) {
    const cand = { titre: r.name + " — T." + tome, serie: r.name, tome, statut: "veux", note: 0,
      commentaire: "Tome manquant (vue À compléter)", auteur: r.auteur || "", editeur: r.editeur || "", annee: "", isbn: "", cover: "" };
    if (S.findDuplicate(books, cand)) { notify("Déjà dans ta liste"); return; }
    const saved = await lib.addBook(cand);
    notify("💜 " + r.name + " T." + tome + " ajouté");
    if (saved) setTimeout(() => lib.enrichCovers([saved.id]), 100);
  }

  async function tinderAddMany(origId, items) {
    const toAdd = items.filter(nb => !S.findDuplicate(books, nb));
    await lib.removeBook(origId);                     // retire la fiche générique
    const saved = await lib.addBooksBulk(toAdd);
    notify("✅ " + saved.length + " tome(s) ajouté(s) à trier");
    if (saved.length) setTimeout(() => lib.enrichCovers(saved.map(s => s.id)), 100);
  }

  function onFindAdd(items) {
    (async () => {
      const toAdd = items.filter(nb => !S.findDuplicate(books, nb));
      const saved = await lib.addBooksBulk(toAdd);
      notify("✅ " + saved.length + " ajouté(s)");
      if (saved.length) setTimeout(() => lib.enrichCovers(saved.map(s => s.id)), 100);
    })();
    setFindOpen(false);
  }

  function importBdgest(file) {
    const reader = new FileReader();
    reader.onload = async () => {
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
        newBooks.push({ statut, titre, serie, tome: tomeNum, auteur, editeur: get(r,"Editeur"), annee: yearOf(get(r,"DL")), isbn, note: note5(get(r,"Note")), commentaire: get(r,"PrixAchat")?("Acheté "+get(r,"PrixAchat")+"€"):"", cover, _coverOk: false });
      }
      notify("⏳ Analyse CSV : " + newBooks.length + " ligne(s) détectée(s)…");
      // dédoublonnage vs existant
      const existing = books.slice();
      const toAdd = [];
      newBooks.forEach(nb => { if (!S.findDuplicate(existing, nb) && !S.findDuplicate(toAdd, nb)) toAdd.push(nb); });
      if (!toAdd.length) { notify("⚠️ 0 album à importer (CSV vide ou colonnes non reconnues)"); return; }
      try {
        const saved = await lib.addBooksBulk(toAdd);
        notify("📚 " + saved.length + " album(s) importé(s)");
        // fusion catalogue de référence
        const merged = refCatalog.slice();
        const keyf = c => c.isbn ? S.cleanIsbn(c.isbn) : S.normTitle((c.serie||"")+"|"+(c.titre||""))+"|"+(c.tome||"");
        const seen = new Set(merged.map(keyf));
        catalog.forEach(c => { const k = keyf(c); if (!seen.has(k)) { seen.add(k); merged.push(c); } });
        await lib.replaceCatalog(merged);
      } catch (err) {
        console.error("Import échec", err);
        notify("❌ Import : " + (err?.message || "erreur inconnue") + (err?._hint ? " — " + err._hint : ""));
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(books, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ma-bibliotheque-bd.json"; a.click();
  }

  async function migrateFromLocalStorage() {
    try {
      const raw = JSON.parse(localStorage.getItem("bd-library-v1") || "[]");
      if (!raw.length) { notify("Aucune donnée locale à migrer."); return; }
      const toAdd = raw.filter(nb => !S.findDuplicate(books, nb));
      const saved = await lib.addBooksBulk(toAdd);
      notify("⬆️ " + saved.length + " album(s) migré(s) vers le cloud");
    } catch { notify("⚠️ Migration impossible"); }
  }

  async function logout() { await supabase.auth.signOut(); }

  const tabs = [
    ["biblio", "📚 Bibliothèque"], ["series", "🗂️ Séries"], ["etagere", "📖 Étagère"],
    ["trous", "🧩 À compléter"], ["wishlist", "💜 Wishlist"], ["stats", "📊 Stats"],
  ];

  if (loading) return <div className="app-loading">⏳ Chargement de ta collection…</div>;

  return (
    <div id="app" className={scrolled ? "app-scrolled" : ""}>
      <input ref={fileInputRef} type="file" accept=".csv" hidden
        onChange={e => { const f = e.target.files[0]; if (f) importBdgest(f); e.target.value = ""; }} />
      <header className="app-header">
        <div className="header-left">
          <h1 className="logo">📚 Ma Bibliothèque BD</h1>
          <span className="app-version">v{APP_VERSION}</span>
        </div>
        <div className="header-actions">
          <Menu align="left" trigger={<>☰</>} buttonClass="btn btn-ghost btn-burger" className="burger-menu">
            {(close) => (<>
              <div className="hdr-menu-user">{user.email}</div>
              <div className="hdr-menu-sep" />
              <button className="hdr-menu-item" onClick={() => { close(); setTimeout(() => fileInputRef.current && fileInputRef.current.click(), 50); }}>📚 Importer BDGest</button>
              <button className="hdr-menu-item" onClick={() => { exportJson(); close(); }}>⬇️ Exporter (JSON)</button>
              <button className="hdr-menu-item" onClick={() => { migrateFromLocalStorage(); close(); }}>⬆️ Migrer mes données locales</button>
              <div className="hdr-menu-sep" />
              <button className="hdr-menu-item" onClick={() => { setSettingsOpen(true); close(); }}>⚙️ Paramètres (liste noire)</button>
              <div className="hdr-menu-sep" />
              <button className="hdr-menu-item" onClick={() => { logout(); close(); }}>🚪 Se déconnecter</button>
            </>)}
          </Menu>
        </div>
      </header>

      <div className="action-bar">
        <button className="action-tile action-primary" onClick={() => setFindOpen(true)}>
          <span className="action-icon">🔎</span>
          <span className="action-label">Chercher<br />un album</span>
        </button>
        <button className={"action-tile" + (pending ? " action-pending" : "")} onClick={() => setTinderOpen(true)}>
          <span className="action-icon">🔥</span>
          <span className="action-label">Trier{pending ? <><br /><b>{pending}</b></> : ""}</span>
        </button>
        <button className="action-tile" onClick={() => setPlanOpen(true)}>
          <span className="action-icon">🎯</span>
          <span className="action-label">Compléter</span>
        </button>
      </div>

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
        {viewMode === "series" && <SeriesView books={books.filter(S.inLibrary)} seriesMeta={seriesMeta} onSetSerieMeta={(key, meta) => lib.setSerieMeta(key, meta)} query={query} blacklist={blacklist} onOpen={setEditingId} />}
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
          onAdd={onFindAdd} onScan={() => setScanOpen(true)}
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
        <Scanner onAddMany={addScannedMany} refCatalog={refCatalog} onClose={() => setScanOpen(false)} />
      )}
      {settingsOpen && (
        <SettingsModal blacklist={blacklist}
          onUnblacklistSerie={unblSerie} onUnblacklistAlbum={unblAlbum}
          onRefreshCovers={lib.refreshCoversBnF}
          onCleanupJunk={lib.cleanupJunk}
          onClose={() => setSettingsOpen(false)} />
      )}
      <Toast message={toast} onDone={() => setToast("")} />
    </div>
  );
}
