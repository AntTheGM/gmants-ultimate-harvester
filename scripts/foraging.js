/**
 * Ultimate Harvester — Foraging Workflow Engine
 * Hybrid mechanic: Survival DC check, then d20 table roll with margin-of-success bonus.
 */

import {
  MODULE_ID, SKILL_LABELS, ITEM_CATEGORIES,
  FORAGING_ENVIRONMENTS, WEATHER_MODIFIERS, SEASON_MODIFIERS,
  formatTime,
} from "./config.js";
import { gmCreateEmbeddedDocuments, gmSetFlag } from "./socket.js";
import { showDialog } from "./dialog-helper.js";

/**
 * Main entry point — called from the Forage macro.
 */
export async function initiateForage() {
  const forager = canvas.tokens?.controlled?.[0]?.actor;
  if (!forager) {
    return ui.notifications.warn("Select your token first, then click Forage.");
  }

  // Read DM foraging config from world settings
  const config = game.settings.get(MODULE_ID, "foragingConfig");
  if (!config?.environment) {
    return ui.notifications.warn("No foraging environment set. The GM must configure the Foraging Panel first.");
  }

  const envDef = FORAGING_ENVIRONMENTS[config.environment];
  if (!envDef) {
    return ui.notifications.warn(`Unknown environment: ${config.environment}`);
  }

  const weatherMod = WEATHER_MODIFIERS[config.weather]?.modifier ?? 0;
  const seasonMod = SEASON_MODIFIERS[config.season]?.modifier ?? 0;
  const dmMod = config.dmModifier ?? 0;
  const primarySkill = config.primarySkill || envDef.primary;
  const secondarySkill = config.secondarySkill || envDef.secondary;
  const primaryLabel = SKILL_LABELS[primarySkill] ?? primarySkill;
  const secondaryLabel = SKILL_LABELS[secondarySkill] ?? secondarySkill;

  // Calculate adjusted DCs for each tier
  const totalMod = weatherMod + seasonMod + dmMod;
  const tierDCs = envDef.tiers.map((dc) => dc + totalMod);

  // Show hours prompt
  const hours = await _showForagePrompt(forager, envDef, primaryLabel, secondaryLabel, tierDCs);
  if (!hours) return;

  // Adjust DCs for extra hours (each hour after first reduces DC by 1)
  const hourReduction = Math.max(0, hours - 1);
  const adjustedDCs = tierDCs.map((dc) => dc - hourReduction);

  // Post chat message
  const timeSpent = hours * 60; // minutes
  await ChatMessage.create({
    content: `<div class="ultimate-harvester-card"><p><strong>${forager.name}</strong> spends ${hours} hour(s) foraging in the ${envDef.label}.</p></div>`,
    speaker: ChatMessage.getSpeaker({ actor: forager }),
  });

  // Roll skill check
  const rollResult = await _rollForageCheck(forager, primarySkill);
  if (!rollResult) return;

  const { total, isNat20 } = rollResult;

  // Apply margin-of-success bonus: +1 to table roll per 5 above lowest DC
  const marginBonus = Math.floor(Math.max(0, total - adjustedDCs[0]) / 5);

  // Determine highest qualifying tier (NOT cumulative)
  // Determine which tiers are qualified (cumulative — all tiers up to and including highest)
  const qualifiedTiers = [];
  for (let i = 0; i < adjustedDCs.length; i++) {
    if (total >= adjustedDCs[i]) qualifiedTiers.push(i);
  }
  if (isNat20) qualifiedTiers.push(3); // Nat 20 = Rare tier

  if (qualifiedTiers.length === 0) {
    // Check for failure event trigger
    const failMargin = adjustedDCs[0] - total;
    const isNat1 = rollResult.d20 === 1;
    const failureEvent = await _checkFailureEvent(forager, isNat1, failMargin, config);

    let failureHtml = "";
    if (failureEvent) {
      failureHtml = `
        <div class="ultimate-harvester-failure-event">
          <p class="ultimate-harvester-failure-header"><i class="${failureEvent.icon} ultimate-harvester-icon--danger"></i> <strong>${failureEvent.label}</strong></p>
          <p>${failureEvent.resolvedDescription}</p>
        </div>`;
    }

    await ChatMessage.create({
      content: `<div class="ultimate-harvester-card">
        <p class="ultimate-harvester-time-banner"><i class="fas fa-clock ultimate-harvester-icon--time"></i> <strong>Time spent: ${formatTime(timeSpent)}</strong></p>
        <p><strong>${forager.name}</strong> ${game.i18n.localize("MHARVEST.Notification.ForagingNothing")} (rolled ${total}, needed ${adjustedDCs[0]})</p>
        ${failureHtml}
        <p class="ultimate-harvester-note"><i class="fas fa-eye ultimate-harvester-icon--warning"></i> ${game.i18n.localize("MHARVEST.Chat.ThreatReminder")}</p>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: forager }),
    });
    return;
  }

  const pack = game.packs.get(`${MODULE_ID}.foraging-tables`);
  if (!pack) {
    return ui.notifications.warn("Foraging tables compendium not found.");
  }
  const index = await pack.getIndex();

  // Roll on ALL qualifying tier tables and collect items from each
  const tierNames = ["Tier 1", "Tier 2", "Tier 3", "Rare"];
  let foragedItems = [];
  const highestTier = qualifiedTiers[qualifiedTiers.length - 1];

  for (const tierIdx of qualifiedTiers) {
    const tierLabel = tierNames[tierIdx] ?? "Tier 1";
    const tableName = `${envDef.label} - ${tierLabel} Foraging Table`;
    const entry = index.find((e) => e.name === tableName);

    if (!entry) {
      console.warn(`${MODULE_ID} | Foraging table not found: ${tableName}`);
      continue;
    }

    const table = await pack.getDocument(entry._id);
    const tableRoll = await new Roll(`1d6 + ${marginBonus}`).evaluate();
    const draw = await table.draw({ displayChat: false, roll: tableRoll });

    if (draw.results.length > 0) {
      const result = draw.results[0];
      const flags = result.flags?.[MODULE_ID] ?? {};
      const itemUuid = flags.itemUuid;

      if (itemUuid) {
        const quantityFormula = flags.quantity || "1";
        const quantityRoll = await new Roll(quantityFormula).evaluate();

        let description = "";
        try {
          const sourceItem = await fromUuid(itemUuid);
          if (sourceItem) {
            const div = document.createElement("div");
            div.innerHTML = sourceItem.system.description?.value ?? "";
            description = div.textContent?.trim() ?? "";
          }
        } catch { /* ignore */ }

        foragedItems.push({
          name: result.text,
          uuid: itemUuid,
          quantity: quantityRoll.total,
          category: flags.category ?? "food",
          description,
          tierLabel,
        });
      }
    }
  }

  // Show pickup dialog if items were found
  const tierDescriptions = ["Basic finds", "Successful forage", "Bountiful haul", "Rare discovery!"];
  const tierDesc = tierDescriptions[highestTier];

  if (foragedItems.length > 0 && game.settings.get(MODULE_ID, "showPickupDialog")) {
    const pickupContent = await renderTemplate(`modules/${MODULE_ID}/templates/harvest-pickup.hbs`, {
      creatureName: `${envDef.label} — ${tierDesc}`,
      items: foragedItems.map((item, idx) => ({
        ...item,
        idx,
        categoryIcon: ITEM_CATEGORIES[item.category]?.icon ?? "fa-solid fa-leaf",
        categoryLabel: game.i18n.localize(ITEM_CATEGORIES[item.category]?.label ?? "MHARVEST.Category.Food"),
        dc: "",
      })),
      rollTotal: total,
      skillLabel: primaryLabel,
      timeElapsed: timeSpent,
    });

    const selected = await showDialog({
      title: game.i18n.localize("MHARVEST.Dialog.ForageTitle"),
      content: pickupContent,
      buttons: {
        take: {
          label: game.i18n.localize("MHARVEST.Dialog.TakeSelected"),
          icon: "fas fa-hand-holding",
          callback: (el) => {
            const items = [];
            el.querySelectorAll("input[type=checkbox]:checked").forEach((cb) => {
              const idx = parseInt(cb.dataset.idx);
              if (!isNaN(idx) && foragedItems[idx]) items.push(foragedItems[idx]);
            });
            return items;
          },
        },
        leave: {
          label: game.i18n.localize("MHARVEST.Dialog.LeaveAll"),
          icon: "fas fa-times",
          callback: () => null,
        },
      },
      defaultButton: "take",
    });

    if (selected && selected.length > 0) {
      await _awardForagedItems(forager, selected);
      foragedItems = selected;
    } else {
      foragedItems = [];
    }
  } else if (foragedItems.length > 0) {
    // No pickup dialog — award directly
    await _awardForagedItems(forager, foragedItems);
  }

  // Post results to chat
  const itemListHtml = foragedItems.length > 0
    ? foragedItems.map((i) => {
        const icon = ITEM_CATEGORIES[i.category]?.icon ?? "fa-solid fa-leaf";
        return `<li><i class="${icon} ultimate-harvester-icon--${i.category}"></i> <strong>${i.name}</strong> &times;${i.quantity}</li>`;
      }).join("")
    : `<li><em>${resultText || "Nothing taken"}</em></li>`;

  const content = `<div class="ultimate-harvester-card">
    <p class="ultimate-harvester-time-banner"><i class="fas fa-clock ultimate-harvester-icon--time"></i> <strong>Time spent: ${formatTime(timeSpent)}</strong></p>
    <h3>${game.i18n.localize("MHARVEST.Chat.ForagingResults")}</h3>
    <p><strong>${forager.name}</strong> foraged in the ${envDef.label} (rolled ${total}, ${primaryLabel}${marginBonus > 0 ? `, +${marginBonus} table bonus` : ""})</p>
    <p><strong>${tierDesc}:</strong></p>
    <ul class="ultimate-harvester-item-list">${itemListHtml}</ul>
    ${isNat20 ? `<p class="ultimate-harvester-nat20"><i class="fas fa-star ultimate-harvester-icon--gold"></i> Rare find!</p>` : ""}
    <p class="ultimate-harvester-note"><i class="fas fa-eye ultimate-harvester-icon--warning"></i> ${game.i18n.localize("MHARVEST.Chat.ThreatReminder")}</p>
  </div>`;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: forager }),
    flags: { [MODULE_ID]: { isForageCard: true } },
  });

  // Whisper GM
  if (!game.user.isGM) {
    const itemNames = foragedItems.map((i) => i.name).join(", ") || "nothing";
    await ChatMessage.create({
      content: `<p><strong>${forager.name}</strong> foraged: ${itemNames} (${tierDesc}, rolled ${total})</p>`,
      whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
    });
  }
}

/* ---- Item Awards ---- */

async function _awardForagedItems(forager, items) {
  const itemDataArray = [];
  const multiplier = game.settings.get(MODULE_ID, "valueMultiplier");

  for (const item of items) {
    if (!item.uuid) continue;
    try {
      const sourceItem = await fromUuid(item.uuid);
      if (!sourceItem) continue;
      const itemData = sourceItem.toObject();
      itemData.system.quantity = item.quantity;
      if (multiplier !== 1.0 && itemData.system.price?.value) {
        itemData.system.price.value = Math.max(1, Math.round(itemData.system.price.value * multiplier));
      }
      itemDataArray.push(itemData);
    } catch (err) {
      console.warn(`${MODULE_ID} | Failed to load foraged item ${item.uuid}:`, err);
    }
  }

  if (itemDataArray.length > 0) {
    await gmCreateEmbeddedDocuments(forager, "Item", itemDataArray);
  }
}

/* ---- Foraging Prompt ---- */

async function _showForagePrompt(forager, envDef, primaryLabel, secondaryLabel, tierDCs) {
  const content = await renderTemplate(`modules/${MODULE_ID}/templates/forage-prompt.hbs`, {
    foragerName: forager.name,
    environment: envDef.label,
    primarySkill: primaryLabel,
    secondarySkill: secondaryLabel,
    tier1DC: tierDCs[0],
    tier2DC: tierDCs[1],
    tier3DC: tierDCs[2],
  });

  return showDialog({
    title: game.i18n.localize("MHARVEST.Dialog.ForageTitle"),
    content,
    buttons: {
      forage: {
        label: game.i18n.localize("MHARVEST.Dialog.ForageTitle"),
        icon: "fas fa-leaf",
        callback: (el) => {
          const hours = parseInt(el.querySelector("input[name='hours']")?.value) || 1;
          return Math.max(1, Math.min(hours, 8));
        },
      },
      cancel: {
        label: game.i18n.localize("MHARVEST.Dialog.Cancel"),
        icon: "fas fa-times",
        callback: () => null,
      },
    },
    defaultButton: "forage",
  });
}

/* ---- Failure Event Logic ---- */

/**
 * Check whether a failed forage triggers a failure event.
 * Nat 1 = always. Otherwise 1% chance per point missed below lowest tier DC.
 * GM "arm next failure" override forces the event regardless.
 * @returns {object|null} Resolved failure event or null
 */
async function _checkFailureEvent(forager, isNat1, failMargin, foragingConfig) {
  const armed = foragingConfig.failureEventArmed ?? false;

  let triggered = false;
  if (isNat1 || armed) {
    triggered = true;
  } else if (failMargin > 0) {
    const chance = failMargin; // 1% per point missed
    const roll = Math.random() * 100;
    triggered = roll < chance;
  }

  if (!triggered) return null;

  // Disarm the GM override if it was set
  if (armed) {
    const updatedConfig = foundry.utils.deepClone(foragingConfig);
    updatedConfig.failureEventArmed = false;
    await game.settings.set(MODULE_ID, "foragingConfig", updatedConfig);
    // Re-render the panel so the checkbox unchecks visually
    const { ForagingPanel } = await import("./foraging-panel.js");
    if (ForagingPanel._instance?.rendered) {
      ForagingPanel._instance.render();
    }
  }

  // Draw from the Foraging Failure Events table in the foraging-tables compendium
  const pack = game.packs.get(`${MODULE_ID}.foraging-tables`);
  if (!pack) {
    console.warn(`${MODULE_ID} | Foraging tables compendium not found for failure events.`);
    return null;
  }
  const index = await pack.getIndex();
  const tableEntry = index.find((e) => e.name === "Foraging Failure Events");
  if (!tableEntry) {
    console.warn(`${MODULE_ID} | Foraging Failure Events table not found in compendium.`);
    return null;
  }
  const table = await pack.getDocument(tableEntry._id);
  const draw = await table.draw({ displayChat: false });
  if (!draw.results.length) return null;

  const result = draw.results[0];
  const flags = result.flags?.[MODULE_ID] ?? {};
  if (!flags.failureEvent) return null;

  const event = {
    label: result.text,
    icon: flags.icon ?? "fas fa-exclamation-triangle",
    description: flags.description ?? result.text,
    auto: flags.auto ?? "none",
  };

  // Resolve dynamic values in description
  let resolvedDescription = event.description;
  const level = forager.system.details?.level ?? forager.system.details?.cr ?? 1;

  if (flags.damageFormula) {
    let damageTotal;
    if (flags.damageFormula.includes("@level")) {
      const formula = flags.damageFormula.replace("@level", String(level));
      try {
        const dmgRoll = await new Roll(formula).evaluate();
        damageTotal = dmgRoll.total;
      } catch {
        damageTotal = level * 2;
      }
    } else {
      try {
        const dmgRoll = await new Roll(flags.damageFormula).evaluate();
        damageTotal = dmgRoll.total;
      } catch {
        damageTotal = 2;
      }
    }
    resolvedDescription = resolvedDescription.replace("{damage}", `${damageTotal} ${flags.damageType ?? ""}`);

    if (event.auto === "damage" || event.auto === "damage+effect") {
      await _applyDamage(forager, damageTotal, flags.damageType);
    }
  }

  if (flags.spoilFormula) {
    try {
      const spoilRoll = await new Roll(flags.spoilFormula).evaluate();
      resolvedDescription = resolvedDescription.replace("{spoilCount}", String(spoilRoll.total));
    } catch {
      resolvedDescription = resolvedDescription.replace("{spoilCount}", "1");
    }
  }

  // Auto-apply exhaustion
  if (event.auto === "exhaustion") {
    await _applyExhaustion(forager);
  }

  // Auto-halve ammo
  if (event.auto === "ammo") {
    await _halveAmmo(forager);
  }

  // Auto-apply ActiveEffect debuff
  if (event.auto === "effect" || event.auto === "damage+effect") {
    if (flags.effectName) {
      await _applyDebuffEffect(forager, {
        name: flags.effectName,
        icon: flags.effectIcon ?? "icons/svg/aura.svg",
        durationHours: flags.effectDurationHours ?? 24,
        changes: flags.effectChanges ?? [],
        description: flags.effectDescription ?? "",
      });
    }
  }

  return { ...event, resolvedDescription };
}

/**
 * Apply HP damage to an actor.
 */
async function _applyDamage(actor, amount, type) {
  try {
    const hp = actor.system.attributes?.hp;
    if (!hp) return;
    const newHp = Math.max(0, hp.value - amount);
    await actor.update({ "system.attributes.hp.value": newHp });
    ui.notifications.warn(`${actor.name} takes ${amount} ${type ?? ""} damage from foraging mishap!`);
  } catch (err) {
    console.warn(`${MODULE_ID} | Failed to apply damage:`, err);
  }
}

/**
 * Apply 1 level of exhaustion (dnd5e).
 */
async function _applyExhaustion(actor) {
  try {
    const current = actor.system.attributes?.exhaustion ?? 0;
    await actor.update({ "system.attributes.exhaustion": current + 1 });
    ui.notifications.warn(`${actor.name} gains 1 level of exhaustion!`);
  } catch (err) {
    console.warn(`${MODULE_ID} | Failed to apply exhaustion:`, err);
  }
}

/**
 * Halve one random ammunition type's quantity on an actor.
 */
async function _halveAmmo(actor) {
  try {
    const ammoItems = actor.items.filter((i) =>
      i.type === "consumable" && i.system.type?.value === "ammo" && i.system.quantity > 0
    );
    if (ammoItems.length === 0) return;
    const target = ammoItems[Math.floor(Math.random() * ammoItems.length)];
    const newQty = Math.floor(target.system.quantity / 2);
    await actor.updateEmbeddedDocuments("Item", [{ _id: target.id, "system.quantity": newQty }]);
    ui.notifications.warn(`${actor.name} loses half their ${target.name} (${target.system.quantity} → ${newQty})!`);
  } catch (err) {
    console.warn(`${MODULE_ID} | Failed to halve ammo:`, err);
  }
}

/* ---- ActiveEffect Debuff ---- */

/**
 * Create a timed ActiveEffect on a forager for persistent debuffs.
 * Uses the same pattern as Hunters_Quarry effect-manager.
 * @param {Actor} actor
 * @param {object} effectDef - Effect definition from FORAGING_FAILURE_EVENTS
 */
async function _applyDebuffEffect(actor, effectDef) {
  try {
    const effectData = {
      name: effectDef.name,
      icon: effectDef.icon,
      origin: `module.${MODULE_ID}`,
      description: effectDef.description,
      flags: {
        [MODULE_ID]: {
          foragingDebuff: true,
        },
      },
      changes: (effectDef.changes ?? []).map((c) => ({
        key: c.key,
        mode: c.mode ?? CONST.ACTIVE_EFFECT_MODES.ADD,
        value: String(c.value),
        priority: 20,
      })),
      duration: {
        seconds: (effectDef.durationHours ?? 24) * 3600,
      },
    };

    await gmCreateEmbeddedDocuments(actor, "ActiveEffect", [effectData]);
    ui.notifications.warn(`${actor.name} gains the "${effectDef.name}" debuff!`);
  } catch (err) {
    console.warn(`${MODULE_ID} | Failed to apply debuff effect:`, err);
  }
}

/* ---- Skill Roll ---- */

async function _rollForageCheck(forager, skillId) {
  let rolls;
  try {
    rolls = await forager.rollSkill(skillId, {});
  } catch (err) {
    console.error(`${MODULE_ID} | Forage roll failed:`, err);
    return null;
  }
  const roll = Array.isArray(rolls) ? rolls[0] : rolls;
  if (!roll) return null;
  const d20 = roll.dice?.[0]?.total ?? roll.terms?.[0]?.total;
  return { total: roll.total, isNat20: d20 === 20, d20 };
}
