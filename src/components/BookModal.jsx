import React, { useState, useMemo } from "react";
import { useBackClose } from "../lib/backButton.js";
import { OWNED, STATUS_LABELS, amazonUrl, cleanIsbn, extractTome, buildSeriesList } from "../lib/store.js";
import SerieInput from "./SerieInput.jsx";
import { lookupByISBN, lookupByISBNRemote, searchCandidates } from "../lib/api.js";
import CoverPicker from "./CoverPicker.jsx";

const EMPTY = { titre: "", serie: "", tome: "", auteur: "", editeur: "", annee: "", isbn: "", statut: "jai", note: 0, commentaire: "", cover: "", pages: "", format: "" };

export default function BookModal({ id, books, refCatalog, onSave, onDelete, onClose }) {
  useBackClose(true, onClose);   // bouton « précédent » = fermer
  const editing = id ? books.find(b => b.id === id) : null;
  const [f, setF] = useState(editing ? { ...EMPTY, ...editing } : EMPTY);
  const [sugg, setSugg] = useState([]);   // propositions par champ
  const [msg, setMsg] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const seriesList = useMemo(() => buildSeriesList(books, id), [books, id]);

  async function reconcile() {
    setMsg("🔎 Recherche…");
    const isbn = cleanIsbn(f.isbn);
    if (isbn.length === 10 || isbn.length === 13) {
      let info = await lookupByISBNRemote(isbn);
      if (!info || !info.titre) { try { const web = await lookupByISBN(isbn); if (web && web.titre) info = web; else info = info || web || {}; } catch { info = info || {}; } }
      info = info || {};
      const props = [];
      ["titre","serie","tome","auteur","editeur","annee","pages","format","cover"].forEach(k => { if (info[k] && String(info[k]) !== String(f[k])) props.push({ field: k, value: info[k] }); });
      setSugg(props); setMsg(props.length ? props.length + " proposition(s) (ISBN)" : "✅ Rien à changer"); return;
    }
    const known = f.tome !== "" ? Number(f.tome) : "";
    const q = [f.serie || f.titre, known !== "" ? "tome " + known : "", f.auteur].filter(Boolean).join(" ");
    const cands = await searchCandidates(q, 12, refCatalog);
    let c = null;
    if (known !== "") c = cands.find(x => extractTome(x.titre + " " + (x.sousTitre || "")) === known) || cands.find(x => extractTome(x.titre + " " + (x.sousTitre || "")) === "");
    else c = cands[0];
    if (!c) { setMsg("⚠️ Aucune correspondance au tome " + known); setSugg([]); return; }
    const props = [];
    const titreProp = c.titre + (c.sousTitre ? " — " + c.sousTitre : "");
    [["titre", titreProp], ["auteur", c.auteur], ["editeur", c.editeur], ["annee", c.annee], ["cover", c.cover], ["isbn", c.isbn]].forEach(([k, v]) => { if (v && String(v) !== String(f[k])) props.push({ field: k, value: v }); });
    setSugg(props); setMsg(props.length ? props.length + " proposition(s)" : "✅ Rien à changer");
  }
  function applyProp(p) { set(p.field, p.value); setSugg(s => s.filter(x => x !== p)); }
  function applyAll() { sugg.forEach(p => set(p.field, p.value)); setSugg([]); }

  function save() {
    const hasTitre = f.titre && f.titre.trim();
    const hasIsbn = String(f.isbn || "").replace(/[^0-9Xx]/g, "").length >= 10;
    if (!hasTitre && !hasIsbn) { setMsg("⚠️ Titre OU ISBN obligatoire"); return; }
    const data = { ...f, tome: f.tome !== "" ? Number(f.tome) : "", annee: f.annee !== "" ? Number(f.annee) : "", note: Number(f.note) || 0, pages: (f.pages !== "" && f.pages != null) ? Number(f.pages) : "" };
    onSave(data, id || null);
  }

  const propFor = (field) => sugg.find(p => p.field === field);
  // fonction de rendu (PAS un composant) : sinon React recrée l'input à chaque frappe et le focus saute
  const renderField = ({ label, k, type = "text", span }) => {
    const p = propFor(k);
    return (
      <div key={k} className={"form-field" + (span ? " span-2" : "")}>
        <label>{label}</label>
        <input type={type} value={f[k]} onChange={e => set(k, e.target.value)} />
        {p && <div className="field-suggest"><span className="fs-label">Proposé :</span>{k === "cover" ? <img className="fs-cover" src={p.value} alt="" /> : <span className="fs-value">{String(p.value)}</span>}<span className="fs-actions"><button className="fs-apply" onClick={() => applyProp(p)}>✓</button><button className="fs-skip" onClick={() => setSugg(s => s.filter(x => x !== p))}>✕</button></span></div>}
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={e => e.target.classList.contains("modal-overlay") && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2>{id ? "Modifier la BD" : "Ajouter une BD"}</h2><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          {msg && <div className="reconcile-bar"><span>{msg}</span>{sugg.length > 0 && <button className="btn btn-primary" onClick={applyAll}>✓ Tout appliquer</button>}</div>}
          <div className="cover-upload">
            <div className="cover-preview cover-preview-click" title="Changer la couverture" onClick={() => setPickerOpen(true)}>{f.cover ? <img src={f.cover} alt="" /> : <span className="cover-placeholder">🖼️<br />Choisir</span>}<span className="cover-edit-badge">🖼️ Changer</span></div>
            <div className="cover-inputs"><label>Couverture (URL)</label><input type="text" value={f.cover} onChange={e => set("cover", e.target.value)} placeholder="https://..." /></div>
          </div>
          <div className="form-grid">
            {renderField({ label: "Titre *", k: "titre", span: true })}
            {renderField({ label: "ISBN", k: "isbn" })}
            <div className="form-field"><label>Série</label>
              <SerieInput value={f.serie} onChange={v => set("serie", v)} seriesList={seriesList} tome={f.tome} />
              {propFor("serie") && <div className="field-suggest"><span className="fs-label">Proposé :</span><span className="fs-value">{String(propFor("serie").value)}</span><span className="fs-actions"><button className="fs-apply" onClick={() => applyProp(propFor("serie"))}>✓</button><button className="fs-skip" onClick={() => setSugg(s => s.filter(x => x.field !== "serie"))}>✕</button></span></div>}
            </div>
            {renderField({ label: "Tome", k: "tome", type: "number" })}
            {renderField({ label: "Auteur", k: "auteur" })}
            {renderField({ label: "Éditeur", k: "editeur" })}
            {renderField({ label: "Année", k: "annee", type: "number" })}
            {renderField({ label: "Pages", k: "pages", type: "number" })}
            <div className="form-field"><label>Format</label>
              <select value={f.format || ""} onChange={e => set("format", e.target.value)}>
                <option value="">Auto (déduit)</option><option value="bd">Franco-belge</option><option value="manga">Manga</option><option value="comics">Comics</option>
              </select>
            </div>
            <div className="form-field"><label>Statut</label>
              <select value={f.statut} onChange={e => set("statut", e.target.value)}>{Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </div>
            <div className="form-field span-2"><label>Note</label>
              <div className="rating-input">{[1,2,3,4,5].map(n => <span key={n} className={n <= f.note ? "on" : ""} onClick={() => set("note", n === f.note ? 0 : n)}>★</span>)}</div>
            </div>
            <div className="form-field span-2"><label>Notes</label><textarea rows="2" value={f.commentaire} onChange={e => set("commentaire", e.target.value)} /></div>
          </div>
        </div>
        <div className="modal-footer modal-footer-col">
          <button className="btn btn-primary modal-save-top" onClick={save}>💾 Enregistrer</button>
          <div className="footer-secondary">
            <button className="btn btn-ghost" onClick={reconcile}>🔎 Compléter les infos</button>
            {id && !OWNED.includes(f.statut) && <button className="btn btn-ghost" onClick={() => window.open(amazonUrl(f), "_blank")}>🛒 Amazon</button>}
            <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
            {id && <button className="btn btn-danger" onClick={() => onDelete(id)}>🗑️ Supprimer</button>}
          </div>
        </div>
      </div>
      {pickerOpen && (
        <CoverPicker isbn={f.isbn} titre={f.titre} serie={f.serie}
          onPick={(url) => { set("cover", url); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}
