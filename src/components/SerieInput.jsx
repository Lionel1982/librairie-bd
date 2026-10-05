import React, { useState, useMemo } from "react";
import { normTitle } from "../lib/store.js";

// Champ « Série » : propose les séries existantes pendant la saisie et indique
// les tomes déjà présents (évite les doublons de série « Dai Dark » / « Dai dark »…).
export default function SerieInput({ value, onChange, seriesList, tome, autoFocus }) {
  const [open, setOpen] = useState(false);
  const q = normTitle(value);
  const matches = useMemo(() => {
    if (!q) return [];
    return seriesList
      .filter(s => { const n = normTitle(s.name); return n.includes(q) && n !== q; })
      .sort((a, b) => (normTitle(b.name).startsWith(q) ? 1 : 0) - (normTitle(a.name).startsWith(q) ? 1 : 0))
      .slice(0, 6);
  }, [q, seriesList]);
  const exact = q ? seriesList.find(s => normTitle(s.name) === q) : null;
  const tomeTaken = exact && tome !== "" && tome != null && exact.tomes.includes(Number(tome));

  return (
    <div className="serie-input">
      <input type="text" value={value} autoFocus={autoFocus} autoComplete="off" placeholder="Nom de la série…"
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && matches.length > 0 && (
        <div className="serie-suggest">
          {matches.map(s => (
            <button type="button" key={s.name} onMouseDown={e => { e.preventDefault(); onChange(s.name); setOpen(false); }}>
              <span className="ss-name">{s.name}</span>
              <span className="ss-count">{s.count} album(s){s.tomes.length ? " · T." + s.tomes.slice(0, 8).join(", ") + (s.tomes.length > 8 ? "…" : "") : ""}</span>
            </button>
          ))}
        </div>
      )}
      {exact && (
        <div className={"serie-exists" + (tomeTaken ? " warn" : "")}>
          {tomeTaken ? "⚠️ Tu as déjà le T." + tome + " de cette série" : "📚 Série existante : " + exact.count + " album(s)" + (exact.tomes.length ? " (T." + exact.tomes.join(", ") + ")" : "")}
        </div>
      )}
    </div>
  );
}
