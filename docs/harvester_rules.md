# Ultimate Harvester — Rules (Draft)

This document defines the **game rules** for the Ultimate Harvester module — skill mappings, DCs, harvesting mechanics, foraging mechanics, and content tables. These are separated from the technical architecture (`harvester_module.md`) so they can be discussed and revised independently.

**Status**: Draft — all questions resolved. Ready for implementation.

---

## Foundry v13 Compatibility Assessment

Feasibility rating for each module feature against Foundry VTT v13 + dnd5e v4-5 APIs.

**Rating key:**
- **Routine** — Native API, standard pattern, minimal code
- **Easy** — Native API with minor assembly or a trivial workaround
- **Difficult** — Requires significant custom code, complex UI, or non-obvious patterns
- **Very Difficult** — Pushes API boundaries, may require external dependencies or unsupported patterns
- **Not Possible** — Cannot be done within Foundry's module API

### Core Harvesting System

| Feature | Rating | Notes |
|---|---|---|
| Death detection (HP → 0 hook) | Routine | `updateActor` hook, check `changes.system.attributes.hp.value`. Unchanged in v13. |
| Actor flags (harvested, harvestOffered, harvestTable) | Routine | `actor.setFlag()` / `getFlag()` — native, no limits. |
| Trigger skill check with advantage | Routine | `actor.rollSkill({ skill }, { advantageMode: 1, configure: false })`. Returns array of rolls. |
| Flat ability check fallback | Easy | `actor.rollAbilityTest()` or construct a plain `D20Roll`. |
| Cumulative DC threshold filtering | Easy | Load `table.results.contents`, filter by flag DC. Trivial `Array.filter()`. RollTable results fully support custom flags. |
| Natural 1 / Roll < 5 failure tiers | Easy | Check `roll.dice[0].total === 1` for nat 1, `roll.total < 5` for fumble zone. Apply per-table consequence from flags. |
| Natural 20 bonus item | Easy | Check `roll.dice[0].total === 20`, look up `critSuccessItem` flag on the table. |
| Mark corpse as harvested (flag) | Routine | `actor.setFlag("ultimate-harvester", "harvested", true)` |
| One-harvest-per-corpse enforcement | Routine | Check flag before allowing workflow. |

### Creature-to-Table Lookup

| Feature | Rating | Notes |
|---|---|---|
| Actor flag override (Priority 1) | Routine | `actor.getFlag("ultimate-harvester", "harvestTable")` → `fromUuid()`. |
| Exact name match in compendium (Priority 2) | Routine | `pack.getIndex()` then `index.find(e => e.name === ...)`. Cached after first call. |
| Normalized name match — strip prefixes (Priority 3) | Easy | Regex on actor name before index lookup. Pure JS string manipulation. |
| Generic type+CR fallback (Priority 4) | Easy | Read `actor.system.details.type.value` and `actor.system.details.cr`, compute tier, look up `"{Type} CR {Tier} Harvest Table"`. |

### Appraisal System

| Feature | Rating | Notes |
|---|---|---|
| Same skill roll at DC offset | Routine | Same `rollSkill()` call, compare result against `harvestDC - appraisalOffset`. |
| Tier +1 visibility rule | Easy | Filter table results where `dc <= (appraisalRoll + 5 + one_tier_offset)`. Logic only, no special API. |
| Advantage on subsequent harvest check | Easy | Store appraisal result in a temporary flag or workflow state, pass `advantageMode: 1` to harvest roll. |
| Cumulative -5 retry penalty | Easy | Track retry count in actor flag or workflow state, apply as roll modifier. |
| Appraisal result dialog (show items + DCs + time note) | Easy | Pre-render Handlebars template, display via `DialogV2.wait()`. |

### Harvest Retry System

| Feature                                   | Rating    | Notes                                                                                                                                                                                         |
| ----------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fail by 5+ = ruined (set flag)            | Easy      | `harvestDC - roll.total >= 5` → set `"ruined"` flag.                                                                                                                                          |
| Fail by <5 = retry with higher tiers lost | Difficult | Need to track which tiers are still available per-corpse. Store a `maxRetryDC` flag on the actor, filter table results against it on retry. Manageable but requires careful state management. |
|                                           |           |                                                                                                                                                                                               |

### Time System

| Feature                                      | Rating    | Notes                                                                                                                                                                                                        |
| -------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Calculate time (15 min/tier + size modifier) | Routine   | Pure math. Read `actor.system.traits.size`, look up modifier.                                                                                                                                                |
| Display time in UI                           | Routine   | Render into Handlebars template or chat card.                                                                                                                                                                |
| 8-hour decay timer                           | Routine   | DM guidance note only — no enforcement mechanic. Text reminder in chat card / appraisal result. |

### Item Award System

| Feature | Rating | Notes |
|---|---|---|
| Clone item from compendium to actor inventory | Routine | `fromUuid(itemUuid)` → `.toObject()` → `actor.createEmbeddedDocuments("Item", [...])`. |
| Set quantity from dice formula | Routine | `new Roll(formula).evaluate()` to get `.total`, set on `itemData.system.quantity`. |
| Take/leave popup with checkboxes | Easy | Handlebars template with checkboxes, render in `DialogV2.wait()`, read form state in callback. |

### Tool Proficiency System

| Feature | Rating | Notes |
|---|---|---|
| Check if tool is in actor inventory | Easy | `actor.items.find(i => i.name === "Herbalism Kit" && i.type === "tool")`. |
| Purpose-built tools with flat bonus | Easy | Read bonus from item flag, add to roll modifier. |
| Tool-to-creature-type mapping | Easy | Config object mapping tool names to creature types/item categories. |

### UI — Harvest Workflow

