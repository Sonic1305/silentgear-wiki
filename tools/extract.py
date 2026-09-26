"""Extract Silent Gear (+ addons) data from a modpack's mods folder into site/data.

Usage: python tools/extract.py "C:/Gameserver/TNP Limitless 8" [path/to/minecraft-client-1.21.1.jar]

Reads every jar once: Silent Gear materials/parts/traits/recipes, item tags,
en_us lang files and item textures. Writes data/sgdata.json and icons/*.png.
"""
import io
import json
import re
import sys
import zipfile
from datetime import date
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DATA = ROOT / "data"
OUT_ICONS = ROOT / "icons"

SG_KINDS = ("silentgear_materials", "silentgear_parts", "silentgear_traits")
# Mods whose Silent Gear data is loaded after silentgear and may override it (load order).
LOAD_ORDER = ["silentgear", "silentgems", "sgearmetalworks"]
CRAFTING_TYPES = {"minecraft:crafting_shaped", "minecraft:crafting_shapeless", "silentgear:tool_action"}
RECIPE_TYPES = {
    "silentgear:gear_crafting", "silentgear:compound_part", "silentgear:alloy_making",
    "silentgear:alloy_making/gem", "silentgear:alloy_making/metal", "silentgear:alloy_making/fabric",
    "silentgear:alloy_making/stone", "silentgear:alloy_making/hybrid_gem", "silentgear:alloy_making/super_alloy",
    "sgearmetalworks:sg_gear_casting", "productivemetalworks:item_casting",
}


def strip_json(text):
    # Some mods ship JSON with comments / trailing commas
    text = re.sub(r"^\s*//.*$", "", text, flags=re.M)
    text = re.sub(r",(\s*[}\]])", r"\1", text)
    return json.loads(text)


def read_json(zf, name):
    raw = zf.read(name).decode("utf-8-sig", errors="replace")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        try:
            return strip_json(raw)
        except json.JSONDecodeError:
            return None


