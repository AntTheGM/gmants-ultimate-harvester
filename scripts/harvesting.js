/**
 * Ultimate Harvester — Harvest Workflow Engine
 * Creature-centric model: harvest state lives on the creature actor.
 * First harvester rolls and locks items; subsequent harvesters pick up remainders.
 */

import { MODULE_ID, getHarvestSkill, SKILL_LABELS, ITEM_CATEGORIES, TOOL_MAPPINGS, SIZE_TIME_MODIFIERS } from "./config.js";
import { findHarvestTable } from "./table-lookup.js";
import { gmSetFlag, gmCreateEmbeddedDocuments } from "./socket.js";

/**
 * Main entry point — called from the harvest macro.
 */
export async function initiateHarvest() {
  // --- Resolve harvester (selected token) ---
  const harvester = canvas.tokens?.controlled?.[0]?.actor;
  if (!harvester) {
    return ui.notifications.warn(game.i18n.localize("MHARVEST.Notification.SelectToken"));
  }

  // --- Resolve creature (targeted token) ---
  const targets = game.user.targets;
  let creatureToken;
  if (targets.size === 1) {
    creatureToken = Array.from(targets)[0];
  } else {
    creatureToken = canvas.tokens?.hover;
  }
  if (!creatureToken?.actor) {
    return ui.notifications.warn(game.i18n.localize("MHARVEST.Notification.NoTarget"));
  }
  const creature = creatureToken.actor;

  // --- Validate ---
  if (creature.system.attributes.hp.value > 0) {
    return ui.notifications.warn(game.i18n.localize("MHARVEST.Notification.CreatureAlive"));
  }

  const harvestedFlag = creature.getFlag(MODULE_ID, "harvested");
  if (harvestedFlag === true || harvestedFlag === "ruined") {
    const key = harvestedFlag === "ruined" ? "MHARVEST.Notification.HarvestRuined" : "MHARVEST.Notification.AlreadyHarvested";
    return ui.notifications.warn(game.i18n.localize(key));
  }

  const creatureType = creature.system.details?.type?.value;
  if (creatureType === "humanoid" && !game.settings.get(MODULE_ID, "allowHumanoidHarvesting")) {
    return ui.notifications.warn(game.i18n.localize("MHARVEST.Notification.HumanoidDisabled"));
  }

  // --- Check lock ---
  const lockedBy = creature.getFlag(MODULE_ID, "harvestingBy");
  if (lockedBy && lockedBy !== harvester.uuid) {
    const lockerName = (await fromUuid(lockedBy))?.name ?? "Someone";
    return ui.notifications.warn(`${lockerName} is already harvesting this creature.`);
  }

  // --- Check if items are already determined (subsequent harvester) ---
  const existingItems = creature.getFlag(MODULE_ID, "availableItems");
  if (existingItems && existingItems.length > 0) {
    return _pickupRemaining(harvester, creature, existingItems);
  }
  if (existingItems && existingItems.length === 0) {
    await gmSetFlag(creature, MODULE_ID, "harvested", true);
    return ui.notifications.warn(game.i18n.localize("MHARVEST.Notification.AlreadyHarvested"));
  }

  // --- First harvester: full workflow ---
  const { table } = await findHarvestTable(creature);
  if (!table) {
    return ui.notifications.warn(game.i18n.localize("MHARVEST.Notification.NoTable"));
  }

  const skillId = getHarvestSkill(creatureType);
  const skillLabel = SKILL_LABELS[skillId] ?? skillId;

  // --- Calculate time estimates ---
  const cr = creature.system.details?.cr ?? 0;
  const effectiveCR = cr < 1 ? 1 : cr;
  const tierCount = table.results.contents.filter((r) => r.getFlag(MODULE_ID, "dc") !== undefined).length;
  const sizeKey = creature.system.traits?.size ?? "med";
  const sizeModifier = SIZE_TIME_MODIFIERS[sizeKey] ?? 0;
  const harvestTimeMin = 15;
  const harvestTimeMax = (tierCount * 15) + sizeModifier;
  const appraisalTime = 5 + Math.floor(effectiveCR);

  // --- Post "approaching corpse" chat message ---
  const appraisalEnabled = game.settings.get(MODULE_ID, "appraisalEnabled");
  const estAppraise = appraisalEnabled ? `~${appraisalTime} min to appraise, ` : "";
  const estHarvest = `~${harvestTimeMin}\u2013${harvestTimeMax} min to harvest`;
  await ChatMessage.create({
    content: `<div class="ultimate-harvester-card"><p><strong>${harvester.name}</strong> approaches the corpse of <strong>${creature.name}</strong> to harvest materials. (${estAppraise}${estHarvest})</p></div>`,
    speaker: ChatMessage.getSpeaker({ actor: harvester }),
  });

  // --- Lock creature ---
  await gmSetFlag(creature, MODULE_ID, "harvestingBy", harvester.uuid);

  let totalTimeElapsed = 0;

  // --- Show harvest dialog ---
  // Check for prior appraisal attempts (retry penalty)
  const appraisalAttempts = creature.getFlag(MODULE_ID, "appraisalAttempts") ?? 0;
  const appraisalPenalty = appraisalAttempts * -5;

  const action = await _showHarvestDialog(creature, creatureType, skillLabel, appraisalEnabled, {
    appraisalTime, harvestTimeMin, harvestTimeMax, sizeModifier,
    appraisalPenalty,
  }, harvester.name);

  if (!action) {
    await gmSetFlag(creature, MODULE_ID, "harvestingBy", null);
    return;
  }

  // --- Appraisal flow ---
  if (action === "appraise") {
    const appraisalResult = await _performAppraisal(harvester, creature, table, skillId, skillLabel, appraisalTime, sizeModifier);
    totalTimeElapsed += appraisalTime;

    if (!appraisalResult) {
      await gmSetFlag(creature, MODULE_ID, "harvestingBy", null);
      return;
    }

    // Post concise chat card (others see this + "View Appraisal" link)
    await _postAppraisalResult(creature, harvester, appraisalResult, { skillLabel, timeElapsed: appraisalTime });

    if (appraisalResult.success) {
      await gmSetFlag(creature, MODULE_ID, "appraisalSuccess", true);
    }

    // Appraisal crit effects — stored on creature
    if (appraisalResult.isNat20) {
      await gmSetFlag(creature, MODULE_ID, "appraisalBonus", 2);
    } else if (appraisalResult.isNat1) {
      await gmSetFlag(creature, MODULE_ID, "appraisalDisadvantage", true);
    }

    // Show combined appraisal results + harvest dialog (single window for harvester)
    const followUp = await _showPostAppraisalDialog(creature, harvester, appraisalResult, {
      creatureType, skillLabel, appraisalTime,
      harvestTimeMin, harvestTimeMax, sizeModifier,
    });
    if (!followUp) {
      await gmSetFlag(creature, MODULE_ID, "harvestingBy", null);
      return;
    }
  }

  // --- Check for tools ---
  const toolBonus = _getToolBonus(harvester, creatureType);

  // --- Build roll modifiers from creature flags ---
  const hasAdvantage = creature.getFlag(MODULE_ID, "appraisalSuccess") && !creature.getFlag(MODULE_ID, "appraisalDisadvantage");
  const hasDisadvantage = creature.getFlag(MODULE_ID, "appraisalDisadvantage") && !creature.getFlag(MODULE_ID, "appraisalSuccess");
  const appraisalBonus = creature.getFlag(MODULE_ID, "appraisalBonus") ?? 0;
  const maxRetryDC = creature.getFlag(MODULE_ID, "maxRetryDC");

  // --- Roll skill check ---
  const rollResult = await _rollHarvestCheck(harvester, skillId, toolBonus + appraisalBonus, hasAdvantage ? 1 : hasDisadvantage ? -1 : 0);
  if (!rollResult) {
    await gmSetFlag(creature, MODULE_ID, "harvestingBy", null);
    return;
  }

  const { total, isNat1, isNat20 } = rollResult;

  // --- Handle critical failure ---
  if (isNat1 && game.settings.get(MODULE_ID, "critFailEnabled")) {
    const critFailEffect = table.getFlag(MODULE_ID, "critFailEffect");
    totalTimeElapsed += harvestTimeMin + sizeModifier;
    await _postHarvestResult(creature, harvester, [], {
      critFail: true, critFailEffect, rollTotal: total, skillLabel, timeElapsed: totalTimeElapsed,
    });
    await gmSetFlag(creature, MODULE_ID, "harvested", true);
    await gmSetFlag(creature, MODULE_ID, "harvestingBy", null);
    return;
  }

  // --- Handle fumble (roll < 5) ---
  if (total < 5) {
    const fumbleEffect = table.getFlag(MODULE_ID, "fumbleEffect");
    totalTimeElapsed += harvestTimeMin + sizeModifier;
    await _postHarvestResult(creature, harvester, [], {
      fumble: true, fumbleEffect, rollTotal: total, skillLabel, timeElapsed: totalTimeElapsed,
    });
    await gmSetFlag(creature, MODULE_ID, "harvestingBy", null);
    return;
  }

  // --- DC threshold filter ---
  const allResults = table.results.contents;
  const harvested = allResults.filter((result) => {
    const dc = result.getFlag(MODULE_ID, "dc");
    if (dc === undefined) return false;
    if (maxRetryDC && dc > maxRetryDC) return false;
    return dc <= total;
  });

  // --- Check for harvest failure ---
  const lowestDC = Math.min(...allResults.map((r) => r.getFlag(MODULE_ID, "dc") ?? Infinity));
  if (harvested.length === 0 && total >= 5) {
    const failMargin = lowestDC - total;
    totalTimeElapsed += harvestTimeMin + sizeModifier;

    if (failMargin >= 5) {
      await _postHarvestResult(creature, harvester, [], {
        rollTotal: total, skillLabel, nothingFound: true, ruined: true, timeElapsed: totalTimeElapsed,
      });
      await gmSetFlag(creature, MODULE_ID, "harvested", "ruined");
    } else {
      const allDCs = allResults.map((r) => r.getFlag(MODULE_ID, "dc")).filter((dc) => dc !== undefined).sort((a, b) => a - b);
      const newMaxDC = allDCs.filter((dc) => dc > total).shift();
      const retryMaxDC = newMaxDC ? newMaxDC - 1 : maxRetryDC;
      await gmSetFlag(creature, MODULE_ID, "maxRetryDC", retryMaxDC);
      await _postHarvestResult(creature, harvester, [], {
        rollTotal: total, skillLabel, nothingFound: true, canRetry: true, timeElapsed: totalTimeElapsed,
      });
    }
    await gmSetFlag(creature, MODULE_ID, "harvestingBy", null);
    return;
  }

  // --- Nat 20 bonus item ---
  let bonusItem = null;
  if (isNat20) {
    const critItemUuid = table.getFlag(MODULE_ID, "critSuccessItem");
    if (critItemUuid) bonusItem = await fromUuid(critItemUuid);
  }

  // --- Evaluate quantities and lock items on creature ---
  const itemList = await Promise.all(
    harvested.map(async (result) => {
      const flags = result.flags?.[MODULE_ID] ?? {};
      const quantityRoll = await new Roll(flags.quantity || "1").evaluate();
      return {
        name: result.text,
        uuid: flags.itemUuid,
        quantity: quantityRoll.total,
        category: flags.category ?? "material",
        dc: flags.dc,
        description: await _getItemDescription(flags.itemUuid),
      };
    })
  );

  if (bonusItem) {
    const bonusQuantity = table.getFlag(MODULE_ID, "critSuccessQuantity") || "1";
    const bonusRoll = await new Roll(bonusQuantity).evaluate();
    itemList.push({
      name: bonusItem.name, uuid: bonusItem.uuid, quantity: bonusRoll.total,
      category: bonusItem.getFlag(MODULE_ID, "category") ?? "component",
      dc: "Nat 20", isBonus: true,
    });
  }

  // Store resolved items on creature
  await gmSetFlag(creature, MODULE_ID, "availableItems", itemList);

  // --- Calculate time ---
  const tiersFound = itemList.filter((i) => !i.isBonus).length;
  totalTimeElapsed += (tiersFound * 15) + sizeModifier;

  // --- Pickup dialog ---
  let selectedItems;
  if (game.settings.get(MODULE_ID, "showPickupDialog")) {
    selectedItems = await _showPickupDialog(creature, itemList, total, skillLabel, totalTimeElapsed);
    if (!selectedItems) {
      // Left all — items remain on creature for others
      await gmSetFlag(creature, MODULE_ID, "harvestingBy", null);
      return;
    }
  } else {
    selectedItems = itemList;
  }

  // --- Award items ---
  if (selectedItems.length > 0) {
    await _awardItems(harvester, selectedItems);
  }

  // --- Remove taken items from creature, keep remainder ---
  const takenNames = new Set(selectedItems.map((i) => `${i.name}:${i.dc}`));
  const remaining = itemList.filter((i) => !takenNames.has(`${i.name}:${i.dc}`));
  await gmSetFlag(creature, MODULE_ID, "availableItems", remaining);

  // --- Post results to chat ---
  await _postHarvestResult(creature, harvester, selectedItems, {
    rollTotal: total, skillLabel, isNat20, bonusItem: bonusItem?.name,
    timeElapsed: totalTimeElapsed,
    remainingCount: remaining.length,
  });

  // --- Mark fully harvested if nothing remains ---
  if (remaining.length === 0) {
    await gmSetFlag(creature, MODULE_ID, "harvested", true);
  }

  // --- Unlock creature ---
  await gmSetFlag(creature, MODULE_ID, "harvestingBy", null);
}