| Feature | Rating | Notes |
|---|---|---|
| Harvest dialog (Appraise / Harvest / Cancel) | Easy | `DialogV2.wait()` with 3 buttons. Pre-render Handlebars template for content. |
| Harvest result chat card | Routine | `ChatMessage.create()` with custom HTML content and module flags. |
| Chat card with clickable "Harvest" button | Easy | Button in chat HTML + `renderChatMessageHTML` hook listener. Note: v13 hook gives native DOM, not jQuery. |
| Token HUD "Harvest" button | Easy | `renderTokenHUD` hook, append button to `.col.right`. v13 uses native DOM elements. |
| Token right-click context menu entry | Easy | Hook into token controls. Standard pattern. |

### UI — DM Foraging Panel

| Feature | Rating | Notes |
|---|---|---|
| Persistent DM panel window | Difficult | Full `ApplicationV2` subclass with `HandlebarsApplicationMixin`. Singleton pattern for persistence. v13 PARTS system for selective re-rendering. Requires understanding ApplicationV2 lifecycle. |
| Environment dropdown | Easy | HTML `<select>` in Handlebars template, bound to a world setting or panel state. |
| DM modifier field (manual +/-) | Easy | Number input in panel, stored in world setting. |
| Weather / season dropdowns | Easy | Same pattern as environment dropdown. |
| Per-environment skill override | Difficult | Need a settings UI that maps each environment to primary/secondary skills. Either a custom `ApplicationV2` settings form or a JSON-backed setting with a submenu (`registerMenu()`). |
| GM notification when player forages | Routine | `ChatMessage.create()` with `whisper` targeting GM users. |

### UI — Player Forage Flow

| Feature | Rating | Notes |
|---|---|---|
| "Forage" macro button | Routine | Create a `Macro` document or a scene control button. |
| "How many hours?" prompt | Easy | `DialogV2.prompt()` with a number input. |
| DC reduction per hour | Routine | Pure math: `baseDC - (hours - 1)`. |
| Highest-tier-only result selection | Easy | Sort matching tiers descending, take first. Simpler than cumulative (no filtering needed). |
| d6 sub-table draw | Routine | `new Roll("1d6").evaluate()` or use `table.roll()` on the tier sub-table (standard RollTable mechanics). |

### Module Settings

| Feature | Rating | Notes |
|---|---|---|
| Skill mapping per creature type (GM override) | Difficult | 14 dropdown settings (one per creature type) or a single JSON/object setting with a custom `ApplicationV2` submenu form. `registerMenu()` is native but building the form requires ApplicationV2. |
| `baseDCOffset` (Number) | Routine | `game.settings.register()` with `type: Number`, `range: {}`. |
| `appraisalDCOffset` (Number) | Routine | Same pattern. |
| `critFailEnabled` (Boolean) | Routine | `game.settings.register()` with `type: Boolean`. |
| `allowHumanoidHarvesting` (Boolean) | Routine | Same pattern. |
| Global value multiplier | Routine | Number setting. Applied when awarding items. |

### Compendium Packs

| Feature | Rating | Notes |
|---|---|---|
| Ship LevelDB compendium packs | Routine | Standard since v11. Define in `module.json`, compile with `fvtt package pack`. |
| Index and search by name | Routine | `pack.getIndex()`, `pack.getName()`, `pack.search()`. |
| Custom flags on RollTable results | Easy | `TableResult` is a full Document with `flags` field. Set via `result.setFlag()`. |
| Pack folders in module.json | Routine | `packFolders` field in manifest. |

### Socket / Permissions

| Feature | Rating | Notes |
|---|---|---|
| Player triggers harvest on owned token | Routine | No socket needed — player has permission to modify their own actor. |
| Player triggers harvest, items added to their sheet | Routine | `actor.createEmbeddedDocuments()` works for owned actors. |
| Post chat card visible to all | Routine | `ChatMessage.create()` with empty `whisper` array. |
| Player action modifies NPC actor flag (mark harvested) | Difficult | Players typically can't modify NPC actors. Requires either: (a) `socketlib.executeAsGM()` to have the GM client set the flag, or (b) granting Observer+ ownership on the NPC. socketlib is the cleaner solution. |

### Summary

| Category | Routine | Easy | Difficult | Very Difficult | Not Possible |
|---|---|---|---|---|---|
| Core harvesting | 5 | 4 | 0 | 0 | 0 |
| Table lookup | 2 | 2 | 0 | 0 | 0 |
| Appraisal | 2 | 3 | 0 | 0 | 0 |
| Retry system | 0 | 1 | 1 | 0 | 0 |
| Time system | 2 | 0 | 1 | 0 | 0 |
| Item awards | 2 | 1 | 0 | 0 | 0 |
| Tool proficiency | 0 | 3 | 0 | 0 | 0 |
| UI — Harvest | 2 | 4 | 0 | 0 | 0 |
| UI — DM Panel | 1 | 2 | 2 | 0 | 0 |
| UI — Forage | 2 | 2 | 0 | 0 | 0 |
| Module settings | 4 | 0 | 1 | 0 | 0 |
| Compendium packs | 3 | 1 | 0 | 0 | 0 |
| Sockets / permissions | 3 | 0 | 1 | 0 | 0 |
| **Total** | **28** | **23** | **6** | **0** | **0** |

**Key v13 changes to be aware of:**
- `renderChatMessageHTML` replaces `renderChatMessage` — `html` param is native DOM, not jQuery
- `getSceneControlButtons` now passes a `Record<string, SceneControl>` object, not an array
- `DialogV2` replaces `Dialog` (legacy `Dialog` still works but is deprecated)
- `ApplicationV2` with `HandlebarsApplicationMixin` and PARTS system replaces `FormApplication`
- `dnd5e.rollSkill()` returns an array of rolls, not a single roll — access via `rolls[0].total`
- Native sockets work but `socketlib` is still recommended for "execute as GM" patterns (marking NPC flags)

