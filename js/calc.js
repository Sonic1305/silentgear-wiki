// Port of Silent Gear 4.2.1 gear stat & trait calculation (see sg-calc-spec: GearData, NumberProperty,
// CoreGearPart, TraitListProperty). All materials in one part are the same material in 4.2.1.
import { db, harvestTier } from "./db.js";
import { gearChain, relevantProps, isGearType, GEAR_DEFS } from "./geardefs.js";
import { fmt, idPath } from "./util.js";

// property -> { base, min, max, S: synergy-affected, G: grade-affected }
const BIG = 2147483647;
export const PROPS = {
  durability: { base: 0, min: 0, max: BIG, G: true },
  armor_durability: { base: 0, min: 0, max: 134217727, G: true },
  repair_efficiency: { base: 0, min: 0, max: 1000, def: 1 },
  repair_value: { base: 0, min: 0, max: 1000, def: 1 },
  enchantment_value: { base: 0, min: 0, max: BIG, G: true },
  charging_value: { base: 0, min: 0, max: BIG },
  rarity: { base: 0, min: 0, max: BIG },
  harvest_speed: { base: 0, min: 0, max: BIG, G: true },
  block_reach: { base: 0, min: -100, max: 100 },
  attack_damage: { base: 0, min: 0, max: BIG, G: true },
  attack_speed: { base: 0, min: -3.9, max: 4.0 },
  attack_reach: { base: 0, min: -100, max: 100 },
  magic_damage: { base: 0, min: 0, max: BIG, G: true },
  ranged_damage: { base: 0, min: 0, max: BIG, G: true },
  draw_speed: { base: 0, min: -10, max: 10 },
  projectile_speed: { base: 0, min: 0, max: BIG, def: 1 },
  projectile_accuracy: { base: 0, min: 0, max: 10000, def: 1 },
  armor: { base: 0, min: 0, max: BIG, G: true },
  armor_toughness: { base: 0, min: 0, max: BIG, G: true },
  knockback_resistance: { base: 0, min: 0, max: BIG, G: true },
  magic_armor: { base: 0, min: 0, max: BIG, G: true },
};

export const GRADES = { NONE: 0, E: 1, D: 2, C: 3, B: 4, A: 5, S: 10, SS: 15, SSS: 25, MAX: 30 };

// Stats worth showing for a gear type (hides the durability stat the gear doesn't use and material-only values)
export function DISPLAY_STATS(gear) {
  const hide = new Set(["harvest_tier", "charging_value", "repair_value"]);
  hide.add(durabilityStat(gear) === "durability" ? "armor_durability" : "durability");
  return relevantProps(gear).filter(p => !hide.has(p));
}

// ---------- number math (NumberProperty.java) ----------
const OPS = ["AVERAGE", "MAX", "ADD", "MULTIPLY_BASE", "MULTIPLY_TOTAL"];
const OP_ALIAS = { AVG: "AVERAGE", AVERAGE: "AVERAGE", MAX: "MAX", ADD: "ADD", MUL1: "MULTIPLY_BASE", MULTIPLY_BASE: "MULTIPLY_BASE", MUL2: "MULTIPLY_TOTAL", MULTIPLY_TOTAL: "MULTIPLY_TOTAL" };

function toMods(v) {
  if (v === undefined || v === null) return [];
  if (typeof v === "number") return [{ op: "AVERAGE", value: v }];
  if (Array.isArray(v)) return v.flatMap(toMods);
  if (typeof v === "object" && "value" in v) return [{ op: OP_ALIAS[String(v.operation || "AVERAGE").toUpperCase()] || "AVERAGE", value: v.value }];
  return [];
}

function primaryMod(mods, op) {
  let p = -1;
  for (const m of mods) if (m.op === op && p < 0) p = m.value;
  return p > 0 ? p : 1;
}

function weightedAvg(mods, op) {
  const p = primaryMod(mods, op);
  let ret = 0, tw = 0;
  for (const m of mods) if (m.op === op) { const w = 1 + m.value / (1 + Math.abs(p)); tw += w; ret += m.value * w; }
  return tw > 0 ? ret / tw : ret;
}