/**
 * Handle subsequent harvesters picking up remaining items (no roll needed).
 */
async function _pickupRemaining(harvester, creature, availableItems) {
  // Lock creature
  await gmSetFlag(creature, MODULE_ID, "harvestingBy", harvester.uuid);

  await ChatMessage.create({
    content: `<div class="ultimate-harvester-card"><p><strong>${harvester.name}</strong> picks through the remains of <strong>${creature.name}</strong>.</p></div>`,
    speaker: ChatMessage.getSpeaker({ actor: harvester }),
  });

  let selectedItems;
  if (game.settings.get(MODULE_ID, "showPickupDialog")) {
    selectedItems = await _showPickupDialog(creature, availableItems, "—", "Leftovers", 0);
    if (!selectedItems) {
      await gmSetFlag(creature, MODULE_ID, "harvestingBy", null);
      return;
    }
  } else {
    selectedItems = availableItems;
  }

  if (selectedItems.length > 0) {
    await _awardItems(harvester, selectedItems);
  }

  const takenNames = new Set(selectedItems.map((i) => `${i.name}:${i.dc}`));
  const remaining = availableItems.filter((i) => !takenNames.has(`${i.name}:${i.dc}`));
  await gmSetFlag(creature, MODULE_ID, "availableItems", remaining);

  await _postHarvestResult(creature, harvester, selectedItems, {
    rollTotal: "—", skillLabel: "Leftovers", timeElapsed: 0,
    remainingCount: remaining.length,
  });

  if (remaining.length === 0) {
    await gmSetFlag(creature, MODULE_ID, "harvested", true);
  }

  await gmSetFlag(creature, MODULE_ID, "harvestingBy", null);
}

