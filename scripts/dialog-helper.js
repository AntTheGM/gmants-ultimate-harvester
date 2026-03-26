/**
 * Ultimate Harvester — Dialog Helper
 * Wraps Foundry DialogV2 with module CSS class for theme scoping.
 */

import { MODULE_ID } from "./config.js";

const DialogV2 = foundry.applications.api.DialogV2;

/**
 * Show a dialog with Ultimate Harvester theming.
 * @param {object} opts
 * @param {string} opts.title - Window title
 * @param {string} opts.content - HTML content
 * @param {object} opts.buttons - Map of {id: {label, icon, callback}}
 * @param {string} [opts.defaultButton] - Default button id
 * @param {number} [opts.width] - Dialog width
 * @returns {Promise<*>} Result from the clicked button's callback
 */
export async function showDialog({ title, content, buttons, defaultButton, width }) {
  const buttonArray = Object.entries(buttons).map(([action, btn]) => ({
    action,
    label: btn.label,
    icon: btn.icon ?? "",
    default: action === defaultButton,
    callback: btn.callback
      ? (event, button, dialog) => btn.callback(dialog.element)
      : undefined,
  }));

  let resolvePromise;
  const resultPromise = new Promise((resolve) => { resolvePromise = resolve; });

  const dlg = new DialogV2({
    window: { title },
    classes: ["ultimate-harvester"],
    content,
    buttons: buttonArray,
    submit: (result) => resolvePromise(result),
    close: () => resolvePromise(null),
    position: { width: width ?? 400 },
  });

  dlg.render({ force: true });
  return resultPromise;
}

/**
 * Show a modal dialog (no form, just content + close button).
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.content
 * @param {number} [opts.width]
 * @returns {DialogV2} The dialog instance (for closing programmatically)
 */
export function showModal({ title, content, width }) {
  const dlg = new DialogV2({
    window: { title },
    classes: ["ultimate-harvester"],
    content,
    buttons: [{
      action: "close",
      label: "Close",
      icon: "fas fa-times",
      default: true,
    }],
    position: { width: width ?? 420 },
  });

  dlg.render({ force: true });
  return dlg;
}
