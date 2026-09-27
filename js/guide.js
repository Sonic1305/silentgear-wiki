// Beginner guide: how Silent Gear works in this pack, with recipes read from the jars.
import { $$, esc, fmt, idPath, titleCase } from "./util.js";
import { db, matName } from "./db.js";
import { itemChip, matLink } from "./app.js";
import { gearInfo, gearName, GROUPS } from "./gear.js";
import { GRADES } from "./calc.js";

// ---------- recipe rendering ----------
const PREFERRED_NS = ["minecraft", "silentgear", "silentgems", "sgearmetalworks"];

function pickItem(ing) {
  if (!ing?.items?.length) return null;
  return ing.items.slice().sort((a, b) => rank(a) - rank(b))[0];
}
function rank(id) {
  const i = PREFERRED_NS.indexOf(id.split(":")[0]);
  return (i < 0 ? 9 : i) + (db.items[id]?.icon ? 0 : 20);
}

function slot(ing) {
  if (!ing) return '<span class="rslot"></span>';
  const it = pickItem(ing);
  const names = (ing.items || []).map(i => db.items[i]?.name || i);
  const title = (ing.label?.startsWith("#") ? `Any ${ing.label}: ` : ing.label?.startsWith("any ") ? `${titleCase(ing.label.replace(/^any /, "Any "))}, e.g. ` : "") + [...new Set(names)].slice(0, 8).join(", ") + (names.length > 8 || ing.more ? " and more" : "");
  if (!it) return `<span class="rslot" title="${esc(ing.label || "")}">?</span>`;
  const icon = db.items[it]?.icon;
  return `<span class="rslot" title="${esc(title)}">${icon ? `<img src="icons/${esc(icon)}.png" alt="${esc(db.items[it]?.name || it)}">` : `<small>${esc((db.items[it]?.name || idPath(it)).slice(0, 6))}</small>`}${names.length > 1 ? '<i class="any">*</i>' : ""}</span>`;
}

function resultSlot(id, count) {
  const icon = db.items[id]?.icon;
  return `<span class="rslot out" title="${esc(db.items[id]?.name || id)}">${icon ? `<img src="icons/${esc(icon)}.png" alt="">` : "?"}${count > 1 ? `<b class="cnt">${count}</b>` : ""}</span>`;
}

export function recipeCard(rid, opts = {}) {
  const r = db.crafting[rid];
  if (!r) return "";
  let grid = "";
  if (r.type === "minecraft:crafting_shaped") {
    const w = Math.max(...r.pattern.map(p => p.length));
    const rows = r.pattern.map(p => p.padEnd(w, " "));
    grid = `<div class="rgrid" style="grid-template-columns:repeat(${w},34px)">${rows.flatMap(row => [...row].map(c => c === " " ? slot(null) : slot(r.key[c]))).join("")}</div>`;
  } else if (r.type === "minecraft:crafting_shapeless") {
    const n = r.ingredients.length;
    const w = n <= 1 ? 1 : n <= 4 ? 2 : 3;
    grid = `<div class="rgrid" style="grid-template-columns:repeat(${w},34px)">${r.ingredients.map(slot).join("")}</div>`;
  } else if (r.type === "silentgear:tool_action") {
    grid = `<div class="ranvil">${slot(r.ingredients[0])}<span class="muted small">on a Stone Anvil, hit with</span>${slot(r.tool)}</div>`;
  }
  const name = db.items[r.result]?.name || titleCase(idPath(r.result));
  return `<div class="rcard${r.removed ? " removed" : ""}">
    <div class="rtitle">${esc(opts.title || name)}${r.type === "minecraft:crafting_shapeless" ? ' <span class="muted small">(shapeless)</span>' : ""}</div>
    <div class="rbody">${grid}<span class="rarrow">→</span>${resultSlot(r.result, r.count)}</div>
    ${r.removed ? '<div class="small bad">Removed in this pack (KubeJS)</div>' : ""}
    ${opts.note ? `<div class="small muted">${opts.note}</div>` : ""}
  </div>`;
}