export function compute(base, mods, prop) {
  if (!mods.length) return base;
  let f0 = base + weightedAvg(mods, "AVERAGE");
  for (const m of mods) if (m.op === "MAX") f0 = Math.max(f0, m.value);
  let f1 = f0;
  for (const m of mods) if (m.op === "MULTIPLY_BASE") f1 += f0 * m.value;
  for (const m of mods) if (m.op === "MULTIPLY_TOTAL") f1 *= 1 + m.value;
  for (const m of mods) if (m.op === "ADD") f1 += m.value;
  return prop ? Math.min(prop.max, Math.max(prop.min, f1)) : f1;
}

function compress(mods) {
  const out = [];
  for (const op of OPS) {
    const g = mods.filter(m => m.op === op);
    if (g.length === 1) out.push(g[0]);
    else if (g.length > 1) out.push(op === "MAX" ? g.reduce((a, b) => (b.value > a.value ? b : a)) : { op, value: weightedAvg(g, op) });
  }
  return out;
}

// ---------- lookups ----------
// value of `prop` in a property map, walking the gear type chain (armor/boots -> armor/armor -> armor)
function mapLookup(map, prop, gear) {
  if (!map) return undefined;
  for (const t of gearChain(gear)) {
    const key = t === "all" ? prop : `${prop}/${t}`;
    if (key in map) return map[key];
  }
  return undefined;
}

// raw value for a material (own map first, then parent chain, per key)
function materialRaw(matId, pt, prop, gear, depth = 0) {
  const m = db.materials[matId];
  if (!m || depth > 8) return undefined;
  const own = mapLookup(m.properties?.[pt], prop, gear);
  if (own !== undefined && !(Array.isArray(own) && own.length === 0 && prop !== "traits")) return own;
  if (m.parent && m.parent !== "silentgear:empty") return materialRaw(m.parent, pt, prop, gear, depth + 1);
  return own;
}

export function supportsPart(matId, pt, depth = 0) {
  const m = db.materials[matId];
  if (!m || depth > 8) return false;
  if (m.properties?.[pt]) return true;
  return m.parent && m.parent !== "silentgear:empty" ? supportsPart(m.parent, pt, depth + 1) : false;
}

function materialNumberMods(matId, pt, prop, gear, grade) {
  const mods = toMods(materialRaw(matId, pt, prop, gear));
  const bonus = (GRADES[grade] || 0) / 100;
  if (bonus && PROPS[prop]?.G) return mods.map(m => ({ op: m.op, value: m.value + Math.abs(m.value) * bonus }));
  return mods;
}

export function mainPartDef(gear) {
  const main = Object.entries(db.recipes).find(([rid, r]) => r.type === "silentgear:gear_crafting" && r.result === "silentgear:" + gear && !rid.endsWith("_quick") && rid.startsWith("silentgear:"));
  const item = main?.[1].ingredients.find(i => i.items?.length)?.items[0];
  return Object.values(db.parts).find(p => p.item === item) || null;
}

function partJson(gear, pt) {
  if (pt === "main") return mainPartDef(gear);
  return Object.values(db.parts).find(p => p.partType === "silentgear:" + pt && p.type === "silentgear:core") || null;
}

// ---------- material eligibility ----------
export function usableIn(matId, pt, gear) {
  const m = db.materials[matId];
  if (!m) return { ok: false, why: "unknown material" };
  if (m.type === "silentgear:compound") return { ok: false, why: "alloy/mix: stats depend on the mixed materials" };
  if (m.type === "silentgear:processed") return { ok: false, why: "processed material (e.g. sheet metal)" };
  const ptId = "silentgear:" + pt;
  if (!supportsPart(matId, ptId)) return { ok: false, why: `not usable as ${pt}` };
  if (m.blacklist.some(b => isGearType(gear, b))) return { ok: false, why: "blacklisted for this gear" };
  if (materialRaw(matId, ptId, "additive", gear) === true) return { ok: false, why: "additive (only usable in alloys)" };
  if (pt === "main") {
    const d = GEAR_DEFS[gear];
    const durStat = durabilityStat(gear);
    if (d.durability !== "NONE" && !(compute(0, toMods(materialRaw(matId, ptId, durStat, gear))) > 0)) return { ok: false, why: "no durability for this gear" };
  }
  return { ok: true };
}

