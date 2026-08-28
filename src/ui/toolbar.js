/**
 * Left rail: tool selection, per-tool options, view controls and the status
 * line. Tool option sections declare which tools they belong to with
 * `data-tool-options`, so adding a tool never means touching layout code.
 */
import { elementsPerDrop } from "../brush/scatter.js";
import { SYMBOLS, layerForSymbol } from "../brush/symbols.js";
import { requestRender } from "../render/renderer.js";
import { fit, view, zoomAt } from "../render/view.js";
import { history } from "../state/history.js";
import { FONT_FAMILIES, MARKER_TYPES, emit, getLayerMeta, on, setStatus, setTool, state } from "../state/store.js";
import { addFontFromFile } from "../io/textureLoader.js";
import { titleCase } from "../gen/nameGen.js";

const $ = (id) => document.getElementById(id);

function syncToolButtons() {
  for (const button of document.querySelectorAll(".tool")) {
    button.setAttribute("aria-pressed", String(button.dataset.tool === state.tool));
  }
  for (const section of document.querySelectorAll("[data-tool-options]")) {
    section.hidden = !section.dataset.toolOptions.split(/\s+/).includes(state.tool);
  }
}

export function refreshFontOptions() {
  const select = $("text-font");
  const families = [...FONT_FAMILIES, ...state.customFonts.map((font) => font.family)];
  select.innerHTML = "";
  for (const family of families) {
    const option = document.createElement("option");
    option.value = family;
    option.textContent = family;
    select.append(option);
  }
  if (!families.includes(state.text.font)) state.text.font = families[0];
  select.value = state.text.font;
}

export function refreshHistoryButtons() {
  $("action-undo").disabled = !history.canUndo;
  $("action-redo").disabled = !history.canRedo;
}

function updateScatterEstimate() {
  const count = elementsPerDrop(state.scatter.density, state.scatter.radius);
  $("scatter-estimate").textContent = `About ${count} element${count === 1 ? "" : "s"} per click.`;
}

/** Push current state values into the toolbar widgets. */
export function syncToolbar() {
  $("eraser-size").value = String(state.eraser.size);
  $("eraser-size-value").value = `${state.eraser.size} px`;
  $("eraser-opacity").value = String(Math.round(state.eraser.opacity * 100));
  $("eraser-opacity-value").value = `${Math.round(state.eraser.opacity * 100)}%`;
  $("eraser-hardness").value = String(Math.round(state.eraser.hardness * 100));
  $("eraser-hardness-value").value = `${Math.round(state.eraser.hardness * 100)}%`;
  $("scatter-symbol").value = state.scatter.symbol;
  $("scatter-density").value = String(state.scatter.density);
  $("scatter-density-value").value = String(state.scatter.density);
  $("scatter-radius").value = String(state.scatter.radius);
  $("scatter-radius-value").value = `${state.scatter.radius} px`;
  $("scatter-size").value = String(state.scatter.size);
  $("scatter-size-value").value = `${state.scatter.size} px`;
  $("scatter-jitter").value = String(Math.round(state.scatter.jitter * 100));
  $("scatter-jitter-value").value = `${Math.round(state.scatter.jitter * 100)}%`;
  updateScatterEstimate();
  $("marker-type").value = state.marker.type;
  $("marker-size").value = String(state.marker.size);
  $("marker-size-value").value = `${state.marker.size} px`;
  $("path-preset").value = state.path.preset;
  $("compass-style").value = state.compass.style;
  $("text-size").value = String(state.text.size);
  $("text-size-value").value = `${state.text.size} px`;
  refreshFontOptions();
  syncToolButtons();
}