class Pack:
    def __init__(self, mods_dir, extra_data_dirs, base_jars=()):
        self.lang = {}
        self.tags = {}  # tag id -> set of entries ("#tag" or "item")
        self.textures = {}  # "ns:path" -> (jar path, zip entry)
        self.models = {}  # "ns:path" (models/...) -> (jar, entry)
        self.sg = {k: {} for k in SG_KINDS}  # id -> (modid-of-jar, json)
        self.sg_src = {k: {} for k in SG_KINDS}
        self.recipes = {}
        self.crafting = {}  # plain crafting / tool-action recipes from the SG mods (for the guide)
        self.mod_versions = {}
        self.namespaces = set()
        jars = list(base_jars) + sorted(Path(mods_dir).glob("*.jar"))
        sg_jars = []
        for jar in jars:
            try:
                zf = zipfile.ZipFile(jar)
            except zipfile.BadZipFile:
                continue
            names = zf.namelist()
            self._scan_generic(jar, zf, names)
            modid = self._mod_id(zf, names)
            if any("/silentgear_" in n for n in names) or modid in LOAD_ORDER:
                sg_jars.append((modid, jar, names))
            zf.close()
        # SG data in load order so overrides win
        sg_jars.sort(key=lambda t: LOAD_ORDER.index(t[0]) if t[0] in LOAD_ORDER else 99)
        for modid, jar, names in sg_jars:
            with zipfile.ZipFile(jar) as zf:
                self._scan_sg(modid, zf, names)
        for d in extra_data_dirs:
            self._scan_dir_tags(Path(d))

    def _mod_id(self, zf, names):
        if "META-INF/neoforge.mods.toml" in names:
            toml = zf.read("META-INF/neoforge.mods.toml").decode("utf-8", "replace")
            m = re.search(r'modId\s*=\s*"([^"]+)"', toml)
            v = re.search(r'^\s*version\s*=\s*"([^"]+)"', toml, re.M)
            if m:
                ver = v.group(1) if v else "?"
                if ver.startswith("${"):
                    mf = zf.read("META-INF/MANIFEST.MF").decode("utf-8", "replace") if "META-INF/MANIFEST.MF" in names else ""
                    mv = re.search(r"Implementation-Version:\s*(\S+)", mf)
                    ver = mv.group(1) if mv else "?"
                self.mod_versions[m.group(1)] = ver
                return m.group(1)
        return None

    def _scan_generic(self, jar, zf, names):
        for n in names:
            if n.endswith("/lang/en_us.json") and n.startswith("assets/"):
                d = read_json(zf, n)
                if isinstance(d, dict):
                    self.lang.update({k: v for k, v in d.items() if isinstance(v, str)})
            elif n.startswith("data/") and ("/tags/item/" in n or "/tags/items/" in n) and n.endswith(".json"):
                parts = n.split("/")
                ns = parts[1]
                path = "/".join(parts[4:])[:-5]
                d = read_json(zf, n)
                if isinstance(d, dict):
                    self._add_tag(f"{ns}:{path}", d)
            elif n.startswith("assets/") and n.endswith(".png") and "/textures/" in n:
                parts = n.split("/")
                self.textures[f"{parts[1]}:{'/'.join(parts[3:])[:-4]}"] = (jar, n)
            elif n.startswith("assets/") and "/models/" in n and n.endswith(".json"):
                parts = n.split("/")
                self.models[f"{parts[1]}:{'/'.join(parts[3:])[:-5]}"] = (jar, n)
            if n.startswith("assets/") and n.count("/") >= 2:
                self.namespaces.add(n.split("/")[1])

    def _add_tag(self, tag, d):
        s = self.tags.setdefault(tag, [])
        if d.get("replace"):
            s.clear()
        for v in d.get("values", []):
            if isinstance(v, dict):
                v = v.get("id")
            if isinstance(v, str) and v not in s:
                s.append(v)

    def _scan_dir_tags(self, base):
        for p in base.glob("**/data/*/tags/item*/**/*.json"):
            rel = p.relative_to(base).as_posix()
            m = re.search(r"data/([^/]+)/tags/items?/(.+)\.json$", rel)
            if m:
                try:
                    self._add_tag(f"{m.group(1)}:{m.group(2)}", json.loads(p.read_text("utf-8-sig")))
                except (json.JSONDecodeError, OSError):
                    pass

    def _scan_sg(self, modid, zf, names):
        for n in names:
            if not (n.startswith("data/") and n.endswith(".json")):
                continue
            parts = n.split("/")
            ns, kind = parts[1], parts[2]
            if kind in SG_KINDS:
                rid = f"{ns}:{'/'.join(parts[3:])[:-5]}"
                d = read_json(zf, n)
                if d is not None:
                    self.sg[kind][rid] = d
                    self.sg_src[kind].setdefault(rid, [])
                    self.sg_src[kind][rid].append(modid)
            elif kind == "recipe":
                d = read_json(zf, n)
                if (isinstance(d, dict) and d.get("type") in RECIPE_TYPES
                        and not (d["type"] == "productivemetalworks:item_casting" and ns != "sgearmetalworks")):
                    self.recipes[f"{ns}:{'/'.join(parts[3:])[:-5]}"] = d
                elif isinstance(d, dict) and d.get("type") in CRAFTING_TYPES and ns in ("silentgear", "sgearmetalworks"):
                    self.crafting[f"{ns}:{'/'.join(parts[3:])[:-5]}"] = d

    # ---------- helpers ----------
    def resolve_tag(self, tag, seen=None):
        seen = seen or set()
        if tag in seen:
            return []
        seen.add(tag)
        out = []
        for v in self.tags.get(tag, []):
            if v.startswith("#"):
                out += self.resolve_tag(v[1:], seen)
            elif v not in out:
                out.append(v)
        return out

    def item_exists(self, item):
        ns, path = item.split(":", 1)
        return (f"item.{ns}.{path}" in self.lang or f"block.{ns}.{path}" in self.lang
                or f"{ns}:item/{path}" in self.models)

    def item_name(self, item):
        ns, path = item.split(":", 1)
        for k in (f"item.{ns}.{path}", f"block.{ns}.{path}"):
            if k in self.lang:
                return re.sub(r"\s*%s\s*", " ", self.lang[k]).strip()
        return path.replace("_", " ").replace("/", " ").title()

    def _model(self, mid, depth=0):
        """Return merged textures dict + list of parents for a model id."""
        if depth > 8 or mid not in self.models:
            return {}, []
        jar, entry = self.models[mid]
        with zipfile.ZipFile(jar) as zf:
            d = read_json(zf, entry) or {}
        tex, parents = {}, []
        parent = d.get("parent")
        if isinstance(parent, str):
            pid = parent if ":" in parent else f"minecraft:{parent}"
            parents.append(pid)
            ptex, pp = self._model(pid, depth + 1)
            tex.update(ptex)
            parents += pp
        tex.update({k: v for k, v in (d.get("textures") or {}).items() if isinstance(v, str)})
        return tex, parents

    def item_texture(self, item):
        ns, path = item.split(":", 1)
        tex, parents = self._model(f"{ns}:item/{path}")
        if not tex:
            tex, parents = self._model(f"{ns}:block/{path}")

        def res(v, n=0):
            while v.startswith("#") and n < 10:
                v = tex.get(v[1:], "")
                n += 1
            return v if ":" in v else (f"minecraft:{v}" if v else "")

        layers = [res(tex[f"layer{i}"]) for i in range(4) if f"layer{i}" in tex]
        layers = [t for t in layers if t in self.textures]
        if len(layers) > 1:
            return layers  # composited in save_icon (e.g. blueprint paper + pattern)
        for key in ("layer0", "all", "side", "front", "texture", "top", "end", "cross", "particle"):
            if key in tex:
                t = res(tex[key])
                if t in self.textures:
                    return t
        for guess in (f"{ns}:item/{path}", f"{ns}:block/{path}"):
            if guess in self.textures:
                return guess
        return None


