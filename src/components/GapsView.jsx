import React, { useMemo } from "react";
import { OWNED, normTitle, isSerieBlacklisted, isAlbumBlacklisted } from "../lib/store.js";
import { IconOneTome, IconManyTomes } from "./BlockIcons.jsx";

export default function GapsView({ books, seriesMeta, query, blacklist, onAddWish, onBlacklistSerie, onBlacklistAlbum }) {
  const rows = useMemo(() => {
    const groups = {};
    books.forEach(b => { const s = (b.serie || "").trim(); if (s) (groups[s] = groups[s] || []).push(b); });
    const q = (query || "").trim().toLowerCase();
    const out = [];
    Object.keys(groups).forEach(name => {
      if (q && !name.toLowerCase().includes(q)) return;
      if (blacklist && isSerieBlacklisted(blacklist, name)) return;
      const items = groups[name];
      const owned = items.filter(b => OWNED.includes(b.statut));
      const tomes = owned.map(x => x.tome).filter(t => t !== "" && t != null).map(Number);
      if (tomes.length < 1) return;
      const total = seriesMeta[normTitle(name)]?.total;
      const upTo = total ? Number(total) : Math.max(...tomes);
      const present = new Set(tomes); let gaps = [];
      for (let t = 1; t <= upTo; t++) if (!present.has(t)) gaps.push(t);
      if (blacklist) gaps = gaps.filter(t => !isAlbumBlacklisted(blacklist, { serie: name, tome: t, titre: name + " T." + t }));
      if (gaps.length) {
        const ref = items.find(b => b.auteur) || items[0];
        out.push({ name, gaps, max: upTo, count: owned.length, auteur: ref.auteur || "", editeur: ref.editeur || "", ratio: owned.length / upTo, total: total || "" });
      }
    });
    out.sort((a, b) => a.gaps.length - b.gaps.length || b.ratio - a.ratio || a.name.localeCompare(b.name));
    return out;
  }, [books, seriesMeta, query, blacklist]);

  if (!rows.length) return <div className="pending-hint">🎉 Aucun trou détecté dans tes séries !<br /><span style={{ fontSize: 14, color: "var(--text-dim)" }}>(Vérifie les totaux via Wikipédia dans l’onglet Séries pour plus de précision)</span></div>;

  return (
    <div className="gaps-view" style={{ gridColumn: "1/-1" }}>
      <div className="gaps-head">🧩 <b>{rows.length}</b> série(s) à compléter — triées par proximité</div>
      {rows.map(r => (
        <div className="gap-card" key={r.name}>
          <div className="gap-info">
            <div className="gap-serie">{r.name}</div>
            <div className="gap-meta">{r.auteur} · {r.count}/{r.max} tomes</div>
            <div className="gap-missing">Manque : {r.gaps.map(t => (
              <span className="gap-tome-wrap" key={t}>
                <span className="gap-tome" title={"Ajouter T." + t + " à la wishlist"} onClick={() => onAddWish(r, t)}>T.{t}</span>
                <button className="gap-tome-block" title={"Ne plus proposer le tome " + t} onClick={() => onBlacklistAlbum && onBlacklistAlbum({ serie: r.name, tome: t, titre: r.name + " T." + t, auteur: r.auteur })}><IconOneTome size={15} /></button>
              </span>
            ))}</div>
          </div>
          <div className="gap-actions">
            <button className="btn btn-ghost" onClick={() => window.open("https://www.amazon.fr/s?k=" + encodeURIComponent(r.name + " BD") + "&i=stripbooks", "_blank")}>🛒 Amazon</button>
            <button className="btn btn-ghost block-btn-serie" title={"Ne plus proposer la série " + r.name} onClick={() => onBlacklistSerie && onBlacklistSerie(r.name)}><IconManyTomes size={16} /> série</button>
          </div>
        </div>
      ))}
    </div>
  );
}
