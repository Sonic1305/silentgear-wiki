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

// What each weapon is good at (checked against the 4.2.1 item classes and part stats)
export const WEAPON_ROLES = {
  sword: {
    tag: "All-rounder, sweep attack hits groups",
    text: "The balanced choice: +3 damage at 1.6 attack speed, and the sweep attack hits several mobs at once. Pick this if you're unsure.",
  },
  katana: {
    tag: "Big hits for bosses and 1-on-1",
    text: "Highest blade damage (+4) but slower swings (1.4). Keeps the sword sweep, has 12.5% more durability and slightly lower enchantability. Needs 3 materials.",
  },
  machete: {
    tag: "Fast blade that also clears plants",
    text: "Fastest sword-type weapon (1.8 speed) with lower damage (+2) and 40% more harvest speed. Breaking a plant also cuts plants around it (sneak to cut just one block). Great for jungles, exploring and farms.",
  },
  dagger: {
    tag: "Very fast combo hits on one target",
    text: "Very fast (2.8 speed) but weak per hit (+2, half the material's base damage). Enemies become hittable again sooner (their invulnerability time is cut to 67%), so fast clicking pays off. Only 1 material.",
  },
  knife: {
    tag: "Cheap utility blade, quick hits",
    text: "1 material, fast (2.4 speed), low damage (+1, half the material's base damage), 25% more durability and double repair efficiency. Has the same quicker re-hit as the dagger. Also used to cut logs into template boards for early blueprints.",
  },
  spear: {
    tag: "+1 block reach, hit before they hit you",
    text: "+1 block attack reach, so you hit mobs before they reach you. +3 damage, slow (1.3 speed), 20% less durability, no sweep attack. Good for fighting from behind blocks or holding a doorway.",
  },
  mace: {
    tag: "Huge damage when falling from height",
    text: "Works like the vanilla mace: the smash attack does bonus damage based on how far you fell. +3 damage, very slow (0.6 speed), double durability. Best combined with wind charges or an elytra. The mace core also needs a Heavy Core.",
  },
  trident: {
    tag: "Strong melee and can be thrown, good in water",
    text: "Strong melee (+4 damage, 1.1 speed) and can be thrown like a vanilla trident. Riptide works, and projectile speed makes throws and Riptide stronger. Ideal for ocean fights and water travel.",
  },
  bow: {
    tag: "Flexible ranged weapon",
    text: "Standard ranged weapon: +1 ranged damage and a flexible charge. Shoots any arrows, including Silent Gear arrows. Draw speed decides how fast you reach full power.",
  },
  crossbow: {
    tag: "Strongest single shots",
    text: "+2 ranged damage, the most of the ranged weapons. It has to be loaded first, but it can stay loaded and also fires fireworks. Slower rate of fire than a bow.",
  },
  slingshot: {
    tag: "Cheap early ranged, shoots pebbles",
    text: "Shoots pebbles instead of arrows. Fastest draw (+1.5 draw speed) but low damage (ranged damage −75%, then +0.5). Only 2 materials, handy early on.",
  },
  arrow: {
    tag: "Custom ammo for bows and crossbows",
    text: "The arrow head material sets the damage, and tips or coatings add traits. One craft makes a whole stack depending on durability.",
  },
};

// Play style -> recommended weapons
export const WEAPON_STYLES = [
  ["Fighting groups of mobs", ["sword", "machete"]],
  ["Bosses and single strong enemies", ["katana", "mace", "crossbow"]],
  ["Fast clicking and combos", ["dagger", "knife"]],
  ["Keeping distance in melee", ["spear"]],
  ["Water and throwing", ["trident"]],
  ["Attacking from above", ["mace"]],
  ["Ranged, all-purpose", ["bow"]],
  ["Ranged, cheap and early", ["slingshot"]],
];
