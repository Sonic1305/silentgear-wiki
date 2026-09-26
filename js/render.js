// Draws Silent Gear style gear icons by tinting the mod's grayscale texture layers.
import { db } from "./db.js";
import { hexToRgb } from "./util.js";

const imgCache = new Map();
function loadImg(src) {
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise(res => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    }));
  }
  return imgCache.get(src);
}

function tex(path) {
  return db.textures[path] ? `icons/${db.textures[path]}.png` : null;
}

// Pick high/low contrast variant like the mod does (by material texture type)
function variant(gear, layer, mat) {
  const lc = mat && db.materials[mat]?.texType === "LOW_CONTRAST";
  return tex(`${gear}/${layer}_generic_${lc ? "lc" : "hc"}`) || tex(`${gear}/${layer}_generic_hc`) || tex(`${gear}/${layer}_generic_lc`) || tex(`${gear}/${layer}_generic`);
}

async function drawTinted(ctx, src, color) {
  if (!src) return;
  const im = await loadImg(src);
  if (!im) return;
  const w = 16, hgt = 16;
  const c = document.createElement("canvas");
  c.width = w; c.height = hgt;
  const x = c.getContext("2d");
  x.drawImage(im, 0, 0, w, hgt, 0, 0, w, hgt);
  if (color) {
    const d = x.getImageData(0, 0, w, hgt);
    const [r, g, b] = hexToRgb(color);
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = d.data[i] * r / 255;
      d.data[i + 1] = d.data[i + 1] * g / 255;
      d.data[i + 2] = d.data[i + 2] * b / 255;
    }
    x.putImageData(d, 0, 0);
  }
  ctx.drawImage(c, 0, 0);
}

function color(mat) {
  return mat ? db.materials[mat]?.color || "#FFFFFFFF" : null;
}

/**
 * parts: { main: matId, rod: matId, tip: matId, binding: matId, grip: matId, cord: matId, fletching: matId, setting: matId }
 */
export async function renderGearIcon(canvas, gear, parts = {}) {
  const ctx = canvas.getContext("2d");
  canvas.width = 16; canvas.height = 16;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 16, 16);
  const g = gear.replace("silentgear:", "");
  const main = parts.main || "silentgear:iron";
  if (parts.rod || tex(`${g}/rod_generic_hc`) || tex(`${g}/rod_generic_lc`)) {
    await drawTinted(ctx, variant(g, "rod", parts.rod), color(parts.rod || "silentgear:wood"));
  }
  if (parts.cord) await drawTinted(ctx, tex(`${g}/bowstring_string`), color(parts.cord));
  await drawTinted(ctx, variant(g, "main", main), color(main));
  if (tex(`${g}/guard_generic_hc`)) await drawTinted(ctx, variant(g, "guard", parts.rod || main), color(parts.rod || main));
  if (parts.tip) await drawTinted(ctx, tex(`${g}/tip_sharp`), color(parts.tip));
  if (parts.binding) await drawTinted(ctx, tex(`${g}/binding_generic`), color(parts.binding));
  if (parts.grip) await drawTinted(ctx, tex(`${g}/grip_wool`), color(parts.grip));
  if (parts.fletching) await drawTinted(ctx, tex(`${g}/fletching_generic`), color(parts.fletching));
  if (parts.setting) await drawTinted(ctx, tex(`${g}/adornment_generic`), color(parts.setting));
  await drawTinted(ctx, tex(`${g}/_highlight`), null);
}

export function renderBrand(canvas) {
  if (canvas) renderGearIcon(canvas, "sword", { main: "silentgear:crimson_steel", rod: "silentgear:wood/dark_oak" });
}