/* ============================================
   Private: Appraisal
   ============================================ */

/**
 * Perform the appraisal step.
 */
async function _performAppraisal(harvester, creature, table, skillId, skillLabel, appraisalTime, sizeModifier) {
  const appraisalDCOffset = game.settings.get(MODULE_ID, "appraisalDCOffset");

  const allResults = table.results.contents;
  const dcResults = allResults
    .map((r) => ({ text: r.text, dc: r.getFlag(MODULE_ID, "dc"), category: r.flags?.[MODULE_ID]?.category }))
    .filter((r) => r.dc !== undefined)
    .sort((a, b) => a.dc - b.dc);

  if (dcResults.length === 0) return null;

  const lowestDC = dcResults[0].dc;
  const appraisalDC = lowestDC + appraisalDCOffset;

  const attempts = creature.getFlag(MODULE_ID, "appraisalAttempts") ?? 0;
  const retryPenalty = attempts * -5;

  const rollOptions = {};
  if (retryPenalty) rollOptions.parts = [`${retryPenalty}`];

  let rolls;
  try {
    rolls = await harvester.rollSkill(skillId, rollOptions);
  } catch (err) {
    console.error(`${MODULE_ID} | Appraisal roll failed:`, err);
    return null;
  }
  const roll = Array.isArray(rolls) ? rolls[0] : rolls;
  if (!roll) return null;

  const rollTotal = roll.total;
  const d20 = roll.dice?.[0]?.total ?? roll.terms?.[0]?.total;
  const isNat1 = d20 === 1;
  const isNat20 = d20 === 20;
  const success = rollTotal >= appraisalDC;

  await gmSetFlag(creature, MODULE_ID, "appraisalAttempts", attempts + 1);

  if (!success) {
    return { success: false, visibleItems: [], rollTotal, appraisalDC, retryPenalty, isNat1, isNat20 };
  }

  // Tier +1 visibility: show items at/below roll, plus one tier above
  const reachableItems = dcResults.filter((r) => r.dc <= rollTotal);
  const aboveRoll = dcResults.filter((r) => r.dc > rollTotal);
  const nextTierDC = aboveRoll[0]; // first tier above roll = peek
  const hiddenCount = aboveRoll.length - (nextTierDC ? 1 : 0); // remaining hidden tiers

  const visibleItems = [...reachableItems];
  if (nextTierDC) visibleItems.push({ ...nextTierDC, isPeek: true });

  // Assign difficulty labels relative to the appraisal roll
  for (const item of visibleItems) {
    if (item.isPeek) {
      item.difficulty = "Near Impossible";
      item.difficultyClass = "near-impossible";
    } else if (item.dc <= rollTotal - 5) {
      item.difficulty = "Easy";
      item.difficultyClass = "easy";
    } else if (item.dc <= rollTotal) {
      item.difficulty = "Moderate";
      item.difficultyClass = "moderate";
    } else {
      item.difficulty = "Difficult";
      item.difficultyClass = "difficult";
    }
  }

  // Add placeholder entries for hidden tiers
  for (let i = 0; i < hiddenCount; i++) {
    visibleItems.push({
      text: "Unknown Material",
      category: null,
      difficulty: "Impossible",
      difficultyClass: "impossible",
      isHidden: true,
    });
  }

  const critFailEffect = table.getFlag(MODULE_ID, "critFailEffect");
  const fumbleEffect = table.getFlag(MODULE_ID, "fumbleEffect");

  return {
    success: true, visibleItems, rollTotal, appraisalDC, retryPenalty,
    isNat1, isNat20,
    critFailEffect, fumbleEffect,
    harvestTimeEstimate: (reachableItems.length * 15) + sizeModifier,
  };
}

