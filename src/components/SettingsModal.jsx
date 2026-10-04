import React, { useState } from "react";

// Paramètres : gestion de la liste noire (séries / albums à ne plus proposer)
export default function SettingsModal({ blacklist, onUnblacklistSerie, onUnblacklistAlbum, onRefreshCovers, onCleanupJunk, onClose }) {
  const [junkMsg, setJunkMsg] = useState("");
  async function runCleanup() {
    if (!onCleanupJunk) return;
    setJunkMsg("Nettoyage…");
    try { const r = await onCleanupJunk(); setJunkMsg("✅ " + (r?.removed ?? 0) + " entrée(s) parasite(s) supprimée(s)."); }
    catch { setJunkMsg("⚠️ Erreur pendant le nettoyage."); }
  }
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverMsg, setCoverMsg] = useState("");
  async function runRefreshCovers() {
    if (coverBusy || !onRefreshCovers) return;
    setCoverBusy(true); setCoverMsg("Préparation…");
    try {
      const res = await onRefreshCovers((i, total, titre) => setCoverMsg("Couverture " + i + "/" + total + " — " + (titre || "")));
      setCoverMsg("✅ Terminé : " + (res?.updated ?? 0) + " couverture(s) mise(s) à jour sur " + (res?.total ?? 0) + " album(s).");
    } catch { setCoverMsg("⚠️ Erreur pendant la récupération."); }
    setCoverBusy(false);
  }
  const bl = blacklist || { series: [], albums: [] };
  const series = bl.series || [], albums = bl.albums || [];
  const fmtDate = (t) => t ? new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "";

  return (
    <div className="modal-overlay" onClick={e => e.target.classList.contains("modal-overlay") && onClose()}>
      <div className="modal" style={{ maxWidth: 620, maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-header"><h2>⚙️ Paramètres</h2><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body" style={{ overflowY: "auto" }}>
          <section className="settings-section">
            <h3>🖼️ Couvertures</h3>
            <p className="settings-empty">Récupère une couverture (BnF, Google Books, Open Library) pour tous les albums ayant un ISBN. Les couvertures existantes valides ne sont écrasées que si une meilleure est trouvée.</p>
            <button className="btn btn-primary" disabled={coverBusy} onClick={runRefreshCovers}>{coverBusy ? "⏳ En cours…" : "🖼️ Récupérer les couvertures manquantes"}</button>
            {coverMsg && <div className="settings-cover-msg">{coverMsg}</div>}
          </section>

          <section className="settings-section">
            <h3>🧹 Nettoyage</h3>
            <p className="settings-empty">Supprime les entrées parasites importées par erreur (lignes d’exemple « T.TypeObjet / Descriptif / Largeur / Profondeur », sans ISBN).</p>
            <button className="btn btn-ghost" onClick={runCleanup}>🧹 Supprimer les entrées parasites</button>
            {junkMsg && <div className="settings-cover-msg">{junkMsg}</div>}
          </section>

          <section className="settings-section">
            <h3>⛔ Séries à ne plus proposer <span className="settings-count">{series.length}</span></h3>
            {series.length === 0
              ? <p className="settings-empty">Aucune série blacklistée. Utilise « ⛔ série » dans les vues 🎯 Compléter ou 🧩 À compléter.</p>
              : <div className="settings-list">
                  {series.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(s => (
                    <div className="settings-item" key={s.key}>
                      <div className="settings-item-info"><div className="settings-item-name">{s.name || s.key}</div>{s.addedAt && <div className="settings-item-date">ajoutée le {fmtDate(s.addedAt)}</div>}</div>
                      <button className="btn btn-ghost settings-allow" onClick={() => onUnblacklistSerie(s.key)}>✅ Réautoriser</button>
                    </div>
                  ))}
                </div>}
          </section>

          <section className="settings-section">
            <h3>⛔ Albums à ne plus proposer <span className="settings-count">{albums.length}</span></h3>
            {albums.length === 0
              ? <p className="settings-empty">Aucun album blacklisté. Utilise « ⛔ tome » dans les propositions.</p>
              : <div className="settings-list">
                  {albums.slice().sort((a, b) => (a.label || "").localeCompare(b.label || "")).map(a => (
                    <div className="settings-item" key={a.key}>
                      <div className="settings-item-info"><div className="settings-item-name">{a.label || a.key}</div><div className="settings-item-date">{a.isbn ? "ISBN " + a.isbn + " · " : ""}{a.addedAt ? "ajouté le " + fmtDate(a.addedAt) : ""}</div></div>
                      <button className="btn btn-ghost settings-allow" onClick={() => onUnblacklistAlbum(a.key)}>✅ Réautoriser</button>
                    </div>
                  ))}
                </div>}
          </section>
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