export function recipesFor(itemId) {
  return Object.keys(db.crafting).filter(k => db.crafting[k].result === itemId);
}

function cards(ids, opts) {
  return `<div class="rcards">${ids.map(id => recipeCard(id, opts?.[id])).join("")}</div>`;
}

function byResult(items) {
  return items.flatMap(recipesFor);
}

function tagItems(tag) {
  return (db.tagLists?.[tag] || []).map(itemChip).join(" ") || '<span class="muted">none</span>';
}

// ---------- page ----------
const SECTIONS = [
  ["basics", "The basics"],
  ["start", "Getting started"],
  ["blueprints", "Blueprints & templates"],
  ["parts", "Making parts"],
  ["casting", "Casting (this pack)"],
  ["assembly", "Assembling & upgrading"],
  ["traits", "Stats & traits"],
  ["alloys", "Alloys"],
  ["grading", "Grading & starcharging"],
  ["repair", "Repairing"],
  ["world", "Ores & resources"],
  ["other", "Other tools & blocks"],
  ["faq", "Common questions"],
];

export function viewGuide(app, params) {
  const alloyRecipes = Object.entries(db.recipes).filter(([, r]) => r.type.startsWith("silentgear:alloy_making"));
  const machineOf = t => ({ metal: "Alloy Forge", gem: "Recrystallizer", fabric: "Refabricator" })[t.split("/")[1]] || titleCase(t.split("/")[1] || "");
  const castN = Object.values(db.materials).filter(m => m.categories.includes("casting")).length;
  const gearBlueprints = GROUPS.flatMap(([, list]) => list).filter(g => recipesFor(`silentgear:${g}_blueprint`).length || recipesFor(`silentgear:${g}_template`).length);
  const partBlueprints = ["rod", "tip", "binding", "grip", "cord", "fletching", "coating", "lining"];

  app.innerHTML = `
    <h1>Silent Gear Guide</h1>
    <p class="muted">How the mod works, from your first stone tools to graded, starcharged gear. Recipes are read from the modpack, so they match what you see in JEI. Hover a slot to see which items are accepted (<i class="any">*</i> = several items work).</p>
    <nav class="toc">${SECTIONS.map(([id, t]) => `<a href="#/guide?s=${id}">${esc(t)}</a>`).join("")}</nav>

    <section id="g-basics">
      <h2>The basics</h2>
      <div class="cols">
        <div class="card">
          <ol class="steps">
            <li><b>Get a blueprint or template</b> for the part you want, e.g. a Sword Blueprint.</li>
            <li><b>Make the part</b>: blueprint + materials in a crafting grid (or cast it, see below). The blueprint tells you how many materials it needs.</li>
            <li><b>Make the other parts</b>: most tools also need a rod. A plain stick counts as a wooden rod.</li>
            <li><b>Assemble</b>: put the main part and the rod in a crafting grid to get the finished item.</li>
            <li><b>Improve it</b> with optional parts (tip, grip, binding, coating), upgrades, graded or starcharged materials.</li>
          </ol>
        </div>
        <div class="card">
          <p style="margin-top:0">Everything about a Silent Gear item comes from its <b>materials</b>. The same material gives different stats depending on the <b>part type</b> it's used in: iron as a sword blade gives damage and durability, iron as a tip adds a bonus on top.</p>
          <p>The item only becomes better when its parts are better. There are no tool tiers like "iron sword" vs "diamond sword"; a sword is a sword, and its material decides everything.</p>
          <p class="muted small" style="margin-bottom:0">Useful pages: <a href="#/materials">Materials</a> (stats per part type), <a href="#/gear">Gear &amp; Parts</a> (what each item needs), <a href="#/builder">Builder</a> (try combinations).</p>
        </div>
      </div>
    </section>

    <section id="g-start">
      <h2>Getting started</h2>
      <p>You can start Silent Gear right away with stone and wood. The crude tools and the <b>Stone Anvil</b> give you template boards (for templates) and pebbles (slingshot ammo):</p>
      ${cards(byResult(["silentgear:crude_tool_parts", "silentgear:crude_knife", "silentgear:crude_hammer", "silentgear:stone_anvil", "silentgear:template_board", "silentgear:pebble", "silentgear:stone_rod"]))}
      <p class="small muted">To use the Stone Anvil, right-click it with the item to place it on top, then hit it with the tool. Any knife or dagger works for template boards, any hammer for pebbles.</p>
    </section>

    <section id="g-blueprints">
      <h2>Blueprints &amp; templates</h2>
      <div class="cols">
        <div class="card">
          <p style="margin-top:0">Every part needs a pattern. There are two kinds, and both are enabled on this server:</p>
          <ul>
            <li><b>Templates</b> are made from template boards. They are cheap, but <b>used up</b> when you craft the part.</li>
            <li><b>Blueprints</b> are made from blueprint paper. They are <b>reusable</b>: the blueprint stays in the grid after crafting.</li>
          </ul>
          <p class="small muted" style="margin-bottom:0">A <b>Blueprint Book</b> holds up to 54 blueprints and works like whichever blueprint is selected in it. Rings, bracelets and necklaces use blueprints too; gem settings need <b>Jeweler Tools</b> instead.</p>
        </div>
        <div>${cards(byResult(["silentgear:blueprint_paper", "silentgear:blueprint_book", "silentgear:jeweler_tools"]))}</div>
      </div>
      <h3>Gear blueprints</h3>
      <p class="muted small">Templates use the same shape with template boards instead of blueprint paper.</p>
      <div class="rcards">${gearBlueprints.map(g => {
        const bp = recipesFor(`silentgear:${g}_blueprint`)[0] || recipesFor(`silentgear:${g}_template`)[0];
        return recipeCard(bp, { title: `${gearName(g)}` });
      }).join("")}</div>
      <h3>Part blueprints</h3>
      <div class="rcards">${partBlueprints.map(p => {
        const bp = recipesFor(`silentgear:${p}_blueprint`)[0] || recipesFor(`silentgear:${p}_template`)[0];
        return bp ? recipeCard(bp) : "";
      }).join("")}</div>
    </section>

    <section id="g-parts">
      <h2>Making parts</h2>
      <div class="cols">
        <div class="card">
          <ul style="margin-top:0">
            <li>Put the blueprint and the listed number of materials into a crafting grid. A pickaxe head needs 3 materials, a sword blade 2, and so on. The <a href="#/gear">Gear &amp; Parts</a> page lists every count.</li>
            <li><b>All materials in one part must be the same material</b> (e.g. 3 iron, not 2 iron + 1 gold). To mix materials, make an <a href="#/guide?s=alloys">alloy</a> first.</li>
            <li>The <b>quick recipe</b> skips the part step: blueprint + materials + rod in one grid gives the finished tool.</li>
            <li>Some items can be used directly as a part. A <b>stick</b> is a wooden rod (and counts as only 1 material), a blaze rod is a blaze rod part, and so on. The material pages list these under "substitute".</li>
          </ul>
        </div>
        <div class="card">
          <p style="margin-top:0">Which materials fit which part?</p>
          <ul>
            <li><b>Main parts</b> (heads, blades, plates): most metals, gems, stone, wood, bone, flint.</li>
            <li><b>Rods</b>: wood, bone, metals, blaze/breeze/end rods.</li>
            <li><b>Tips</b>: metals and gems (small bonus on top).</li>
            <li><b>Grips</b>: wool, leather. <b>Bindings</b> and <b>cords</b>: string, sinew, flax, vines.</li>
            <li><b>Fletching</b>: feathers, paper. <b>Lining</b> (armor): cloth, slime, leather.</li>
          </ul>
          <p class="small muted" style="margin-bottom:0">Pick a part type on the <a href="#/materials">Materials</a> page to see exactly which materials work.</p>
        </div>
      </div>
    </section>

    <section id="g-casting">
      <h2>Casting (this pack)</h2>
      <div class="note">This pack has <b>SGear Metalworks</b>. It marks <b>${castN} metals and gems</b> (iron, gold, diamond, crimson iron, the Silent Gems and more) as <span class="chip cat">casting</span>. The blueprint recipes refuse these materials. You have to cast the parts in a <b>Productive Metalworks foundry</b> instead.</div>
      <div class="cols">
        <div class="card">
          <ol class="steps">
            <li>Build a foundry from Productive Metalworks (fire bricks, Foundry Controller, Foundry Tap). Its guide book in game explains the structure.</li>
            <li>Make a <b>part cast</b>: pour 360 mB of molten steel over a finished part (e.g. a wooden sword blade) on a Casting Table. The part is used up, the cast stays.</li>
            <li>Melt your metal or gem in the foundry and pour it into the cast. The cast is <b>reusable</b>.</li>
            <li>The amount of molten material equals the part's material count (e.g. 2 ingots for a sword blade).</li>
          </ol>
        </div>
        <div class="card">
          <p style="margin-top:0">Non-metal materials (wood, stone, bone, flint, leather, string) still use blueprints normally. So the usual path is: make a wooden part with a template, turn it into a cast, then cast the metal version.</p>
          <p class="small muted" style="margin-bottom:0">Every <a href="#/gear">gear page</a> shows which cast you need, and the <a href="#/builder">Builder</a> tells you for each part whether to cast it or craft it.</p>
        </div>
      </div>
    </section>

    <section id="g-assembly">
      <h2>Assembling &amp; upgrading</h2>
      <div class="cols">
        <div class="card">
          <h3 style="margin-top:0">Assembling</h3>
          <ul>
            <li>Main part + required parts (usually a rod) in a crafting grid gives the finished item.</li>
            <li><b>Optional parts</b> (tip, grip, binding, lining) are added later: put the finished item and the part together in a crafting grid. A new part replaces the old one of the same type.</li>
            <li><b>Coatings</b> go on in a <b>smithing table</b>: Coating Smithing Template + gear + material (e.g. gold ingot). The coating changes the item's color and adds that material's coating bonus.</li>
            <li><b>Vanilla tools and armor</b> (wood up to netherite) can be turned into Silent Gear versions in a crafting grid, e.g. a diamond pickaxe becomes a Silent Gear pickaxe with a diamond head.</li>
          </ul>
        </div>
        <div class="card">
          <h3 style="margin-top:0">Upgrades</h3>
          <p>Upgrades add a trait or ability. Apply them in a <b>smithing table</b> with a <b>stick</b> as the template, or combine them in an anvil.</p>
          ${cards(byResult(["silentgear:upgrade_base", "silentgear:advanced_upgrade_base", "silentgear:magnetic_upgrade", "silentgear:spoon_upgrade", "silentgear:wide_plate_upgrade", "silentgear:road_maker_upgrade", "silentgear:red_card_upgrade", "silentgear:coating_smithing_template"]))}
        </div>
      </div>
    </section>

    <section id="g-traits">
      <h2>Stats &amp; traits</h2>
      <div class="cols">
        <div class="card">
          <h3 style="margin-top:0">How stats combine</h3>
          <ul>
            <li>The <b>main part</b> sets the base values (durability, damage, speed, harvest tier).</li>
            <li>Other parts mostly <b>add</b> a fixed amount or <b>multiply</b> the total (e.g. a grip gives +15% harvest speed).</li>
            <li>The <b>harvest tier</b> is the best tier among all parts, so a diamond tip on an iron pickaxe lets it mine diamond-tier blocks.</li>
            <li>The gear type adds its own bonuses: a katana gets +4 damage, a hammer twice the durability but half the mining speed.</li>
          </ul>
        </div>
        <div class="card">
          <h3 style="margin-top:0">How traits work</h3>
          <ul>
            <li>Each material brings traits depending on the part type, e.g. iron as a main part gives Malleable 3.</li>
            <li>Many traits only work on some gear types (e.g. Accelerate only on tools) or need a minimum share of the part.</li>
            <li>Levels are averaged: <b>level = sum of levels ÷ min(half the trait entries on the item, entries of this trait)</b>. More materials with the same trait mean a higher level. Extra traits from other parts can lower it.</li>
            <li>An item with <b>only one trait</b> gets that trait at double level (up to its max).</li>
            <li>Several traits (Sharp, Hard, Accelerate and others) only get stronger as the item takes damage.</li>
          </ul>
          <p class="small muted" style="margin-bottom:0">The <a href="#/builder">Builder</a> shows exactly how each part changes stats and trait levels.</p>
        </div>
      </div>
    </section>

    <section id="g-alloys">
      <h2>Alloys</h2>
      <p>Alloys are the only way to <b>mix</b> materials. Machines combine several materials into one new material. Its stats are an average of the inputs, adjusted by <b>synergy</b>: similar materials (same category, similar rarity) raise it, very different ones lower it.</p>
      <div class="cols">
        <div class="card">
          <h3 style="margin-top:0">Machines</h3>
          <table class="data"><tbody>
            <tr><td><b>Alloy Forge</b></td><td>metals and dusts (6 slots) → Alloy Ingot</td></tr>
            <tr><td><b>Recrystallizer</b></td><td>gems (6 slots) → Hybrid Gem</td></tr>
            <tr><td><b>Refabricator</b></td><td>cloth, fibers, slime (6 slots) → Mixed Fabric</td></tr>
            <tr><td><b>Crude Mixer</b></td><td>anything (4 slots) → Crude Alloy, 20% weaker stats</td></tr>
            <tr><td><b>Super Mixer</b></td><td>anything (8 slots) → Super Alloy</td></tr>
          </tbody></table>
          <p class="small muted">Each machine takes 10 seconds and needs no fuel.</p>
        </div>
        <div class="card">
          <h3 style="margin-top:0">Fixed alloy recipes</h3>
          <p class="small muted">These give a fixed material with its own stats instead of a mixed one:</p>
          ${alloyRecipes.map(([, r]) => `<div class="effect"><div class="items">${r.ingredients.map(i => i.items?.length ? itemChip(i.items.slice().sort((a, b) => rank(a) - rank(b))[0]) : "").join(" + ")}</div>
            <div class="small" style="margin-top:4px">→ ${r.resultMaterial ? matLink(r.resultMaterial) : itemChip(r.result)} <span class="muted">in the ${esc(machineOf(r.type))}</span></div></div>`).join("")}
        </div>
      </div>
      ${cards(byResult(["silentgear:alloy_forge", "silentgear:recrystallizer", "silentgear:refabricator", "silentgear:crude_mixer", "silentgear:super_mixer"]))}
    </section>

    <section id="g-grading">
      <h2>Grading &amp; starcharging</h2>
      <div class="cols">
        <div class="card">
          <h3 style="margin-top:0">Material Grader</h3>
          <p>Gives a material a random <b>grade</b> that boosts most of its stats. Put the material in, plus one catalyst per item. Better catalysts give better grades on average. Grading takes 5 seconds and only ever <b>improves</b> a grade, never lowers it. Parts can't be graded on this server, only raw materials.</p>
          <table class="data"><thead><tr><th>Grade</th>${Object.keys(GRADES).filter(g => g !== "NONE").map(g => `<th class="num">${g}</th>`).join("")}</tr></thead>
            <tbody><tr><td>Bonus</td>${Object.entries(GRADES).filter(([g]) => g !== "NONE").map(([, v]) => `<td class="num">+${v}%</td>`).join("")}</tr></tbody></table>
          <dl class="kv" style="margin-top:10px">
            <dt>Tier 1</dt><dd>${tagItems("silentgear:grader_catalysts/tier1")}</dd>
            <dt>Tier 2</dt><dd>${tagItems("silentgear:grader_catalysts/tier2")}</dd>
            <dt>Tier 3</dt><dd>${tagItems("silentgear:grader_catalysts/tier3")}</dd>
          </dl>
          <p class="small muted">The average result is grade C with a tier 1 catalyst; each tier higher shifts it up by one grade.</p>
        </div>
        <div class="card">
          <h3 style="margin-top:0">Starlight Charger</h3>
          <p><b>Starcharging</b> adds big bonuses (durability, damage, armor, mining speed) based on the material's <i>charging value</i>. The charger collects starlight <b>at night</b> and needs a <b>clear view of the sky</b>.</p>
          <p>It needs <b>4 pillars</b>, one at each diagonal corner 3 blocks away (3 north + 3 west and so on), with a metal block 2 blocks above the charger's level. The weakest pillar sets the maximum level:</p>
          <table class="data"><tbody>
            <tr><td>Level 1</td><td>${itemChip("silentgear:crimson_steel_block")}</td><td>catalyst ${tagItems("silentgear:starlight_charger_catalysts/tier1")}</td></tr>
            <tr><td>Level 2</td><td>${itemChip("silentgear:azure_electrum_block")}</td><td>catalyst ${tagItems("silentgear:starlight_charger_catalysts/tier2")}</td></tr>
            <tr><td>Level 3</td><td>${itemChip("silentgear:tyrian_steel_block")}</td><td>catalyst ${tagItems("silentgear:starlight_charger_catalysts/tier3")}</td></tr>
          </tbody></table>
          <p class="small muted">Only raw materials can be charged on this server, not parts.</p>
        </div>
      </div>
      ${cards(byResult(["silentgear:material_grader", "silentgear:starlight_charger", "silentgear:glowing_dust", "silentgear:blazing_dust", "silentgear:glittery_dust", "silentgear:starmetal_dust"]))}
    </section>

    <section id="g-repair">
      <h2>Repairing</h2>
      <div class="cols">
        <div class="card">
          <ul style="margin-top:0">
            <li>Silent Gear items <b>don't break for good</b> on this server. At 0 durability they become "broken" and stop working until repaired.</li>
            <li><b>Anvil</b>: gear + its main material. Only the main part's material repairs it, at 50% efficiency.</li>
            <li><b>Repair kits</b>: fill a kit with repair materials in a crafting grid, then craft the kit together with the damaged gear. Better kits hold more and repair more per material.</li>
            <li>Each gear type has a <b>repair efficiency</b>; e.g. daggers and shovels repair twice as fast.</li>
          </ul>
        </div>
        <div class="card">
          <table class="data"><thead><tr><th>Kit</th><th class="num">Capacity</th><th class="num">Efficiency</th></tr></thead><tbody>
            ${[["very_crude", 8, 30], ["crude", 16, 35], ["sturdy", 32, 40], ["crimson", 48, 45], ["azure", 64, 50]].map(([k, c, e]) => `<tr><td>${itemChip(`silentgear:${k}_repair_kit`)}</td><td class="num">${c}</td><td class="num">${e}%</td></tr>`).join("")}
          </tbody></table>
        </div>
      </div>
      ${cards(byResult(["silentgear:very_crude_repair_kit", "silentgear:crude_repair_kit", "silentgear:sturdy_repair_kit", "silentgear:crimson_repair_kit", "silentgear:azure_repair_kit"]).filter(id => !id.endsWith("_empty")))}
    </section>

    <section id="g-world">
      <h2>Ores &amp; resources</h2>
      <div class="table-wrap"><table class="data"><thead><tr><th>Resource</th><th>Where</th><th>Height</th><th>Used for</th></tr></thead><tbody>
        <tr><td>${itemChip("silentgear:crimson_iron_ore")}</td><td>Nether (everywhere)</td><td>almost the whole Nether height</td><td>Crimson Iron → Crimson Steel. Early nether metal, needed for most machines.</td></tr>
        <tr><td>${itemChip("silentgear:azure_silver_ore")}</td><td>The End</td><td>y 16 to 92</td><td>Azure Silver → Azure Electrum. Late game.</td></tr>
        <tr><td>${itemChip("silentgear:bort_ore")}</td><td>Overworld, deep</td><td>y −60 to 10, most common around y −25</td><td>Bort: gem settings, coating template.</td></tr>
        <tr><td>${itemChip("silentgear:flax_seeds")}</td><td>Overworld, wild flax plants</td><td>surface</td><td>Flax fiber (string), flax flowers (blue dye for blueprint paper).</td></tr>
        <tr><td>${itemChip("silentgear:fluffy_seeds")}</td><td>Overworld, wild fluffy plants</td><td>surface</td><td>Fluffy puffs → fluffy string, fabric, feathers.</td></tr>
        <tr><td>${itemChip("silentgear:netherwood_sapling")}</td><td>Nether trees</td><td>Nether</td><td>Netherwood, a rod and main material.</td></tr>
        <tr><td>Silent Gems ores</td><td>Overworld, Nether and End (different gems per dimension), plus glowroses</td><td></td><td>Gems are strong main and tip materials.</td></tr>
      </tbody></table></div>
      <p class="small muted">All these ores also spawn in the JAMD mining dimensions (Mining, Nether, End).</p>
    </section>

    <section id="g-other">
      <h2>Other tools &amp; blocks</h2>
      <div class="cols">
        <div class="card">
          <ul style="margin-top:0">
            <li><b>Gear Mod Kit</b>: removes parts from an item (craft it together with the gear) or paints single parts.</li>
            <li><b>Paint Mixer</b>: recolors gear with dyes. Looks only.</li>
            <li><b>Metal Press</b>: makes <b>sheet metal</b>, a light armor material (weaker than the ingot, no durability for tools). Needs iron rods; Silent Gear's own iron rod recipe is removed here, so use one from another mod (e.g. Immersive Engineering iron rod).</li>
            <li><b>Prospector Hammer</b>: right-click to scan for ores within 16 blocks.</li>
            <li><b>Saw</b>: fells whole trees (up to 200 logs). <b>Hammer</b> and <b>Excavator</b> mine 3×3.</li>
            <li><b>Material Book</b> and <b>Guide Book</b>: in-game references for materials and basics.</li>
          </ul>
        </div>
        <div>${cards(byResult(["silentgear:mod_kit", "silentgear:paint_mixer", "silentgear:metal_press", "silentgear:material_book", "silentgear:guide_book"]))}</div>
      </div>
    </section>

    <section id="g-faq">
      <h2>Common questions</h2>
      <dl class="faq">
        <dt>Why can't I craft an iron (or diamond) part with my blueprint?</dt>
        <dd>In this pack those materials are cast-only. See <a href="#/guide?s=casting">Casting</a>.</dd>
        <dt>Why did my trait level go down when I added a part?</dt>
        <dd>Trait levels are averaged over all trait entries on the item. A part with new traits increases that count. The Builder shows this in its "What each part adds" table.</dd>
        <dt>Can I mix iron and gold in one pickaxe head?</dt>
        <dd>No, one part holds one material. Make an alloy in the Alloy Forge first, then use the Alloy Ingot.</dd>
        <dt>My tool is "broken", is it gone?</dt>
        <dd>No. Broken gear stays in your inventory and works again once you repair it.</dd>
        <dt>Can I enchant Silent Gear items?</dt>
        <dd>Yes. The enchantability comes from the materials (the "Enchantment Value" stat).</dd>
        <dt>Which weapon should I use?</dt>
        <dd>See "Which weapon fits your style?" on the <a href="#/gear">Gear &amp; Parts</a> page.</dd>
      </dl>
    </section>`;

  const s = params.get("s");
  if (s) {
    const go = () => document.getElementById("g-" + s)?.scrollIntoView();
    go();
    // images above the section change the layout while loading, so jump again once they are in
    Promise.all([...app.querySelectorAll("img")].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; }))).then(go);
  }
}
