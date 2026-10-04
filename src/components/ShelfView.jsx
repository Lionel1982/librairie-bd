import React, { useMemo } from "react";

function spineColor(s) {
  let h = 0; const str = String(s || "?");
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return `hsl(${h}, 45%, 32%)`;
}
function spineHeight(b) {
  const s = String(b.titre || b.serie || "?"); let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 17 + s.charCodeAt(i)) % 1000;
  const big = /int[ée]grale|deluxe|luxe|grand format|coffret|artbook/i.test((b.titre || "") + " " + (b.editeur || ""));
  return (big ? 224 : 184) + (h % 26);
}

export default function ShelfView({ books, query, onOpen }) {
  const rows = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    let list = books.filter(b => !q || [b.titre, b.serie, b.auteur].join(" ").toLowerCase().includes(q));
    list = list.slice().sort((a, b) => (a.serie || "zzz").localeCompare(b.serie || "zzz") || (a.tome || 0) - (b.tome || 0) || (a.titre || "").localeCompare(b.titre || ""));
    const out = []; let cur = []; let lastSerie = null;
    list.forEach(b => {
      const s = (b.serie || "").toLowerCase();
      if (lastSerie !== null && s !== lastSerie && cur.length) cur.push({ _sep: true, id: "sep" + out.length + "-" + cur.length });
      cur.push(b); lastSerie = s;
      if (cur.filter(x => !x._sep).length >= 20) { out.push(cur); cur = []; lastSerie = null; }
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
            {row.map(x => x._sep ? <div className="spine-sep" key={x.id} /> : (
              <div key={x.id} className="spine" title={x.titre} onClick={() => onOpen(x.id)}
                style={{ width: 14 + ((x.titre || "").length % 6) * 2, height: spineHeight(x),
                  background: spineColor(x.serie || x.titre),
                  ...(x.cover && x._coverOk ? { backgroundImage: `url(${x.cover})`, backgroundSize: "cover", backgroundPosition: "center" } : {}) }}>
                <span className="spine-label">{(x.serie || x.titre || "").toUpperCase()}{x.tome ? " " + x.tome : ""}</span>
              </div>
            ))}
            <div className="bookend bookend-r" />
          </div>
          <div className="shelf-plank" />
        </div>
      ))}
    </div>
  );
}
