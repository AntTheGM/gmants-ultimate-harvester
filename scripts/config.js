/**
 * Ultimate Harvester — Configuration Defaults
 * Default skill mappings, CR tier definitions, DC formula constants, and tool mappings.
 * All values can be overridden by module settings.
 */

export const MODULE_ID = "ultimate-harvester";

/**
 * Default skill mapping — distributed 6-skill system.
 * Keys are dnd5e creature types, values are dnd5e skill abbreviations.
 */
export const DEFAULT_SKILL_MAPPING = {
  aberration: "arc",
  beast: "sur",
  celestial: "rel",
  construct: "inv",
  dragon: "nat",
  elemental: "arc",
  fey: "nat",
  fiend: "rel",
  giant: "med",
  humanoid: "med",
  monstrosity: "sur",
  ooze: "inv",
  plant: "nat",
  undead: "arc",
};

/**
 * Optional secondary skills — player may choose with GM approval.
 * Only listed for creature types that have an alternative.
 */
export const SECONDARY_SKILLS = {
  beast: "ani",
  dragon: "arc",
  giant: "ath",
  construct: "slt",
  undead: "rel",
};

/**
 * Skill abbreviation → display name mapping for UI.
 */
export const SKILL_LABELS = {
  acr: "Acrobatics",
  ani: "Animal Handling",
  arc: "Arcana",
  ath: "Athletics",
  dec: "Deception",
  his: "History",
  ins: "Insight",
  itm: "Intimidation",
  inv: "Investigation",
  med: "Medicine",
  nat: "Nature",
  prc: "Perception",
  prf: "Performance",
  per: "Persuasion",
  rel: "Religion",
  slt: "Sleight of Hand",
  ste: "Stealth",
  sur: "Survival",
};

/**
 * CR tier ranges for generic table lookup.
 * Each tier maps to a label used in table naming: "{Type} CR {tierLabel} Harvest Table"
 */
export const CR_TIERS = [
  { label: "0-1", min: 0, max: 1 },
  { label: "2-4", min: 2, max: 4 },
  { label: "5-10", min: 5, max: 10 },
  { label: "11+", min: 11, max: Infinity },
];

/**
 * Get the CR tier label for a given CR value.
 * @param {number} cr - The creature's challenge rating
 * @returns {string} Tier label (e.g., "0-1", "2-4", "5-10", "11+")
 */
export function getCRTier(cr) {
  for (const tier of CR_TIERS) {
    if (cr >= tier.min && cr <= tier.max) return tier.label;
  }
  return "11+";
}

/**
 * DC formula constants.
 * Base DC = CR + baseDCOffset (default 10). Fractional CRs round up to 1.
 * Per-rarity offsets are added to base DC for individual table entries.
 */
export const DC_DEFAULTS = {
  baseDCOffset: 12,
  appraisalDCOffset: -5,
  rarityOffsets: {
    common: 0,
    uncommon: 5,
    rare: 10,
    veryRare: 15,
  },
};

/**
 * Calculate the base harvest DC for a given CR.
 * @param {number} cr - Creature CR (may be fractional: 0.125, 0.25, 0.5)
 * @param {number} [offset] - DC offset (default from settings or DC_DEFAULTS)
 * @returns {number} Base DC (minimum 11)
 */
export function calculateBaseDC(cr, offset = DC_DEFAULTS.baseDCOffset) {
  const effectiveCR = cr < 1 ? 1 : cr;
  return effectiveCR + offset;
}

/**
 * Size-based time modifiers for harvesting (in minutes).
 */
export const SIZE_TIME_MODIFIERS = {
  tiny: 0,
  sm: 0,
  med: 5,
  lg: 15,
  huge: 30,
  grg: 60,
};

/**
 * Tool-to-creature-type mapping.
 * Keys are tool item names (case-insensitive match), values are applicable creature types/categories.
 */
export const TOOL_MAPPINGS = {
  "Herbalism Kit": { types: ["plant", "beast"], categories: ["food"] },
  "Leatherworker's Tools": { types: ["beast", "dragon", "monstrosity"], categories: ["material"] },
  "Alchemist's Supplies": { types: null, categories: ["component"] },
  "Cook's Utensils": { types: null, categories: ["food"] },
  "Poisoner's Kit": { types: null, categories: ["component"] },
  "Smith's Tools": { types: ["construct"], categories: ["material"] },
};

