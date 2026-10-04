// Couche d'abstraction scan code-barre.
// AUJOURD'HUI : web (BarcodeDetector natif Chrome, fallback ZXing via CDN).
// DEMAIN (Capacitor) : remplacer detectFromVideo par le plugin natif ML Kit
//   (@capacitor-mlkit/barcode-scanning) sans toucher au composant Scanner.jsx.
import { cleanIsbn } from "./store.js";

// EAN livre valide = 13 chiffres commençant par 978 ou 979 (ignore les codes prix 4xxx…)
export function isValidBookEAN(code) {
  const c = cleanIsbn(code);
  return c.length === 13 && (c.startsWith("978") || c.startsWith("979"));
}

let zxingLoaded = false;
export function loadZXing() {
  return new Promise((resolve, reject) => {
    if (zxingLoaded && window.ZXing) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
    s.onload = () => { zxingLoaded = true; resolve(); };
    s.onerror = () => reject(new Error("zxing load failed"));
    document.head.appendChild(s);
  });
}

// Détecte la capacité native (Capacitor ML Kit branché plus tard ici)
export function hasNativeScanner() {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

// Fabrique un détecteur : renvoie { start(video, onCode, onStatus), stop() }
export function createScanEngine() {
  let mode = null, detector = null, zxingReader = null, timer = null, stream = null;

  async function start(video, onCode, onStatus) {
    // 1) caméra
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = stream; await video.play();
    } catch (e) { onStatus("Caméra inaccessible. Saisis l'ISBN manuellement."); throw e; }

    // 2) BarcodeDetector natif (Chrome)
    if ("BarcodeDetector" in window) {
      try { detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a"] }); } catch { detector = null; }
    }
    if (detector) {
      mode = "native";
      onStatus("Vise le code-barre au dos de la BD… (détecteur natif)");
      timer = setInterval(async () => {
        try {
          const codes = await detector.detect(video);
          if (codes && codes.length) {
            let raw = "";
            for (const cd of codes) { const c = cleanIsbn(cd.rawValue); if (isValidBookEAN(c)) { raw = c; break; } }
            if (raw) { stop(); onCode(raw); }
            else onStatus("Code détecté mais non-livre — vise le code ISBN (978…)");
          }
        } catch {}
      }, 400);
      return mode;
    }

    // 3) fallback ZXing (Edge, etc.)
    onStatus("Chargement du lecteur de code-barre…");
    try { await loadZXing(); }
    catch { onStatus("⚠️ Lecteur indisponible (hors-ligne ?). Saisis l'ISBN manuellement."); throw new Error("no detector"); }
    const hints = new Map();
    const formats = [window.ZXing.BarcodeFormat.EAN_13, window.ZXing.BarcodeFormat.EAN_8, window.ZXing.BarcodeFormat.UPC_A];
    hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
    zxingReader = new window.ZXing.BrowserMultiFormatReader(hints);
    mode = "zxing";
    onStatus("Vise le code-barre au dos de la BD… (lecteur ZXing)");
    zxingReader.decodeFromVideoDevice(null, video, (result) => {
      if (result) { const raw = cleanIsbn(result.getText()); if (isValidBookEAN(raw)) { stop(); onCode(raw); } }
    });
    return mode;
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (zxingReader) { try { zxingReader.reset(); } catch {} zxingReader = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    detector = null;
  }

  return { start, stop, getMode: () => mode };
}
