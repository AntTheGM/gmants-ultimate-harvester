# Ultimate Harvester Module — Technical Architecture

This document covers the **module structure, Foundry APIs, data models, and implementation details**. Game rules (skill mappings, DCs, foraging mechanics, etc.) are defined separately in `harvester_rules.md` and referenced here as configurable inputs.

---

## Overview

A Foundry VTT module for D&D 5th Edition that provides monster harvesting and foraging systems. The module is **rules-agnostic in its architecture** — the code provides the workflow engine, while the actual game rules (which skills, what DCs, what items) are driven by configurable data in compendium packs and module settings.

---

## Existing Modules (Prior Art)

### Harvester (by OhhLoz)
- ~800 monsters with harvestable components
- Regex-based creature name matching to roll tables
- **Drawbacks**: Not updated in ~2 years, requires `requestor` module, no foraging system, potentially stale for Foundry v13
- GitHub: https://github.com/OhhLoz/Harvester

### Better Rolltables
- Extends roll table functionality with source references and regex patterns
- Not a harvesting module, but used by harvesting modules for monster-to-loot association

---

## Module Identity

- **Module ID**: `ultimate-harvester`
- **Display Name**: Ultimate Harvester
- **Target**: Foundry v12+, dnd5e system

---

## Directory Structure

```
Data/modules/ultimate-harvester/
├── module.json                  # Module manifest
├── scripts/
│   ├── module.js                # Entry point — hook registration, settings, init
│   ├── harvesting.js            # Harvest workflow engine
│   ├── foraging.js              # Foraging workflow engine
│   ├── table-lookup.js          # Creature → table resolution (layered fallback)
│   ├── config.js                # Default mappings (loaded from settings/rules)
│   └── ui.js                    # Dialogs, chat cards, result popups
├── styles/
│   └── ultimate-harvester.css
├── packs/
│   ├── harvest-items/           # LevelDB — harvestable item definitions
│   ├── harvest-tables/          # LevelDB — creature-specific override tables
│   ├── generic-tables/          # LevelDB — type+CR tier fallback tables
│   └── foraging-tables/         # LevelDB — environment-based foraging tables
├── lang/
│   └── en.json
└── templates/
    ├── harvest-dialog.hbs       # "Appraise / Harvest / Cancel" prompt
    ├── harvest-result.hbs       # Chat card showing results
    ├── harvest-pickup.hbs       # Take/leave popup for harvested items
    └── forage-dialog.hbs        # Foraging prompt
```

---

## module.json

```json
{
  "id": "ultimate-harvester",
  "title": "Ultimate Harvester",
  "description": "A monster harvesting and foraging system for D&D 5e. Harvest parts, materials, and food from defeated creatures based on skill checks.",
  "version": "1.0.0",
  "authors": [
    {
      "name": "Your Name"
    }
  ],
  "compatibility": {
    "minimum": "12",
    "verified": "13"
  },
  "esmodules": [
    "scripts/module.js"
  ],
  "styles": [
    "styles/ultimate-harvester.css"
  ],
  "languages": [
    {
      "lang": "en",
      "name": "English",
      "path": "lang/en.json"
    }
  ],
  "packs": [
    {
      "name": "harvest-items",
      "label": "Harvestable Items",
      "path": "packs/harvest-items",
      "type": "Item",
      "system": "dnd5e",
      "ownership": { "PLAYER": "OBSERVER", "ASSISTANT": "OWNER" }
    },
    {
      "name": "harvest-tables",
      "label": "Creature Harvest Tables (Specific)",
      "path": "packs/harvest-tables",
      "type": "RollTable",
      "ownership": { "PLAYER": "OBSERVER", "ASSISTANT": "OWNER" }
    },
    {
      "name": "generic-tables",
      "label": "Harvest Tables (Generic by Type/CR)",
      "path": "packs/generic-tables",
      "type": "RollTable",
      "ownership": { "PLAYER": "OBSERVER", "ASSISTANT": "OWNER" }
    },
    {
      "name": "foraging-tables",
      "label": "Foraging Tables",
      "path": "packs/foraging-tables",
      "type": "RollTable",
      "ownership": { "PLAYER": "OBSERVER", "ASSISTANT": "OWNER" }
    }
  ],
  "packFolders": [
    {
      "name": "Ultimate Harvester",
      "color": "#2e7d32",
      "sorting": "a",
      "packs": ["harvest-items", "harvest-tables", "generic-tables", "foraging-tables"]
    }
  ],
  "relationships": {
    "systems": [
      {
        "id": "dnd5e",
        "type": "system",
        "compatibility": { "minimum": "4.0.0", "verified": "5.0.0" }
      }
    ]
  },
  "socket": false,
  "url": "",
  "manifest": "",
  "download": ""
}
```

