/**
 * Run this in Foundry's browser console (F12) to dump all core icon paths.
 * Paste output into tools/data/available-icons.txt
 *
 * Usage: Copy/paste this entire script into the F12 console.
 */
(async () => {
  const dirs = [
    "icons/commodities", "icons/consumables", "icons/containers",
    "icons/creatures", "icons/environment", "icons/equipment",
    "icons/magic", "icons/skills", "icons/sundries",
    "icons/svg", "icons/tools", "icons/weapons"
  ];

  const allIcons = [];

  async function crawl(dir) {
    try {
      const result = await FilePicker.browse("public", dir);
      for (const file of result.files) {
        allIcons.push(file);
      }
      for (const subdir of result.dirs) {
        await crawl(subdir);
      }
    } catch (e) {
      console.warn(`Could not browse: ${dir}`);
    }
  }

  for (const dir of dirs) {
    await crawl(dir);
  }

  console.log(`Found ${allIcons.length} icons`);
  console.log(allIcons.join("\n"));

  // Also copy to clipboard
  await navigator.clipboard.writeText(allIcons.join("\n"));
  ui.notifications.info(`${allIcons.length} icon paths copied to clipboard!`);
})();
