/**
 * The map title bar: an always-editable title plus the document actions.
 *
 * The global lock deliberately keeps pan, zoom, save and export working; it
 * only blocks edits, so a finished map stays fully browsable.
 */
import { requestRender } from "../render/renderer.js";
import { on, setStatus, state, updateSettings } from "../state/store.js";

const $ = (id) => document.getElementById(id);

function syncLock() {
  const button = $("action-lock");
  button.textContent = state.locked ? "Unlock map" : "Lock map";
  button.setAttribute("aria-pressed", String(state.locked));
}

export function syncTitlebar() {
  $("map-title").value = state.map.title;
  syncLock();
}

export function initTitlebar(actions) {
  const titleInput = $("map-title");
  let titleBefore = state.map.title;

  titleInput.addEventListener("focus", () => { titleBefore = state.map.title; });
  titleInput.addEventListener("change", () => {
    const title = titleInput.value.trim() || "Untitled Realm";
    titleInput.value = title;
    state.map.title = titleBefore;
    updateSettings(state.map, { title }, "Rename map", "document");
    requestRender();
  });

  $("action-new").addEventListener("click", () => {
    if (!window.confirm("Start a new blank map? Anything unsaved is replaced.")) return;
    actions.newMap();
  });

  $("action-reset").addEventListener("click", () => {
    if (!window.confirm("Clear all terrain, objects and legend entries from this map?")) return;
    actions.resetMap();
  });

  $("action-lock").addEventListener("click", () => {
    state.locked = !state.locked;
    syncLock();
    setStatus(state.locked
      ? "Map locked. Panning, zooming, saving and exporting still work."
      : "Map unlocked.");
  });

  on("document", syncTitlebar);
  syncTitlebar();
}
