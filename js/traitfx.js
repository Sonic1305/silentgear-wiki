// Human-readable summaries for trait effects and conditions.
import { esc, fmt, pct, idPath, titleCase } from "./util.js";

let DB;
export function initTraitFx(db) { DB = db; }

function gearTypeName(id) {
  const p = idPath(id);
  return DB.lang[`gearType.silentgear.${p}`] || titleCase(p);
}
function propName(id) {
  const p = idPath(id).split("/")[0];
  return DB.lang[`property.silentgear.${p}`] || titleCase(p);
}
function thing(id) {
  if (!id) return "";
  const s = String(id);
  if (s.startsWith("#")) return `<code>${esc(s)}</code>`;
  const it = DB.items[s];
  return it ? esc(it.name) : esc(titleCase(idPath(s)));
}
function effectName(id) {
  return esc(titleCase(idPath(id)));
}
function levels(arr) {
  return Array.isArray(arr) ? arr.map(v => fmt(v)).join(" / ") : fmt(arr);
}
function ticks(t) { return `${fmt(t / 20, 1)}s`; }
function roman(n) { return ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] || n; }

export function conditionText(c) {
  if (!c || typeof c !== "object") return "";
  const t = idPath(c.type);
  switch (t) {
    case "gear_type": return `only on ${esc(gearTypeName(c.gear_type))}`;
    case "material_ratio": return `≥ ${fmt(c.ratio * 100, 0)}% of the part's materials`;
    case "material_count": return `≥ ${c.count} materials of this kind`;
    case "part_type": return `only on ${esc(titleCase(idPath(c.part_type)))} part`;
    case "not": return `NOT (${conditionText(c.value)})`;
    case "or": return (c.values || []).map(conditionText).join(" <b>or</b> ");
    case "and": return (c.values || []).map(conditionText).join(" <b>and</b> ");
    default: return `<code>${esc(JSON.stringify(c))}</code>`;
  }
}

