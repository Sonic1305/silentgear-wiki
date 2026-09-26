import { $, $$, esc, fmt, idPath, cssColor, debounce, store, plain, titleCase } from "./util.js";
import { db, loadDb, PART_TYPES, STATS, statName, statValue, partTypeName, gearTypeName, traitName, matName, modName, harvestTier, traitSources } from "./db.js";
import { initTraitFx, conditionText, effectText } from "./traitfx.js";
import { renderGearIcon, renderBrand } from "./render.js";
import { viewGear, viewGearDetail, gearInfo, gearName } from "./gear.js";
import { viewBuilder } from "./builder.js";
import { viewCompare } from "./compare.js";

const app = $("#app");

// ---------- shared bits ----------
export function itemChip(id) {
  const it = db.items[id];
  const name = it ? it.name : titleCase(idPath(id));
  const icon = it?.icon ? `<img class="ic sm" src="icons/${esc(it.icon)}.png" alt="" loading="lazy">` : "";
  return `<span class="item" title="${esc(id)}">${icon}${esc(name)}</span>`;
}

export function matIcon(m, cls = "") {
  const first = m.ingredient.items[0] || Object.values(m.substitutes)[0]?.items[0];
  const it = first && db.items[first];
  if (it?.icon) return `<img class="ic ${cls}" src="icons/${esc(it.icon)}.png" alt="" loading="lazy">`;
  return `<span class="ic ${cls}" style="display:inline-block;border-radius:4px;background:${cssColor(m.color)}"></span>`;
}

export function matLink(id, withIcon = true) {
  const m = db.materials[id];
  if (!m) return esc(titleCase(idPath(id)));
  return `<a class="namecell" href="#/material/${esc(id)}">${withIcon ? matIcon(m, "sm") : ""}<span>${esc(m.name)}</span></a>`;
}

export function traitChip(t, opts = {}) {
  const name = traitName(t.trait);
  const cond = (t.conditions || []).length ? " cond" : "";
  const title = (t.conditions || []).map(c => plain(conditionText(c).replace(/<[^>]+>/g, ""))).join("; ");
  return `<a class="chip${cond}" href="#/trait/${esc(t.trait)}" title="${esc(title || db.traits[t.trait]?.desc || "")}">${esc(name)} <span class="lvl">${t.level}</span>${cond ? " *" : ""}</a>`;
}

function catChips(m) {
  return m.categories.map(c => `<span class="chip cat">${esc(c)}</span>`).join(" ");
}

function setNav(key) {
  $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.nav === key));
}

