// Bouton « précédent » du téléphone / navigateur : ferme la fenêtre ouverte (la plus récente)
// au lieu de quitter l'app. Une seule entrée d'historique est utilisée tant qu'une fenêtre est ouverte.
import { useEffect, useRef } from "react";

const stack = [];        // fenêtres ouvertes, la dernière = celle du dessus
let armed = false;       // une entrée d'historique « fenêtre » est en place
let ignore = 0;          // retours déclenchés par le code (à ne pas traiter)

function sync() {
  if (stack.length && !armed) {
    try { window.history.pushState({ bdlibModal: true }, ""); armed = true; } catch {}
  } else if (!stack.length && armed) {
    armed = false; ignore++;
    try { window.history.back(); } catch { ignore--; }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (ignore > 0) { ignore--; return; }
    if (!armed) return;                       // aucune fenêtre : comportement normal
    armed = false;
    const top = stack[stack.length - 1];
    if (top) top.close();
    setTimeout(sync, 0);                      // s'il reste une fenêtre ouverte, on se réarme
  });
}

export function useBackClose(open, onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const entry = { close: () => { if (ref.current) ref.current(); } };
    stack.push(entry); sync();
    return () => {
      const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1);
      setTimeout(sync, 0);                    // différé : laisse une autre fenêtre s'ouvrir à la place
    };
  }, [open]);
}