/**
 * Post appraisal summary to chat and store full data on creature for modal viewing.
 */
async function _postAppraisalResult(creature, harvester, result, opts = {}) {
  // Build the full modal data and store on creature
  const modalData = {
    creatureName: creature.name,
    harvesterName: harvester.name,
    success: result.success,
    rollTotal: result.rollTotal,
    appraisalDC: result.appraisalDC,
    skillLabel: opts.skillLabel,
    timeElapsed: opts.timeElapsed,
    isNat1: result.isNat1,
    isNat20: result.isNat20,
    visibleItems: (result.visibleItems || []).map((item) => ({
      ...item,
      categoryIcon: ITEM_CATEGORIES[item.category]?.icon ?? "fa-solid fa-cube",
      categoryLabel: game.i18n.localize(ITEM_CATEGORIES[item.category]?.label ?? "MHARVEST.Category.Material"),
    })),
    critFailEffect: result.critFailEffect,
    fumbleEffect: result.fumbleEffect,
    harvestTimeEstimate: result.harvestTimeEstimate,
    retryPenalty: result.retryPenalty,
  };

  await gmSetFlag(creature, MODULE_ID, "appraisalData", modalData);

  // Post concise chat card
  const content = await renderTemplate(`modules/${MODULE_ID}/templates/appraisal-result.hbs`, {
    creatureName: creature.name,
    harvesterName: harvester.name,
    success: result.success,
    rollTotal: result.rollTotal,
    skillLabel: opts.skillLabel,
    timeElapsed: opts.timeElapsed,
    isNat1: result.isNat1,
    isNat20: result.isNat20,
    creatureUuid: creature.uuid,
  });

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: harvester }),
    flags: { [MODULE_ID]: { isAppraisalCard: true, creatureUuid: creature.uuid } },
  });

  // Modal is NOT auto-opened — the combined post-appraisal dialog handles this for the harvester
  // Other players can click "View Appraisal Details" in chat to open the modal
}

