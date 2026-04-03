import json
import os
import glob
import re

SOURCE_DIR = "R:/Foundry/Data/modules/ultimate-harvester/packs/harvest-items/_source"

for filepath in sorted(glob.glob(os.path.join(SOURCE_DIR, "*.json"))):
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    name = data.get("name", "")
    _id = data.get("_id", "")

    if not name or not _id:
        print(f"SKIP (missing name/_id): {filepath}")
        continue

    # Convert name to the underscore format the CLI expects
    safe_name = re.sub(r"[^a-zA-Z0-9 ]", "", name)
    safe_name = safe_name.replace(" ", "_")
    new_filename = f"{safe_name}_{_id}.json"
    new_filepath = os.path.join(SOURCE_DIR, new_filename)

    old_filename = os.path.basename(filepath)
    if old_filename == new_filename:
        continue

    os.rename(filepath, new_filepath)
    print(f"  {old_filename} -> {new_filename}")

print(f"\nDone. Files in dir: {len(os.listdir(SOURCE_DIR))}")
