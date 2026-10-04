import React, { useState, useEffect } from "react";
export default function Cover({ src, title }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [src]);   // nouvelle URL = nouvel essai
  if (!src || err) return <div className="cover-fallback"><span className="big">📕</span><span className="t">{title}</span></div>;
  return <img key={src} src={src} alt={title} loading="lazy" draggable="false" onError={() => setErr(true)} />;
}