**Note**: `socketlib` removed as a hard dependency. The module runs client-side for the harvesting player and posts results to chat, which all players can see natively. Socket communication is only needed if we later add features where one player's action modifies another player's inventory.

---

## Core Architecture

### 1. Creature-to-Table Lookup (table-lookup.js)

The biggest architectural decision. Uses a **layered fallback** system to find the right harvest table for any creature:

```
Priority 1: Actor flag override
    ↓ (not found)
Priority 2: Exact name match in harvest-tables compendium
    ↓ (not found)
Priority 3: Normalized name match (strip prefixes like "Young", "Adult", "Ancient")
    ↓ (not found)
Priority 4: Generic type+CR table from generic-tables compendium
    ↓ (not found)
Priority 5: No table found — inform player, no harvest available
```

**Priority 1 — Actor flag override:**
```javascript
const tableUuid = actor.getFlag("ultimate-harvester", "harvestTable");
if (tableUuid) {
  return await fromUuid(tableUuid);
}
```
This lets GMs assign any table to any creature. Custom NPCs, renamed tokens, homebrew monsters — all handled by setting one flag.

**Priority 2 — Exact name match:**
```javascript
const pack = game.packs.get("ultimate-harvester.harvest-tables");
const index = await pack.getIndex();
const entry = index.find(e => e.name === `${actor.name} Harvest Table`);
```

**Priority 3 — Normalized name match:**
Strip common prefixes/suffixes, normalize word order:
- "Young White Dragon" → search for "White Dragon"
- "White Dragon, Young" → search for "White Dragon"
- "Bob the Wolf" → won't match (use flag override for custom names)

```javascript
const prefixes = ["Young", "Adult", "Ancient", "Elder", "Greater", "Lesser"];
let normalized = actor.name;
for (const prefix of prefixes) {
  normalized = normalized.replace(new RegExp(`^${prefix}\\s+`, "i"), "");
}
normalized = normalized.replace(/,\s*(Young|Adult|Ancient|Elder)$/i, "");
```

**Priority 4 — Generic type+CR table:**
```javascript
const creatureType = actor.system.details.type.value; // "beast", "fiend", etc.
const cr = actor.system.details.cr;                   // 0.25, 1, 5, etc.
const tier = getCRTier(cr);                           // "0-1", "2-4", "5-10", "11+"

const genericPack = game.packs.get("ultimate-harvester.generic-tables");
const genericIndex = await genericPack.getIndex();
const genericEntry = genericIndex.find(
  e => e.name === `${capitalize(creatureType)} CR ${tier} Harvest Table`
);
```

**CR Tier Ranges** (configurable, these are the defaults):

| Tier Label | CR Range |
|---|---|
| 0-1 | 0, 1/8, 1/4, 1/2, 1 |
| 2-4 | 2, 3, 4 |
| 5-10 | 5, 6, 7, 8, 9, 10 |
| 11+ | 11 and above |

This produces ~56 generic tables (14 creature types x 4 tiers), which is manageable. Specific creature override tables are a bonus, not a requirement.

---

### 2. Harvest Data Model — DC Threshold Filtering (Not table.roll())

**Important**: We use RollTable as a *data container* for its native Foundry UI (easy to edit, view, organize). But we do **NOT** use `table.roll()` — that returns a single random result based on dice ranges, which doesn't match the cumulative DC threshold design.

Instead, we load all table results and filter by DC:

```javascript
async function getHarvestedItems(table, rollTotal) {
  const allResults = table.results.contents;

  const harvested = allResults.filter(result => {
    const dc = result.getFlag("ultimate-harvester", "dc");
    return dc !== undefined && dc <= rollTotal;
  });

  return harvested;
}
```

**Table result flags** (stored on each RollTable result entry):
```javascript
{
  "ultimate-harvester": {
    "dc": 13,                  // Threshold — harvested if skill roll >= this
    "itemUuid": "Compendium.ultimate-harvester.harvest-items.xxxxx",
    "quantity": "1d4",         // Dice formula for quantity (evaluated on harvest)
    "category": "material"     // material | food | component | trophy
  }
}
```

The `range` field on the RollTable result is unused by the module logic but can be set to match DC values for visual clarity when viewing the table in Foundry's UI.

---

### 3. Harvesting Workflow Engine (harvesting.js)

The workflow is a state machine with these steps. **The specific rules** (which skill, what DC, advantage conditions) are loaded from `config.js` and module settings — see `harvester_rules.md` for those decisions.

```
[Trigger] → [Validate] → [Lookup Table] → [Prompt Dialog] → [Roll Check] → [Filter Results] → [Show Pickup] → [Award Items] → [Mark Harvested]
```

