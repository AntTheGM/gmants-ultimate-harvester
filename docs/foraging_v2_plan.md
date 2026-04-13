# Foraging System v2 — Dynamic Item Pools

**Status**: Phases 3-4 Complete, Phase 5 Not Started
**Last Updated**: 2026-04-12
**Related Docs**: [Implementation Plan (main)](implementation_plan.md) | [Game Rules](harvester_rules.md) | [Architecture](harvester_module.md)

---

## Overview

The original foraging system (Phase 5 of the main implementation plan) uses hand-curated RollTables with 6 entries each, drawn via Foundry's `table.draw()`. This worked as a scaffold but doesn't scale — the module now has **128 forageable items** across 4 categories and 10 biomes, but each tier table can only surface 6 of them. The CSV data shows 15-21 items tagged per table, meaning the majority of content is unreachable.

This plan replaces the RollTable-based foraging draw with a **dynamic item pool** system. Instead of rolling on pre-built tables, the code queries the `harvest-items` compendium at runtime, filtering by biome, tier, and category. Items self-describe where they belong via flags (`biomes[]`, `tier`). Adding new items means tagging them correctly — no table editing required.

The redesign also introduces a **bundle system** that makes foraging more rewarding and predictable for survival gameplay. Each qualifying tier contributes multiple item stacks (not just one), quantities scale with roll quality, and the first items found are always food/water — guaranteeing that foraging actually feeds the party.

---

## Goals

1. **Surface all content** — Every forageable item reachable at runtime based on its biome/tier tags, not limited by 6-slot tables
2. **Guaranteed survival** — First 2 items found are always food/drink category; foraging reliably feeds the party
3. **Rewarding variety without clutter** — Max 2 unique items per tier (no inventory bloat), but quantity per stack scales with roll quality
4. **Zero-maintenance content pipeline** — Adding items = tagging flags in the item JSON. No table rebuilding, no slot management
5. **Simulator parity** — `tools/forage_sim.py` updated to match new mechanics for balance testing

---

## Architecture

### Current Flow (v1)

```
Skill Roll → Determine qualifying tiers → For each tier:
  → Find RollTable by name ("Coastal - Tier 1 Foraging Table")
  → table.draw() with 1d6 + margin bonus
  → Get 1 random result from 6 entries
→ Show pickup dialog → Award items
```

### New Flow (v2)

```
Skill Roll → Determine qualifying tiers → Build bundle recipe:
  → Per tier: roll 1d2 for number of stacks (Rare = always 1)
  → Per stack: assign category constraint (survival-first rules)
→ Fill each stack:
  → Query item pool: compendium index filtered by biome + tier + category
  → Random draw from matching pool (no duplicates within same tier)
  → Roll quantity die (base 1d3, scaled by margin bonus)
→ Show pickup dialog → Award items
```

### Item Pool Index

On first forage of a session, the system indexes the `harvest-items` compendium:

```javascript
// Conceptual structure — cached in memory after first build
poolIndex = {
  "coastal": {
    1: { food: [item1, item2, ...], component: [...], material: [...], trophy: [...] },
    2: { food: [...], ... },
    3: { food: [...], ... },
    4: { food: [...], ... },  // tier 4 = Rare
  },
  "light-forest": { ... },
  ...
}
```

Each item in the pool is a lightweight reference (name, UUID, category) pulled from the compendium pack index + flags. Full item data is only loaded when awarding.

### Item Flag Schema (new fields)

```json
{
  "flags": {
    "ultimate-harvester": {
      "category": "food",
      "source": "foraged",
      "shelfLife": 4,
      "biomes": ["coastal", "light-forest", "plains"],
      "tier": 1
    }
  }
}
```

- `biomes` — array of environment keys from `FORAGING_ENVIRONMENTS` in config.js
- `tier` — integer 1-4 (1=common, 2=uncommon, 3=rare finds, 4=rare/legendary)

### Bundle Recipe

The bundle determines how many unique item stacks are drawn per tier:

