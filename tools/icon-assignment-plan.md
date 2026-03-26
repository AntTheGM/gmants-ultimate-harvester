# Icon Assignment Plan

**Status**: Not Started
**Purpose**: Assign valid Foundry core icons to all 209 harvest/foraging items

## Problem

The CSV content generation used guessed icon paths (e.g., `icons/commodities/biological/herb-stem-leaves-green.webp`) that may not exist in Foundry's core icon set. Core icons are embedded in the Foundry app binary and can only be browsed via the in-game FilePicker (`[Core Data] > icons/`).

## Approach

1. In Foundry, open a FilePicker and browse `icons/` to catalog available icons by category
2. Map each item to an appropriate icon based on its category and name
3. Update `tools/data/items.csv` and `tools/data/foraging-items.csv` with correct paths
4. Re-run `node tools/csv-to-json.js` and re-seed

## Icon Categories to Browse

| Foundry Path | Useful For |
|---|---|
| `icons/commodities/biological/` | Organs, flesh, ichor, biological components |
| `icons/commodities/bones/` | Bones, teeth, claws, skulls |
| `icons/commodities/leather/` | Hides, pelts, leather |
| `icons/commodities/gems/` | Crystals, gems, psionic shards |
| `icons/commodities/metal/` | Metal components, construct parts |
| `icons/commodities/flowers/` | Flowers, blossoms, fey items |
| `icons/commodities/materials/` | Raw materials, scraps |
| `icons/commodities/wood/` | Wood, bark, plant material |
| `icons/consumables/food/` | Berries, fruit, rations, herbs |
| `icons/consumables/meat/` | Meat, game, food items |
| `icons/consumables/drinks/` | Water, potions, vials |
| `icons/tools/` | Harvesting tools, kits |
| `icons/skills/` | Skill-related icons |

## Items to Assign (209 total)

### Harvest Items (149)

**Beast (18)**: Animal Meat, Animal Hide, Bone Fragment, Teeth/Claws, Quality Meat, Thick Hide, Sturdy Bones, Large Teeth/Claws, Venom Sac, Prime Meat, Superior Hide, Dense Bones, Razor Teeth/Claws, Potent Venom Sac, Intact Organ, Apex Hide, Apex Meat, Primordial Bone

**Undead (9)**: Rotting Flesh, Undead Ichor, Ghoul Claws, Necrotic Residue, Concentrated Ichor, Shadow Essence, Ectoplasmic Residue, Death Shroud, Soul Fragment

**Dragon (7)**: Wyrmling Scale, Dragon Scales, Dragon Teeth, Dragon Blood, Dragon Hide, Breath Gland, Dragon Heart

**Monstrosity (7)**: Monster Hide, Monster Fangs, Monster Sinew, Aberrant Organ, Predator Musk, Alpha Trophy, Chimeric Essence

**Fiend (7)**: Infernal Ash, Demon Ichor, Devil Horn, Fiendish Hide, Abyssal Essence, Hellfire Gland, Damned Soul Residue

**Aberration (6)**: Aberrant Flesh, Psionic Crystal, Mind Residue, Eldritch Ichor, Far Realm Essence, Void Fragment

**Celestial (6)**: Radiant Dust, Celestial Feather, Divine Essence, Sacred Blood, Angelic Plume, Blessed Organ

**Construct (6)**: Arcane Gear, Animated Metal, Golem Core Fragment, Enchanted Plating, Power Crystal, Construct Heart

**Elemental (5)**: Elemental Mote, Primal Ash, Elemental Core, Condensed Element, Pure Elemental Essence

**Fey (6)**: Fey Dust, Pixie Wing, Enchanted Bark, Fey Blossom, Glamour Essence, Archfey Tear

**Giant (6)**: Giant Fingernail, Giant Hair, Giant Blood, Giant Heart, Titan Bone, Colossus Tooth

**Humanoid (5)**: Humanoid Teeth, Tanned Skin, Blood Vial, Skull Trophy, Warrior Heart

**Ooze (5)**: Acidic Residue, Ooze Membrane, Gelatinous Extract, Corrosive Core, Prismatic Slime

**Plant (6)**: Herb Bundle, Living Bark, Root Tendril, Blossom Essence, Treant Heartwood, Fungal Spore Sac

**Specific Creatures (49)**: Winter Wolf (4), Wolf (4), Dinosaur shared (4), T-Rex (4), Triceratops (4), Allosaurus (3), Stegosaurus (3), Velociraptor (2), Pteranodon (3), Ankylosaurus (3), Yuan-ti (2), Troll (4), Froghemoth (3), Vegepygmy (2), Grung (2), Basilisk (2), Beholder (3), Shambling Mound (2), Girallon (2), Hydra (3)

**Tools (4)**: Harvester's Kit, Field Dissection Kit, Fiend Extraction Receptacle, Dragon Scale Pry Bar

### Foraging Items (60)

Food (27), Component (20), Material (13) — see `tools/data/foraging-items.csv` for full list
