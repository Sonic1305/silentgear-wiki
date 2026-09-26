# Silent Gear Wiki (TNP Limitless 8)

Made by [Sonic1305](https://github.com/Sonic1305).

A small static wiki for **Silent Gear**, **Silent Gems** and **SGear Metalworks**: materials, traits, gear & parts, a gear builder and a material compare/ranking page.
All data is read directly from the modpack's jar files, so it matches the versions on the server.

## Pages
- **Guide**: how the mod works in this pack: blueprints and templates (with crafting grids), making and casting parts, assembling, upgrades, alloys, grading, starcharging, repairs, ores and a FAQ.
- **Materials**: stats per part type (main, rod, tip and so on), traits, harvest tier, the items that count as the material, and whether it's cast-only in this pack.
- **Traits**: what each trait does, max level, conditions, and every material/part that gives it.
- **Gear & Parts**: required/optional parts, blueprint recipes, foundry casting (SGear Metalworks), upgrades.
- **Builder**: pick gear + materials and see stats and traits, using formulas ported from the Silent Gear 4.2.1 source. Builds can be shared by link.
- **Compare**: materials side by side, or ranked by any stat.

## Updating the data (after mod updates)
Needs Python 3 with Pillow (`pip install pillow`).

```
python tools/extract.py "C:/Gameserver/TNP Limitless 8" "<path to the Minecraft 1.21.1 client jar>"
```

The client jar supplies vanilla names/textures/tags (e.g. CurseForge: `curseforge/minecraft/Install/versions/1.21.1/1.21.1.jar`).
This rewrites `data/sgdata.json` and `icons/`. Commit and push to publish.

## Local preview
```
python tools/serve.py 8765
```
then open http://localhost:8765.

Unofficial fan page. Silent Gear and Silent Gems are by SilentChaos512; textures and names are theirs and the respective mod authors'.