// ---------- home ----------
function viewHome() {
  setNav("");
  const mats = Object.values(db.materials);
  const bySource = {};
  for (const m of mats) { const s = m.id.split(":")[0]; bySource[s] = (bySource[s] || 0) + 1; }
  const castN = mats.filter(m => m.categories.includes("casting")).length;
  app.innerHTML = `
    <h1>Silent Gear Wiki</h1>
    <p class="muted">Everything about Silent Gear and its addons, read straight from the modpack's jar files, so values match what's in the game. Made by <a href="https://github.com/Sonic1305">Sonic1305</a> for the TNP Limitless 8 server.</p>
    <div class="grid" style="margin-top:18px">
      <a class="card" href="#/materials"><h3>Materials</h3><p class="muted">${mats.length} materials: stats per part type, traits, which items you need, harvest tiers.</p></a>
      <a class="card" href="#/traits"><h3>Traits</h3><p class="muted">${Object.keys(db.traits).length} traits: what they do, max levels, and which materials give them.</p></a>
      <a class="card" href="#/gear"><h3>Gear &amp; Parts</h3><p class="muted">All tools, weapons, armor and curios, and which parts and blueprints you need to craft them.</p></a>
      <a class="card" href="#/builder"><h3>Gear Builder</h3><p class="muted">Pick a gear type and materials per part to see the resulting stats and traits.</p></a>
      <a class="card" href="#/compare"><h3>Compare &amp; Ranking</h3><p class="muted">Compare materials side by side, or rank them by any stat for a given part type.</p></a>
    </div>
    <h2>How Silent Gear works (short version)</h2>
    <div class="cols">
      <div class="card">
        <ol style="margin:0;padding-left:20px">
          <li>Craft a <b>blueprint</b> (or template) for the part you want, e.g. a sword blade.</li>
          <li>Blueprint + materials in a crafting grid gives the <b>part</b>. You can mix materials, and each one adds its stats and traits.</li>
          <li>Combine the main part with a <b>rod</b> (plus optional parts like tip, grip, binding, coating) to get the <b>gear item</b>.</li>
          <li>Each material behaves differently depending on the <b>part type</b> it's used in (main, rod, tip and so on). That's why the material pages show stats per part type.</li>
        </ol>
      </div>
      <div class="card">
        <dl class="kv">
          ${Object.entries(bySource).map(([s, n]) => `<dt>${esc(modName(s))}</dt><dd>adds ${n} materials</dd>`).join("")}
          <dt>SGear Metalworks</dt><dd>makes ${castN} metals/gems <b>cast-only</b> (foundry instead of blueprint)</dd>
          <dt>Versions</dt><dd>${Object.entries(db.versions).filter(([, v]) => v).map(([k, v]) => `${esc(k)} ${esc(v)}`).join(", ")}</dd>
        </dl>
      </div>
    </div>`;
}

// ---------- materials list ----------
const matState = store.get("matState", { pt: "silentgear:main", q: "", cat: "", src: "", sort: "name", dir: 1, onlyObtainable: false });

const TABLE_STATS = {
  main: ["durability", "armor_durability", "harvest_speed", "attack_damage", "attack_speed", "magic_damage", "ranged_damage", "armor", "armor_toughness", "magic_armor", "enchantment_value", "rarity"],
  default: null,
};

function statsForPt(pt) {
  const p = idPath(pt);
  if (TABLE_STATS[p]) return TABLE_STATS[p];
  const set = new Set();
  for (const m of Object.values(db.materials)) {
    const pr = m.props[pt];
    if (!pr) continue;
    for (const k of Object.keys(pr)) if (k !== "traits" && k !== "harvest_tier" && !k.includes("/")) set.add(k);
  }
  return STATS.filter(s => set.has(s));
}

