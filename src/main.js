/**
 * Application entry point.
 *
 * Owns the canvas input plumbing (pointer, wheel, pinch, keyboard), the tool
 * registry, document-level actions (new / reset / generate / resize) and the
 * autosave loop. Everything else is a module it wires together.
 */
import { generateTerrain } from "./gen/terrainGen.js";
import { applyDocument, serializeDocument } from "./io/projectFile.js";
import {
  invalidateCoastline, rebuildCoastline, setCoastlineListener,
} from "./render/coastline.js";
import { clearAllLayers, getRaster, resizeAllLayers, serializeRasters } from "./render/layers.js";
import {
  attachCanvas, drawSelectionChrome, requestRender, resizeToStage, setOverlayPainter,
} from "./render/renderer.js";
import { fit, panBy, screenToWorld, view, zoomTo } from "./render/view.js";
import { history } from "./state/history.js";
import { autosaveUnavailableReason, clearAutosave, createDebouncedSaver, readAutosave } from "./state/persist.js";
import {
  createInitialState, deleteObject, emit, getObject, isObjectVisible, on,
  replaceState, setStatus, setTool, state,
} from "./state/store.js";
import { compassTool } from "./tools/compass.js";
import { eraserTool } from "./tools/eraser.js";
import { handTool } from "./tools/hand.js";
import { markerTool } from "./tools/marker.js";
import { cancelDraftPath, finishDraftPath, hasDraftPath, pathTool } from "./tools/path.js";
import { scatterTool } from "./tools/scatter.js";
import { selectTool } from "./tools/select.js";
import {
  applyTextEditor, closeTextEditor, isTextEditorOpen, openTextEditor, textTool,
} from "./tools/text.js";
import { askToRestore, initDialogs } from "./ui/dialogs.js";
import { initGridPanel } from "./ui/gridPanel.js";
import { initInspector } from "./ui/inspector.js";
import { initLayersPanel } from "./ui/layersPanel.js";
import { initLegendPanel } from "./ui/legendPanel.js";
import { initTitlebar } from "./ui/titlebar.js";
import { initToolbar } from "./ui/toolbar.js";

const canvas = document.getElementById("map");
const stage = document.getElementById("stage");

const tools = {
  scatter: scatterTool,
  eraser: eraserTool,
  text: textTool,
  marker: markerTool,
  path: pathTool,
  compass: compassTool,
  select: selectTool,
  hand: handTool,
};
const EDITING_TOOLS = new Set(["scatter", "eraser", "text", "marker", "path", "compass"]);

let activeTool = tools.select;
const pointers = new Map();
let panSession = null;
let pinchSession = null;
let spaceDown = false;

/* ---------------------------------------------------------------- helpers */

function localPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function worldPoint(event) {
  const local = localPoint(event);
  return screenToWorld(local.x, local.y);
}

function isTypingTarget(target) {
  const tag = target?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
}

function setCursor() {
  canvas.style.cursor = panSession ? "grabbing" : (spaceDown ? "grab" : activeTool.cursor ?? "crosshair");
}

/* --------------------------------------------------------------- autosave */

const autosave = createDebouncedSaver(serializeDocument, {
  onError(reason) {
    setStatus(`Autosave is unavailable (${reason}). Use Save / Load to keep your work.`, "error");
  },
});

/* ------------------------------------------------------- document actions */

/** Snapshot the document, run `mutate`, and record the pair as one undo step. */
function runDocumentCommand(label, mutate) {
  const before = serializeDocument();
  mutate();
  const after = serializeDocument();
  const bytes = (JSON.stringify(before).length + JSON.stringify(after).length) * 2;

  const restore = (document) => {
    applyDocument(document)
      .then(() => requestRender())
      .catch((error) => setStatus(`Could not undo ${label}: ${error.message}`, "error"));
  };

  history.push({ label, bytes, undo: () => restore(before), redo: () => restore(after) });
  requestRender();
}

function newMap() {
  runDocumentCommand("New map", () => {
    const fresh = createInitialState();
    fresh.tool = state.tool;
    replaceState(fresh);
    clearAllLayers();
    invalidateCoastline();
    emit("document");
    emit("layers");
    emit("objects");
    emit("legend");
    emit("selection", null);
  });
  fit(state.map.width, state.map.height);
  requestRender();
  setStatus("Started a new blank map.");
}

function resetMap() {
  runDocumentCommand("Reset map", () => {
    clearAllLayers();
    invalidateCoastline();
    state.objects = [];
    state.legend = [];
    state.selectedId = null;
    state.map.generation = null;
    state.map.reproducible = true;
    emit("layers");
    emit("objects");
    emit("legend");
    emit("selection", null);
  });
  setStatus("Cleared the map back to open ocean.");
}

/**
 * Generate terrain. When the current map is still reproducible we record the
 * previous *parameters* instead of its pixels, per the plan's map-op rule;
 * a hand-painted map falls back to a bounded raster snapshot.
 */
