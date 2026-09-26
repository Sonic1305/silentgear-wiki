// Gear builder: pick a gear type and one material per part, see computed stats & traits.
import { $, $$, esc, fmt, store, cssColor } from "./util.js";
import { db, partTypeName, statName, traitName } from "./db.js";
import { matLink, itemChip } from "./app.js";
import { gearInfo, gearName, GROUPS } from "./gear.js";
import { GEAR_DEFS, WEAPON_ROLES, isGearType } from "./geardefs.js";
import { calculate, DISPLAY_STATS, usableIn, GRADES } from "./calc.js";
import { renderGearIcon } from "./render.js";

// materials needed per non-main part (blueprint recipes)
const PART_MAT_COUNT = { rod: 2, tip: 1, grip: 1, binding: 1, coating: 1, lining: 1, cord: 3, fletching: 1, setting: 1 };
const DEFAULTS = { rod: "silentgear:wood", cord: "silentgear:string", fletching: "silentgear:feather", setting: "silentgear:diamond", binding: "silentgear:string" };

let state = migrate(store.get("builder2", null)) || { gear: "sword", parts: {}, obtainable: true, grade: "NONE", wear: 0, upgrades: [] };

function migrate(s) {
  if (!s || typeof s !== "object") return null;
  s.upgrades ||= []; s.grade ||= "NONE"; s.wear ||= 0;
  return s;
}

function mainCount(gear) {
  return gearInfo()["silentgear:" + gear]?.materialCount || 1;
}

function defaultParts(gear) {
  const d = GEAR_DEFS[gear];
  const parts = {};
  const pick = (pt, pref) => {
    const cand = [pref, "silentgear:iron", "silentgear:wood", "silentgear:leather", "silentgear:fine_silk_cloth"].filter(Boolean);
    const ok = m => db.materials[m] && usableIn(m, pt, gear).ok && (pt !== "main" || mainRuleOk(db.materials[m], gear));
    return cand.find(ok) || Object.keys(db.materials).find(ok);
  };
  for (const pt of d.required) {
    const mat = pick(pt, pt === "main" ? "silentgear:iron" : DEFAULTS[pt]);
    if (mat) parts[pt] = { mat, count: pt === "main" ? mainCount(gear) : PART_MAT_COUNT[pt] || 1 };
  }
  return parts;
}

function upgradesFor(gear) {
  return Object.values(db.parts).filter(p => p.type === "silentgear:upgrade").filter(p => {
    const u = p.raw?.upgrade_gear_types || {};
    return (u.types || []).some(t => u.match_parents ? isGearType(gear, t) : t.replace("silentgear:", "") === gear);
  });
}

