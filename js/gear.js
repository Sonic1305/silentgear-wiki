// Gear items & parts: which parts they need, how parts are crafted or cast.
import { $, esc, idPath, titleCase } from "./util.js";
import { db, gearTypeName, partTypeName } from "./db.js";
import { itemChip, traitChip } from "./app.js";
import { renderGearIcon } from "./render.js";
import { GEAR_DEFS } from "./geardefs.js";

// ---- derive gear info from recipes ----
let GEAR = null;
export function gearInfo() {
  if (GEAR) return GEAR;
  GEAR = {};
  const recipes = Object.entries(db.recipes);
  for (const [rid, r] of recipes) {
    if (r.type !== "silentgear:gear_crafting" || !r.result?.startsWith("silentgear:")) continue;
    const g = (GEAR[r.result] ||= { id: r.result, gear: idPath(r.result), recipes: [], quick: [] });
    (rid.endsWith("_quick") ? g.quick : g.recipes).push({ rid, r });
  }
  for (const g of Object.values(GEAR)) {
    const std = g.recipes.find(x => x.rid.startsWith("silentgear:")) || g.recipes[0];
    g.mainPart = std?.r.ingredients.find(i => i.items?.length)?.items[0] || null;
    g.def = GEAR_DEFS[g.gear] || null;
    const mp = g.mainPart;
    g.partRecipes = recipes.filter(([, r]) => r.type === "silentgear:compound_part" && r.result === mp);
    const sg = g.partRecipes.find(([rid]) => rid.startsWith("silentgear:"));
    const matIngs = sg ? sg[1].ingredients.filter(i => i.type === "silentgear:material") : [];
    g.materialCount = matIngs.length || null;
    g.materialRule = matIngs[0] || null;
    g.extraIngredients = sg ? sg[1].ingredients.filter(i => !i.type && i.items?.length) : [];
    g.casting = recipes.filter(([, r]) => r.type === "sgearmetalworks:sg_gear_casting" && r.result === mp).map(([, r]) => r);
    g.castMaking = g.casting.map(c => recipes.find(([, r]) => r.type === "productivemetalworks:item_casting" && r.result === c.cast)?.[1]).filter(Boolean);
  }
  return GEAR;
}

export function gearName(gear) {
  return gearTypeName("silentgear:" + gear);
}

export const GROUPS = [
  ["Tools", ["pickaxe", "shovel", "axe", "hoe", "paxel", "mattock", "hammer", "excavator", "saw", "sickle", "shears", "prospector_hammer", "fishing_rod"]],
  ["Melee weapons", ["sword", "katana", "machete", "dagger", "knife", "spear", "mace", "trident"]],
  ["Ranged", ["bow", "crossbow", "slingshot", "arrow"]],
  ["Armor", ["helmet", "chestplate", "leggings", "boots", "elytra", "shield"]],
  ["Curios", ["ring", "bracelet", "necklace"]],
];

function blueprintDesc(gear) {
  return db.lang[`item.silentgear.blueprint.${gear}.desc`] || "";
}