/**
 * Item categories used in harvest tables.
 */
export const ITEM_CATEGORIES = {
  material: { label: "MHARVEST.Category.Material", icon: "fa-solid fa-cube" },
  food: { label: "MHARVEST.Category.Food", icon: "fa-solid fa-drumstick-bite" },
  component: { label: "MHARVEST.Category.Component", icon: "fa-solid fa-flask" },
  trophy: { label: "MHARVEST.Category.Trophy", icon: "fa-solid fa-trophy" },
};

/**
 * All 14 creature types recognized by the module.
 */
export const CREATURE_TYPES = [
  "aberration", "beast", "celestial", "construct", "dragon",
  "elemental", "fey", "fiend", "giant", "humanoid",
  "monstrosity", "ooze", "plant", "undead",
];

/**
 * Foraging environment definitions.
 * Each has base DCs for 3 tiers, a default primary/secondary skill.
 */
export const FORAGING_ENVIRONMENTS = {
  "light-forest": {
    label: "Light Forest", tiers: [14, 18, 22], primary: "sur", secondary: "nat",
  },
  "dense-forest": {
    label: "Dense Forest / Jungle", tiers: [12, 16, 20], primary: "sur", secondary: "nat",
  },
  "plains": {
    label: "Plains / Grassland", tiers: [14, 18, 22], primary: "sur", secondary: "nat",
  },
  "swamp": {
    label: "Swamp / Marsh", tiers: [14, 18, 22], primary: "nat", secondary: "sur",
  },
  "coastal": {
    label: "Coastal", tiers: [13, 17, 21], primary: "sur", secondary: "nat",
  },
  "desert": {
    label: "Desert / Wasteland", tiers: [19, 23, 27], primary: "sur", secondary: "nat",
  },
  "arctic": {
    label: "Arctic / Tundra", tiers: [17, 21, 25], primary: "sur", secondary: "nat",
  },
  "underground": {
    label: "Underground / Cave", tiers: [17, 21, 25], primary: "nat", secondary: "sur",
  },
  "mountain": {
    label: "Mountain", tiers: [16, 20, 24], primary: "sur", secondary: "nat",
  },
  "urban": {
    label: "Urban / Ruins", tiers: [18, 22, 26], primary: "inv", secondary: "sur",
  },
};

/**
 * Weather DC modifiers for foraging.
 */
export const WEATHER_MODIFIERS = {
  "clear": { label: "Clear / Overcast", modifier: 0 },
  "rain": { label: "Rain", modifier: -1 },
  "storm": { label: "Heavy Rain / Storm", modifier: 2 },
  "snow": { label: "Snow", modifier: 2 },
  "extreme-heat": { label: "Extreme Heat", modifier: 3 },
  "fog": { label: "Fog", modifier: 1 },
};

/**
 * Season DC modifiers for foraging.
 */
export const SEASON_MODIFIERS = {
  "spring": { label: "Spring", modifier: -1 },
  "summer": { label: "Summer", modifier: 0 },
  "autumn": { label: "Autumn", modifier: -1 },
  "winter": { label: "Winter", modifier: 3 },
};

/**
 * Format minutes as "X hours, Y minutes" or just "Y minutes" if under 60.
 * @param {number} minutes
 * @returns {string}
 */
export function formatTime(minutes) {
  if (minutes < 60) return `${minutes} minutes`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs} hour${hrs !== 1 ? "s" : ""}`;
  return `${hrs} hour${hrs !== 1 ? "s" : ""}, ${mins} minute${mins !== 1 ? "s" : ""}`;
}

/**
 * Get the harvest skill for a creature type, checking setting overrides first.
 * @param {string} creatureType - The dnd5e creature type value
 * @returns {string} Skill abbreviation
 */
export function getHarvestSkill(creatureType) {
  const overrides = game.settings.get(MODULE_ID, "skillMappingOverrides");
  if (overrides[creatureType]) return overrides[creatureType];
  return DEFAULT_SKILL_MAPPING[creatureType] ?? "sur";
}