function candidates(pt, val, gear) {
  return Object.values(db.materials)
    .filter(m => (usableIn(m.id, pt, gear).ok && (!state.obtainable || m.obtainable)) || m.id === val)
    .filter(m => pt !== "main" || mainRuleOk(m, gear))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function matIconHtml(m) {
  const first = m.ingredient.items[0] || Object.values(m.substitutes)[0]?.items[0];
  const it = first && db.items[first];
  return it?.icon ? `<img class="ic sm" src="icons/${esc(it.icon)}.png" alt="">`
    : `<span class="ic sm" style="display:inline-block;border-radius:3px;background:${cssColor(m.color)}"></span>`;
}

function pickerButton(pt, val) {
  const m = val && db.materials[val];
  return `<button type="button" class="picker-btn" data-picker="${pt}" aria-haspopup="listbox">
    ${m ? `${matIconHtml(m)}<span>${esc(m.name)}${m.categories.includes("casting") ? " ⛏" : ""}</span>` : '<span class="muted">– none –</span>'}
    <span class="caret">▾</span></button>
    <div class="picker" data-picker-panel="${pt}" hidden></div>`;
}

// recipe category filters on the main part (e.g. curios need metal, elytra cloth/sheet)
function mainRuleOk(m, gear) {
  const gi = gearInfo()["silentgear:" + gear];
  const rules = [gi?.materialRule, ...(gi?.casting || []).map(c => c.material)].filter(Boolean);
  if (!rules.length) return true;
  return rules.some(r => (!r.categories?.length || r.categories.some(c => m.categories.includes(c))) && !(r.not_categories || []).some(c => m.categories.includes(c)));
}

export function viewBuilder(app, params) {
  if (params.get("gear") && GEAR_DEFS[params.get("gear")]) {
    state.gear = params.get("gear");
    state.parts = defaultParts(state.gear);
    state.upgrades = [];
  }
  if (params.get("b")) {
    try { Object.assign(state, JSON.parse(decodeURIComponent(escape(atob(params.get("b")))))); } catch { /* ignore bad link */ }
  }
  if (!GEAR_DEFS[state.gear]) state.gear = "sword";
  if (!state.parts?.main) state.parts = defaultParts(state.gear);
  if (params.get("main") && db.materials[params.get("main")]) {
    const m = params.get("main");
    const gear = usableIn(m, "main", state.gear).ok && mainRuleOk(db.materials[m], state.gear) ? state.gear
      : Object.keys(GEAR_DEFS).find(g => usableIn(m, "main", g).ok && mainRuleOk(db.materials[m], g)) || state.gear;
    if (gear !== state.gear) { state.gear = gear; state.parts = defaultParts(gear); state.upgrades = []; }
    state.parts.main = { mat: m, count: mainCount(gear) };
  }
  render(app);
}

function render(app) {
  const gear = state.gear;
  const d = GEAR_DEFS[gear];
  const gi = gearInfo()["silentgear:" + gear];
  const slots = [...d.required, ...d.optional];
  const ups = upgradesFor(gear);
  app.innerHTML = `
    <h1>Gear Builder</h1>
    <p class="muted">Pick a gear type and one material per part (in Silent Gear 4.2 all materials inside one part have to be the same). Mixing only works through alloys. ⛏ = in this pack, this material is <b>cast</b> in the foundry.</p>
    <div class="builder">
      <div>
        <div class="slot">
          <div class="slot-head"><b>Gear type</b></div>
          <select id="b-gear" style="width:100%">${GROUPS.map(([t, list]) => `<optgroup label="${esc(t)}">${list.filter(g => GEAR_DEFS[g]).map(g => `<option value="${g}" ${g === gear ? "selected" : ""}>${esc(gearName(g))}</option>`).join("")}</optgroup>`).join("")}</select>
          ${WEAPON_ROLES[gear] ? `<p class="role small" style="margin:6px 0 0">${esc(WEAPON_ROLES[gear].text)}</p>` : ""}
          ${d.notes && !WEAPON_ROLES[gear] ? `<p class="muted small" style="margin:6px 0 0">${esc(d.notes)}</p>` : ""}
          <label class="chk" style="margin-top:8px"><input type="checkbox" id="b-obt" ${state.obtainable ? "checked" : ""}> Only materials obtainable in this pack</label>
        </div>
        ${slots.map(pt => {
          const required = d.required.includes(pt);
          const cur = state.parts[pt];
          const m = cur && db.materials[cur.mat];
          const sub = pt !== "main" && m?.substitutes?.["silentgear:" + pt];
          const title = pt === "main" ? (db.items[gi?.mainPart]?.name || "Main part") : partTypeName(pt);
          const n = pt === "main" ? mainCount(gear) : PART_MAT_COUNT[pt] || 1;
          return `<div class="slot">
            <div class="slot-head"><b>${esc(title)}</b><span class="req">${required ? "required" : "optional"}, ${cur?.count ?? n}× material</span></div>
            <div class="mat-pick">${pickerButton(pt, cur?.mat || "")}</div>
            ${sub && sub.items.length ? `<label class="chk" style="margin-top:6px"><input type="checkbox" data-sub="${pt}" ${cur.count === 1 ? "checked" : ""}> Use ${esc(db.items[sub.items[0]]?.name || sub.label)} instead (counts as 1 material)</label>` : ""}
            ${pt !== "main" && cur ? `<div class="contrib small" data-contrib="${pt}"></div>` : ""}
          </div>`;
        }).join("")}
        ${ups.length ? `<div class="slot"><div class="slot-head"><b>Upgrades</b></div>
          ${ups.map(u => `<label class="chk" style="display:flex;margin:3px 0"><input type="checkbox" data-up="${esc(u.id)}" ${state.upgrades.includes(u.id) ? "checked" : ""}> ${esc(u.name)}</label>${state.upgrades.includes(u.id) ? `<div class="contrib small" data-contrib="up:${esc(u.id)}"></div>` : ""}`).join("")}</div>` : ""}
        <div class="slot">
          <div class="slot-head"><b>Extras</b></div>
          <label class="muted small" style="display:flex;align-items:center;gap:8px">Material grade
            <select id="b-grade">${Object.keys(GRADES).map(g => `<option ${g === state.grade ? "selected" : ""}>${g}</option>`).join("")}</select>
            <span>(+${GRADES[state.grade]}% on graded stats)</span></label>
          <label class="muted small" style="display:flex;align-items:center;gap:8px;margin-top:8px">Wear
            <input type="range" id="b-wear" min="0" max="100" value="${Math.round(state.wear * 100)}" style="flex:1"> <span id="b-wear-v">${Math.round(state.wear * 100)}%</span></label>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="b-reset">Reset</button>
          <button id="b-share" class="primary">Copy share link</button>
          <span id="b-msg" class="muted small" style="align-self:center"></span>
        </div>
      </div>
      <div id="b-out"></div>
    </div>`;

  $("#b-gear").addEventListener("change", e => { state.gear = e.target.value; state.parts = defaultParts(state.gear); state.upgrades = []; save(app); });
  $("#b-obt").addEventListener("change", e => { state.obtainable = e.target.checked; save(app); });
  $("#b-reset").addEventListener("click", () => { state.parts = defaultParts(state.gear); state.upgrades = []; state.grade = "NONE"; state.wear = 0; save(app); });
  $("#b-grade").addEventListener("change", e => { state.grade = e.target.value; save(app); });
  $("#b-wear").addEventListener("input", e => { state.wear = e.target.value / 100; $("#b-wear-v").textContent = e.target.value + "%"; store.set("builder2", state); renderOut(); });
  $("#b-share").addEventListener("click", async () => {
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ gear: state.gear, parts: state.parts, grade: state.grade, upgrades: state.upgrades }))));
    const url = `${location.origin}${location.pathname}#/builder?b=${encodeURIComponent(payload)}`;
    try { await navigator.clipboard.writeText(url); $("#b-msg").textContent = "Link copied!"; } catch { prompt("Copy this link:", url); }
  });
  $$("[data-picker]", app).forEach(btn => btn.addEventListener("click", () => openPicker(app, btn.dataset.picker)));
  $$("input[data-sub]", app).forEach(cb => cb.addEventListener("change", () => {
    const pt = cb.dataset.sub;
    state.parts[pt].count = cb.checked ? 1 : PART_MAT_COUNT[pt] || 1;
    save(app);
  }));
  $$("input[data-up]", app).forEach(cb => cb.addEventListener("change", () => {
    state.upgrades = cb.checked ? [...state.upgrades, cb.dataset.up] : state.upgrades.filter(u => u !== cb.dataset.up);
    save(app);
  }));
  renderOut();
}

