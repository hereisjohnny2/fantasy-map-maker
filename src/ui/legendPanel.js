/**
 * Legend panel: rename, show/hide, reorder, delete and click-to-pan.
 *
 * Legend order is independent of draw order, so reordering the list never
 * changes what covers what on the map.
 */
import { requestRender } from "../render/renderer.js";
import { centreOn } from "../render/view.js";
import {
  deleteLegendEntry, moveLegendEntry, on, setSelection, setStatus, state, updateLegendEntry,
} from "../state/store.js";

const $ = (id) => document.getElementById(id);

function entryRow(entry, index) {
  const row = document.createElement("div");
  row.className = "legend-entry";
  row.dataset.hidden = String(entry.visible === false);

  const target = document.createElement("button");
  target.type = "button";
  target.className = "legend-target";
  target.title = `Pan to ${entry.name}`;
  target.append(document.createTextNode(entry.name));
  const kind = document.createElement("span");
  kind.className = "legend-kind";
  kind.textContent = ` ${entry.kind}`;
  target.append(kind);
  target.addEventListener("click", () => {
    centreOn(entry.x, entry.y);
    if (entry.objectId) setSelection(entry.objectId);
    requestRender();
    setStatus(`Centred on "${entry.name}".`);
  });

  const rename = document.createElement("button");
  rename.type = "button";
  rename.textContent = "Name";
  rename.title = `Rename ${entry.name}`;
  rename.addEventListener("click", () => {
    const typed = window.prompt("Legend entry name:", entry.name);
    if (typed === null) return;
    const name = typed.trim();
    if (!name) {
      setStatus("A legend entry needs a name.", "error");
      return;
    }
    updateLegendEntry(entry.id, { name }, "Rename entry");
  });

  const visibility = document.createElement("button");
  visibility.type = "button";
  visibility.textContent = entry.visible === false ? "Show" : "Hide";
  visibility.setAttribute("aria-pressed", String(entry.visible === false));
  visibility.addEventListener("click", () => {
    updateLegendEntry(entry.id, { visible: entry.visible === false }, "Toggle entry");
    requestRender();
  });

  const up = document.createElement("button");
  up.type = "button";
  up.textContent = "Up";
  up.disabled = index === 0;
  up.title = "Move earlier in the legend";
  up.addEventListener("click", () => moveLegendEntry(entry.id, -1));

  const down = document.createElement("button");
  down.type = "button";
  down.textContent = "Down";
  down.disabled = index === state.legend.length - 1;
  down.title = "Move later in the legend";
  down.addEventListener("click", () => moveLegendEntry(entry.id, 1));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger";
  remove.textContent = "Del";
  remove.title = entry.objectId ? "Delete this entry and its map object" : "Delete this entry";
  remove.addEventListener("click", () => {
    deleteLegendEntry(entry.id);
    requestRender();
  });

  const controls = document.createElement("span");
  controls.append(up, down);

  row.append(target, rename, visibility, controls, remove);
  return row;
}

export function renderLegendPanel() {
  const panel = $("legend-panel");
  panel.innerHTML = "";
  if (!state.legend.length) {
    const hint = document.createElement("p");
    hint.className = "muted";
    hint.textContent = "Markers, named paths and named terrain strokes appear here.";
    panel.append(hint);
    return;
  }
  state.legend.forEach((entry, index) => panel.append(entryRow(entry, index)));
}

export function initLegendPanel() {
  on("legend", renderLegendPanel);
  on("document", renderLegendPanel);
  renderLegendPanel();
}
