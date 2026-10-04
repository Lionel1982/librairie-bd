import React, { useRef, useState, useEffect } from "react";
import { createScanEngine, isValidBookEAN } from "../lib/scanner.js";
import { lookupByISBN, } from "../lib/api.js";
import { cleanIsbn, uid } from "../lib/store.js";

// Scanner code-barre (web BarcodeDetector/ZXing ; natif ML Kit plus tard via lib/scanner.js)
export default function Scanner({ onAdd, onClose }) {
  const videoRef = useRef(null);
  const engineRef = useRef(null);
  const [status, setStatus] = useState("Initialisation de la caméra…");
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastAdded, setLastAdded] = useState(null);

  useEffect(() => {
    const engine = createScanEngine();
    engineRef.current = engine;
    let alive = true;
    engine.start(videoRef.current, onCode, (s) => alive && setStatus(s)).catch(() => {});
    return () => { engine.stop(); };
  }, []); // eslint-disable-line

  async function onCode(rawIsbn) {
    if (busy) return;
    setBusy(true);
    setStatus("📖 Code " + rawIsbn + " détecté — recherche…");
    await addByIsbn(rawIsbn);
    setBusy(false);
    // relance le scan pour enchaîner (multi-ajout)
    setStatus("✅ Ajouté ! Vise un autre code-barre…");
    try { engineRef.current.start(videoRef.current, onCode, setStatus); } catch {}
  }

  async function addByIsbn(rawIsbn) {
    const isbn = cleanIsbn(rawIsbn);
    let info = {};
    try { info = await lookupByISBN(isbn); } catch {}
    const book = {
      id: uid(), createdAt: Date.now(), statut: "a-confirmer", note: 0,
      commentaire: "Scanné (à confirmer)",
      titre: info.titre || ("ISBN " + isbn), serie: "", tome: "",
      auteur: info.auteur || "", editeur: info.editeur || "", annee: info.annee || "",
      isbn: info.isbn || isbn, cover: info.cover || "", _coverOk: !!info.cover,
    };
    onAdd(book);
    setLastAdded(book);
  }

  async function submitManual() {
    const isbn = cleanIsbn(manual);
    if (!isValidBookEAN(isbn) && isbn.length !== 10) { setStatus("⚠️ ISBN invalide (attendu : 978… / 979… ou ISBN-10)"); return; }
    setBusy(true); setStatus("🔎 Recherche…");
    await addByIsbn(isbn);
    setManual(""); setBusy(false); setStatus("✅ Ajouté via saisie manuelle.");
  }

  return (
    <div className="scanner-overlay">
      <div className="scanner-top">
        <span className="scanner-title">📷 Scanner un code-barre</span>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>

      <div className="scanner-video-wrap">
        <video ref={videoRef} className="scanner-video" playsInline muted />
        <div className="scanner-reticle" />
      </div>

      <div className="scanner-status">{status}</div>

      {lastAdded && (
        <div className="scanner-last">
          Dernier ajout : <b>{lastAdded.titre}</b>{lastAdded.isbn ? " (ISBN " + lastAdded.isbn + ")" : ""} — à trier dans 🔥
        </div>
      )}

      <div className="scanner-manual">
        <input type="text" inputMode="numeric" placeholder="Ou tape l'ISBN à la main (978…)"
          value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => e.key === "Enter" && submitManual()} />
        <button className="btn btn-primary" onClick={submitManual} disabled={busy}>Ajouter</button>
      </div>

      <p className="scanner-hint">Les albums scannés arrivent en « à confirmer » — tu les tries ensuite dans 🔥 Trier.</p>
    </div>
  );
}
