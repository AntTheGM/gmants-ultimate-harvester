# Ultimate Harvester — Implementation Plan

**Status**: Phases 1-3 Complete, significant post-phase iteration on UX and architecture
**Last Updated**: 2026-03-26
**Related Docs**: [Technical Architecture](harvester_module.md) | [Game Rules](harvester_rules.md) | [VTTools Style Guide](../module_styles.md)

---

## Overview

Ultimate Harvester is a FoundryVTT module for D&D 5e that adds monster harvesting and foraging systems to gameplay. When a creature dies, players can harvest it for materials, food, alchemical components, and trophies using skill checks. A separate foraging system lets players scavenge for supplies during exploration. The module separates the **workflow engine** (code) from **game rules** (configurable data in compendium packs and settings), so GMs can customize skills, DCs, and loot without touching code.

The module replaces the aging [Harvester by OhhLoz](https://github.com/OhhLoz/Harvester), which hasn't been updated in ~2 years and lacks foraging support. Ultimate Harvester targets Foundry v12+/v13 and dnd5e v4.0.0+.

**Module ID**: `ultimate-harvester`
**Dev Path**: `R:/Foundry/Modules/Ultimate_Harvesting/`
**Live Path**: `R:/Foundry/Data/modules/ultimate-harvester/`

---

## Goals

1. **Harvest workflow** — Complete pipeline from creature death → skill check → loot award, with appraisal preview, retry mechanics, and critical roll effects
2. **Foraging system** — Exploration-phase resource gathering with DM controls for environment, weather, season, and manual modifiers
3. **Content coverage** — Generic tables for all 14 creature types x 4 CR tiers, specific override tables for ~175+ creatures (High Priority + ToA), and 10 foraging environments
4. **GM configurability** — Skill mappings, DC offsets, value multipliers, humanoid harvesting toggle, and per-creature table overrides — all without touching code
5. **VTTools brand consistency** — ApplicationV2 UI following the shared module style guide (branding header, color palette, typography)

---

## Architecture

### Core Design: RollTable as Data Container

The critical architectural decision: RollTables store harvest data but the module does **not** use `table.roll()` for harvesting. Instead, it loads all table results and filters by DC threshold (`result.getFlag("ultimate-harvester", "dc") <= rollTotal`). This enables cumulative rewards where higher rolls yield more items.

Foraging **does** use standard `table.roll()` since it's a random draw from tiered sub-tables.

### Creature-to-Table Lookup (Layered Fallback)

```
Actor flag override → Exact name match → Normalized name match → Generic type+CR → Not found
```

### Data Flow (Creature-Centric Model)

All harvest state lives on the creature actor as flags. This enables sequential looting by multiple players.

**First harvester:**
```
Run Macro → Validate → Table Lookup → Harvest Dialog
    → Skill Roll → DC Filter → Lock items on creature (availableItems flag)
    → Take/Leave Popup → Award taken items → Remove from availableItems
    → If items remain: unlock creature for next harvester
    → If all taken: mark fully harvested
```

**Subsequent harvesters (no roll needed):**
```
Run Macro → Validate → Read availableItems from creature
    → Take/Leave Popup → Award taken items → Remove from availableItems
```

### Creature Flags

| Flag | Type | Purpose |
|------|------|---------|
| `availableItems` | Array | Items unlocked by the first roll (name, uuid, quantity, category, dc) |
| `harvestingBy` | String/null | Actor UUID of current harvester (lock) |
| `appraisalBonus` | Number | +2 from crit appraisal success (persists for all harvesters) |
| `appraisalDisadvantage` | Boolean | Disadvantage from crit appraisal failure (persists) |
| `appraisalSuccess` | Boolean | Normal appraisal success = advantage on harvest |
| `appraisalAttempts` | Number | Retry count for cumulative -5 penalty |
| `appraisalData` | Object | Full appraisal result data for modal viewing (visible items, risks, time) |
| `maxRetryDC` | Number | Caps available DCs after a close harvest failure |
| `harvested` | Boolean/"ruined" | Fully harvested or ruined |

### Compendium Packs

| Pack | Type | Contents |
|------|------|----------|
| `harvest-items` | Item | dnd5e loot items (materials, food, components, trophies, tools) |
| `harvest-tables` | RollTable | Specific creature override tables |
| `generic-tables` | RollTable | Type+CR fallback tables (14 types x 4 tiers) |
| `foraging-tables` | RollTable | Environment-based foraging tables (10 envs x 4 tiers) |

---

## Key Decisions

1. **Cumulative DC threshold (not random draw)** for harvesting — higher rolls yield more items, not different items. Chosen because it rewards investment in relevant skills and makes every point of bonus meaningful.

2. **Distributed 6-skill system** — creature type determines which of 6 skills (Arcana, Nature, Religion, Survival, Medicine, Investigation) is used. Chosen over single-skill (Survival) to spread value across the party and make knowledge skills matter.

3. **Hybrid foraging mechanic** — pass a Survival DC, then d20 table roll with +1 bonus per 5 margin-of-success. Chosen over pure random (too swingy) or pure skill-based (removes excitement).

4. **socketlib as optional dependency** — only needed for marking NPC flags as harvested when player doesn't own the actor. Module degrades gracefully without it.

5. **Spreadsheet → JSON → LevelDB content pipeline** — avoid hand-editing hundreds of JSON files. Build the pipeline in Phase 4 and reuse for all content phases.

6. **No `table.roll()` for harvesting** — RollTable is a data container only. This was a deliberate choice because Foundry's `table.roll()` returns a single random result, which doesn't match the cumulative threshold model.

7. **Creature-centric harvest state** — All harvest state (available items, lock, appraisal effects) lives on the creature actor as flags, not on the player. First harvester's roll locks which items exist on the corpse. Subsequent harvesters pick up remaining items without rolling. One harvester at a time (lock flag). Chosen to support sequential multi-player looting and persistent appraisal effects.

8. **Macro-only entry point** — No death detection hooks, no chat card buttons, no Token HUD. Players run the Harvest macro (seeded to `ultimate-harvester-macros` compendium). Clean and intentional — no chat noise.

9. **Appraisal as modal + combined dialog** — Appraisal results post as a concise chat summary with a "View Appraisal Details" link. The harvester sees a combined dialog (appraisal results + harvest button) instead of two separate windows. Other players can click the link to view details without cluttering chat.

10. **Appraisal crit effects on creature** — Nat 20 appraisal grants +2 circumstance bonus; Nat 1 grants disadvantage. These persist on the creature, affecting whoever harvests — not just the appraiser. Creates meaningful group decisions about who should appraise.

11. **Default tuning** — Base DC offset 12 (not 10), foraging base DC 12, item value multiplier 0.5. Harvesting is meant to be supplemental income and moderately difficult. Size time modifiers: Med +5, Large +15, Huge +30, Gargantuan +60. Appraisal time: 5 min + 1 min per CR.

---

## Implementation

> **To implement this plan**, use the `implement` skill (`/implement`) which will read this document, identify the next incomplete phase, and execute it step by step.

---

## Implementation Phases

### Phase 1: Module Scaffold & Settings — COMPLETE

Create a loadable module with all settings registered and VTTools branding. No gameplay yet — just the skeleton that everything else builds on.

- [x] Create `module.json` manifest (v13 compatible, dnd5e v4.0.0+ relationship, 4 compendium packs, packFolders, VTTools author info)
- [x] Create `scripts/module.js` entry point with `init` hook and all settings registration:
  - `showPickupDialog` (Boolean, default true)
  - `appraisalEnabled` (Boolean, default true)
  - `appraisalDCOffset` (Number, default -5)
  - `baseDCOffset` (Number, default 12)
  - `critFailEnabled` (Boolean, default true)
  - `allowHumanoidHarvesting` (Boolean, default false)
  - `foragingBaseDC` (Number, default 12)
  - `valueMultiplier` (Number, default 0.5)
  - `skillMappingOverrides` (Object, hidden, default {})
- [x] Create `scripts/config.js` with default skill mappings (6-skill distributed system), CR tier definitions (0-1, 2-4, 5-10, 11+), DC formula constants, tool-to-type mappings
- [x] Create `styles/ultimate-harvester.css` with VTTools color palette (CSS custom properties scoped to `.ultimate-harvester`), base typography, and branding styles
- [x] Create `lang/en.json` with all i18n keys (settings names/hints, UI strings, notifications, category labels)
- [x] Create empty compendium pack directories (`packs/harvest-items/`, `packs/harvest-tables/`, `packs/generic-tables/`, `packs/foraging-tables/`)
- [x] Add VTTools branding: `renderSettingsConfig` hook for settings promo note
- [x] Create `deploy.sh` script for copying to live directory
- [x] Deploy to `R:/Foundry/Data/modules/ultimate-harvester/` and verify module loads in Foundry with all settings visible

> **Implementation notes:**
> - Skill mapping submenu uses `FormApplication` (not ApplicationV2) since it's a simple settings form — will be migrated if needed in Phase 7
> - Added `hotReload: true` flag for development convenience
> - `socketlib` listed as optional relationship in module.json, not a hard dependency

> **Watch out:** Foundry v13 changed `getSceneControlButtons` to pass a `Record<string, SceneControl>` object, not an array. Also, dnd5e v4+ changed skill roll APIs — `rollSkill()` returns an array of rolls.

---

### Phase 2: Core Harvest Workflow — COMPLETE

**Depends on:** Phase 1

Implement the full harvest pipeline: trigger → validate → lookup → roll → filter → award. This is the heart of the module.

- [x] Create `scripts/table-lookup.js` — layered fallback lookup:
  - Priority 1: Actor flag override (`getFlag("ultimate-harvester", "harvestTable")` → `fromUuid()`)
  - Priority 2: Exact name match in `harvest-tables` compendium (`pack.getIndex()`)
  - Priority 3: Normalized name match (strip prefixes: Young/Adult/Ancient/Elder/Greater/Lesser)
  - Priority 4: Generic type+CR table from `generic-tables` compendium (read `actor.system.details.type.value` + `actor.system.details.cr`, compute tier)
  - Cache compendium indexes after first load
- [x] Create `scripts/harvesting.js` — harvest workflow state machine:
  - Validate: dead NPC, not harvested, player has selected token, humanoid check
  - Skill resolution: creature type → primary skill from config/settings
  - Tool check: verify relevant tool in harvester inventory, read purpose-built tool bonus from flags
  - Roll: `actor.rollSkill()` with optional advantage mode
  - Nat 1 / Roll < 5 failure handling (read consequence from table flags)
  - Nat 20 bonus item handling (read `critSuccessItem` flag)
  - DC threshold filter: `table.results.filter(r => r.getFlag("ultimate-harvester", "dc") <= rollTotal)`
  - Quantity roll: `new Roll(flags.quantity).evaluate()` for each result
  - Award items: `fromUuid()` → `.toObject()` → set quantity → `actor.createEmbeddedDocuments("Item", [...])`
  - Mark harvested: `creature.setFlag()` (via socketlib `executeAsGM` if available, direct if player owns)
- [x] Create `scripts/socket.js` — optional socketlib integration:
  - `initSocket()` with deferred initialization (handle both hook orderings)
  - `gmSetFlag()` helper for marking NPCs as harvested
  - `gmCreateEmbeddedDocuments()` helper for awarding items
  - Graceful degradation when socketlib is not installed
- [x] Create `templates/harvest-dialog.hbs` — Appraise / Harvest / Cancel prompt (creature name, type, CR, skill to be used)
- [x] Create `templates/harvest-result.hbs` — chat card showing harvest results (items found, quantities, values)
- [x] Create `templates/harvest-pickup.hbs` — take/leave popup with checkboxes per item (name, quantity, category icon)
- [x] Create harvest macro: player selects their token → clicks dead creature → runs macro → opens harvest dialog
  - Macro seeded to world macros on first GM login (versioned seed flag, not compendium — simpler)
  - Macro calls `game.ultimateHarvester.harvest()`
  - Targeting uses `game.user.targets` with `canvas.tokens.hover` fallback
- [x] Create `scripts/test-data.js` — test data seeder with 4 loot items, 1 specific table (Wolf), 1 generic table (Beast CR 0-1)
  - Run via `game.ultimateHarvester.seedTestData()` in browser console
- [x] Deploy to live directory

> **Implementation notes:**
> - Harvest macro seeded to `ultimate-harvester-macros` compendium pack (same pattern as Showtime)
> - Targeting: primary via `game.user.targets` (right-click target), fallback to `canvas.tokens.hover`
> - `game.ultimateHarvester` API exposed on `init` hook: `harvest()`, `viewAppraisal()`, `seedTestData()`
> - Uses legacy `Dialog` (not `DialogV2`) for all dialogs — will migrate in Phase 7 if needed
> - Chat message posts immediately when macro triggers (before dialog opens) so the party sees who is approaching which corpse, with time estimates
> - Harvest dialog includes collapsible "How does it work?" sections for both appraise and harvest
> - Test data seeder (`seedTestData()`) auto-clears packs before re-seeding
> - Test data: Wolf (Beast CR 1/4), Winter Wolf (Monstrosity CR 3), Beast CR 0-1 generic. DCs follow formula: CR + baseDCOffset (12) + rarity offset (+0/+2/+5/+8)
>
> **Post-phase iteration (creature-centric refactor):**
> - Refactored from player-centric to creature-centric model — all harvest state stored on creature flags
> - `availableItems` flag locks evaluated items (with quantities) on creature after first roll
> - `harvestingBy` flag provides exclusive lock during harvesting
> - Subsequent harvesters see remaining items directly (no roll), via `_pickupRemaining()` path
> - Chat card for leftovers: "[Character] picks through the remains of [Creature]"
> - Remaining item count shown in harvest result chat card
> - All creature references use `actor.uuid` (not `.id`) to correctly handle unlinked token actors

---

### Phase 3: Appraisal & Retry System — COMPLETE

**Depends on:** Phase 2

Add the optional appraisal pre-step and retry mechanics for failed harvests.

- [x] Implement appraisal flow in `harvesting.js`:
  - Roll same skill as harvest, compare against `lowestDC + appraisalDCOffset`
  - Tier +1 visibility: show items up to one DC tier above the roll result
  - On success: store `appraisalSuccess` flag, grant advantage on subsequent harvest
  - Track `appraisalAttempts` in actor flag, apply cumulative -5 per retry
- [x] Create `templates/appraisal-result.hbs` — appraisal result display:
  - Success: show visible items with names, DCs, categories; highlight items within reach vs. one tier above (dimmed + "just out of reach")
  - Show failure tier consequences (Nat 1 / Roll < 5 effects)
  - Time estimate (harvest time based on reachable tiers)
  - Failure: "No useful information" message, retry penalty display
- [x] Implement retry mechanics in `harvesting.js`:
  - Fail by < 5: set `maxRetryDC` flag (lowest missed DC - 1), allow retry at full time cost
  - Fail by 5+: set `harvested: "ruined"` flag, no further attempts
  - Chat messages distinguish ruined vs. retryable failures
- [x] Update harvest dialog to show post-appraisal state (advantage granted / failed indicator)
- [x] Cumulative time tracking: appraisal time added to harvest time in all chat cards
- [x] Deploy and test

> **Implementation notes:**
> - Appraisal DC = lowest DC in the table + appraisalDCOffset setting (default -5)
> - Appraisal time = 5 min + 1 min per CR (stored on creature, shown in all cards)
> - Retry state: `maxRetryDC` flag on creature caps available tiers on subsequent attempts
> - All time tracking is cumulative — appraisal + harvest total shown in final chat card
> - Prior appraisal penalty shown clearly in initial dialog (e.g., "-5 penalty from prior attempt(s)")
>
> **Post-phase iteration (UX overhaul):**
> - Appraisal chat card is now concise (summary only) with "View Appraisal Details" link
> - Appraisal data stored on creature flag (`appraisalData`) so any player can view it via chat link
> - `viewAppraisal(creatureUuid)` opens a standalone modal — exposed on public API and chat click handler
> - After appraisal, harvester sees a **single combined dialog** (`post-appraisal-dialog.hbs`) with appraisal results at top + harvest button at bottom — no more two separate popups
> - Appraisal item visibility uses difficulty labels instead of "out of reach": Easy (green), Moderate (gold), Difficult (amber), Near Impossible (red), Impossible (greyed "Unknown Material" for hidden tiers beyond peek)
> - Appraisal crit effects: Nat 20 = +2 bonus (stored as `appraisalBonus` on creature), Nat 1 = disadvantage (stored as `appraisalDisadvantage`). Both persist for whoever harvests.
> - Chat link handler uses `renderChatMessage` hook listening for `.ultimate-harvester-view-link` clicks
>
> **UI styling (applied across phases):**
> - Time banner: bold, inset box with purple clock icon, positioned at top of all cards
> - Icon colors by category: food=green, material=brown, component=purple, trophy=gold
> - Icon colors by function: danger=red, warning=amber, success=green, time=purple, gold=goldenrod
> - Category badges with colored borders matching their type
> - Difficulty labels right-aligned with colored text
>
> **Files added beyond original plan:**
> - `templates/appraisal-modal.hbs` — standalone modal for "View Appraisal Details" link
> - `templates/post-appraisal-dialog.hbs` — combined appraisal results + harvest dialog
> - `packs/ultimate-harvester-macros/` — macros compendium pack (added to module.json)

---

### Phase 4: Content Pipeline & Generic Tables — NOT STARTED

**Depends on:** Phase 2

Build the content authoring pipeline and create generic harvest tables for all 14 creature types across 4 CR tiers. This is labor-intensive but uses a repeatable process.

- [ ] Build `tools/csv-to-json.js` — Node.js script to convert spreadsheet CSV to Foundry JSON source files:
  - Input: CSV with columns (Table Name, Item Name, DC, Quantity, Category, Price, Weight, Description, Crit Fail Effect, Nat 20 Item)
  - Output: JSON files for `harvest-items` and `generic-tables` packs (RollTable format with flags)
  - Generate unique `_id` values for items and table results
  - Handle item deduplication (same item referenced by multiple tables)
- [ ] Create harvest item spreadsheet with all unique loot items (~100-150 items across 14 creature types):
  - Categories: material, food, component, trophy
  - Apply 50% value reduction per resolved decision (supplemental income, not primary gold)
  - Include 3-5 purpose-built harvesting tools (Harvester's Kit +1, Fiend Extraction Receptacle +3, Dragon Scale Pry Bar +2, etc.)
- [ ] Design generic tables for the 3 existing types (fill remaining CR tiers):
  - Beast: CR 0-1 ✓, CR 2-4 ✓, CR 5-10 ✓, CR 11+ (new)
  - Undead: CR 0-1 ✓, CR 2-4 ✓, CR 5-10 ✓, CR 11+ (new)
  - Dragon: CR 5-10 ✓, CR 11+ ✓, CR 0-1 (new), CR 2-4 (new)
- [ ] Design generic tables for the remaining 11 creature types (44 tables):
  - Aberration (4 tiers), Celestial (4), Construct (4), Elemental (4), Fey (4), Fiend (4), Giant (4), Humanoid (4), Monstrosity (4), Ooze (4), Plant (4)
  - 3-6 items per table, following the DC = CR+12 base with rarity offsets (+0/+2/+5/+8)
- [ ] Run CSV → JSON conversion, compile JSON → LevelDB with `fvtt package pack`
- [ ] Deploy and verify: harvest a creature of each type, confirm correct generic table is found and items are awarded
- [x] ~~Add `globalValueMultiplier` application in item award step~~ (already implemented in Phase 2 — `_awardItems()` applies `valueMultiplier` setting)

> **Watch out:** Some creature types don't exist at certain CR ranges in official content (e.g., Dragon CR 0-1 is rare). Create tables anyway for homebrew coverage, but keep them minimal. Item IDs must be stable across rebuilds — use deterministic ID generation.

---

### Phase 5: Foraging System — NOT STARTED

**Depends on:** Phase 1, Phase 4 (for content pipeline)

Implement the full foraging workflow with DM panel, player prompts, and all 10 environments.

- [ ] Create `scripts/foraging.js` — foraging workflow engine:
  - Calculate DC: environment base DC - (hours - 1) + DM modifier + weather + season
  - Hybrid roll mechanic: Survival check to pass DC, then d20 table roll with +1 per 5 margin-of-success
  - Determine highest qualifying tier (NOT cumulative)
  - Draw from tier's d6 sub-table using standard `table.roll()`
  - Post results via chat card with threat interaction reminder
  - Whisper GM notification
- [ ] Create `scripts/foraging-panel.js` — DM Foraging Panel (ApplicationV2 + HandlebarsApplicationMixin):
  - Singleton pattern for persistence
  - PARTS system for selective re-rendering
  - Fields: environment dropdown (10 options), DM modifier (+/-), weather dropdown (7 options), season dropdown (4 options), primary/secondary skill (auto-filled from environment, editable)
  - VTTools branding header via `_onRender()`
  - Store config in world settings
- [ ] Create `templates/forage-panel.hbs` — DM panel template
- [ ] Create `templates/forage-prompt.hbs` — player "How many hours?" prompt (number input, DC preview)
- [ ] Create `templates/forage-result.hbs` — foraging result chat card (what was found, time spent, threat reminder)
- [ ] Add scene control button for DM panel via `getSceneControlButtons` hook (v13 object-based Record)
- [ ] Add "Forage" macro or scene control button for players
- [ ] Design foraging tables for all 10 environments (4 tiers x ~6 entries each = ~240 table entries):
  - Existing: General, Jungle, Arctic, Desert (expand from rules doc drafts)
  - New: Light Forest, Swamp/Marsh, Coastal, Mountain, Underground/Cave, Urban/Ruins
  - Include environment base DCs, default primary/secondary skills per environment
- [ ] Create foraging table content via CSV pipeline, compile to LevelDB
- [ ] Deploy and test: DM opens panel → sets environment → player forages → receives loot

> **Watch out:** The DM panel is a full ApplicationV2 subclass — the most complex UI in the module. Use PARTS system for selective re-rendering to avoid full redraws when changing a single dropdown. `getSceneControlButtons` in v13 passes a `Record<string, SceneControl>`, not an array.

---

### Phase 6: Specific Creature Override Tables — NOT STARTED

**Depends on:** Phase 4 (content pipeline)

Create hand-crafted harvest tables for iconic creatures. These override generic tables via the layered lookup system.

- [ ] Design override tables for High Priority creatures (~25-30 tables):
  - Common beasts: Wolf, Boar, Brown Bear, Giant Spider
  - Common undead: Skeleton, Zombie, Ghoul, Wraith, Vampire Spawn
  - Monstrosities: Owlbear, Basilisk, Manticore
  - Dragons by color: 5 colors (Black, Blue, Green, Red, White) x 3 ages (Young, Adult, Ancient) = 15 tables
  - Include crit fail consequences and nat 20 items specific to each creature
- [ ] Design override tables for ToA creatures (unique/notable only, not every creature):
  - Dinosaurs: Allosaurus, Ankylosaurus, Brontosaurus, Deinonychus, Dimetrodon, Hadrosaurus, Plesiosaurus, Pteranodon, Quetzalcoatlus, Stegosaurus, Triceratops, T-Rex, Velociraptor
  - ToA-specific: Aldani, Assassin Vine, Chwinga, Eblis, Froghemoth, Girallon, Grung, Kamadan, Mantrap, Su-Monster, Vegepygmy, Yellow Musk Creeper, Yuan-ti (3 variants), Zorbo
  - Remaining ToA creatures fall back to generic type+CR tables
- [ ] Design override tables for Medium Priority creatures:
  - Beholder (eye stalks, central eye lens), Mind Flayer (brain, tentacles), Gelatinous Cube (absorbed items, residue), Troll (already designed in rules doc), Hydra (multiple heads)
- [ ] Create all override content via CSV pipeline, compile to `harvest-tables` LevelDB pack
- [ ] Verify layered lookup correctly prefers specific tables over generic for all override creatures

> **Watch out:** Dragon tables use normalized name matching — "Young White Dragon" strips "Young" prefix and matches "White Dragon Harvest Table". Ensure naming convention is consistent. ToA has ~150 creatures but many are standard MM monsters (goblins, zombies, etc.) — only create overrides for creatures with unique/interesting loot. The rest use generics.

---

### Phase 7: UI Polish & GM Tools — NOT STARTED

**Depends on:** Phases 2-5

Production-quality UI, styled chat cards, and GM convenience features.

> **Note:** Significant UI work was done during Phase 2-3 iteration: time banners, icon colors, category badges, difficulty labels, collapsible info sections, combined post-appraisal dialog. The remaining items below are what's left.

- [ ] Style DM Foraging Panel:
  - 400px settings width
  - Section headers with uppercase labels
  - Select rows with icons
- [ ] Style foraging result chat cards to match harvest card design
- [ ] Add VTTools GM Ant branding header to ApplicationV2 windows (harvest table editor, foraging panel)
- [ ] Add visual indicator on harvested tokens (tint or icon overlay, optional setting)
- [ ] Add visual indicator on partially-looted tokens (different from fully harvested)
- [ ] Create GM tools:
  - Right-click actor → "Assign Harvest Table" (opens compendium browser/picker, sets `harvestTable` flag)
  - Right-click actor → "Reset Harvest" (clears all harvest-related flags)
- [ ] Create Harvest Table Editor (ApplicationV2 dialog for GM customization):
  - Create/edit harvest tables with a friendly UI (no manual flag editing)
  - Fields per row: item picker (compendium browser), DC, quantity formula, category dropdown
  - Crit fail effect and Nat 20 bonus item fields on the table level
  - "Save to World" button that creates a properly-flagged RollTable
  - Accessible from GM tools menu or right-click on an existing harvest table
- [ ] Create skill mapping submenu (ApplicationV2 form with 14 dropdowns via `registerMenu()`)
- [ ] Add CSS responsive layout tweaks for different Foundry window sizes
- [ ] Deploy and verify all UI elements look polished in both light and dark Foundry themes

---

### Phase 8: Final Content & Documentation — NOT STARTED

**Depends on:** Phases 4-6

Fill out any remaining content gaps, finalize documentation, and prepare for release.

- [ ] Audit all generic tables — verify every creature type x CR tier has appropriate items and balanced DCs
- [ ] Audit all specific creature overrides — verify naming matches lookup expectations
- [ ] Verify item value balance with `globalValueMultiplier` at 1.0 (supplemental income, not primary gold)
- [ ] Create user-facing README with features, installation, and configuration guide
- [ ] Document data authoring workflow for community contributions (CSV format spec, pipeline usage)
- [ ] Consider CSV import tool for GMs to add custom harvest tables at runtime
- [ ] Final testing: run through complete workflows for harvesting (all creature types), appraisal, retries, and foraging (all environments)
- [ ] Prepare `module.json` for release (manifest URL, download URL, changelog)

---

## Current File Inventory

As of Phases 1-3 + iteration:

| File | Purpose |
|------|---------|
| `module.json` | Manifest — 5 compendium packs (incl. macros), dnd5e relationship, socketlib optional |
| `scripts/module.js` | Entry point — settings, macro seeding, socket init, branding, chat link handler |
| `scripts/config.js` | Defaults — skill mappings, CR tiers, DC formula, size modifiers, tool mappings, categories |
| `scripts/harvesting.js` | Core workflow — creature-centric harvest + appraisal + retry + sequential looting |
| `scripts/table-lookup.js` | 4-priority layered fallback table lookup with cached indexes |
| `scripts/socket.js` | Optional socketlib — `gmSetFlag()`, `gmCreateEmbeddedDocuments()` |
| `scripts/test-data.js` | Dev-only seeder — Wolf, Winter Wolf, Beast CR 0-1 (auto-clears before re-seed) |
| `styles/ultimate-harvester.css` | VTTools palette, icon colors, time banners, difficulty labels, badges, layout |
| `templates/harvest-dialog.hbs` | Initial Appraise/Harvest/Cancel dialog with time estimates, info dropdowns, penalty display |
| `templates/post-appraisal-dialog.hbs` | Combined appraisal results + harvest button (single window for harvester) |
| `templates/appraisal-result.hbs` | Concise chat card with "View Appraisal Details" link |
| `templates/appraisal-modal.hbs` | Standalone modal for viewing full appraisal details (opened from chat link) |
| `templates/harvest-result.hbs` | Harvest result chat card with items, time, remaining count |
| `templates/harvest-pickup.hbs` | Take/leave checkbox dialog with category badges and time |
| `templates/skill-mapping-config.hbs` | Settings submenu for 14 creature-type skill dropdowns |
| `lang/en.json` | All i18n keys |
| `deploy.sh` | Copy to `R:/Foundry/Data/modules/ultimate-harvester/` |

---

## Risks & Considerations

1. **Content volume** — ~56 generic tables + ~60 override tables + ~240 foraging entries + ~150 loot items is a massive amount of content. The CSV pipeline is essential to avoid burnout. Mitigation: build the pipeline early (Phase 4), design templates that can be followed quickly.

2. **dnd5e API instability** — dnd5e v4/v5 changed skill roll return types and other APIs. Mitigation: check Context7 for latest dnd5e API docs before implementing roll logic. Test against the installed dnd5e version.

3. **Foundry v13 breaking changes** — `renderChatMessageHTML` gives native DOM (not jQuery), `getSceneControlButtons` uses Record (not array), `DialogV2` replaces `Dialog`. Mitigation: use v13 patterns from the start, reference Foundry v13 API docs.

4. **socketlib dependency** — needed for marking NPC flags when player doesn't own the actor. If socketlib isn't installed, the "mark as harvested" step will fail silently for non-GM users. Mitigation: graceful degradation with a warning notification suggesting socketlib installation.

5. **RollTable flags** — the entire DC threshold system depends on custom flags on RollTable results. If Foundry changes how flags work on embedded documents, this breaks. Mitigation: this is a stable, well-documented API — low risk but worth noting.

6. **Compendium pack compilation** — LevelDB packs must be compiled with `fvtt package pack`. If the Foundry CLI changes, the pipeline breaks. Mitigation: pin CLI version, keep JSON source files as the source of truth.

7. **ToA creature scope creep** — the ToA creature list has ~150 entries, but many are standard MM creatures. Creating specific overrides for all of them is unnecessary. Mitigation: only override creatures with unique/interesting loot (dinosaurs, ToA-specific monsters). Others use generic type+CR tables.

---

## Open Questions

- [x] Skill mapping system — Option A: Distributed 6-skill, type-based
- [x] V1 creature overrides — High Priority + all ToA creatures
- [x] Foraging environments — All 10 in v1
- [x] Foraging roll mechanic — Hybrid: Survival DC + d20 table roll with margin-of-success bonus
- [x] Should foraging table results reference items from the `harvest-items` compendium, or be standalone text entries? — **Compendium items.** All foraging finds are proper dnd5e loot items added to player inventory.
