// Thèmes de couleurs (enregistrés par appareil). Les valeurs sont dans styles.css ([data-theme=…]).
export const THEMES = [
  { key: "sunset", label: "🌅 Sunset", desc: "Corail et mangue", bg: "#0f1d22", swatch: ["#ff6f59", "#ffb454", "#0f1d22"] },
  { key: "lagon", label: "🌴 Lagon", desc: "Turquoise et citron vert", bg: "#0a1c21", swatch: ["#14b8a6", "#a3e635", "#0a1c21"] },
  { key: "pasteque", label: "🍉 Pastèque", desc: "Melon, pêche et menthe", bg: "#17131a", swatch: ["#f25c78", "#ff9f6b", "#6fd59a"] },
];
const KEY = "bdlib-theme";
export function getTheme() {
  try { const k = localStorage.getItem(KEY); return THEMES.some(t => t.key === k) ? k : "sunset"; } catch { return "sunset"; }
}
export function applyTheme(k) {
  const t = THEMES.find(x => x.key === k) || THEMES[0];
  document.documentElement.setAttribute("data-theme", t.key);
  try { localStorage.setItem(KEY, t.key); } catch {}
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t.bg);
}