export function effectText(e) {
  const t = e.type;
  const p = idPath(t);
  switch (p) {
    case "number_property_modifier": {
      let wear = false;
      const rows = Object.entries(e.property_modifiers || {}).map(([k, m]) => {
        const v = m.base_multiplier || 0;
        wear ||= m.multiply_damage_ratio;
        const amount = m.multiply_original_value ? `${pct(v, 1)} of the stat` : `${v > 0 ? "+" : ""}${fmt(v, 3)}`;
        return `<li><b>${esc(propName(k))}</b>: ${amount} per level${m.multiply_damage_ratio ? " × wear" : ""}</li>`;
      });
      return `Modifies stats:<ul>${rows.join("")}</ul>${wear ? '<div class="muted small">"× wear" = scales with how damaged the item is: 0 on a new item, full effect when almost broken.</div>' : ""}`;
    }
    case "attribute": {
      const rows = [];
      for (const [slot, mods] of Object.entries(e.attribute_modifiers || {})) {
        for (const m of mods) {
          const op = m.operation === "add_value" ? "+" : m.operation === "add_multiplied_base" ? "×base +" : "×total +";
          const isPct = m.operation !== "add_value";
          const vals = (m.values || []).map(v => (v > 0 ? "+" : "") + (isPct ? pct(v).replace(/^\+/, "") : fmt(v))).join(" / ");
          const [gt, sl] = slot.split("/");
          rows.push(`<li><b>${esc(titleCase(idPath(m.attribute).replace(/^generic\.|^player\./, "")))}</b> ${vals} <span class="muted small">(by trait level${gt && gt !== "all" ? "; " + esc(gearTypeName(gt)) : ""}${sl && sl !== "any" ? ", slot " + esc(sl) : ""})</span></li>`);
        }
      }
      return `Attribute bonus:<ul>${rows.join("")}</ul>`;
    }
    case "wielder_effect": {
      const rows = [];
      for (const [gt, list] of Object.entries(e.potion_effects || {})) {
        for (const pe of list) {
          const how = pe.type === "piece_count" ? "levels by number of armor pieces worn" : pe.type === "full_set" ? "full set required" : "while held/worn";
          rows.push(`<li><b>${effectName(pe.effect)}</b> ${(pe.levels || []).map(roman).join(" / ")} <span class="muted small">(${esc(gearTypeName(gt))}, ${how})</span></li>`);
        }
      }
      return `Grants effects to the wielder:<ul>${rows.join("")}</ul>`;
    }
    case "extra_damage":
      return `+${fmt(e.bonus_damage_per_level)} damage per level against <b>${esc(titleCase(e.affected_type || "?"))}</b> targets`;
    case "durability":
      return e.effect_scale < 0
        ? `${pct(e.activation_chance, 1)} chance per level to <b>save</b> ${Math.abs(e.effect_scale)} durability when the item is used`
        : `${pct(e.activation_chance, 1)} chance per level to lose <b>${e.effect_scale} extra</b> durability when the item is used`;
    case "negate_damage":
      return `Reduces incoming <code>#${esc(e.damage_type_tag)}</code> damage by ${pct(e.negated_damage_scale)} per level`;
    case "fireproof":
      return "Item cannot burn in fire or lava";
    case "synergy_multiplier":
      return `Synergy ${e.multiplier > 0 ? "+" : ""}${fmt(e.multiplier * 100, 1)}% per level <span class="muted small">(only matters for alloys)</span>`;
    case "enchantment":
      return "Applies enchantments: " + Object.entries(e.enchantments || {}).map(([k, v]) => `<b>${effectName(k)}</b> ${levels(v.map ? v.map(roman) : v)}`).join(", ") + ' <span class="muted small">(by trait level)</span>';
    case "item_magnet":
      return `Pulls in nearby ${esc(e.affected_items_text_for_wiki || "items")} (range ${fmt(e.effect_range)}, stronger with level)`;
    case "cancel_effects":
      return "Removes: " + (e.cleared_effects || []).map(effectName).join(", ");
    case "bonus_drops":
      return `${pct(e.base_chance)} chance per level to multiply ${esc(e.matched_items_text_for_wiki || "matching")} drops by ${fmt(1 + (e.bonus_multiplier || 0), 2)}×`;
    case "self_repair":
      return `Every second: ${pct(e.activation_chance, 1)} chance per level to repair ${e.repair_amount} durability per level`;
    case "block_mining_speed":
      return `${pct(e.speed_modifier)} mining speed per level on <code>#${esc(e.block_tag)}</code>`;
    case "block_placer": {
      const b = e.block?.Name || e.block;
      return `Right-click places <b>${thing(b)}</b> (costs ${e.damage_on_use} durability)`;
    }
    case "block_filler": {
      const fp = e.fill_properties || {};
      return `Right-click converts ${thing(e.target?.block || e.target?.tag && "#" + e.target.tag)} into <b>${thing(fp.block)}</b> in a ${fp.range_x * 2 + 1}×${fp.range_z * 2 + 1} area`;
    }
    case "target_effect": {
      const rows = [];
      for (const [gt, byLvl] of Object.entries(e.effects_by_level || {})) {
        const lv = Object.entries(byLvl).map(([l, effs]) => `L${l}: ${effs.map(x => `${effectName(x.id)} ${x.amplifier ? roman(x.amplifier + 1) : ""} ${ticks(x.duration)}`).join(", ")}`);
        rows.push(`<li>${esc(gearTypeName(gt))}: ${lv.join("; ")}</li>`);
      }
      return `Inflicts on hit:<ul>${rows.join("")}</ul>`;
    }
    case "wind_blast":
      return "Wind-charge style blast";
    case "attach_data_components":
      if (e.components?.["minecraft:food"]) {
        const f = e.components["minecraft:food"];
        return `Item becomes edible: ${f.nutrition} hunger, ${fmt(f.saturation)} saturation`;
      }
      return "Adds item data: " + Object.keys(e.components || {}).map(k => `<code>${esc(k)}</code>`).join(", ");
    case "critical_strike":
      return `${pct(e.activation_chance)} chance (per level) to deal ${pct(e.damage_multiplier)} extra damage`;
    default:
      return `<code>${esc(t)}</code>`;
  }
}