function generate(params) {
  const previous = state.map.reproducible
    ? (state.map.generation
      ? { kind: "generated", params: state.map.generation }
      : { kind: "blank" })
    : { kind: "snapshot", rasters: serializeRasters(), generation: state.map.generation };

  const report = generateTerrain(params);
  rebuildCoastline();
  requestRender();
  emit("layers");

  const apply = (descriptor) => {
    if (descriptor.kind === "blank") {
      clearAllLayers();
      invalidateCoastline();
      state.map.generation = null;
      state.map.reproducible = true;
      emit("layers");
      requestRender();
      return;
    }
    if (descriptor.kind === "generated") {
      generateTerrain(descriptor.params);
      rebuildCoastline();
      emit("layers");
      requestRender();
      return;
    }
    applyDocument({ ...serializeDocument(), rasters: descriptor.rasters })
      .then(() => {
        state.map.generation = descriptor.generation;
        state.map.reproducible = false;
        requestRender();
      })
      .catch((error) => setStatus(`Could not undo the generation: ${error.message}`, "error"));
  };

  const bytes = previous.kind === "snapshot"
    ? Object.values(previous.rasters).reduce((total, url) => total + url.length, 0)
    : 256;

  history.push({
    label: "Generate landmass",
    bytes,
    undo: () => apply(previous),
    redo: () => {
      generateTerrain(params);
      rebuildCoastline();
      emit("layers");
      requestRender();
    },
  });

  return report;
}

function applySize(width, height) {
  if (width === state.map.width && height === state.map.height) return;
  runDocumentCommand("Change map size", () => {
    const scaleX = width / state.map.width;
    const scaleY = height / state.map.height;
    resizeAllLayers(width, height);
    for (const object of state.objects) {
      if (Number.isFinite(object.x)) object.x *= scaleX;
      if (Number.isFinite(object.y)) object.y *= scaleY;
      if (Array.isArray(object.points)) {
        for (const point of object.points) {
          point.x *= scaleX;
          point.y *= scaleY;
        }
      }
    }
    for (const entry of state.legend) {
      entry.x *= scaleX;
      entry.y *= scaleY;
    }
    state.map.width = width;
    state.map.height = height;
    if (getRaster("land")) rebuildCoastline();
    emit("layers");
    emit("objects");
    emit("legend");
  });
  fit(state.map.width, state.map.height);
  requestRender();
  setStatus(`Map resized to ${width} x ${height}.`);
}

/* --------------------------------------------------------------- pointers */

function beginPan(event) {
  panSession = { x: event.clientX, y: event.clientY };
  setCursor();
}

function startPinch() {
  const [first, second] = [...pointers.values()];
  pinchSession = {
    distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
    scale: view.scale,
  };
  activeTool.deactivate?.();
  panSession = null;
}

function onPointerDown(event) {
  canvas.setPointerCapture?.(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointers.size === 2) {
    startPinch();
    return;
  }
  if (pointers.size > 2) return;

  const wantsPan = event.button === 1 || spaceDown || activeTool.id === "hand";
  if (wantsPan) {
    if (activeTool.id === "hand") activeTool.onPointerDown?.(event, worldPoint(event));
    else beginPan(event);
    return;
  }
  if (event.button !== 0) return;

  if (state.locked && EDITING_TOOLS.has(activeTool.id)) {
    setStatus("The map is locked. Unlock it from the title bar to make changes.");
    return;
  }
  activeTool.onPointerDown?.(event, worldPoint(event));
}

function onPointerMove(event) {
  if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pinchSession && pointers.size >= 2) {
    const [first, second] = [...pointers.values()];
    const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    const rect = canvas.getBoundingClientRect();
    const centreX = (first.x + second.x) / 2 - rect.left;
    const centreY = (first.y + second.y) / 2 - rect.top;
    zoomTo(centreX, centreY, pinchSession.scale * (distance / pinchSession.distance));
    requestRender();
    return;
  }

  if (panSession) {
    panBy(event.clientX - panSession.x, event.clientY - panSession.y);
    panSession = { x: event.clientX, y: event.clientY };
    requestRender();
    return;
  }

  activeTool.onPointerMove?.(event, worldPoint(event));
}

function onPointerUp(event) {
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinchSession = null;
  if (panSession) {
    panSession = null;
    setCursor();
    return;
  }
  activeTool.onPointerUp?.(event, worldPoint(event));
}

function onWheel(event) {
  event.preventDefault();
  const local = localPoint(event);
  const factor = event.deltaY < 0 ? 1.14 : 1 / 1.14;
  zoomTo(local.x, local.y, view.scale * factor);
  requestRender();
}

function onDoubleClick(event) {
  const result = activeTool.onDoubleClick?.(event, worldPoint(event));
  if (result?.editText) openTextEditor(result.editText, result.editText);
}

