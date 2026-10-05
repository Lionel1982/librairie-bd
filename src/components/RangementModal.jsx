import React, { useState } from "react";
import { useBackClose } from "../lib/backButton.js";
import { SUGG_TYPES } from "../lib/suggest.js";

// Assistant de rangement : liste les propositions, par type, avec ✓ Appliquer / ✕ Ignorer.
export default function RangementModal({ suggestions, onApply, onIgnore, onClose }) {
  useBackClose(true, onClose);   // bouton « précédent » = fermer
  const [picked, setPicked] = useState({});   // key -> nom choisi / saisi
  const [tab, setTab] = useState("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const nameOf = (s) => (picked[s.key] !== undefined ? picked[s.key] : s.target);
  const changesOf = (s) => (s.make && String(nameOf(s) || "").trim() ? s.make(String(nameOf(s)).trim()) : s.changes);

  async function apply(list) {
    if (busy || !list.length) return;
    const changes = list.flatMap(changesOf);
    const dels = changes.filter(c => c.del).length;
    if (dels && !window.confirm("Supprimer " + dels + " doublon(s) ?")) return;
    setBusy(true); setMsg("⏳ " + changes.length + " modification(s) en cours…");
    try {
      const r = await onApply(changes);
      setMsg("✅ " + r.ok + " modification(s) appliquée(s)" + (r.failed ? " · ⚠️ " + r.failed + " échec(s)" + (r.last ? " : " + r.last : "") : ""));
    } catch (e) { setMsg("⚠️ " + (e?.message || "erreur")); }
    setBusy(false);
  }

  const groups = SUGG_TYPES.map(t => ({ ...t, list: suggestions.filter(s => s.type === t.type) })).filter(g => g.list.length);
  const visible = tab === "all" ? groups : groups.filter(g => g.type === tab);

  // fonction de rendu (pas un composant) : garde le focus dans les champs de saisie
  const renderCard = (s) => (
    <div className="sg-card" key={s.key}>
      <div className="sg-ico">{s.icon}</div>
      <div className="sg-main">
        <div className="sg-title">{s.title}</div>
        {s.detail && <div className="sg-detail">{s.detail}</div>}
        {s.choices && s.choices.length > 1 && (
          <div className="sg-choices">
            {s.choices.map(c => <button key={c} className={"sort-chip" + (nameOf(s) === c ? " active" : "")} onClick={() => setPicked(p => ({ ...p, [s.key]: c }))}>{c}</button>)}
          </div>
        )}
        {s.editable && <input className="sg-input" type="text" value={nameOf(s)} onChange={e => { const v = e.target.value; setPicked(p => ({ ...p, [s.key]: v })); }} />}
        {s.items && s.items.length > 0 && (
          <div className="sg-items">
            {s.items.slice(0, 6).map((t, i) => <span className="sg-item" key={i}>{t}</span>)}
            {s.items.length > 6 && <span className="sg-item">+{s.items.length - 6}</span>}
          </div>
        )}
      </div>
      <div className="sg-actions">
        <button className="sg-ok" disabled={busy} title="Appliquer" onClick={() => apply([s])}>✓</button>
        <button className="sg-no" disabled={busy} title="Ignorer (ne plus proposer)" onClick={() => onIgnore(s.key)}>✕</button>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target.classList.contains("modal-overlay") && onClose()}>
      <div className="modal" style={{ maxWidth: 680, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-header"><h2>🧭 Ranger ma collection</h2><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body" style={{ overflowY: "auto" }}>
          {!suggestions.length ? (
            <div className="sg-empty"><div>🎉</div><b>Tout est bien rangé !</b><p className="sg-hint">Aucune similitude détectée. Les nouvelles propositions apparaîtront ici après tes prochains ajouts.</p></div>
          ) : (<>
            <div className="sg-tabs">
              <button className={"sort-chip" + (tab === "all" ? " active" : "")} onClick={() => setTab("all")}>Tout ({suggestions.length})</button>
              {groups.map(g => <button key={g.type} className={"sort-chip" + (tab === g.type ? " active" : "")} onClick={() => setTab(g.type)}>{g.label} ({g.list.length})</button>)}
            </div>
            {msg && <div className="sg-msg">{msg}</div>}
            {visible.map(g => (
              <section className="sg-section" key={g.type}>
                <div className="sg-section-head">
                  <h3>{g.label} <span className="settings-count">{g.list.length}</span></h3>
                  {g.list.length > 1 && <button className="btn btn-ghost" disabled={busy} onClick={() => apply(g.list)}>✓ Tout appliquer</button>}
                </div>
                <p className="sg-hint">{g.hint}</p>
                {g.list.slice(0, 60).map(renderCard)}
                {g.list.length > 60 && <p className="sg-hint">… et {g.list.length - 60} autre(s) : applique ou ignore celles-ci pour voir la suite.</p>}
              </section>
            ))}
          </>)}
        </div>
        <div className="modal-footer">
          <div className="footer-right" style={{ width: "100%", justifyContent: "flex-end" }}>
            <button className="btn btn-primary" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
