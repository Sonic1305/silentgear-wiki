// Loads sgdata.json and exposes resolved lookups.
import { idPath, titleCase, plain } from "./util.js";

export const PART_TYPES = ["main", "rod", "tip", "grip", "binding", "coating", "lining", "cord", "fletching", "setting"];

// Stats shown in tables, in display order
export const STATS = [
  "durability", "armor_durability", "repair_efficiency", "repair_value", "enchantment_value", "rarity",
  "harvest_speed", "attack_damage", "attack_speed", "attack_reach", "block_reach", "magic_damage",
  "ranged_damage", "draw_speed", "projectile_speed", "projectile_accuracy", "charging_value",
  "armor", "armor_toughness", "magic_armor", "knockback_resistance",
];

export const db = {
  materials: {}, traits: {}, parts: {}, recipes: {}, items: {}, lang: {}, textures: {},
};

export async function loadDb() {
  const res = await fetch("data/sgdata.json");
  const raw = await res.json();
  Object.assign(db, raw);
  for (const [id, m] of Object.entries(db.materials)) {
    m.id = id;
    // show the "home" item first (e.g. silentgear:crimson_iron_ingot before other mods' copies)
    const ns = id.split(":")[0];
    const rank = it => { const n = it.split(":")[0]; return n === ns ? 0 : ["silentgear", "silentgems", "minecraft"].includes(n) ? 1 : 2; };
    for (const ing of [m.ingredient, ...Object.values(m.substitutes)]) ing.items.sort((a, b) => rank(a) - rank(b));
    m.props = resolveProps(id);
    m.obtainable = m.ingredient.items.length > 0 || Object.values(m.substitutes).some(s => s.items.length);
  }
  for (const [id, t] of Object.entries(db.traits)) t.id = id;
  for (const [id, p] of Object.entries(db.parts)) p.id = id;
  buildTraitIndex();
  return db;
}

// Material properties with parent inheritance applied (child keys override parent keys per stat)
function resolveProps(id, depth = 0) {
  const m = db.materials[id];
  if (!m || depth > 6) return {};
  const base = m.parent && m.parent !== "silentgear:empty" && db.materials[m.parent] ? resolveProps(m.parent, depth + 1) : {};
  const out = structuredClone(base);
  for (const [pt, props] of Object.entries(m.properties || {})) {
    out[pt] = { ...(out[pt] || {}), ...props };
  }
  return out;
}

// trait id -> [{material, partType, level, conditions}]
export const traitSources = {};
function buildTraitIndex() {
  for (const m of Object.values(db.materials)) {
    for (const [pt, props] of Object.entries(m.props)) {
      for (const t of props.traits || []) {
        (traitSources[t.trait] ||= []).push({ material: m.id, partType: pt, level: t.level, conditions: t.conditions || [] });
      }
    }
  }
  for (const p of Object.values(db.parts)) {
    for (const t of p.traits || []) {
      (traitSources[t.trait] ||= []).push({ part: p.id, partType: p.partType, level: t.level, conditions: t.conditions || [] });
    }
  }
}

export function statName(key) {
  const [base, gt] = key.split("/");
  const n = db.lang[`property.silentgear.${base}`] || titleCase(base);
  return gt ? `${n} (${gearTypeName(gt)})` : n;
}

export function partTypeName(pt) {
  const p = idPath(pt);
  return plain(db.lang[`part.silentgear.type.${p}`] || titleCase(p));
}

export function gearTypeName(gt) {
  const p = idPath(gt);
  return db.lang[`gearType.silentgear.${p}`] || titleCase(p);
}

export function traitName(id) {
  return db.traits[id]?.name || titleCase(idPath(id));
}

export function matName(id) {
  return db.materials[id]?.name || titleCase(idPath(id));
}

export function modName(ns) {
  return { silentgear: "Silent Gear", silentgems: "Silent Gems", sgearmetalworks: "SGear Metalworks" }[ns] || ns;
}

// Raw value of a stat on a material part-type block: number or {operation, value}
export function statValue(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return { op: "AVERAGE", value: v };
  if (typeof v === "object" && "value" in v) return { op: v.operation || "AVERAGE", value: v.value };
  return null;
}

export function harvestTier(props) {
  const ht = props?.harvest_tier;
  if (!ht) return null;
  const name = ht.name || idPath(ht.incorrect_blocks_for_tool || "");
  const label = db.lang[`harvestTier.silentgear.${name}`] || db.lang[`harvestTier.minecraft.${name}`] || titleCase(name);
  return { name, label, level: ht.level_hint !== undefined ? Number(ht.level_hint) : null };
}
