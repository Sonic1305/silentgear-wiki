// Gear type tree and per-item definitions (from Silent Gear 4.2.1 source: GearTypes.java, item classes).

// gear type -> parent
export const GEAR_PARENT = {
  all: null, tool: "all", weapon: "tool", armor: "all", harvest_tool: "tool", melee_weapon: "weapon",
  ranged_weapon: "weapon", hybrid_weapon: "weapon", curio: "all", projectile: "all",
  pickaxe: "harvest_tool", shovel: "harvest_tool", axe: "harvest_tool", hoe: "harvest_tool", shears: "harvest_tool",
  hammer: "pickaxe", excavator: "shovel", saw: "axe", sickle: "harvest_tool", mattock: "harvest_tool",
  paxel: "harvest_tool", prospector_hammer: "pickaxe",
  sword: "melee_weapon", katana: "melee_weapon", machete: "melee_weapon", spear: "melee_weapon", mace: "melee_weapon",
  dagger: "melee_weapon", knife: "melee_weapon",
  bow: "ranged_weapon", crossbow: "ranged_weapon", slingshot: "ranged_weapon", trident: "hybrid_weapon",
  fishing_rod: "tool", shield: "tool",
  helmet: "armor", chestplate: "armor", leggings: "armor", boots: "armor", elytra: "armor",
  arrow: "projectile", ring: "curio", bracelet: "curio", necklace: "curio",
};

// Own property groups; types without an entry inherit their parent's
const GROUPS = {
  all: ["SPECIAL", "GENERAL"],
  tool: ["SPECIAL", "GENERAL", "HARVEST", "ATTACK"],
  armor: ["SPECIAL", "GENERAL", "ARMOR"],
  ranged_weapon: ["SPECIAL", "GENERAL", "PROJECTILE"],
  hybrid_weapon: ["SPECIAL", "GENERAL", "ATTACK", "PROJECTILE"],
  curio: ["SPECIAL"],
  projectile: ["SPECIAL", "GENERAL", "PROJECTILE"],
  fishing_rod: ["SPECIAL", "GENERAL"],
  shield: ["SPECIAL", "GENERAL"],
};

export const PROPERTY_GROUPS = {
  GENERAL: ["durability", "armor_durability", "repair_efficiency", "repair_value", "enchantment_value", "charging_value", "rarity"],
  HARVEST: ["harvest_tier", "harvest_speed", "block_reach"],
  ATTACK: ["attack_damage", "attack_speed", "attack_reach", "magic_damage"],
  PROJECTILE: ["ranged_damage", "draw_speed", "projectile_speed", "projectile_accuracy"],
  ARMOR: ["armor", "armor_toughness", "knockback_resistance", "magic_armor"],
};

export function gearChain(type) {
  const out = [];
  let t = String(type).replace("silentgear:", "");
  while (t) { out.push(t); t = GEAR_PARENT[t]; }
  return out;
}

// does gear type `type` match `other` (equal, other == all, or an ancestor)
export function isGearType(type, other) {
  const o = String(other).replace("silentgear:", "");
  return o === "all" || gearChain(type).includes(o);
}

export function relevantProps(type) {
  for (const t of gearChain(type)) {
    if (GROUPS[t]) return GROUPS[t].flatMap(g => PROPERTY_GROUPS[g] || []);
  }
  return [];
}

const TOOL_OPT = ["tip", "grip", "binding", "coating"];
const ARMOR_OPT = ["lining", "tip", "binding", "coating"];
const CURIO_OPT = ["tip", "binding", "coating"];

// durability: how Item.getMaxDamage is derived (see calc.js maxDamage)
function def(required, optional, durability = "D", notes = "") {
  return { required, optional, durability, notes };
}

export const GEAR_DEFS = {
  sword: def(["main", "rod"], TOOL_OPT),
  katana: def(["main", "rod"], TOOL_OPT),
  machete: def(["main", "rod"], TOOL_OPT),
  knife: def(["main", "rod"], TOOL_OPT),
  dagger: def(["main", "rod"], TOOL_OPT),
  spear: def(["main", "rod"], TOOL_OPT),
  trident: def(["main", "rod"], TOOL_OPT),
  mace: def(["main", "rod"], TOOL_OPT, "D", "The mace core also needs a Heavy Core."),
  shield: def(["main", "rod"], TOOL_OPT, "SHIELD"),
  bow: def(["main", "rod", "cord"], TOOL_OPT),
  crossbow: def(["main", "rod", "cord"], TOOL_OPT),
  slingshot: def(["main", "rod", "cord"], TOOL_OPT),
  arrow: def(["main", "rod", "fletching"], ["tip", "coating"], "ARROW"),
  pickaxe: def(["main", "rod"], TOOL_OPT),
  shovel: def(["main", "rod"], TOOL_OPT),
  axe: def(["main", "rod"], TOOL_OPT),
  paxel: def(["main", "rod"], TOOL_OPT),
  hammer: def(["main", "rod"], TOOL_OPT, "D", "Mines 3×3."),
  excavator: def(["main", "rod"], TOOL_OPT, "D", "Digs 3×3."),
  saw: def(["main", "rod"], TOOL_OPT, "D", "Fells whole trees."),
  prospector_hammer: def(["main", "rod"], TOOL_OPT, "D", "Right-click to scan for ores."),
  hoe: def(["main", "rod"], TOOL_OPT),
  mattock: def(["main", "rod"], TOOL_OPT, "D", "Shovel + axe + hoe in one."),
  sickle: def(["main", "rod"], TOOL_OPT, "D", "Harvests crops in an area."),
  shears: def(["main", "rod"], TOOL_OPT),
  fishing_rod: def(["main", "rod", "cord"], TOOL_OPT),
  helmet: def(["main"], ARMOR_OPT, "ARMOR:11"),
  chestplate: def(["main"], ARMOR_OPT, "ARMOR:16"),
  leggings: def(["main"], ARMOR_OPT, "ARMOR:15"),
  boots: def(["main"], ARMOR_OPT, "ARMOR:13"),
  elytra: def(["main", "binding"], ["lining", "tip"], "ELYTRA", "Wings must be made from cloth or sheet materials."),
  ring: def(["main"], ["setting", ...CURIO_OPT], "NONE", "Curios only compute traits (no stats). The band must be metal; a gem setting is optional."),
  bracelet: def(["main"], ["setting", ...CURIO_OPT], "NONE", "Curios only compute traits (no stats). The band must be metal; a gem setting is optional."),
  necklace: def(["main"], ["setting", ...CURIO_OPT], "NONE", "Curios only compute traits (no stats). The chain must be metal; a gem setting is optional."),
};
for (const [k, d] of Object.entries(GEAR_DEFS)) d.parents = gearChain(k).slice(1).filter(t => t !== "all").map(t => "silentgear:" + t);
