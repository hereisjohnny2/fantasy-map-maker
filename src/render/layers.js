/**
 * Raster terrain layers.
 *
 * One canvas per terrain type, allocated lazily on first use so an untouched
 * map costs nothing. Layer metadata (visibility / opacity / lock) lives in the
 * store; only the pixels live here.
 */
import { TERRAIN_LAYERS, state } from "../state/store.js";

const rasters = new Map();

export function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** 2D context configured for the frequent getImageData() the undo system does. */
export function context2d(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx;
}

/** The layer canvas if it has been allocated, otherwise null. */
export function getRaster(id) {
  return rasters.get(id) ?? null;
}

/** Allocate the layer canvas on demand. */
export function ensureRaster(id) {
  let canvas = rasters.get(id);
  if (!canvas) {
    canvas = createCanvas(state.map.width, state.map.height);
    rasters.set(id, canvas);
  }
  return canvas;
}

export function getRasterContext(id) {
  return context2d(ensureRaster(id));
}

export function hasPixels(id) {
  return rasters.has(id);
}

export function clearLayer(id) {
  const canvas = rasters.get(id);
  if (!canvas) return;
  context2d(canvas).clearRect(0, 0, canvas.width, canvas.height);
}

export function discardLayer(id) {
  rasters.delete(id);
}

export function clearAllLayers() {
  rasters.clear();
}

/** Approximate RGBA bytes held by all allocated layers. */
export function rasterBytes() {
  let total = 0;
  for (const canvas of rasters.values()) total += canvas.width * canvas.height * 4;
  return total;
}

/** Rescale every allocated layer into a new map size. */
export function resizeAllLayers(width, height) {
  for (const [id, canvas] of [...rasters.entries()]) {
    const next = createCanvas(width, height);
    const ctx = context2d(next);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, next.width, next.height);
    rasters.set(id, next);
  }
}

/** PNG data URLs for allocated layers only, keyed by layer id. */
export function serializeRasters() {
  const output = {};
  for (const [id, canvas] of rasters.entries()) output[id] = canvas.toDataURL("image/png");
  return output;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("a saved layer image could not be decoded"));
    image.src = dataUrl;
  });
}

/** Rebuild layer pixels from `{ layerId: dataUrl }`, scaling into the map size. */
export async function restoreRasters(serialised, width, height) {
  rasters.clear();
  if (!serialised) return;
  const known = new Set(TERRAIN_LAYERS.map((layer) => layer.id));
  const entries = Object.entries(serialised).filter(([id, url]) => known.has(id) && typeof url === "string" && url);
  await Promise.all(entries.map(async ([id, url]) => {
    const image = await loadImage(url);
    const canvas = createCanvas(width, height);
    context2d(canvas).drawImage(image, 0, 0, canvas.width, canvas.height);
    rasters.set(id, canvas);
  }));
}