/**
 * Show the appraisal details modal.
 * @param {object} data - Appraisal modal data (stored on creature or passed directly)
 */
/** @type {Dialog|null} */
let _activeAppraisalModal = null;

async function _showAppraisalModal(data) {
  // Close any existing appraisal modal
  if (_activeAppraisalModal) {
    _activeAppraisalModal.close();
    _activeAppraisalModal = null;
  }

  const content = await renderTemplate(`modules/${MODULE_ID}/templates/appraisal-modal.hbs`, data);

  _activeAppraisalModal = new Dialog({
    title: `${game.i18n.localize("MHARVEST.Chat.AppraisalResults")} — ${data.creatureName}`,
    content,
    buttons: {
      close: {
        label: "Close",
        icon: '<i class="fas fa-times"></i>',
      },
    },
    default: "close",
    close: () => { _activeAppraisalModal = null; },
  }, {
    width: 420,
  });
  _activeAppraisalModal.render(true);
}

function _closeAppraisalModal() {
  if (_activeAppraisalModal) {
    _activeAppraisalModal.close();
    _activeAppraisalModal = null;
  }
}

/**
 * Open the appraisal modal for a creature (called from chat link).
 * @param {string} creatureUuid - The actor UUID of the creature
 */
export async function viewAppraisal(creatureUuid) {
  const creature = await fromUuid(creatureUuid);
  if (!creature) {
    return ui.notifications.warn("Creature not found.");
  }
  const data = creature.getFlag(MODULE_ID, "appraisalData");
  if (!data) {
    return ui.notifications.warn("No appraisal data found for this creature.");
  }
  await _showAppraisalModal(data);
}

