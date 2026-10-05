import React, { useState, useEffect, useMemo } from "react";
import { coverThumbUrl } from "../lib/store.js";

export default function SmartThumb({ isbn, cover, alt = "", className, fallback = null, preferServer = true, onResolved }) {
  const srcs = useMemo(() => {
    const api = isbn ? coverThumbUrl(isbn) : "";
    const list = preferServer ? [api, cover] : [cover, api];
    return list.filter((u, i, a) => u && a.indexOf(u) === i);
  }, [isbn, cover, preferServer]);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [srcs]);
  if (idx >= srcs.length) return fallback;
  const url = srcs[idx];
  return (
    <img key={url} src={url} alt={alt} className={className} loading="lazy" draggable="false"
      onLoad={e => { const im = e.currentTarget; if (im.naturalWidth <= 2 || im.naturalHeight <= 2) { setIdx(i => i + 1); return; } if (onResolved) onResolved(url); }}
      onError={() => setIdx(i => i + 1)} />
  );
}
