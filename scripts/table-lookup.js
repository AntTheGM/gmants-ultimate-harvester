/**
 * Ultimate Harvester — Table Lookup
 * Layered fallback system to find the right harvest table for any creature.
 */

import { MODULE_ID, getCRTier } from "./config.js";

/** Cached compendium indexes (populated on first lookup). */
let harvestTablesIndex = null;
let genericTablesIndex = null;

/**
 * Clear cached indexes (call if compendium contents change at runtime).
 */
export function clearTableCache() {
  harvestTablesIndex = null;
  genericTablesIndex = null;
}

/**
 * Find the harvest table for a creature actor using layered fallback.
 *
 * Priority 1: Actor flag override (GM-assigned table UUID)
 * Priority 2: Exact name match in harvest-tables compendium
 * Priority 3: Normalized name match (strip prefixes like Young/Adult/Ancient)
 * Priority 4: Generic type+CR table from generic-tables compendium
 * Priority 5: Not found
 *
 * @param {Actor} creature - The NPC actor to look up
 * @returns {Promise<{table: RollTable|null, source: string}>}
 */
export async function findHarvestTable(creature) {
  // Priority 1: Actor flag override
  const flagUuid = creature.getFlag(MODULE_ID, "harvestTable");
  if (flagUuid) {
    const table = await fromUuid(flagUuid);
    if (table) return { table, source: "flag" };
  }

  // Priority 2: Exact name match
  const exactName = `${creature.name} Harvest Table`;
  const harvestIndex = await _getHarvestTablesIndex();
  if (harvestIndex) {
    const exact = harvestIndex.find((e) => e.name === exactName);
    if (exact) {
      const pack = game.packs.get(`${MODULE_ID}.harvest-tables`);
      const table = await pack.getDocument(exact._id);
      return { table, source: "exact" };
    }
  }

  // Priority 3: Normalized name match
  const normalized = _normalizeName(creature.name);
  if (normalized !== creature.name && harvestIndex) {
    const normalizedTableName = `${normalized} Harvest Table`;
    const match = harvestIndex.find((e) => e.name === normalizedTableName);
    if (match) {
      const pack = game.packs.get(`${MODULE_ID}.harvest-tables`);
      const table = await pack.getDocument(match._id);
      return { table, source: "normalized" };
    }
  }

  // Priority 4: Generic type+CR table
  const creatureType = creature.system.details?.type?.value;
  const cr = creature.system.details?.cr;
  if (creatureType && cr !== undefined) {
    const tier = getCRTier(cr);
    const genericName = `${_capitalize(creatureType)} CR ${tier} Harvest Table`;
    const genericIndex = await _getGenericTablesIndex();
    if (genericIndex) {
      const match = genericIndex.find((e) => e.name === genericName);
      if (match) {
        const pack = game.packs.get(`${MODULE_ID}.generic-tables`);
        const table = await pack.getDocument(match._id);
        return { table, source: "generic" };
      }
    }
  }

  // Priority 5: Not found
  return { table: null, source: "none" };
}

/* ---- Private Helpers ---- */

/** Prefixes to strip for normalized name matching. */
const STRIP_PREFIXES = ["Young", "Adult", "Ancient", "Elder", "Greater", "Lesser"];

/**
 * Normalize a creature name by stripping common prefixes/suffixes.
 * "Young White Dragon" → "White Dragon"
 * "White Dragon, Young" → "White Dragon"
 * @param {string} name
 * @returns {string}
 */
function _normalizeName(name) {
  let normalized = name;
  // Strip leading prefixes: "Young White Dragon" → "White Dragon"
  for (const prefix of STRIP_PREFIXES) {
    const re = new RegExp(`^${prefix}\\s+`, "i");
    normalized = normalized.replace(re, "");
  }
  // Strip trailing suffixes: "White Dragon, Young" → "White Dragon"
  normalized = normalized.replace(/,\s*(Young|Adult|Ancient|Elder|Greater|Lesser)$/i, "");
  return normalized.trim();
}

function _capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function _getHarvestTablesIndex() {
  if (harvestTablesIndex) return harvestTablesIndex;
  const pack = game.packs.get(`${MODULE_ID}.harvest-tables`);
  if (!pack) return null;
  harvestTablesIndex = await pack.getIndex();
  return harvestTablesIndex;
}

async function _getGenericTablesIndex() {
  if (genericTablesIndex) return genericTablesIndex;
  const pack = game.packs.get(`${MODULE_ID}.generic-tables`);
  if (!pack) return null;
  genericTablesIndex = await pack.getIndex();
  return genericTablesIndex;
}