/* ============================================
   Private: Dialogs
   ============================================ */

/**
 * Show the Appraise / Harvest / Cancel dialog.
 * @returns {Promise<string|null>} "appraise", "harvest", or null (cancelled)
 */
/**
 * Show combined appraisal results + harvest dialog (single window for the harvester).
 * @returns {Promise<string|null>} "harvest" or null (cancelled)
 */
async function _showPostAppraisalDialog(creature, harvester, appraisalResult, opts) {
  const cr = creature.system.details?.cr ?? "?";
  const typeName = opts.creatureType ? opts.creatureType.charAt(0).toUpperCase() + opts.creatureType.slice(1) : "Unknown";

  const content = await renderTemplate(`modules/${MODULE_ID}/templates/post-appraisal-dialog.hbs`, {
    creatureName: creature.name,
    harvesterName: harvester.name,
    creatureType: typeName,
    cr,
    skillLabel: opts.skillLabel,
    appraisalSuccess: appraisalResult.success,
    appraisalCritSuccess: appraisalResult.isNat20,
    appraisalCritFail: appraisalResult.isNat1,
    appraisalTimeSpent: opts.appraisalTime,
    harvestTimeMin: opts.harvestTimeMin,
    harvestTimeMax: opts.harvestTimeMax,
    sizeModifier: opts.sizeModifier,
    visibleItems: (appraisalResult.visibleItems || []).map((item) => ({
      ...item,
      categoryIcon: ITEM_CATEGORIES[item.category]?.icon ?? "fa-solid fa-cube",
      categoryLabel: game.i18n.localize(ITEM_CATEGORIES[item.category]?.label ?? "MHARVEST.Category.Material"),
    })),
    critFailEffect: appraisalResult.critFailEffect,
    fumbleEffect: appraisalResult.fumbleEffect,
  });

  return new Promise((resolve) => {
    new Dialog({
      title: `${game.i18n.localize("MHARVEST.Dialog.HarvestTitle")} — ${creature.name}`,
      content,
      buttons: {
        harvest: {
          label: game.i18n.localize("MHARVEST.Dialog.Harvest"),
          icon: '<i class="fas fa-drumstick-bite"></i>',
          callback: () => resolve("harvest"),
        },
        cancel: {
          label: game.i18n.localize("MHARVEST.Dialog.Cancel"),
          icon: '<i class="fas fa-times"></i>',
          callback: () => resolve(null),
        },
      },
      default: "harvest",
      close: () => resolve(null),
    }, { width: 420 }).render(true);
  });
}

