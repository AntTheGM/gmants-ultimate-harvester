/**
 * Ultimate Harvester — Module Entry Point
 * Hook registration, settings, and initialization.
 */

import {
  MODULE_ID,
  CREATURE_TYPES,
  SKILL_LABELS,
  DEFAULT_SKILL_MAPPING,
  SECONDARY_SKILLS,
  formatTime,
} from "./config.js";
import { initSocket } from "./socket.js";
import { initiateHarvest, viewAppraisal } from "./harvesting.js";
import { initiateForage } from "./foraging.js";
import { ForagingPanel } from "./foraging-panel.js";
import { seedTestData } from "./test-data.js";

/* ---------------------------------------- */
/*  Settings Registration                    */
/* ---------------------------------------- */

function registerSettings() {
  // --- Harvesting Settings ---

  game.settings.register(MODULE_ID, "showPickupDialog", {
    name: "MHARVEST.Settings.ShowPickupDialog",
    hint: "MHARVEST.Settings.ShowPickupDialogHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "appraisalEnabled", {
    name: "MHARVEST.Settings.AppraisalEnabled",
    hint: "MHARVEST.Settings.AppraisalEnabledHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "appraisalDCOffset", {
    name: "MHARVEST.Settings.AppraisalDCOffset",
    hint: "MHARVEST.Settings.AppraisalDCOffsetHint",
    scope: "world",
    config: true,
    type: Number,
    default: -5,
    range: {
      min: -10,
      max: 0,
      step: 1,
    },
  });

  game.settings.register(MODULE_ID, "baseDCOffset", {
    name: "MHARVEST.Settings.BaseDCOffset",
    hint: "MHARVEST.Settings.BaseDCOffsetHint",
    scope: "world",
    config: true,
    type: Number,
    default: 12,
    range: {
      min: 5,
      max: 15,
      step: 1,
    },
  });

  game.settings.register(MODULE_ID, "critFailEnabled", {
    name: "MHARVEST.Settings.CritFailEnabled",
    hint: "MHARVEST.Settings.CritFailEnabledHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "allowHumanoidHarvesting", {
    name: "MHARVEST.Settings.AllowHumanoidHarvesting",
    hint: "MHARVEST.Settings.AllowHumanoidHarvestingHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, "valueMultiplier", {
    name: "MHARVEST.Settings.ValueMultiplier",
    hint: "MHARVEST.Settings.ValueMultiplierHint",
    scope: "world",
    config: true,
    type: Number,
    default: 0.5,
    range: {
      min: 0.1,
      max: 5.0,
      step: 0.1,
    },
  });

  // --- Foraging Settings ---

  game.settings.register(MODULE_ID, "foragingBaseDC", {
    name: "MHARVEST.Settings.ForagingBaseDC",
    hint: "MHARVEST.Settings.ForagingBaseDCHint",
    scope: "world",
    config: true,
    type: Number,
    default: 12,
    range: {
      min: 5,
      max: 20,
      step: 1,
    },
  });

  // --- Hidden / Internal Settings ---

  game.settings.register(MODULE_ID, "skillMappingOverrides", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  game.settings.register(MODULE_ID, "foragingConfig", {
    scope: "world",
    config: false,
    type: Object,
    default: {
      environment: "",
      weather: "clear",
      season: "summer",
      dmModifier: 0,
      primarySkill: "",
      secondarySkill: "",
    },
  });

  // --- Skill Mapping Submenu ---

  game.settings.registerMenu(MODULE_ID, "skillMappingMenu", {
    name: "MHARVEST.Settings.SkillMappingMenu",
    label: "MHARVEST.Settings.SkillMappingMenuLabel",
    hint: "MHARVEST.Settings.SkillMappingMenuHint",
    icon: "fas fa-cogs",
    type: SkillMappingConfig,
    restricted: true,
  });
}

/* ---------------------------------------- */
/*  Skill Mapping Config (Submenu Form)      */
/* ---------------------------------------- */

class SkillMappingConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "ultimate-harvester-skill-mapping",
      title: game.i18n.localize("MHARVEST.Settings.SkillMappingMenu"),
      template: `modules/${MODULE_ID}/templates/skill-mapping-config.hbs`,
      width: 480,
      height: "auto",
    });
  }

  getData() {
    const overrides = game.settings.get(MODULE_ID, "skillMappingOverrides");
    const { DEFAULT_SKILL_MAPPING } = CONFIG.ULTIMATE_HARVESTER;
    const types = CREATURE_TYPES.map((type) => ({
      type,
      label: game.i18n.localize(`MHARVEST.CreatureType.${type.charAt(0).toUpperCase() + type.slice(1)}`),
      currentSkill: overrides[type] || DEFAULT_SKILL_MAPPING[type],
      defaultSkill: DEFAULT_SKILL_MAPPING[type],
    }));
    const skills = Object.entries(SKILL_LABELS).map(([key, label]) => ({ key, label }));
    return { types, skills };
  }

  async _updateObject(_event, formData) {
    const overrides = {};
    const { DEFAULT_SKILL_MAPPING } = CONFIG.ULTIMATE_HARVESTER;
    for (const type of CREATURE_TYPES) {
      const value = formData[type];
      if (value && value !== DEFAULT_SKILL_MAPPING[type]) {
        overrides[type] = value;
      }
    }
    await game.settings.set(MODULE_ID, "skillMappingOverrides", overrides);
  }
}

