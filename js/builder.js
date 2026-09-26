// Gear builder: pick a gear type and one material per part, see computed stats & traits.
import { $, $$, esc, fmt, store } from "./util.js";
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

function matSelect(pt, val, gear, optional) {
  const mats = Object.values(db.materials)
    .filter(m => (usableIn(m.id, pt, gear).ok && (!state.obtainable || m.obtainable)) || m.id === val)
    .filter(m => pt !== "main" || mainRuleOk(m, gear))
    .sort((a, b) => a.name.localeCompare(b.name));
  return `<select data-pt="${pt}" style="flex:1;min-width:0">
    ${optional ? `<option value="">– none –</option>` : ""}
    ${mats.map(m => `<option value="${esc(m.id)}" ${m.id === val ? "selected" : ""}>${esc(m.name)}${m.categories.includes("casting") ? " ⛏" : ""}</option>`).join("")}
  </select>`;
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
            <div class="slot-head"><b>${esc(title)}</b><span class="req">${required ? "required" : "optional"} · ${cur?.count ?? n}× material</span></div>
            <div class="mat-pick">${matSelect(pt, cur?.mat || "", gear, !required)}</div>
            ${sub && sub.items.length ? `<label class="chk" style="margin-top:6px"><input type="checkbox" data-sub="${pt}" ${cur.count === 1 ? "checked" : ""}> Use ${esc(db.items[sub.items[0]]?.name || sub.label)} instead (counts as 1 material)</label>` : ""}
          </div>`;
        }).join("")}
        ${ups.length ? `<div class="slot"><div class="slot-head"><b>Upgrades</b></div>
          ${ups.map(u => `<label class="chk" style="display:flex;margin:3px 0"><input type="checkbox" data-up="${esc(u.id)}" ${state.upgrades.includes(u.id) ? "checked" : ""}> ${esc(u.name)}</label>`).join("")}</div>` : ""}
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
  $$("select[data-pt]", app).forEach(sel => sel.addEventListener("change", () => {
    const pt = sel.dataset.pt;
    if (!sel.value) delete state.parts[pt];
    else state.parts[pt] = { mat: sel.value, count: pt === "main" ? mainCount(state.gear) : PART_MAT_COUNT[pt] || 1 };
    save(app);
  }));
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
    <div class="card" style="margin-top:14px">
      <h3>How to craft it</h3>
      ${craftSteps(gear)}
    </div>
    ${res.notes.length ? `<p class="muted small" style="margin-top:10px">${res.notes.map(esc).join("<br>")}</p>` : ""}
    <p class="muted small">Formulas ported from the Silent Gear 4.2.1 source. Starcharged materials and alloys (whose stats depend on the mix) aren't simulated.</p>`;
  renderGearIcon($("#b-icon"), gear, iconParts);
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