async function _showHarvestDialog(creature, creatureType, skillLabel, appraisalEnabled, timeEstimates = {}, harvesterName = "") {
  const cr = creature.system.details?.cr ?? "?";
  const typeName = creatureType ? creatureType.charAt(0).toUpperCase() + creatureType.slice(1) : "Unknown";

  const content = await renderTemplate(`modules/${MODULE_ID}/templates/harvest-dialog.hbs`, {
    creatureName: creature.name,
    harvesterName,
    creatureType: typeName,
    cr,
    skillLabel,
    appraisalEnabled,
    appraisalTime: timeEstimates.appraisalTime ?? 5,
    harvestTimeMin: timeEstimates.harvestTimeMin ?? 15,
    harvestTimeMax: timeEstimates.harvestTimeMax ?? 60,
    sizeModifier: timeEstimates.sizeModifier ?? 0,
    appraisalDone: timeEstimates.appraisalDone ?? false,
    appraisalSuccess: timeEstimates.appraisalSuccess ?? false,
    appraisalCritSuccess: timeEstimates.appraisalCritSuccess ?? false,
    appraisalCritFail: timeEstimates.appraisalCritFail ?? false,
    appraisalTimeSpent: timeEstimates.appraisalTimeSpent ?? 0,
    appraisalPenalty: timeEstimates.appraisalPenalty ?? 0,
  });

  return new Promise((resolve) => {
    const buttons = {};
    if (appraisalEnabled) {
      buttons.appraise = {
        label: game.i18n.localize("MHARVEST.Dialog.Appraise"),
        icon: '<i class="fas fa-search"></i>',
        callback: () => resolve("appraise"),
      };
    }
    buttons.harvest = {
      label: game.i18n.localize("MHARVEST.Dialog.Harvest"),
      icon: '<i class="fas fa-drumstick-bite"></i>',
      callback: () => resolve("harvest"),
    };
    buttons.cancel = {
      label: game.i18n.localize("MHARVEST.Dialog.Cancel"),
      icon: '<i class="fas fa-times"></i>',
      callback: () => resolve(null),
    };

    new Dialog({
      title: game.i18n.localize("MHARVEST.Dialog.HarvestTitle"),
      content,
      buttons,
      default: "harvest",
      close: () => resolve(null),
    }).render(true);
  });
}

/**
 * Show the take/leave pickup dialog with checkboxes.
 * @returns {Promise<object[]|null>} Selected items or null if all left
 */
async function _showPickupDialog(creature, itemList, rollTotal, skillLabel, timeElapsed = 0) {
  const content = await renderTemplate(`modules/${MODULE_ID}/templates/harvest-pickup.hbs`, {
    creatureName: creature.name,
    items: itemList.map((item, idx) => ({
      ...item,
      idx,
      categoryIcon: ITEM_CATEGORIES[item.category]?.icon ?? "fa-solid fa-cube",
      categoryLabel: game.i18n.localize(ITEM_CATEGORIES[item.category]?.label ?? "MHARVEST.Category.Material"),
    })),
    rollTotal,
    skillLabel,
    timeElapsed,
  });

  return new Promise((resolve) => {
    new Dialog({
      title: game.i18n.localize("MHARVEST.Dialog.HarvestTitle"),
      content,
      buttons: {
        take: {
          label: game.i18n.localize("MHARVEST.Dialog.TakeSelected"),
          icon: '<i class="fas fa-hand-holding"></i>',
          callback: (html) => {
            const selected = [];
            html.find("input[type=checkbox]:checked").each((_i, el) => {
              const idx = parseInt(el.dataset.idx);
              if (!isNaN(idx) && itemList[idx]) selected.push(itemList[idx]);
            });
            resolve(selected);
          },
        },
        leave: {
          label: game.i18n.localize("MHARVEST.Dialog.LeaveAll"),
          icon: '<i class="fas fa-times"></i>',
          callback: () => resolve(null),
        },
      },
      default: "take",
      close: () => resolve(null),
    }).render(true);
  });
}

