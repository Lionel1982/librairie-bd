import React, { useMemo } from "react";
import { OWNED, normTitle } from "../lib/store.js";

function Donut({ segments, size = 180 }) {
  const r = size / 2 - 16, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let off = 0;
  return (
    <div className="chart-donut">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {segments.filter(s => s.value > 0).map((s, i) => {
          const dash = (s.value / total) * C; const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth="22" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cy})`} />; off += dash; return el;
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" className="donut-total">{total}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="donut-sub">albums</text>
      </svg>
      <div className="chart-legend">{segments.filter(s => s.value > 0).map((s, i) => <div className="chart-leg" key={i}><span className="chart-dot" style={{ background: s.color }} /> {s.label} <b>{s.value}</b></div>)}</div>
    </div>
  );
}

export default function StatsView({ books, seriesMeta }) {
  const stats = useMemo(() => {
    const jai = books.filter(b => OWNED.includes(b.statut)).length;
    const veux = books.filter(b => b.statut === "veux").length;
    const lu = books.filter(b => b.statut === "lu").length;
    const series = {}; books.forEach(b => { const s = (b.serie || "").trim() || "—"; series[s] = (series[s] || 0) + 1; });
    const eds = {}; books.forEach(b => { const e = (b.editeur || "").trim(); if (e) eds[e] = (eds[e] || 0) + 1; });
    const topEds = Object.entries(eds).sort((a, b) => b[1] - a[1]).slice(0, 8);
    let valeur = 0; books.forEach(b => { const m = (b.commentaire || "").match(/Acheté\s+([\d.,]+)/); if (m) valeur += parseFloat(m[1].replace(",", ".")) || 0; });
    let completes = 0, entamees = 0;
    Object.keys(series).forEach(name => { if (name === "—") return; const items = books.filter(b => (b.serie || "").trim() === name); const tomes = items.map(x => x.tome).filter(t => t !== "" && t != null).map(Number); const total = seriesMeta[normTitle(name)]?.total; const upTo = total ? Number(total) : (tomes.length ? Math.max(...tomes) : 0); if (upTo > 1) { const present = new Set(tomes); let hole = false; for (let t = 1; t <= upTo; t++) if (!present.has(t)) hole = true; if (hole) entamees++; else completes++; } });
    return { total: books.length, jai, veux, lu, nbSeries: Object.keys(series).length, topEds, maxEd: topEds[0]?.[1] || 1, valeur, completes, entamees };
  }, [books, seriesMeta]);

  if (!books.length) return <div className="pending-hint">Aucune BD en bibliothèque.</div>;
  const card = (icon, val, label) => <div className="stat-card"><div className="stat-icon">{icon}</div><div className="stat-num">{val}</div><div className="stat-label">{label}</div></div>;
  return (
    <div className="stats-view" style={{ gridColumn: "1/-1" }}>
      <div className="stats-cards">
        {card("📚", stats.total, "albums")}{card("🗂️", stats.nbSeries, "séries")}{card("💚", stats.jai, "possédés")}
        {card("💜", stats.veux, "souhaités")}{card("📖", stats.lu, "lus")}{card("✅", stats.completes, "séries complètes")}
        {card("🧩", stats.entamees, "à compléter")}{stats.valeur > 0 && card("💶", Math.round(stats.valeur) + "€", "valeur d'achat")}
      </div>
      <div className="stats-charts">
        <div className="stats-block chart-block"><h3>📗 Répartition</h3><Donut segments={[{ label: "Possédés", value: stats.jai, color: "#3ddc97" }, { label: "Souhaités", value: stats.veux, color: "#7c5cff" }]} /></div>
        <div className="stats-block chart-block"><h3>🧩 Séries</h3><Donut segments={[{ label: "Complètes", value: stats.completes, color: "#3ddc97" }, { label: "À compléter", value: stats.entamees, color: "#ffa726" }]} /></div>
      </div>
      <div className="stats-block"><h3>🏢 Top éditeurs</h3>
        {stats.topEds.map(([e, n]) => <div className="bar-row" key={e}><span className="bar-label">{e}</span><div className="bar-track"><div className="bar-fill" style={{ width: Math.round(n / stats.maxEd * 100) + "%" }} /></div><span className="bar-val">{n}</span></div>)}
      </div>
    </div>
  );
}
