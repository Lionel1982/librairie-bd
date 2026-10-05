import React, { useMemo } from "react";
import { OWNED, normTitle, buildGenreMap, GENRES, GENRE_KEYS } from "../lib/store.js";

// Donut cliquable : chaque segment (et sa légende) peut mener à la liste correspondante (seg.go)
function Donut({ segments, size = 180, onPick }) {
  const r = size / 2 - 16, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const pick = (s) => { if (s.go && onPick) onPick(s.go); };
  let off = 0;
  return (
    <div className="chart-donut">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {segments.filter(s => s.value > 0).map((s, i) => {
          const dash = (s.value / total) * C;
          const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" strokeWidth="22" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-off}
            transform={`rotate(-90 ${cx} ${cy})`} style={{ stroke: s.color, cursor: s.go ? "pointer" : undefined }} onClick={() => pick(s)} />;
          off += dash; return el;
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" className="donut-total">{total}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="donut-sub">albums</text>
      </svg>
      <div className="chart-legend">{segments.filter(s => s.value > 0).map((s, i) => (
        <button type="button" className={"chart-leg" + (s.go ? " stat-link" : "")} key={i} onClick={() => pick(s)}><span className="chart-dot" style={{ background: s.color }} /> {s.label} <b>{s.value}</b></button>
      ))}</div>
    </div>
  );
}

export default function StatsView({ books, seriesMeta, onNavigate }) {
  const go = (target) => { if (target && onNavigate) onNavigate(target); };
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

  // stats par genre (franco-belge / manga / comics), sur les albums possédés
  const genre = useMemo(() => {
    const gmap = buildGenreMap(books);
    const g = {}; GENRE_KEYS.forEach(k => { g[k] = { owned: 0, wish: 0, lu: 0, series: {}, eds: {} }; });
    let deduced = 0;
    books.forEach(b => {
      const e = g[gmap.get(b.id) || "bd"]; const owned = OWNED.includes(b.statut);
      if (b.statut === "veux") e.wish++;
      if (!owned) return;
      e.owned++; if (b.statut === "lu") e.lu++;
      if (!GENRE_KEYS.includes(b.format)) deduced++;
      const s = (b.serie || "").trim(); if (s) e.series[s] = (e.series[s] || 0) + 1;
      const ed = (b.editeur || "").trim(); if (ed) e.eds[ed] = (e.eds[ed] || 0) + 1;
    });
    Object.values(g).forEach(e => {
      e.nbSeries = Object.keys(e.series).length;
      e.top = Object.entries(e.series).sort((a, b) => b[1] - a[1]).slice(0, 5);
      e.topEd = Object.entries(e.eds).sort((a, b) => b[1] - a[1])[0];
    });
    return { g, deduced };
  }, [books]);

  if (!books.length) return <div className="pending-hint">Aucune BD en bibliothèque.</div>;
  const card = (icon, val, label, target) => (
    <button type="button" className="stat-card stat-link" onClick={() => go(target)} title="Voir la liste">
      <div className="stat-icon">{icon}</div><div className="stat-num">{val}</div><div className="stat-label">{label}</div>
    </button>
  );
  return (
    <div className="stats-view" style={{ gridColumn: "1/-1" }}>
      <div className="stats-cards">
        {card("📚", stats.total, "albums", { view: "biblio", filters: { statut: "all" } })}{card("🗂️", stats.nbSeries, "séries", { view: "series" })}{card("💚", stats.jai, "possédés", { view: "biblio" })}
        {card("💜", stats.veux, "souhaités", { view: "wishlist" })}{card("📖", stats.lu, "lus", { view: "biblio", filters: { statut: "lu" } })}{card("✅", stats.completes, "séries complètes", { view: "series" })}
        {card("🧩", stats.entamees, "à compléter", { view: "trous" })}{stats.valeur > 0 && card("💶", Math.round(stats.valeur) + "€", "valeur d'achat", { view: "biblio" })}
      </div>
      <div className="stats-block"><h3>🌍 Par genre</h3>
        <div className="genre-wrap">
          <Donut onPick={go} segments={GENRE_KEYS.map(k => ({ label: GENRES[k].icon + " " + GENRES[k].label, value: genre.g[k].owned, color: GENRES[k].color, go: { view: "biblio", filters: { genre: k } } }))} />
          <div className="genre-cards">
            {GENRE_KEYS.map(k => { const e = genre.g[k], G = GENRES[k]; return (
              <div className="genre-card stat-link" key={k} style={{ borderColor: G.color }} title="Voir ces albums" onClick={() => go({ view: "biblio", filters: { genre: k } })}>
                <div className="genre-head"><span className="genre-ico">{G.icon}</span><b>{G.label}</b></div>
                <div className="genre-nums">
                  <span><b>{e.owned}</b> albums</span><span><b>{e.nbSeries}</b> séries</span>
                  <span><b>{e.owned ? Math.round(e.lu / e.owned * 100) : 0}%</b> lus</span>
                  {e.wish > 0 && <span><b>{e.wish}</b> souhaités</span>}
                </div>
                {e.top.map(([s, n]) => <div className="genre-top-row stat-link" key={s} title="Voir la série" onClick={e => { e.stopPropagation(); go({ view: "series", query: s }); }}><span>{s}</span><b>{n}</b></div>)}
                {e.topEd && <div className="genre-ed">🏢 {e.topEd[0]} ({e.topEd[1]})</div>}
              </div>
            ); })}
          </div>
        </div>
        {genre.deduced > 0 && <p className="genre-note">ℹ️ {genre.deduced} album(s) classé(s) par déduction (éditeur, titre, autres tomes de la série) ; sans indice, un album compte comme franco-belge. Confirme-les avec 🧭 Ranger ou le champ Format de la fiche.</p>}
      </div>
      <div className="stats-charts">
        <div className="stats-block chart-block"><h3>📗 Répartition</h3><Donut onPick={go} segments={[{ label: "Possédés", value: stats.jai, color: "#3ddc97", go: { view: "biblio" } }, { label: "Souhaités", value: stats.veux, color: "var(--accent)", go: { view: "wishlist" } }]} /></div>
        <div className="stats-block chart-block"><h3>🧩 Séries</h3><Donut onPick={go} segments={[{ label: "Complètes", value: stats.completes, color: "#3ddc97", go: { view: "series" } }, { label: "À compléter", value: stats.entamees, color: "#ffa726", go: { view: "trous" } }]} /></div>
      </div>
      <div className="stats-block"><h3>🏢 Top éditeurs</h3>
        {stats.topEds.map(([e, n]) => <div className="bar-row stat-link" key={e} title="Voir les albums de cet éditeur" onClick={() => go({ view: "biblio", filters: { editeur: e } })}><span className="bar-label">{e}</span><div className="bar-track"><div className="bar-fill" style={{ width: Math.round(n / stats.maxEd * 100) + "%" }} /></div><span className="bar-val">{n}</span></div>)}
      </div>
    </div>
  );
}
