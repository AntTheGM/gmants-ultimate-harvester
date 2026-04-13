/**
 * Ultimate Harvester — Failure Event Configuration Dialog
 * ApplicationV2 form for editing the flags on a Foraging Failure Events table result.
 * Opened via a "Configure" button injected into the RollTable sheet.
 */

import { MODULE_ID } from "./config.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FailureEventConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {TableResult} The table result document being configured */
  #result;

  constructor(result) {
    super();
    this.#result = result;
  }

  static DEFAULT_OPTIONS = {
    id: "ultimate-harvester-failure-event-config",
    classes: ["ultimate-harvester"],
    window: {
      title: "MHARVEST.FailureConfig.Title",
      icon: "fas fa-exclamation-triangle",
      resizable: false,
    },
    position: {
      width: 520,
      height: "auto",
    },
    actions: {
      save: FailureEventConfig.#onSave,
      addChange: FailureEventConfig.#onAddChange,
      removeChange: FailureEventConfig.#onRemoveChange,
    },
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/failure-event-config.hbs`,
    },
  };

  get title() {
    return `Configure: ${this.#result.text || "Failure Event"}`;
  }

  async _prepareContext() {
    const flags = this.#result.flags?.[MODULE_ID] ?? {};

    const autoOptions = [
      { value: "none", label: "None (chat message only)" },
      { value: "damage", label: "Apply damage" },
      { value: "exhaustion", label: "Apply exhaustion" },
      { value: "ammo", label: "Halve ammunition" },
      { value: "effect", label: "Apply ActiveEffect" },
      { value: "damage+effect", label: "Damage + ActiveEffect" },
    ];

    // Mode constants for the changes dropdown
    const modeOptions = [
      { value: 0, label: "Custom" },
      { value: 1, label: "Multiply" },
      { value: 2, label: "Add" },
      { value: 3, label: "Downgrade" },
      { value: 4, label: "Upgrade" },
      { value: 5, label: "Override" },
    ];

    const effectChanges = (flags.effectChanges ?? []).map((c, idx) => ({
      ...c,
      idx,
    }));

    return {
      resultName: this.#result.text,
      icon: flags.icon ?? "fas fa-exclamation-triangle",
      description: flags.description ?? "",
      auto: flags.auto ?? "none",
      autoOptions: autoOptions.map((o) => ({
        ...o,
        selected: o.value === (flags.auto ?? "none"),
      })),
      damageFormula: flags.damageFormula ?? "",
      damageType: flags.damageType ?? "",
      spoilFormula: flags.spoilFormula ?? "",
      effectName: flags.effectName ?? "",
      effectIcon: flags.effectIcon ?? "",
      effectDurationHours: flags.effectDurationHours ?? 24,
      effectDescription: flags.effectDescription ?? "",
      effectChanges,
      modeOptions,
      showDamage: ["damage", "damage+effect"].includes(flags.auto),
      showSpoil: flags.spoilFormula?.length > 0,
      showEffect: ["effect", "damage+effect"].includes(flags.auto),
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#injectBranding();

    // Toggle sections based on auto type selection
    const autoSelect = this.element.querySelector("select[name='auto']");
    if (autoSelect) {
      autoSelect.addEventListener("change", () => this.#toggleSections());
      this.#toggleSections();
    }
  }

  #toggleSections() {
    const auto = this.element.querySelector("select[name='auto']")?.value ?? "none";
    const damageSection = this.element.querySelector("[data-section='damage']");
    const effectSection = this.element.querySelector("[data-section='effect']");
    if (damageSection) damageSection.style.display = ["damage", "damage+effect"].includes(auto) ? "" : "none";
    if (effectSection) effectSection.style.display = ["effect", "damage+effect"].includes(auto) ? "" : "none";
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

    const fd = new FormDataExtended(form).object;

    // Gather effect changes from indexed fields
    const effectChanges = [];
    let idx = 0;
    while (fd[`changeKey_${idx}`] !== undefined) {
      const key = fd[`changeKey_${idx}`]?.trim();
      if (key) {
        effectChanges.push({
          key,
          mode: parseInt(fd[`changeMode_${idx}`]) || 2,
          value: fd[`changeValue_${idx}`] ?? "",
        });
      }
      idx++;
    }

    const flagData = {
      failureEvent: true,
      eventId: fd.eventId || this.#result.flags?.[MODULE_ID]?.eventId || this.#result.text.toLowerCase().replace(/\s+/g, "-"),
      icon: fd.icon || "fas fa-exclamation-triangle",
      description: fd.description || "",
      auto: fd.auto || "none",
    };

    // Conditional fields based on auto type
    if (["damage", "damage+effect"].includes(fd.auto)) {
      flagData.damageFormula = fd.damageFormula || "";
      flagData.damageType = fd.damageType || "";
    }

    if (fd.spoilFormula) {
      flagData.spoilFormula = fd.spoilFormula;
    }

    if (["effect", "damage+effect"].includes(fd.auto)) {
      flagData.effectName = fd.effectName || "";
      flagData.effectIcon = fd.effectIcon || "";
      flagData.effectDurationHours = parseInt(fd.effectDurationHours) || 24;
      flagData.effectDescription = fd.effectDescription || "";
      flagData.effectChanges = effectChanges;
    }

    // Update the result's flags
    await this.#result.update({
      [`flags.${MODULE_ID}`]: flagData,
    });

    ui.notifications.info(`Configured failure event: ${this.#result.text}`);
    this.close();
  }

  static async #onAddChange(_event, _target) {
    // Re-render with an extra empty change row
    const form = this.element.querySelector("form");
    const container = form?.querySelector(".ultimate-harvester-changes-list");
    if (!container) return;

    const idx = container.querySelectorAll(".ultimate-harvester-change-row").length;
    const row = document.createElement("div");
    row.className = "ultimate-harvester-change-row";
    row.innerHTML = `
      <input type="text" name="changeKey_${idx}" placeholder="system.attributes.movement.walk" />
      <select name="changeMode_${idx}">
        <option value="0">Custom</option>
        <option value="1">Multiply</option>
        <option value="2" selected>Add</option>
        <option value="3">Downgrade</option>
        <option value="4">Upgrade</option>
        <option value="5">Override</option>
      </select>
      <input type="text" name="changeValue_${idx}" placeholder="-10" />
      <button type="button" data-action="removeChange" data-idx="${idx}" title="Remove"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
  }

  static async #onRemoveChange(_event, target) {
    const row = target.closest(".ultimate-harvester-change-row");
    if (row) row.remove();
  }
}

/**
 * Hook into RollTable sheet rendering to inject Configure buttons
 * on tables flagged as isFailureTable.
 */
export function registerTableSheetHook() {
  // ApplicationV2 sheets (Foundry v13+)
  Hooks.on("renderRollTableConfig", (app, html) => {
    const table = app.document ?? app.object;
    if (!table) return;

    const isFailureTable = table.getFlag(MODULE_ID, "isFailureTable");
    if (!isFailureTable) return;

    const el = html instanceof HTMLElement ? html : html[0];
    if (!el) return;

    // Find result rows and add configure buttons
    const resultRows = el.querySelectorAll(".table-result, .result, li.table-result, [data-result-id]");
    for (const row of resultRows) {
      if (row.querySelector(".ultimate-harvester-configure-btn")) continue;

      const resultId = row.dataset.resultId
        ?? row.querySelector("[data-result-id]")?.dataset.resultId
        ?? _extractResultId(row, table);
      if (!resultId) continue;

      const controls = row.querySelector(".result-controls, .table-result-controls")
        ?? row.querySelector("td:last-child, .controls");
      if (!controls) continue;

      const btn = document.createElement("a");
      btn.className = "ultimate-harvester-configure-btn";
      btn.title = "Configure Failure Event";
      btn.innerHTML = '<i class="fas fa-cog"></i>';
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const result = table.results.get(resultId);
        if (result) {
          new FailureEventConfig(result).render(true);
        } else {
          ui.notifications.warn("Could not find table result.");
        }
      });

      controls.prepend(btn);
    }

    // Add a header note
    const header = el.querySelector(".window-content > form, .window-content");
    if (header && !header.querySelector(".ultimate-harvester-failure-note")) {
      const note = document.createElement("p");
      note.className = "ultimate-harvester-failure-note";
      note.innerHTML = '<i class="fas fa-info-circle"></i> Click <i class="fas fa-cog"></i> on each row to configure the mechanical effect (damage, debuffs, etc.)';
      note.style.cssText = "padding: 0.25rem 0.5rem; font-size: 0.8rem; opacity: 0.7; font-style: italic; margin: 0;";
      header.prepend(note);
    }
  });
}

/**
 * Try to extract a result ID from a table row element.
 */
function _extractResultId(row, table) {
  // Try matching by result text content
  const textEl = row.querySelector(".result-text, .result-details input, input[name]");
  if (textEl) {
    const text = textEl.value ?? textEl.textContent?.trim();
    if (text) {
      const match = table.results.find((r) => r.text === text);
      if (match) return match.id;
    }
  }
  return null;
}