---

## Table of Contents

1. [Harvesting — Skill Mappings](#1-harvesting--skill-mappings)
1.1. [Harvesting — Appraisal Mechanics](#11-harvesting--appraisal-mechanics)
2. [Harvesting — Check Mechanics](#2-harvesting--check-mechanics)
3. [Harvesting — DC and Scaling](#3-harvesting--dc-and-scaling)
4. [Harvesting — Appraisal Phase](#4-harvesting--appraisal-phase)
5. [Harvesting — Time and Restrictions](#5-harvesting--time-and-restrictions)
6. [Harvesting — Tool Proficiencies](#6-harvesting--tool-proficiencies)
7. [Foraging — Core Mechanics](#7-foraging--core-mechanics)
8. [Foraging — Environment Modifiers](#8-foraging--environment-modifiers)
9. [Foraging — Threat Interaction](#9-foraging--threat-interaction)
10. [Content — Generic Harvest Tables](#10-content--generic-harvest-tables)
11. [Content — Specific Creature Overrides](#11-content--specific-creature-overrides)
12. [Content — Foraging Tables](#12-content--foraging-tables)
13. [Content — Item Catalog](#13-content--item-catalog)

---

## 1. Harvesting — Skill Mappings

**RESOLVED**: Option A — Distributed (6 Skills, Type-Based). GM-configurable per creature type in module settings.

### Option A: Distributed (6 Skills, Type-Based) ✓ SELECTED

Each creature type maps to a primary skill, spread across 6 skills so no single skill dominates. Updated for 2024 MM creature type reclassifications (Fey and Fiend are now much larger categories).

| Creature Type | Primary Skill | Rationale |
|---|---|---|
| Aberration | Arcana | Alien biology, psionic anatomy |
| Beast | Survival | Field dressing, practical butchery |
| Celestial | Religion | Sacred anatomy, divine essence |
| Construct | Investigation | Mechanical disassembly, analyzing joints and components |
| Dragon | Nature | Dragonology is natural-philosophical tradition |
| Elemental | Arcana | Elemental forces, planar energy |
| Fey | Nature | Fey ecology (goblins, bugbears, centaurs, etc.) |
| Fiend | Religion | Infernal/abyssal knowledge — clerics study this, not wizards |
| Giant | Medicine | Anatomically humanoid, just scaled up |
| Humanoid | Medicine | Standard anatomy |
| Monstrosity | Survival | Dangerous beasts — hunters and rangers know these |
| Ooze | Investigation | Analytical extraction, careful separation |
| Plant | Nature | Botany, herbalism |
| Undead | Arcana | Necromantic energy, preserving magical residue |

**Skill distribution:**
- Arcana (3): Aberration, Elemental, Undead
- Nature (3): Dragon, Fey, Plant
- Religion (2): Celestial, Fiend
- Survival (2): Beast, Monstrosity
- Medicine (2): Giant, Humanoid
- Investigation (2): Construct, Ooze

**Optional secondary skills** (player chooses with GM approval, "Option D"-style):

- Beast: Survival **or** Animal Handling
- Dragon: Nature **or** Arcana
- Giant: Medicine **or** Athletics
- Construct: Investigation **or** Sleight of Hand
- Undead: Arcana **or** Religion

### Resolved Decisions

- **Appraisal vs. harvesting skill**: Same skill for both. Appraisal uses a lower DC (default -5 from harvest DC, configurable in module settings). See Section 1.1 for appraisal mechanics.
- **Ability score**: No difference between appraisal and harvesting — both use the skill's standard ability score.
- **Proficiency**: Standard dnd5e rules apply. Rolls include all applicable bonuses (proficiency, expertise, magic items, etc.) via `actor.rollSkill()`.
- **No applicable skill fallback**: Flat ability check (no proficiency) using the ability score associated with the creature type's default skill.
- **Module config**: GMs can override the skill mapping for each creature type in module settings. The table above provides defaults.

---

## 1.1. Harvesting — Appraisal Mechanics

Appraisal is an optional pre-harvest step where a character examines a creature to identify harvestable materials before attempting extraction.

### Core Rules

- **Skill**: Same as the creature type's harvest skill (see Section 1)
- **DC**: Harvest DC minus a configurable offset (default: -5). Module setting: `appraisalDCOffset` (Number, default -5)
- **On success**: Reveals items up to one tier above the appraisal result (so players can see what they're just barely missing) and grants advantage on the subsequent harvest check
- **On failure**: No information revealed; harvesting can still be attempted blind (no advantage)

### Appraisal Critical Effects

These effects are stored on the **creature**, not the player — they affect whoever harvests next.

- **Natural 20 (critical success)**: +2 circumstance bonus to the harvest roll. The appraiser identified optimal extraction points.
- **Natural 1 (critical failure)**: Harvest roll is made with **disadvantage**. The fumbled examination damaged or contaminated the corpse.

These stack with (and persist alongside) the normal appraisal advantage. A nat 20 appraisal grants both advantage AND +2. A nat 1 appraisal grants disadvantage (overriding any advantage from a previous successful appraisal).

### Appraisal Visibility — "Tier +1" Rule

Appraisal reveals all items at or below the appraisal roll's equivalent harvest DC, **plus one tier above**. This lets players see what they'd miss, creating a "should I retry?" decision.

### Time Cost

- **Appraisal**: 5 minutes + 1 minute per CR (minimum 6 minutes). Higher CR creatures are harder to assess.
- **Harvesting**: 15 minutes per tier harvested (replaces the old `ceil(DC/5)` formula)

### Retry Rules

- Appraisal can be reattempted on the same corpse with a **cumulative -5 penalty** per retry
- Each retry costs the full appraisal time again
- Failure still costs the time (time spent examining, no useful info gained)

### Harvest Table Structure — Failure Tiers

Each harvest table can define **two tiers of failure** in addition to success tiers:

| Roll Zone | Effect |
|---|---|
| **Natural 1** | Critical failure — severe creature-specific consequence |
| **Roll < 5** (after modifiers) | Fumble — lesser creature-specific consequence |
| **DC threshold tiers** | Normal harvesting rewards (cumulative) |
| **Natural 20** | Bonus item — special reward only obtainable on crit |

### Example: Troll Harvest Table

**Full table (GM view):**

| Tier | Entry | Details |
|---|---|---|
| Nat 1 | Troll Acid (critical) | Virulent regenerative tissue causes burns for 1d10+CR dmg |
| Roll < 5 | Troll Acid (minor) | Regenerative tissue causes burns for 1d6+CR dmg |
| DC 14 | Troll Claws | Sell: 2 gp, component value: 5 gp |
| DC 19 | Troll Eye | Sell: 5 gp, component value: 10 gp |
| DC 24 | Troll Gland | Sell: 8 gp, component value: 10 gp; cuts cost and time of crafting Ring of Regeneration by half |
| Nat 20 | Troll Lymphatic Fluid | Sell: 20 gp, component value: 30 gp; allows Ring of Regeneration to be crafted as Rare instead of Very Rare |

**Player appraises with a roll of 16 (harvest equivalent: 21).** Appraisal reveals up to one tier above (DC 24):

> **Appraisal Succeeded — DC 16**
>
> | | Entry | Details |
> |---|---|---|
> | Nat 1 | Troll Acid (critical) | Virulent regenerative tissue causes burns for 1d10+CR dmg |
> | Roll < 5 | Troll Acid (minor) | Regenerative tissue causes burns for 1d6+CR dmg |
> | DC 14 | Troll Claws | Sell: 2 gp, component value: 5 gp |
> | DC 19 | Troll Eye | Sell: 5 gp, component value: 10 gp |
> | DC 24 | Troll Gland | Sell: 8 gp, component value: 10 gp; cuts cost and time of crafting Ring of Regeneration by half |
>
> *5 minutes have passed. Each tier harvested will take 15 minutes.*

Note: The Nat 20 item (Troll Lymphatic Fluid) is hidden because it's more than one tier above the roll.

---

## 2. Harvesting — Check Mechanics

### Cumulative Threshold (Single Roll, Multiple Rewards)

Player rolls `1d20 + skill modifier` once. All items with DC <= the roll total are obtained. Higher roll = more items. Typically 3 tiers of items per harvest table.

Example: Roll 15 against a table with items at DC 8, DC 11, DC 15, DC 19.
- Result: Gets items at DC 8, 11, and 15. Misses DC 19.

### Critical Roll Effects

- **Natural 1 — Auto-fail**: Nothing is harvested, regardless of modifiers. Additionally, specific creatures may have crit-fail consequences stored in their harvest table (e.g., contracting mummy rot from a mummy, taking acid damage from an ooze). Module setting: `critFailEnabled` (Boolean, default true).
- **Natural 20 — Bonus item**: Grants a bonus item defined on the harvest table. Each table can specify a `critSuccessItem` in its flags — an extra reward only obtainable on a nat 20. If no bonus item is defined, nat 20 simply gets all items on the table.

### Resolved Decisions

- **Model**: Cumulative threshold (one roll, multiple possible rewards)
- **Stopping early**: N/A — one roll determines all results, player uses the take/leave popup to select which items to keep

---

## 3. Harvesting — DC and Scaling

### Base DC Formula

Base DC for each harvest table is derived from CR:

**Base DC = CR + 10** (configurable in module settings: `baseDCOffset`, default 10)

Fractional CRs (1/8, 1/4, 1/2) round up to 1, so the minimum base DC is **11**.

Individual items on a table are then offset from the base by rarity tier:

| Rarity Tier | DC Offset | Resulting DC (CR 5 example) |
|---|---|---|
| Common | +0 | 17 |
| Uncommon | +5 | 22 |
| Rare | +10 | 27 |
| Very Rare | +15 | 32 |

These are defaults — each table entry stores its own DC, so specific creature tables can override with hand-tuned values (see the Troll example in Section 1.1).

### DC Tier Examples by CR

| CR | Base DC | Common | Uncommon | Rare | Very Rare |
|---|---|---|---|---|---|
| 1/8–1/2 | 13 | 13 | 18 | 23 | 28 |
| 1 | 13 | 13 | 18 | 23 | 28 |
| 2 | 14 | 14 | 19 | 24 | 29 |
| 5 | 17 | 17 | 22 | 27 | 32 |
| 10 | 22 | 22 | 27 | 32 | 37 |
| 15 | 27 | 27 | 32 | 37 | 42 |
| 20 | 32 | 32 | 37 | 42 | 47 |

### Resolved Decisions

- **Formula**: CR + 10 as base, with per-rarity offsets. Specific tables can override individual DCs.
- **Minimum DC**: 11 (fractional CRs round up to 1)
- **Intent**: Harvesting should be difficult — a character without proficiency in the relevant skill will struggle with even common parts from mid-CR creatures.

---

## 4. Harvesting — Appraisal Phase

*Resolved — see Section 1.1 for full appraisal mechanics.*

---

## 5. Harvesting — Time and Restrictions

### Time

- **Appraisal**: 5 minutes + 1 minute per CR (minimum 6 minutes)
- **Harvesting**: 15 minutes per tier harvested

Example: A player harvests a troll (CR 5) and their roll meets DC 14 and DC 19 (2 tiers) = 30 minutes. If they appraised first, appraisal = 5 + 5 = 10 minutes, total time = 10 + 30 = 40 minutes.

### Size Modifier

Creatures above Medium size add time to the harvesting process:

| Size | Time Added |
|---|---|
| Small or smaller | +0 min |
| Medium | +5 min |
| Large | +15 min |
| Huge | +30 min |
| Gargantuan | +60 min |

### Harvest Retry Rules

If a player fails a harvest check, what happens depends on how badly they failed:

- **Fail by 5 or more**: Harvest is **ruined** — the corpse is no longer harvestable (flag set). The player botched the extraction beyond recovery.
- **Fail by less than 5**: Player may **retry**, but the full harvesting time applies again. Only tiers at or below their failed roll's highest missed DC remain available — higher tiers are ruined by the attempt.

Example: Troll harvest table has DC 14, DC 19, DC 24. Player rolls 18 (misses DC 19 by 1). They can retry for the DC 19 tier, but DC 24 is no longer available — the delicate extraction was compromised.

*DM guidance note: A failed harvest doesn't always mean the player butchered the corpse. It can also mean the creature simply didn't have good enough quality parts to make harvesting worthwhile — the venom sac was ruptured in combat, the hide was too damaged, etc.*

### Restrictions

- **Creature-centric state** — harvest results are stored on the creature, not the player. The first harvester's roll determines which items exist. Subsequent players can pick up remaining items without rolling.
- **One harvester at a time** — creature is locked while someone is actively harvesting. Others are notified to wait.
- **Multiple harvesters can loot sequentially** — Player A takes some items, Player B takes what's left. Creature is only "fully harvested" when all items are claimed.
- **Appraisal effects persist on the creature** — a critical appraisal success (+2 bonus) or failure (disadvantage) applies to whoever harvests, not just the appraiser.
- **Only dead creatures** (HP <= 0)
- **Requires appropriate tools** in inventory (see Section 6)
- **Decay timer**: Corpses become unharvestable after **8 hours** (no enforcement mechanic — DM guide note)
- Interruptions are up to DM discretion (no mechanics)

---

## 6. Harvesting — Tool Proficiencies

### Tool Requirement

Harvesting requires appropriate tools in the character's inventory (or DM discretion to waive). Tools affect **harvesting rolls only**, not appraisal.

### Two Tiers of Tools

**Standard tools** — generic 5e tools that serve as the baseline requirement. Having a relevant tool in inventory allows the harvest attempt. These are the existing dnd5e tool items:

| Tool | Applicable Creature Types / Item Categories |
|---|---|
| Herbalism Kit | Plant, Beast (food items only) |
| Leatherworker's Tools | Beast, Dragon, Monstrosity (hide/leather items) |
| Alchemist's Supplies | Any (component/potion items) |
| Cook's Utensils | Any (food items) |
| Poisoner's Kit | Any (venom/poison items) |
| Smith's Tools | Construct (metal components) |

**Purpose-built harvesting tools** — custom items defined in the module's `harvest-items` compendium that grant a bonus to the harvesting check. These can be general-purpose or creature-type-specific.

Examples:
- *Harvester's Kit* — general +1 to all harvesting checks
- *Fiend Extraction Receptacle* (church-provided) — +3 to harvesting Fiends
- *Dragon Scale Pry Bar* — +2 to harvesting Dragons (material items)

### Resolved Decisions

- **Tools required**: Yes — must have a relevant tool in inventory (not just proficiency)
- **Bonus tools**: Purpose-built tools provide a flat bonus to the harvest roll. These are module-specific items added to the `harvest-items` compendium.
- **Scope**: Tools affect harvesting only, not appraisal
- **DM override**: DM can always waive the tool requirement at the table

---

## 7. Foraging — Core Mechanics

Foraging shares the same UI pattern as harvesting (skill check → tiered results → take/leave popup) but is triggered differently — players click a standalone "Forage" macro rather than targeting a creature.

### Trigger and Flow

1. **DM configures** the current environment via a DM Foraging Panel (see Section 8)
2. **Player clicks** the "Forage" macro
3. **Player popup**: "You are about to forage for supplies. How long do you want to forage? [X] Hours"
4. **Single roll** is made with DC adjusted for hours spent (see below)
5. **Highest qualifying tier** determines what the player finds (not cumulative — unlike harvesting)
6. **Results** shown via take/leave popup; GM gets a notification

### Skill

Each environment defines a **primary skill** and a **secondary skill** on the DM panel. The secondary skill rolls at **-5**. DM can change these per session.

Default for most environments: Primary = Survival, Secondary = Nature.

### Foraging Tiers (Highest Tier Only)

Foraging uses 3 DC tiers + Nat 20. Like harvesting, foraging is **cumulative** — the player gets one random result from each tier they qualify for. No critical fail on foraging.

| Tier | Description |
|---|---|
| Tier 1 (base DC) | Basic — minimal finds (water source, berries, small game) |
| Tier 2 (base DC + 4) | Successful — decent finds (larger game, shared water source) |
| Tier 3 (base DC + 8) | Bountiful — major finds (deer, abandoned supplies) |
| Nat 20 | Rare find — special results (campsite, dead adventurer's gear, unique items) |

Each tier has its own sub-table with ~6 entries, drawn randomly on success.

### Time and DC Adjustment

- **Base time**: 1 hour minimum
- **Additional hours**: Player can declare more hours. Each hour after the first **reduces the DC by 1** (longer search = easier to find something)
- **Frequency**: One foraging session per long rest

Example: Light Forest, base DC 12. Player forages for 3 hours → DC drops to 10 (12 - 2).

### DM Modifier

The DM panel includes a manual modifier field (sparse/lush, threat level, etc.). This is added to all DCs for the session.

*DM guidance: A good default modifier is the average CR of monsters in the area. Higher-threat areas are harder to forage in safely.*

### Food and Water

Foraging finds food and water randomly from the same table — players don't choose between them. Table entries include both types.

### Example: Light Forest Foraging Table

**Tier 1 — Basic (DC 12):**

| d6 | Result |
|---|---|
| 1 | Clean water pool — refill one container |
| 2 | Small stream — refill all containers |
| 3 | Handful of berries — 0.5 ration |
| 4 | Edible roots — 0.5 ration |
| 5 | Small rabbit — 1 ration |
| 6 | Bird eggs — 0.5 ration |

**Tier 2 — Successful (DC 16):**

| d6 | Result |
|---|---|
| 1 | Large rabbit — 3 rations |
| 2 | Stream near party — everyone can refill containers |
| 3 | Berry bush — 2 rations |
| 4 | Wild onions and tubers — 2 rations |
| 5 | Pheasant — 2 rations |
| 6 | Honeycomb — 1 ration + trade value 5 sp |

**Tier 3 — Bountiful (DC 20):**

| d6 | Result |
|---|---|
| 1 | Deer — 12 rations |
| 2 | Abandoned camp — 2 rations + minor equipment |
| 3 | Fruit grove — 8 rations |
| 4 | Wild boar — 10 rations |
| 5 | Fish-filled creek — 6 rations + party water |
| 6 | Mushroom patch — 4 rations + 2 alchemical components (5 gp each) |

**Nat 20 — Rare Find:**

| d6 | Result |
|---|---|
| 1 | Well-used campsite nearby — replenish water, reduced random encounter chance |
| 2 | Dead adventurer — 25 gp + random mundane equipment |
| 3 | Medicinal herb grove — 4 medicinal herbs (heals 1d4 HP each) |
| 4 | Hidden cache — 2d10 gp + 1 potion of healing |
| 5 | Rare flower — alchemical ingredient worth 25 gp |
| 6 | Trapper's stash — 10 rations + 50 ft rope + hunting trap |

---

## 8. Foraging — DM Panel and Environment Configuration

### DM Foraging Panel

The DM opens a panel (scene control button or settings window) to configure the foraging context for the session. The panel contains:

| Field | Type | Purpose |
|---|---|---|
| **Environment** | Dropdown (10-15 options) | Selects the environment, which determines the foraging tables and base DCs |
| **DM Modifier** | Number (+/-) | Manual adjustment for sparse/lush areas, threat level, etc. Added to all DCs |
| **Weather** | Dropdown | Adds a weather-based DC modifier |
| **Season** | Dropdown | Adds a season-based DC modifier |
| **Primary Skill** | Dropdown (auto-filled) | Default skill for this environment (editable) |
| **Secondary Skill** | Dropdown (auto-filled) | Alternate skill at -5 penalty (editable) |

### Environment Base DCs

Each environment has its own baked-in base DCs for the three tiers. These already account for how plentiful or scarce resources are — no separate modifier table is applied at runtime.

| Environment | Tier 1 (Basic) | Tier 2 (Successful) | Tier 3 (Bountiful) | Default Skill |
|---|---|---|---|---|
| Light Forest | 14 | 18 | 22 | Survival |
| Dense Forest / Jungle | 12 | 16 | 20 | Survival |
| Plains / Grassland | 14 | 18 | 22 | Survival |
| Swamp / Marsh | 14 | 18 | 22 | Nature |
| Coastal | 13 | 17 | 21 | Survival |
| Desert / Wasteland | 19 | 23 | 27 | Survival |
| Arctic / Tundra | 17 | 21 | 25 | Survival |
| Underground / Cave | 17 | 21 | 25 | Nature |
| Mountain | 16 | 20 | 24 | Survival |
| Urban / Ruins | 18 | 22 | 26 | Investigation |

### Weather Modifiers

| Weather | DC Modifier |
|---|---|
| Clear / Overcast | +0 |
| Rain | -1 |
| Heavy Rain / Storm | +2 |
| Snow | +2 |
| Extreme Heat | +3 |
| Fog | +1 |

### Season Modifiers

| Season | DC Modifier |
|---|---|
| Spring | -1 |
| Summer | +0 |
| Autumn | -1 |
| Winter | +3 |

### Resolved Decisions

- **Environment DCs**: Baked into each environment definition, not calculated from a shared base + modifier
- **Weather and season**: Separate dropdowns on the DM panel, each adds a DC modifier
- **DM manual modifier**: Flat number added to all DCs (threat level, plot reasons, etc.)
- **Skills per environment**: Each environment has a default primary/secondary skill, DM can override

---

## 9. Foraging — Threat Interaction

**Current Decision**: Informational only. The module will NOT attempt to modify passive Perception or interfere with other travel/perception systems.

When a character forages, the chat card will include a reminder:
> "Characters who forage cannot contribute to passive Perception checks for noticing threats."

Enforcement is left to the GM.

---

## 10. Content — Generic Harvest Tables

These are the fallback tables used when no specific creature table exists. Organized by creature type and CR tier.

**RESOLVED**: All 14 creature types will have generic tables across 4 CR tiers (~56 tables). Beast, Undead, and Dragon examples below serve as templates for the remaining types (Aberration, Celestial, Construct, Elemental, Fey, Fiend, Giant, Humanoid, Monstrosity, Ooze, Plant).

### Beast CR 0-1

| Item | DC | Quantity | Category | Value |
|---|---|---|---|---|
| Animal Meat | 8 | 1d4 lb | food | 1 sp/lb |
| Animal Hide | 8 | 1 | material | 1 gp |
| Bone Fragment | 10 | 1d4 | material | 5 cp |
| Teeth/Claws | 10 | 1d6 | trophy | 1 sp |

### Beast CR 2-4

| Item | DC | Quantity | Category | Value |
|---|---|---|---|---|
| Quality Meat | 10 | 2d4 lb | food | 2 sp/lb |
| Thick Hide | 10 | 1 | material | 5 gp |
| Sturdy Bones | 12 | 1d4 | material | 5 sp |
| Large Teeth/Claws | 12 | 1d4 | trophy | 1 gp |
| Venom Sac | 14 | 1 | component | 10 gp |

### Beast CR 5-10

| Item | DC | Quantity | Category | Value |
|---|---|---|---|---|
| Prime Meat | 13 | 3d4 lb | food | 5 sp/lb |
| Superior Hide | 13 | 1 | material | 25 gp |
| Dense Bones | 15 | 1d4 | material | 2 gp |
| Razor Teeth/Claws | 15 | 1d4 | trophy | 5 gp |
| Potent Venom Sac | 17 | 1 | component | 50 gp |
| Intact Organ | 19 | 1 | component | 25 gp |

### Undead CR 0-1

| Item | DC | Quantity | Category | Value |
|---|---|---|---|---|
| Undead Ichor | 10 | 1 vial | component | 5 gp |
| Rotting Flesh | 8 | 1 | material | 1 gp |

### Undead CR 2-4

| Item | DC | Quantity | Category | Value |
|---|---|---|---|---|
| Undead Ichor | 10 | 1d4 vials | component | 5 gp |
| Ghoul Claws | 12 | 1d4 | component | 5 gp |
| Necrotic Residue | 14 | 1 vial | component | 15 gp |

### Undead CR 5-10

| Item | DC | Quantity | Category | Value |
|---|---|---|---|---|
| Concentrated Ichor | 13 | 1d4 vials | component | 10 gp |
| Shadow Essence | 16 | 1 vial | component | 50 gp |
| Ectoplasmic Residue | 18 | 1 vial | component | 75 gp |

### Dragon CR 5-10

| Item | DC | Quantity | Category | Value |
|---|---|---|---|---|
| Dragon Scales | 14 | 2d6 | material | 10 gp each |
| Dragon Teeth | 14 | 1d6 | trophy | 25 gp each |
| Dragon Blood | 16 | 1d4 vials | component | 50 gp |
| Dragon Hide | 18 | 1 | material | 200 gp |
| Breath Gland | 20 | 1 | component | 500 gp |

### Dragon CR 11+

| Item | DC | Quantity | Category | Value |
|---|---|---|---|---|
| Dragon Scales | 16 | 3d6 | material | 25 gp each |
| Dragon Teeth | 16 | 2d6 | trophy | 50 gp each |
| Dragon Blood | 18 | 2d4 vials | component | 100 gp |
| Dragon Hide | 20 | 1 | material | 500 gp |
| Breath Gland | 22 | 1 | component | 1000 gp |
| Dragon Heart | 25 | 1 | component | 2500 gp |

*Remaining creature types (Aberration, Celestial, Construct, Elemental, Fey, Fiend, Giant, Humanoid, Monstrosity, Ooze, Plant) need tables designed.*

---

## 11. Content — Specific Creature Overrides

These override the generic tables when a specific creature is encountered. Only iconic or unique creatures need specific tables — the generics handle everything else.

**Priority creatures to create specific tables for:**

### High Priority (Common Combat Encounters)
- Wolf, Boar, Brown Bear, Giant Spider
- Goblin, Orc, Kobold (if humanoid harvesting is allowed)
- Skeleton, Zombie, Ghoul, Wraith, Vampire Spawn
- Owlbear, Basilisk, Manticore
- Young/Adult/Ancient dragons (by color)

### Medium Priority (Iconic Monsters)
- Beholder (eye stalks are iconic loot)
- Mind Flayer (brain, tentacles)
- Gelatinous Cube (residue, absorbed items)
- Troll (regenerating flesh)
- Hydra (multiple heads)

### Low Priority (Campaign-Specific)
- Dinosaurs (for ToA or similar)
- Winter Wolf, Yeti (for Icewind Dale)
- Campaign-specific homebrew creatures

**RESOLVED**: V1 includes High Priority creatures (Wolf, Boar, Brown Bear, Giant Spider, Goblin, Orc, Kobold, Skeleton, Zombie, Ghoul, Wraith, Vampire Spawn, Owlbear, Basilisk, Manticore, Young/Adult/Ancient dragons by color) PLUS all Tomb of Annihilation creatures (see `D:\Downloads\ToA All Monsters - All.csv` for full list — ~150 unique creatures including dinosaurs, yuan-ti, grung, undead variants, and ToA-specific monsters).

---

## 12. Content — Foraging Tables

### General Foraging Table (All Environments)

| d20 Roll | Result | Notes |
|---|---|---|
| 1-5 | Nothing useful | — |
| 6-10 | Common herbs (1d4 rations) | Standard food |
| 11-14 | Medicinal herbs | Heals 1d4 HP if prepared (1 hour) |
| 15-17 | Alchemical herbs | Component for potions (worth 5 gp) |
| 18-19 | Edible mushrooms/roots (2d4 rations) | High-nutrition food |
| 20 | Rare plant | Valuable alchemical ingredient (worth 25 gp) |

### Jungle / Tropical Foraging Table

| d20 Roll | Result | Effect |
|---|---|---|
| 1-3 | Nothing edible | — |
| 4-6 | Tropical fruit (1d6 rations) | Standard food |
| 7-9 | Wildroot | Advantage on next poison saving throw |
| 10-12 | Menga leaves | Extra hit die on next rest |
| 13-15 | Sinda berries | Advantage vs. disease/poison for 24h (need 10+) |
| 16-17 | Wukka nuts | Glows when shaken (bright 10ft / dim +10ft) |
| 18-19 | Ryath root | Can be brewed into antitoxin |
| 20 | Dancing monkey fruit | Consumer dances 1 hour (CHA DC 14 to resist) |

### Arctic Foraging Table

| d20 Roll | Result | Effect |
|---|---|---|
| 1-5 | Nothing found | — |
| 6-9 | Frozen berries (1d4 rations) | Standard food |
| 10-13 | Ice lichen | Brewed tea grants cold resistance 1 hour |
| 14-16 | Frost moss | Alchemical component (worth 5 gp) |
| 17-19 | Winter root (2d4 rations) | Nutritious tuber |
| 20 | Pale flower | Rare ingredient (worth 25 gp) |

### Desert Foraging Table

| d20 Roll | Result | Effect |
|---|---|---|
| 1-8 | Nothing found | — |
| 9-12 | Cactus water (1d4 gallons) | Drinkable water |
| 13-15 | Desert sage | Alchemical component (worth 5 gp) |
| 16-18 | Prickly pear fruit (1d4 rations) | Standard food |
| 19-20 | Sandbloom | Rare ingredient (worth 50 gp) |

**RESOLVED**: All 10 environments in v1 — General, Jungle, Arctic, Desert, Swamp, Coastal, Mountain, Underground, Urban, Plains.

### Foraging Roll Mechanic — RESOLVED

**Skill check + random (hybrid)**:
1. Player rolls a Survival check against the environment's foraging DC
2. On success, roll d20 on the environment's foraging table
3. Margin-of-success bonus: for every 5 points above the DC, add +1 to the d20 table roll (e.g., DC 12, rolled 22 = +2 bonus to table roll)
4. This rewards skilled foragers with better finds while maintaining randomness

### Remaining Content Questions — RESOLVED

- **Foraging table results**: All foraging finds are proper dnd5e loot items from the `harvest-items` compendium, added to player inventory via the same take/leave popup as harvesting.

---

## 13. Content — Item Catalog

All harvestable items exist as dnd5e loot items in the `harvest-items` compendium. Items are reusable across multiple tables.

### Item Categories

| Category | Description | Examples |
|---|---|---|
| `material` | Raw materials with trade value, can be sold or crafted | Hides, scales, bones, wood |
| `food` | Edible, provides rations or has consumption effects | Meat, berries, mushrooms, herbs |
| `component` | Alchemical, magical, or crafting components | Venom, ichor, organs, blood |
| `trophy` | Decorative or proof-of-kill items with trade value | Teeth, claws, horns, heads |

### Questions to Resolve

- What currency values are balanced for the campaign?
- Should items have weight? (Carrying capacity matters in survival campaigns)
- Should some items be consumable (use from inventory for an effect)?
- Should items have rarity tags (common/uncommon/rare)?
- ~~Should item descriptions hint at crafting uses, or keep that for a future version?~~ **RESOLVED:** Yes — component items include a crafting callout section in their HTML description showing generic crafting use and a calculated crafted value. Two multiplier tiers: natural components (2×/3×/5× by rarity) and crafting family components (4×/6×/10× by rarity — higher multipliers offset low base prices for bulk drops). Six crafting families: Scroll, Potion, Weapon, Shield, Armor, Wondrous Item. See "Item Description Format" in harvester_module.md for full details.

---

## Open Questions Summary

### Resolved

| # | Topic | Decision |
|---|---|---|
| 1 | Skill mapping | Distributed 6-skill system (Section 1) |
| 2 | Skill mapping | Same skill for appraisal and harvesting, appraisal DC offset -5 |
| 3 | Skill mapping | Same ability score for both phases |
| 4 | Check mechanics | Cumulative threshold, 3 tiers per table |
| 5 | Check mechanics | Nat 1 = critical fail (severe); Roll < 5 = fumble (lesser); Nat 20 = bonus item |
| 6 | DC scaling | CR + 10 as base DC, per-rarity offsets (+0/+2/+5/+8), specific tables can override |
| 7 | Appraisal | Reveals items up to one tier above roll; shows names, DCs, details |
| 8 | Appraisal | (5 + CR) min per attempt; retryable at cumulative -5; failure costs time only |
| 9 | Time | 15 min per tier harvested; (5 + CR) min per appraisal; +10 min per size above Medium |
| 10 | Retries | Fail by 5+ = harvest ruined; fail by <5 = can retry (full time), higher tiers lost |
| 11 | Tools | Required in inventory; purpose-built tools grant flat bonus; affects harvest only |

| 12 | Foraging skill | Per-environment primary + secondary (at -5); DM configurable |
| 13 | Foraging model | Highest tier only (not cumulative); 3 tiers + Nat 20; no crit fail |
| 14 | Foraging frequency | One session per long rest; 1 hr base; extra hours reduce DC by 1 each |
| 15 | Environment DCs | Baked into each environment; DM panel adds weather/season/manual modifiers |
| 16 | Foraging tables | Each tier has its own d6 sub-table (~6 entries per tier per environment) |

| 17 | Content scope | v1: All 14 creature types x 4 CR tiers (~56 generic tables). Specific override tables for High Priority creatures + all ToA creatures. |
| 18 | Item values | Low value / survival — harvesting is supplemental income, not primary gold source. Cut current draft values ~50%. |
| 19 | Humanoids | Disabled by default. Module setting `allowHumanoidHarvesting` (Boolean, default false) to enable for tables that want it. |
| 20 | Skill mapping system | Option A: Distributed 6-skill type-based mapping. GM-configurable per creature type. |
| 21 | Foraging environments | All 10 environments in v1: General, Jungle, Arctic, Desert, Swamp, Coastal, Mountain, Underground, Urban, Plains |
| 22 | Foraging roll mechanic | Hybrid: Survival check to pass DC, then d20 table roll with +1 per 5 margin-of-success |
| 23 | V1 creature overrides | High Priority list (~25 creatures) + all Tomb of Annihilation creatures (~150 unique) |

### All Questions Resolved
