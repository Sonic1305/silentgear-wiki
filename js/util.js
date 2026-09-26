// Small DOM / formatting helpers shared by all views.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Strip Minecraft § formatting codes
export function plain(s) {
  return String(s ?? "").replace(/§./g, "");
}

export function fmt(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  if (typeof n !== "number") return esc(n);
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return r.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function pct(n, digits = 0) {
  return `${n > 0 ? "+" : ""}${fmt(n * 100, digits)}%`;
}

export function signed(n, digits = 2) {
  return `${n > 0 ? "+" : ""}${fmt(n, digits)}`;
}

export function idPath(id) {
  return String(id).split(":").pop();
}

export function titleCase(s) {
  return String(s).replace(/[_/]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// "#FFB8945F" (ARGB) -> "#b8945f"
export function cssColor(argb) {
  if (!argb) return "#888";
  const h = argb.replace("#", "");
  return "#" + (h.length === 8 ? h.slice(2) : h);
}

export function hexToRgb(argb) {
  const h = cssColor(argb).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content;
}

export function debounce(fn, ms = 120) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const store = {
  get(key, def) {
    try { const v = localStorage.getItem("sgwiki:" + key); return v === null ? def : JSON.parse(v); } catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem("sgwiki:" + key, JSON.stringify(val)); } catch { /* ignore */ }
  },
};