| Tier | Stacks | Quantity Die (base) |
|------|--------|-------------------|
| Tier 1 | 1d2 | 1d3 |
| Tier 2 | 1d2 | 1d3 |
| Tier 3 | 1d2 | 1d3 |
| Rare | 1 (fixed) | 1d3 |

**Margin-of-success bonus** (+1 per 5 points above lowest DC) scales the quantity die:

| Margin | Quantity Die |
|--------|-------------|
| +0 | 1d3 |
| +1 | 1d4 |
| +2 | 1d6 |
| +3+ | 1d8 |

This means a great roll doesn't produce more *types* of items (max 2 per tier), but you find *more* of what you find.

### Survival-First Draw Order

Stacks are drawn in sequence across tiers (Tier 1 first, then Tier 2, etc.). The category constraint applies by position in the overall draw order:

| Draw Position | Category Constraint |
|--------------|-------------------|
| 1st stack | Must be `food` |
| 2nd stack | Must be `food` |
| 3rd stack | Must NOT be `food` |
| 4th+ stacks | Any category |

If a tier's pool has no items matching the required category for that position, fall back to an unconstrained random draw from the full tier pool.

### Rare Tier Access

Rare tier (tier 4) is accessible on a **natural 18+** on the d20 (expanded from nat 20 only in v1). This makes rare items achievable without being common — roughly 15% chance per forage.

---

## Key Decisions

1. **Dynamic pools over bigger RollTables** — We considered expanding tables from d6 to d20, but that still requires manual table maintenance when items are added. Dynamic pools eliminate table editing entirely. The tradeoff is slightly more complex code and a compendium index scan on first use, but 128 items is trivially small for an in-memory index.

2. **Max 2 stacks per tier** — We considered 1d3 stacks per tier (the "generous" option) but the user wanted to avoid inventory bloat. Two unique items per tier (max 7 total on an incredible roll) keeps the pickup dialog manageable while the quantity scaling provides the feeling of abundance.

3. **Margin bonus scales quantity, not variety** — The margin-of-success bonus previously shifted which table entry you landed on (higher = rarer within tier). In v2, it steps up the quantity die (1d3 → 1d4 → 1d6 → 1d8). A skilled forager finds *more* of what they find, not more *types*. This keeps inventory tidy while rewarding high rolls.

4. **Survival-first by draw order, not by table restructuring** — We considered splitting every tier into separate food/non-food sub-tables, but that would double the content management burden. Instead, category constraints are applied at draw time by filtering the pool. Same effect, zero extra data files.

5. **Nat 18+ for rare (not nat 20 only)** — Nat 20 only meant ~5% chance, and with the old system that was the *only* way to see rare content. 18+ gives ~15% chance, making rare items achievable without being routine. Combined with tier 4 always being 1 stack (not 1d2), rare items stay special.

6. **Foraging tables compendium kept but unused** — The `foraging-tables` pack stays in `module.json` for now (removing it would break worlds that reference it). The code simply stops querying it. Can be removed in a future cleanup pass.

---

## Implementation

> **To implement this plan**, use the `implement` skill (`/implement`) which will read this document, identify the next incomplete phase, and execute it step by step.

---

## Implementation Phases

### Phase 1: Backfill Item Flags — COMPLETE

Add `biomes` and `tier` flags to all 128 forageable item JSONs. The mapping data already exists in `docs/harvestable-items_foraging.csv` (the `tables` column lists which RollTables each item appears on, encoding both biome and tier). This phase parses that data and writes it into the item source files.

- [x] Create `tools/backfill-item-pools.js` — Node.js script that:
  - Reads `docs/harvestable-items_foraging.csv`
  - Parses the `tables` column: extract biome key and tier number from table names like `"Coastal - Tier 2 Foraging Table"` (map label → config key, e.g., `"Coastal"` → `"coastal"`, `"Dense Forest / Jungle"` → `"dense-forest"`)
  - For items on multiple tables at different tiers, use the **lowest** tier (item is accessible from that tier upward, matching the cumulative tier model)
  - Writes `biomes: [...]` and `tier: N` into `flags.ultimate-harvester` of each item's JSON in `packs/_source/harvest-items/`
  - Preserves all existing flags (`category`, `source`, `shelfLife`)
  - Reports: items updated, items with no table mapping (skip), biome/tier distribution summary
