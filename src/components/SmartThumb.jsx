import React, { useState, useEffect, useMemo } from "react";
import { coverThumbUrl } from "../lib/store.js";

// Image de couverture robuste : essaie les sources dans l'ordre, passe à la suivante
// si l'image est cassée ou vide (1x1), et affiche `fallback` si aucune ne marche.
// preferServer=true  : meilleure source serveur (BnF…) d'abord — pour les listes de résultats.
// preferServer=false : couverture enregistrée d'abord, serveur en secours — pour la collection.
export default function SmartThumb({ isbn, cover, alt = "", className, fallback = null, preferServer = true }) {
  const srcs = useMemo(() => {
    const api = isbn ? coverThumbUrl(isbn) : "";
    const list = preferServer ? [api, cover] : [cover, api];
    return list.filter((u, i, a) => u && a.indexOf(u) === i);
  }, [isbn, cover, preferServer]);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [srcs]);
  if (idx >= srcs.length) return fallback;
  return (
    <img key={srcs[idx]} src={srcs[idx]} alt={alt} className={className} loading="lazy" draggable="false"
      onLoad={e => { const im = e.currentTarget; if (im.naturalWidth <= 2 || im.naturalHeight <= 2) setIdx(i => i + 1); }}
      onError={() => setIdx(i => i + 1)} />
  );
}
