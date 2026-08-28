/**
 * Central serialisable editor state plus a tiny topic-based event bus.
 *
 * Everything in `state` is JSON-friendly. Pixel buffers deliberately live in
 * `render/layers.js` instead, so this module can be cloned, diffed and written
 * to a `.fmap` file without touching canvases.
 */
import { history } from "./history.js";

export const MAP_PRESETS = [
  { id: "compact", label: "Compact - 1600 x 1200", width: 1600, height: 1200 },
  { id: "standard", label: "Standard - 2048 x 1536", width: 2048, height: 1536 },
  { id: "large", label: "Large - 3072 x 2304", width: 3072, height: 2304 },
  { id: "custom", label: "Custom", width: 0, height: 0 },
];

export const TERRAIN_LAYERS = [
  { id: "land", label: "Land" },
  { id: "forest", label: "Forest" },
  { id: "mountains", label: "Mountains" },
  { id: "hills", label: "Hills" },
  { id: "desert", label: "Desert" },
  { id: "swamp", label: "Swamp" },
  { id: "city", label: "City" },
];

export const MARKER_TYPES = ["city", "castle", "ruin", "port", "peak", "forest"];

export const COMPASS_STYLES = [
  { id: "simple4", label: "Simple 4-point" },
  { id: "points8", label: "8-point with letters" },
  { id: "ornate16", label: "Ornate 16-point" },
];

export const DASH_STYLES = ["solid", "dashed", "dotted", "dash-dot", "double"];

export const PATH_PRESETS = {
  river: { color: "#37698f", alpha: 0.92, startWidth: 4, endWidth: 22, wobble: 0.35, dash: "solid", casing: false, beneathTerrain: false },
  road: { color: "#c8a86a", alpha: 0.95, startWidth: 8, endWidth: 8, wobble: 0.08, dash: "dashed", casing: true, beneathTerrain: false },
  border: { color: "#5c3050", alpha: 0.9, startWidth: 5, endWidth: 5, wobble: 0, dash: "dash-dot", casing: false, beneathTerrain: false },
};

/** Only system / web-safe families ship by default; see docs for the licensing rationale. */
export const FONT_FAMILIES = [
  "Georgia", "Palatino Linotype", "Times New Roman", "Copperplate",
  "serif", "system-ui", "cursive", "fantasy",
];

const DEFAULT_MAP = MAP_PRESETS[1];

function defaultLayers() {
  return TERRAIN_LAYERS.map((layer) => ({ ...layer, visible: true, opacity: 1, locked: false }));
}

export function createInitialState() {
  return {
    map: {
      title: "Untitled Realm",
      width: DEFAULT_MAP.width,
      height: DEFAULT_MAP.height,
      seed: "",
      /** Parameters of the last generator run, or null for a hand-made map. */
      generation: null,
      /** False once a raster edit makes the map impossible to rebuild from its seed. */
      reproducible: true,
    },
    layers: defaultLayers(),
    activeLayer: "land",
    objects: [],
    legend: [],
    customTextures: [],
    customFonts: [],
    grid: {
      style: "none",
      size: 160,
      offsetX: 0,
      offsetY: 0,
      color: "#5d4526",
      alpha: 0.45,
      width: 1,
      labels: false,
      includeInExport: true,
    },
    brush: { textureId: "auto", size: 90, opacity: 0.85, hardness: 0.55, nameStroke: false },
    scatter: { symbol: "tree", radius: 130, density: 12, size: 30, jitter: 0.45 },
    marker: { type: "city", size: 44 },
    path: { preset: "river" },
    compass: { style: "points8" },
    text: { font: "Georgia", size: 36 },
    tool: "paint",
    selectedId: null,
    locked: false,
  };
}

export const state = createInitialState();

/** Replace the whole state in place so imported modules keep their reference. */
export function replaceState(next) {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, next);
}

const listeners = new Map();

/** Subscribe to a topic. Returns an unsubscribe function. */
export function on(topic, handler) {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  listeners.get(topic).add(handler);
  return () => listeners.get(topic).delete(handler);
}

/** Notify a topic, then the catch-all "change" topic. */
export function emit(topic, detail) {
  for (const handler of listeners.get(topic) ?? []) handler(detail);
  if (topic !== "change") {
    for (const handler of listeners.get("change") ?? []) handler({ topic, detail });
  }
}