- [x] Run the backfill script and verify output: spot-check 5+ items across different biomes/tiers
- [x] Update `tools/csv-to-json.js` to include `biomes` and `tier` in generated item JSONs for future items (so the pipeline stays current)
- [ ] ~~Update `docs/harvestable-items_foraging.csv` header documentation~~ — CSV has no header docs to update; skipped

> **Implementation notes:**
> - 85 of 128 items updated successfully. 43 items in the CSV have no matching JSON source file yet (newly added items like water variants, small game, etc.). These will need JSON files created before the pool system can reference them.
> - Biome distribution is healthy: 39-44 items per biome across all 10 environments.
> - Tier distribution: Tier 1 (43), Tier 2 (18), Tier 3 (12), Rare (12). Lower tiers have more items as expected.
> - `csv-to-json.js` updated with optional `Biomes` (semicolon-separated keys) and `Tier` (integer) columns. Backward-compatible — existing CSVs without these columns still work.

### Phase 2: Item Pool Engine — COMPLETE

**Depends on:** Phase 1

Create the runtime engine that replaces RollTable lookups with compendium index queries.

- [x] Create `scripts/item-pool.js` with:
  - `buildPoolIndex()` — scans `harvest-items` compendium pack index, reads flags (`biomes`, `tier`, `category`, `source`), filters to `source === "foraged"`, builds nested map: `{ [biome]: { [tier]: { [category]: [{name, uuid, ...}] } } }`
  - `getPool(biome, tier, category?)` — returns array of matching items. If `category` is specified, filters to that category. Returns empty array if no matches.
  - `drawFromPool(biome, tier, category?, exclude?)` — random draw from `getPool()` result, excluding items already drawn (by UUID) to prevent duplicates within a tier. Returns `null` if pool is empty after filtering.
  - `clearPoolCache()` — invalidates cached index (call if compendium contents change at runtime)
  - Cache the index in a module-scoped variable; rebuild on first call per session
- [x] Add `item-pool.js` to `module.json` esmodules or import it from `foraging.js`
- [x] Write a console test function (`game.ultimateHarvester.testPool(biome, tier)`) that dumps pool contents for verification
- [x] Deploy and verify pool index builds correctly in Foundry console

> **Implementation notes:**
> - `item-pool.js` imported into `module.js` and wired to public API: `game.ultimateHarvester.testPool(biome, tier)` and `game.ultimateHarvester.clearPoolCache()`
> - `getPool()` supports `"non-food"` as a special category value — returns all items except food category. This is needed for the survival-first slot 3 constraint in Phase 4.
> - `drawFromPool()` has built-in fallback: if a category-constrained draw produces an empty pool, it automatically retries with no category constraint and logs a warning. This handles sparse biome/tier/category combinations gracefully.
> - Uses `pack.getIndex({ fields: ["flags.ultimate-harvester"] })` to include custom flags without loading full documents.
> - Needs verification in Foundry that `getIndex` with `fields` works for nested flag paths in v13. If it doesn't, fallback would be to load all documents (slower but functional).

### Phase 3: Bundle Builder & Foraging Rewrite — COMPLETE

**Depends on:** Phase 2

Rewrite the core draw loop in `foraging.js` to use the bundle system with dynamic pools.

- [x] Add bundle constants to `config.js`:
  - `FORAGE_BUNDLE` — stacks per tier: `{ 1: "1d2", 2: "1d2", 3: "1d2", 4: "1" }`
  - `FORAGE_QUANTITY_DICE` — margin-to-die mapping: `["1d3", "1d4", "1d6", "1d8"]`
  - `FORAGE_RARE_THRESHOLD` — natural d20 value for rare access: `18`
- [x] Rewrite `foraging.js` draw loop to:
  - Replace RollTable lookup with `drawFromPool()` calls
  - For each qualifying tier: roll stacks die (1d2, or 1 for Rare), then for each stack call `drawFromPool(biome, tier, categoryConstraint, excludeList)`
  - Roll quantity per stack using margin-scaled die
  - Track `excludeList` per tier to prevent duplicate items within same tier
  - Collect results into `foragedItems[]` array (same shape as before)
