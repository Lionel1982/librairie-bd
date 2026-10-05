import React, { useMemo } from "react";
import Cover from "./Cover.jsx";
import { STATUS_LABELS, amazonUrl, sortBooks } from "../lib/store.js";

export default function LibraryGrid({ books, query, onOpen, wishlist, sort = "recent", emptyText }) {
  const list = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    let out = books.filter(b => !q || [b.titre, b.serie, b.auteur, b.editeur].join(" ").toLowerCase().includes(q));
    return sortBooks(out, sort);
  }, [books, query, sort]);

  if (!books.length) return <div className="pending-hint">{emptyText || (wishlist ? "💜 Ta liste de souhaits est vide." : "Ta bibliothèque est vide.")}</div>;
  if (!list.length) return <p style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-dim)", padding: 40 }}>Aucun résultat.</p>;

  return list.map((b, i) => {
    const stars = b.note ? "★".repeat(b.note) + "☆".repeat(5 - b.note) : "";
    const badge = (b.statut === "jai" || b.statut === "lu") ? null : <span className={"status-badge status-" + b.statut}>{STATUS_LABELS[b.statut]}</span>;
    return (
      <div className="card" key={b.id} style={{ animationDelay: Math.min(i * 30, 400) + "ms" }} onClick={() => onOpen(b.id)}>
        <div className="card-cover"><Cover src={b.cover} title={b.titre} isbn={b.isbn} />{badge}</div>
        <div className="card-body">
          {b.serie && <div className="card-serie">{b.serie}{b.tome ? " · T." + b.tome : ""}</div>}
          <div className="card-title">{b.titre}</div>
          <div className="card-meta">{b.auteur}{b.annee ? " · " + b.annee : ""}</div>
          {stars && <div className="card-rating">{stars}</div>}
          {wishlist && <button className="btn btn-ghost" style={{ marginTop: 8, width: "100%" }} onClick={(e) => { e.stopPropagation(); window.open(amazonUrl(b), "_blank"); }}>🛒 Acheter</button>}
        </div>
      </div>
    );
  });
}
