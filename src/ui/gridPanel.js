/**
 * Grid overlay controls.
 *
 * The grid is a composite-time pass, so every change here is a cheap restyle:
 * nothing is rasterised and the terrain underneath is untouched.
 */
import { requestRender } from "../render/renderer.js";
import { on, state, updateSettings } from "../state/store.js";

const $ = (id) => document.getElementById(id);

export function syncGridPanel() {
  $("grid-style").value = state.grid.style;
  $("grid-size").value = String(state.grid.size);
  $("grid-width").value = String(state.grid.width);
  $("grid-offset-x").value = String(state.grid.offsetX);
  $("grid-offset-y").value = String(state.grid.offsetY);
  $("grid-color").value = state.grid.color;
  $("grid-alpha").value = String(Math.round(state.grid.alpha * 100));
  $("grid-alpha-value").value = `${Math.round(state.grid.alpha * 100)}%`;
  $("grid-labels").checked = state.grid.labels;
  $("grid-export").checked = state.grid.includeInExport;
  const exportGrid = $("export-grid");
  if (exportGrid) exportGrid.checked = state.grid.includeInExport;
}

/**
 * Bind one control. `live` previews while dragging; the undoable command is
 * recorded on `change`, so a slider drag is a single history entry.
 */
function bind(id, key, { read, format } = {}) {
  const element = $(id);
  let before = state.grid[key];

  element.addEventListener("pointerdown", () => { before = state.grid[key]; });
  element.addEventListener("focus", () => { before = state.grid[key]; });

  element.addEventListener("input", () => {
    state.grid[key] = read(element);
    if (format) format(element);
    requestRender();
  });

  element.addEventListener("change", () => {
    const next = read(element);
    state.grid[key] = before;
    updateSettings(state.grid, { [key]: next }, "Change grid", "grid");
    requestRender();
  });
}

export function initGridPanel() {
  bind("grid-style", "style", { read: (element) => element.value });
  bind("grid-size", "size", { read: (element) => Math.max(8, Number(element.value) || 8) });
  bind("grid-width", "width", { read: (element) => Math.max(0.25, Number(element.value) || 1) });
  bind("grid-offset-x", "offsetX", { read: (element) => Number(element.value) || 0 });
  bind("grid-offset-y", "offsetY", { read: (element) => Number(element.value) || 0 });
  bind("grid-color", "color", { read: (element) => element.value });
  bind("grid-alpha", "alpha", {
    read: (element) => Number(element.value) / 100,
    format: (element) => { $("grid-alpha-value").value = `${element.value}%`; },
  });
  bind("grid-labels", "labels", { read: (element) => element.checked });
  bind("grid-export", "includeInExport", { read: (element) => element.checked });

  on("grid", () => {
    syncGridPanel();
    requestRender();
  });
  on("document", syncGridPanel);
  syncGridPanel();
}
