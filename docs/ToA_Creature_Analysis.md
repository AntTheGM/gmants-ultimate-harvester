# Tomb of Annihilation Creature Harvester Analysis

**Date:** 2026-02-16
**Analysis Script:** `check_toa.py`

## Summary

Analyzed 51 creature stat blocks from Tomb of Annihilation Appendix D and cross-referenced them against:
- **OhhLoz Harvester Tables** (704 creatures)
- **Hamund's Harvesting Handbook v1 & v2** (347 creatures)

### Coverage Statistics

| Category | Count | Percentage |
|----------|-------|------------|
| **Total ToA creatures** | 51 | 100% |
| Creatures with harvest tables | 24 | 47.1% |
| - In both OhhLoz and Hamund | 21 | 41.2% |
| - In OhhLoz only | 1 | 2.0% |
| - In Hamund only | 2 | 3.9% |
| **Creatures missing tables** | **27** | **52.9%** |

## Creatures with Full Coverage (Both Tables)

These 21 creatures have harvest entries in both OhhLoz and Hamund:

- Bodak
- Brontosaurus
- Deinonychus
- Dimetrodon
- Firenewt Warrior
- Flail Snail
- Froghemoth
- Giant Strider
- Grung (3 variants)
- Hadrosaurus
- Kobold Inventor
- Kobold Scale Sorcerer
- Quetzalcoatlus
- Stegosaurus
- Vegepygmy (2 variants)
- Velociraptor
- Yuan-ti Broodguard
- Yuan-ti Nightmare Speaker

## Creatures with Partial Coverage

**OhhLoz only:**
- Chwinga

**Hamund only:**
- Girallon
- Thorny

## Missing ToA-Specific Creatures (HIGH PRIORITY)

These 25 creatures are unique to ToA or iconic to the module, and have **NO harvest tables** in either collection:

### Beasts & Monsters
1. **Almiraj** - Magical horned rabbit from Zakhara
2. **Aldani (Lobsterfolk)** - Cursed lobster-people of Chult
3. **Eblis** - Intelligent stork-like creatures
4. **Flying Monkey** - Chultan primates
5. **Jaculi** - Flying snake that impales prey
6. **Kamadan** - Leopard with serpent tentacles
7. **Su-monster** - Psychic ape-like predator
8. **Zorbo** - Koala-like creature with razor fur
9. **Giant Snapping Turtle** (noted in contents but needs extraction fix)

### Plants & Undead
10. **Assassin Vine** - Carnivorous animated vine
11. **Mantrap** - Carnivorous plant
12. **Yellow Musk Creeper** - Mind-controlling plant
13. **Yellow Musk Zombie** - Humanoid controlled by creeper
14. **Triflower Frond** - Ambulatory plant creature
15. **Ankylosaurus Zombie** - Undead dinosaur
16. **Girallon Zombie** - Undead four-armed ape
17. **Tyrannosaurus Zombie** - Massive undead dinosaur

### Humanoids & NPCs
18. **Albino Dwarf Warrior** - Chultan jungle dwarves
19. **Tabaxi Hunter** - Feline hunter variant
20. **Tabaxi Minstrel** - Feline bard variant
21. **Pterafolk** - Winged reptilian humanoids

### Unique/Boss Creatures
22. **Acererak** - Archlich, main antagonist
23. **Atropal** - Godling undead abomination
24. **Ras Nsi** - Yuan-ti antagonist
25. **Stone Juggernaut** - Animated construct
26. **Giant Four-Armed Gargoyle** - Unique ToA variant
27. **Firenewt Warlock of Imix** - Fire-touched firenewt

## Recommendations

### For Monster Harvester Module

1. **Priority 1 (Core ToA Creatures):** Focus on the iconic jungle creatures
   - Almiraj, Aldani, Tabaxi variants, Pterafolk, Eblis
   - Flying Monkey, Jaculi, Kamadan, Su-monster, Zorbo

2. **Priority 2 (Plants):** Create plant-specific harvest mechanics
   - Yellow Musk Creeper/Zombie, Assassin Vine, Mantrap, Triflower Frond
   - Consider unique plant-based materials (spores, seeds, vines)

3. **Priority 3 (Undead Dinosaurs):** Adapt regular dinosaur tables
   - Add necrotic/undead-specific materials to existing dinosaur entries
   - Ankylosaurus Zombie, Girallon Zombie, Tyrannosaurus Zombie

4. **Priority 4 (Unique/Boss):** High-value, rare drops
   - Acererak, Atropal, Ras Nsi - legendary materials
   - Stone Juggernaut, Giant Four-Armed Gargoyle - construct parts

### Content Creation Notes

- **Chultan Flavor:** Materials should reflect tropical jungle setting
  - Vibrant colors, exotic properties, ties to heat/humidity
  - Consider uses in indigenous crafting traditions

- **Plant Creatures:** Focus on botanical components
  - Seeds, spores, sap, thorns, leaves with magical properties
  - Alchemical and druidic applications

- **Undead Dinosaurs:** Necrotic-enhanced materials
  - Cursed bones, death-touched scales, zombie ichor
  - Materials for necromantic crafting

- **Unique ToA Creatures:** Leverage distinctive features
  - Almiraj horn (like unicorn horn)
  - Aldani shell plates (like lobster)
  - Kamadan serpent tentacles
  - Jaculi impaling stinger
  - Zorbo barbed fur

## Data Sources

- **ToA Text:** `R:/Foundry/Ultimate_Harvesting/reference/toa_text.txt`
- **OhhLoz:** `R:/Foundry/Ultimate_Harvesting/reference/harvester_tables.csv`
- **Hamund v1:** `R:/Foundry/Ultimate_Harvesting/reference/hamund_v1_harvest.csv`
- **Hamund v2:** `R:/Foundry/Ultimate_Harvesting/reference/hamund_v2_harvest.csv`

## Notes

- Some creature names had OCR errors in the PDF extraction (e.g., "Tri�flower" should be "Triflower")
- "Giant Snapping Turtle" appears in the contents but stat block extraction needs refinement
- NPCs (Acererak, Ras Nsi, etc.) may not need harvest tables if they're unique characters
- Consider whether Firenewt Warlock should use base Firenewt table with additions