// ---------- traits ----------
function traitIntrinsicConds(tid) {
  return db.traits[tid]?.conditions || [];
}

// Part-context condition check (material_count / ratio for a single-material part)
function partCondOk(c, ctx) {
  const t = idPath(c.type);
  switch (t) {
    case "gear_type": return ctx.isMain ? isGearType(ctx.partGearType, c.gear_type) : true;
    case "material_count": return ctx.count >= c.count;
    case "material_ratio": return 1.0 >= c.ratio;
    case "not": return !partCondOk(c.value, ctx);
    case "and": return (c.values || []).every(v => partCondOk(v, ctx));
    case "or": return (c.values || []).some(v => partCondOk(v, ctx));
    default: return true;
  }
}

function gearCondOk(c, gear) {
  const t = idPath(c.type);
  switch (t) {
    case "gear_type": return isGearType(gear, c.gear_type);
    case "not": return !gearCondOk(c.value, gear);
    case "and": return (c.values || []).every(v => gearCondOk(v, gear));
    case "or": return (c.values || []).some(v => gearCondOk(v, gear));
    default: return true; // count / ratio were resolved at part level
  }
}

function condText(c) {
  const t = idPath(c.type);
  if (t === "gear_type") return `needs ${idPath(c.gear_type)}`;
  if (t === "material_count") return `needs ${c.count} materials`;
  if (t === "material_ratio") return `needs ${Math.round(c.ratio * 100)}% of part`;
  if (t === "not") return `not (${condText(c.value)})`;
  if (t === "or" || t === "and") return (c.values || []).map(condText).join(` ${t} `);
  return t;
}

function computeTraits(instances, maxLvl) {
  if (!instances.length) return [];
  const N = instances.length;
  const sum = new Map(), cnt = new Map(), src = new Map();
  for (const i of instances) {
    if (!(i.level > 0)) continue;
    sum.set(i.trait, (sum.get(i.trait) || 0) + i.level);
    cnt.set(i.trait, (cnt.get(i.trait) || 0) + 1);
    const s = src.get(i.trait) || new Set();
    (i.from || []).forEach(f => s.add(f));
    src.set(i.trait, s);
  }
  const out = [];
  for (const [t, s] of sum) {
    const divisor = Math.min(N / 2, cnt.get(t));
    const level = Math.max(1, Math.min(maxLvl(t), Math.round(s / divisor)));
    out.push({ trait: t, level, conditions: instances.find(i => i.trait === t)?.conditions || [], from: [...src.get(t)] });
  }
  return out;
}

// ---------- gear ----------
export function durabilityStat(gear) {
  return isGearType(gear, "armor") || gear === "shield" ? "armor_durability" : "durability";
}

function maxDamage(gear, fin) {
  const d = GEAR_DEFS[gear]?.durability || "D";
  const D = fin.durability ?? 0, AD = fin.armor_durability ?? 0;
  if (d === "D") return Math.round(D);
  if (d.startsWith("ARMOR:")) return +d.split(":")[1] * Math.trunc(AD);
  if (d === "ELYTRA") return Math.trunc(25 * AD);
  if (d === "SHIELD") return Math.round(337 / 15 * AD);
  return null;
}

function bestTier(tiers) {
  let best = null;
  for (const t of tiers) {
    const ht = harvestTier({ harvest_tier: t });
    if (!ht) continue;
    if (!best || (ht.level ?? 0) > (best.level ?? 0)) best = ht;
  }
  return best;
}

