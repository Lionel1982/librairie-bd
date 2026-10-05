import React, { useMemo, useState, useEffect } from "react";
import QuickSerieModal from "./QuickSerieModal.jsx";
import Cover from "./Cover.jsx";
import { OWNED, normTitle, isSerieBlacklisted, isAlbumBlacklisted } from "../lib/store.js";
import { wikipediaSeriesTomes } from "../lib/api.js";

export default function SeriesView({ books, seriesMeta, setSeriesMeta, onSetSerieMeta, query, blacklist, onOpen, onEditBook }) {
  const [busy, setBusy] = useState("");
  const [moveFor, setMoveFor] = useState(null);       // album dont on change la série
  const [showIndex, setShowIndex] = useState(false);  // index alphabétique visible (au scroll)
  useEffect(() => {
    const onScroll = () => setShowIndex(window.scrollY > 250);
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const groups = useMemo(() => {
    const g = {};
    books.forEach(b => { const k = (b.serie || "").trim() || "— Hors série —"; (g[k] = g[k] || []).push(b); });
    return g;
  }, [books]);
  const q = (query || "").trim().toLowerCase();
  const names = Object.keys(groups).filter(n => (!q || n.toLowerCase().includes(q)) && !(blacklist && isSerieBlacklisted(blacklist, n))).sort((a, b) => a.localeCompare(b));

  function applyMeta(name, res) {
    const key = normTitle(name);
    const meta = { total: res.total || "", source: res.source, checkedAt: new Date().toISOString() };
    if (onSetSerieMeta) onSetSerieMeta(key, meta);
    else setSeriesMeta(m => ({ ...m, [key]: { ...(m[key] || {}), ...meta } }));
  }
  async function verifyOne(name) {
    setBusy(name);
    const res = await wikipediaSeriesTomes(name);
    applyMeta(name, res);
    setBusy("");
  }
  async function verifyAll() {
    for (const name of names) {
      if (seriesMeta[normTitle(name)]?.total) continue;
      setBusy(name);
      try { const res = await wikipediaSeriesTomes(name); applyMeta(name, res); } catch {}
      await new Promise(r => setTimeout(r, 400));
    }
    setBusy("");
  }

  // lettre d'index d'une série (chiffres -> #) ; seules les lettres présentes sont affichées
  const letterOf = (n) => { const c = normTitle(n).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : "#"; };
  const letters = [];
  const firstOfLetter = {};
  names.forEach(n => { const L = letterOf(n); if (!(L in firstOfLetter)) { firstOfLetter[L] = n; letters.push(L); } });
  function jump(L) { const el = document.getElementById("serie-letter-" + L); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }

  if (!names.length) return <p style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-dim)", padding: 40 }}>Aucune série.</p>;

  return (
    <>
      <div className="series-toolbar" style={{ gridColumn: "1/-1" }}>
        <button className="btn btn-ghost" onClick={verifyAll}>📖 Vérifier les tomes (Wikipédia)</button>
        {busy && <span style={{ color: "var(--text-dim)", fontSize: 13 }}>⏳ {busy}…</span>}
      </div>
      <div className="series-wrap" style={{ gridColumn: "1/-1" }}>
        {names.map(name => {
          const items = groups[name].slice().sort((a, b) => (a.tome || 0) - (b.tome || 0));
          const tomes = items.map(x => x.tome).filter(t => t !== "" && t != null).map(Number);
          const owned = items.filter(x => OWNED.includes(x.statut)).length;
          const total = seriesMeta[normTitle(name)]?.total || "";
          const upTo = total ? Number(total) : (tomes.length ? Math.max(...tomes) : 0);
          const present = new Set(tomes); let gaps = [];
          for (let t = 1; t <= upTo; t++) if (!present.has(t)) gaps.push(t);
          if (blacklist) gaps = gaps.filter(t => !isAlbumBlacklisted(blacklist, { serie: name, tome: t, titre: name + " T." + t }));
          let badge;
          if (total) badge = gaps.length ? <span className="stat-chip gap">{owned}/{total} · manque T.{gaps.join(", T.")}</span> : <span className="stat-chip ok">Complète ✓ ({total})</span>;
          else badge = gaps.length ? <span className="stat-chip gap">Manque T.{gaps.join(", T.")}</span> : <span className="stat-chip warn">{owned} · total ?</span>;
          return (
            <div className="series-card" key={name} id={firstOfLetter[letterOf(name)] === name ? "serie-letter-" + letterOf(name) : undefined}>
              <div className="series-head"><h3>{name}</h3>
                <div className="series-badges">
                  <span className="stat-chip"><b>{items.length}</b> album(s)</span>
                  {owned > 0 && <span className="stat-chip">💚 {owned}</span>}
                  {badge}
                  <button className="chip-btn" title="Vérifier via Wikipédia" onClick={() => verifyOne(name)}>📖</button>
                </div>
              </div>
              <div className="series-covers">
                {items.map(b => <div className="series-cover" key={b.id} title={b.titre} onClick={() => (onEditBook ? setMoveFor(b) : onOpen(b.id))}><Cover src={b.cover} title={b.titre} isbn={b.isbn} />{b.tome ? <span className="series-tome">T.{b.tome}</span> : null}</div>)}
              </div>
            </div>
          );
        })}
            </div>
      {showIndex && letters.length > 1 && (
        <nav className="alpha-index" aria-label="Aller à la lettre">
          {letters.map(L => <button key={L} onClick={() => jump(L)}>{L}</button>)}
        </nav>
      )}
      {moveFor && (
        <QuickSerieModal book={moveFor} books={books}
          onSave={(id, patch) => { onEditBook(id, patch); setMoveFor(null); }}
          onOpenFull={(id) => { setMoveFor(null); onOpen(id); }}
          onClose={() => setMoveFor(null)} />
      )}
    </>
  );
}
