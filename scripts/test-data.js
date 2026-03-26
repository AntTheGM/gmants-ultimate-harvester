/**
 * Ultimate Harvester — Test Data Seeder
 * Creates a test RollTable and loot items for verifying the harvest pipeline.
 * Run once from the browser console: game.ultimateHarvester.seedTestData()
 *
 * Creates:
 * - 4 loot items in the harvest-items compendium
 * - 1 RollTable "Wolf Harvest Table" in the harvest-tables compendium
 * - 1 Generic "Beast CR 0-1 Harvest Table" in the generic-tables compendium
 */

import { MODULE_ID } from "./config.js";

export async function seedTestData() {
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can seed test data.");
    return;
  }

  console.log(`${MODULE_ID} | Clearing and re-seeding test data...`);

  // --- Clear all packs first ---
  const packIds = [
    `${MODULE_ID}.harvest-items`,
    `${MODULE_ID}.harvest-tables`,
    `${MODULE_ID}.generic-tables`,
  ];
  for (const packId of packIds) {
    const pack = game.packs.get(packId);
    if (!pack) continue;
    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false });
    const index = await pack.getIndex();
    for (const entry of index) {
      const doc = await pack.getDocument(entry._id);
      await doc.delete();
    }
    if (wasLocked) await pack.configure({ locked: true });
  }
  console.log(`${MODULE_ID} | Cleared existing test data`);

  // --- Seed harvest items ---
  const itemsPack = game.packs.get(`${MODULE_ID}.harvest-items`);
  if (!itemsPack) {
    ui.notifications.error("harvest-items compendium not found!");
    return;
  }

  const wasItemsLocked = itemsPack.locked;
  if (wasItemsLocked) await itemsPack.configure({ locked: false });

  const testItems = [
    {
      name: "Wolf Pelt",
      type: "loot",
      img: "icons/commodities/leather/fur-pelt-brown.webp",
      system: {
        description: { value: "<p>A rough wolf pelt, suitable for crafting or trade.</p>" },
        weight: { value: 5, units: "lb" },
        price: { value: 2, denomination: "gp" },
        rarity: "common",
        quantity: 1,
      },
      flags: { [MODULE_ID]: { category: "material" } },
    },
    {
      name: "Wolf Fangs",
      type: "loot",
      img: "icons/commodities/bones/teeth-canine-white.webp",
      system: {
        description: { value: "<p>Sharp wolf fangs. Valued as trinkets or spell components.</p>" },
        weight: { value: 0.1, units: "lb" },
        price: { value: 5, denomination: "sp" },
        rarity: "common",
        quantity: 1,
      },
      flags: { [MODULE_ID]: { category: "trophy" } },
    },
    {
      name: "Wolf Meat",
      type: "loot",
      img: "icons/consumables/meat/steak-plain-cut-red.webp",
      system: {
        description: { value: "<p>Lean wolf meat. Edible if properly cooked.</p>" },
        weight: { value: 2, units: "lb" },
        price: { value: 1, denomination: "sp" },
        rarity: "common",
        quantity: 1,
      },
      flags: { [MODULE_ID]: { category: "food" } },
    },
    {
      name: "Wolf Heart",
      type: "loot",
      img: "icons/commodities/biological/organ-heart-red.webp",
      system: {
        description: { value: "<p>A wolf&apos;s heart, prized by alchemists for potions of bravery.</p>" },
        weight: { value: 0.5, units: "lb" },
        price: { value: 5, denomination: "gp" },
        rarity: "uncommon",
        quantity: 1,
      },
      flags: { [MODULE_ID]: { category: "component" } },
    },
    {
      name: "Winter Wolf Pelt",
      type: "loot",
      img: "icons/commodities/leather/fur-pelt-white.webp",
      system: {
        description: { value: "<p>A thick, frost-white pelt from a Winter Wolf. Naturally resistant to cold.</p>" },
        weight: { value: 8, units: "lb" },
        price: { value: 25, denomination: "gp" },
        rarity: "uncommon",
        quantity: 1,
      },
      flags: { [MODULE_ID]: { category: "material" } },
    },
    {
      name: "Winter Wolf Fangs",
      type: "loot",
      img: "icons/commodities/bones/teeth-canine-white.webp",
      system: {
        description: { value: "<p>Razor-sharp fangs radiating faint cold. Prized by weaponsmiths.</p>" },
        weight: { value: 0.2, units: "lb" },
        price: { value: 5, denomination: "gp" },
        rarity: "uncommon",
        quantity: 1,
      },
      flags: { [MODULE_ID]: { category: "trophy" } },
    },
    {
      name: "Frost Breath Gland",
      type: "loot",
      img: "icons/commodities/biological/organ-brain-pink-purple.webp",
      system: {
        description: { value: "<p>The organ that produces the Winter Wolf&apos;s frost breath. An alchemist could use this to brew potions of cold resistance or frost-based weapons.</p>" },
        weight: { value: 1, units: "lb" },
        price: { value: 50, denomination: "gp" },
        rarity: "rare",
        quantity: 1,
      },
      flags: { [MODULE_ID]: { category: "component" } },
    },
    {
      name: "Winter Wolf Meat",
      type: "loot",
      img: "icons/consumables/meat/steak-plain-cut-red.webp",
      system: {
        description: { value: "<p>Lean, cold-infused meat. Must be cooked thoroughly to neutralize the residual frost.</p>" },
        weight: { value: 4, units: "lb" },
        price: { value: 2, denomination: "sp" },
        rarity: "common",
        quantity: 1,
      },
      flags: { [MODULE_ID]: { category: "food" } },
    },
  ];

  // Create items and track their UUIDs
  const createdItems = {};
  for (const itemData of testItems) {
    const created = await Item.create(itemData, { pack: `${MODULE_ID}.harvest-items` });
    createdItems[itemData.name] = created.uuid;
  }

  if (wasItemsLocked) await itemsPack.configure({ locked: true });

  // --- Seed Wolf Harvest Table (specific override) ---
  const harvestPack = game.packs.get(`${MODULE_ID}.harvest-tables`);
  if (!harvestPack) {
    ui.notifications.error("harvest-tables compendium not found!");
    return;
  }

  const wasHarvestLocked = harvestPack.locked;
  if (wasHarvestLocked) await harvestPack.configure({ locked: false });

  await RollTable.create(
      {
        name: "Wolf Harvest Table",
        description: "<p>Harvest table for wolves (Beast, CR 1/4). Base DC = 1+12 = 13.</p>",
        formula: "1d20",
        results: [
          {
            text: "Wolf Meat",
            type: CONST.TABLE_RESULT_TYPES.TEXT,
            range: [13, 14],
            flags: {
              [MODULE_ID]: {
                dc: 13,
                itemUuid: createdItems["Wolf Meat"],
                quantity: "1d4",
                category: "food",
              },
            },
          },
          {
            text: "Wolf Pelt",
            type: CONST.TABLE_RESULT_TYPES.TEXT,
            range: [15, 17],
            flags: {
              [MODULE_ID]: {
                dc: 15,
                itemUuid: createdItems["Wolf Pelt"],
                quantity: "1",
                category: "material",
              },
            },
          },
          {
            text: "Wolf Fangs",
            type: CONST.TABLE_RESULT_TYPES.TEXT,
            range: [18, 20],
            flags: {
              [MODULE_ID]: {
                dc: 18,
                itemUuid: createdItems["Wolf Fangs"],
                quantity: "1d4",
                category: "trophy",
              },
            },
          },
          {
            text: "Wolf Heart",
            type: CONST.TABLE_RESULT_TYPES.TEXT,
            range: [21, 23],
            flags: {
              [MODULE_ID]: {
                dc: 21,
                itemUuid: createdItems["Wolf Heart"],
                quantity: "1",
                category: "component",
              },
            },
          },
        ],
        flags: {
          [MODULE_ID]: {
            critFailEffect: "The wolf&apos;s blood stains your hands. No harm done, but the pelt is ruined.",
            fumbleEffect: "You nick yourself on a bone. Take 1 point of piercing damage.",
          },
        },
      },
      { pack: `${MODULE_ID}.harvest-tables` }
    );

  // --- Seed Winter Wolf Harvest Table (specific override, Monstrosity CR 3) ---
  await RollTable.create(
      {
        name: "Winter Wolf Harvest Table",
        description: "<p>Harvest table for Winter Wolves (Monstrosity, CR 3). Base DC = 3+12 = 15.</p>",
        formula: "1d20",
        results: [
          {
            text: "Winter Wolf Meat",
            type: CONST.TABLE_RESULT_TYPES.TEXT,
            range: [15, 16],
            flags: {
              [MODULE_ID]: {
                dc: 15,
                itemUuid: createdItems["Winter Wolf Meat"],
                quantity: "1d4",
                category: "food",
              },
            },
          },
          {
            text: "Winter Wolf Pelt",
            type: CONST.TABLE_RESULT_TYPES.TEXT,
            range: [17, 19],
            flags: {
              [MODULE_ID]: {
                dc: 17,
                itemUuid: createdItems["Winter Wolf Pelt"],
                quantity: "1",
                category: "material",
              },
            },
          },
          {
            text: "Winter Wolf Fangs",
            type: CONST.TABLE_RESULT_TYPES.TEXT,
            range: [20, 22],
            flags: {
              [MODULE_ID]: {
                dc: 20,
                itemUuid: createdItems["Winter Wolf Fangs"],
                quantity: "1d4",
                category: "trophy",
              },
            },
          },
          {
            text: "Frost Breath Gland",
            type: CONST.TABLE_RESULT_TYPES.TEXT,
            range: [23, 25],
            flags: {
              [MODULE_ID]: {
                dc: 23,
                itemUuid: createdItems["Frost Breath Gland"],
                quantity: "1",
                category: "component",
              },
            },
          },
        ],
        flags: {
          [MODULE_ID]: {
            critFailEffect: "The frost gland ruptures — take 2d4 cold damage as icy vapor blasts your hands.",
            fumbleEffect: "Residual cold numbs your fingers. Disadvantage on Dexterity checks for 10 minutes.",
          },
        },
      },
      { pack: `${MODULE_ID}.harvest-tables` }
    );

  if (wasHarvestLocked) await harvestPack.configure({ locked: true });

  // --- Seed Beast CR 0-1 Harvest Table (generic fallback) ---
  const genericPack = game.packs.get(`${MODULE_ID}.generic-tables`);
  if (!genericPack) {
    ui.notifications.error("generic-tables compendium not found!");
    return;
  }

  const wasGenericLocked = genericPack.locked;
  if (wasGenericLocked) await genericPack.configure({ locked: false });

  await RollTable.create(
      {
        name: "Beast CR 0-1 Harvest Table",
        description: "<p>Generic harvest table for beasts CR 0-1. Base DC = 1+12 = 13.</p>",
        formula: "1d20",
        results: [
          {
            text: "Animal Meat",
            type: CONST.TABLE_RESULT_TYPES.TEXT,
            range: [13, 14],
            flags: {
              [MODULE_ID]: {
                dc: 13,
                itemUuid: createdItems["Wolf Meat"],
                quantity: "1d4",
                category: "food",
              },
            },
          },
          {
            text: "Animal Hide",
            type: CONST.TABLE_RESULT_TYPES.TEXT,
            range: [15, 17],
            flags: {
              [MODULE_ID]: {
                dc: 15,
                itemUuid: createdItems["Wolf Pelt"],
                quantity: "1",
                category: "material",
              },
            },
          },
          {
            text: "Teeth/Claws",
            type: CONST.TABLE_RESULT_TYPES.TEXT,
            range: [18, 20],
            flags: {
              [MODULE_ID]: {
                dc: 18,
                itemUuid: createdItems["Wolf Fangs"],
                quantity: "1d4",
                category: "trophy",
              },
            },
          },
        ],
      },
      { pack: `${MODULE_ID}.generic-tables` }
    );

  if (wasGenericLocked) await genericPack.configure({ locked: true });

  // Clear table lookup cache since we just added data
  const { clearTableCache } = await import("./table-lookup.js");
  clearTableCache();

  ui.notifications.info("Ultimate Harvester test data seeded successfully!");
  console.log(`${MODULE_ID} | Test data seeded. Created items:`, createdItems);
}