function save(app) {
  store.set("builder2", state);
  render(app);
}

function renderOut() {
  const gear = state.gear;
  const res = calculate(gear, state.parts, { grade: state.grade, wear: state.wear, upgrades: state.upgrades });
  const out = $("#b-out");
  const iconParts = Object.fromEntries(Object.entries(state.parts).map(([k, v]) => [k, v.mat]));
  if (state.parts.coating) iconParts.main = state.parts.coating.mat;
  const statRows = DISPLAY_STATS(gear).filter(s => res.stats[s] !== undefined && !(["block_reach", "attack_reach"].includes(s) && !res.stats[s]));
  out.innerHTML = `
    <div class="card">
      <div class="hero" style="margin:0">
        <canvas class="gear" id="b-icon"></canvas>
        <div>
          <h2 style="margin:0">${esc(res.name || gearName(gear))}</h2>
          <div class="meta">
            ${res.tier ? `<span class="chip">Harvest tier: ${esc(res.tier.label)} (${res.tier.level ?? "?"})</span>` : ""}
          </div>
        </div>
      </div>
      ${res.errors.length ? `<div class="note">${res.errors.map(esc).join("<br>")}</div>` : ""}
    </div>
    <div class="cols" style="margin-top:14px">
      <div class="card">
        <h3>Stats</h3>
        ${statRows.map(s => {
          const v = res.stats[s], b = res.base[s];
          const diff = Math.abs(v - b) > 1e-6 ? ` <span class="muted small">(${fmt(b, 2)} + trait bonus)</span>` : "";
          return `<div class="stat-row"><span>${esc(statName(s))}</span><span class="v">${fmtStat(s, v)}${diff}</span></div>`;
        }).join("") || '<p class="muted">This gear type has no stats (traits only).</p>'}
        ${res.derived.length ? `<h3 style="margin-top:14px">In game</h3>${res.derived.map(([k, v]) => `<div class="stat-row"><span>${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join("")}` : ""}
      </div>
      <div class="card">
        <h3>Traits</h3>
        ${res.traits.length ? res.traits.map(t => `<div class="effect"><a href="#/trait/${esc(t.trait)}"><b>${esc(traitName(t.trait))}</b></a> <span class="chip"><span class="lvl">${t.level}</span>&nbsp;/ ${db.traits[t.trait]?.maxLevel ?? "?"}</span>
          <div class="muted small">${esc(db.traits[t.trait]?.desc || "")}</div>
          ${t.from?.length ? `<div class="small muted">from ${t.from.map(esc).join(", ")}</div>` : ""}</div>`).join("") : '<p class="muted">No traits.</p>'}
        ${res.droppedTraits.length ? `<p class="small muted">Not active (condition not met): ${res.droppedTraits.map(t => `<a href="#/trait/${esc(t.trait)}">${esc(traitName(t.trait))}</a> (${esc(t.why)})`).join(", ")}</p>` : ""}
        <p class="small muted">Trait level = sum of levels ÷ min(half the number of trait entries on the gear, entries of this trait). A gear with only one trait gets its level doubled.</p>
      </div>
    </div>
    ${breakdownCard(gear, statRows)}
    <div class="card" style="margin-top:14px">
      <h3>How to craft it</h3>
      ${craftSteps(gear)}
    </div>
    ${res.notes.length ? `<p class="muted small" style="margin-top:10px">${res.notes.map(esc).join("<br>")}</p>` : ""}
    <p class="muted small">Formulas ported from the Silent Gear 4.2.1 source. Starcharged materials and alloys (whose stats depend on the mix) aren't simulated.</p>`;
  renderGearIcon($("#b-icon"), gear, iconParts);
}

// ---------- per-part contribution ("waterfall": add parts one at a time) ----------
function breakdown(gear) {
  const d = GEAR_DEFS[gear];
  const order = ["main", ...d.required.filter(p => p !== "main"), ...d.optional].filter(pt => state.parts[pt]);
  const opts = { grade: state.grade, wear: state.wear };
  const steps = [];
  const parts = {};
  const ups = [];
  const add = (key, label, optional) => {
    const res = calculate(gear, parts, { ...opts, upgrades: [...ups] });
    steps.push({ key, label, optional, res });
  };
  for (const pt of order) {
    parts[pt] = state.parts[pt];
    const m = db.materials[state.parts[pt].mat];
    const title = pt === "main" ? (db.items[gearInfo()["silentgear:" + gear]?.mainPart]?.name || "Main") : partTypeName(pt);
    add(pt, `${title}<div class="muted small">${esc(m?.name || "")}</div>`, !d.required.includes(pt));
  }
  for (const u of state.upgrades) {
    ups.push(u);
    add("up:" + u, esc(db.parts[u]?.name || u), true);
  }
  return steps;
}

function maxDur(res) {
  const v = res.derived.find(x => x[0].startsWith("Max durability"))?.[1];
  return v === undefined ? undefined : Number(String(v).replace(/,/g, ""));
}

function traitDiff(prev, cur) {
  const a = new Map((prev?.traits || []).map(t => [t.trait, t.level]));
  const b = new Map(cur.traits.map(t => [t.trait, t.level]));
  const out = [];
  for (const [t, l] of b) {
    if (!a.has(t)) out.push(`<span class="role">+${esc(traitName(t))} ${l}</span>`);
    else if (a.get(t) !== l) out.push(`<span class="${l > a.get(t) ? "good" : "bad"}">${esc(traitName(t))} ${a.get(t)}→${l}</span>`);
  }
  for (const [t, l] of a) if (!b.has(t)) out.push(`<span class="bad">−${esc(traitName(t))} ${l}</span>`);
  return out;
}

function fmtDelta(s, dv) {
  if (Math.abs(dv) < 0.005) return "";
  const txt = fmtStat(s, Math.abs(dv));
  return `<span class="${dv > 0 ? "good" : "bad"}">${dv > 0 ? "+" : "−"}${txt}</span>`;
}

function breakdownCard(gear, statRows) {
  const steps = breakdown(gear);
  if (steps.length < 2) return "";
  const rows = [...statRows.map(s => [s, statName(s), r => r.stats[s]]), ["_dur", "Max durability (uses)", maxDur]]
    .filter(([, , get]) => steps.some(st => get(st.res) !== undefined));
  const cells = [];
  for (const [s, label, get] of rows) {
    const vals = steps.map(st => get(st.res));
    if (vals.every(v => !v)) continue;
    const fs = s === "_dur" ? "durability" : s;
    cells.push(`<tr><td>${esc(label)}</td>
      <td class="num">${vals[0] === undefined ? "" : fmtStat(fs, vals[0])}</td>
      ${steps.slice(1).map((st, i) => `<td class="num">${fmtDelta(fs, (vals[i + 1] ?? 0) - (vals[i] ?? 0)) || ""}</td>`).join("")}
      <td class="num"><b>${vals.at(-1) === undefined ? "" : fmtStat(fs, vals.at(-1))}</b></td></tr>`);
  }
  // one row per trait, same layout as the stat rows: level after the first part, change per part, final level
  const lvl = (res, t) => res.traits.find(x => x.trait === t)?.level;
  const traitIds = [];
  for (const st of steps) for (const t of st.res.traits) if (!traitIds.includes(t.trait)) traitIds.push(t.trait);
  const traitCell = (a, b) => {
    if (a === b) return "";
    if (a === undefined) return `<span class="role" title="new trait">+${b} new</span>`;
    if (b === undefined) return `<span class="bad" title="trait lost">gone</span>`;
    return `<span class="${b > a ? "good" : "bad"}">${b > a ? "+" : "−"}${Math.abs(b - a)}</span>`;
  };
  const traitRows = traitIds.length ? `<tr class="section"><td colspan="${steps.length + 2}">Traits (level)</td></tr>` + traitIds.map(t => {
    const lv = steps.map(st => lvl(st.res, t));
    const max = db.traits[t]?.maxLevel;
    return `<tr><td><a href="#/trait/${esc(t)}">${esc(traitName(t))}</a></td>
      <td class="num">${lv[0] ?? '<span class="muted">–</span>'}</td>
      ${steps.slice(1).map((st, i) => `<td class="num">${traitCell(lv[i], lv[i + 1])}</td>`).join("")}
      <td class="num"><b>${lv.at(-1) ?? '<span class="muted">–</span>'}</b>${lv.at(-1) && max ? `<span class="muted small"> / ${max}</span>` : ""}</td></tr>`;
  }).join("") : "";
  // one-line summaries under the slots on the left
  for (let i = 1; i < steps.length; i++) {
    const st = steps[i], prev = steps[i - 1];
    const hasDurRow = rows.some(([s]) => s === "durability" || s === "armor_durability");
    const bits = rows.filter(([s]) => !(s === "_dur" && hasDurRow)).map(([s, label, get]) => {
      const fs = s === "_dur" ? "durability" : s;
      const dtxt = fmtDelta(fs, (get(st.res) ?? 0) - (get(prev.res) ?? 0));
      return dtxt ? `${dtxt} ${esc(s === "_dur" ? "uses" : label)}` : "";
    }).filter(Boolean);
    bits.push(...traitDiff(prev.res, st.res));
    queueMicrotask(() => {
      const el = document.querySelector(`[data-contrib="${CSS.escape(st.key)}"]`);
      if (el) el.innerHTML = bits.length ? `Adds: ${bits.join(", ")}` : '<span class="muted">No effect on stats or traits for this gear.</span>';
    });
  }
  return `<div class="card" style="margin-top:14px">
    <h3>What each part adds</h3>
    <p class="muted small">Parts are added one at a time, left to right: first column is the main part alone, each next column is the change from adding that part, the last column is the result. The columns add up to the total. Because Silent Gear averages and multiplies values, a part's effect can depend on the parts before it. Trait levels also shift when a part brings new traits, since the level formula depends on the total number of trait entries.</p>
    <div class="table-wrap"><table class="data breakdown">
      <thead><tr><th>Stat</th><th class="num">${steps[0].label}</th>${steps.slice(1).map(st => `<th class="num">+ ${st.label}${st.optional ? "" : ' <span class="muted small">(req.)</span>'}</th>`).join("")}<th class="num">Total</th></tr></thead>
      <tbody>${cells.join("")}${traitRows}</tbody>
    </table></div>
  </div>`;
}

function fmtStat(s, v) {
  if (typeof v !== "number") return esc(String(v));
  if (["durability", "armor_durability", "enchantment_value", "rarity"].includes(s)) return fmt(v, 0);
  if (["repair_efficiency", "repair_value", "projectile_accuracy"].includes(s)) return fmt(v * 100, 0) + "%";
  if (["ranged_damage", "draw_speed", "projectile_speed", "armor_durability"].includes(s)) return fmt(v, 2) + "×";
  return fmt(v, 2);
}

function craftSteps(gear) {
  const gi = gearInfo()["silentgear:" + gear];
  const steps = [];
  for (const [pt, p] of Object.entries(state.parts)) {
    const m = db.materials[p.mat];
    if (!m) continue;
    const partItem = pt === "main" ? gi?.mainPart : "silentgear:" + pt;
    const sub = pt !== "main" && p.count === 1 && m.substitutes?.["silentgear:" + pt];
    let how;
    if (sub?.items?.length) how = `Just use ${itemChip(sub.items[0])} directly as the ${esc(partTypeName(pt))}.`;
    else if (m.categories.includes("casting")) {
      const castRec = Object.values(db.recipes).find(r => r.type === "sgearmetalworks:sg_gear_casting" && r.result === partItem);
      how = castRec ? `Cast in the Productive Metalworks foundry: ${castRec.materialCount}× molten ${esc(m.name)} into ${itemChip(castRec.cast)}.`
        : `<span style="color:var(--bad)">${esc(m.name)} is a casting material, but there is no cast for this part.</span>`;
    } else {
      const extra = pt === "coating" ? " + Glass Bottle" : pt === "setting" ? " + Bort (jeweler tools)" : "";
      how = `Blueprint + ${p.count}× ${esc(m.name)}${extra} in a crafting grid.`;
    }
    steps.push(`<li><b>${esc(pt === "main" ? (db.items[partItem]?.name || "Main part") : partTypeName(pt))}</b>: ${matLink(p.mat)}<div class="small muted">${how}</div></li>`);
  }
  steps.push(`<li>Put the ${esc(db.items[gi?.mainPart]?.name || "main part")} and the required parts in a crafting grid. Optional parts can be added later by crafting the gear together with the part.</li>`);
  if (state.upgrades.length) steps.push(`<li>Apply upgrades: ${state.upgrades.map(u => esc(db.parts[u]?.name || u)).join(", ")}.</li>`);
  return `<ol style="margin:0;padding-left:20px">${steps.join("")}</ol>`;
}

// ---------- material picker with effect preview ----------
const SHORT = {
  durability: "Dur", armor_durability: "Armor Dur", repair_efficiency: "Repair", enchantment_value: "Ench", rarity: "Rarity",
  harvest_speed: "Mining", block_reach: "Block Reach", attack_damage: "Dmg", attack_speed: "Speed", attack_reach: "Reach",
  magic_damage: "Magic", ranged_damage: "Ranged", draw_speed: "Draw", projectile_speed: "Proj Speed",
  projectile_accuracy: "Accuracy", armor: "Armor", armor_toughness: "Tough", knockback_resistance: "KB Res", magic_armor: "Magic Armor",
};
let pickerSort = "name";

function effectRows(pt) {
  const gear = state.gear;
  const d = GEAR_DEFS[gear];
  const optional = !d.required.includes(pt);
  const opts = { grade: state.grade, wear: state.wear, upgrades: state.upgrades };
  const without = { ...state.parts };
  delete without[pt];
  // optional parts: compare against "no part"; required parts: against the current choice
  const ref = calculate(gear, optional ? without : state.parts, opts);
  const stats = DISPLAY_STATS(gear);
  const cur = state.parts[pt];
  const rows = candidates(pt, cur?.mat, gear).map(m => {
    const count = pt === "main" ? mainCount(gear) : (cur?.mat === m.id ? cur.count : PART_MAT_COUNT[pt] || 1);
    const res = calculate(gear, { ...without, [pt]: { mat: m.id, count } }, opts);
    const deltas = {};
    for (const st of stats) {
      const dv = (res.stats[st] ?? 0) - (ref.stats[st] ?? 0);
      if (Math.abs(dv) >= 0.005) deltas[st] = dv;
    }
    const tierChange = res.tier && ref.tier && res.tier.level !== ref.tier.level ? res.tier : null;
    return { m, res, deltas, tierChange, traits: traitDiff(ref, res), total: res.stats };
  });
  return { rows, optional, stats };
}

function openPicker(app, pt) {
  const panel = $(`[data-picker-panel="${pt}"]`, app);
  const wasOpen = !panel.hidden;
  $$("[data-picker-panel]", app).forEach(p => { p.hidden = true; p.innerHTML = ""; });
  if (wasOpen) return;
  const { rows, optional, stats } = effectRows(pt);
  const cur = state.parts[pt]?.mat || "";
  if (!stats.includes(pickerSort)) pickerSort = "name";
  panel.hidden = false;
  panel.innerHTML = `
    <div class="picker-bar">
      <input type="search" placeholder="Search name or trait" aria-label="Search materials">
      <select aria-label="Sort by"><option value="name">Sort: name</option>${stats.map(st => `<option value="${st}" ${pickerSort === st ? "selected" : ""}>Sort: ${esc(statName(st))}</option>`).join("")}</select>
    </div>
    <p class="muted small" style="margin:4px 2px 6px">${optional ? "Shows what each material adds to the gear." : "Shows the change compared to your current choice."}</p>
    <div class="picker-list" role="listbox"></div>`;
  const list = $(".picker-list", panel);
  const search = $("input", panel);
  const sortSel = $("select", panel);
  let sel = 0;
  const visible = () => {
    const q = search.value.trim().toLowerCase();
    let shown = rows.filter(r => !q || r.m.name.toLowerCase().includes(q) || r.traits.join(" ").toLowerCase().includes(q)
      || (r.res.traits || []).some(t => traitName(t.trait).toLowerCase().includes(q)));
    if (pickerSort !== "name") shown = shown.slice().sort((a, b) => (b.total[pickerSort] ?? -1e9) - (a.total[pickerSort] ?? -1e9) || a.m.name.localeCompare(b.m.name));
    return [...(optional && !q ? [{ none: true }] : []), ...shown];
  };
  const draw = () => {
    const items = visible();
    sel = Math.max(0, Math.min(sel, items.length - 1));
    list.innerHTML = items.map((r, i) => r.none
      ? `<div class="picker-row${!cur ? " cur" : ""}${i === sel ? " sel" : ""}" role="option" data-val=""><span class="muted">– none –</span></div>`
      : `<div class="picker-row${r.m.id === cur ? " cur" : ""}${i === sel ? " sel" : ""}" role="option" data-val="${esc(r.m.id)}">
        <div class="picker-name">${matIconHtml(r.m)}<b>${esc(r.m.name)}</b>${r.m.categories.includes("casting") ? ' <span class="muted" title="cast in the foundry">⛏</span>' : ""}${r.m.id === cur ? ' <span class="chip cat">current</span>' : ""}</div>
        <div class="picker-fx small">${fxHtml(r) || '<span class="muted">no change</span>'}</div>
      </div>`).join("") || '<p class="muted small" style="padding:6px">No matches.</p>';
    $$(".picker-row", list).forEach(row => row.addEventListener("click", () => choose(row.dataset.val)));
    $(".picker-row.sel", list)?.scrollIntoView({ block: "nearest" });
  };
  const close = () => { panel.hidden = true; panel.innerHTML = ""; document.removeEventListener("click", outside); };
  const outside = e => {
    if (!e.target.closest(`[data-picker-panel="${pt}"]`) && !e.target.closest(`[data-picker="${pt}"]`)) close();
  };
  const choose = val => {
    document.removeEventListener("click", outside);
    if (!val) delete state.parts[pt];
    else state.parts[pt] = { mat: val, count: pt === "main" ? mainCount(state.gear) : PART_MAT_COUNT[pt] || 1 };
    save(app);
  };
  search.addEventListener("input", () => { sel = 0; draw(); });
  sortSel.addEventListener("change", () => { pickerSort = sortSel.value; sel = 0; draw(); });
  search.addEventListener("keydown", e => {
    const n = $$(".picker-row", list).length;
    if (e.key === "ArrowDown") { sel = Math.min(sel + 1, n - 1); draw(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === "Enter") { const row = $$(".picker-row", list)[sel]; if (row) choose(row.dataset.val); }
    else if (e.key === "Escape") close();
  });
  const idx = visible().findIndex(r => (r.none ? "" : r.m.id) === cur);
  sel = idx >= 0 ? idx : 0;
  draw();
  search.focus({ preventScroll: true });
  setTimeout(() => document.addEventListener("click", outside));
}

function fxHtml(r) {
  const bits = Object.entries(r.deltas).map(([st, dv]) =>
    `<span class="${dv > 0 ? "good" : "bad"}">${dv > 0 ? "+" : "−"}${fmtStat(st, Math.abs(dv))} ${esc(SHORT[st] || statName(st))}</span>`);
  if (r.tierChange) bits.unshift(`<span class="role">Tier: ${esc(r.tierChange.label)}</span>`);
  if (r.res.errors?.length) bits.push(`<span class="bad">${esc(r.res.errors[0])}</span>`);
  return [...bits, ...r.traits].join(", ");
}