**Step 1 — Trigger:**
One of:
- Player right-clicks a dead creature token → "Harvest" context menu
- Chat card "Harvest" button (posted when creature drops to 0 HP)
- GM manually triggers via macro

**Step 2 — Validate:**
```javascript
// Is the creature dead?
if (creature.system.attributes.hp.value > 0) return notify("Creature is still alive.");

// Has it already been harvested?
if (creature.getFlag("ultimate-harvester", "harvested")) return notify("Already harvested.");

// Does the harvester have a valid actor?
const harvester = canvas.tokens.controlled[0]?.actor;
if (!harvester) return notify("Select a token first.");
```

**Step 3 — Lookup table** (see section 1 above).

**Step 4 — Prompt dialog:**
Show the harvest dialog to the player. The dialog is rules-driven — it reads from config to determine what options to show (e.g., appraise first vs. harvest directly). The dialog displays the creature name, type, and CR.

**Step 5 — Roll skill check:**
```javascript
// The skill and ability are determined by rules config (see harvester_rules.md)
const skillId = getHarvestSkill(creature);  // Returns "nat", "arc", etc.
const rollOptions = {};

// If rules grant advantage (e.g. from appraisal), pass it
if (hasAdvantage) {
  rollOptions.advantage = true;
}

// Trigger the dnd5e skill roll — this shows the roll in chat natively
const roll = await harvester.rollSkill({ skill: skillId, ...rollOptions });
const rollTotal = roll.total;
```

**Step 6 — Filter results** (see section 2 above).

**Step 7 — Show pickup popup:**
Present a dialog listing everything the player found. Each item has a checkbox (defaulting to checked). Player can uncheck items they want to leave behind.

```javascript
// Build dialog content from harvested results
const itemList = await Promise.all(harvested.map(async (result) => {
  const flags = result.flags["ultimate-harvester"];
  const quantityRoll = await new Roll(flags.quantity || "1").evaluate();
  return {
    name: result.text,
    uuid: flags.itemUuid,
    quantity: quantityRoll.total,
    category: flags.category,
    take: true  // default checked
  };
}));

// Render the pickup template as a Dialog
// Player checks/unchecks items, clicks "Take Selected" or "Leave All"
```

**Step 8 — Award items:**
For each selected item, clone from compendium and add to harvester's inventory:
```javascript
for (const item of selectedItems) {
  const sourceItem = await fromUuid(item.uuid);
  const itemData = sourceItem.toObject();
  itemData.system.quantity = item.quantity;
  await harvester.createEmbeddedDocuments("Item", [itemData]);
}
```

**Step 9 — Mark harvested:**
```javascript
await creature.setFlag("ultimate-harvester", "harvested", true);
```
Prevents double-harvesting the same corpse.

---

### 4. Death Detection Hook (module.js)

Detects HP transition from alive to dead. Handles edge cases from feedback.

```javascript
Hooks.on("updateActor", (actor, changes, options, userId) => {
  // Only run for GM (prevents duplicate processing)
  if (!game.user.isGM) return;

  // Only NPCs
  if (actor.type !== "npc") return;

  // Only if auto-detect is enabled
  if (!game.settings.get("ultimate-harvester", "autoDetectDeath")) return;

  // Check for HP change
  const newHP = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  if (newHP === undefined) return;

  // Must be a transition TO 0 or below (not already dead)
  // Use the actor's PREVIOUS hp before this update
  const wasAlive = (actor.system.attributes.hp.value - (newHP - actor.system.attributes.hp.value)) > 0;
  // Simpler: check if already flagged as harvest-offered
  if (actor.getFlag("ultimate-harvester", "harvestOffered")) return;

  if (newHP <= 0) {
    actor.setFlag("ultimate-harvester", "harvestOffered", true);
    postHarvestOffer(actor);
  }
});
```

**`postHarvestOffer`** creates a chat card visible to all players with a "Harvest" button. Only the player who clicks it (with a selected token) initiates the workflow.

---

### 5. Token Context Menu (module.js)

Adds "Harvest Creature" to the right-click menu on tokens:

```javascript
Hooks.on("getTokenActionButtons", (token, buttons) => {
  // Only show for dead NPCs that haven't been harvested
  if (token.actor?.type !== "npc") return;
  if (token.actor.system.attributes.hp.value > 0) return;
  if (token.actor.getFlag("ultimate-harvester", "harvested")) return;

  buttons.push({
    label: "Harvest",
    icon: "fa-solid fa-drumstick-bite",
    callback: () => initiateHarvest(token.actor)
  });
});
```

---

### 6. Foraging Workflow Engine (foraging.js)

Separate system from creature harvesting. The foraging rules (DCs, environment modifiers, what tables to use) are defined in `harvester_rules.md`.

