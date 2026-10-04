import React, { useState, useMemo } from "react";
import { OWNED, normTitle, isSerieBlacklisted, isAlbumBlacklisted } from "../lib/store.js";
import { IconOneTome, IconManyTomes } from "./BlockIcons.jsx";

// Assistant de complétion mensuelle : budget + stratégie "séries presque finies d’abord"
export default function MonthlyPlan({ books, seriesMeta, blacklist, onClose, onAddWish, onBlacklistSerie, onBlacklistAlbum }) {
  const [budget, setBudget] = useState(() => {
    const saved = Number(localStorage.getItem("bd-library-budget-v1"));
    return saved > 0 ? saved : 30;
  });
  const [priceEach, setPriceEach] = useState(() => {
    const saved = Number(localStorage.getItem("bd-library-price-each-v1"));
    return saved > 0 ? saved : 12;
  });

  function saveBudget(v) { setBudget(v); localStorage.setItem("bd-library-budget-v1", String(v)); }
  function savePriceEach(v) { setPriceEach(v); localStorage.setItem("bd-library-price-each-v1", String(v)); }

  // Calcule les tomes manquants par série, triés "presque finies d'abord"
  const plan = useMemo(() => {
    const groups = {};
    books.forEach(b => { const s = (b.serie || "").trim(); if (s) (groups[s] = groups[s] || []).push(b); });
    const series = [];
    Object.keys(groups).forEach(name => {
      if (blacklist && isSerieBlacklisted(blacklist, name)) return;
      const items = groups[name];
      const owned = items.filter(b => OWNED.includes(b.statut));
      const tomes = owned.map(x => x.tome).filter(t => t !== "" && t != null).map(Number);
      if (tomes.length < 1) return;
      const total = seriesMeta[normTitle(name)]?.total;
      const upTo = total ? Number(total) : Math.max(...tomes);
      const present = new Set(tomes); const gaps = [];
      for (let t = 1; t <= upTo; t++) if (!present.has(t)) gaps.push(t);
      if (!gaps.length) return;
      const ref = items.find(b => b.auteur) || items[0];
      series.push({ name, gaps, max: upTo, owned: owned.length, auteur: ref.auteur || "", editeur: ref.editeur || "",
        remaining: gaps.length, completion: owned.length / upTo });
    });
    // tri : le moins de tomes manquants d'abord (presque finies), puis complétion décroissante
    series.sort((a, b) => a.remaining - b.remaining || b.completion - a.completion || a.name.localeCompare(b.name));
    return series;
  }, [books, seriesMeta, blacklist]);

  // Sélection dans le budget : on remplit "presque finies d'abord" tant que le budget tient
  const selection = useMemo(() => {
    const maxItems = Math.max(0, Math.floor(budget / (priceEach || 1)));
    const picks = []; let used = 0;
    for (const s of plan) {
      for (const t of s.gaps) {
        if (picks.length >= maxItems) break;
        if (blacklist && isAlbumBlacklisted(blacklist, { serie: s.name, tome: t, titre: s.name + " T." + t })) continue;
        picks.push({ serie: s.name, tome: t, auteur: s.auteur, editeur: s.editeur });
        used += priceEach;
      }
      if (picks.length >= maxItems) break;
    }
    return { picks, used, maxItems };
  }, [plan, budget, priceEach, blacklist]);

  function amazonCart() {
    // Panier Amazon multi-recherche : on ouvre une recherche par article (Amazon n'a pas d'API panier public)
    // Stratégie : ouvrir la recherche du 1er article, puis lister les autres pour ouverture manuelle.
    if (!selection.picks.length) return;
    const first = selection.picks[0];
    const url = "https://www.amazon.fr/s?k=" + encodeURIComponent(first.serie + " tome " + first.tome) + "&i=stripbooks";
    window.open(url, "_blank");
  }

  function addAllToWishlist() {
    selection.picks.forEach(p => onAddWish({ name: p.serie, auteur: p.auteur, editeur: p.editeur }, p.tome));
  }

  const monthName = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div className="modal-overlay" onClick={e => e.target.classList.contains("modal-overlay") && onClose()}>
      <div className="modal" style={{ maxWidth: 620, maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-header"><h2>🎯 Compléter ma collection — {monthName}</h2><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body" style={{ overflowY: "auto" }}>
          <div className="plan-controls">
            <div className="form-field">
              <label>💶 Budget du mois (€)</label>
              <input type="number" min="0" step="5" value={budget} onChange={e => saveBudget(Number(e.target.value) || 0)} />
            </div>
            <div className="form-field">
              <label>Prix moyen / album (€)</label>
              <input type="number" min="1" step="1" value={priceEach} onChange={e => savePriceEach(Number(e.target.value) || 1)} />
            </div>
          </div>

          <div className="plan-summary">
            {plan.length === 0
              ? <span>🎉 Toutes tes séries sont complètes (selon les totaux connus) !</span>
              : <span>Avec <b>{budget}€</b> (~<b>{selection.maxItems}</b> album{selection.maxItems > 1 ? "s" : ""}), voici les tomes à acheter en priorité — <b>séries presque finies d’abord</b> :</span>}
          </div>

          {selection.picks.length > 0 && (
            <div className="plan-list">
              {selection.picks.map((p, i) => (
                <div className="plan-item" key={i}>
                  <span className="plan-badge">T.{p.tome}</span>
                  <div className="plan-item-info">
                    <div className="plan-item-serie">{p.serie}</div>
                    {p.auteur && <div className="plan-item-auteur">{p.auteur}</div>}
                  </div>
                  <span className="plan-item-price">~{priceEach}€</span>
                  <span className="plan-item-block">
                    <button className="block-icon" title={"Ne plus proposer le tome " + p.tome} onClick={() => onBlacklistAlbum && onBlacklistAlbum({ serie: p.serie, tome: p.tome, titre: p.serie + " T." + p.tome, auteur: p.auteur })}><IconOneTome /></button>
                    <button className="block-icon block-icon-serie" title={"Ne plus proposer la série " + p.serie} onClick={() => onBlacklistSerie && onBlacklistSerie(p.serie)}><IconManyTomes /></button>
                  </span>
                </div>
              ))}
              <div className="plan-total">Total estimé : <b>{selection.used}€</b> / {budget}€</div>
            </div>
          )}

          {plan.length > selection.picks.length && (
            <div className="plan-more">+ {plan.reduce((s, x) => s + x.remaining, 0) - selection.picks.length} autre(s) tome(s) manquant(s) hors budget ce mois-ci.</div>
          )}
        </div>
        <div className="modal-footer">
          <div className="footer-right" style={{ width: "100%", justifyContent: "space-between" }}>
            <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
            <span style={{ display: "flex", gap: 8 }}>
              {selection.picks.length > 0 && <button className="btn btn-ghost" onClick={addAllToWishlist}>💜 Tout en wishlist</button>}
              {selection.picks.length > 0 && <button className="btn btn-primary" onClick={amazonCart}>🛒 Ouvrir sur Amazon</button>}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