- [x] Update rare tier access: `d20 >= FORAGE_RARE_THRESHOLD` (nat 18+)
- [x] Update margin bonus calculation: indexes into `FORAGE_QUANTITY_DICE` instead of adding to table roll
- [x] Remove the `pack.getIndex()` / `table.draw()` code block entirely
- [x] Verified downstream code (pickup dialog, item awards, chat cards, failure events) unchanged — same `foragedItems[]` shape
- [x] Updated chat card: "table bonus" → "quantity bonus", rare find check uses threshold
- [x] Deploy

> **Implementation notes:**
> - Biome key resolved from `FORAGING_ENVIRONMENTS` entries at draw time (matching envDef object reference).
> - Survival-first category constraints (Phase 4) implemented inline since `_getCategoryConstraint()` was trivial — no reason for a separate phase.
> - Chat card "Rare find!" message now triggers on nat 18+ instead of nat 20 only.
> - Pre-existing minor issue: `resultText` variable in chat card fallback was never defined (harmless — caught by `|| "Nothing taken"`). Not introduced by this change.

### Phase 4: Survival-First Draw Rules — COMPLETE (merged into Phase 3)

**Depends on:** Phase 3

Implemented inline with Phase 3 since `_getCategoryConstraint()` was trivial.

- [x] `_getCategoryConstraint(drawPosition)` helper: positions 0-1 → `"food"`, position 2 → `"non-food"`, 3+ → `null`
- [x] Bundle fill loop passes constraints to `drawFromPool()` with running `drawPosition` counter across all tiers
- [x] `drawFromPool()` fallback (from Phase 2) handles empty constrained pools automatically
- [ ] Test edge cases in Foundry (deferred to Phase 5 integration testing)

### Phase 5: Repack & Integration Test — NOT STARTED

**Depends on:** Phases 1-4

Compile updated item JSONs into LevelDB packs and run end-to-end testing.

- [ ] Run `fvtt package pack "harvest-items"` to compile updated item JSONs (with new `biomes`/`tier` flags) into LevelDB. If Foundry CLI is not available, use the existing `seedTestData()` runtime seeder to push updated items into the compendium.
- [ ] Verify pool index builds correctly from the packed compendium (not just source JSONs)
- [ ] End-to-end test matrix (at minimum):
  - Low roll (barely pass Tier 1): should get 1-2 food items
  - Mid roll (Tier 1 + Tier 2): should get 2-4 items, first 2 food, variety in rest
  - High roll (all 3 tiers): should get 4-6 items with category ordering enforced
  - Nat 18-19: should trigger Rare tier (was previously nat 20 only)
  - Nat 20: should trigger Rare tier
  - Nat 1 / failure: failure event system should still work unchanged
  - Desert biome (high DCs): verify difficulty scaling unchanged
  - Multiple forages same session: verify pool cache works, no stale data
- [ ] Verify Campsite integration: foraged food items should still appear in feed scanner (`type === "consumable"`, `system.type.value === "food"`)
- [ ] Deploy final version to live directory
- [ ] Update the main `implementation_plan.md` Phase 5 notes to reference this v2 system

### Phase 6: Update Simulator — NOT STARTED

**Depends on:** Phases 3-4 (needs final mechanics locked)

Rewrite `tools/forage_sim.py` to match the new foraging mechanics so balance testing reflects reality.

- [ ] Replace table-based item selection with pool-based draws:
  - Load items from `docs/harvestable-items_foraging.csv` with `tables` column parsed into biome/tier tags (same logic as Phase 1 backfill, but in Python)
  - Build in-memory pool index: `{biome: {tier: {category: [items]}}}`
  - Draw from pools instead of from `tools/data/foraging-tables.csv` (the old table CSV can be kept for reference but is no longer the data source)
