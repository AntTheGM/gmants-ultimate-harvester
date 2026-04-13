/**
 * Ultimate Harvester — Foraging Workflow Engine
 * v2: Dynamic item pools with bundle system. See docs/foraging_v2_plan.md.
 */

import {
  MODULE_ID, SKILL_LABELS, ITEM_CATEGORIES,
  FORAGING_ENVIRONMENTS, WEATHER_MODIFIERS, SEASON_MODIFIERS,
  FORAGE_TIER_DISTRIBUTION, FORAGE_MARGIN_SHIFT, FORAGE_QUANTITY_DICE,
  FORAGE_RARE_THRESHOLD,
  formatTime,
} from "./config.js";
import { drawFromPool } from "./item-pool.js";
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

  // Show hours prompt (reads aiders reactively from targeting at submit time)
  const promptResult = await _showForagePrompt(forager, envDef, primaryLabel, secondaryLabel, tierDCs);
  if (!promptResult) return;
  const { hours, aiders } = promptResult;

  // Adjust DCs for extra hours (-1 per 2 hours after the first, rounded down)
  const hourReduction = Math.floor(Math.max(0, hours - 1) / 2);
  const adjustedDCs = tierDCs.map((dc) => dc - hourReduction);

  // --- Aid Rolls (before forager's roll) ---
  const aidDC = adjustedDCs[0]; // base (Tier 1) DC
  let aidBonus = 0;
  const aidResults = [];
  for (const aider of aiders) {
    const aidRoll = await _rollSilentSkillCheck(aider, "sur");
    if (aidRoll) {
      const success = aidRoll.total >= aidDC;
      if (success) aidBonus++;
      aidResults.push({ name: aider.name, total: aidRoll.total, success, dc: aidDC });
    }
  }

  // Post aid results to chat if any aiders participated
  if (aidResults.length > 0) {
    const aidListHtml = aidResults.map((r) => {
      const icon = r.success ? "fa-check-circle ultimate-harvester-icon--success" : "fa-times-circle ultimate-harvester-icon--danger";
      const text = r.success
        ? game.i18n.localize("MHARVEST.Aid.Success").replace("{dc}", r.dc)
        : game.i18n.localize("MHARVEST.Aid.Failure").replace("{dc}", r.dc);
      return `<li><i class="fas ${icon}"></i> <strong>${r.name}</strong> rolled ${r.total} — ${text}</li>`;
    }).join("");

    let bonusLine = "";
    if (aidBonus > 0) {
      bonusLine = `<p class="ultimate-harvester-note"><i class="fas fa-plus-circle ultimate-harvester-icon--success"></i> <strong>${game.i18n.localize("MHARVEST.Aid.BonusApplied").replace("{bonus}", aidBonus)}</strong></p>`;
    }

    await ChatMessage.create({
      content: `<div class="ultimate-harvester-card">
        <h3><i class="fas fa-hands-helping"></i> ${game.i18n.localize("MHARVEST.Aid.ChatHeader")}</h3>
        <ul class="ultimate-harvester-item-list">${aidListHtml}</ul>
        ${bonusLine}
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: forager }),
    });
  }

  const timeSpent = hours * 60; // minutes

  // Roll skill check
  const rollResult = await _rollForageCheck(forager, primarySkill);
  if (!rollResult) return;

  // Apply aid bonus to the roll total
  const { isNat20, d20 } = rollResult;
  const total = rollResult.total + aidBonus;

  // Margin-of-success bonus: calculated per-tier for quantity scaling (see bundle loop below)
  const globalMargin = Math.floor(Math.max(0, total - adjustedDCs[0]) / 5);

  // Determine which tiers are qualified (cumulative — all tiers up to and including highest)
  const qualifiedTiers = [];
  for (let i = 0; i < adjustedDCs.length; i++) {
    if (total >= adjustedDCs[i]) qualifiedTiers.push(i);
  }
  // Rare tier on nat 18+ (v2: expanded from nat 20 only)
  if (d20 >= FORAGE_RARE_THRESHOLD) qualifiedTiers.push(3);

  // Build the outcome description
  const tierDescLabels = ["Basic finds", "Successful forage", "Bountiful haul", "Rare discovery!"];
  const tierIcons = ["fa-seedling", "fa-leaf", "fa-tree", "fa-star"];
  const highestQualified = qualifiedTiers.length > 0 ? qualifiedTiers[qualifiedTiers.length - 1] : -1;

  // Roll breakdown: "Rolled 15 +2 aid = 17" or just "15"
  let rollLine = `${rollResult.total}`;
  if (aidBonus > 0) rollLine += ` +${aidBonus} aid = <strong>${total}</strong>`;
  else rollLine = `<strong>${total}</strong>`;

  // Adjustment notes
  const adjustNotes = [];
  if (hourReduction > 0) adjustNotes.push(`DCs reduced by ${hourReduction} (${hours} hours)`);
  if (aidBonus > 0) adjustNotes.push(`+${aidBonus} aid bonus from allies`);

  // Outcome line
  let outcomeHtml;
  if (highestQualified < 0) {
    outcomeHtml = `<p class="ultimate-harvester-crit-fail"><i class="fas fa-times-circle"></i> Failed — found nothing useful.</p>`;
  } else {
    const outLabel = tierDescLabels[highestQualified];
    const outIcon = tierIcons[highestQualified];
    outcomeHtml = `<p style="font-weight:bold; margin-top:0.3rem;"><i class="fas ${outIcon} ultimate-harvester-icon--success"></i> Success — ${outLabel.toLowerCase()}!</p>`;
  }

  // Combined in-character + breakdown card
  await ChatMessage.create({
    content: `<div class="ultimate-harvester-card">
      <p><strong>${forager.name}</strong> spends ${formatTime(timeSpent)} foraging in the ${envDef.label}${aiders.length > 0 ? ` with ${aiders.map((a) => a.name).join(" and ")}` : ""}.</p>
      <hr style="border:none; border-top:1px solid var(--mharvest-border-light); margin:0.3rem 0;">
      <p class="ultimate-harvester-note"><i class="fas fa-leaf ultimate-harvester-icon--success"></i> <strong>${envDef.label}</strong> — Standard DC ${tierDCs[0]}</p>
      ${adjustNotes.length > 0 ? adjustNotes.map((n) => `<p class="ultimate-harvester-note"><i class="fas fa-angle-right"></i> ${n}</p>`).join("") : ""}
      <p><i class="fas fa-dice-d20"></i> Rolled ${rollLine} vs DC ${adjustedDCs[0]}</p>
      ${outcomeHtml}
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor: forager }),
  });

  if (qualifiedTiers.length === 0) {
    // Check for failure event trigger
    const failMargin = adjustedDCs[0] - total;
    const isNat1 = rollResult.d20 === 1;
    const failureEvent = await _checkFailureEvent(forager, isNat1, failMargin, config, aiders);

    if (failureEvent) {
      await ChatMessage.create({
        content: `<div class="ultimate-harvester-card">
          <div class="ultimate-harvester-failure-event">
            <p class="ultimate-harvester-failure-header"><i class="${failureEvent.icon} ultimate-harvester-icon--danger"></i> <strong>${failureEvent.label}</strong></p>
            <p>${failureEvent.resolvedDescription}</p>
          </div>
          <p class="ultimate-harvester-note"><i class="fas fa-eye ultimate-harvester-icon--warning"></i> ${game.i18n.localize("MHARVEST.Chat.ThreatReminder")}</p>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor: forager }),
      });
    }
    return;
  }

  // --- v2 Bundle System: percentage-based tier distribution ---
  const tierNames = { 1: "Tier 1", 2: "Tier 2", 3: "Tier 3", 4: "Rare" };
  let foragedItems = [];
  // Highest normal tier (0-2 index → 1-3 tier number), excluding Rare (index 3)
  const highestNormalIdx = [...qualifiedTiers].filter((t) => t < 3).pop() ?? 0;
  const highestNormalTier = highestNormalIdx + 1;
  const highestTier = qualifiedTiers[qualifiedTiers.length - 1];
  const hasRare = qualifiedTiers.includes(3);

  // Resolve the biome config key from the environment definition
  const biomeKey = Object.entries(FORAGING_ENVIRONMENTS).find(([, v]) => v === envDef)?.[0];
  if (!biomeKey) {
    return ui.notifications.warn(`Unknown environment config for ${envDef.label}`);
  }

  // Stack count: 1d2+1 base, +1 per tier beyond Tier 1, +1 for Rare
  const baseStacks = await new Roll("1d2+1").evaluate();
  const tierBonus = Math.max(0, highestNormalTier - 1); // +0 for T1, +1 for T2, +2 for T3
  const totalStacks = baseStacks.total + tierBonus;

  // Margin from highest normal tier's DC (for distribution shift)
  const highestDC = highestNormalIdx < adjustedDCs.length
    ? adjustedDCs[highestNormalIdx]
    : adjustedDCs[adjustedDCs.length - 1];
  const marginBonus = Math.floor(Math.max(0, total - highestDC) / 5);

  // Track drawn items per tier to prevent duplicates within same tier
  const excludeByTier = {};

  let drawPosition = 0;

  // Draw regular stacks using tier distribution
  for (let s = 0; s < totalStacks; s++) {
    // Determine which tier this stack draws from using percentage distribution
    const drawTier = _rollTierDistribution(highestNormalTier, marginBonus);
    const tierLabel = tierNames[drawTier] ?? "Tier 1";

    // Per-tier margin for quantity die
    const tierDCIdx = drawTier - 1;
    const tierDC = tierDCIdx < adjustedDCs.length ? adjustedDCs[tierDCIdx] : adjustedDCs[adjustedDCs.length - 1];
    const tierMargin = Math.floor(Math.max(0, total - tierDC) / 5);
    const qtyDie = FORAGE_QUANTITY_DICE[Math.min(tierMargin, FORAGE_QUANTITY_DICE.length - 1)];

    // Survival-first category constraint
    const categoryConstraint = _getCategoryConstraint(drawPosition);

    if (!excludeByTier[drawTier]) excludeByTier[drawTier] = new Set();
    const poolEntry = await drawFromPool(biomeKey, drawTier, categoryConstraint, excludeByTier[drawTier]);
    if (!poolEntry) {
      console.warn(`${MODULE_ID} | No pool entry for ${biomeKey}/tier${drawTier}/${categoryConstraint ?? "any"}`);
      continue;
    }

    excludeByTier[drawTier].add(poolEntry.uuid);

    const quantityRoll = await new Roll(qtyDie).evaluate();

    let description = "";
    try {
      const sourceItem = await fromUuid(poolEntry.uuid);
      if (sourceItem) {
        const div = document.createElement("div");
        div.innerHTML = sourceItem.system.description?.value ?? "";
        description = div.textContent?.trim() ?? "";
      }
    } catch { /* ignore */ }

    foragedItems.push({
      name: poolEntry.name,
      uuid: poolEntry.uuid,
      quantity: quantityRoll.total,
      category: poolEntry.category,
      description,
      tierLabel,
    });

    drawPosition++;
  }

  // Rare stack: always exactly 1 if qualified, drawn from Rare pool
  if (hasRare) {
    const rareCat = _getCategoryConstraint(drawPosition);
    const rareEntry = await drawFromPool(biomeKey, 4, rareCat, null);
    if (rareEntry) {
      const rareQty = await new Roll("1d2").evaluate();
      let description = "";
      try {
        const sourceItem = await fromUuid(rareEntry.uuid);
        if (sourceItem) {
          const div = document.createElement("div");
          div.innerHTML = sourceItem.system.description?.value ?? "";
          description = div.textContent?.trim() ?? "";
        }
      } catch { /* ignore */ }

      foragedItems.push({
        name: rareEntry.name,
        uuid: rareEntry.uuid,
        quantity: rareQty.total,
        category: rareEntry.category,
        description,
        tierLabel: "Rare",
      });
    }
  }

  // Show pickup dialog if items were found
  const tierDesc = tierDescLabels[highestTier];

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
    <p><strong>${forager.name}</strong> foraged in the ${envDef.label} (rolled ${aidBonus > 0 ? `${rollResult.total} +${aidBonus} aid = ${total}` : `${total}`}, ${primaryLabel}${globalMargin > 0 ? `, +${globalMargin} quantity bonus` : ""})</p>
    <p><strong>${tierDesc}:</strong></p>
    <ul class="ultimate-harvester-item-list">${itemListHtml}</ul>
    ${d20 >= FORAGE_RARE_THRESHOLD ? `<p class="ultimate-harvester-nat20"><i class="fas fa-star ultimate-harvester-icon--gold"></i> Rare find!</p>` : ""}
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

/* ---- Tier Distribution & Draw Order ---- */

/**
 * Roll which tier pool a stack draws from, using the percentage-based
 * distribution table. Margin bonus shifts probability toward higher tiers.
 *
 * @param {number} highestTier - Highest normal qualifying tier (1-3)
 * @param {number} margin - Margin-of-success bonus (shifts +10% per point)
 * @returns {number} Tier number to draw from (1-3)
 */
function _rollTierDistribution(highestTier, margin) {
  const baseDist = FORAGE_TIER_DISTRIBUTION[highestTier];
  if (!baseDist || baseDist.length === 1) return 1; // Tier 1 only

  // Apply margin shift: move probability from lowest tier to highest
  // Each margin point shifts 10% (FORAGE_MARGIN_SHIFT) from T1 → highest
  const shift = Math.min(margin * FORAGE_MARGIN_SHIFT, baseDist[0][0] - 10); // Don't reduce T1 below 10%

  // Build adjusted thresholds (deep copy to avoid mutating config)
  const adjusted = baseDist.map(([threshold, tier]) => [Number(threshold), Number(tier)]);
  if (shift > 0 && adjusted.length > 1) {
    adjusted[0][0] -= shift; // Reduce lowest tier %
    // Add shift to highest tier (by reducing the second-to-last threshold)
    adjusted[adjusted.length - 2][0] -= shift;
  }

  const roll = Math.floor(Math.random() * 100) + 1; // 1-100
  for (const [threshold, tier] of adjusted) {
    if (roll <= threshold) return tier;
  }
  return 1; // fallback
}

/**
 * Return the category constraint for a given draw position (across all tiers).
 *   Position 0-1: must be food (survival essentials first)
 *   Position 2:   must NOT be food (guaranteed variety)
 *   Position 3+:  no constraint
 * @param {number} position - Zero-based draw position
 * @returns {string|null} "food", "non-food", or null
 */
function _getCategoryConstraint(position) {
  if (position <= 1) return "food";
  if (position === 2) return "non-food";
  return null;
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

/**
 * Helper: read current aiders from Foundry targeting, excluding the forager.
 * @param {Actor} forager
 * @returns {Actor[]} Up to 2 aiding actors
 */
function _getAiders(forager) {
  return Array.from(game.user.targets)
    .map((t) => t.actor)
    .filter((a) => a && a.id !== forager.id)
    .slice(0, 2);
}

/**
 * Update the aid section DOM inside the forage prompt dialog.
 * @param {HTMLElement} el - Dialog element
 * @param {Actor} forager
 */
function _refreshAidDisplay(el, forager) {
  const container = el.querySelector("[data-aid-content]");
  if (!container) return;
  const aiders = _getAiders(forager);
  const badge = el.querySelector("[data-aid-badge]");

  if (aiders.length > 0) {
    const names = aiders.map((a) => a.name).join(", ");
    container.innerHTML = `
      <div class="ultimate-harvester-aid-row">
        <i class="fas fa-crosshairs"></i>
        <span>${names}</span>
      </div>
      <div class="ultimate-harvester-aid-hint">
        <i class="fas fa-dice-d20 ultimate-harvester-icon--success"></i>
        <small>${game.i18n.localize("MHARVEST.Aid.RollHint")}</small>
      </div>`;
    if (badge) {
      badge.textContent = aiders.length;
      badge.style.display = "";
    }
  } else {
    container.innerHTML = `<p class="ultimate-harvester-empty" style="padding: 0.4rem 0;">${game.i18n.localize("MHARVEST.Aid.SelectHint")}</p>`;
    if (badge) badge.style.display = "none";
  }
}

async function _showForagePrompt(forager, envDef, primaryLabel, secondaryLabel, tierDCs) {
  const aiders = _getAiders(forager);
  const content = await renderTemplate(`modules/${MODULE_ID}/templates/forage-prompt.hbs`, {
    foragerName: forager.name,
    environment: envDef.label,
    primarySkill: primaryLabel,
    secondarySkill: secondaryLabel,
    tier1DC: tierDCs[0],
    tier2DC: tierDCs[1],
    tier3DC: tierDCs[2],
    hasAiders: aiders.length > 0,
    aiderCount: aiders.length,
    aiderNames: aiders.map((a) => a.name).join(", "),
  });

  return showDialog({
    title: `Foraging — ${envDef.label}`,
    content,
    buttons: {
      forage: {
        label: game.i18n.localize("MHARVEST.Dialog.ForageTitle"),
        icon: "fas fa-leaf",
        callback: (el) => {
          const hours = parseInt(el.querySelector("input[name='hours']")?.value) || 0;
          // Read aiders fresh at submit time
          const finalAiders = _getAiders(forager);
          if (finalAiders.length > 2) {
            ui.notifications.warn(game.i18n.localize("MHARVEST.Aid.TooMany"));
          }
          return { hours: Math.max(0, Math.min(hours, 6)), aiders: finalAiders };
        },
      },
      cancel: {
        label: game.i18n.localize("MHARVEST.Dialog.Cancel"),
        icon: "fas fa-times",
        callback: () => null,
      },
    },
    defaultButton: "forage",
    render: (el) => {
      // Spinner buttons
      const input = el.querySelector("input[name='hours']");
      el.querySelectorAll(".ultimate-harvester-spinner-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const dir = parseInt(btn.dataset.dir);
          const val = Math.min(6, Math.max(0, parseInt(input.value || 0) + dir));
          input.value = val;
        });
      });

      // Reactive aid display — update when targets change
      _refreshAidDisplay(el, forager);
      const hookId = Hooks.on("targetToken", () => _refreshAidDisplay(el, forager));

      // Clean up hook when dialog is removed from DOM
      const observer = new MutationObserver(() => {
        if (!document.body.contains(el)) {
          Hooks.off("targetToken", hookId);
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },
  });
}

/* ---- Failure Event Logic ---- */

/**
 * Check whether a failed forage triggers a failure event.
 * Nat 1 = always. Otherwise 1% chance per point missed below lowest tier DC.
 * GM "arm next failure" override forces the event regardless.
 * When triggered, effects apply to forager AND all aiders.
 * @param {Actor} forager
 * @param {boolean} isNat1
 * @param {number} failMargin
 * @param {object} foragingConfig
 * @param {Actor[]} [aiders=[]] - Aiding characters who also suffer failure effects
 * @returns {object|null} Resolved failure event or null
 */
async function _checkFailureEvent(forager, isNat1, failMargin, foragingConfig, aiders = []) {
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
  const chosenEventId = foragingConfig.failureEventChoice ?? "";
  if (armed) {
    const updatedConfig = foundry.utils.deepClone(foragingConfig);
    updatedConfig.failureEventArmed = false;
    updatedConfig.failureEventChoice = "";
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

  // If GM chose a specific event, find it directly; otherwise random draw
  let result;
  if (armed && chosenEventId) {
    result = table.results.contents.find(
      (r) => (r.flags?.[MODULE_ID]?.eventId ?? r.id) === chosenEventId
    );
    if (!result) {
      console.warn(`${MODULE_ID} | Chosen failure event "${chosenEventId}" not found, falling back to random.`);
    }
  }
  if (!result) {
    const draw = await table.draw({ displayChat: false });
    if (!draw.results.length) return null;
    result = draw.results[0];
  }
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

    // Apply damage to forager + all aiders
    if (event.auto === "damage" || event.auto === "damage+effect") {
      await _applyDamage(forager, damageTotal, flags.damageType);
      for (const aider of aiders) {
        await _applyDamage(aider, damageTotal, flags.damageType);
      }
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

  // All affected characters = forager + aiders
  const allAffected = [forager, ...aiders];

  // Auto-apply exhaustion to all affected
  if (event.auto === "exhaustion") {
    for (const actor of allAffected) {
      await _applyExhaustion(actor);
    }
  }

  // Auto-halve ammo for all affected
  if (event.auto === "ammo") {
    for (const actor of allAffected) {
      await _halveAmmo(actor);
    }
  }

  // Auto-apply ActiveEffect debuff to all affected
  if (event.auto === "effect" || event.auto === "damage+effect") {
    if (flags.effectName) {
      const effectDef = {
        name: flags.effectName,
        icon: flags.effectIcon ?? "icons/svg/aura.svg",
        durationHours: flags.effectDurationHours ?? 24,
        changes: flags.effectChanges ?? [],
        description: flags.effectDescription ?? "",
      };
      for (const actor of allAffected) {
        await _applyDebuffEffect(actor, effectDef);
      }
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
    const originalQty = target.system.quantity;
    const newQty = Math.floor(originalQty / 2);
    await actor.updateEmbeddedDocuments("Item", [{ _id: target.id, "system.quantity": newQty }]);
    ui.notifications.warn(`${actor.name} loses half their ${target.name} (${originalQty} → ${newQty})!`);
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

/**
 * Roll a skill check silently (no dialog, no chat message).
 * Constructs the roll directly from the actor's skill modifier.
 * Used for aid rolls where we just need the total.
 * @param {Actor} actor
 * @param {string} skillId - dnd5e skill abbreviation (e.g., "sur")
 * @returns {Promise<{total: number, d20: number}|null>}
 */
async function _rollSilentSkillCheck(actor, skillId) {
  try {
    const skill = actor.system.skills?.[skillId];
    if (!skill) return null;
    const modifier = skill.total ?? 0;
    const roll = await new Roll(`1d20 + ${modifier}`).evaluate();

    // Post a minimal chat card so players can see the result
    await ChatMessage.create({
      flavor: `${actor.name} — Survival (Aid)`,
      rolls: [roll],
      speaker: ChatMessage.getSpeaker({ actor }),
    });

    const d20 = roll.dice?.[0]?.total ?? roll.terms?.[0]?.total;
    return { total: roll.total, d20 };
  } catch (err) {
    console.error(`${MODULE_ID} | Silent skill check failed for ${actor.name}:`, err);
    return null;
  }
}

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
