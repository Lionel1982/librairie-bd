import React, { useState, useMemo } from "react";
import { findDuplicate, normTitle } from "../lib/store.js";
import { THEMES } from "../lib/theme.js";
import { useBackClose } from "../lib/backButton.js";

// Paramètres avec navigation interne : écran d'accueil (rubriques) -> sous-écrans.
export default function SettingsModal({ mode = "settings", theme, onTheme, suggCount = 0, noCoverCount = 0, onOpenSuggestions, onShowNoCover,
  blacklist, books, refCatalog, onRestore, onFetchPages, onUnblacklistSerie, onUnblacklistAlbum, onRefreshCovers, onCleanupJunk, onClose }) {
  useBackClose(true, onClose);   // bouton « précédent » = fermer
  const [screen, setScreen] = useState("home"); // home | blacklist | covers | cleanup
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverMsg, setCoverMsg] = useState("");
  const [junkMsg, setJunkMsg] = useState("");
  const [rq, setRq] = useState("");
  const [sel, setSel] = useState(new Set());
  const [rstatut, setRstatut] = useState("jai");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");
  const [pagesBusy, setPagesBusy] = useState(false);
  const [pagesMsg, setPagesMsg] = useState("");

  // albums présents dans le dernier import BDGest mais absents de la collection
  const missing = useMemo(() => {
    if (screen !== "restore") return [];
    const out = [], seen = new Set();
    (refCatalog || []).forEach(c => {
      const t = (c.titre || "").trim(), serie = (c.serie || "").trim();
      const titre = (serie && c.tome && t) ? serie + " — T." + c.tome + " — " + t : (serie && t && t !== serie) ? serie + " — " + t : (t || serie);
      if (!titre) return;
      const cand = { titre, serie, tome: (c.tome === "" || c.tome == null) ? "" : Number(c.tome), auteur: c.auteur || "", editeur: c.editeur || "",
        annee: parseInt(c.annee, 10) || "", isbn: c.isbn || "", cover: "", note: 0, commentaire: "Restauré depuis l’import BDGest", _coverOk: false };
      const k = cand.isbn || normTitle(titre) + "|" + cand.tome;
      if (seen.has(k)) return; seen.add(k);
      if (!findDuplicate(books || [], cand)) out.push({ ...cand, _k: k });
    });
    return out.sort((a, b) => (a.serie || a.titre).localeCompare(b.serie || b.titre, "fr", { sensitivity: "base" }) || ((a.tome || 0) - (b.tome || 0)));
  }, [screen, books, refCatalog]);
  const rqn = normTitle(rq);
  const shown = rqn ? missing.filter(m => normTitle(m.titre + " " + m.auteur).includes(rqn)) : missing;
  function toggleSel(k) { setSel(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); }
  async function runRestore() {
    if (!onRestore || !sel.size || restoreBusy) return;
    setRestoreBusy(true);
    try {
      const items = missing.filter(m => sel.has(m._k)).map(({ _k, ...b }) => ({ ...b, statut: rstatut }));
      const n = await onRestore(items);
      setRestoreMsg("✅ " + n + " album(s) remis dans ta collection."); setSel(new Set());
    } catch (e) { setRestoreMsg("⚠️ " + (e?.message || "erreur")); }
    setRestoreBusy(false);
  }
  async function runPages() {
    if (!onFetchPages || pagesBusy) return;
    setPagesBusy(true); setPagesMsg("Préparation…");
    try {
      const r = await onFetchPages((i, total, titre) => setPagesMsg("Album " + i + "/" + total + " — " + (titre || "")));
      setPagesMsg("✅ Terminé : " + (r?.updated ?? 0) + " album(s) complété(s) sur " + (r?.total ?? 0) + ".");
    } catch (e) { setPagesMsg("⚠️ " + (e?.message || "erreur")); }
    setPagesBusy(false);
  }

  const bl = blacklist || { series: [], albums: [] };
  const series = bl.series || [], albums = bl.albums || [];
  const fmtDate = (t) => t ? new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "";

  async function runRefreshCovers() {
    if (coverBusy || !onRefreshCovers) return;
    setCoverBusy(true); setCoverMsg("Préparation…");
    try {
      const res = await onRefreshCovers((i, total, titre) => setCoverMsg("Couverture " + i + "/" + total + " — " + (titre || "")));
      setCoverMsg("✅ Terminé : " + (res?.updated ?? 0) + " couverture(s) mise(s) à jour sur " + (res?.total ?? 0) + " album(s).");
    } catch { setCoverMsg("⚠️ Erreur pendant la récupération."); }
    setCoverBusy(false);
  }
  async function hardRefresh() {
    try {
      // 1) vider tous les caches (service worker PWA)
      if (window.caches && caches.keys) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); }
      // 2) désinscrire les service workers pour forcer la récupération du code à jour
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister()));
      }
    } catch {}
    // 3) reload complet (re-télécharge le code ET refait un fetch Supabase propre)
    window.location.reload();
  }
  async function runCleanup() {
    if (!onCleanupJunk) return;
    setJunkMsg("Nettoyage…");
    try {
      const r = await onCleanupJunk();
      let m = "✅ " + (r?.removed ?? 0) + " entrée(s) supprimée(s).";
      if (r?.failed) m += " ⚠️ " + r.failed + " échec(s)" + (r.lastErr ? " : " + r.lastErr : "");
      setJunkMsg(m);
    } catch (e) { setJunkMsg("⚠️ Erreur : " + (e?.message || "nettoyage")); }
  }

  const title = screen === "home" ? (mode === "ranger" ? "🧭 Ranger ma collection" : "⚙️ Paramètres")
    : screen === "theme" ? "🎨 Couleurs"
    : screen === "blacklist" ? "⛔ Liste noire"
    : screen === "covers" ? "🖼️ Couvertures"
    : screen === "restore" ? "♻️ Albums manquants"
    : screen === "pages" ? "📏 Étagère : pages et format"
    : "🧹 Nettoyage";

  const row = (ico, name, sub, onClick, badge) => (
    <button className="settings-row" key={name} onClick={onClick}>
      <span className="settings-row-ico">{ico}</span>
      <span className="settings-row-txt"><b>{name}</b><small>{sub}</small></span>
      {badge ? <span className="settings-row-badge">{badge}</span> : null}
      <span className="settings-row-arrow">›</span>
    </button>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target.classList.contains("modal-overlay") && onClose()}>
      <div className="modal" style={{ maxWidth: 620, maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-header">
          <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {screen !== "home" && <button className="settings-back" onClick={() => setScreen("home")}>‹</button>}
            {title}
          </h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ overflowY: "auto" }}>
          {screen === "home" && mode === "ranger" && (
            <div className="settings-menu">
              {row("🧭", "Propositions de rangement", "Doublons, séries à fusionner, tomes, genres", onOpenSuggestions, suggCount)}
              {row("🖼️", "Couvertures", "Voir les albums sans couverture, récupérer les manquantes", () => setScreen("covers"), noCoverCount)}
              {row("🧹", "Nettoyage", "Supprimer les entrées parasites", () => setScreen("cleanup"))}
              {row("♻️", "Albums manquants", "Retrouver les albums supprimés par erreur (import BDGest)", () => setScreen("restore"))}
              {row("📏", "Étagère", "Nombre de pages et repérage des mangas", () => setScreen("pages"))}
            </div>
          )}
          {screen === "home" && mode !== "ranger" && (
            <div className="settings-menu">
              {row("🎨", "Couleurs", "Changer l’ambiance de l’app", () => setScreen("theme"))}
              {row("⛔", "Liste noire", "Séries et albums à ne plus proposer", () => setScreen("blacklist"), series.length + albums.length)}
              {row("🔄", "Rafraîchir", "Vider le cache et recharger (tél + PC)", hardRefresh)}
            </div>
          )}

          {screen === "theme" && (
            <section className="settings-section">
              <p className="settings-empty">Choisis l’ambiance de l’app (enregistrée sur cet appareil).</p>
              <div className="theme-grid">
                {THEMES.map(th => (
                  <button key={th.key} className={"theme-card" + (theme === th.key ? " active" : "")} onClick={() => onTheme && onTheme(th.key)}>
                    <span className="theme-sw">{th.swatch.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
                    <b>{th.label}</b><small>{th.desc}</small>
                  </button>
                ))}
              </div>
            </section>
          )}

          {screen === "covers" && (
            <section className="settings-section">
              <p className="settings-empty">Récupère une couverture (BnF, Google Books, Open Library) pour tous les albums ayant un ISBN. Les couvertures existantes valides ne sont écrasées que si une meilleure est trouvée.</p>
              <button className="btn btn-primary" disabled={coverBusy} onClick={runRefreshCovers}>{coverBusy ? "⏳ En cours…" : "🖼️ Récupérer les couvertures manquantes"}</button>
              {coverMsg && <div className="settings-cover-msg">{coverMsg}</div>}
              <div className="settings-sep" />
              <p className="settings-empty"><b>{noCoverCount}</b> album(s) sans couverture enregistrée.</p>
              {noCoverCount > 0 && onShowNoCover && <button className="btn btn-ghost" onClick={onShowNoCover}>👁️ Voir les albums sans couverture</button>}
            </section>
          )}

          {screen === "cleanup" && (
            <section className="settings-section">
              <p className="settings-empty">Supprime les entrées parasites importées par erreur (lignes d’exemple « T.TypeObjet / Descriptif / Largeur / Profondeur », sans ISBN).</p>
              <button className="btn btn-ghost" onClick={runCleanup}>🧹 Supprimer les entrées parasites</button>
              {junkMsg && <div className="settings-cover-msg">{junkMsg}</div>}
            </section>
          )}

          {screen === "restore" && (
            <section className="settings-section">
              {!(refCatalog || []).length ? <p className="settings-empty">Aucun import BDGest mémorisé : importe ton CSV BDGest pour pouvoir comparer.</p> : (<>
                <p className="settings-empty">Albums de ton dernier import BDGest absents de ta collection (supprimés par erreur ?). Coche ceux à remettre.</p>
                <input type="text" className="restore-search" placeholder="Filtrer (ex. alter ego)…" value={rq} onChange={e => setRq(e.target.value)} />
                <div className="restore-head">
                  <span>{shown.length} album(s){missing.length !== shown.length ? " sur " + missing.length : ""}</span>
                  {shown.length > 0 && <button className="btn btn-ghost" onClick={() => setSel(new Set(shown.map(m => m._k)))}>Tout cocher</button>}
                </div>
                <div className="settings-list">
                  {shown.slice(0, 200).map(m => (
                    <label className="settings-item restore-item" key={m._k}>
                      <input type="checkbox" checked={sel.has(m._k)} onChange={() => toggleSel(m._k)} />
                      <div className="settings-item-info"><div className="settings-item-name">{m.titre}</div><div className="settings-item-date">{[m.auteur, m.editeur, m.isbn ? "ISBN " + m.isbn : ""].filter(Boolean).join(" · ")}</div></div>
                    </label>
                  ))}
                </div>
                {sel.size > 0 && (
                  <div className="restore-bar">
                    <select value={rstatut} onChange={e => setRstatut(e.target.value)}>
                      <option value="jai">💚 J’ai</option><option value="lu">📗 Lu</option><option value="veux">💜 Je veux</option>
                    </select>
                    <button className="btn btn-primary" disabled={restoreBusy} onClick={runRestore}>{restoreBusy ? "⏳…" : "♻️ Remettre les " + sel.size}</button>
                  </div>
                )}
                {restoreMsg && <div className="settings-cover-msg">{restoreMsg}</div>}
              </>)}
            </section>
          )}

          {screen === "pages" && (
            <section className="settings-section">
              <p className="settings-empty">Récupère le nombre de pages (épaisseur des tranches) et repère les mangas (format plus petit) pour les albums ayant un ISBN. Sans info, une tranche compte 50 pages. Tu peux aussi corriger « Pages » et « Format » dans chaque fiche.</p>
              <button className="btn btn-primary" disabled={pagesBusy} onClick={runPages}>{pagesBusy ? "⏳ En cours…" : "📏 Récupérer pages et format"}</button>
              {pagesMsg && <div className="settings-cover-msg">{pagesMsg}</div>}
            </section>
          )}

          {screen === "blacklist" && (<>
            <section className="settings-section">
              <h3>Séries <span className="settings-count">{series.length}</span></h3>
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
              <h3>Albums <span className="settings-count">{albums.length}</span></h3>
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