let idCounter = 0;

export function newId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function setStatus(message, kind = "info") {
  emit("status", { message, kind });
}

export function getLayerMeta(id) {
  return state.layers.find((layer) => layer.id === id) ?? null;
}

export function getObject(id) {
  return state.objects.find((object) => object.id === id) ?? null;
}

export function getLegendEntry(id) {
  return state.legend.find((entry) => entry.id === id) ?? null;
}

export function legendEntryForObject(objectId) {
  return state.legend.find((entry) => entry.objectId === objectId) ?? null;
}

/** True when an object should be drawn (its own flag and its legend entry agree). */
export function isObjectVisible(object) {
  if (object.visible === false) return false;
  const entry = legendEntryForObject(object.id);
  return !entry || entry.visible !== false;
}

/** Called by any raster edit: the map can no longer be rebuilt from its seed alone. */
export function markManuallyEdited() {
  state.map.reproducible = false;
}

export function setSelection(id) {
  if (state.selectedId === id) return;
  state.selectedId = id;
  emit("selection", id);
}

export function setTool(tool) {
  if (state.tool === tool) return;
  state.tool = tool;
  emit("tool", tool);
}

/* ------------------------------------------------- undoable state changes */

/** Apply a command and record it, so every mutation is undoable by construction. */
export function runCommand(command) {
  command.redo();
  history.push(command);
  return command;
}

function jsonBytes(value) {
  try {
    return JSON.stringify(value).length * 2;
  } catch {
    return 0;
  }
}

/**
 * Add an object, optionally registering a legend entry for it.
 * `legend` is `{ kind, name }`; pass null for objects that stay off the legend.
 */
export function addObject(object, legend = null) {
  const entry = legend
    ? { id: newId("legend"), objectId: object.id, kind: legend.kind, name: legend.name, x: legend.x ?? object.x ?? 0, y: legend.y ?? object.y ?? 0, visible: true }
    : null;

  runCommand({
    label: `Add ${object.type}`,
    bytes: jsonBytes(object) + jsonBytes(entry),
    redo() {
      state.objects.push(object);
      if (entry) state.legend.push(entry);
      state.selectedId = object.id;
      emit("objects");
      emit("legend");
      emit("selection", state.selectedId);
    },
    undo() {
      state.objects = state.objects.filter((item) => item.id !== object.id);
      if (entry) state.legend = state.legend.filter((item) => item.id !== entry.id);
      if (state.selectedId === object.id) state.selectedId = null;
      emit("objects");
      emit("legend");
      emit("selection", state.selectedId);
    },
  });
  return object;
}

/** Remove an object and any legend entry pointing at it. */
export function deleteObject(id) {
  const object = getObject(id);
  if (!object) return false;
  const objectIndex = state.objects.indexOf(object);
  const entry = legendEntryForObject(id);
  const entryIndex = entry ? state.legend.indexOf(entry) : -1;

  runCommand({
    label: `Delete ${object.type}`,
    bytes: jsonBytes(object),
    redo() {
      state.objects = state.objects.filter((item) => item.id !== id);
      if (entry) state.legend = state.legend.filter((item) => item.id !== entry.id);
      if (state.selectedId === id) state.selectedId = null;
      emit("objects");
      emit("legend");
      emit("selection", state.selectedId);
    },
    undo() {
      state.objects.splice(objectIndex, 0, object);
      if (entry) state.legend.splice(Math.max(0, entryIndex), 0, entry);
      emit("objects");
      emit("legend");
    },
  });
  return true;
}

/** Apply a shallow patch to an object as one undoable step. */
export function updateObject(id, changes, label = "Edit object") {
  const object = getObject(id);
  if (!object) return false;
  const before = {};
  let changed = false;
  for (const [key, value] of Object.entries(changes)) {
    if (JSON.stringify(object[key]) === JSON.stringify(value)) continue;
    before[key] = structuredClone(object[key]);
    changed = true;
  }
  if (!changed) return false;
  const after = structuredClone(changes);

  runCommand({
    label,
    bytes: jsonBytes(before) + jsonBytes(after),
    redo() {
      Object.assign(object, structuredClone(after));
      syncLegendAnchor(object);
      emit("objects");
      emit("legend");
    },
    undo() {
      Object.assign(object, structuredClone(before));
      syncLegendAnchor(object);
      emit("objects");
      emit("legend");
    },
  });
  return true;
}

