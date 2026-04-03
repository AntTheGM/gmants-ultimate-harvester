import json
import os
import glob

ITEMS_DIR = "R:/Foundry/Modules/Ultimate_Harvesting/packs/_source/harvest-items"

# Comprehensive icon mapping: filename (without .json) -> icon path
ICON_MAP = {
    # === FLESH / MEAT ===
    "aberrant-flesh": "icons/consumables/meat/steak-alien-pink.webp",
    "animal-meat": "icons/consumables/meat/steak-raw-red-pink.webp",
    "apex-meat": "icons/consumables/meat/steak-marbled.webp",
    "dinosaur-meat": "icons/consumables/meat/steak-bone-magenta.webp",
    "mountain-goat-meat": "icons/consumables/meat/shank-bone-red.webp",
    "prime-meat": "icons/consumables/meat/steak-cooked-grilled-brown.webp",
    "quality-meat": "icons/consumables/meat/shank-bone-pink.webp",
    "regenerating-flesh": "icons/consumables/meat/steak-alien-orange.webp",
    "rotting-flesh": "icons/consumables/meat/spoiled-bone-gray.webp",
    "small-game": "icons/consumables/meat/drumstick-bone-pink.webp",
    "snow-hare": "icons/consumables/meat/hock-leg-pink-brown.webp",
    "wolf-meat": "icons/consumables/meat/shank-bone-red-white.webp",
    "winter-wolf-meat": "icons/consumables/meat/shank-flat-white.webp",
    "zombie-flesh": "icons/consumables/meat/steak-spoiled-yellow.webp",
    "salvaged-foodstuffs": "icons/consumables/food/bowl-stew-brown.webp",

    # === FISH ===
    "blind-fish": "icons/consumables/meat/fish-whole-blue.webp",
    "coastal-fish": "icons/consumables/meat/fillet-fish-pink-teal.webp",
    "river-fish": "icons/consumables/meat/salmon-fish-fillet-pink-gray.webp",
    "shellfish": "icons/consumables/meat/claw-crab-lobster-red.webp",

    # === ORGANS / BIOLOGICAL ===
    "aberrant-organ": "icons/commodities/biological/organ-heart-red.webp",
    "blessed-organ": "icons/commodities/biological/organ-heart-pink.webp",
    "intact-organ": "icons/commodities/biological/organ-liver-red.webp",
    "construct-heart": "icons/commodities/biological/organ-heart-black.webp",
    "dragon-heart": "icons/commodities/biological/organ-heart-red.webp",
    "giant-heart": "icons/commodities/biological/organ-heart-pink.webp",
    "warrior-heart": "icons/consumables/meat/heart-organ-red.webp",
    "wolf-heart": "icons/consumables/meat/heart-organ-realistic-red.webp",

    # === EYES ===
    "basilisk-eye": "icons/commodities/biological/eye-lizard-green.webp",
    "beholder-eye-stalk": "icons/commodities/biological/eye-tentacle-green-orange.webp",
    "central-eye-lens": "icons/commodities/biological/eye-blue-gold.webp",
    "froghemoth-eye": "icons/commodities/biological/eye-green-pink.webp",
    "troll-eye": "icons/commodities/biological/eye-brown-red.webp",

    # === TONGUES ===
    "froghemoth-tongue": "icons/commodities/biological/tongue-pink.webp",
    "ghoul-tongue": "icons/commodities/biological/tongue-violet.webp",

    # === TENTACLES ===
    "froghemoth-tentacle": "icons/commodities/biological/tentacle-purple-white.webp",
    "mind-flayer-tentacle": "icons/commodities/biological/tentacle-pink.webp",

    # === BRAINS ===
    "mind-flayer-brain": "icons/commodities/biological/organ-brain-pink-purple.webp",

    # === WINGS / MEMBRANES ===
    "dragon-wing-membrane": "icons/commodities/biological/wing-lizard-brown.webp",
    "pteranodon-wing-membrane": "icons/commodities/biological/wing-lizard-yellow-teal.webp",
    "pixie-wing": "icons/commodities/biological/wing-insect-green.webp",

    # === HIDES / PELTS / LEATHER ===
    "animal-hide": "icons/commodities/leather/leather-bolt-brown.webp",
    "apex-hide": "icons/commodities/leather/leather-bolt-tan.webp",
    "basilisk-hide": "icons/commodities/leather/leather-patch-grey.webp",
    "boar-hide": "icons/commodities/leather/leather-scrap-brown.webp",
    "dinosaur-hide": "icons/commodities/leather/leather-bolt-grey.webp",
    "dragon-hide": "icons/commodities/leather/leather-studded-tan.webp",
    "fiendish-hide": "icons/commodities/leather/leather-patch-red.webp",
    "monster-hide": "icons/commodities/leather/leather-scrap-tan.webp",
    "superior-hide": "icons/commodities/leather/leather-pelt-cured.webp",
    "t-rex-hide": "icons/commodities/leather/leather-bolt-worn-tan.webp",
    "thick-hide": "icons/commodities/leather/leather-worn-tan.webp",
    "tanned-skin": "icons/commodities/leather/leather-patchwork-folded-tan.webp",
    "grung-skin": "icons/commodities/leather/leather-patch-tan.webp",

    # === PELTS / FUR ===
    "bear-pelt": "icons/commodities/leather/fur-pelt-bear.webp",
    "owlbear-pelt": "icons/commodities/leather/fur-pelt-brown.webp",
    "wolf-pelt": "icons/commodities/leather/fur-pelt-spotted-tan.webp",
    "winter-wolf-pelt": "icons/commodities/leather/fur-pelt-white.webp",
    "girallon-fur": "icons/commodities/leather/fur-brown.webp",
    "manticore-mane": "icons/commodities/leather/fur-brown-gold.webp",

    # === SCALES ===
    "black-dragon-scale": "icons/commodities/leather/scales-brown.webp",
    "blue-dragon-scale": "icons/commodities/leather/scales-blue.webp",
    "green-dragon-scale": "icons/commodities/leather/scales-green.webp",
    "red-dragon-scale": "icons/commodities/leather/scale-chitin-grey.webp",
    "white-dragon-scale": "icons/commodities/leather/scales-white.webp",
    "dragon-scales": "icons/commodities/leather/scales-blue-white.webp",
    "wyrmling-scale": "icons/commodities/leather/scales-green.webp",
    "yuan-ti-scale": "icons/commodities/leather/scales-brown.webp",
    "stegosaurus-plate": "icons/commodities/leather/scale-chitin-grey.webp",
    "ankylosaurus-shell-fragment": "icons/commodities/biological/shell-turtle-grey.webp",
    "beholder-chitin": "icons/commodities/leather/scale-chitin-grey.webp",

    # === CLAWS ===
    "bear-claws": "icons/commodities/claws/claw-bear-brown.webp",
    "ghoul-claw": "icons/commodities/claws/claw-brown-black.webp",
    "ghoul-claws": "icons/commodities/claws/claws-plain-grey.webp",
    "troll-claws": "icons/commodities/claws/claws-plain-orange.webp",
    "allosaurus-claw": "icons/commodities/claws/claw-lizard-white-black.webp",
    "velociraptor-claw": "icons/commodities/claws/talon-brown.webp",
    "large-teeth-claws": "icons/commodities/claws/claws-plain-brown.webp",
    "razor-teeth-claws": "icons/commodities/claws/claws-plain-white.webp",
    "teeth-claws": "icons/commodities/claws/claws-worn-grey.webp",

    # === BONES ===
    "bone-fragment": "icons/commodities/bones/bone-fragments-grey.webp",
    "bone-shard": "icons/commodities/bones/bone-broken-grey.webp",
    "dense-bones": "icons/commodities/bones/bones-stack-brown.webp",
    "dinosaur-bone": "icons/commodities/bones/bones-dragon-grey.webp",
    "primordial-bone": "icons/commodities/bones/bone-red.webp",
    "skeleton-bone": "icons/commodities/bones/bone-simple-white.webp",
    "sturdy-bones": "icons/commodities/bones/bones-stack-grey.webp",
    "titan-bone": "icons/commodities/bones/bones-stack-tan.webp",

    # === TEETH / FANGS / TUSKS ===
    "boar-tusk": "icons/commodities/bones/horn-curved-brown.webp",
    "colossus-tooth": "icons/commodities/bones/tooth-spiked-brown.webp",
    "dragon-fang": "icons/commodities/bones/teeth-sharp-white.webp",
    "dragon-teeth": "icons/commodities/bones/teeth-pointed-white.webp",
    "giant-fingernail": "icons/commodities/claws/claw-worn-tan.webp",
    "giant-spider-fang": "icons/commodities/bones/teeth-pointed-gray.webp",
    "humanoid-teeth": "icons/commodities/bones/tooth-molar-white.webp",
    "monster-fangs": "icons/commodities/bones/tooth-canine-white.webp",
    "t-rex-fang": "icons/commodities/bones/tooth-shark-brown.webp",
    "vampire-fang": "icons/commodities/bones/tooth-canine-tan.webp",
    "wolf-fangs": "icons/commodities/bones/tooth-shark-brown-white.webp",
    "winter-wolf-fangs": "icons/commodities/bones/teeth-sharp-white.webp",

    # === HORNS ===
    "devil-horn": "icons/commodities/bones/horn-curved-grey-purple.webp",
    "dinosaur-horn-crest": "icons/commodities/bones/horn-jagged-grey.webp",
    "triceratops-horn": "icons/commodities/bones/horn-simple-white.webp",
    "triceratops-frill": "icons/commodities/bones/horn-jagged-grey-blue.webp",

    # === SKULLS / TROPHIES ===
    "skull-trophy": "icons/commodities/bones/skull-hollow-white.webp",
    "alpha-trophy": "icons/commodities/bones/skull-monster-beige.webp",

    # === BEAKS ===
    "eblis-beak": "icons/commodities/bones/beak-orange-green.webp",
    "owlbear-beak": "icons/commodities/bones/beak-hooked-red.webp",

    # === FEATHERS / PLUMES ===
    "angelic-plume": "icons/commodities/materials/feather-white-glowing-fire.webp",
    "celestial-feather": "icons/commodities/materials/feather-white-glowing-beams.webp",
    "eagle-feather": "icons/commodities/materials/feather-colored-red.webp",
    "eblis-plumage": "icons/commodities/materials/feather-colored-green.webp",
    "owlbear-feather": "icons/commodities/materials/feathers-brown.webp",

    # === BLOOD / ICHOR / LIQUIDS ===
    "blood-vial": "icons/consumables/potions/vial-cork-red.webp",
    "concentrated-ichor": "icons/commodities/materials/liquid-purple.webp",
    "demon-ichor": "icons/commodities/materials/liquid-green.webp",
    "dragon-blood": "icons/consumables/potions/potion-tube-corked-red.webp",
    "eldritch-ichor": "icons/commodities/materials/liquid-purple.webp",
    "giant-blood": "icons/consumables/potions/potion-tube-corked-glowing-red.webp",
    "hydra-blood": "icons/consumables/potions/bottle-round-corked-green.webp",
    "sacred-blood": "icons/consumables/potions/potion-tube-corked-red.webp",
    "undead-ichor": "icons/commodities/materials/liquid-green.webp",
    "vampire-blood": "icons/consumables/potions/vial-cork-red.webp",
    "troll-lymphatic-fluid": "icons/consumables/potions/bottle-round-corked-green.webp",
    "eblis-oil": "icons/consumables/potions/bottle-round-corked-yellow.webp",
    "bear-fat": "icons/consumables/potions/bottle-round-corked-yellow.webp",

    # === VENOM / POISON ===
    "giant-spider-venom": "icons/consumables/potions/potion-jar-corked-labeled-poison-skull-green.webp",
    "grung-poison-gland": "icons/consumables/potions/bottle-conical-corked-green.webp",
    "potent-venom-sac": "icons/consumables/potions/potion-bottle-skull-label-poison-teal.webp",
    "scorpion-venom": "icons/consumables/potions/flask-ornate-skull-green.webp",
    "serpent-venom-gland": "icons/consumables/potions/bottle-conical-corked-labeled-skull-poison-green.webp",
    "venom-sac": "icons/consumables/potions/potion-jug-corked-skull-poison-brown-green.webp",

    # === GLANDS (breath/fire/frost/etc) ===
    "black-dragon-acid-gland": "icons/commodities/biological/organ-bladder-red.webp",
    "blue-dragon-lightning-gland": "icons/commodities/biological/organ-stomach.webp",
    "breath-gland": "icons/commodities/biological/organ-bladder-red.webp",
    "frost-breath-gland": "icons/commodities/biological/organ-stomach.webp",
    "green-dragon-poison-gland": "icons/commodities/biological/organ-bladder-red.webp",
    "hellfire-gland": "icons/commodities/biological/organ-liver-red.webp",
    "red-dragon-fire-gland": "icons/commodities/biological/organ-intestines-red.webp",
    "troll-gland": "icons/commodities/biological/organ-stomach.webp",
    "white-dragon-frost-gland": "icons/commodities/biological/organ-bladder-red.webp",

    # === SILK / WEB / FIBER ===
    "giant-spider-silk": "icons/commodities/materials/material-webbing.webp",
    "grass-fiber": "icons/consumables/plants/grass-bundle-green.webp",
    "rope-fiber": "icons/commodities/cloth/thread-spindle-grey.webp",
    "monster-sinew": "icons/commodities/cloth/thread-spindle-red.webp",
    "vine-cord": "icons/consumables/plants/thorned-stem-vine-green.webp",

    # === HAIR ===
    "giant-hair": "icons/commodities/materials/hair-tuft-brown.webp",

    # === SLIME / OOZE / RESIDUE ===
    "acidic-residue": "icons/commodities/materials/slime-green.webp",
    "damned-soul-residue": "icons/commodities/materials/slime-purple.webp",
    "ectoplasmic-residue": "icons/commodities/materials/slime-white.webp",
    "gelatinous-cube-residue": "icons/commodities/materials/slime-green.webp",
    "gelatinous-extract": "icons/commodities/materials/slime-thick-green.webp",
    "illithid-mucus": "icons/commodities/materials/slime-purple.webp",
    "mind-residue": "icons/commodities/materials/slime-purple.webp",
    "necrotic-residue": "icons/commodities/materials/slime-brown.webp",
    "ooze-membrane": "icons/commodities/materials/slime-thick-green.webp",
    "prismatic-slime": "icons/commodities/materials/slime-blue.webp",
    "predator-musk": "icons/consumables/potions/bottle-conical-corked-yellow.webp",

    # === ESSENCE / DUST / MAGICAL ===
    "abyssal-essence": "icons/commodities/materials/powder-red-green-yellow.webp",
    "blossom-essence": "icons/commodities/flowers/lily-bloom-purple.webp",
    "chimeric-essence": "icons/commodities/materials/liquid-orange.webp",
    "divine-essence": "icons/commodities/materials/feather-white-glowing-fire.webp",
    "far-realm-essence": "icons/commodities/materials/liquid-purple.webp",
    "glamour-essence": "icons/commodities/materials/liquid-blue.webp",
    "pure-elemental-essence": "icons/commodities/materials/liquid-orange.webp",
    "shadow-essence": "icons/commodities/materials/powder-black.webp",
    "wraith-essence": "icons/commodities/materials/powder-grey.webp",
    "fey-dust": "icons/commodities/gems/powder-raw-white.webp",
    "radiant-dust": "icons/commodities/materials/bowl-powder-gold.webp",
    "infernal-ash": "icons/commodities/materials/powder-black.webp",
    "primal-ash": "icons/commodities/materials/powder-grey.webp",
    "death-shroud": "icons/commodities/cloth/cloth-worn-purple.webp",
    "soul-fragment": "icons/commodities/gems/gem-shattered-violet.webp",
    "void-fragment": "icons/commodities/gems/gem-faceted-round-black.webp",

    # === CRYSTALS / GEMS / MINERALS ===
    "crystal-fragment": "icons/commodities/gems/gem-fragments-blue.webp",
    "elemental-core": "icons/commodities/gems/gem-rough-cushion-orange.webp",
    "elemental-mote": "icons/commodities/gems/gem-rough-round-orange.webp",
    "golem-core-fragment": "icons/commodities/gems/gem-fragments-rough-grey.webp",
    "mineral-deposit": "icons/commodities/stone/ore-chunk-grey.webp",
    "power-crystal": "icons/commodities/gems/gem-faceted-diamond-blue.webp",
    "psionic-crystal": "icons/commodities/gems/gem-faceted-diamond-pink.webp",
    "salt-crystal": "icons/commodities/stone/rock-chunk-pumice-white.webp",
    "sandstone-chunk": "icons/commodities/stone/stone-chunk-tan.webp",
    "corrosive-core": "icons/commodities/gems/gem-rough-cushion-green.webp",
    "condensed-element": "icons/commodities/gems/gem-rough-ball-purple.webp",

    # === METAL / CONSTRUCT ===
    "animated-metal": "icons/commodities/metal/ingot-worn-iron.webp",
    "arcane-gear": "icons/commodities/tech/cog-brass.webp",
    "enchanted-plating": "icons/commodities/metal/plate-steel-pink.webp",
    "dragon-scale-pry-bar": "icons/commodities/metal/barstock-broken-steel.webp",

    # === WOOD / BARK / PLANT MATERIAL ===
    "driftwood": "icons/commodities/wood/log-rough-brown.webp",
    "enchanted-bark": "icons/commodities/wood/bark-brown-red.webp",
    "firewood-bundle": "icons/commodities/wood/kindling-sticks-brown.webp",
    "green-wood": "icons/commodities/wood/kindling-stick-brown.webp",
    "hardwood-branch": "icons/commodities/wood/lumber-plank-brown.webp",
    "living-bark": "icons/commodities/wood/bark-brown.webp",
    "treant-heartwood": "icons/commodities/wood/log-cut-cherry-brown.webp",
    "tree-resin": "icons/commodities/materials/liquid-orange.webp",
    "vegepygmy-bark": "icons/commodities/wood/bark-tan.webp",
    "willow-bark": "icons/commodities/wood/bark-beige.webp",

    # === HERBS / PLANTS / LEAVES ===
    "alchemical-lichen": "icons/consumables/plants/herb-tied-bundle-green.webp",
    "alchemist-s-weed": "icons/consumables/plants/herb-tied-bundle-yellow-green.webp",
    "bitter-greens": "icons/consumables/plants/leaf-herb-green.webp",
    "common-herb": "icons/consumables/plants/herb-bunch-dried-leaf-green.webp",
    "desert-sage": "icons/consumables/plants/dried-herb-bundle-brown.webp",
    "healing-moss": "icons/consumables/plants/succulent-bundle-green.webp",
    "herb-bundle": "icons/consumables/plants/herb-marjoram-basil-oregano-leaf-bunch-green.webp",
    "ice-moss": "icons/consumables/plants/fern-leaf-bundle-green.webp",
    "menga-leaves": "icons/consumables/plants/leaf-elm-glowing-green.webp",
    "medicinal-root": "icons/consumables/vegetable/root-ginger-brown.webp",
    "phosphorescent-moss": "icons/consumables/plants/kelp-fern-glowing-green.webp",
    "swamp-moss": "icons/consumables/plants/sprout-glowing-roots-green.webp",
    "lightning-charged-vine": "icons/consumables/plants/thorned-curled-vine-green.webp",
    "root-tendril": "icons/consumables/plants/dried-stem-vine-root-bramble-brown.webp",
    "shambling-mound-compost": "icons/consumables/plants/dried-bundle-wrapped-stems-sticks-brown.webp",

    # === FLOWERS ===
    "fey-blossom": "icons/commodities/flowers/lily-bloom-purple.webp",
    "jungle-orchid": "icons/commodities/flowers/lily-pink.webp",
    "mountain-flower": "icons/commodities/flowers/cornflower-blue.webp",
    "rare-flower": "icons/commodities/flowers/lotus-violet.webp",

    # === MUSHROOMS / FUNGUS ===
    "cave-mushroom": "icons/consumables/mushrooms/convex-bolete-brown.webp",
    "dried-mushrooms": "icons/consumables/mushrooms/umbonate-brown.webp",
    "fungal-spore-sac": "icons/consumables/mushrooms/conical-bell-orange-white.webp",
    "russet-mold-spore": "icons/consumables/mushrooms/helm-brown.webp",
    "wild-mushroom": "icons/consumables/mushrooms/mushroom-spotted-red.webp",

    # === FRUIT / BERRIES / FOOD PLANTS ===
    "acorns": "icons/consumables/nuts/hazelnut-acorn-shell-brown.webp",
    "cactus-fruit": "icons/consumables/fruit/pickly-pear-cactus-red-yellow.webp",
    "coconut": "icons/consumables/fruit/coconut-cut-bowl-brown.webp",
    "edible-tuber": "icons/consumables/vegetable/root-potato-brown.webp",
    "frozen-berries": "icons/consumables/fruit/berry-shiny-leaf-blue-teal.webp",
    "pine-nuts": "icons/consumables/nuts/pine-cone-brown.webp",
    "seeds-and-grains": "icons/consumables/grains/wheat-gold.webp",
    "tropical-fruit": "icons/consumables/fruit/mango-ripe-orange.webp",
    "wild-berries": "icons/consumables/fruit/berry-bunch-red-green.webp",
    "wild-roots": "icons/consumables/vegetable/root-ginger-yellow.webp",

    # === FOOD (foraged/prepared) ===
    "foraged-ration": "icons/consumables/grains/breadsticks-crackers-wrapped-ration-brown.webp",
    "seaweed": "icons/consumables/plants/kelp-fern-glowing-green.webp",

    # === WATER / DRINKS ===
    "cactus-water": "icons/consumables/drinks/water-jug-clay-brown.webp",
    "fresh-water": "icons/consumables/drinks/pitcher-dripping-white.webp",
    "swamp-gas-flask": "icons/consumables/potions/bottle-conical-fumes-green.webp",

    # === COINS / MISC LOOT ===
    "old-coins": "icons/commodities/currency/coins-assorted-mix-copper-silver-gold.webp",
    "useful-scraps": "icons/commodities/cloth/cloth-scraps-plain.webp",
    "gelatinous-cube-absorbed-item": "icons/commodities/materials/slime-thick-orange.webp",

    # === TOOLS / KITS ===
    "field-dissection-kit": "icons/tools/cooking/knife-chef-steel-brown.webp",
    "harvester-s-kit": "icons/tools/cooking/knife-chef-steel-brown.webp",
    "fiend-extraction-receptacle": "icons/consumables/potions/bottle-round-empty-glass.webp",
    "alchemist-discards": "icons/consumables/potions/potion-flask-corked-green.webp",

    # === HEADS ===
    "hydra-head": "icons/commodities/bones/skull-lizard-brown.webp",

    # === SPIKES / STINGERS / TAILS ===
    "manticore-spike": "icons/commodities/biological/stinger-insect-yellow.webp",
    "manticore-tail": "icons/commodities/biological/tail-spiked-green.webp",
    "leech": "icons/consumables/plants/sprout-leaf-herb-green.webp",
    "girallon-arm": "icons/commodities/biological/hand-clawed-brown.webp",

    # === ARCHFEY / DIVINE ===
    "archfey-tear": "icons/commodities/gems/pearl-blue-gold.webp",
}

# Read the icon list for validation
with open("R:/Foundry/Modules/Foundry_Icon_List.txt") as f:
    valid_icons = set(line.strip() for line in f if line.strip())

# Process each file
updated = 0
skipped = 0
missing = []
warnings = []

for filepath in sorted(glob.glob(os.path.join(ITEMS_DIR, "*.json"))):
    filename = os.path.basename(filepath)
    key = filename.replace(".json", "")

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    if key in ICON_MAP:
        new_icon = ICON_MAP[key]
        if new_icon not in valid_icons:
            warnings.append(f"WARNING: Invalid icon for {key}: {new_icon}")
            continue
        if data.get("img") != new_icon:
            data["img"] = new_icon
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write("\n")
            updated += 1
    else:
        missing.append(key)
        skipped += 1

for w in warnings:
    print(w)

print(f"\nUpdated: {updated}")
print(f"Skipped (no mapping): {skipped}")
if missing:
    print(f"\nMissing mappings ({len(missing)}):")
    for m in sorted(missing):
        print(f"  {m}")
