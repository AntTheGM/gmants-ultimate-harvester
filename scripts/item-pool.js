/**
 * Ultimate Harvester — Item Pool Engine (v2)
 *
 * Replaces RollTable-based foraging draws with dynamic compendium queries.
 * Items self-describe their biome/tier/category via flags; this module indexes
 * them at runtime and provides random draw functions.
 *
 * See docs/foraging_v2_plan.md for architecture details.
 */

import { MODULE_ID } from "./config.js";

/** @type {Object|null} Cached pool index — built on first access per session. */
let poolIndex = null;

/**
 * Build (or rebuild) the pool index from the harvest-items compendium.
 *
 * Structure:
 * ```
 * { [biomeKey]: { [tier]: { [category]: [ {name, uuid, category} ] } } }
 * ```
 *
 * Only indexes items with `flags.ultimate-harvester.source === "foraged"` and
 * valid `biomes` + `tier` flags.
 *
 * @returns {Promise<Object>} The pool index
 */
export async function buildPoolIndex() {
  const pack = game.packs.get(`${MODULE_ID}.harvest-items`);
  if (!pack) {
    console.warn(`${MODULE_ID} | harvest-items compendium not found — pool index empty`);
    poolIndex = {};
    return poolIndex;
  }

  // Request custom flags in the index to avoid loading full documents
  const index = await pack.getIndex({ fields: ["flags.ultimate-harvester"] });

  const newIndex = {};
  let indexed = 0;
  let skipped = 0;

  for (const entry of index) {
    const flags = entry.flags?.[MODULE_ID];
    if (!flags) { skipped++; continue; }

    const biomes = flags.biomes;
    const tier = flags.tier;
    const category = flags.category;

    // Items with biomes + tier flags are foraging pool items by definition
    if (!biomes || !Array.isArray(biomes) || biomes.length === 0 || !tier || !category) {
      skipped++;
      continue;
    }

    const poolEntry = {
      name: entry.name,
      uuid: `Compendium.${MODULE_ID}.harvest-items.${entry._id}`,
      category,
    };

    for (const biome of biomes) {
      if (!newIndex[biome]) newIndex[biome] = {};
      if (!newIndex[biome][tier]) newIndex[biome][tier] = {};
      if (!newIndex[biome][tier][category]) newIndex[biome][tier][category] = [];
      newIndex[biome][tier][category].push(poolEntry);
    }

    indexed++;
  }

  poolIndex = newIndex;
  console.log(`${MODULE_ID} | Pool index built: ${indexed} items indexed, ${skipped} skipped`);
  return poolIndex;
}

/**
 * Get the pool index, building it if not yet cached.
 * @returns {Promise<Object>}
 */
async function _ensureIndex() {
  if (!poolIndex) await buildPoolIndex();
  return poolIndex;
}

/**
 * Get all items matching a biome + tier, optionally filtered by category.
 *
 * @param {string} biome - Environment key (e.g., "coastal")
 * @param {number} tier - Tier number (1-4)
 * @param {string|null} [category=null] - Category filter ("food", "component", "material", "trophy", "drink").
 *   Pass `null` for all categories. Pass `"food"` for food AND drink (survival essentials).
 *   Pass `"non-food"` for everything except food and drink.
 * @returns {Promise<Array>} Array of pool entries [{name, uuid, category}]
 */
export async function getPool(biome, tier, category = null) {
  const idx = await _ensureIndex();
  const tierPool = idx[biome]?.[tier];
  if (!tierPool) return [];

  if (category === null) {
    // All categories merged
    return Object.values(tierPool).flat();
  }

  if (category === "food") {
    // Food AND drink — both are survival essentials
    return [...(tierPool["food"] || []), ...(tierPool["drink"] || [])];
  }

  if (category === "non-food") {
    // Everything except food and drink
    return Object.entries(tierPool)
      .filter(([cat]) => cat !== "food" && cat !== "drink")
      .flatMap(([, items]) => items);
  }

  return tierPool[category] || [];
}

/**
 * Draw a random item from the pool, with optional category constraint and
 * exclusion list to prevent duplicates within a tier.
 *
 * @param {string} biome - Environment key
 * @param {number} tier - Tier number (1-4)
 * @param {string|null} [category=null] - Category filter (see getPool)
 * @param {Set<string>} [exclude=null] - Set of UUIDs to exclude (already drawn)
 * @returns {Promise<Object|null>} A pool entry {name, uuid, category} or null if empty
 */
export async function drawFromPool(biome, tier, category = null, exclude = null) {
  const _filterExcluded = (items) =>
    exclude && exclude.size > 0 ? items.filter((item) => !exclude.has(item.uuid)) : items;

  let pool = _filterExcluded(await getPool(biome, tier, category));

  if (pool.length > 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // --- Fallback chain when category-constrained pool is empty ---
  if (category !== null) {
    // 1) Try progressively lower tiers, keeping the category constraint
    for (let fallbackTier = tier - 1; fallbackTier >= 1; fallbackTier--) {
      pool = _filterExcluded(await getPool(biome, fallbackTier, category));
      if (pool.length > 0) {
        console.warn(
          `${MODULE_ID} | Empty ${category} pool for ${biome}/tier${tier} — fell back to tier${fallbackTier} (same category)`
        );
        return pool[Math.floor(Math.random() * pool.length)];
      }
    }

    // 2) All tiers exhausted for this category — drop constraint, use original tier
    console.warn(
      `${MODULE_ID} | No ${category} items in ANY tier for ${biome} — falling back to unconstrained tier${tier}`
    );
    pool = _filterExcluded(await getPool(biome, tier, null));
    if (pool.length > 0) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
  }

  // Nothing at all
  return null;
}

/**
 * Clear the cached pool index. Call this if compendium contents change at runtime
 * (e.g., after seedTestData or manual item edits).
 */
export function clearPoolCache() {
  poolIndex = null;
  console.log(`${MODULE_ID} | Pool cache cleared`);
}

/**
 * Debug helper — dump pool contents for a biome+tier to console.
 * Intended for `game.ultimateHarvester.testPool("coastal", 1)`.
 *
 * @param {string} biome - Environment key
 * @param {number} [tier=null] - Specific tier, or null for all tiers
 */
export async function testPool(biome, tier = null) {
  const idx = await _ensureIndex();
  const biomePool = idx[biome];

  if (!biomePool) {
    console.log(`No items indexed for biome "${biome}".`);
    console.log(`Available biomes: ${Object.keys(idx).join(", ")}`);
    return;
  }

  const tiers = tier ? [tier] : Object.keys(biomePool).map(Number).sort();

  for (const t of tiers) {
    const tierPool = biomePool[t];
    if (!tierPool) {
      console.log(`  Tier ${t}: (empty)`);
      continue;
    }

    const tierLabel = t === 4 ? "Rare" : `Tier ${t}`;
    console.log(`\n  ${biome} — ${tierLabel}:`);

    for (const [cat, items] of Object.entries(tierPool)) {
      console.log(`    ${cat} (${items.length}):`);
      for (const item of items) {
        console.log(`      - ${item.name}`);
      }
    }
  }

  // Summary
  const allItems = Object.values(biomePool).flatMap((t) => Object.values(t).flat());
  console.log(`\n  Total: ${allItems.length} item entries for "${biome}"`);
}
