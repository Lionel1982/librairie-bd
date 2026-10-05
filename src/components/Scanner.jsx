import React, { useRef, useState, useEffect } from "react";
import { createScanEngine, isValidBookEAN } from "../lib/scanner.js";
import { lookupByISBN, lookupByISBNRemote } from "../lib/api.js";
import { catalogLookup, catalogUpsert } from "../lib/db.js";
import { cleanIsbn, lookupInCatalog, getScanDirect, setScanDirect } from "../lib/store.js";

// attend au plus `ms` millisecondes (une source lente ne bloque plus tout le lot)
const withTimeout = (p, ms) => Promise.race([Promise.resolve(p).catch(() => null), new Promise(r => setTimeout(() => r(null), ms))]);

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
  const [direct, setDirect] = useState(getScanDirect()); // ajout direct à la collection ?
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
      let info = lookupInCatalog(refCatalog, isbn) || {};   // 1) catalogue BDGest perso (instantané)
      let fromWeb = false;
      if (!info.titre) { const r = await withTimeout(lookupByISBNRemote(isbn), 12000); if (r && r.titre) { info = r; fromWeb = true; } else if (r && r.cover && !info.cover) info = { ...info, cover: r.cover }; } // 2) serveur (BnF…)
      if (!info.titre) { const sh = await withTimeout(catalogLookup(isbn), 5000); if (sh && sh.titre) info = { ...sh, cover: sh.cover || info.cover || "" }; } // 3) catalogue commun
      if (!info.titre) { const web = await withTimeout(lookupByISBN(isbn), 10000); if (web && web.titre) { info = web; fromWeb = true; } } // 4) dernier secours
      // alimente / corrige le catalogue COMMUN pour tout le monde
      if (fromWeb && info.titre) { await withTimeout(catalogUpsert(isbn, { ...info, source: info.source || "scan" }), 5000); }
      books.push({
        statut: direct ? "jai" : "a-confirmer", note: 0, commentaire: direct ? "Scanné" : "Scanné (à confirmer)",
        titre: info.titre || ("ISBN " + isbn), serie: info.serie || "", tome: (info.tome === undefined || info.tome === null) ? "" : info.tome,
        auteur: info.auteur || "", editeur: info.editeur || "", annee: info.annee || "",
        pages: info.pages || "", format: info.format || "",
        isbn: info.isbn || isbn, cover: info.cover || "", _coverOk: false, // vérifiée/complétée après ajout
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

        <label className="scan-direct">
          <input type="checkbox" checked={direct} onChange={e => { setDirect(e.target.checked); setScanDirect(e.target.checked); }} />
          <span>Ajouter directement à ma collection <small>(sinon « à trier »)</small></span>
        </label>

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
        <p className="scanner-hint">Scanne plusieurs BD à la suite, puis « Ajouter ». {direct ? "Elles vont directement dans ta collection." : "Elles arrivent dans 🔥 Trier."} Seuls les ISBN livre (978/979) sont acceptés.</p>
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
