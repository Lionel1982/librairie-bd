import React, { useState, useMemo } from "react";
import { useBackClose } from "../lib/backButton.js";
import SerieInput from "./SerieInput.jsx";
import { buildSeriesList } from "../lib/store.js";

// Petite fenêtre « changer de série » ouverte depuis la vue Séries.
export default function QuickSerieModal({ book, books, onSave, onOpenFull, onClose }) {
  useBackClose(true, onClose);   // bouton « précédent » = fermer
  const [serie, setSerie] = useState(book.serie || "");
  const [tome, setTome] = useState(book.tome === "" || book.tome == null ? "" : String(book.tome));
  const seriesList = useMemo(() => buildSeriesList(books, book.id), [books, book.id]);
  function save() { onSave(book.id, { serie: serie.trim(), tome: tome === "" ? "" : Number(tome) }); }
  return (
    <div className="modal-overlay" style={{ zIndex: 2500 }} onClick={e => e.target.classList.contains("modal-overlay") && onClose()}>
      <div className="modal quick-serie">
        <div className="modal-header"><h2>🗂️ Changer de série</h2><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="qs-book">{book.titre}</div>
          <div className="qs-row">
            <div className="form-field qs-serie"><label>Série</label>
              <SerieInput value={serie} onChange={setSerie} seriesList={seriesList} tome={tome} autoFocus />
            </div>
            <div className="form-field qs-tome"><label>Tome</label>
              <input type="number" value={tome} onChange={e => setTome(e.target.value)} onKeyDown={e => e.key === "Enter" && save()} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => onOpenFull(book.id)}>✏️ Fiche complète</button>
          <div className="footer-right">
            <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" onClick={save}>✓ Enregistrer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
