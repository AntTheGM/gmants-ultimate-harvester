import json
import os
import glob

SOURCE_DIRS = [
    "R:/Foundry/Modules/Ultimate_Harvesting/packs/_source/harvest-items",
    "R:/Foundry/Data/modules/ultimate-harvester/packs/harvest-items/_source",
]

# Shelf life in days for food/drink items
# Meat spoils fast, dried/preserved items last longer, water doesn't spoil
SHELF_LIFE = {
    # === RAW MEAT (2-3 days) ===
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

    # === FISH (1-2 days) ===
    "Blind Fish": 1,
    "Coastal Fish": 1,
    "River Fish": 1,
    "Shellfish": 1,

    # === FRESH PRODUCE (3-5 days) ===
    "Bitter Greens": 3,
    "Cactus Fruit": 5,
    "Coconut": 7,
    "Edible Tuber": 7,
    "Frozen Berries": 2,
    "Herb Bundle": 3,
    "Seaweed": 5,
    "Tropical Fruit": 3,
    "Wild Berries": 2,
    "Wild Mushroom": 3,
    "Wild Roots": 7,

    # === DRIED / PRESERVED (7-14 days) ===
    "Acorns": 30,
    "Cave Mushroom": 5,
    "Dried Mushrooms": 14,
    "Foraged Ration": 7,
    "Pine Nuts": 30,
    "Salvaged Foodstuffs": 5,
    "Seeds and Grains": 30,

    # === WATER / DRINKS (no spoilage) ===
    "Cactus Water": 0,
    "Fresh Water": 0,
}

updated = 0

for source_dir in SOURCE_DIRS:
    for filepath in sorted(glob.glob(os.path.join(source_dir, "*.json"))):
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        name = data.get("name", "")
        category = data.get("flags", {}).get("ultimate-harvester", {}).get("category", "")

        if name in SHELF_LIFE:
            shelf_life = SHELF_LIFE[name]
            data["flags"]["ultimate-harvester"]["source"] = "foraged"
            data["flags"]["ultimate-harvester"]["shelfLife"] = shelf_life

            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write("\n")
            updated += 1

            if source_dir == SOURCE_DIRS[0]:
                spoil_label = f"{shelf_life}d" if shelf_life > 0 else "none"
                print(f"  {name:30s}  shelfLife={spoil_label}")

print(f"\nUpdated: {updated} files across {len(SOURCE_DIRS)} directories")
