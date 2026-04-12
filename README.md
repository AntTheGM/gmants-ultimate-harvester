# Ultimate Harvester

> Monster harvesting and foraging for FoundryVTT — carve up defeated creatures and forage the wild for useful materials, food, and spell components.

![Foundry Core Compatible Version](https://img.shields.io/badge/Foundry-v12--v13-informational)
![System](https://img.shields.io/badge/System-D%26D%205e-green)
![Version](https://img.shields.io/badge/Version-0.1.0-blue)

A **VTTools by GM Ant** module.

## Features

### Monster Harvesting

When a creature drops to 0 HP, a harvest offer appears in chat. Players select their token, click the dead creature, and choose to **Appraise** or **Harvest** it.

- **Skill-based checks** — each of the 14 creature types maps to a specific skill (Nature for Beasts, Arcana for Aberrations, etc.). GMs can customize every mapping.
- **Cumulative DC rewards** — higher rolls yield *more* items, not just better ones. Every item on the harvest table has a DC; you collect everything at or below your result.
- **Natural 1 / Natural 20** — critical failures trigger creature-specific consequences (acid splash, disease, cursed items). Natural 20s award a bonus item.
- **Retry system** — fail by less than 5 and you can try again at a penalty, but higher-tier items are lost. Fail by 5+ and the corpse is ruined.

### Appraisal

Before committing to a harvest, players can appraise the creature to preview what materials are available. Appraisal uses the same skill at a lower DC, reveals item tiers, and grants advantage on the subsequent harvest roll.

### Foraging

A separate foraging system lets players gather food, herbs, and materials from the environment during travel or downtime.

- **10 environments** — General, Jungle, Arctic, Desert, Swamp, Coastal, Mountain, Underground, Urban, and Plains
- **Survival check + table roll** — beat the DC, then roll on the environment table with a bonus for every 5 points of margin
- **Time tracking** — forage in 1-hour increments with a threat reminder (foragers can't contribute to passive Perception)

### Harvest Items

All harvested materials are categorized:

| Category | Examples |
|----------|---------|
| **Material** | Hides, bones, scales, sinew |
| **Food** | Edible meat, organs, eggs |
| **Component** | Spell components, alchemical reagents |
| **Trophy** | Horns, teeth, claws, trophies |

Food items integrate with the [Campsite](https://github.com/GM-Ant/campsite) module for ration management and spoilage tracking.

### Take/Leave Pickup Dialog

After a successful harvest, a pickup dialog lets the player choose which items to take and which to leave behind. Disabled via settings if you prefer items to go straight to inventory.

### GM Configuration

Extensive settings let the GM tune the experience:

- **Skill mappings** per creature type (fully configurable)
- **Base DC offset** (default: CR + 10)
- **Appraisal DC offset** (default: -5 from harvest DC)
- **Item value multiplier** for economy balance
- **Humanoid harvesting** toggle (disabled by default)
- **Critical failure consequences** toggle

## Compendium Packs

Ultimate Harvester ships with five compendium packs:

| Pack | Type | Contents |
|------|------|----------|
| **Harvestable Items** | Item | Materials, food, components, and trophies for all creature types |
| **Creature Harvest Tables (Specific)** | RollTable | Named creature override tables (dragons, beholders, iconic monsters) |
| **Harvest Tables (Generic by Type/CR)** | RollTable | 14 creature types x 4 CR tiers (~56 fallback tables) |
| **Foraging Tables** | RollTable | 10 environment-based foraging tables |
| **Ultimate Harvester Macros** | Macro | Harvest and Forage macros — drag to your hotbar |

### Table Lookup Priority

When harvesting, the module resolves which table to use in this order:

1. **Actor flag override** — GM can assign a specific table to any creature
2. **Exact name match** — looks up the creature name in the specific tables pack
3. **Normalized name match** — strips prefixes like "Young" or "Adult" and retries
4. **Generic type + CR fallback** — uses creature type and challenge rating tier

## Installation

### Method 1: Manifest URL

In Foundry, go to **Add-on Modules** > **Install Module** and paste the manifest URL:

```
https://github.com/GM-Ant/ultimate-harvester/releases/latest/download/module.json
```

### Method 2: Manual

Download the latest release and extract it to your `Data/modules/ultimate-harvester/` directory.

## Dependencies

- **FoundryVTT v12+** (verified on v13)
- **D&D 5e system** (v4.0.0+)
- **socketlib** *(optional)* — for cross-client communication

## Compatibility

| System | Status |
|--------|--------|
| D&D 5e | Supported |
| PF2e | Not supported |
| Other | Not supported |

## Support

- **Issues:** [GitHub Issues](https://github.com/GM-Ant/ultimate-harvester/issues)
- **More tools:** [roleplayr.com/gmant](https://roleplayr.com/gmant)

## License

This module is licensed under the [MIT License](LICENSE).
