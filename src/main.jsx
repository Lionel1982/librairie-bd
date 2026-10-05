import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { applyTheme, getTheme } from "./lib/theme.js";

applyTheme(getTheme());   // couleurs choisies, avant le 1er affichage

createRoot(document.getElementById("root")).render(<App />);

// Enregistrement du service worker (PWA — installable sur mobile)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((r) => r.update()).catch((e) => console.warn("SW:", e));
  });
}
