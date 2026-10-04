import React, { useState, useRef, useEffect } from "react";

// Petit menu déroulant réutilisable (se ferme au clic extérieur ou Échap).
// `trigger` : contenu du bouton. `children` reçoit une fonction `close` pour fermer après action.
export default function Menu({ trigger, className = "", align = "left", children, buttonClass = "btn btn-ghost" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className={"hdr-menu " + className} ref={wrapRef}>
      <button className={buttonClass} onClick={() => setOpen(o => !o)}>{trigger}</button>
      {open && (
        <div className={"hdr-menu-panel " + (align === "right" ? "align-right" : "align-left")}>
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}
