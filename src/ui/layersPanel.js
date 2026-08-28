/**
 * Layers panel: fixed terrain order with per-layer visibility, opacity and
 * lock, plus the active-layer selector. Layers that have never been drawn
 * into are shown dimmed, which makes the lazy allocation visible to the user.
 */
import { hasPixels } from "../render/layers.js";
import { requestRender } from "../render/renderer.js";
import { on, setStatus, state, updateSettings } from "../state/store.js";

const $ = (id) => document.getElementById(id);

function layerRow(layer) {
  const row = document.createElement("div");
  row.className = "layer";
  row.dataset.active = String(state.activeLayer === layer.id);
  row.dataset.empty = String(!hasPixels(layer.id));

  const visible = document.createElement("input");
  visible.type = "checkbox";
  visible.checked = layer.visible;
  visible.id = `layer-visible-${layer.id}`;
  visible.setAttribute("aria-label", `Show the ${layer.label} layer`);
  visible.addEventListener("change", () => {
    updateSettings(layer, { visible: visible.checked }, `Toggle ${layer.label}`, "layers");
    requestRender();
  });

  const name = document.createElement("button");
  name.type = "button";
  name.className = "layer-name";
  name.textContent = layer.label;
  name.title = `Set ${layer.label} as the active layer`;
  name.addEventListener("click", () => {
    state.activeLayer = layer.id;
    renderLayersPanel();
    setStatus(`${layer.label} is now the active layer.`);
  });

  const lock = document.createElement("button");
  lock.type = "button";
  lock.className = "icon-toggle";
  lock.textContent = layer.locked ? "Locked" : "Open";
  lock.setAttribute("aria-pressed", String(layer.locked));
  lock.setAttribute("aria-label", `${layer.locked ? "Unlock" : "Lock"} the ${layer.label} layer`);
  lock.addEventListener("click", () => {
    updateSettings(layer, { locked: !layer.locked }, `Lock ${layer.label}`, "layers");
  });

  const opacity = document.createElement("input");
  opacity.type = "range";
  opacity.className = "layer-opacity";
  opacity.min = "0";
  opacity.max = "100";
  opacity.value = String(Math.round(layer.opacity * 100));
  opacity.setAttribute("aria-label", `${layer.label} opacity`);
  let opacityBefore = layer.opacity;
  opacity.addEventListener("pointerdown", () => { opacityBefore = layer.opacity; });
  opacity.addEventListener("input", () => {
    layer.opacity = Number(opacity.value) / 100;
    requestRender();
  });
  opacity.addEventListener("change", () => {
    const next = Number(opacity.value) / 100;
    layer.opacity = opacityBefore;
    updateSettings(layer, { opacity: next }, `${layer.label} opacity`, "layers");
    requestRender();
  });

  row.append(visible, name, lock, opacity);
  return row;
}

export function renderLayersPanel() {
  const panel = $("layers-panel");
  panel.innerHTML = "";
  for (const layer of state.layers) panel.append(layerRow(layer));

  const select = $("active-layer");
  select.innerHTML = "";
  for (const layer of state.layers) {
    const option = document.createElement("option");
    option.value = layer.id;
    option.textContent = layer.label;
    select.append(option);
  }
  select.value = state.activeLayer;
}

export function initLayersPanel() {
  $("active-layer").addEventListener("change", (event) => {
    state.activeLayer = event.target.value;
    renderLayersPanel();
  });
  on("layers", () => {
    renderLayersPanel();
    requestRender();
  });
  on("document", renderLayersPanel);
  renderLayersPanel();
}
