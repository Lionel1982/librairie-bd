import React from "react";
import SmartThumb from "./SmartThumb.jsx";

// Couverture d'une carte : image enregistrée, sinon meilleure source serveur, sinon placeholder.
export default function Cover({ src, title, isbn }) {
  const fallback = <div className="cover-fallback"><span className="big">📕</span><span className="t">{title}</span></div>;
  return <SmartThumb cover={src} isbn={isbn} alt={title} preferServer={false} fallback={fallback} />;
}
