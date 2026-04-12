# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **planning repository** (Obsidian vault) for **Ultimate Harvester**, a Foundry VTT module for D&D 5th Edition that adds monster harvesting and foraging systems. No code has been written yet — the repository contains architecture and rules design documents.

- **Module ID**: `ultimate-harvester`
- **Target**: Foundry v12+, dnd5e system (v4.0.0+)
- **Deployment path**: `R:/Foundry/Data/modules/ultimate-harvester/`

## Claude functionality notes
 - always ask questions as autoquestions when necessary
 - Typically run with --dangerously-skip-permissions, but ask prior to deleting files

## Key Documents

- `docs/harvester_module.md` — Technical architecture: module structure, Foundry APIs, data models, workflow engines, implementation phases
- `docs/harvester_rules.md` — Game rules (draft): skill mappings, DCs, harvesting/foraging mechanics, content tables. Many sections marked **DECISION NEEDED**

## Architecture Summary

The module separates **workflow engine** (code) from **game rules** (configurable data in compendium packs and settings).

### Core Systems

1. **Creature-to-Table Lookup** (`table-lookup.js`) — Layered fallback: actor flag override → exact name match → normalized name match → generic type+CR table → no table found
2. **Harvest Workflow** (`harvesting.js`) — State machine: trigger → validate → lookup table → prompt dialog → roll skill check → filter results by DC threshold → show pickup dialog → award items → mark harvested
3. **Foraging Workflow** (`foraging.js`) — Separate system using standard `table.roll()` (random draw), unlike harvesting which uses cumulative DC filtering
4. **Death Detection Hook** — Posts harvest offer chat card when NPC HP drops to 0

### Critical Design Decision

RollTable is used as a **data container only** — the module does NOT use `table.roll()` for harvesting. Instead, it loads all table results and filters by DC threshold (`result.getFlag("ultimate-harvester", "dc") <= rollTotal`). This enables the cumulative reward model where higher rolls yield more items.

### Data Model

- **Harvest items**: dnd5e loot items in `harvest-items` compendium, categorized as `material | food | component | trophy`
- **Harvest tables**: RollTable entries with flags storing `dc`, `itemUuid`, `quantity` (dice formula), `category`
- **Actor flags**: `harvestTable` (UUID override), `harvested` (prevents double-harvest), `harvestOffered` (prevents duplicate chat offers)
- **Generic table naming**: `{CreatureType} CR {Tier} Harvest Table` (14 types x 4 tiers = ~56 tables)

### Compendium Pack Management

```bash
npm install -g @foundryvtt/foundryvtt-cli

fvtt configure set dataPath "R:/Foundry/Data"
fvtt package workon "ultimate-harvester" --type "Module"

# Compile JSON source → LevelDB packs
fvtt package pack "harvest-items"
fvtt package pack "harvest-tables"
fvtt package pack "generic-tables"
fvtt package pack "foraging-tables"

# Extract LevelDB → JSON for editing
fvtt package unpack "harvest-items"
```

## Implementation Phases

1. **Scaffold and Core Workflow** — module.json, hooks, settings, table lookup, harvest engine, UI, templates, CSS, i18n
2. **Generic Harvest Tables and Items** — Type+CR tables as JSON, compile to LevelDB; start with Beast, Undead, Fiend, Dragon, Monstrosity
3. **Foraging System** — Foraging workflow, environment tables, scene control trigger
4. **Specific Creature Overrides** — Iconic creatures (dragons, beholders, etc.)
5. **UI Polish** — Token HUD button, context menu, styled chat cards, GM tools

## Rules Decisions

All 23 rules decisions are now **resolved** — see the summary table at the bottom of `docs/harvester_rules.md`. Key decisions:
- **Skill mapping**: Distributed 6-skill type-based system (Option A), GM-configurable
- **Generic tables**: All 14 creature types x 4 CR tiers (~56 tables)
- **Specific overrides**: High Priority creatures + all Tomb of Annihilation creatures (~150+ unique)
- **Foraging environments**: All 10 (General, Jungle, Arctic, Desert, Swamp, Coastal, Mountain, Underground, Urban, Plains)
- **Foraging mechanic**: Hybrid — Survival DC check, then d20 table roll with +1 per 5 margin-of-success
