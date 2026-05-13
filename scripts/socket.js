/**
 * Ultimate Harvester — Socket Helpers
 * Required socketlib integration for cross-ownership operations.
 */

import { MODULE_ID } from "./config.js";

/** @type {SocketlibSocket|null} */
let socket = null;

/**
 * Initialize socketlib registration. Handles both init orderings:
 * - If socketlib's init has already run, `window.socketlib` is defined and the
 *   `socketlib.ready` hook has already fired — we must register now or we'll
 *   miss it entirely.
 * - If socketlib hasn't initialized yet, defer to the `socketlib.ready` hook.
 */
export function initSocket() {
  if (typeof socketlib !== "undefined") {
    _registerSocket();
  } else {
    Hooks.once("socketlib.ready", () => _registerSocket());
  }
}

function _registerSocket() {
  if (typeof socketlib === "undefined") {
    console.error(`${MODULE_ID} | socketlib is not loaded; cross-ownership harvesting will fail.`);
    return;
  }
  socket = socketlib.registerModule(MODULE_ID);
  if (!socket) {
    console.error(`${MODULE_ID} | socketlib.registerModule returned undefined.`);
    return;
  }
  socket.register("setFlag", _gmSetFlag);
  socket.register("unsetFlag", _gmUnsetFlag);
  socket.register("createEmbeddedDocuments", _gmCreateEmbeddedDocuments);
  console.log(`${MODULE_ID} | socketlib registered successfully`);
}

/* ---- GM-side handler implementations ---- */

async function _gmSetFlag(actorUuid, scope, key, value) {
  const actor = await fromUuid(actorUuid);
  if (!actor) throw new Error(`Actor not found: ${actorUuid}`);
  return actor.setFlag(scope, key, value);
}

async function _gmUnsetFlag(actorUuid, scope, key) {
  const actor = await fromUuid(actorUuid);
  if (!actor) throw new Error(`Actor not found: ${actorUuid}`);
  return actor.unsetFlag(scope, key);
}

async function _gmCreateEmbeddedDocuments(actorUuid, documentName, dataArray, options = {}) {
  const actor = await fromUuid(actorUuid);
  if (!actor) throw new Error(`Actor not found: ${actorUuid}`);
  return actor.createEmbeddedDocuments(documentName, dataArray, options);
}

/* ---- Public helper functions ---- */

/**
 * Route through GM if the current user is not a GM. The harvester only ever
 * writes to NPC creatures (never the player's own character), so it's safe and
 * far more reliable to use `game.user.isGM` than `actor.isOwner` — the latter
 * can be unexpectedly true on synthetic token actors or when other modules
 * grant ownership-on-death.
 *
 * If we'd need to route but socketlib isn't registered, throw a clear error
 * rather than falling through to a direct write (which produces Foundry's
 * cryptic ActorDelta permission error).
 */
function _viaGM(handler, actor, ...args) {
  if (game.user.isGM) return null;
  if (!socket) {
    console.error(`${MODULE_ID} | _viaGM called with no socket`, {
      handler,
      actorUuid: actor?.uuid,
      socketlibLoaded: typeof socketlib !== "undefined",
      socketlibActive: game.modules?.get("socketlib")?.active,
    });
    const msg = game.i18n?.localize?.("MHARVEST.Error.SocketRequired")
      ?? "Ultimate Harvester requires socketlib to be enabled to harvest creatures you don't own.";
    ui.notifications.error(msg);
    throw new Error(`[${MODULE_ID}] socketlib not registered; cannot ${handler} on non-owned actor ${actor.uuid}.`);
  }
  console.debug(`${MODULE_ID} | routing ${handler} via GM for ${actor?.uuid}`);
  return socket.executeAsGM(handler, actor.uuid, ...args)
    .then((result) => {
      console.debug(`${MODULE_ID} | ${handler} via GM resolved`, { actorUuid: actor?.uuid });
      return result;
    })
    .catch((err) => {
      console.error(`${MODULE_ID} | ${handler} via GM FAILED`, { actorUuid: actor?.uuid, err });
      ui.notifications.error(`Ultimate Harvester: GM-side ${handler} failed. Check the F12 console. Most likely the GM client needs to F5 to pick up the latest socket registration.`);
      throw err;
    });
}

/**
 * Set a flag on an actor, routing through GM if the current user lacks ownership.
 */
export async function gmSetFlag(actor, scope, key, value) {
  return _viaGM("setFlag", actor, scope, key, value)
    ?? actor.setFlag(scope, key, value);
}

/**
 * Unset a flag on an actor, routing through GM if the current user lacks ownership.
 */
export async function gmUnsetFlag(actor, scope, key) {
  return _viaGM("unsetFlag", actor, scope, key)
    ?? actor.unsetFlag(scope, key);
}

/**
 * Create embedded documents on an actor, routing through GM if needed.
 */
export async function gmCreateEmbeddedDocuments(actor, documentName, dataArray, options = {}) {
  return _viaGM("createEmbeddedDocuments", actor, documentName, dataArray, options)
    ?? actor.createEmbeddedDocuments(documentName, dataArray, options);
}