**Trigger**: GM clicks a scene control button or runs a macro.

**Workflow:**
1. GM selects an environment from a dropdown (or it reads from a scene flag)
2. Each foraging PC rolls independently
3. Results are compared against the foraging table for that environment
4. Foraging uses standard Foundry `table.roll()` since it IS a random draw (unlike harvesting, which is cumulative DC)
5. Results posted to chat; found items offered via the same take/leave popup

```javascript
async function forage(actor, environment) {
  // 1. Get the foraging table for this environment
  const pack = game.packs.get("ultimate-harvester.foraging-tables");
  const index = await pack.getIndex();
  const entry = index.find(e => e.name === `${environment} Foraging Table`);
  if (!entry) return ui.notifications.warn(`No foraging table for: ${environment}`);
  const table = await pack.getDocument(entry._id);

  // 2. Roll the skill check (skill determined by rules config)
  const skillId = getForagingSkill();  // From rules config
  const dc = getForagingDC(environment);  // Base DC + environment modifier
  const roll = await actor.rollSkill({ skill: skillId });

  // 3. If check meets DC, draw from the foraging table
  if (roll.total >= dc) {
    const draw = await table.draw({ displayChat: false });
    // 4. Show results in chat and offer take/leave popup
    presentForagingResults(actor, draw.results, roll.total);
  } else {
    ChatMessage.create({
      content: `<div class="ultimate-harvester-card"><p><strong>${actor.name}</strong> found nothing useful while foraging.</p></div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });
  }
}
```

---

### 7. Module Settings (module.js)

Settings provide the bridge between architecture and rules. The module reads these at runtime to determine behavior.

```javascript
Hooks.once("init", () => {
  // --- Rules-adjacent settings (values defined in harvester_rules.md) ---

  game.settings.register("ultimate-harvester", "skillMapping", {
    name: "MHARVEST.settings.skillMapping.name",
    hint: "MHARVEST.settings.skillMapping.hint",
    scope: "world",
    config: true,
    type: String,
    default: "default",   // The actual mapping options are a rules decision
    choices: {}            // Populated from config.js based on rules
  });

  game.settings.register("ultimate-harvester", "appraisalEnabled", {
    name: "MHARVEST.settings.appraisal.name",
    hint: "MHARVEST.settings.appraisal.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("ultimate-harvester", "foragingBaseDC", {
    name: "MHARVEST.settings.foragingDC.name",
    hint: "MHARVEST.settings.foragingDC.hint",
    scope: "world",
    config: true,
    type: Number,
    default: 10    // Default — actual value is a rules decision
  });

  // --- Architecture settings (not rules-dependent) ---

  game.settings.register("ultimate-harvester", "autoDetectDeath", {
    name: "MHARVEST.settings.autoDetect.name",
    hint: "MHARVEST.settings.autoDetect.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("ultimate-harvester", "showPickupDialog", {
    name: "MHARVEST.settings.pickupDialog.name",
    hint: "MHARVEST.settings.pickupDialog.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true   // If false, items go straight to inventory
  });
});
```

---

## Data Model

### Harvest Item (dnd5e loot item in harvest-items compendium)

```javascript
{
  "name": "Wolf Pelt",
  "type": "loot",
  "img": "icons/commodities/leather/fur-pelt-brown.webp",
  "system": {
    "description": { "value": "<p>A rough wolf pelt.</p>" },
    "weight": { "value": 5, "units": "lb" },
    "price": { "value": 2, "denomination": "gp" },
    "rarity": "common"
  },
  "flags": {
    "ultimate-harvester": {
      "category": "material"
    }
  }
}
```

Item categories: `material` | `food` | `component` | `trophy`

Items are generic and reusable across many tables — "Wolf Pelt" can appear in both the specific Wolf table and the generic "Beast CR 0-1" table.

### Harvest Table (RollTable in harvest-tables or generic-tables compendium)

**Specific creature table:**
```
Name: "Wolf Harvest Table"
```

**Generic type+CR table:**
```
Name: "Beast CR 0-1 Harvest Table"
```

Each table result stores its rules data in flags:
```javascript
{
  "text": "Wolf Pelt",                    // Display name (shown in UI)
  "type": 0,                              // TEXT type (we don't use document linking)
  "flags": {
    "ultimate-harvester": {
      "dc": 8,                            // Rules-defined DC threshold
      "itemUuid": "Compendium.ultimate-harvester.harvest-items.XXXXX",
      "quantity": "1",                     // Dice formula
      "category": "material"
    }
  }
}
```

### Generic Table Naming Convention

```
{CreatureType} CR {Tier} Harvest Table
```

Expected tables (~56 total, 14 types x 4 tiers):
```
Aberration CR 0-1 Harvest Table
Aberration CR 2-4 Harvest Table
Aberration CR 5-10 Harvest Table
Aberration CR 11+ Harvest Table
Beast CR 0-1 Harvest Table
Beast CR 2-4 Harvest Table
...
Undead CR 11+ Harvest Table
```

Not all combinations need content immediately — some creature types don't exist at certain CR ranges. Populate as needed.

### Foraging Table (RollTable in foraging-tables compendium)

```
Name: "{Environment} Foraging Table"
```

Foraging tables use **standard RollTable mechanics** (`table.roll()` / `table.draw()`) since foraging IS a random draw — unlike harvesting which uses DC filtering.

### Actor Flags

| Flag | Purpose |
|---|---|
| `ultimate-harvester.harvestTable` | UUID pointing to a specific harvest table (GM override) |
| `ultimate-harvester.harvested` | Boolean — prevents double-harvesting |
| `ultimate-harvester.harvestOffered` | Boolean — prevents duplicate chat offers on death |

---

## Foundry API Reference

### Accessing Creature Data
```javascript
const actor = token.actor;

