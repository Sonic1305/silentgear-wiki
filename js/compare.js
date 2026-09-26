// Side-by-side material comparison and per-stat ranking.
import { $, $$, esc, fmt, idPath, store, debounce } from "./util.js";
import { db, PART_TYPES, STATS, statName, statValue, partTypeName, harvestTier, traitName } from "./db.js";
import { matLink, traitChip, opShort } from "./app.js";

const state = store.get("compare", { mats: ["silentgear:iron", "silentgear:diamond", "silentgear:crimson_steel"], pt: "silentgear:main", rankStat: "durability", rankPt: "silentgear:main", rankN: 25, obtainable: true });

function matOptions(selected, pt) {
  return Object.values(db.materials)
    .filter(m => !pt || (m.props[pt] && Object.keys(m.props[pt]).length))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(m => `<option value="${esc(m.id)}" ${m.id === selected ? "selected" : ""}>${esc(m.name)}${m.obtainable ? "" : " (n/a)"}</option>`).join("");
}

export function viewCompare(app, params) {
  if (params.get("m")) {
    const m = params.get("m");
    if (!state.mats.includes(m)) state.mats = [m, ...state.mats].slice(0, 6);
  }
  app.innerHTML = `
    <h1>Compare &amp; Ranking</h1>
    <div class="tabs" id="cmp-tabs"><button data-t="cmp" class="on">Side by side</button><button data-t="rank">Ranking</button></div>
    <div id="cmp-body"></div>`;
  const tabs = $$("#cmp-tabs button");
  const show = t => {
    tabs.forEach(b => b.classList.toggle("on", b.dataset.t === t));
    t === "cmp" ? renderCompare() : renderRanking();
  };
  tabs.forEach(b => b.addEventListener("click", () => show(b.dataset.t)));
  show(params.get("tab") === "rank" ? "rank" : "cmp");
}

