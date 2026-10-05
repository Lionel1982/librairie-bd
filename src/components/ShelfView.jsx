import React, { useMemo } from "react";
import { isManga, normTitle } from "../lib/store.js";

const DEFAULT_PAGES = 50;      // sans info : une tranche « 50 pages »
const ROW_MAX_WIDTH = 420;     // largeur cumulée max d'une rangée (px)

function hash(s) { let h = 0; s = String(s || "?"); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function spineColor(s) { return `hsl(${hash(s) % 360}, 45%, 32%)`; }
const groupKey = (b) => normTitle(b.serie) || "t:" + normTitle(b.titre);
// épaisseur proportionnelle au nombre de pages
function spineWidth(b) { const p = Number(b.pages) || DEFAULT_PAGES; return Math.max(16, Math.min(52, Math.round(10 + p * 0.12))); }
const BIG = /int[ée]grale|deluxe|luxe|grand format|coffret|artbook/i;

export default function ShelfView({ books, query, onOpen }) {
  // une hauteur UNIQUE par série : manga plus petit, grand format plus haut, légère variation entre séries
  const series = useMemo(() => {
    const g = new Map();
    books.forEach(b => {
      const k = groupKey(b); const e = g.get(k) || { manga: false, big: false };
      if (isManga(b)) e.manga = true;
      if (BIG.test((b.titre || "") + " " + (b.editeur || ""))) e.big = true;
      g.set(k, e);
    });
    const out = {};
    g.forEach((e, k) => { out[k] = { manga: e.manga, h: (e.manga ? 150 : e.big ? 232 : 200) + (hash(k) % 13) - 6 }; });
    return out;
  }, [books]);

  const rows = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    const cmp = (a, b) => String(a || "").localeCompare(String(b || ""), "fr", { sensitivity: "base", numeric: true });
    const list = books.filter(b => !q || [b.titre, b.serie, b.auteur].join(" ").toLowerCase().includes(q))
      .sort((a, b) => cmp(a.serie || a.titre, b.serie || b.titre) || ((a.tome || 0) - (b.tome || 0)) || cmp(a.titre, b.titre));
    const out = []; let cur = [], w = 0, last = null;
    list.forEach(b => {
      const k = groupKey(b), bw = spineWidth(b);
      if (cur.length && w + bw > ROW_MAX_WIDTH) { out.push(cur); cur = []; w = 0; last = null; }
      if (last !== null && k !== last) { cur.push({ _sep: true, id: "sep" + out.length + "-" + cur.length }); w += 8; }
      cur.push(b); w += bw; last = k;
    });
    if (cur.length) out.push(cur);
    return out;
  }, [books, query]);

  if (!books.length) return <div className="pending-hint">Bibliothèque vide.</div>;

  return (
    <div className="shelfview" style={{ gridColumn: "1/-1" }}>
      {rows.map((row, ri) => (
        <div className="shelf-row" key={ri}>
          <div className="shelf-books">
            <div className="bookend bookend-l" />
            {row.map(x => {
              if (x._sep) return <div className="spine-sep" key={x.id} />;
              const s = series[groupKey(x)] || { h: 200, manga: false };
              return (
                <div key={x.id} className={"spine" + (s.manga ? " spine-manga" : "")} title={x.titre + (x.pages ? " · " + x.pages + " p." : "")} onClick={() => onOpen(x.id)}
                  style={{ width: spineWidth(x), height: s.h, background: spineColor(x.serie || x.titre),
                    ...(x.cover && x._coverOk ? { backgroundImage: `url(${x.cover})`, backgroundSize: "cover", backgroundPosition: "center" } : {}) }}>
                  <span className="spine-label">{(x.serie || x.titre || "").toUpperCase()}{x.tome ? " " + x.tome : ""}</span>
                </div>
              );
            })}
            <div className="bookend bookend-r" />
          </div>
          <div className="shelf-plank" />
        </div>
      ))}
    </div>
  );
}