actor.system.details.type.value   // "beast", "fiend", "dragon", etc.
actor.system.details.type.subtype // "goblinoid", "shapechanger", etc.
actor.system.details.cr           // 0.25, 1, 5, etc. (number)

actor.system.attributes.hp.value  // Current HP
actor.system.attributes.hp.max    // Max HP
```

### Triggering Skill Checks
```javascript
// Standard skill check
await actor.rollSkill({ skill: "nat" });

// With advantage (e.g. from successful appraisal)
await actor.rollSkill({ skill: "nat", advantage: true });

// Ability check (no skill proficiency)
await actor.rollAbilityTest({ ability: "int" });
```

### dnd5e Skill Abbreviations
```
acr = Acrobatics       ani = Animal Handling   arc = Arcana
ath = Athletics        dec = Deception         his = History
ins = Insight          itm = Intimidation      inv = Investigation
med = Medicine         nat = Nature            prc = Perception
prf = Performance      per = Persuasion        rel = Religion
slt = Sleight of Hand  ste = Stealth           sur = Survival
```

### Working with Compendium Packs
```javascript
const pack = game.packs.get("ultimate-harvester.harvest-tables");
const index = await pack.getIndex();
const entry = index.find(e => e.name === "Wolf Harvest Table");
const table = await pack.getDocument(entry._id);

// Get all results from a table (for DC filtering)
const results = table.results.contents;