function renderCompare() {
  const body = $("#cmp-body");
  const pt = state.pt;
  const mats = state.mats.filter(id => db.materials[id]);
  const statKeys = STATS.filter(s => mats.some(id => db.materials[id].props[pt]?.[s] !== undefined));
  const extraKeys = [...new Set(mats.flatMap(id => Object.keys(db.materials[id].props[pt] || {}).filter(k => k.includes("/"))))].sort();
  const allKeys = [...statKeys, ...extraKeys];
  body.innerHTML = `
    <div class="toolbar">
      <label class="muted">Part type <select id="c-pt">${PART_TYPES.map(p => `<option value="silentgear:${p}" ${pt === "silentgear:" + p ? "selected" : ""}>${esc(partTypeName(p))}</option>`).join("")}</select></label>
      <select id="c-add"><option value="">+ Add material</option>${matOptions("", pt)}</select>
      <button id="c-clear">Clear</button>
    </div>
    ${mats.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Stat</th>${mats.map((id, i) => `<th>${matLink(id)} <button class="icon-btn" data-rm="${i}" title="Remove">×</button></th>`).join("")}</tr></thead>
      <tbody>
        <tr><td>Harvest Tier</td>${mats.map(id => { const ht = harvestTier(db.materials[id].props[pt]); return `<td>${ht ? `${esc(ht.label)} (${ht.level ?? "?"})` : '<span class="muted">–</span>'}</td>`; }).join("")}</tr>
        ${allKeys.map(s => {
          const vals = mats.map(id => statValue(db.materials[id].props[pt]?.[s]));
          const nums = vals.filter(Boolean).map(v => v.value);
          const max = Math.max(...nums), min = Math.min(...nums);
          const lowerBetter = false;
          return `<tr><td>${esc(statName(s))}</td>${vals.map(v => {
            if (!v) return '<td class="muted">–</td>';
            const cls = nums.length > 1 && max !== min ? (v.value === (lowerBetter ? min : max) ? "best" : v.value === (lowerBetter ? max : min) ? "worst" : "") : "";
            return `<td class="num ${cls}">${fmt(v.value)}${v.op !== "AVERAGE" ? `<span class="op">${opShort(v.op)}</span>` : ""}</td>`;
          }).join("")}</tr>`;
        }).join("")}
        <tr><td>Traits</td>${mats.map(id => `<td class="traits">${(db.materials[id].props[pt]?.traits || []).map(t => traitChip(t)).join("") || '<span class="muted">–</span>'}</td>`).join("")}</tr>
      </tbody></table></div>
      <p class="muted small">Green = highest, red = lowest in the row. For a few stats (e.g. negative attack speed) higher is not always better.</p>` : '<p class="muted">Add some materials to compare.</p>'}`;
  const save = () => { store.set("compare", state); renderCompare(); };
  $("#c-pt").addEventListener("change", e => { state.pt = e.target.value; save(); });
  $("#c-add").addEventListener("change", e => { if (e.target.value && !state.mats.includes(e.target.value)) state.mats.push(e.target.value); save(); });
  $("#c-clear").addEventListener("click", () => { state.mats = []; save(); });
  $$("[data-rm]", body).forEach(b => b.addEventListener("click", () => { state.mats.splice(+b.dataset.rm, 1); save(); }));
}

function renderRanking() {
  const body = $("#cmp-body");
  const pt = state.rankPt;
  const statsHere = STATS.filter(s => Object.values(db.materials).some(m => statValue(m.props[pt]?.[s])));
  const keys = [...statsHere, "harvest_tier", "trait_count"];
  if (!keys.includes(state.rankStat)) state.rankStat = keys[0];
  const s = state.rankStat;
  const valueOf = m => {
    if (s === "harvest_tier") return harvestTier(m.props[pt])?.level ?? null;
    if (s === "trait_count") return (m.props[pt]?.traits || []).length || null;
    return statValue(m.props[pt]?.[s])?.value ?? null;
  };
  const rows = Object.values(db.materials)
    .filter(m => !state.obtainable || m.obtainable)
    .map(m => [m, valueOf(m)]).filter(([, v]) => v !== null)
    .sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name))
    .slice(0, state.rankN);
  const max = Math.max(...rows.map(r => Math.abs(r[1])), 1e-9);
  const label = s === "harvest_tier" ? "Harvest Tier (level)" : s === "trait_count" ? "Number of traits" : statName(s);
  body.innerHTML = `
    <div class="toolbar">
      <label class="muted">Part type <select id="r-pt">${PART_TYPES.map(p => `<option value="silentgear:${p}" ${pt === "silentgear:" + p ? "selected" : ""}>${esc(partTypeName(p))}</option>`).join("")}</select></label>
      <label class="muted">Stat <select id="r-stat">${keys.map(k => `<option value="${k}" ${k === s ? "selected" : ""}>${esc(k === "harvest_tier" ? "Harvest Tier" : k === "trait_count" ? "Number of traits" : statName(k))}</option>`).join("")}</select></label>
      <label class="muted">Show <select id="r-n">${[10, 25, 50, 200].map(n => `<option ${n === state.rankN ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="chk"><input type="checkbox" id="r-obt" ${state.obtainable ? "checked" : ""}> Only obtainable</label>
    </div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th class="num">#</th><th>Material</th><th class="num">${esc(label)}</th><th style="width:30%"></th><th>Traits (${esc(partTypeName(pt))})</th></tr></thead>
      <tbody>${rows.map(([m, v], i) => {
        const sv = statValue(m.props[pt]?.[s]);
        return `<tr><td class="num muted">${i + 1}</td><td>${matLink(m.id)}</td>
        <td class="num">${s === "harvest_tier" ? esc(harvestTier(m.props[pt]).label) + " (" + v + ")" : fmt(v)}${sv && sv.op !== "AVERAGE" ? `<span class="op">${opShort(sv.op)}</span>` : ""}</td>
        <td><div class="bar"><i style="width:${Math.max(2, Math.abs(v) / max * 100)}%;${v < 0 ? "background:var(--bad)" : ""}"></i></div></td>
        <td class="traits">${(m.props[pt]?.traits || []).map(t => traitChip(t)).join("")}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  const save = () => { store.set("compare", state); renderRanking(); };
  $("#r-pt").addEventListener("change", e => { state.rankPt = e.target.value; save(); });
  $("#r-stat").addEventListener("change", e => { state.rankStat = e.target.value; save(); });
  $("#r-n").addEventListener("change", e => { state.rankN = +e.target.value; save(); });
  $("#r-obt").addEventListener("change", e => { state.obtainable = e.target.checked; save(); });
}