/** Keep a legend entry's pan-to anchor aligned with its object. */
export function syncLegendAnchor(object) {
  const entry = legendEntryForObject(object.id);
  if (!entry) return;
  if (Number.isFinite(object.x) && Number.isFinite(object.y)) {
    entry.x = object.x;
    entry.y = object.y;
  } else if (Array.isArray(object.points) && object.points.length) {
    const mid = object.points[Math.floor(object.points.length / 2)];
    entry.x = mid.x;
    entry.y = mid.y;
  }
}

/**
 * Record a live edit that dragging already applied, using a snapshot taken
 * before the drag started. Used by the select and path tools.
 */
export function commitObjectSnapshot(id, before, label = "Edit object") {
  const object = getObject(id);
  if (!object) return false;
  const after = structuredClone(object);
  if (JSON.stringify(before) === JSON.stringify(after)) return false;

  history.push({
    label,
    bytes: jsonBytes(before) + jsonBytes(after),
    redo() {
      Object.assign(object, structuredClone(after));
      syncLegendAnchor(object);
      emit("objects");
      emit("legend");
    },
    undo() {
      Object.assign(object, structuredClone(before));
      syncLegendAnchor(object);
      emit("objects");
      emit("legend");
    },
  });
  return true;
}

/** Add a legend entry that is not backed by an object (a named terrain stroke). */
export function addLegendEntry(entry) {
  const record = { id: newId("legend"), objectId: null, visible: true, ...entry };
  runCommand({
    label: "Name stroke",
    bytes: jsonBytes(record),
    redo() {
      state.legend.push(record);
      emit("legend");
    },
    undo() {
      state.legend = state.legend.filter((item) => item.id !== record.id);
      emit("legend");
    },
  });
  return record;
}

export function updateLegendEntry(id, changes, label = "Edit legend entry") {
  const entry = getLegendEntry(id);
  if (!entry) return false;
  const before = {};
  let changed = false;
  for (const [key, value] of Object.entries(changes)) {
    if (entry[key] === value) continue;
    before[key] = entry[key];
    changed = true;
  }
  if (!changed) return false;
  const after = { ...changes };

  runCommand({
    label,
    bytes: jsonBytes(before) + jsonBytes(after),
    redo() {
      Object.assign(entry, after);
      emit("legend");
      emit("objects");
    },
    undo() {
      Object.assign(entry, before);
      emit("legend");
      emit("objects");
    },
  });
  return true;
}

/** Delete a legend entry, and the object it represents when there is one. */
export function deleteLegendEntry(id) {
  const entry = getLegendEntry(id);
  if (!entry) return false;
  if (entry.objectId && getObject(entry.objectId)) return deleteObject(entry.objectId);

  const index = state.legend.indexOf(entry);
  runCommand({
    label: "Delete legend entry",
    bytes: jsonBytes(entry),
    redo() {
      state.legend = state.legend.filter((item) => item.id !== id);
      emit("legend");
    },
    undo() {
      state.legend.splice(index, 0, entry);
      emit("legend");
    },
  });
  return true;
}

/** Move a legend entry up or down without touching object draw order. */
export function moveLegendEntry(id, delta) {
  const index = state.legend.findIndex((entry) => entry.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= state.legend.length) return false;

  const swap = () => {
    const [entry] = state.legend.splice(index, 1);
    state.legend.splice(target, 0, entry);
    emit("legend");
  };
  const swapBack = () => {
    const [entry] = state.legend.splice(target, 1);
    state.legend.splice(index, 0, entry);
    emit("legend");
  };

  runCommand({ label: "Reorder legend", bytes: 64, redo: swap, undo: swapBack });
  return true;
}

/** Undoable patch for a plain settings object such as `state.grid` or a layer. */
export function updateSettings(target, changes, label = "Change settings", topic = "change") {
  const before = {};
  let changed = false;
  for (const [key, value] of Object.entries(changes)) {
    if (target[key] === value) continue;
    before[key] = target[key];
    changed = true;
  }
  if (!changed) return false;
  const after = { ...changes };

  runCommand({
    label,
    bytes: jsonBytes(before) + jsonBytes(after),
    redo() {
      Object.assign(target, after);
      emit(topic);
    },
    undo() {
      Object.assign(target, before);
      emit(topic);
    },
  });
  return true;
}
