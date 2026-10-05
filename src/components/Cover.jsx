import React from "react";
import SmartThumb from "./SmartThumb.jsx";

export default function Cover({ src, title, isbn, onResolved }) {
  const fallback = <div className="cover-fallback"><span className="big">📕</span><span className="t">{title}</span></div>;
  return <SmartThumb cover={src} isbn={isbn} alt={title} preferServer={false} fallback={fallback} onResolved={onResolved} />;
}
