import React, { useState } from "react";
export default function Cover({ src, title }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <div className="cover-fallback"><span className="big">📕</span><span className="t">{title}</span></div>;
  return <img src={src} alt={title} loading="lazy" draggable="false" onError={() => setErr(true)} />;
}
