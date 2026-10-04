import React, { useState, useMemo, useRef } from "react";
import { uid, cleanIsbn, extractTome, findDuplicate } from "../lib/store.js";
import { searchCandidates } from "../lib/api.js";

// Mode Tinder plein écran : swipe pour trancher les "à confirmer"
export default function TinderMode({ books, refCatalog, onCommit, onAddMany, onClose }) {
  const queue = useMemo(() => books.filter(b => b.statut === "a-confirmer").map(b => b.id), [books]);
  const [drag, setDrag] = useState({ dx: 0, dy: 0, active: false });
  const [suggestFor, setSuggestFor] = useState(null); // book courant si panneau ouvert
  const startRef = useRef({ x: 0, y: 0 });
  const cardRef = useRef(null);

  const remaining = queue; // la queue se vide d'elle-même quand on tranche
  const currentId = queue[0];
  const current = books.find(b => b.id === currentId);

  function commit(act) {
    if (!current) return;
    onCommit(current.id, act);
    // la queue se recalcule (le livre quitte 'a-confirmer') : on reste à l'index 0
    setDrag({ dx: 0, dy: 0, active: false });
  }

  // gestion du drag (souris + tactile)
  function onDown(x, y) { startRef.current = { x, y }; setDrag({ dx: 0, dy: 0, active: true }); }
  function onMove(x, y) { if (!drag.active) return; setDrag({ dx: x - startRef.current.x, dy: y - startRef.current.y, active: true }); }
  function onUp() {
    if (!drag.active) return;
    const { dx, dy } = drag;
    if (dx > 90) commit("jai");
    else if (dx < -90) commit("retirer");
    else if (dy < -90) commit("veux");
    else if (dy > 90) openSuggest();
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) openSuggest(); // clic simple (pas de glissé) -> complétion
    else setDrag({ dx: 0, dy: 0, active: false });
  }

  function openSuggest() { setDrag({ dx: 0, dy: 0, active: false }); setSuggestFor(current); }

  if (!queue.length) return (
    <div className="tinder-overlay">
      <div className="tinder-top"><span className="tinder-counter" /><button className="modal-close" onClick={onClose}>✕</button></div>
      <div className="tinder-empty">
        <div className="tinder-empty-icon">🎉</div>
        <div className="tinder-empty-title">Tout est trié !</div>
        <div className="tinder-empty-sub">Aucune BD en attente de tri.<br />Scanne ou cherche des albums pour en ajouter à trancher.</div>
        <button className="btn btn-primary tinder-empty-btn" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );

  return (
    <div className="tinder-overlay">
      <div className="tinder-top"><span className="tinder-counter">{remaining.length} à trancher</span><button className="modal-close" onClick={onClose}>✕</button></div>
      <div className="tinder-stack" ref={cardRef}
        onMouseMove={e => onMove(e.clientX, e.clientY)} onMouseUp={onUp} onMouseLeave={onUp}>
        {!remaining.length ? <div className="tinder-done">🎉<br />Tout est trié !</div> :
          remaining.slice(0, 3).reverse().map((id, ridx) => {
            const b = books.find(x => x.id === id); if (!b) return null;
            const top = Math.min(remaining.length, 3) - 1;
            const isTop = ridx === top;
            const style = isTop
              ? { transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 18}deg)`, transition: drag.active ? "none" : "transform .3s ease" }
              : { transform: `scale(${1 - (top - ridx) * 0.04}) translateY(${(top - ridx) * -10}px)` };
            return (
              <div key={b.id} className={"tinder-card" + (isTop ? " top" : "")} style={style}
                onMouseDown={isTop ? (e => { e.preventDefault(); onDown(e.clientX, e.clientY); }) : undefined}
                onTouchStart={isTop ? (e => onDown(e.touches[0].clientX, e.touches[0].clientY)) : undefined}
                onTouchMove={isTop ? (e => { onMove(e.touches[0].clientX, e.touches[0].clientY); if (drag.active) e.preventDefault(); }) : undefined}
                onTouchEnd={isTop ? onUp : undefined}>
                <div className="tinder-cover"><CoverOrFallback book={b} /></div>
                <div className="tinder-info">
                  {b.serie && <div className="tinder-serie">{b.serie}{b.tome ? " · T." + b.tome : ""}</div>}
                  <div className="tinder-title">{b.titre}</div>
                  <div className="tinder-meta">{b.auteur}{b.annee ? " · " + b.annee : ""}</div>
                </div>
                {isTop && <>
                  <div className="tinder-hint tinder-hint-jai" style={{ opacity: drag.dx > 60 ? 1 : 0 }}>✅ J'AI</div>
                  <div className="tinder-hint tinder-hint-retirer" style={{ opacity: drag.dx < -60 ? 1 : 0 }}>🗑️ RETIRER</div>
                  <div className="tinder-hint tinder-hint-veux" style={{ opacity: (drag.dy < -60 && Math.abs(drag.dx) < 60) ? 1 : 0 }}>💜 JE VEUX</div>
                  <div className="tinder-hint-suggest" style={{ opacity: (drag.dy > 60 && Math.abs(drag.dx) < 60) ? 1 : 0 }}>🔍 IDENTIFIER</div>
                </>}
              </div>
            );
          })}
      </div>
      {remaining.length > 0 && (
        <div className="tinder-actions">
          <button className="tinder-btn tb-retirer" onClick={() => commit("retirer")} title="Retirer (←)">🗑️</button>
          <button className="tinder-btn tb-suggest" onClick={openSuggest} title="Identifier (↓)">🔍</button>
          <button className="tinder-btn tb-veux" onClick={() => commit("veux")} title="Je veux (↑)">💜</button>
          <button className="tinder-btn tb-jai" onClick={() => commit("jai")} title="J'ai (→)">✅</button>
        </div>
      )}
      <p className="tinder-legend">← Retirer · ↑ Je veux · ↓ Identifier · → J'ai</p>

      {suggestFor && (
        <SuggestPanel book={suggestFor} books={books} refCatalog={refCatalog}
          onClose={() => setSuggestFor(null)}
          onApply={(items) => {
            // remplace la fiche générique par les tomes choisis, à trancher
            onAddMany(suggestFor.id, items);
            setSuggestFor(null);
          }} />
      )}
    </div>
  );
}

// Affiche la couverture ou un placeholder "Image non trouvée" (clic => complétion via onUp parent)
function CoverOrFallback({ book }) {
  const [err, setErr] = React.useState(false);
  if (book.cover && !err) {
    return <img src={book.cover} alt="" draggable="false" onError={() => setErr(true)} />;
  }
  return (
    <div className="tinder-nocover">
      <span className="tinder-nocover-icon">🖼️</span>
      <span className="tinder-nocover-text">Image non trouvée</span>
      <span className="tinder-nocover-hint">Touchez la carte pour compléter</span>
    </div>
  );
}

// Panneau Identifier (multi-sélection) — chaque tome coché = une entrée distincte
function SuggestPanel({ book, books, refCatalog, onApply, onClose }) {
  const [q, setQ] = useState([book.serie || book.titre, book.auteur].filter(Boolean).join(" ").trim());
  const [results, setResults] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [status, setStatus] = useState("");

  React.useEffect(() => { run(); /* recherche initiale */ }, []); // eslint-disable-line

  async function run() {
    if (!q.trim()) return;
    setStatus("🔎 Recherche…"); setResults([]); setChecked(new Set());
    const cands = await searchCandidates(q.trim(), 12, refCatalog);
    setResults(cands);
    setStatus(cands.length ? "Coche les tomes que tu possèdes." : "Aucune correspondance.");
  }
  function toggle(i) { setChecked(c => { const n = new Set(c); n.has(i) ? n.delete(i) : n.add(i); return n; }); }
  function apply() {
    const items = [...checked].map((i, k) => {
      const c = results[i];
      return { id: uid(), createdAt: Date.now() - k, statut: "a-confirmer", note: 0, commentaire: "Ajouté via recherche (multi-sélection)",
        titre: c.titre + (c.sousTitre ? " — " + c.sousTitre : ""), serie: book.serie || "", tome: extractTome(c.titre + " " + (c.sousTitre || "")),
        auteur: c.auteur || "", editeur: c.editeur || "", annee: c.annee ? parseInt(c.annee) : "", isbn: c.isbn || "",
        cover: c.cover || (c.isbn ? "https://covers.openlibrary.org/b/isbn/" + cleanIsbn(c.isbn) + "-L.jpg" : ""), _coverOk: false };
    });
    onApply(items);
  }

  return (
    <div className="suggest-panel" style={{ display: "flex" }}>
      <div className="suggest-head"><div>Quel titre correspond à <b>{book.titre}</b> ?</div><button className="modal-close" onClick={onClose}>✕</button></div>
      <div className="suggest-search">
        <input type="text" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && run()} placeholder="Affiner (titre, série, auteur, ISBN…)" />
        <button className="btn btn-primary" onClick={run}>🔎 Rechercher</button>
      </div>
      <div className="suggest-hint">{status}</div>
      <div className="suggest-list">
        {results.map((c, i) => {
          const coverUrl = c.cover || (c.isbn ? "https://covers.openlibrary.org/b/isbn/" + cleanIsbn(c.isbn) + "-M.jpg" : "");
          return (
            <label className="suggest-item" key={i}>
              <input type="checkbox" className="suggest-check" checked={checked.has(i)} onChange={() => toggle(i)} />
              <div className="suggest-cover">{coverUrl ? <img src={coverUrl} alt="" loading="lazy" onError={e => e.target.style.display = "none"} /> : <div className="suggest-nocover">📕</div>}</div>
              <div className="suggest-info">
                <div className="suggest-title">{c.titre}{c.sousTitre ? " — " + c.sousTitre : ""}</div>
                {c.auteur && <div className="suggest-meta">{c.auteur}</div>}
                {c.editeur && <div className="suggest-ed">🏢 {c.editeur}</div>}
                <div className="suggest-meta-row">{c.annee && <span className="tag">{c.annee}</span>}{c.isbn && <span className="tag">ISBN {c.isbn}</span>}</div>
              </div>
            </label>
          );
        })}
      </div>
      <div className="suggest-bar">
        {checked.size === 0 ? <span className="suggest-bar-info">Coche les tomes que tu possèdes…</span> :
          <><span className="suggest-bar-info"><b>{checked.size}</b> tome(s) coché(s)</span><button className="btn btn-primary" onClick={apply}>✓ Ajouter les {checked.size} tome(s)</button></>}
      </div>
    </div>
  );
}
