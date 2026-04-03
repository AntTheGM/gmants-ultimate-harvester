import json
import os
import glob

SOURCE_DIR = "R:/Foundry/Data/modules/ultimate-harvester/packs/harvest-items/_source"

count = 0
for filepath in sorted(glob.glob(os.path.join(SOURCE_DIR, "*.json"))):
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    _id = data.get("_id", "")
    if not _id:
        print(f"SKIP (no _id): {filepath}")
        continue

    data["_key"] = f"!items!{_id}"

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    count += 1

print(f"Added _key to {count} files")