// Clone an item from compendium into an actor's inventory
const sourceItem = await fromUuid(itemUuid);
const itemData = sourceItem.toObject();
itemData.system.quantity = quantity;
await actor.createEmbeddedDocuments("Item", [itemData]);
```

### Chat Messages
```javascript
await ChatMessage.create({
  content: htmlString,
  speaker: ChatMessage.getSpeaker({ actor }),
  flags: {
    "ultimate-harvester": { isHarvestCard: true, creatureId: creature.id }
  }
});
```

### Dialogs (Take/Leave Popup)
```javascript
new Dialog({
  title: "Harvest Results",
  content: renderedTemplate,  // Handlebars template with checkboxes
  buttons: {
    take: {
      label: "Take Selected",
      icon: '<i class="fas fa-hand-holding"></i>',
      callback: (html) => {
        // Read checkbox states from html
        const selected = [];
        html.find("input[type=checkbox]:checked").each((i, el) => {
          selected.push(el.dataset.itemUuid);
        });
        awardItems(harvester, selected);
      }
    },
    leave: {
      label: "Leave All",
      icon: '<i class="fas fa-times"></i>',
      callback: () => { /* do nothing */ }
    }
  },
  default: "take"
}).render(true);
```

---

## Dependencies

| Module | Required? | Purpose |
|---|---|---|
| `lib-wrapper` | Optional | Only needed if patching core sheet rendering |

No hard module dependencies. The module uses native Foundry APIs (hooks, chat, dialogs, compendium packs) and the dnd5e system API for skill checks.

---

## Implementation Phases

Updated to reflect all resolved rules decisions from `harvester_rules.md` and Foundry v13 API patterns.

### Phase 1 — Module Scaffold and Settings

**Goal**: Loadable module with all settings registered, no gameplay yet.

**Files to create:**
- `module.json` — manifest (v13 compatible, `socketlib` as optional relationship)
- `scripts/module.js` — entry point: `init` hook, all settings registration
- `scripts/config.js` — default skill mappings (6-skill distributed system), CR tier definitions, DC formula constants
- `styles/ultimate-harvester.css` — empty scaffold
- `lang/en.json` — all i18n keys for settings, UI strings, notifications

**Settings to register:**
- `autoDetectDeath` (Boolean, default true)
- `showPickupDialog` (Boolean, default true)
- `appraisalEnabled` (Boolean, default true)
- `appraisalDCOffset` (Number, default -5)
- `baseDCOffset` (Number, default 10)
- `critFailEnabled` (Boolean, default true)
- `allowHumanoidHarvesting` (Boolean, default false)
- `skillMappingOverrides` (Object, hidden, default {}) — per-creature-type skill overrides
- Skill mapping submenu via `registerMenu()` pointing to an ApplicationV2 form

**Milestone**: Module appears in Foundry settings, all settings visible and functional.

---

### Phase 2 — Table Lookup and Core Harvest Workflow

**Goal**: Player can right-click a dead creature and harvest it. Minimal UI — console-level proof that the full pipeline works.

**Files to create:**
- `scripts/table-lookup.js` — layered fallback lookup (actor flag → exact name → normalized name → generic type+CR → not found)
- `scripts/harvesting.js` — harvest workflow state machine
- `templates/harvest-dialog.hbs` — Appraise / Harvest / Cancel prompt (rendered via `DialogV2.wait()`)
- `templates/harvest-result.hbs` — chat card showing harvest results
- `templates/harvest-pickup.hbs` — take/leave popup with checkboxes

**Harvest workflow implementation (harvester_rules.md §1-3):**
1. **Trigger**: Token HUD button via `renderTokenHUD` hook (native DOM, v13)
2. **Validate**: Dead NPC, not already harvested, player has selected token, check `allowHumanoidHarvesting` for humanoid type
3. **Lookup table**: 4-priority fallback system (see Core Architecture §1)
4. **Skill resolution**: Read creature type → look up primary skill from config/settings → check for secondary skill option
5. **Prompt dialog**: Show Appraise / Harvest / Cancel via `DialogV2.wait()`
6. **Roll**: `actor.rollSkill({ skill: skillId }, { configure: false, advantageMode })` — returns `rolls[0]`
7. **Nat 1 / Roll < 5 handling**: Check `roll.dice[0].total === 1` for crit fail, `roll.total < 5` for fumble. Read consequence from table flags.
8. **Nat 20 handling**: Check `roll.dice[0].total === 20`, look up `critSuccessItem` flag on table
9. **DC threshold filter**: `table.results.filter(r => r.getFlag("ultimate-harvester", "dc") <= roll.total)`
10. **Take/leave popup**: Render `harvest-pickup.hbs` in `DialogV2.wait()`, read checkbox state in callback
11. **Award items**: `fromUuid()` → `.toObject()` → set quantity → `actor.createEmbeddedDocuments("Item", [...])`
12. **Mark harvested**: `creature.setFlag("ultimate-harvester", "harvested", true)` — requires socketlib `executeAsGM` if player doesn't own NPC

**Death detection hook:**
- `updateActor` hook — detect HP transition to 0, post chat card with "Harvest" button
- Chat button listener via `renderChatMessageHTML` hook (v13: native DOM, not jQuery)

**Tool check:**
- Validate relevant tool in harvester's inventory before allowing harvest attempt
- Read bonus from purpose-built tool flags, apply as roll modifier

**Dependencies introduced:**
- `socketlib` (optional) — for marking NPC flags as harvested when player doesn't own the actor

**Test with**: Manually create one RollTable with DC-flagged results and one loot item in a test compendium. Verify full pipeline: trigger → roll → filter → award → flag.

**Milestone**: A player can harvest a dead creature and receive items in their inventory.

---

### Phase 3 — Appraisal System and Harvest Retries

**Goal**: Full appraisal flow and retry mechanics working.

**Appraisal implementation (harvester_rules.md §1.1):**
1. Player chooses "Appraise" from harvest dialog
2. Roll same skill as harvest, compare against `harvestDC - appraisalDCOffset`
3. **Tier +1 visibility**: Filter table results where DC <= (appraisal roll equivalent + one tier above). Hide Nat 20 item if more than one tier above.
4. Render appraisal result dialog showing: visible items with names/DCs/details, failure tiers (Nat 1 and Roll < 5 consequences), time estimate
5. On success: store `appraisalSuccess` flag on actor, grant advantage on subsequent harvest roll (`advantageMode: 1`)
6. Track retry count in actor flag: `appraisalAttempts`. Each retry applies cumulative -5.

**Retry implementation (harvester_rules.md §5):**
1. On harvest fail by < 5: Set `maxRetryDC` flag on actor (highest missed DC - one tier). Allow retry at full time cost.
2. On harvest fail by 5+: Set `harvested: "ruined"` flag. No further attempts.
3. Time calculation: 15 min per tier obtained + size modifier (+10/+20/+30 for L/H/G). Display in result chat card.

**Templates to create:**
- `templates/appraisal-result.hbs` — appraisal success/fail display with tier +1 visibility

**Milestone**: Full appraise → harvest → retry loop working with proper state tracking.

---

### Phase 4 — Content: Generic Harvest Tables and Items

**Goal**: Ship v1 content for 5 creature types across 4 CR tiers.

**Data authoring workflow:**
1. Create spreadsheet with columns: Table Name, Item Name, DC (using CR+10 formula), Quantity Formula, Category, Sell Price, Component Value, Crit Fail Effect, Nat 20 Item
2. Run conversion script (Node.js) to generate JSON source files
3. Compile to LevelDB with `fvtt package pack`

**v1 creature types (20 generic tables):**
- Beast (CR 0-1, 2-4, 5-10, 11+)
- Undead (CR 0-1, 2-4, 5-10, 11+)
- Fiend (CR 0-1, 2-4, 5-10, 11+)
- Dragon (CR 0-1, 2-4, 5-10, 11+)
- Monstrosity (CR 0-1, 2-4, 5-10, 11+)

**Item value guidelines (low/survival):**
- Cut current draft values by ~50%
- Harvesting is supplemental income, not primary gold source
- Global value multiplier setting for DM adjustment

**Loot items to create**: ~40-60 unique items across all categories (material, food, component, trophy). Items are reusable across multiple tables.

**Purpose-built harvesting tools**: 3-5 custom tool items (Harvester's Kit +1, Fiend Extraction Receptacle +3, etc.)

**Milestone**: Player can harvest any Beast, Undead, Fiend, Dragon, or Monstrosity and receive appropriate level-scaled loot.

---

### Phase 5 — Foraging System

**Goal**: Full foraging workflow with DM panel.

**Files to create:**
- `scripts/foraging.js` — foraging workflow engine
- `scripts/foraging-panel.js` — DM Foraging Panel (ApplicationV2 + HandlebarsApplicationMixin, singleton)
- `templates/forage-panel.hbs` — DM panel template (PARTS: header, environment config, modifiers)
- `templates/forage-prompt.hbs` — player "How many hours?" prompt
- `templates/forage-result.hbs` — foraging result chat card

**DM Foraging Panel (harvester_rules.md §8):**
- ApplicationV2 subclass with PARTS system for selective re-rendering
- Fields: environment dropdown (10 options), DM modifier (+/-), weather dropdown, season dropdown, primary/secondary skill (auto-filled, editable)
- Opened via scene control button (`getSceneControlButtons` hook — v13 object-based)
- Singleton pattern for persistence across scene changes
- Stores config in world settings

**Foraging workflow (harvester_rules.md §7):**
1. Player clicks "Forage" macro or scene control button
2. Prompt: "How many hours?" via `DialogV2.prompt()` with number input
3. Calculate DC: environment base DC - (hours - 1) + DM modifier + weather + season
4. Roll skill: primary skill from environment config, or secondary at -5
5. Determine highest qualifying tier (NOT cumulative — unlike harvesting)
6. Draw from tier's d6 sub-table using standard `table.roll()`
7. Show result via take/leave popup (same pattern as harvesting)
8. Post chat card with results; whisper GM notification

**v1 foraging environments (5 with full tier tables):**
- Light Forest, Dense Forest/Jungle, Plains/Grassland, Desert/Wasteland, Arctic/Tundra
- Each has 4 tiers (Basic/Successful/Bountiful/Rare) with 6 entries each = 120 table entries total

**Foraging compendium structure:**
- Each environment gets 4 RollTables (one per tier), stored in `foraging-tables` compendium
- Naming: `{Environment} - Tier {N} Foraging Table` (e.g., "Light Forest - Tier 1 Foraging Table")

**Milestone**: DM opens panel, sets environment, player forages, gets appropriate loot.

---

### Phase 6 — Specific Creature Override Tables

**Goal**: Iconic creatures get hand-crafted harvest tables that override generics.

**High priority creatures:**
- Troll (already designed in rules doc — 3 DC tiers + crit fail acid + nat 20 lymphatic fluid)
- Wolf, Boar, Brown Bear, Giant Spider
- Skeleton, Zombie, Ghoul, Wraith, Vampire Spawn
- Owlbear, Basilisk, Manticore
- Young/Adult/Ancient dragons (by color — 5 colors x 3 ages = 15 tables)

**Medium priority:**
- Beholder (eye stalks), Mind Flayer (brain, tentacles), Gelatinous Cube, Hydra

**Implementation:**
- Each override table stored in `harvest-tables` compendium
- Named `{Creature Name} Harvest Table` for exact-match lookup
- Include crit fail consequences and nat 20 items specific to each creature
- Layered lookup automatically prefers these over generic tables

**Milestone**: ~25-30 specific creature tables shipping. Troll, dragons, and common combat encounters fully playable.

---

### Phase 7 — UI Polish and GM Tools

**Goal**: Production-quality UI and GM convenience features.

**Token integration:**
- Token HUD "Harvest" button (refined styling, icon)
- Token right-click context menu entry via token controls hook
- Visual indicator on tokens that have been harvested (optional tint or icon overlay)

**Chat cards:**
- Styled harvest result cards with item icons, sell/component values, category badges
- Styled appraisal result cards with tier +1 visibility, time estimates
- Styled foraging result cards matching harvest card design
- Clickable "Harvest" button on death notification cards

**GM tools:**
- Right-click actor → "Assign Harvest Table" (opens compendium picker, sets `harvestTable` flag)
- Right-click actor → "Reset Harvest" (clears `harvested`, `harvestOffered`, `appraisalAttempts`, `maxRetryDC` flags)
- Skill mapping submenu (ApplicationV2 form with 14 dropdowns, one per creature type)

**CSS:**
- Chat card styling (`.ultimate-harvester-card` classes)
- Dialog styling (harvest, appraisal, pickup, forage)
- DM panel styling
- Responsive layout for different Foundry window sizes

**Milestone**: Module looks and feels polished. All interactions are intuitive without reading docs.

---

### Phase 8 — Remaining Content and Expansion

**Goal**: Fill out remaining creature types, environments, and content.

**Remaining creature types (9 types x 4 tiers = 36 tables):**
- Aberration, Celestial, Construct, Elemental, Fey, Giant, Humanoid (if enabled), Ooze, Plant

**Remaining foraging environments (5 more):**
- Swamp/Marsh, Coastal, Underground/Cave, Mountain, Urban/Ruins

**Additional specific creature overrides:**
- Dinosaurs, Winter Wolf, Yeti, campaign-specific creatures

**Content tooling:**
- Finalize spreadsheet → JSON → LevelDB pipeline
- Document the data authoring workflow for community contributions
- Consider CSV import tool for GMs to add custom tables

**Milestone**: Full content coverage for all 14 creature types and 10 environments.

---

### Phase Summary

| Phase | Deliverable | Difficulty | Dependencies |
|---|---|---|---|
| 1 | Module scaffold + settings | Routine | None |
| 2 | Core harvest workflow (trigger → roll → loot) | Easy-Difficult | Phase 1, socketlib (optional) |
| 3 | Appraisal + retry mechanics | Easy-Difficult | Phase 2 |
| 4 | v1 content (5 creature types, ~60 items) | Easy (labor-intensive) | Phase 2 |
| 5 | Foraging system + DM panel | Difficult | Phase 1, ApplicationV2 |
| 6 | Specific creature override tables | Easy (labor-intensive) | Phase 2 |
| 7 | UI polish + GM tools | Easy-Difficult | Phases 2-5 |
| 8 | Full content (14 types, 10 environments) | Easy (labor-intensive) | Phases 4-5 |

**Phases 4, 6, and 8 are content-heavy** and can be parallelized with development phases. A spreadsheet-to-JSON pipeline should be built early (Phase 4) to accelerate all content work.

**Minimum viable product**: Phases 1-4 (harvest workflow + core content). Foraging (Phase 5) can ship separately.

---

## Data Authoring Workflow

### Recommended: Spreadsheet → JSON → LevelDB

To avoid manually editing hundreds of JSON files:

1. Maintain a spreadsheet (Google Sheets, CSV) with columns:
   - Table Name, Item Name, DC, Quantity Formula, Category, Item Price, Item Weight
2. Run a conversion script to generate JSON source files
3. Compile JSON to LevelDB with Foundry CLI

### Foundry CLI Commands
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
fvtt package unpack "harvest-tables"
fvtt package unpack "generic-tables"
fvtt package unpack "foraging-tables"
```

---

## Resources

- **Foundry VTT API (v13)**: https://foundryvtt.com/api/
- **Module Development Guide**: https://foundryvtt.com/article/module-development/
- **Content Packaging Guide**: https://foundryvtt.com/article/packaging-guide/
- **Compendium Packs Docs**: https://foundryvtt.com/article/compendium/
- **Roll Tables Docs**: https://foundryvtt.com/article/roll-tables/
- **LevelDB Pack Format (v11+)**: https://foundryvtt.com/article/v11-leveldb-packs/
- **Foundry CLI**: https://github.com/foundryvtt/foundryvtt-cli
- **dnd5e System Repo**: https://github.com/foundryvtt/dnd5e
- **Community Wiki**: https://foundryvtt.wiki/en/development
- **Existing Harvester Module**: https://github.com/OhhLoz/Harvester
