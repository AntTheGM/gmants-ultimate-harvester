import json
import os
import glob

ITEMS_DIR = "R:/Foundry/Modules/Ultimate_Harvesting/packs/_source/harvest-items"

# Items in the "food" category that should be drinks
DRINK_ITEMS = {
    "cactus-water",
    "fresh-water",
}

# Items in "food" category that stay as food consumables
# (everything else in the "food" category)

# Venom/poison items from "component" category that should be poison consumables
POISON_ITEMS = {
    "giant-spider-venom",
    "grung-poison-gland",
    "potent-venom-sac",
    "scorpion-venom",
    "serpent-venom-gland",
    "venom-sac",
}

updated = 0
skipped = 0

for filepath in sorted(glob.glob(os.path.join(ITEMS_DIR, "*.json"))):
    filename = os.path.basename(filepath)
    key = filename.replace(".json", "")

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    category = data.get("flags", {}).get("ultimate-harvester", {}).get("category", "")
    changed = False

    if category == "food":
        data["type"] = "consumable"
        if key in DRINK_ITEMS:
            data["system"]["type"] = {"value": "drink", "subtype": ""}
        else:
            data["system"]["type"] = {"value": "food", "subtype": ""}
        # Add uses field (1 use, auto-destroy on empty)
        data["system"]["uses"] = {
            "spent": 0,
            "max": "1",
            "recovery": [],
            "autoDestroy": True
        }
        changed = True

    elif key in POISON_ITEMS:
        data["type"] = "consumable"
        data["system"]["type"] = {"value": "poison", "subtype": "injury"}
        data["system"]["uses"] = {
            "spent": 0,
            "max": "1",
            "recovery": [],
            "autoDestroy": True
        }
        changed = True

    if changed:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        subtype = data["system"]["type"]["value"]
        print(f"  {data['name']:30s} -> consumable ({subtype})")
        updated += 1
    else:
        skipped += 1

print(f"\nUpdated: {updated}")
print(f"Unchanged: {skipped}")