export function viewGear(app) {
  const G = gearInfo();
  const known = new Set(GROUPS.flatMap(g => g[1]));
  const rest = Object.values(G).map(g => g.gear).filter(g => !known.has(g));
  const groups = rest.length ? [...GROUPS, ["Other", rest]] : GROUPS;
  const upgrades = Object.values(db.parts).filter(p => p.type === "silentgear:upgrade");
  const castN = Object.values(db.materials).filter(m => m.categories.includes("casting")).length;
  app.innerHTML = `
    <h1>Gear &amp; Parts</h1>
    <div class="note">In this pack, <b>SGear Metalworks</b> is installed: materials with the category <span class="chip cat">casting</span> (most metals and gems, ${castN} materials) <b>can't</b> be crafted into parts with a blueprint in the crafting grid. You <b>cast</b> those parts in the Productive Metalworks foundry using a part cast. Non-metal materials (wood, stone, bone, flint, …) still work with blueprints as usual.</div>
    ${groups.map(([title, list]) => `
      <h2>${esc(title)}</h2>
      <div class="grid">${list.filter(g => G["silentgear:" + g]).map(g => {
        const gi = G["silentgear:" + g];
        return `<a class="card" href="#/gear/${esc(g)}" style="display:flex;gap:12px;align-items:center">
          <canvas class="gear sm" data-gear="${esc(g)}"></canvas>
          <div><b>${esc(gearName(g))}</b><div class="muted small">${esc(blueprintDesc(g))}</div>
          <div class="small muted">${gi.materialCount ? `${gi.materialCount}× main material` : ""}${gi.def ? " · " + gi.def.required.map(p => partTypeName(p)).join(" + ") : ""}</div></div></a>`;
      }).join("")}</div>`).join("")}
    <h2>Upgrades</h2>
    <p class="muted">Upgrade items are combined with finished gear to add a trait or ability.</p>
    <div class="grid">${upgrades.map(p => `<div class="card"><div class="namecell">${p.item ? itemChip(p.item) : esc(p.name)}</div>
      <div class="small" style="margin-top:6px">${(p.traits || []).map(t => traitChip(t)).join(" ")}</div>
      <div class="muted small">For: ${(p.upgradeFor || []).map(g => esc(gearTypeName(g))).join(", ") || "–"}</div></div>`).join("")}</div>`;
  app.querySelectorAll("canvas[data-gear]").forEach(c => renderGearIcon(c, c.dataset.gear, { main: "silentgear:iron", rod: "silentgear:wood" }));
}

function ruleText(rule) {
  if (!rule) return "";
  const bits = [];
  if (rule.gear_type) bits.push(`usable for ${esc(gearTypeName(rule.gear_type))}`);
  if (rule.categories?.length) bits.push(`category: ${rule.categories.map(esc).join(", ")}`);
  if (rule.not_categories?.length) bits.push(`<b>not</b> category: ${rule.not_categories.map(esc).join(", ")}`);
  return bits.join("; ");
}

function ingText(i) {
  if (i.type === "silentgear:part_type") return `<span class="chip">any ${esc(partTypeName(i.part_type))}</span>`;
  if (i.type === "silentgear:blueprint") return `<span class="chip">blueprint</span>`;
  if (i.type === "silentgear:material") return `<span class="chip cat">material</span>`;
  if (i.items?.length) return itemChip(i.items[0]);
  return "";
}