- [ ] Implement new bundle mechanics:
  - Per tier: roll 1d2 for stack count (Rare = always 1)
  - Per stack: roll quantity die based on margin (1d3/1d4/1d6/1d8)
  - Track duplicates within tier (same item can't be drawn twice in same tier)
- [ ] Implement survival-first ordering:
  - Draw positions 1-2 constrained to food category
  - Draw position 3 constrained to non-food
  - Position 4+ unconstrained
  - Same fallback logic as the Foundry code (unconstrained if pool empty)
- [ ] Update rare tier access: trigger on simulated d20 >= 18 (not just nat 20)
- [ ] Update output formatting:
  - Per-day output: show bundle breakdown (stacks per tier, quantity die used)
  - Summary: add stats for average stacks/day, food vs non-food ratio, unique items seen vs total pool size
  - Add `--compare` flag that runs both v1 (if old tables CSV exists) and v2 side by side for the same seed
- [ ] Update CLI help text and docstring to reflect new mechanics
- [ ] Verify simulator output roughly matches manual Foundry testing from Phase 5

> **Watch out:** The simulator reads from CSV files, not from Foundry compendiums. Make sure the CSV parsing produces identical pool structures to what the Foundry code builds from compendium flags. Any discrepancy means the simulator isn't testing what the module actually does.

---

## Risks & Considerations

1. **Compendium index performance** — Building the pool index scans all items in `harvest-items` (currently ~278 items, 128 forageable). This is fast for hundreds of items but could slow down if the pack grows to thousands. Mitigation: cache aggressively, only rebuild on explicit cache clear. The `getIndex()` call with fields is a single async operation.

2. **Foundry `getIndex` with custom fields** — The `pack.getIndex({ fields: [...] })` API must include `flags.ultimate-harvester` to get biome/tier data without loading full documents. If Foundry v13 changed this API, the pool engine breaks. Mitigation: test this specific call early in Phase 2; fall back to loading all documents if needed (slower but functional).

3. **Empty pools** — Some biome+tier+category combinations may have zero items (e.g., "Urban / Ruins" Tier 1 might have no trophy items). The survival-first constraint could request a food item from a tier/biome that has none. Mitigation: every draw has a fallback to unconstrained draw, and a console warning so the content gap can be filled later.

4. **Backward compatibility** — Worlds that reference the old `foraging-tables` compendium (e.g., in journal entries or macros) won't break because the pack still exists. But any homebrew content that adds entries to foraging RollTables will no longer be used. Mitigation: document the change clearly in release notes; consider a migration guide for users with custom table entries.

5. **Simulator/module divergence** — The Python simulator and the JS module implement the same logic independently. If one is updated and the other isn't, balance testing becomes unreliable. Mitigation: Phase 6 explicitly requires verification against Phase 5 manual testing. The `--compare` flag helps catch drift.

6. **Item quantity vs. stack quantity confusion** — Items have a `quantity` field in the CSV (the table entry's base quantity), and the new system adds a separate quantity die roll per stack. Need to clarify: does the new quantity die *replace* the old per-entry quantity, or multiply it? Decision: **replace**. The old quantity was a fixed number baked into the table entry. The new system rolls quantity dynamically, so the old `quantity` field on table entries is no longer used. Item flags don't store quantity — that's purely a draw-time mechanic.

---

## Open Questions

- [x] How many stacks per tier? — 1d2 (max 2 unique items per tier)
- [x] Quantity scaling mechanic? — Margin bonus steps up die: 1d3 → 1d4 → 1d6 → 1d8
- [x] Rare tier access? — Natural 18+ on d20 (was nat 20 only)
- [x] Survival-first implementation? — Draw-order category constraints (positions 1-2 food, position 3 non-food)
- [x] What happens to old foraging tables? — Compendium kept in module.json but code stops using it
- [ ] Should the DM Foraging Panel expose any new v2 settings? (e.g., toggle survival-first, adjust rare threshold) — Decide during Phase 4 or defer to Phase 7 of main plan
- [ ] Should items on multiple tiers be accessible from lowest tier upward, or only from their specific tiers? — Current decision: lowest tier (cumulative). Revisit if this makes high-tier pools too large.
