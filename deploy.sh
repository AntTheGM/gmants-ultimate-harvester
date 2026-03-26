#!/bin/bash
# Deploy Ultimate Harvester to live Foundry modules directory
# Usage: bash deploy.sh

SRC="R:/Foundry/Modules/Ultimate_Harvesting"
DEST="R:/Foundry/Data/modules/ultimate-harvester"

mkdir -p "$DEST"

cp "$SRC/module.json" "$DEST/"
cp -r "$SRC/scripts" "$DEST/"
cp -r "$SRC/styles" "$DEST/"
cp -r "$SRC/lang" "$DEST/"
[ -d "$SRC/templates" ] && cp -r "$SRC/templates" "$DEST/"
[ -d "$SRC/packs" ] && cp -r "$SRC/packs" "$DEST/"
[ -d "$SRC/assets" ] && cp -r "$SRC/assets" "$DEST/"

echo "Deployed ultimate-harvester to $DEST"
echo "Refresh your browser (F5) to pick up changes."