export function viewGearDetail(app, gear) {
  const G = gearInfo();
  const g = G["silentgear:" + gear];
  if (!g) { app.innerHTML = `<h1>Unknown gear</h1><p><a href="#/gear">Back</a></p>`; return; }
  const d = g.def;
  const std = g.recipes.find(x => x.rid.startsWith("silentgear:")) || g.recipes[0];
  const mainPartDef = Object.values(db.parts).find(p => p.item === g.mainPart);
  app.innerHTML = `
    <p class="small"><a href="#/gear">← Gear &amp; Parts</a></p>
    <div class="hero">
      <canvas class="gear" id="gear-prev"></canvas>
      <div>
        <h1 style="margin:0">${esc(gearName(gear))}</h1>
        <div class="muted">${esc(blueprintDesc(gear))}</div>
        ${d?.parents?.length ? `<div class="meta"><span class="chip cat">counts as: ${d.parents.map(p => esc(gearTypeName(p))).join(", ")}</span></div>` : ""}
      </div>
      <div style="margin-left:auto"><a class="btn" href="#/builder?gear=${esc(gear)}">Open in Builder</a></div>
    </div>
    <div class="cols">
      <div class="card">
        <h3>Assembly</h3>
        ${std ? `<p>Combine in a crafting grid:</p><div class="items">${std.r.ingredients.map(ingText).join(" + ")}</div>` : ""}
        ${g.recipes.filter(x => x !== std).map(x => `<p class="small muted" style="margin-top:8px">Variant: ${x.r.ingredients.map(ingText).join(" + ")}</p>`).join("")}
        ${d ? `<dl class="kv" style="margin-top:10px">
          <dt>Required parts</dt><dd>${d.required.map(p => `<span class="chip">${esc(partTypeName(p))}</span>`).join(" ")}</dd>
          <dt>Optional parts</dt><dd>${d.optional.map(p => `<span class="chip cat">${esc(partTypeName(p))}</span>`).join(" ") || "–"}</dd>
          ${d.notes ? `<dt>Notes</dt><dd class="small">${d.notes}</dd>` : ""}
        </dl>` : ""}
        ${g.quick.length ? `<p class="small muted" style="margin-top:10px"><b>Quick recipe:</b> ${g.quick[0].r.ingredients.map(ingText).join(" + ")} in one grid (skips making the main part first).</p>` : ""}
      </div>
      <div class="card">
        <h3>Main part: ${g.mainPart ? itemChip(g.mainPart) : "?"}</h3>
        ${g.materialCount ? `<p><b>Blueprint crafting:</b> ${esc(gearName(gear))} blueprint (or template) + <b>${g.materialCount}</b> material${g.materialCount > 1 ? "s" : ""}${g.extraIngredients.length ? " + " + g.extraIngredients.map(i => itemChip(i.items[0])).join(" + ") : ""}.</p>
          <p class="small muted">Materials: ${ruleText(g.materialRule)}. You can mix different materials, and each one counts toward stats and trait levels.</p>` : ""}
        ${g.casting.map((c, i) => `<p><b>Foundry casting</b> (Productive Metalworks): pour <b>${c.materialCount}×</b> molten material into ${itemChip(c.cast)}${c.consumeCast ? " (cast is consumed)" : " (cast is reusable)"}.</p>
          <p class="small muted">Materials: ${ruleText(c.material)}.</p>
          ${g.castMaking[i] ? `<p class="small muted">Make the cast: pour ${g.castMaking[i].fluid?.amount ?? "?"} mB <code>#${esc(g.castMaking[i].fluid?.tag || "")}</code> over a ${itemChip(g.castMaking[i].cast)}${g.castMaking[i].consumeCast ? " (the part is used up)" : ""}.</p>` : ""}`).join("")}
        ${g.partRecipes.filter(([rid]) => !rid.startsWith("silentgear:")).map(([rid, r]) => `<p class="small muted">Alternative (${esc(rid.split(":")[0])}): blueprint + ${r.ingredients.filter(i => i.items?.length).length}× ${r.ingredients.find(i => i.items?.length)?.items.map(x => esc(db.items[x]?.name || x)).join(" / ") || "?"}</p>`).join("")}
        ${mainPartDef ? `<p class="small muted">Base modifiers from the part itself: ${Object.entries(mainPartDef.properties || {}).filter(([k]) => k !== "traits").map(([k, v]) => `${esc(titleCase(k))} ${typeof v === "object" ? (v.operation === "ADD" ? "+" : esc(v.operation) + " ") + v.value : v}`).join(", ") || "none"}</p>` : ""}
      </div>
    </div>
    ${partSections()}`;
  renderGearIcon($("#gear-prev"), gear, { main: "silentgear:iron", rod: "silentgear:wood" });
}

// How the generic (non-main) parts are made
function partSections() {
  const rows = Object.entries(db.recipes)
    .filter(([rid, r]) => r.type === "silentgear:compound_part" && rid.startsWith("silentgear:part/"))
    .map(([, r]) => {
      const n = r.ingredients.filter(i => i.type === "silentgear:material").length;
      const extra = r.ingredients.filter(i => !i.type && i.items?.length);
      const cast = Object.values(db.recipes).find(c => c.type === "sgearmetalworks:sg_gear_casting" && c.result === r.result);
      return `<tr><td>${itemChip(r.result)}</td><td>blueprint + ${n}× material${extra.length ? " + " + extra.map(i => itemChip(i.items[0])).join(" + ") : ""}</td>
        <td class="small muted">${cast ? `or cast: ${cast.materialCount}× molten into ${itemChip(cast.cast)}` : ""}</td></tr>`;
    });
  return `<h2>Other parts</h2><div class="table-wrap"><table class="data"><thead><tr><th>Part</th><th>Blueprint recipe</th><th>Casting</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

