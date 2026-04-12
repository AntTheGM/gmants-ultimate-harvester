#!/bin/bash
# Deploy GMAnt's Ultimate Harvester to live Foundry modules directory
# Usage: bash deploy.sh

SRC="R:/Foundry/Modules/Ultimate_Harvesting"
DEST="R:/Foundry/Data/modules/ultimate-harvester"

mkdir -p "$DEST"

# Core files
cp "$SRC/module.json" "$DEST/"

# Code, styles, templates, lang
cp -r "$SRC/scripts" "$DEST/"
cp -r "$SRC/styles" "$DEST/"
cp -r "$SRC/lang" "$DEST/"
[ -d "$SRC/templates" ] && cp -r "$SRC/templates" "$DEST/"
[ -d "$SRC/assets" ] && cp -r "$SRC/assets" "$DEST/"

# Packs — copy compiled LevelDB data only, skip _source
for pack in harvest-items harvest-tables generic-tables foraging-tables ultimate-harvester-macros; do
  pack_src="$SRC/packs/$pack"
  pack_dest="$DEST/packs/$pack"
  if [ -d "$pack_src" ]; then
    mkdir -p "$pack_dest"
    # Copy LevelDB files (*.ldb, CURRENT, MANIFEST-*, *.log) but NOT _source/
    find "$pack_src" -maxdepth 1 -type f \( -name "*.ldb" -o -name "CURRENT" -o -name "MANIFEST-*" -o -name "*.log" -o -name "LOCK" \) -exec cp {} "$pack_dest/" \;
  fi
done

echo "Deployed ultimate-harvester to $DEST"
echo "Refresh your browser (F5) to pick up changes."