/* ============================================
   Private: Rolls
   ============================================ */

/**
 * Roll the harvest skill check.
 * @param {number} advantageMode - 0=normal, 1=advantage, -1=disadvantage
 */
async function _rollHarvestCheck(harvester, skillId, totalBonus, advantageMode) {
  const rollOptions = {};
  if (advantageMode === 1) rollOptions.advantage = true;
  if (advantageMode === -1) rollOptions.disadvantage = true;
  if (totalBonus) rollOptions.parts = [`${totalBonus}`];

  let rolls;
  try {
    rolls = await harvester.rollSkill(skillId, rollOptions);
  } catch (err) {
    console.error(`${MODULE_ID} | Skill roll failed:`, err);
    return null;
  }

  const roll = Array.isArray(rolls) ? rolls[0] : rolls;
  if (!roll) return null;

  const d20 = roll.dice?.[0]?.total ?? roll.terms?.[0]?.total;
  return { total: roll.total, isNat1: d20 === 1, isNat20: d20 === 20 };
}

/* ============================================
   Private: Tool Check
   ============================================ */

/**
 * Get the plain-text description from a compendium item UUID.
 */
async function _getItemDescription(uuid) {
  if (!uuid) return "";
  try {
    const item = await fromUuid(uuid);
    if (!item) return "";
    const html = item.system.description?.value ?? "";
    // Strip HTML tags for plain text
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent?.trim() ?? "";
  } catch {
    return "";
  }
}

function _getToolBonus(harvester, creatureType) {
  let bonus = 0;
  for (const item of harvester.items) {
    if (item.type !== "tool" && item.type !== "loot") continue;
    const toolBonus = item.getFlag(MODULE_ID, "harvestBonus");
    if (toolBonus) {
      const applicableTypes = item.getFlag(MODULE_ID, "applicableTypes");
      if (!applicableTypes || applicableTypes.includes(creatureType)) {
        bonus = Math.max(bonus, toolBonus);
      }
    }
  }
  return bonus;
}

/* ============================================
   Private: Item Awards
   ============================================ */

async function _awardItems(harvester, items) {
  const itemDataArray = [];
  const multiplier = game.settings.get(MODULE_ID, "valueMultiplier");

  for (const item of items) {
    if (!item.uuid) continue;
    try {
      const sourceItem = await fromUuid(item.uuid);
      if (!sourceItem) { console.warn(`${MODULE_ID} | Item not found: ${item.uuid}`); continue; }
      const itemData = sourceItem.toObject();
      itemData.system.quantity = item.quantity;
      if (multiplier !== 1.0 && itemData.system.price?.value) {
        itemData.system.price.value = Math.max(1, Math.round(itemData.system.price.value * multiplier));
      }
      itemDataArray.push(itemData);
    } catch (err) {
      console.warn(`${MODULE_ID} | Failed to load item ${item.uuid}:`, err);
    }
  }

  if (itemDataArray.length > 0) {
    await gmCreateEmbeddedDocuments(harvester, "Item", itemDataArray);
  }
}

/* ============================================
   Private: Chat Output
   ============================================ */

async function _postHarvestResult(creature, harvester, items, opts = {}) {
  const content = await renderTemplate(`modules/${MODULE_ID}/templates/harvest-result.hbs`, {
    creatureName: creature.name,
    harvesterName: harvester.name,
    items: items.map((item) => ({
      ...item,
      categoryIcon: ITEM_CATEGORIES[item.category]?.icon ?? "fa-solid fa-cube",
    })),
    rollTotal: opts.rollTotal,
    skillLabel: opts.skillLabel,
    critFail: opts.critFail,
    critFailEffect: opts.critFailEffect,
    fumble: opts.fumble,
    fumbleEffect: opts.fumbleEffect,
    isNat20: opts.isNat20,
    bonusItem: opts.bonusItem,
    nothingFound: opts.nothingFound,
    ruined: opts.ruined,
    canRetry: opts.canRetry,
    timeElapsed: opts.timeElapsed,
    remainingCount: opts.remainingCount,
  });

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: harvester }),
    flags: { [MODULE_ID]: { isHarvestCard: true, creatureUuid: creature.uuid } },
  });
}
