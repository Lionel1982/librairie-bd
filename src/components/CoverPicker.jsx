import React, { useState, useEffect } from "react";
import { useBackClose } from "../lib/backButton.js";
import { cleanIsbn, isbnVariants } from "../lib/store.js";
import { validateImage, fetchCover } from "../lib/api.js";

// Sélecteur de couvertures multi-sources. Propose plusieurs images candidates
// (BnF via /api/cover, Open Library L/M, Google Books, Wikimedia Commons par titre).
// Clic sur une vignette = sélection -> onPick(url).
export default function CoverPicker({ isbn, titre, serie, onPick, onClose }) {
  useBackClose(true, onClose);   // bouton « précédent » = fermer
  const [cands, setCands] = useState([]);   // {url, ok}
  const [status, setStatus] = useState("Recherche de couvertures…");
  const [manual, setManual] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const urls = new Set();
      const ic = cleanIsbn(isbn || "");
      const variants = ic ? isbnVariants(ic) : [];
      // Open Library (toutes variantes, L et M)
      variants.forEach(v => {
        urls.add("https://covers.openlibrary.org/b/isbn/" + v + "-L.jpg?default=false");
        urls.add("https://covers.openlibrary.org/b/isbn/" + v + "-M.jpg?default=false");
      });
      // Google Books (thumbnail via API) — on tente une URL d'image directe
      if (variants[0]) {
        urls.add("https://books.google.com/books/content?vid=ISBN" + variants[0] + "&printsec=frontcover&img=1&zoom=1");
        urls.add("https://books.google.com/books/content?vid=ISBN" + variants[0] + "&printsec=frontcover&img=1&zoom=2");
      }
      // Candidate list initiale (validation en parallèle)
      const list = [...urls];
      const checked = await Promise.all(list.map(async u => ({ url: u, ok: await validateImage(u) })));
      let valid = checked.filter(c => c.ok);
      // + couverture serveur /api/cover (BnF prioritaire) si dispo
      try { const c = await fetchCover(ic); if (c && !valid.some(v => v.url === c)) { if (await validateImage(c)) valid.unshift({ url: c, ok: true }); } } catch {}
      if (!alive) return;
      // dédoublonnage par URL nettoyée
      const seen = new Set(); const dedup = [];
      valid.forEach(c => { const k = c.url.replace("?default=false",""); if (!seen.has(k)) { seen.add(k); dedup.push({ url: k }); } });
      setCands(dedup);
      setStatus(dedup.length ? dedup.length + " couverture(s) trouvée(s) — choisis-en une." : "Aucune couverture trouvée automatiquement. Colle une URL ci-dessous.");
    })();
    return () => { alive = false; };
  }, [isbn, titre, serie]);

  function useManual() {
    const u = manual.trim();
    if (u) onPick(u);
  }

  return (
    <div className="modal-overlay" onClick={e => e.target.classList.contains("modal-overlay") && onClose()} style={{ zIndex: 3000 }}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-header"><h2>🖼️ Choisir une couverture</h2><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body" style={{ overflowY: "auto" }}>
          <div className="cover-picker-status">{status}</div>
          <div className="cover-picker-grid">
            {cands.map((c, i) => (
              <button className="cover-cand" key={i} onClick={() => onPick(c.url)} title="Choisir cette couverture">
                <img src={c.url} alt="" loading="lazy" onError={e => { e.target.closest(".cover-cand").style.display = "none"; }} />
              </button>
            ))}
          </div>
          <div className="cover-picker-manual">
            <label>Ou colle une URL d'image</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" value={manual} onChange={e => setManual(e.target.value)} placeholder="https://…" />
              <button className="btn btn-primary" onClick={useManual}>Utiliser</button>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <div className="footer-right" style={{ width: "100%", justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
