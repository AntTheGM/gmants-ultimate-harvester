/**
 * Ultimate Harvester — Socket Helpers
 * Optional socketlib integration for cross-ownership operations.
 * If socketlib is not installed, operations fall back to direct calls
 * (which will fail silently for non-owned NPCs).
 */

import { MODULE_ID } from "./config.js";

/** @type {SocketlibSocket|null} */
let socket = null;

/**
 * Initialize socketlib registration.
 * Handles both hook orderings: if socketlib is already loaded, register immediately;
 * otherwise defer to the socketlib.ready hook.
 */
export function initSocket() {
  if (typeof socketlib !== "undefined") {
    _registerSocket();
  } else {
    Hooks.once("socketlib.ready", () => _registerSocket());
  }
}

function _registerSocket() {
  socket = socketlib.registerModule(MODULE_ID);
  if (!socket) {
    console.error(`${MODULE_ID} | socketlib.registerModule returned undefined.`);
    return;
  }
  socket.register("setFlag", _gmSetFlag);
  socket.register("createEmbeddedDocuments", _gmCreateEmbeddedDocuments);
  console.log(`${MODULE_ID} | socketlib registered successfully`);
}

/* ---- GM-side handler implementations ---- */

async function _gmSetFlag(actorUuid, scope, key, value) {
  const actor = await fromUuid(actorUuid);
  if (!actor) throw new Error(`Actor not found: ${actorUuid}`);
  return actor.setFlag(scope, key, value);
}

async function _gmCreateEmbeddedDocuments(actorUuid, documentName, dataArray, options = {}) {
  const actor = await fromUuid(actorUuid);
  if (!actor) throw new Error(`Actor not found: ${actorUuid}`);
  return actor.createEmbeddedDocuments(documentName, dataArray, options);
}

/* ---- Public helper functions ---- */

/**
 * Route through GM if socket is available and user doesn't own the actor.
 * Returns null if direct call should be used instead.
 */
function _viaGM(handler, actor, ...args) {
  if (!socket || actor.isOwner) return null;
  return socket.executeAsGM(handler, actor.uuid, ...args);
}

/**
 * Set a flag on an actor, routing through GM if the current user lacks ownership.
 * @param {Actor} actor
 * @param {string} scope - Flag scope (e.g., MODULE_ID)
 * @param {string} key - Flag key
 * @param {*} value - Flag value
 * @returns {Promise}
 */
export async function gmSetFlag(actor, scope, key, value) {
  return _viaGM("setFlag", actor, scope, key, value)
    ?? actor.setFlag(scope, key, value);
}

/**
 * Create embedded documents on an actor, routing through GM if needed.
 * @param {Actor} actor
 * @param {string} documentName - e.g. "Item"
 * @param {object[]} dataArray
 * @param {object} [options={}]
 * @returns {Promise<Document[]>}
 */
export async function gmCreateEmbeddedDocuments(actor, documentName, dataArray, options = {}) {
  return _viaGM("createEmbeddedDocuments", actor, documentName, dataArray, options)
    ?? actor.createEmbeddedDocuments(documentName, dataArray, options);
}
