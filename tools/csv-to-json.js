#!/usr/bin/env node
/**
 * Ultimate Harvester — CSV to Foundry JSON Converter
 *
 * Reads CSV files defining harvest items and tables, outputs Foundry-compatible
 * JSON source files ready for compilation to LevelDB with `fvtt package pack`.
 *
 * Usage:
 *   node tools/csv-to-json.js
 *
 * Input files (in tools/data/):
 *   - items.csv        — Loot item definitions
 *   - tables.csv        — Harvest table definitions (generic + specific)
 *
 * Output (in packs/_source/):
 *   - harvest-items/    — Item JSON files
 *   - generic-tables/   — Generic type+CR RollTable JSON files
 *   - harvest-tables/   — Specific creature RollTable JSON files
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MODULE_ID = "ultimate-harvester";
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const SOURCE_DIR = path.join(ROOT, "packs", "_source");

/* ---- CSV Parser (simple, handles quoted fields) ---- */

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = _splitCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = _splitCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] || "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function _splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/* ---- Deterministic ID Generation ---- */

function generateId(seed) {
  return crypto.createHash("md5").update(seed).digest("hex").substring(0, 16);
}

/* ---- Item Processing ---- */

function processItems(rows) {
  const items = {};

  for (const row of rows) {
    if (!row.Name) continue;

    const id = generateId(`item:${row.Name}`);
    // Use safe fallback — generated icon paths may not exist in Foundry core.
    // TODO: Replace with verified icons per tools/icon-assignment-plan.md
    const SAFE_FALLBACK = "icons/svg/item-bag.svg";
    const img = SAFE_FALLBACK;

    const item = {
      _id: id,
      name: row.Name,
      type: "loot",
      img,
      system: {
        description: { value: `<p>${row.Description || ""}</p>` },
        weight: { value: parseFloat(row.Weight) || 0, units: "lb" },
        price: { value: parseInt(row.Price) || 0, denomination: row.Denomination || "gp" },
        rarity: row.Rarity || "common",
        quantity: 1,
      },
      flags: {
        [MODULE_ID]: {
          category: row.Category || "material",
        },
      },
    };

    // Purpose-built tool bonuses
    if (row.HarvestBonus) {
      item.flags[MODULE_ID].harvestBonus = parseInt(row.HarvestBonus);
      if (row.ApplicableTypes) {
        item.flags[MODULE_ID].applicableTypes = row.ApplicableTypes.split(";").map((t) => t.trim());
      }
    }

    items[row.Name] = item;
  }

  return items;
}

/* ---- Table Processing ---- */

function processTables(rows, itemLookup) {
  // Group rows by table name
  const tableGroups = {};
  for (const row of rows) {
    if (!row.TableName) continue;
    if (!tableGroups[row.TableName]) {
      // Auto-detect type from name if not specified
      let autoType = row.TableType || "generic";
      if (!row.TableType && row.TableName.includes("Foraging Table")) autoType = "foraging";
      else if (!row.TableType && row.TableName.includes("Harvest Table") && !row.TableName.match(/CR \d/)) autoType = "specific";
      tableGroups[row.TableName] = {
        name: row.TableName,
        description: row.TableDescription || "",
        type: autoType,
        critFailEffect: row.CritFailEffect || "",
        fumbleEffect: row.FumbleEffect || "",
        critSuccessItem: row.CritSuccessItem || "",
        critSuccessQuantity: row.CritSuccessQuantity || "1",
        entries: [],
      };
    }
    if (row.ItemName) {
      const dcValue = row.DC?.trim();
      const RARITY_NAMES = ["common", "uncommon", "rare", "veryRare"];
      const isRarity = RARITY_NAMES.includes(dcValue);
      tableGroups[row.TableName].entries.push({
        itemName: row.ItemName,
        dc: isRarity ? null : (parseInt(dcValue) || 10),
        rarity: isRarity ? dcValue : null,
        quantity: row.Quantity || "1",
        category: row.ItemCategory || "material",
      });
    }
  }

  // Convert to Foundry RollTable format
  const tables = {};
  for (const [tableName, group] of Object.entries(tableGroups)) {
    const tableId = generateId(`table:${tableName}`);

    const results = group.entries.map((entry, idx) => {
      const item = itemLookup[entry.itemName];
      const itemUuid = item
        ? `Compendium.${MODULE_ID}.harvest-items.${item._id}`
        : null;

      const resultFlags = {};
      if (entry.rarity) {
        resultFlags.rarity = entry.rarity;
      } else {
        resultFlags.dc = entry.dc;
      }

      return {
        _id: generateId(`result:${tableName}:${entry.itemName}`),
        text: entry.itemName,
        type: 0, // TEXT
        range: [entry.dc ?? 1, (entry.dc ?? 1) + 2],
        weight: 1,
        drawn: false,
        flags: {
          [MODULE_ID]: {
            ...resultFlags,
            itemUuid: itemUuid,
            quantity: entry.quantity,
            category: entry.category,
          },
        },
      };
    });

    const tableFlags = {};
    if (group.critFailEffect) tableFlags.critFailEffect = group.critFailEffect;
    if (group.fumbleEffect) tableFlags.fumbleEffect = group.fumbleEffect;
    if (group.critSuccessItem) {
      const critItem = itemLookup[group.critSuccessItem];
      if (critItem) {
        tableFlags.critSuccessItem = `Compendium.${MODULE_ID}.harvest-items.${critItem._id}`;
      }
    }
    if (group.critSuccessQuantity) tableFlags.critSuccessQuantity = group.critSuccessQuantity;

    const table = {
      _id: tableId,
      name: tableName,
      description: `<p>${group.description}</p>`,
      formula: group.type === "foraging" ? "1d6" : "1d20",
      replacement: true,
      displayRoll: true,
      results: results,
      flags: {
        [MODULE_ID]: tableFlags,
      },
    };

    tables[tableName] = { data: table, type: group.type };
  }

  return tables;
}