/* ---------------------------------------- */
/*  VTTools Branding                         */
/* ---------------------------------------- */

function injectSettingsPromo(app, html) {
  const tab = html[0]?.querySelector?.(`.tab[data-tab="${MODULE_ID}"]`)
    ?? html.querySelector?.(`.tab[data-tab="${MODULE_ID}"]`);
  if (!tab || tab.querySelector(".ultimate-harvester-settings-promo")) return;
  const note = document.createElement("p");
  note.className = "ultimate-harvester-settings-promo";
  note.style.cssText = "text-align:center; font-style:italic; opacity:0.6; font-size:0.8rem; margin-top:0.5rem;";
  note.innerHTML = `Visit <a href="https://roleplayr.com/gmant" target="_blank" rel="noopener">roleplayr.com/gmant</a> for updates, more virtual tabletop tools, and online RPG tools.`;
  tab.appendChild(note);
}

/* ---------------------------------------- */
/*  Initialization Hooks                     */
/* ---------------------------------------- */

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing Ultimate Harvester`);

  // Expose config and API on global CONFIG for other modules/macros
  CONFIG.ULTIMATE_HARVESTER = {
    DEFAULT_SKILL_MAPPING,
    SECONDARY_SKILLS,
  };

  // Expose public API for macro use
  game.ultimateHarvester = {
    harvest: initiateHarvest,
    forage: initiateForage,
    openForagingPanel: () => ForagingPanel.open(),
    viewAppraisal,
    seedTestData,
    listIcons: _listIcons,
  };

  // Register Handlebars helper for time formatting
  Handlebars.registerHelper("formatTime", (minutes) => formatTime(minutes));

  registerSettings();
  initSocket();
});

Hooks.once("ready", async () => {
  console.log(`${MODULE_ID} | Ready`);
  await _seedMacro();
});

Hooks.on("renderSettingsConfig", injectSettingsPromo);

// Scene control button for DM Foraging Panel (GM only)
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;
  const tokenControls = controls.tokens ?? controls.token;
  if (!tokenControls) return;
  const tools = tokenControls.tools ?? {};
  tools.ultimateHarvesterForaging = {
    name: "ultimateHarvesterForaging",
    title: "Foraging Panel",
    icon: "fas fa-leaf",
    button: true,
    onClick: () => ForagingPanel.open(),
    visible: true,
  };
  if (!tokenControls.tools) tokenControls.tools = tools;
});

// Token visual indicators for harvest state
Hooks.on("refreshToken", (token) => {
  if (!token.actor) return;
  const harvested = token.actor.getFlag(MODULE_ID, "harvested");
  const availableItems = token.actor.getFlag(MODULE_ID, "availableItems");
  const iconContainer = token.children?.find((c) => c.name === "ultimate-harvester-indicator");

  // Remove existing indicator
  if (iconContainer) {
    token.removeChild(iconContainer);
  }

  if (!harvested && !availableItems?.length) return;
  if (token.actor.system.attributes?.hp?.value > 0) return;

  // Create indicator
  const size = token.w * 0.25;
  const container = new PIXI.Container();
  container.name = "ultimate-harvester-indicator";
  container.position.set(token.w - size - 2, 2);

  const bg = new PIXI.Graphics();
  bg.beginFill(0x000000, 0.6);
  bg.drawRoundedRect(0, 0, size, size, 3);
  bg.endFill();
  container.addChild(bg);

  const text = new PIXI.Text(
    harvested === true ? "\u2714" : harvested === "ruined" ? "\u2718" : "\u25CF",
    {
      fontSize: size * 0.7,
      fill: harvested === true ? 0x3a6e3a : harvested === "ruined" ? 0x8b3a3a : 0xc99700,
      fontWeight: "bold",
      align: "center",
    }
  );
  text.anchor.set(0.5);
  text.position.set(size / 2, size / 2);
  container.addChild(text);

  token.addChild(container);
});

// GM right-click context menu for tokens
Hooks.on("getTokenActionButtons", (token, buttons) => {
  if (!game.user.isGM) return;
  if (!token.actor || token.actor.type !== "npc") return;

  // Only show for dead creatures
  if (token.actor.system.attributes?.hp?.value > 0) return;

  buttons.push({
    label: "Assign Harvest Table",
    icon: "fa-solid fa-table-list",
    callback: () => _assignHarvestTable(token.actor),
  });

  const harvested = token.actor.getFlag(MODULE_ID, "harvested");
  const availableItems = token.actor.getFlag(MODULE_ID, "availableItems");
  if (harvested || availableItems) {
    buttons.push({
      label: "Reset Harvest",
      icon: "fa-solid fa-rotate-left",
      callback: () => _resetHarvest(token.actor),
    });
  }
});

async function _assignHarvestTable(actor) {
  // Simple prompt for table UUID — Phase 7 will add a proper compendium picker
  const content = `<div class="ultimate-harvester-form">
    <p>Enter the UUID of a RollTable to assign to <strong>${actor.name}</strong>:</p>
    <p class="ultimate-harvester-note">Browse compendiums for a table UUID, or leave blank to clear the override.</p>
    <input type="text" name="tableUuid" value="${actor.getFlag(MODULE_ID, "harvestTable") ?? ""}" placeholder="Compendium.ultimate-harvester.harvest-tables.xxxxxx" />
  </div>`;

  new Dialog({
    title: `Assign Harvest Table — ${actor.name}`,
    content,
    buttons: {
      save: {
        label: "Save",
        icon: '<i class="fas fa-save"></i>',
        callback: async (html) => {
          const uuid = html.find("input[name='tableUuid']").val()?.trim();
          if (uuid) {
            await actor.setFlag(MODULE_ID, "harvestTable", uuid);
            ui.notifications.info(`Harvest table assigned to ${actor.name}`);
          } else {
            await actor.unsetFlag(MODULE_ID, "harvestTable");
            ui.notifications.info(`Harvest table override cleared for ${actor.name}`);
          }
        },
      },
      cancel: {
        label: "Cancel",
        icon: '<i class="fas fa-times"></i>',
      },
    },
    default: "save",
  }).render(true);
}

async function _resetHarvest(actor) {
  const flags = ["harvested", "availableItems", "harvestingBy", "appraisalSuccess",
    "appraisalAttempts", "appraisalBonus", "appraisalDisadvantage", "appraisalData",
    "maxRetryDC", "harvestOffered"];

  for (const flag of flags) {
    try { await actor.unsetFlag(MODULE_ID, flag); } catch { /* ignore */ }
  }
  ui.notifications.info(`Harvest state reset for ${actor.name}`);
}

// Chat link handler — "View Appraisal" links in chat cards
Hooks.on("renderChatMessage", (_message, html) => {
  const el = html instanceof HTMLElement ? html : html[0];
  if (!el) return;
  const link = el.querySelector(".ultimate-harvester-view-link[data-action='viewAppraisal']");
  if (!link) return;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const creatureUuid = link.dataset.creatureUuid;
    if (creatureUuid) viewAppraisal(creatureUuid);
  });
});

/* ---------------------------------------- */
/*  Macro Seeding                            */
/* ---------------------------------------- */

/* ---------------------------------------- */
/*  Icon Lister                              */
/* ---------------------------------------- */

async function _listIcons() {
  const dirs = [
    "icons/commodities", "icons/consumables", "icons/containers",
    "icons/creatures", "icons/environment", "icons/equipment",
    "icons/magic", "icons/skills", "icons/sundries",
    "icons/svg", "icons/tools", "icons/weapons",
  ];

  const allIcons = [];
  ui.notifications.info("Scanning icons... this may take a moment.");

  async function crawl(dir) {
    try {
      const result = await FilePicker.browse("public", dir);
      for (const file of result.files) allIcons.push(file);
      for (const subdir of result.dirs) await crawl(subdir);
    } catch { /* skip inaccessible dirs */ }
  }

  for (const d of dirs) await crawl(d);

  console.log(`Found ${allIcons.length} icons:\n${allIcons.join("\n")}`);

  try {
    await navigator.clipboard.writeText(allIcons.join("\n"));
    ui.notifications.info(`${allIcons.length} icon paths copied to clipboard!`);
  } catch {
    ui.notifications.info(`${allIcons.length} icons found — check the F12 console (clipboard access denied).`);
  }

  return allIcons;
}

/* ---------------------------------------- */
/*  Macro Seeding                            */
/* ---------------------------------------- */

const MACRO_SEED_VERSION = 2;

const MACROS_TO_SEED = [
  {
    name: "Harvest",
    img: "icons/tools/cooking/knife-chef-steel-brown.webp",
    command: "game.ultimateHarvester.harvest();",
  },
  {
    name: "Forage",
    img: "icons/consumables/food/berries-holly-702419.webp",
    command: "game.ultimateHarvester.forage();",
  },
];

async function _seedMacro() {
  if (!game.user.isGM) return;

  const packId = `${MODULE_ID}.ultimate-harvester-macros`;
  const pack = game.packs.get(packId);
  if (!pack) return;

  const wasLocked = pack.locked;
  if (wasLocked) await pack.configure({ locked: false });

  const index = await pack.getIndex();

  for (const macroDef of MACROS_TO_SEED) {
    const existing = index.find((e) => e.name === macroDef.name);

    if (existing) {
      const doc = await pack.getDocument(existing._id);
      const currentVersion = doc.getFlag(MODULE_ID, "seedVersion") ?? 0;
      if (currentVersion >= MACRO_SEED_VERSION) continue;
      await doc.delete();
      console.log(`${MODULE_ID} | Re-seeding ${macroDef.name} macro (v${currentVersion} → v${MACRO_SEED_VERSION})`);
    }

    await Macro.create(
      {
        name: macroDef.name,
        type: "script",
        img: macroDef.img,
        command: macroDef.command,
        flags: { [MODULE_ID]: { core: true, seedVersion: MACRO_SEED_VERSION } },
      },
      { pack: packId }
    );
    console.log(`${MODULE_ID} | Seeded ${macroDef.name} macro into compendium`);
  }

  if (wasLocked) await pack.configure({ locked: true });
}