/* --------------------------------------------------------------- keyboard */

const TOOL_KEYS = { s: "scatter", e: "eraser", t: "text", m: "marker", p: "path", c: "compass", v: "select", h: "hand" };

function onKeyDown(event) {
  const typing = isTypingTarget(event.target);

  if (event.key === "Escape") {
    if (isTextEditorOpen()) {
      closeTextEditor();
      canvas.focus();
      return;
    }
    if (cancelDraftPath()) return;
    return;
  }

  if (typing) return;

  if (event.code === "Space") {
    if (!spaceDown) {
      spaceDown = true;
      setCursor();
    }
    event.preventDefault();
    return;
  }

  const key = event.key.toLowerCase();
  const modifier = event.ctrlKey || event.metaKey;

  if (modifier && key === "z" && !event.shiftKey) {
    event.preventDefault();
    const command = history.undo();
    setStatus(command ? `Undid: ${command.label}.` : "Nothing to undo.");
    requestRender();
    return;
  }
  if (modifier && ((key === "z" && event.shiftKey) || key === "y")) {
    event.preventDefault();
    const command = history.redo();
    setStatus(command ? `Redid: ${command.label}.` : "Nothing to redo.");
    requestRender();
    return;
  }
  if (modifier) return;

  if (event.key === "Enter" && hasDraftPath()) {
    event.preventDefault();
    finishDraftPath();
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && state.selectedId) {
    if (state.locked) {
      setStatus("The map is locked, so objects cannot be deleted.", "error");
      return;
    }
    event.preventDefault();
    deleteObject(state.selectedId);
    requestRender();
    return;
  }
  if (TOOL_KEYS[key]) {
    event.preventDefault();
    setTool(TOOL_KEYS[key]);
  }
}

function onKeyUp(event) {
  if (event.code === "Space") {
    spaceDown = false;
    setCursor();
  }
}

/* ------------------------------------------------------------------ tools */

/**
 * Swap the live tool object. `setTool` in the store owns the state change and
 * fires the "tool" topic; this only reacts to it, so there is no feedback loop.
 */
function activateTool(id) {
  const next = tools[id];
  if (!next || next === activeTool) return;
  activeTool.deactivate?.();
  activeTool = next;
  setCursor();
  requestRender();
}

/* ------------------------------------------------------------------- boot */

function initCanvas() {
  attachCanvas(canvas);
  setCoastlineListener(requestRender);

  setOverlayPainter((ctx) => {
    activeTool.drawOverlay?.(ctx);
    const selected = getObject(state.selectedId);
    if (selected && isObjectVisible(selected) && !["eraser", "scatter"].includes(activeTool.id)) {
      drawSelectionChrome(ctx, selected);
    }
  });

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDoubleClick);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => { spaceDown = false; setCursor(); });

  new ResizeObserver(() => resizeToStage(stage)).observe(stage);
}

function initTextOverlay() {
  document.getElementById("text-apply").addEventListener("click", () => {
    applyTextEditor();
    canvas.focus();
  });
  document.getElementById("text-cancel").addEventListener("click", () => {
    closeTextEditor();
    canvas.focus();
  });
  document.getElementById("text-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      applyTextEditor();
      canvas.focus();
    }
  });
}

async function offerRestore() {
  const record = await readAutosave();
  if (!record?.document) {
    const reason = autosaveUnavailableReason();
    if (reason) setStatus(`Autosave is unavailable (${reason}). Use Save / Load instead.`, "error");
    return false;
  }
  const restore = await askToRestore(record.savedAt);
  if (!restore) {
    await clearAutosave();
    setStatus("Started fresh. The previous autosave was discarded.");
    return false;
  }
  try {
    await applyDocument(record.document);
    history.clear();
    requestRender();
    setStatus(`Restored "${state.map.title}" from autosave.`);
    return true;
  } catch (error) {
    setStatus(`The autosave could not be restored: ${error.message}`, "error");
    return false;
  }
}

async function boot() {
  initCanvas();
  initToolbar();
  initTitlebar({ newMap, resetMap });
  initLayersPanel();
  initGridPanel();
  initInspector();
  initLegendPanel();
  initDialogs({ generate, applySize });
  initTextOverlay();

  on("tool", activateTool);
  on("change", ({ topic }) => {
    if (topic === "status") return;
    requestRender();
    autosave.schedule();
  });
  history.onChange(() => autosave.schedule());

  resizeToStage(stage);
  fit(state.map.width, state.map.height);
  requestRender();

  const restored = await offerRestore();
  if (!restored) {
    fit(state.map.width, state.map.height);
    requestRender();
    setStatus("Blank ocean ready. Generate a landmass, or scatter elements once you have land.");
  }
}

boot().catch((error) => {
  setStatus(`The editor failed to start: ${error.message}`, "error");
  throw error;
});
