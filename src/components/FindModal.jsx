import React, { useState } from "react";
import { uid, cleanIsbn, extractTome } from "../lib/store.js";
import { searchCandidates } from "../lib/api.js";

export default function FindModal({ books, refCatalog, onAdd, onScan, onClose }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [statut, setStatut] = useState("jai");
  const [status, setStatus] = useState("Tape un titre, une série, un auteur ou un ISBN.");

  async function search() {
    if (!q.trim()) return;
    setStatus("🔎 Recherche…"); setResults([]); setChecked(new Set());
    const cands = await searchCandidates(q.trim(), 15, refCatalog);
    setResults(cands);
    setStatus(cands.length ? cands.length + " résultat(s) — coche ceux à ajouter." : "Aucun résultat.");
  }
  function toggle(i) { setChecked(c => { const n = new Set(c); n.has(i) ? n.delete(i) : n.add(i); return n; }); }
  function add() {
    const items = [...checked].map((i, k) => {
      const c = results[i];
      return { id: uid(), createdAt: Date.now() - k, statut, note: 0, commentaire: "Ajouté via recherche",
        titre: c.titre + (c.sousTitre ? " — " + c.sousTitre : ""), serie: "", tome: extractTome(c.titre + " " + (c.sousTitre || "")),
        auteur: c.auteur || "", editeur: c.editeur || "", annee: c.annee ? parseInt(c.annee) : "", isbn: c.isbn || "",
        cover: c.cover || (c.isbn ? "https://covers.openlibrary.org/b/isbn/" + cleanIsbn(c.isbn) + "-L.jpg" : ""), _coverOk: false };
    });
    if (items.length) onAdd(items);
  }

  return (
    <div className="modal-overlay" onClick={e => e.target.classList.contains("modal-overlay") && onClose()}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-header"><h2>🔎 Chercher un album</h2><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="find-search">
          <input type="text" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="Titre, série, auteur ou ISBN…" autoFocus />
          <button className="btn btn-primary" onClick={search}>🔎</button>
        </div>
        <button className="find-scan-btn" onClick={() => { onClose(); if (onScan) onScan(); }}>
          📷 Scanner un code-barre
        </button>
        <div className="find-status">{status}</div>
        <div className="find-list">
          {results.map((c, i) => {
            let coverUrl = c.cover || (c.isbn ? "https://covers.openlibrary.org/b/isbn/" + cleanIsbn(c.isbn) + "-M.jpg" : "");
            return (
              <label className="suggest-item" key={i}>
                <input type="checkbox" className="find-check" checked={checked.has(i)} onChange={() => toggle(i)} />
                <div className="suggest-cover">{coverUrl ? <img src={coverUrl} alt="" loading="lazy" onError={e => { e.target.style.display = "none"; }} /> : <div className="suggest-nocover">📕</div>}</div>
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
        {checked.size > 0 && (
          <div className="suggest-bar">
            <span className="suggest-bar-info"><b>{checked.size}</b> album(s)</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select className="find-status-sel" value={statut} onChange={e => setStatut(e.target.value)}>
                <option value="jai">💚 J'ai</option><option value="veux">💜 Je veux</option><option value="a-confirmer">🟡 À confirmer</option>
              </select>
              <button className="btn btn-primary" onClick={add}>✓ Ajouter les {checked.size}</button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
