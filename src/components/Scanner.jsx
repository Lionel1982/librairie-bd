import React, { useRef, useState, useEffect } from "react";
import { createScanEngine, isValidBookEAN } from "../lib/scanner.js";
import { lookupByISBN, lookupByISBNRemote } from "../lib/api.js";
import { cleanIsbn, isbnVariants, lookupInCatalog } from "../lib/store.js";

// Scanner code-barre — mode "scan en lot puis complétion".
// On accumule les ISBN scannés (fluide, pas de lookup pendant le scan),
// puis on complète les infos en lot à la validation.
export default function Scanner({ onAddMany, refCatalog = [], onClose }) {
  const videoRef = useRef(null);
  const engineRef = useRef(null);
  const [status, setStatus] = useState("Initialisation de la caméra…");
  const [queue, setQueue] = useState([]);      // liste d'ISBN scannés (uniques)
  const [manual, setManual] = useState("");
  const [working, setWorking] = useState(false); // lookup en cours
  const [progress, setProgress] = useState("");
  const queueRef = useRef([]);
  const lastBeepRef = useRef(0);

  useEffect(() => {
    const engine = createScanEngine();
    engineRef.current = engine;
    let alive = true;
    engine.start(videoRef.current, onCode, (s) => alive && setStatus(s)).catch(() => {});
    return () => { engine.stop(); };
  }, []); // eslint-disable-line

  function onCode(rawIsbn) {
    const isbn = cleanIsbn(rawIsbn);
    if (!isValidBookEAN(isbn)) return;
    // anti-rebond : ignore si déjà dans la file ou scanné il y a < 1,5s
    const now = Date.now();
    if (now - lastBeepRef.current < 1500) return;
    if (queueRef.current.includes(isbn)) { setStatus("Déjà scanné : " + isbn); return; }
    lastBeepRef.current = now;
    queueRef.current = [...queueRef.current, isbn];
    setQueue(queueRef.current.slice());
    setStatus("✅ " + isbn + " ajouté à la liste. Vise le suivant…");
    try { navigator.vibrate && navigator.vibrate(60); } catch {}
  }

  function addManual() {
    const isbn = cleanIsbn(manual);
    if (!isValidBookEAN(isbn) && isbn.length !== 10) { setStatus("⚠️ ISBN invalide (978…/979… ou ISBN-10)"); return; }
    if (queueRef.current.includes(isbn)) { setStatus("Déjà dans la liste."); setManual(""); return; }
    queueRef.current = [...queueRef.current, isbn];
    setQueue(queueRef.current.slice());
    setManual("");
  }

  function removeFromQueue(isbn) {
    queueRef.current = queueRef.current.filter(x => x !== isbn);
    setQueue(queueRef.current.slice());
  }

  // Complétion en lot : lookup chaque ISBN, construit les livres, renvoie à App
  async function finishAndComplete() {
    if (!queueRef.current.length) { onClose(); return; }
    setWorking(true);
    try { engineRef.current.stop(); } catch {}
    const list = queueRef.current.slice();
    const books = [];
    for (let i = 0; i < list.length; i++) {
      const isbn = list[i];
      setProgress("Complétion " + (i + 1) + "/" + list.length + " — " + isbn + "…");
      let info = lookupInCatalog(refCatalog, isbn) || {};   // 1) catalogue BDGest local (instantané, BD FR)
      if (!info.titre) { try { const r = await lookupByISBNRemote(isbn); if (r && r.titre) info = r; else if (r && r.cover && !info.cover) info = { ...info, cover: r.cover }; } catch {} } // 2) /api/isbn (serveur multi-sources, BD FR)
      if (!info.titre) { try { const web = await lookupByISBN(isbn); if (web && web.titre) info = web; } catch {} } // 3) API client direct (dernier secours)
      const variants = isbnVariants(isbn);
      const cover = info.cover || (variants[0] ? "https://covers.openlibrary.org/b/isbn/" + (variants.find(v => v.length === 13) || variants[0]) + "-L.jpg" : "");
      books.push({
        statut: "a-confirmer", note: 0, commentaire: "Scanné (à confirmer)",
        titre: info.titre || ("ISBN " + isbn), serie: "", tome: "",
        auteur: info.auteur || "", editeur: info.editeur || "", annee: info.annee || "",
        isbn: info.isbn || isbn, cover, _coverOk: !!cover,
      });
    }
    onAddMany(books);   // App gère l'insert Supabase + dédoublonnage + toast
  }

  return (
    <div className="scanner-overlay">
      <div className="scanner-top">
        <span className="scanner-title">📷 Scanner</span>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>

      {!working ? (<>
        <div className="scanner-video-wrap">
          <video ref={videoRef} className="scanner-video" playsInline muted />
          <div className="scanner-reticle" />
        </div>
        <div className="scanner-status">{status}</div>

        <div className="scanner-manual">
          <input type="text" inputMode="numeric" placeholder="…ou tape l'ISBN (978…)"
            value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => e.key === "Enter" && addManual()} />
          <button className="btn btn-ghost" onClick={addManual}>+ Ajouter</button>
        </div>

        {queue.length > 0 && (
          <div className="scan-queue">
            <div className="scan-queue-head">{queue.length} code(s) scanné(s)</div>
            <div className="scan-queue-list">
              {queue.map(isbn => (
                <span className="scan-chip" key={isbn}>{isbn}<button onClick={() => removeFromQueue(isbn)}>✕</button></span>
              ))}
            </div>
          </div>
        )}

        <div className="scanner-actions">
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary scanner-finish" disabled={!queue.length} onClick={finishAndComplete}>
            ✓ Ajouter les {queue.length || ""}
          </button>
        </div>
        <p className="scanner-hint">Scanne plusieurs BD à la suite, puis « Ajouter ». Elles arrivent en « à confirmer » (🔥 Trier). Seuls les ISBN livre (978/979) sont acceptés.</p>
      </>) : (
        <div className="scanner-working">
          <div className="scanner-spinner">⏳</div>
          <div className="scanner-progress">{progress}</div>
          <p className="scanner-hint">Récupération des titres et couvertures…</p>
        </div>
      )}
    </div>
  );
}