/* ---- File Output ---- */

function writeOutput(items, tables) {
  // Create output directories
  const dirs = ["harvest-items", "generic-tables", "harvest-tables", "foraging-tables"];
  for (const dir of dirs) {
    const fullPath = path.join(SOURCE_DIR, dir);
    fs.mkdirSync(fullPath, { recursive: true });
    // Clean existing files
    if (fs.existsSync(fullPath)) {
      for (const f of fs.readdirSync(fullPath)) {
        if (f.endsWith(".json")) fs.unlinkSync(path.join(fullPath, f));
      }
    }
  }

  // Write items
  let itemCount = 0;
  for (const [name, item] of Object.entries(items)) {
    const filename = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "") + ".json";
    fs.writeFileSync(
      path.join(SOURCE_DIR, "harvest-items", filename),
      JSON.stringify(item, null, 2)
    );
    itemCount++;
  }

  // Write tables
  let genericCount = 0;
  let specificCount = 0;
  let foragingCount = 0;
  for (const [name, { data, type }] of Object.entries(tables)) {
    const dir = type === "specific" ? "harvest-tables" : type === "foraging" ? "foraging-tables" : "generic-tables";
    const filename = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "") + ".json";
    fs.writeFileSync(
      path.join(SOURCE_DIR, dir, filename),
      JSON.stringify(data, null, 2)
    );
    if (type === "specific") specificCount++;
    else if (type === "foraging") foragingCount++;
    else genericCount++;
  }

  console.log(`\nOutput written to ${SOURCE_DIR}/`);
  console.log(`  Items: ${itemCount}`);
  console.log(`  Generic tables: ${genericCount}`);
  console.log(`  Specific tables: ${specificCount}`);
  console.log(`  Foraging tables: ${foragingCount}`);
}

/* ---- Main ---- */

function main() {
  console.log("Ultimate Harvester — CSV to JSON Converter\n");

  // Read items CSV
  const itemsPath = path.join(DATA_DIR, "items.csv");
  if (!fs.existsSync(itemsPath)) {
    console.error(`Items CSV not found: ${itemsPath}`);
    console.log("Create tools/data/items.csv with columns: Name,Icon,Description,Weight,Price,Denomination,Rarity,Category,HarvestBonus,ApplicableTypes");
    process.exit(1);
  }

  const itemsCSV = fs.readFileSync(itemsPath, "utf-8");
  const itemRows = parseCSV(itemsCSV);
  const items = processItems(itemRows);
  console.log(`Processed ${Object.keys(items).length} harvest items`);

  // Read foraging items CSV (merged into same item pool)
  const foragingItemsPath = path.join(DATA_DIR, "foraging-items.csv");
  if (fs.existsSync(foragingItemsPath)) {
    const foragingItemsCSV = fs.readFileSync(foragingItemsPath, "utf-8");
    const foragingItemRows = parseCSV(foragingItemsCSV);
    const foragingItems = processItems(foragingItemRows);
    Object.assign(items, foragingItems);
    console.log(`Processed ${Object.keys(foragingItems).length} foraging items (${Object.keys(items).length} total)`);
  }

  // Read tables CSV
  const tablesPath = path.join(DATA_DIR, "tables.csv");
  if (!fs.existsSync(tablesPath)) {
    console.error(`Tables CSV not found: ${tablesPath}`);
    console.log("Create tools/data/tables.csv with columns: TableName,TableDescription,TableType,CritFailEffect,FumbleEffect,CritSuccessItem,CritSuccessQuantity,ItemName,DC,Quantity,ItemCategory");
    process.exit(1);
  }

  const tablesCSV = fs.readFileSync(tablesPath, "utf-8");
  const tableRows = parseCSV(tablesCSV);
  const tables = processTables(tableRows, items);
  console.log(`Processed ${Object.keys(tables).length} harvest tables`);

  // Read foraging tables CSV
  const foragingTablesPath = path.join(DATA_DIR, "foraging-tables.csv");
  if (fs.existsSync(foragingTablesPath)) {
    const foragingTablesCSV = fs.readFileSync(foragingTablesPath, "utf-8");
    const foragingTableRows = parseCSV(foragingTablesCSV);
    const foragingTables = processTables(foragingTableRows, items);
    Object.assign(tables, foragingTables);
    console.log(`Processed ${Object.keys(foragingTables).length} foraging tables (${Object.keys(tables).length} total)`);
  }

  // Validate item references
  let missingRefs = 0;
  for (const [tableName, { data }] of Object.entries(tables)) {
    for (const result of data.results) {
      if (!result.flags[MODULE_ID].itemUuid) {
        console.warn(`  WARNING: "${result.text}" in "${tableName}" has no matching item`);
        missingRefs++;
      }
    }
  }
  if (missingRefs > 0) {
    console.warn(`\n${missingRefs} missing item references — items will need to be created`);
  }

  writeOutput(items, tables);
}

main();