export function initToolbar() {
  const markerSelect = $("marker-type");
  for (const type of MARKER_TYPES) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = titleCase(type);
    markerSelect.append(option);
  }

  const symbolSelect = $("scatter-symbol");
  for (const symbol of SYMBOLS) {
    const option = document.createElement("option");
    option.value = symbol.id;
    option.textContent = symbol.label;
    symbolSelect.append(option);
  }

  for (const button of document.querySelectorAll(".tool")) {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  }

  $("eraser-size").addEventListener("input", (event) => {
    state.eraser.size = Number(event.target.value);
    $("eraser-size-value").value = `${state.eraser.size} px`;
  });
  $("eraser-opacity").addEventListener("input", (event) => {
    state.eraser.opacity = Number(event.target.value) / 100;
    $("eraser-opacity-value").value = `${event.target.value}%`;
  });
  $("eraser-hardness").addEventListener("input", (event) => {
    state.eraser.hardness = Number(event.target.value) / 100;
    $("eraser-hardness-value").value = `${event.target.value}%`;
  });

  $("scatter-symbol").addEventListener("change", (event) => {
    state.scatter.symbol = event.target.value;
    // Send each element to the layer it belongs in, so trees land in Forest.
    const layer = layerForSymbol(state.scatter.symbol);
    if (layer !== state.activeLayer) {
      state.activeLayer = layer;
      emit("layers");
      setStatus(`Now scattering into the ${getLayerMeta(layer)?.label ?? layer} layer.`);
    }
  });
  $("scatter-density").addEventListener("input", (event) => {
    state.scatter.density = Number(event.target.value);
    $("scatter-density-value").value = event.target.value;
    updateScatterEstimate();
  });
  $("scatter-radius").addEventListener("input", (event) => {
    state.scatter.radius = Number(event.target.value);
    $("scatter-radius-value").value = `${state.scatter.radius} px`;
    updateScatterEstimate();
    requestRender();
  });
  $("scatter-size").addEventListener("input", (event) => {
    state.scatter.size = Number(event.target.value);
    $("scatter-size-value").value = `${state.scatter.size} px`;
  });
  $("scatter-jitter").addEventListener("input", (event) => {
    state.scatter.jitter = Number(event.target.value) / 100;
    $("scatter-jitter-value").value = `${event.target.value}%`;
  });

  $("marker-type").addEventListener("change", (event) => { state.marker.type = event.target.value; });  $("marker-size").addEventListener("input", (event) => {
    state.marker.size = Number(event.target.value);
    $("marker-size-value").value = `${state.marker.size} px`;
  });
  $("path-preset").addEventListener("change", (event) => { state.path.preset = event.target.value; });
  $("compass-style").addEventListener("change", (event) => { state.compass.style = event.target.value; });
  $("text-font").addEventListener("change", (event) => { state.text.font = event.target.value; });
  $("text-size").addEventListener("input", (event) => {
    state.text.size = Number(event.target.value);
    $("text-size-value").value = `${state.text.size} px`;
  });

  $("font-file").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    event.target.value = "";
    if (!file) return;
    try {
      const family = await addFontFromFile(file);
      state.text.font = family;
      refreshFontOptions();
      setStatus(`Font "${family}" is available for labels.`);
    } catch (error) {
      setStatus(`Could not register that font: ${error.message}`, "error");
    }
  });

  $("action-fit").addEventListener("click", () => {
    fit(state.map.width, state.map.height);
    requestRender();
    setStatus("View fitted to the map.");
  });
  $("action-zoom-in").addEventListener("click", () => {
    zoomAt(view.cssWidth / 2, view.cssHeight / 2, 1.25);
    requestRender();
  });
  $("action-zoom-out").addEventListener("click", () => {
    zoomAt(view.cssWidth / 2, view.cssHeight / 2, 1 / 1.25);
    requestRender();
  });
  $("action-undo").addEventListener("click", () => {
    const command = history.undo();
    setStatus(command ? `Undid: ${command.label}.` : "Nothing to undo.");
    requestRender();
  });
  $("action-redo").addEventListener("click", () => {
    const command = history.redo();
    setStatus(command ? `Redid: ${command.label}.` : "Nothing to redo.");
    requestRender();
  });

  const status = $("status");
  on("status", ({ message, kind }) => {
    status.textContent = message;
    status.dataset.kind = kind;
  });
  on("tool", syncToolButtons);
  on("document", syncToolbar);
  history.onChange(refreshHistoryButtons);

  syncToolbar();
  refreshHistoryButtons();
}
