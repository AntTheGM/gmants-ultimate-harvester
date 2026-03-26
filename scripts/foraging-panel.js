/**
 * Ultimate Harvester — DM Foraging Panel
 * ApplicationV2 singleton for configuring foraging environment, weather, season, and skills.
 */

import {
  MODULE_ID, SKILL_LABELS,
  FORAGING_ENVIRONMENTS, WEATHER_MODIFIERS, SEASON_MODIFIERS,
} from "./config.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ForagingPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {ForagingPanel|null} Singleton instance */
  static _instance = null;

  static get instance() {
    if (!ForagingPanel._instance) {
      ForagingPanel._instance = new ForagingPanel();
    }
    return ForagingPanel._instance;
  }

  static open() {
    ForagingPanel.instance.render(true);
  }

  static DEFAULT_OPTIONS = {
    id: "ultimate-harvester-foraging-panel",
    classes: ["ultimate-harvester"],
    window: {
      title: "MHARVEST.Panel.ForagingTitle",
      icon: "fas fa-leaf",
      resizable: false,
    },
    position: {
      width: 400,
      height: "auto",
    },
    actions: {
      save: ForagingPanel.#onSave,
    },
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/forage-panel.hbs`,
    },
  };

  async _prepareContext() {
    const config = game.settings.get(MODULE_ID, "foragingConfig") ?? {};

    const environments = Object.entries(FORAGING_ENVIRONMENTS).map(([key, env]) => ({
      key,
      label: env.label,
      selected: config.environment === key,
    }));

    const weatherOptions = Object.entries(WEATHER_MODIFIERS).map(([key, w]) => ({
      key,
      label: `${w.label} (${w.modifier >= 0 ? "+" : ""}${w.modifier})`,
      selected: config.weather === key,
    }));

    const seasonOptions = Object.entries(SEASON_MODIFIERS).map(([key, s]) => ({
      key,
      label: `${s.label} (${s.modifier >= 0 ? "+" : ""}${s.modifier})`,
      selected: config.season === key,
    }));

    const skills = Object.entries(SKILL_LABELS).map(([key, label]) => ({ key, label }));

    // Get current environment defaults
    const currentEnv = FORAGING_ENVIRONMENTS[config.environment];
    const primarySkill = config.primarySkill || currentEnv?.primary || "sur";
    const secondarySkill = config.secondarySkill || currentEnv?.secondary || "nat";

    // Calculate current effective DCs
    const baseTiers = currentEnv?.tiers ?? [12, 16, 20];
    const weatherMod = WEATHER_MODIFIERS[config.weather]?.modifier ?? 0;
    const seasonMod = SEASON_MODIFIERS[config.season]?.modifier ?? 0;
    const dmMod = config.dmModifier ?? 0;
    const totalMod = weatherMod + seasonMod + dmMod;
    const effectiveDCs = baseTiers.map((dc) => dc + totalMod);

    return {
      environments,
      weatherOptions,
      seasonOptions,
      skills,
      primarySkill,
      secondarySkill,
      dmModifier: config.dmModifier ?? 0,
      effectiveDCs,
      totalMod,
      environmentLabel: currentEnv?.label ?? "Not set",
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#injectBranding();
    this.#bindRandomize();
  }

  #bindRandomize() {
    const btns = this.element.querySelectorAll(".ultimate-harvester-randomize-btn");
    for (const btn of btns) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const targetName = btn.dataset.target;
        const select = this.element.querySelector(`select[name="${targetName}"]`);
        if (!select || select.options.length === 0) return;
        const idx = Math.floor(Math.random() * select.options.length);
        select.selectedIndex = idx;
      });
    }
  }

  #injectBranding() {
    const header = this.element.querySelector(".window-header");
    if (!header || header.querySelector(".ultimate-harvester-branding")) return;
    const brand = document.createElement("a");
    brand.className = "ultimate-harvester-branding";
    brand.textContent = "VTTools by GM Ant";
    brand.href = "https://roleplayr.com/gmant";
    brand.target = "_blank";
    brand.rel = "noopener";
    const lastChild = header.lastElementChild;
    header.insertBefore(brand, lastChild);
  }

  static async #onSave(_event, _target) {
    const form = this.element.querySelector("form");
    if (!form) return;

    const formData = new FormDataExtended(form).object;
    const config = {
      environment: formData.environment || "",
      weather: formData.weather || "clear",
      season: formData.season || "summer",
      dmModifier: parseInt(formData.dmModifier) || 0,
      primarySkill: formData.primarySkill || "",
      secondarySkill: formData.secondarySkill || "",
    };

    await game.settings.set(MODULE_ID, "foragingConfig", config);
    ui.notifications.info(`Foraging environment set to: ${FORAGING_ENVIRONMENTS[config.environment]?.label ?? config.environment}`);
  }
}