function viewMaterials() {
  setNav("materials");
  const cats = [...new Set(Object.values(db.materials).flatMap(m => m.categories))].sort();
  const srcs = [...new Set(Object.values(db.materials).map(m => idPath(m.id.split(":")[0])))];
  app.innerHTML = `
    <h1>Materials</h1>
    <p class="muted">A material's stats depend on the part it's used in. Pick a part type to see the matching values. Click a column header to sort (that works as a ranking).</p>
    <div class="toolbar">
      <input id="mq" class="grow" type="search" placeholder="Filter by name, item or trait" value="${esc(matState.q)}">
      <select id="mpt">${PART_TYPES.map(p => `<option value="silentgear:${p}" ${matState.pt === "silentgear:" + p ? "selected" : ""}>${esc(partTypeName(p))}</option>`).join("")}</select>
      <select id="mcat"><option value="">All categories</option>${cats.map(c => `<option ${matState.cat === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <select id="msrc"><option value="">All namespaces</option>${srcs.map(s => `<option value="${esc(s)}" ${matState.src === s ? "selected" : ""}>${esc(modName(s))}</option>`).join("")}</select>
      <label class="chk"><input type="checkbox" id="mobt" ${matState.onlyObtainable ? "checked" : ""}> Only obtainable in this pack</label>
    </div>
    <div id="mtable"></div>`;
  const rerender = () => { store.set("matState", matState); renderMatTable(); };
  $("#mq").addEventListener("input", debounce(e => { matState.q = e.target.value; rerender(); }));
  $("#mpt").addEventListener("change", e => { matState.pt = e.target.value; if (!["name", "traits", "tier"].includes(matState.sort)) matState.sort = "name"; rerender(); });
  $("#mcat").addEventListener("change", e => { matState.cat = e.target.value; rerender(); });
  $("#msrc").addEventListener("change", e => { matState.src = e.target.value; rerender(); });
  $("#mobt").addEventListener("change", e => { matState.onlyObtainable = e.target.checked; rerender(); });
  renderMatTable();
}

function matchesQuery(m, q) {
  if (!q) return true;
  q = q.toLowerCase();
  if (m.name.toLowerCase().includes(q) || m.id.includes(q)) return true;
  if (m.ingredient.items.some(i => (db.items[i]?.name || i).toLowerCase().includes(q))) return true;
  for (const pr of Object.values(m.props)) {
    if ((pr.traits || []).some(t => traitName(t.trait).toLowerCase().includes(q))) return true;
  }
  return false;
}

function renderMatTable() {
  const pt = matState.pt;
  const cols = statsForPt(pt);
  let mats = Object.values(db.materials).filter(m => m.props[pt] && Object.keys(m.props[pt]).length)
    .filter(m => matchesQuery(m, matState.q))
    .filter(m => !matState.cat || m.categories.includes(matState.cat))
    .filter(m => !matState.src || m.id.startsWith(matState.src + ":"))
    .filter(m => !matState.onlyObtainable || m.obtainable);
  const val = (m, s) => {
    const v = statValue(m.props[pt]?.[s]);
    return v ? v.value : null;
  };
  const tier = m => harvestTier(m.props[pt])?.level ?? -1;
  const sorters = {
    name: (a, b) => a.name.localeCompare(b.name),
    tier: (a, b) => tier(a) - tier(b),
    traits: (a, b) => (a.props[pt].traits?.length || 0) - (b.props[pt].traits?.length || 0),
  };
  const sk = matState.sort;
  const cmp = sorters[sk] || ((a, b) => (val(a, sk) ?? -Infinity) - (val(b, sk) ?? -Infinity));
  mats.sort((a, b) => cmp(a, b) * matState.dir || a.name.localeCompare(b.name));

  const showTier = mats.some(m => m.props[pt].harvest_tier);
  const th = (key, label, num) => `<th class="sortable ${num ? "num" : ""} ${sk === key ? "sorted" : ""}" data-sort="${key}">${esc(label)}${sk === key ? (matState.dir > 0 ? " ▲" : " ▼") : ""}</th>`;
  const rows = mats.map(m => {
    const pr = m.props[pt];
    const ht = harvestTier(pr);
    return `<tr>
      <td>${matLink(m.id)}${m.obtainable ? "" : ' <span class="chip cat" title="No item in this pack matches this material">n/a</span>'}</td>
      ${showTier ? `<td>${ht ? `${esc(ht.label)} <span class="muted">(${ht.level ?? "?"})</span>` : ""}</td>` : ""}
      ${cols.map(s => {
        const v = statValue(pr[s]);
        return `<td class="num">${v ? fmt(v.value) + (v.op !== "AVERAGE" ? `<span class="op" title="${esc(v.op)}">${opShort(v.op)}</span>` : "") : ""}</td>`;
      }).join("")}
      <td class="traits">${(pr.traits || []).map(t => traitChip(t)).join("")}</td>
    </tr>`;
  }).join("");
  $("#mtable").innerHTML = `
    <p class="muted small">${mats.length} materials. <span class="op">×</span> = multiplier, <span class="op">+</span> = added on top, * = trait has conditions (hover for details).</p>
    <div class="table-wrap"><table class="data">
      <thead><tr>${th("name", "Material")}${showTier ? th("tier", "Tier") : ""}${cols.map(s => th(s, statName(s), true)).join("")}${th("traits", "Traits")}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  $$("#mtable th.sortable").forEach(el => el.addEventListener("click", () => {
    const k = el.dataset.sort;
    if (matState.sort === k) matState.dir *= -1; else { matState.sort = k; matState.dir = k === "name" ? 1 : -1; }
    store.set("matState", matState);
    renderMatTable();
  }));
}

export function opShort(op) {
  return { AVERAGE: "", ADD: "+", MULTIPLY_BASE: "×b", MULTIPLY_TOTAL: "×", MAX: "max", MIN: "min", WEIGHTED_AVERAGE: "~" }[op] ?? op;
}

export function opText(op, value) {
  switch (op) {
    case "ADD": return `+${fmt(value)} (added)`;
    case "MULTIPLY_BASE": return `${value >= 0 ? "+" : ""}${fmt(value * 100)}% of base`;
    case "MULTIPLY_TOTAL": return `${value >= 0 ? "+" : ""}${fmt(value * 100)}% of total`;
    case "MAX": return `at least ${fmt(value)}`;
    case "MIN": return `at most ${fmt(value)}`;
    default: return fmt(value);
  }
}

// ---------- material detail ----------
function viewMaterial(id) {
  setNav("materials");
  const m = db.materials[id];
  if (!m) return notFound();
  const pts = Object.keys(m.props).filter(pt => Object.keys(m.props[pt]).length);
  const alloyRecipes = Object.entries(db.recipes).filter(([, r]) => r.resultMaterial === id || (r.type.startsWith("silentgear:alloy") && r.result && m.ingredient.items.includes(r.result)));
  const usedInAlloys = Object.entries(db.recipes).filter(([, r]) => r.type.startsWith("silentgear:alloy") && r.ingredients.some(i => i.items && i.items.some(x => m.ingredient.items.includes(x))));
  const parent = m.parent && m.parent !== "silentgear:empty" ? m.parent : null;
  const children = Object.values(db.materials).filter(x => x.parent === id);

  app.innerHTML = `
    <p class="small"><a href="#/materials">← Materials</a></p>
    <div class="hero">
      ${matIcon(m, "lg")}
      <div>
        <h1 style="margin:0">${esc(m.name)}</h1>
        <div class="meta">
          <span class="chip"><span class="swatch" style="background:${cssColor(m.color)}"></span>${esc(cssColor(m.color))}</span>
          <span class="chip cat mono">${esc(id)}</span>
          ${catChips(m)}
          <span class="chip cat">data: ${m.source.map(s => esc(modName(s))).join(" → ")}</span>
        </div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <a class="btn" href="#/compare?m=${encodeURIComponent(id)}">Compare</a>
        <a class="btn" href="#/builder?main=${encodeURIComponent(id)}">Use in Builder</a>
      </div>
    </div>
    ${m.obtainable ? "" : `<div class="note">No item in this modpack matches this material. It exists in the data, but you can't actually craft with it (the needed item/tag is empty).</div>`}
    ${m.type === "silentgear:compound" ? `<div class="note info">This is a <b>compound material</b> (alloy/mix). Its stats come from the materials it's made of in the ${esc(idPath(m.ingredient.items[0] || ""))} recipe (e.g. alloy forge / gem fusion), not from fixed values.</div>` : ""}
    ${m.type === "silentgear:processed" ? `<div class="note info">This is a <b>processed material</b>: it modifies another base material (e.g. sheet metal made from a metal).</div>` : ""}

    <div class="cols">
      <div class="card">
        <h3>How to use</h3>
        <dl class="kv">
          <dt>Crafting item</dt><dd>${m.ingredient.label ? `<code>${esc(m.ingredient.label)}</code>` : "–"}<div class="items" style="margin-top:6px">${m.ingredient.items.map(itemChip).join("")}${m.ingredient.more ? `<span class="muted small">+${m.ingredient.more} more</span>` : ""}</div></dd>
          ${Object.entries(m.substitutes).map(([pt, s]) => `<dt>${esc(partTypeName(pt))} substitute</dt><dd><code>${esc(s.label || "")}</code><div class="items" style="margin-top:6px">${s.items.map(itemChip).join("") || '<span class="muted">none in pack</span>'}</div><div class="muted small">Can be used directly as the ${esc(partTypeName(pt))} part.</div></dd>`).join("")}
          ${parent ? `<dt>Inherits from</dt><dd>${matLink(parent)}</dd>` : ""}
          ${children.length ? `<dt>Variants</dt><dd class="items">${children.map(c => matLink(c.id)).join(" ")}</dd>` : ""}
          ${m.blacklist.length ? `<dt>Not allowed on</dt><dd>${m.blacklist.map(g => `<span class="chip">${esc(gearTypeName(g))}</span>`).join(" ")}</dd>` : ""}
          <dt>Salvageable</dt><dd>${m.canSalvage ? "Yes" : "No"}</dd>
          ${m.categories.includes("casting") ? `<dt>Casting</dt><dd>In this pack, parts from ${esc(m.name)} are <b>cast</b> in the Productive Metalworks foundry, not crafted with blueprints. <a href="#/gear">How?</a></dd>` : ""}
        </dl>
      </div>
      ${alloyRecipes.length || usedInAlloys.length ? `<div class="card"><h3>Alloying</h3>
        ${alloyRecipes.map(([rid, r]) => recipeHtml(rid, r)).join("")}
        ${usedInAlloys.length ? `<p class="muted small">Ingredient in: ${usedInAlloys.map(([, r]) => r.result ? itemChip(r.result) : "").join(" ")}</p>` : ""}
      </div>` : ""}
    </div>

    <h2>Stats by part type</h2>
    <div class="tabs" id="pt-tabs">${pts.map((pt, i) => `<button data-pt="${esc(pt)}" class="${i === 0 ? "on" : ""}">${esc(partTypeName(pt))}</button>`).join("")}</div>
    <div id="pt-body"></div>
    ${pts.length ? "" : '<p class="muted">This material has no fixed stats (see note above).</p>'}
    <details class="raw"><summary>Raw JSON</summary><pre>${esc(JSON.stringify({ properties: m.properties, parent: m.parent, type: m.type }, null, 2))}</pre></details>`;

  const renderPt = pt => {
    const pr = m.props[pt] || {};
    const ht = harvestTier(pr);
    const stats = Object.keys(pr).filter(k => k !== "traits" && k !== "harvest_tier")
      .sort((a, b) => (STATS.indexOf(a.split("/")[0]) - STATS.indexOf(b.split("/")[0])) || a.localeCompare(b));
    $("#pt-body").innerHTML = `
      <div class="cols">
        <div class="card">
          <h3>Stats as ${esc(partTypeName(pt))}</h3>
          <table class="data"><tbody>
            ${ht ? `<tr><td>Harvest Tier</td><td class="num">${esc(ht.label)} (level ${ht.level ?? "?"})</td></tr>` : ""}
            ${stats.map(s => { const v = statValue(pr[s]); return `<tr><td>${esc(statName(s))}</td><td class="num">${v ? opText(v.op, v.value) : esc(JSON.stringify(pr[s]))}</td></tr>`; }).join("")}
          </tbody></table>
          ${pt !== "silentgear:main" ? `<p class="muted small">Values marked +/% modify the gear's total instead of being averaged with the main materials.</p>` : ""}
        </div>
        <div class="card">
          <h3>Traits as ${esc(partTypeName(pt))}</h3>
          ${(pr.traits || []).length ? (pr.traits || []).map(t => `
            <div class="effect">
              <a href="#/trait/${esc(t.trait)}"><b>${esc(traitName(t.trait))}</b></a> <span class="lvl chip">Level ${t.level}</span>
              <div class="muted small">${esc(db.traits[t.trait]?.desc || "")}</div>
              ${(t.conditions || []).length ? `<div class="small">Condition: ${t.conditions.map(conditionText).join("; ")}</div>` : ""}
            </div>`).join("") : '<p class="muted">No traits.</p>'}
        </div>
      </div>`;
  };
  $$("#pt-tabs button").forEach(b => b.addEventListener("click", () => {
    $$("#pt-tabs button").forEach(x => x.classList.toggle("on", x === b));
    renderPt(b.dataset.pt);
  }));
  if (pts.length) renderPt(pts[0]);
}

export function recipeHtml(rid, r) {
  const ings = r.ingredients.map(i => {
    if (i.type?.startsWith?.("silentgear:")) return `<span class="chip">${esc(titleCase(idPath(i.type)))}${i.part_type ? ": " + esc(partTypeName(i.part_type)) : ""}</span>`;
    if (i.items?.length) return i.items.length > 1 ? `<span class="item" title="${esc(i.items.map(x => db.items[x]?.name || x).join(", "))}">${itemChip(i.items[0]).replace(/^<span class="item"[^>]*>|<\/span>$/g, "")} <span class="muted small">(${esc(i.label || "")})</span></span>` : itemChip(i.items[0]);
    return `<code>${esc(i.label || "?")}</code>`;
  });
  const res = r.resultMaterial ? matLink(r.resultMaterial) : (r.result ? itemChip(r.result) : "?");
  return `<div class="effect"><div class="items">${ings.join(" + ")}</div><div style="margin-top:6px">→ ${r.count > 1 ? r.count + "× " : ""}${res} <span class="muted small">(${esc(titleCase(idPath(r.type)))})</span></div></div>`;
}

// ---------- traits ----------
const traitState = store.get("traitState", { q: "", src: "", gt: "" });
function viewTraits() {
  setNav("traits");
  app.innerHTML = `
    <h1>Traits</h1>
    <p class="muted">Traits come from materials (depending on the part type) and from some parts/upgrades. Their level on the gear depends on how many materials provide them. Click a trait to see all its sources.</p>
    <div class="toolbar">
      <input id="tq" class="grow" type="search" placeholder="Filter by name or description" value="${esc(traitState.q)}">
      <select id="tsrc"><option value="">All mods</option>${["silentgear", "silentgems", "sgearmetalworks"].map(s => `<option value="${s}" ${traitState.src === s ? "selected" : ""}>${modName(s)}</option>`).join("")}</select>
    </div>
    <div id="tlist"></div>`;
  const render = () => {
    store.set("traitState", traitState);
    const q = traitState.q.toLowerCase();
    const list = Object.values(db.traits)
      .filter(t => !q || t.name.toLowerCase().includes(q) || plain(t.desc).toLowerCase().includes(q) || t.id.includes(q))
      .filter(t => !traitState.src || t.id.startsWith(traitState.src + ":"))
      .sort((a, b) => a.name.localeCompare(b.name));
    $("#tlist").innerHTML = `<p class="muted small">${list.length} traits</p><div class="table-wrap"><table class="data">
      <thead><tr><th>Trait</th><th>Description</th><th class="num">Max Lvl</th><th>Only on</th><th class="num">Sources</th></tr></thead>
      <tbody>${list.map(t => {
        const gts = t.conditions.flatMap(c => c.type === "silentgear:gear_type" ? [c.gear_type] : c.type === "silentgear:or" ? (c.values || []).filter(v => v.gear_type).map(v => v.gear_type) : []);
        const srcN = new Set((traitSources[t.id] || []).map(s => s.material || s.part)).size;
        return `<tr><td><a href="#/trait/${esc(t.id)}"><b>${esc(t.name)}</b></a>${t.id.startsWith("silentgear:") ? "" : ` <span class="chip cat">${esc(modName(t.id.split(":")[0]))}</span>`}</td>
          <td>${esc(plain(t.desc))}</td><td class="num">${t.maxLevel}</td>
          <td>${gts.map(g => `<span class="chip cat">${esc(gearTypeName(g))}</span>`).join(" ")}</td>
          <td class="num">${srcN || '<span class="muted">0</span>'}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  };
  $("#tq").addEventListener("input", debounce(e => { traitState.q = e.target.value; render(); }));
  $("#tsrc").addEventListener("change", e => { traitState.src = e.target.value; render(); });
  render();
}

function viewTrait(id) {
  setNav("traits");
  const t = db.traits[id];
  if (!t) return notFound();
  const sources = (traitSources[id] || []).slice().sort((a, b) => b.level - a.level || matName(a.material || "").localeCompare(matName(b.material || "")));
  const byPt = {};
  for (const s of sources) (byPt[s.partType] ||= []).push(s);
  const cancels = Object.values(db.traits).filter(x => (x.cancelsWith || []).includes(id));
  app.innerHTML = `
    <p class="small"><a href="#/traits">← Traits</a></p>
    <h1>${esc(t.name)}</h1>
    <div class="hero"><div class="meta">
      <span class="chip cat mono">${esc(id)}</span>
      <span class="chip">Max level ${t.maxLevel}</span>
      <span class="chip cat">${esc(modName(id.split(":")[0]))}</span>
      ${t.hidden ? '<span class="chip cat">hidden</span>' : ""}
    </div></div>
    <p style="font-size:1.05rem">${esc(plain(t.desc))}</p>
    ${t.extra.map(x => `<p class="muted">${esc(plain(x))}</p>`).join("")}
    <div class="cols">
      <div class="card">
        <h3>Effects</h3>
        ${t.effects.length ? t.effects.map(e => `<div class="effect">${effectText(e)} <div class="etype">${esc(e.type)}</div></div>`).join("") : '<p class="muted">No data-driven effects (handled in code or purely descriptive).</p>'}
        ${t.conditions.length ? `<h3>Conditions</h3><p>Only active ${t.conditions.map(conditionText).join(" and ")}.</p>` : ""}
        ${(t.cancelsWith || []).length || cancels.length ? `<h3>Cancels with</h3><p>${[...(t.cancelsWith || []), ...cancels.map(c => c.id)].map(c => `<a class="chip" href="#/trait/${esc(c)}">${esc(traitName(c))}</a>`).join(" ")}</p><p class="muted small">Traits that cancel each other reduce each other's levels.</p>` : ""}
      </div>
      <div class="card">
        <h3>Where to get it</h3>
        ${sources.length ? Object.entries(byPt).map(([pt, list]) => `
          <h3 style="margin-top:8px" class="muted small">AS ${esc(partTypeName(pt).toUpperCase())}</h3>
          <table class="data"><tbody>${list.map(s => `<tr>
            <td>${s.material ? matLink(s.material) : `<a href="#/gear">${esc(db.parts[s.part]?.name || s.part)}</a> <span class="muted small">(part)</span>`}</td>
            <td class="num"><span class="lvl chip">Lvl ${s.level}</span></td>
            <td class="small">${s.conditions.map(conditionText).join("; ")}</td></tr>`).join("")}
          </tbody></table>`).join("") : '<p class="muted">No material or part in this pack provides this trait directly (it may come from compound materials, other traits, or code).</p>'}
      </div>
    </div>
    <details class="raw"><summary>Raw JSON</summary><pre>${esc(JSON.stringify(t.raw, null, 2))}</pre></details>`;
}

function notFound() {
  app.innerHTML = `<h1>Not found</h1><p><a href="#/">Back to start</a></p>`;
}

// ---------- global search ----------
function setupSearch() {
  const input = $("#global-search");
  const box = $("#search-results");
  let idx = [];
  const build = () => {
    idx = [
      ...Object.values(db.materials).map(m => ({ kind: "material", name: m.name, href: `#/material/${m.id}`, icon: matIcon(m, "sm"), extra: m.ingredient.items.map(i => db.items[i]?.name || "").join(" ") })),
      ...Object.values(db.traits).map(t => ({ kind: "trait", name: t.name, href: `#/trait/${t.id}`, icon: "", extra: plain(t.desc) })),
      ...GEAR_INDEX(),
    ];
  };
  let sel = 0;
  const render = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { box.hidden = true; return; }
    const res = idx.map(e => {
      const n = e.name.toLowerCase();
      const score = n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : e.extra.toLowerCase().includes(q) ? 3 : 9;
      return [score, e];
    }).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, 14).map(x => x[1]);
    sel = Math.min(sel, res.length - 1);
    box.innerHTML = res.length ? res.map((e, i) => `<a href="${esc(e.href)}" class="${i === sel ? "sel" : ""}">${e.icon}<span>${esc(e.name)}</span><span class="kind">${e.kind}</span></a>`).join("") : '<div class="muted" style="padding:8px 10px">No results</div>';
    box.hidden = false;
  };
  input.addEventListener("focus", () => { if (!idx.length) build(); render(); });
  input.addEventListener("input", () => { sel = 0; render(); });
  input.addEventListener("keydown", e => {
    const links = $$("a", box);
    if (e.key === "ArrowDown") { sel = Math.min(sel + 1, links.length - 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
    else if (e.key === "Enter" && links[sel]) { location.hash = links[sel].getAttribute("href"); input.blur(); box.hidden = true; }
    else if (e.key === "Escape") { input.blur(); box.hidden = true; }
  });
  document.addEventListener("click", e => { if (!e.target.closest(".search-wrap")) box.hidden = true; });
  box.addEventListener("click", () => { box.hidden = true; input.value = ""; });
  document.addEventListener("keydown", e => {
    if (e.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
  });
}

function GEAR_INDEX() {
  return Object.values(gearInfo()).map(g => ({ kind: "gear", name: gearName(g.gear), href: `#/gear/${g.gear}`, icon: "", extra: db.lang[`item.silentgear.blueprint.${g.gear}.desc`] || "" }));
}

// ---------- router ----------
function route() {
  const hash = location.hash.slice(1) || "/";
  const [path, query] = hash.split("?");
  const params = new URLSearchParams(query || "");
  const seg = path.split("/").filter(Boolean);
  window.scrollTo(0, 0);
  const id = decodeURIComponent(seg.slice(1).join("/"));
  switch (seg[0]) {
    case undefined: return viewHome();
    case "materials": return viewMaterials();
    case "material": return viewMaterial(id);
    case "traits": return viewTraits();
    case "trait": return viewTrait(id);
    case "gear": return id ? (setNav("gear"), viewGearDetail(app, id)) : (setNav("gear"), viewGear(app));
    case "builder": setNav("builder"); return viewBuilder(app, params);
    case "compare": setNav("compare"); return viewCompare(app, params);
    default: return notFound();
  }
}

async function main() {
  try {
    await loadDb();
  } catch (e) {
    app.innerHTML = `<h1>Could not load data</h1><p class="muted">${esc(e.message)}</p><p>If you opened the file directly, serve the folder over HTTP (e.g. <code>python -m http.server</code>).</p>`;
    return;
  }
  initTraitFx(db);
  renderBrand($("#brand-icon"));
  const versions = Object.entries(db.versions).filter(([, v]) => v).map(([k, v]) => `${esc(k)} ${esc(v)}`).join(", ");
  $("#foot").innerHTML = `Made by <a href="https://github.com/Sonic1305">Sonic1305</a> for the TNP Limitless 8 server.<br>
    <span class="small">Data generated ${esc(db.generated)} from the modpack (${versions}). Unofficial fan page, Silent Gear by SilentChaos512.</span>`;
  setupSearch();
  window.addEventListener("hashchange", route);
  route();
}

main();
