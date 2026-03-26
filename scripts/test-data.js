/**
 * Ultimate Harvester — Data Seeder
 * Loads JSON source files from packs/_source/ and seeds them into compendium packs.
 * Run from browser console: game.ultimateHarvester.seedTestData()
 *
 * For development use. Release builds will ship pre-compiled LevelDB packs.
 */

import { MODULE_ID } from "./config.js";
import { clearTableCache } from "./table-lookup.js";

/**
 * Seed all compendium packs from JSON source files.
 */
export async function seedTestData() {
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can seed data.");
    return;
  }

  console.log(`${MODULE_ID} | Seeding compendium data from JSON sources...`);
  ui.notifications.info("Seeding harvest data... this may take a moment.");

  const packConfigs = [
    { packName: "harvest-items", sourceDir: "_source/harvest-items", docClass: Item },
    { packName: "generic-tables", sourceDir: "_source/generic-tables", docClass: RollTable },
    { packName: "harvest-tables", sourceDir: "_source/harvest-tables", docClass: RollTable },
    { packName: "foraging-tables", sourceDir: "_source/foraging-tables", docClass: RollTable },
  ];

  let totalItems = 0;
  let totalTables = 0;

  for (const config of packConfigs) {
    const packId = `${MODULE_ID}.${config.packName}`;
    const pack = game.packs.get(packId);
    if (!pack) {
      console.warn(`${MODULE_ID} | Pack not found: ${packId}`);
      continue;
    }

    // Unlock pack
    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false });

    // Clear existing entries
    const index = await pack.getIndex();
    for (const entry of index) {
      const doc = await pack.getDocument(entry._id);
      await doc.delete();
    }

    // Fetch the directory listing of JSON files
    const sourceBase = `modules/${MODULE_ID}/packs/${config.sourceDir}`;
    let fileList;
    try {
      const response = await FilePicker.browse("data", sourceBase);
      fileList = response.files.filter((f) => f.endsWith(".json"));
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not browse ${sourceBase}:`, err);
      if (wasLocked) await pack.configure({ locked: true });
      continue;
    }

    // Load and create each document
    let count = 0;
    for (const filePath of fileList) {
      try {
        const response = await fetch(filePath);
        const data = await response.json();
        await config.docClass.create(data, { pack: packId, keepId: true });
        count++;
      } catch (err) {
        console.warn(`${MODULE_ID} | Failed to load ${filePath}:`, err);
      }
    }

    if (config.docClass === Item) totalItems = count;
    else totalTables += count;

    if (wasLocked) await pack.configure({ locked: true });
    console.log(`${MODULE_ID} | Seeded ${count} documents into ${packId}`);
  }

  // Clear table lookup cache
  clearTableCache();

  const msg = `Ultimate Harvester data seeded: ${totalItems} items, ${totalTables} tables.`;
  ui.notifications.info(msg);
  console.log(`${MODULE_ID} | ${msg}`);
}