/**
 * gear: "sword"; parts: { main: {mat, count}, rod: {mat, count}, ... }; opts: { grade, wear (0..1), upgrades: [partId] }
 */
export function calculate(gear, parts, opts = {}) {
  const errors = [], notes = [];
  const grade = opts.grade || "NONE";
  const order = ["main", "rod", "cord", "fletching", "setting", "tip", "grip", "binding", "coating", "lining"];
  const list = order.filter(pt => parts[pt]?.mat).map(pt => ({ pt, ...parts[pt], json: partJson(gear, pt) }));
  for (const u of opts.upgrades || []) if (db.parts[u]) list.push({ pt: "misc_upgrade", mat: null, count: 0, json: db.parts[u], upgrade: true });

  for (const p of list) {
    if (p.mat) {
      const u = usableIn(p.mat, p.pt, gear);
      if (!u.ok) errors.push(`${db.materials[p.mat]?.name || p.mat} can't be used as ${p.pt}: ${u.why}.`);
    }
  }
  const d = GEAR_DEFS[gear];
  for (const r of d?.required || []) if (!parts[r]?.mat) errors.push(`Missing required part: ${r}.`);

  // --- numbers ---
  const base = {};
  const props = relevantProps(gear);
  for (const prop of props) {
    if (prop === "harvest_tier") continue;
    let mods = [];
    for (const p of list) {
      let pm = [];
      if (p.mat) for (let i = 0; i < p.count; i++) pm.push(...materialNumberMods(p.mat, "silentgear:" + p.pt, prop, gear, grade));
      pm.push(...toMods(mapLookup(p.json?.properties, prop, gear)));
      if (pm.length) mods.push(...compress(pm));
    }
    base[prop] = compute(PROPS[prop].base, mods, PROPS[prop]);
  }
  // --- harvest tier ---
  let tier = null;
  if (props.includes("harvest_tier")) {
    const tiers = [];
    for (const p of list) if (p.mat) {
      const t = materialRaw(p.mat, "silentgear:" + p.pt, "harvest_tier", gear);
      if (t) tiers.push(t);
    }
    tier = bestTier(tiers) || { label: "Wood", level: 0, name: "wood" };
  }

  // --- traits ---
  const instances = [];
  const dropped = [];
  for (const p of list) {
    const ptId = "silentgear:" + p.pt;
    const matName = p.mat ? db.materials[p.mat]?.name : null;
    const partName = p.upgrade ? p.json.name : (p.pt === "main" ? "main" : p.pt);
    const lists = [];
    if (p.mat) {
      const tl = materialRaw(p.mat, ptId, "traits", gear) || [];
      for (let i = 0; i < p.count; i++) lists.push(tl);
    }
    lists.push(p.json?.traits || []);
    const ctx = { isMain: p.pt === "main", partGearType: p.json?.gearType || "silentgear:all", count: p.count };
    for (const tl of lists) {
      for (const ti of tl) {
        const conds = [...(ti.conditions || [])];
        if (!conds.every(c => partCondOk(c, ctx))) {
          dropped.push({ trait: ti.trait, why: conds.map(condText).join(", ") });
          continue;
        }
        instances.push({ trait: ti.trait, level: ti.level, conditions: [...conds, ...traitIntrinsicConds(ti.trait)], from: [`${matName || partName} (${partName})`] });
      }
    }
  }
  const maxLvl = t => db.traits[t]?.maxLevel ?? 5;
  let traits = computeTraits(instances, maxLvl);
  const filter = arr => arr.filter(t => {
    const ok = t.conditions.every(c => gearCondOk(c, gear));
    if (!ok) dropped.push({ trait: t.trait, why: t.conditions.map(condText).join(", ") });
    return ok;
  });
  traits = filter(traits);
  // final pass (a gear with a single trait gets it doubled)
  const fromMap = new Map(traits.map(t => [t.trait, t.from]));
  traits = computeTraits(traits.map(t => ({ ...t })), maxLvl).map(t => ({ ...t, from: fromMap.get(t.trait) }));
  const seenDrop = new Set();
  const droppedTraits = dropped.filter(x => !traits.some(t => t.trait === x.trait) && !seenDrop.has(x.trait) && seenDrop.add(x.trait));

  // --- bonus pass (trait stat modifiers; scale with wear) ---
  const baseDur = durabilityStat(gear) === "armor_durability" ? (maxDamage(gear, base) || 0) : Math.round(base.durability || 0);
  const wear = Math.max(0, Math.min(1, opts.wear || 0));
  const fin = {};
  for (const prop of Object.keys(base)) {
    const bonus = [];
    for (const t of traits) for (const e of db.traits[t.trait]?.effects || []) {
      const m = e.type === "silentgear:number_property_modifier" && e.property_modifiers?.["silentgear:" + prop];
      if (!m) continue;
      let add = (m.base_multiplier || 0) * t.level;
      if (m.multiply_damage_ratio) add *= wear;
      if (m.multiply_original_value) add *= base[prop];
      bonus.push({ op: "ADD", value: add });
    }
    fin[prop] = compute(PROPS[prop].base, [{ op: "AVERAGE", value: base[prop] }, ...bonus], PROPS[prop]);
  }

  // --- derived / in-game values ---
  const derived = [];
  const md = maxDamage(gear, fin);
  if (md !== null) derived.push(["Max durability (uses)", fmt(md, 0)]);
  if (gear === "arrow") derived.push(["Arrows per craft", fmt(Math.max(1, Math.min(64, Math.round((fin.durability || 0) / 32.5))), 0)]);
  if (props.includes("attack_damage") && isGearType(gear, "tool")) {
    derived.push(["Tooltip attack damage", fmt(1 + (fin.attack_damage || 0), 2)]);
    derived.push(["Tooltip attack speed", fmt(fin.attack_speed || 0, 2)]);
  }
  if (isGearType(gear, "armor") && gear !== "elytra") {
    derived.push(["Armor toughness (attribute)", fmt((fin.armor_toughness || 0) / 4, 2)]);
    if (fin.knockback_resistance > 0) derived.push(["Knockback resistance (attribute)", fmt(fin.knockback_resistance / 10, 2)]);
  }
  if (["bow", "slingshot"].includes(gear)) derived.push(["Draw time", `${fmt(Math.min(100, Math.max(10, 20 / ((fin.draw_speed || 0) <= 0 ? 1 : fin.draw_speed))) / 20, 2)} s`]);
  if (gear === "crossbow") derived.push(["Charge time", `${fmt(Math.round(Math.min(50, Math.max(5, 25 / (fin.draw_speed || 1)))) / 20, 2)} s`]);
  if (["bow", "crossbow", "slingshot"].includes(gear)) derived.push([gear === "slingshot" ? "Arrow damage (shot)" : "Arrow damage (vanilla arrow)", fmt(2 - 1 + (fin.ranged_damage || 0), 2)]);
  if (props.includes("enchantment_value")) derived.push(["Enchantability", fmt(Math.trunc(fin.enchantment_value || 0), 0)]);
  if (props.includes("rarity")) {
    const r = Math.trunc(fin.rarity || 0);
    derived.push(["Rarity tier", r < 40 ? "Common" : r < 80 ? "Uncommon" : r < 120 ? "Rare" : "Epic"]);
  }
  if (tier) notes.push("Harvest tier is the best tier among all parts.");
  if (traits.some(t => (db.traits[t.trait]?.effects || []).some(e => e.type === "silentgear:number_property_modifier"))) {
    notes.push("Stat-modifying traits (e.g. Sharp, Accelerate) scale with how damaged the item is. Use the wear slider to see their effect.");
  }

  const nameKey = `item.silentgear.${gear}.nameProper`;
  const main = parts.main?.mat && db.materials[parts.main.mat];
  const name = main && db.lang[nameKey] ? db.lang[nameKey].replace("%s", main.name) : null;
  return { stats: fin, base, tier, traits, droppedTraits, derived, errors, notes, name };
}
