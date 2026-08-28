/**
 * The portable `.fmap` project document.
 *
 * It is plain JSON: map metadata, the view, per-layer settings plus their PNG
 * data URLs, objects, legend, custom textures and fonts, grid configuration
 * and the generator seed. The same document shape is what autosave stores.
 */
import { clearCustomTextures } from "../brush/textures.js";
import { invalidateCoastline, rebuildCoastline } from "../render/coastline.js";
import { getRaster, restoreRasters, serializeRasters } from "../render/layers.js";
import { applyView, serializeView } from "../render/view.js";
import {
  TERRAIN_LAYERS, createInitialState, emit, replaceState, state,
} from "../state/store.js";
import { restoreCustomFonts, restoreCustomTextures } from "./textureLoader.js";

export const FORMAT = "fantasy-map-maker";
export const VERSION = 1;

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFileName(title, extension) {
  const base = String(title || "fantasy-map").replace(/[^\w -]+/g, "").trim().replace(/\s+/g, "-");
  return `${base || "fantasy-map"}.${extension}`;
}

/** Build the document for the current editor state. */
export function serializeDocument() {
  return {
    format: FORMAT,
    version: VERSION,
    savedAt: new Date().toISOString(),
    map: { ...state.map },
    view: serializeView(),
    layers: state.layers.map((layer) => ({
      id: layer.id,
      visible: layer.visible,
      opacity: layer.opacity,
      locked: layer.locked,
    })),
    activeLayer: state.activeLayer,
    rasters: serializeRasters(),
    objects: structuredClone(state.objects),
    legend: structuredClone(state.legend),
    customTextures: structuredClone(state.customTextures),
    customFonts: structuredClone(state.customFonts),
    grid: { ...state.grid },
    brush: { ...state.brush },
    marker: { ...state.marker },
    path: { ...state.path },
    compass: { ...state.compass },
    text: { ...state.text },
  };
}

function validate(document) {
  if (!document || typeof document !== "object") throw new Error("the file is not a map document");
  if (document.format !== FORMAT) throw new Error("this file was not produced by Fantasy Map Maker");
  if (document.version > VERSION) throw new Error(`this file needs a newer version (v${document.version})`);
  const width = Number(document.map?.width);
  const height = Number(document.map?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 16 || height < 16) {
    throw new Error("the stored map dimensions are invalid");
  }
}

/** Replace the editor contents with a loaded document. */
export async function applyDocument(document) {
  validate(document);

  const fresh = createInitialState();
  const next = {
    ...fresh,
    map: { ...fresh.map, ...document.map },
    activeLayer: TERRAIN_LAYERS.some((layer) => layer.id === document.activeLayer) ? document.activeLayer : "land",
    objects: Array.isArray(document.objects) ? document.objects : [],
    legend: Array.isArray(document.legend) ? document.legend : [],
    customTextures: [],
    customFonts: [],
    grid: { ...fresh.grid, ...(document.grid ?? {}) },
    brush: { ...fresh.brush, ...(document.brush ?? {}) },
    marker: { ...fresh.marker, ...(document.marker ?? {}) },
    path: { ...fresh.path, ...(document.path ?? {}) },
    compass: { ...fresh.compass, ...(document.compass ?? {}) },
    text: { ...fresh.text, ...(document.text ?? {}) },
    tool: state.tool,
    selectedId: null,
    locked: false,
  };

  if (Array.isArray(document.layers)) {
    next.layers = fresh.layers.map((layer) => {
      const saved = document.layers.find((entry) => entry.id === layer.id);
      return saved
        ? {
          ...layer,
          visible: saved.visible !== false,
          opacity: Number.isFinite(saved.opacity) ? saved.opacity : 1,
          locked: Boolean(saved.locked),
        }
        : layer;
    });
  }

  replaceState(next);

  clearCustomTextures();
  state.customTextures = await restoreCustomTextures(document.customTextures ?? []);
  state.customFonts = await restoreCustomFonts(document.customFonts ?? []);

  invalidateCoastline();
  await restoreRasters(document.rasters, state.map.width, state.map.height);
  if (getRaster("land")) rebuildCoastline();

  applyView(document.view);

  emit("document");
  emit("layers");
  emit("objects");
  emit("legend");
  emit("selection", null);
  return document;
}

export function downloadDocument() {
  const document = serializeDocument();
  const blob = new Blob([JSON.stringify(document)], { type: "application/json" });
  downloadBlob(blob, safeFileName(state.map.title, "fmap"));
  return blob.size;
}

/** Parse a `.fmap` file chosen by the user. */
export async function readDocumentFile(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("the file is not valid JSON");
  }
  return applyDocument(parsed);
}
