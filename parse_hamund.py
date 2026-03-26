"""
Parse Hamund's Harvesting Handbook PDFs into CSV files.

Uses PyMuPDF positional text extraction. The PDF layout uses columns:
  - x ~48-52: DC values (leftmost)
  - x ~65-106: Item names
  - x ~99-107: Description text
  - x ~440-460: Value (price)
  - x ~474-490: Weight
  - x ~510+: Crafting reference

Creature headers use 'MrsEavesSmallCaps' font at size ~20.
Section headers use 'MrsEavesSmallCaps' at size ~28.
Flavor text uses 'Unnamed-T3' (italic) at size ~9.
Table content uses 'ScalySans' at size ~10.
Trinket table headers use 'MrsEavesSmallCaps' at size ~13.
"""
import fitz
import csv
import re
import os
from pathlib import Path
from collections import defaultdict

OUT_DIR = Path("R:/Foundry/Ultimate_Harvesting/reference")


def parse_pdf(pdf_path, start_page, end_page):
    """
    Parse harvest tables from a Hamund PDF using positional layout.
    Returns list of creature dicts with items.
    """
    doc = fitz.open(pdf_path)

    # Collect all lines with metadata
    all_lines = []
    for page_num in range(start_page, min(end_page, len(doc))):
        page = doc[page_num]
        page_dict = page.get_text("dict")

        for block in page_dict["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                spans = line["spans"]
                full_text = "".join(s["text"] for s in spans).strip()
                if not full_text:
                    continue

                fonts = {s["font"] for s in spans}
                max_size = max(s["size"] for s in spans)
                x0 = line["bbox"][0]
                y0 = line["bbox"][1]

                all_lines.append({
                    "page": page_num + 1,
                    "text": full_text,
                    "fonts": fonts,
                    "size": max_size,
                    "x": x0,
                    "y": y0,
                })

    doc.close()

    # Now parse using layout-aware logic
    creatures = []
    current_creature = None
    current_items = []
    current_notes = []
    in_trinket = False
    in_special_section = False  # for curse tables, etc.

    # Current item being built
    building_item = None  # dict with dc, name_parts, desc_parts, value, weight, craft_parts

    # Track y-groups: lines at same y are in same row
    # Group consecutive lines into rows based on y-coordinate

    dc_pattern = re.compile(r'^(\d{1,2})\s+(.+)')
    dc_only_pattern = re.compile(r'^(\d{1,2})$')
    value_pattern = re.compile(r'([\d,]+)\s*(gp|sp|cp|ep|pp)')
    weight_pattern = re.compile(r'([\d,.]+)\s*lb\.?')

    def save_item():
        nonlocal building_item
        if building_item and building_item["dc"]:
            name = " ".join(building_item["name_parts"]).strip()
            desc = " ".join(building_item["desc_parts"]).strip()
            craft = " ".join(building_item["craft_parts"]).strip()
            if name:
                current_items.append({
                    "dc": building_item["dc"],
                    "item": name,
                    "description": desc,
                    "value": building_item["value"] or "",
                    "weight": building_item["weight"] or "",
                    "crafting": craft,
                })
        building_item = None

    def save_creature():
        nonlocal current_creature, current_items, current_notes, in_trinket, in_special_section
        if current_creature and current_items:
            creatures.append({
                "creature": current_creature,
                "notes": " ".join(current_notes).strip(),
                "items": list(current_items),
            })
        elif current_creature:
            # Creature with no items (like generic humanoids)
            pass
        current_items = []
        current_notes = []
        in_trinket = False
        in_special_section = False

    for line in all_lines:
        text = line["text"]
        fonts = line["fonts"]
        size = line["size"]
        x = line["x"]

        # --- Detect creature headers: MrsEavesSmallCaps at size ~20 ---
        if "MrsEavesSmallCaps" in fonts and 18 <= size <= 22:
            # This is a creature header
            save_item()
            save_creature()
            current_creature = text
            in_trinket = False
            in_special_section = False
            continue

        # --- Detect section headers: MrsEavesSmallCaps at size ~28 ---
        if "MrsEavesSmallCaps" in fonts and size >= 25:
            # "Harvest Table: X" - skip
            continue

        # --- Detect sub-headers: MrsEavesSmallCaps at size ~13 ---
        # These are: trinket tables, sub-creature names (Deva under Angels),
        # or section notes (Fiendish Curse)
        if "MrsEavesSmallCaps" in fonts and 11 <= size <= 15:
            if "Trinket" in text:
                save_item()
                in_trinket = True
                continue
            # Skip known non-creature sub-headers
            skip_subs = ["Fiendish Curse", "Curse of", "d6 Curse",
                         "Optional Rule", "Item", "DC"]
            is_skip = False
            for s in skip_subs:
                if text.startswith(s):
                    is_skip = True
                    break
            if is_skip:
                continue
            # This is likely a sub-creature name (e.g., "Deva" under "Angels")
            # Treat it as a new creature, using "ParentGroup - SubName" format
            if len(text) > 1 and len(text) < 60:
                save_item()
                save_creature()
                # Use the parent creature group name as prefix if it exists
                if current_creature and not any(c["creature"] == text for c in creatures):
                    current_creature = text
                else:
                    current_creature = text
                in_trinket = False
                continue
            continue

        # Skip trinket table content
        if in_trinket:
            # Trinket table ends at next creature header (handled above)
            continue

        # Skip if no current creature
        if not current_creature:
            continue

        # --- Detect table header row: "DC  Item  Description  Value Weight Crafting" ---
        if text in ("DC", "Item", "Description", "Value Weight Crafting",
                     "Value Weight", "Value", "Weight", "Crafting",
                     "Item Description", "DC Item Description"):
            continue

        # --- Detect flavor text (italic, size 9) ---
        if "Unnamed-T3" in fonts or size < 9.5:
            # Flavor text or italic quotes - add to creature notes
            current_notes.append(text)
            continue

        # --- Skip page numbers (standalone small numbers at bottom) ---
        if re.match(r'^\d{1,3}$', text) and size <= 10 and line["y"] > 700:
            continue

        # --- Now parse table content (ScalySans at size ~10) ---

        # Determine column by x-position
        # DC + Item name column: x < 95 (DC at ~49-52, item names at ~64-75)
        # Description column: 95 <= x < 430 (starts at ~99)
        # Value column: 430 <= x < 475
        # Weight column: 475 <= x < 500
        # Crafting column: x >= 500

        if x < 88:
            # Could be DC+item start, DC alone, or item name continuation
            dc_match = dc_pattern.match(text)
            dc_only_match = dc_only_pattern.match(text)

            if dc_match:
                dc_val = int(dc_match.group(1))
                if 1 <= dc_val <= 30:
                    # New item row with DC + start of name on same line
                    save_item()
                    building_item = {
                        "dc": str(dc_val),
                        "name_parts": [dc_match.group(2)],
                        "desc_parts": [],
                        "value": None,
                        "weight": None,
                        "craft_parts": [],
                    }
                    continue

            if dc_only_match:
                dc_val = int(dc_only_match.group(1))
                if 1 <= dc_val <= 30:
                    # DC alone on line - item name will follow on next line(s)
                    save_item()
                    building_item = {
                        "dc": str(dc_val),
                        "name_parts": [],
                        "desc_parts": [],
                        "value": None,
                        "weight": None,
                        "craft_parts": [],
                    }
                    continue

            # Item name continuation (wrapped text)
            if building_item:
                # Check it's not a value/weight that ended up here
                if not value_pattern.match(text) and not weight_pattern.match(text):
                    building_item["name_parts"].append(text)
                continue

        elif x < 430:
            # Description column
            if building_item:
                building_item["desc_parts"].append(text)
            else:
                # Could be creature-level notes (demon curse text, etc.)
                current_notes.append(text)
            continue

        elif x < 475:
            # Value column (x ~430-475)
            if building_item:
                vm = value_pattern.search(text)
                wm = weight_pattern.search(text)
                if vm and wm:
                    # Combined "20 gp 15 lb." on one line
                    building_item["value"] = f"{vm.group(1)} {vm.group(2)}"
                    building_item["weight"] = f"{wm.group(1)} lb."
                elif vm:
                    building_item["value"] = f"{vm.group(1)} {vm.group(2)}"
                elif wm:
                    building_item["weight"] = f"{wm.group(1)} lb."
                else:
                    # Might be continuation of value (e.g., "gp" on next line after "375")
                    if text.strip() in ("gp", "sp", "cp", "ep", "pp"):
                        if building_item["value"] and not any(d in building_item["value"] for d in ("gp","sp","cp","ep","pp")):
                            building_item["value"] = building_item["value"].rstrip() + " " + text.strip()
                        else:
                            building_item["value"] = text.strip()
                    elif re.match(r'^[\d,]+$', text.strip()):
                        # Just a number - probably the value amount
                        building_item["value"] = text.strip()
            continue

        elif x < 500:
            # Weight column (x ~475-500)
            if building_item:
                wm = weight_pattern.search(text)
                if wm:
                    building_item["weight"] = f"{wm.group(1)} lb."
                else:
                    # Sometimes denomination "gp" spills here from value column
                    vm = value_pattern.search(text)
                    if vm:
                        building_item["value"] = f"{vm.group(1)} {vm.group(2)}"
                    elif text.strip() in ("gp", "sp", "cp", "ep", "pp"):
                        if building_item["value"] and not any(d in building_item["value"] for d in ("gp","sp","cp","ep","pp")):
                            building_item["value"] = building_item["value"].rstrip() + " " + text.strip()
            continue

        else:
            # Crafting column (x >= 500)
            if building_item:
                building_item["craft_parts"].append(text)
            continue

    # Save last
    save_item()
    save_creature()

    return creatures


def post_process(creatures):
    """Clean up parsed data."""
    for creature_data in creatures:
        for item in creature_data["items"]:
            # Clean item name
            name = item["item"]
            # Remove trailing descriptions that leaked into name
            name = re.sub(r'\s+$', '', name)
            item["item"] = name

            # Fix values that are just numbers without denomination
            val = item["value"]
            if val and re.match(r'^[\d,]+$', val):
                item["value"] = val + " gp"  # default to gp

            # Ensure value has space between number and denomination
            val = item["value"]
            m = re.match(r'^([\d,]+)(gp|sp|cp|ep|pp)$', val)
            if m:
                item["value"] = f"{m.group(1)} {m.group(2)}"

    return creatures


def creatures_to_csv(creatures, output_path, volume_label):
    """Write parsed creatures to CSV."""
    rows = []
    for creature_data in creatures:
        creature_name = creature_data["creature"]
        for item in creature_data["items"]:
            rows.append({
                "Volume": volume_label,
                "Creature": creature_name,
                "DC": item["dc"],
                "Item": item["item"],
                "Description": item["description"],
                "Value": item["value"],
                "Weight": item["weight"],
                "Crafting": item["crafting"],
            })

    with open(output_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=[
            "Volume", "Creature", "DC", "Item", "Description",
            "Value", "Weight", "Crafting"
        ])
        writer.writeheader()
        writer.writerows(rows)

    return rows


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # --- Volume 1: Monster Manual ---
    print("Parsing Volume 1 (Monster Manual)...")
    v1_path = "R:/Foundry/Ultimate_Harvesting/964705-Hamund_Handbook_no_cover_printer_friendly_v1.031.pdf"

    # Harvest tables: pages 8-112 (0-indexed: 7-111)
    # Page 113 starts crafting chapter
    v1_creatures = parse_pdf(v1_path, start_page=7, end_page=112)
    v1_creatures = post_process(v1_creatures)

    v1_csv = OUT_DIR / "hamund_v1_harvest.csv"
    v1_rows = creatures_to_csv(v1_creatures, v1_csv, "Vol1-MM")

    print(f"  Creatures: {len(v1_creatures)}")
    print(f"  Total items: {len(v1_rows)}")
    print(f"  Written to: {v1_csv}")

    # Sanity check
    print("\n  Sample creatures:")
    for c in v1_creatures[:8]:
        print(f"    {c['creature']}: {len(c['items'])} items")
        for item in c['items'][:2]:
            print(f"      DC {item['dc']}: {item['item'][:40]:40s} | {item['value']:>10s} | {item['weight']:>8s} | {item['crafting'][:25]}")

    # --- Volume 2: Volo's Guide ---
    print("\nParsing Volume 2 (Volo's Guide)...")
    v2_path = "R:/Foundry/Ultimate_Harvesting/964705-Hamunds_Harvesting_Handbook_volume_2_1.0_-_ink_friendly.pdf"

    # Find crafting chapter
    doc2 = fitz.open(v2_path)
    v2_end = len(doc2)
    for i in range(10, len(doc2)):
        text = doc2[i].get_text()
        if "Chapter 4: Crafting" in text:
            v2_end = i
            break
    doc2.close()
    print(f"  Harvest pages end at page {v2_end}")

    v2_creatures = parse_pdf(v2_path, start_page=7, end_page=v2_end)
    v2_creatures = post_process(v2_creatures)

    v2_csv = OUT_DIR / "hamund_v2_harvest.csv"
    v2_rows = creatures_to_csv(v2_creatures, v2_csv, "Vol2-Volo")

    print(f"  Creatures: {len(v2_creatures)}")
    print(f"  Total items: {len(v2_rows)}")
    print(f"  Written to: {v2_csv}")

    print("\n  Sample creatures:")
    for c in v2_creatures[:8]:
        print(f"    {c['creature']}: {len(c['items'])} items")
        for item in c['items'][:2]:
            print(f"      DC {item['dc']}: {item['item'][:40]:40s} | {item['value']:>10s} | {item['weight']:>8s} | {item['crafting'][:25]}")

    # Summary
    print(f"\n{'='*60}")
    print(f"  Vol 1 (MM):   {len(v1_creatures):>3} creatures, {len(v1_rows):>4} items")
    print(f"  Vol 2 (Volo): {len(v2_creatures):>3} creatures, {len(v2_rows):>4} items")
    print(f"  TOTAL:        {len(v1_creatures)+len(v2_creatures):>3} creatures, {len(v1_rows)+len(v2_rows):>4} items")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
