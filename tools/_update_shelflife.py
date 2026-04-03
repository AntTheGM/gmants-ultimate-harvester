import json
import os
import glob

SOURCE_DIRS = [
    "R:/Foundry/Modules/Ultimate_Harvesting/packs/_source/harvest-items",
    "R:/Foundry/Data/modules/ultimate-harvester/packs/harvest-items/_source",
]

# New shelf life values: fish 1d, meat 2d, fresh produce 3d, preserved 4d, water 0
SHELF_LIFE = {
    # === FISH / SHELLFISH (1 day) ===
    "Blind Fish": 1,
    "Coastal Fish": 1,
    "River Fish": 1,
    "Shellfish": 1,

    # === RAW MEAT / PERISHABLE BERRIES (2 days) ===
    "Animal Meat": 2,
    "Apex Meat": 2,
    "Dinosaur Meat": 2,
    "Mountain Goat Meat": 2,
    "Prime Meat": 2,
    "Quality Meat": 2,
    "Small Game": 2,
    "Snow Hare": 2,
    "Wolf Meat": 2,
    "Winter Wolf Meat": 2,
    "Frozen Berries": 2,
    "Wild Berries": 2,

    # === FRESH PRODUCE / HERBS / MUSHROOMS (3 days) ===
    "Bitter Greens": 3,
    "Cactus Fruit": 3,
    "Cave Mushroom": 3,
    "Herb Bundle": 3,
    "Seaweed": 3,
    "Tropical Fruit": 3,
    "Wild Mushroom": 3,
    "Salvaged Foodstuffs": 3,

    # === PRESERVED / DRIED / FORAGED RATION (4 days) ===
    "Acorns": 4,
    "Coconut": 4,
    "Dried Mushrooms": 4,
    "Edible Tuber": 4,
    "Foraged Ration": 4,
    "Pine Nuts": 4,
    "Seeds and Grains": 4,
    "Wild Roots": 4,

    # === WATER (never spoils) ===
    "Cactus Water": 0,
    "Fresh Water": 0,
}

updated = 0
for source_dir in SOURCE_DIRS:
    for filepath in sorted(glob.glob(os.path.join(source_dir, "*.json"))):
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        name = data.get("name", "")
        if name not in SHELF_LIFE:
            continue

        data["flags"]["ultimate-harvester"]["shelfLife"] = SHELF_LIFE[name]

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        updated += 1

        if source_dir == SOURCE_DIRS[0]:
            sl = SHELF_LIFE[name]
            print(f"  {name:30s}  {sl}d" if sl > 0 else f"  {name:30s}  never")

print(f"\nUpdated: {updated} files")