def save_icon(pack, tex_id, out_name):
    dest = OUT_ICONS / (out_name + ".png")
    if dest.exists():
        return True
    img = None
    for tid in (tex_id if isinstance(tex_id, list) else [tex_id]):
        jar, entry = pack.textures[tid]
        with zipfile.ZipFile(jar) as zf:
            layer = Image.open(io.BytesIO(zf.read(entry))).convert("RGBA")
        w, h = layer.size
        if h > w:  # animated strip: first frame
            layer = layer.crop((0, 0, w, w))
        if img is None:
            img = layer
        else:
            if layer.size != img.size:
                layer = layer.resize(img.size, Image.NEAREST)
            img = Image.alpha_composite(img, layer)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, optimize=True)
    return True


def icon_for_item(pack, item, cache):
    if item in cache:
        return cache[item]
    tex = pack.item_texture(item)
    rel = None
    if tex:
        rel = "i/" + item.replace(":", "/")
        save_icon(pack, tex, rel)
    cache[item] = rel
    return rel


def ingredient_items(pack, ing):
    """Return (label, [item ids]) for an ingredient JSON."""
    if not isinstance(ing, dict):
        return None, []
    if "item" in ing:
        return ing["item"], [ing["item"]]
    if "tag" in ing:
        items = [i for i in pack.resolve_tag(ing["tag"]) if pack.item_exists(i)]
        return "#" + ing["tag"], items
    if "items" in ing and isinstance(ing["items"], list):
        return None, ing["items"]
    return None, []


