"""
Export OhhLoz Harvester module data to CSV files.
Combines harvester roll tables with harvest item details.
"""
import json
import os
import csv
import sys
from pathlib import Path

# Find the cloned repo - handle Windows /tmp mapping
candidates = [
    Path(os.environ.get("TEMP", "")) / "Harvester",
    Path(os.environ.get("TMP", "")) / "Harvester",
    Path("C:/Users") / os.environ.get("USERNAME", "user") / "AppData/Local/Temp/Harvester",
]
BASE = None
for c in candidates:
    if (c / "src" / "packs" / "_source").exists():
        BASE = c / "src" / "packs" / "_source"
        break

if not BASE:
    print("ERROR: Cannot find cloned Harvester repo. Candidates tried:")
    for c in candidates:
        print(f"  {c}")
    sys.exit(1)

print(f"Using source: {BASE}")

OUT_DIR = Path("R:/Foundry/Ultimate_Harvesting/reference")
os.makedirs(OUT_DIR, exist_ok=True)

# --- 1. Load all harvest items into a lookup by _id ---
items_by_id = {}
items_by_name = {}
harvest_dir = BASE / "harvest"
for f in harvest_dir.glob("*.json"):
    with open(f, encoding="utf-8") as fh:
        item = json.load(fh)
    items_by_id[item["_id"]] = item
    items_by_name[item["name"]] = item

print(f"Loaded {len(items_by_id)} harvest items")

# --- 2. Build main harvest table CSV ---
rows = []
harvester_dir = BASE / "harvester"
for f in sorted(harvester_dir.glob("*.json")):
    with open(f, encoding="utf-8") as fh:
        table = json.load(fh)

    creature = table["name"].replace("Harvester | ", "")
    table_skill = table.get("flags", {}).get("better-rolltables", {}).get("brt-skill-value", "")

    for result in table.get("results", []):
        flags = result.get("flags", {}).get("better-rolltables", {})
        item_name = flags.get("brt-result-custom-name", result.get("text", ""))
        dc = flags.get("brt-dc-value", "")
        skill = flags.get("brt-skill-value", table_skill)
        quantity = flags.get("brt-result-custom-quantity", "1")
        doc_id = result.get("documentId", "")

        item = items_by_id.get(doc_id) or items_by_name.get(result.get("text", ""))
        if item:
            sys_data = item.get("system", {})
            weight = sys_data.get("weight", "")
            price_data = sys_data.get("price", {})
            if isinstance(price_data, dict):
                price = price_data.get("value", "")
                denom = price_data.get("denomination", "gp")
            else:
                price = price_data
                denom = "gp"
            desc = sys_data.get("description", {}).get("value", "").replace("\n", " ").strip()
        else:
            weight = price = denom = desc = ""

        rows.append({
            "Creature": creature,
            "Item": item_name,
            "DC": dc,
            "Skill": skill,
            "Quantity": quantity,
            "Weight_lb": weight,
            "Price": price,
            "Currency": denom,
            "Description": desc,
            "Icon": result.get("img", ""),
        })

harvest_csv = OUT_DIR / "harvester_tables.csv"
with open(harvest_csv, "w", newline="", encoding="utf-8") as fh:
    writer = csv.DictWriter(fh, fieldnames=[
        "Creature", "Item", "DC", "Skill", "Quantity",
        "Weight_lb", "Price", "Currency", "Description", "Icon"
    ])
    writer.writeheader()
    writer.writerows(rows)

print(f"Wrote {len(rows)} harvest table rows to {harvest_csv}")

# --- 3. Build items-only CSV ---
item_rows = []
for item in sorted(items_by_id.values(), key=lambda x: x["name"]):
    sys_data = item.get("system", {})
    price_data = sys_data.get("price", {})
    if isinstance(price_data, dict):
        price = price_data.get("value", "")
        denom = price_data.get("denomination", "gp")
    else:
        price = price_data
        denom = "gp"
    item_rows.append({
        "Name": item["name"],
        "Source": sys_data.get("source", ""),
        "Weight_lb": sys_data.get("weight", ""),
        "Price": price,
        "Currency": denom,
        "Description": sys_data.get("description", {}).get("value", "").replace("\n", " ").strip(),
        "Icon": item.get("img", ""),
    })

items_csv = OUT_DIR / "harvest_items.csv"
with open(items_csv, "w", newline="", encoding="utf-8") as fh:
    writer = csv.DictWriter(fh, fieldnames=[
        "Name", "Source", "Weight_lb", "Price", "Currency", "Description", "Icon"
    ])
    writer.writeheader()
    writer.writerows(item_rows)

print(f"Wrote {len(item_rows)} harvest items to {items_csv}")

# --- 4. Build loot tables CSV ---
loot_rows = []
loot_dir = BASE / "loot"
for f in sorted(loot_dir.glob("*.json")):
    with open(f, encoding="utf-8") as fh:
        table = json.load(fh)

    creature = table["name"].replace("Loot | ", "")
    formula = table.get("formula", "")

    for result in table.get("results", []):
        range_low = result.get("range", [0, 0])[0]
        range_high = result.get("range", [0, 0])[1]
        text = result.get("text", "").replace("\n", " ").strip()
        loot_rows.append({
            "Creature": creature,
            "Formula": formula,
            "Range_Low": range_low,
            "Range_High": range_high,
            "Loot_Text": text,
        })

loot_csv = OUT_DIR / "loot_tables.csv"
with open(loot_csv, "w", newline="", encoding="utf-8") as fh:
    writer = csv.DictWriter(fh, fieldnames=[
        "Creature", "Formula", "Range_Low", "Range_High", "Loot_Text"
    ])
    writer.writeheader()
    writer.writerows(loot_rows)

print(f"Wrote {len(loot_rows)} loot table rows to {loot_csv}")

# --- Summary ---
print("\n=== Export Summary ===")
print(f"  Creatures with harvest tables: {len(list(harvester_dir.glob('*.json')))}")
print(f"  Unique harvest items:          {len(items_by_id)}")
print(f"  Harvest table rows (item+DC):  {len(rows)}")
print(f"  Loot (currency) tables:        {len(list(loot_dir.glob('*.json')))}")
print(f"\nFiles written to {OUT_DIR}:")
print(f"  - harvester_tables.csv  (main table: creature -> items with DC/skill)")
print(f"  - harvest_items.csv     (all unique loot items with prices)")
print(f"  - loot_tables.csv       (currency drop tables)")