def flatten_ing(ing):
    """A list ingredient (any of several) -> merged dict-ish list of items/tags."""
    return ing if not isinstance(ing, list) else {"any": ing}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    pack_dir = Path(sys.argv[1])
    extra = [pack_dir / "config/paxi/datapacks", pack_dir / "kubejs/data"]
    # Vanilla assets/data live in the client jar, common tags in the NeoForge jar
    base = [Path(a) for a in sys.argv[2:]]
    base += sorted((pack_dir / "libraries/net/neoforged/neoforge").glob("*/neoforge-*-universal.jar"))
    print("Scanning jars ...", [b.name for b in base])
    pack = Pack(pack_dir / "mods", [d for d in extra if d.exists()], base)
    print(f"  lang keys {len(pack.lang)}, tags {len(pack.tags)}, textures {len(pack.textures)}")
    OUT_DATA.mkdir(exist_ok=True)
    OUT_ICONS.mkdir(exist_ok=True)
    icon_cache = {}
    L = pack.lang

    def tr(comp):
        if isinstance(comp, dict):
            if "translate" in comp:
                return L.get(comp["translate"], comp.get("fallback", comp["translate"]))
            if "text" in comp:
                return comp["text"]
        return str(comp) if comp is not None else ""

    items_out = {}

    def ref_item(item):
        if item not in items_out:
            items_out[item] = {"name": pack.item_name(item), "icon": icon_for_item(pack, item, icon_cache)}
        return item

    def ref_ing(ing):
        if isinstance(ing, list):  # "any of" ingredient
            items, labels = [], []
            for sub in ing:
                lb, its = ingredient_items(pack, sub)
                labels.append(lb or "")
                items += [i for i in its if i not in items]
            return {"label": " / ".join(l for l in labels if l), "items": [ref_item(i) for i in items[:24]], "more": max(0, len(items) - 24)}
        if isinstance(ing, dict) and ing.get("type") == "silentgear:material":
            pt = ing.get("part_type", "silentgear:main")
            items = []
            for mid, md in pack.sg["silentgear_materials"].items():
                if pt in (md.get("properties") or {}) and md.get("type") == "silentgear:simple":
                    for i in ingredient_items(pack, (md.get("crafting") or {}).get("ingredient"))[1][:2]:
                        if i not in items:
                            items.append(i)
            return {"label": "any " + pt.split(":")[1] + " material", "items": [ref_item(i) for i in items[:24]], "more": max(0, len(items) - 24)}
        label, items = ingredient_items(pack, ing)
        return {"label": label, "items": [ref_item(i) for i in items[:24]], "more": max(0, len(items) - 24)}

    materials = {}
    for mid, d in pack.sg["silentgear_materials"].items():
        if mid == "silentgear:example":
            continue
        crafting = d.get("crafting", {})
        disp = d.get("display", {})
        name = tr(disp.get("name"))
        if name.startswith("material."):  # missing translation
            name = mid.split(":")[1].replace("/", " ").replace("_", " ").title()
        materials[mid] = {
            "name": name,
            "namePrefix": tr(disp.get("name_prefix")) if disp.get("name_prefix") else "",
            "source": pack.sg_src["silentgear_materials"][mid],
            "type": d.get("type"),
            "parent": d.get("parent"),
            "color": disp.get("color"),
            "texType": disp.get("main_texture_type"),
            "categories": crafting.get("categories", []),
            "blacklist": crafting.get("gear_type_blacklist", []),
            "canSalvage": crafting.get("can_salvage", True),
            "ingredient": ref_ing(crafting.get("ingredient")),
            "substitutes": {k: ref_ing(v) for k, v in (crafting.get("part_substitutes") or {}).items()},
            "properties": d.get("properties", {}),
        }

    traits = {}
    for tid, d in pack.sg["silentgear_traits"].items():
        ns, path = tid.split(":", 1)
        desc = tr(d.get("description"))
        extra_lines = [L[k] for k in (f"trait.{ns}.{path}.desc1", f"trait.{ns}.{path}.desc2") if k in L]
        traits[tid] = {
            "name": tr(d.get("name")),
            "desc": desc,
            "extra": extra_lines,
            "source": pack.sg_src["silentgear_traits"][tid],
            "maxLevel": d.get("max_level", 1),
            "conditions": d.get("conditions", []),
            "effects": d.get("effects", []),
            "cancelsWith": d.get("cancels_with", []),
            "hidden": d.get("hidden", False),
            "raw": d,
        }

    parts = {}
    for pid, d in pack.sg["silentgear_parts"].items():
        crafting = d.get("crafting", {})
        ing = crafting.get("ingredient", {})
        item = ing.get("item") if isinstance(ing, dict) else None
        if item:
            ref_item(item)
        parts[pid] = {
            "name": tr(d.get("display", {}).get("name")),
            "type": d.get("type"),
            "gearType": d.get("gear_type"),
            "partType": d.get("part_type"),
            "item": item,
            "properties": d.get("properties", {}),
            "traits": (d.get("properties") or {}).get("traits", []),
            "upgradeFor": (d.get("upgrade_gear_types") or {}).get("types", []),
            "raw": d,
        }

    removed = set()
    for js in (pack_dir / "kubejs/server_scripts").glob("*.js"):
        for line in js.read_text("utf-8", errors="replace").splitlines():
            if line.strip().startswith("//"):
                continue
            removed.update(re.findall(r"event\.remove\(\{\s*id:\s*['\"]([^'\"]+)['\"]", line))

    crafting = {}
    for rid, d in pack.crafting.items():
        res = d.get("result", {})
        rout = res.get("id") or res.get("item")
        if not rout:
            continue
        ref_item(rout)
        rec = {"type": d["type"], "result": rout, "count": res.get("count", 1), "removed": rid in removed}
        if d["type"] == "minecraft:crafting_shaped":
            rec["pattern"] = d.get("pattern", [])
            rec["key"] = {k: ref_ing(v) for k, v in d.get("key", {}).items()}
        elif d["type"] == "minecraft:crafting_shapeless":
            rec["ingredients"] = [ref_ing(i) for i in d.get("ingredients", [])]
        else:  # tool_action: use a tool on an item placed on the stone anvil
            rec["tool"] = ref_ing(d.get("tool"))
            rec["ingredients"] = [ref_ing(d.get("ingredient"))]
        crafting[rid] = rec

    for extra in ["silentgear:crimson_iron_ore", "silentgear:azure_silver_ore", "silentgear:bort_ore", "silentgear:flax_seeds",
                  "silentgear:fluffy_seeds", "silentgear:netherwood_sapling", "silentgear:crimson_steel_block",
                  "silentgear:azure_electrum_block", "silentgear:tyrian_steel_block", "silentgear:blueprint"]:
        if pack.item_exists(extra):
            ref_item(extra)

    tag_lists = {}
    for tag in ["silentgear:grader_catalysts/tier1", "silentgear:grader_catalysts/tier2", "silentgear:grader_catalysts/tier3",
                "silentgear:grader_catalysts/tier4", "silentgear:grader_catalysts/tier5",
                "silentgear:starlight_charger_catalysts/tier1", "silentgear:starlight_charger_catalysts/tier2",
                "silentgear:starlight_charger_catalysts/tier3"]:
        tag_lists[tag] = [ref_item(i) for i in pack.resolve_tag(tag) if pack.item_exists(i)]

    recipes = {}
    for rid, d in pack.recipes.items():
        res = d.get("result", {})
        rout = res.get("id") or res.get("item")
        if rout:
            ref_item(rout)
        ings = []
        for ing in d.get("ingredients", []):
            if isinstance(ing, dict) and ing.get("type", "").startswith("silentgear:"):
                ings.append(ing)
            else:
                ings.append(ref_ing(ing))
        rec = {"type": d["type"], "result": rout, "resultMaterial": res.get("material"),
               "count": res.get("count", 1), "ingredients": ings}
        if d["type"] == "sgearmetalworks:sg_gear_casting":
            rec.update(cast=ref_item(d["cast"]["item"]), material=d.get("material"), materialCount=d.get("material_count", 1),
                       consumeCast=d.get("consume_cast", False))
        elif d["type"] == "productivemetalworks:item_casting":
            rec.update(cast=ref_item(d["cast"]["item"]) if "item" in d.get("cast", {}) else None,
                       fluid=d.get("fluid"), consumeCast=d.get("consume_cast", False))
        recipes[rid] = rec

    # Silent Gear gear/part item icons (untinted layers are generated in the site from textures)
    sg_tex = {}
    for tid, (jar, entry) in pack.textures.items():
        if tid.startswith("silentgear:item/") and not tid.endswith("_overlay"):
            rel = "sg/" + tid.split(":", 1)[1][len("item/"):]
            save_icon(pack, tid, rel)
            sg_tex[tid.split(":", 1)[1][len("item/"):]] = rel

    lang_keep = {k: v for k, v in L.items()
                 if re.match(r"^[A-Za-z]+\.(silentgear|silentgems|sgearmetalworks)\.", k) or k.startswith("gearType.")}

    out = {
        "generated": date.today().isoformat(),
        "versions": {m: pack.mod_versions.get(m) for m in ("silentgear", "silentgems", "sgearmetalworks", "silentlib")},
        "materials": materials,
        "traits": traits,
        "parts": parts,
        "recipes": recipes,
        "crafting": crafting,
        "tagLists": tag_lists,
        "removedRecipes": sorted(r for r in removed if r.split(":")[0] in LOAD_ORDER),
        "items": items_out,
        "lang": lang_keep,
        "textures": sg_tex,
    }
    (OUT_DATA / "sgdata.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"materials {len(materials)}, traits {len(traits)}, parts {len(parts)}, recipes {len(recipes)}, items {len(items_out)}")
    print("versions", out["versions"])


if __name__ == "__main__":
    main()
