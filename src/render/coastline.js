/**
 * Derived coastline.
 *
 * The ink outline is not an editable layer: it is recomputed (debounced) from
 * the alpha channel of the `land` raster whenever a land stroke finishes, so
 * it can never drift out of sync with the terrain it traces.
 */
import { createCanvas, context2d, getRaster } from "./layers.js";

let coastCanvas = null;
let timer = null;
let onUpdate = () => {};

/** Renderer/main registers a repaint callback here to avoid an import cycle. */
export function setCoastlineListener(listener) {
  onUpdate = typeof listener === "function" ? listener : () => {};
}

export function getCoastline() {
  return coastCanvas;
}

export function invalidateCoastline() {
  clearTimeout(timer);
  timer = null;
  coastCanvas = null;
}

/** Recompute immediately (used by load, generate and undo). */
export function rebuildCoastline() {
  clearTimeout(timer);
  timer = null;
  const land = getRaster("land");
  if (!land) {
    coastCanvas = null;
    onUpdate();
    return null;
  }

  const width = land.width;
  const height = land.height;
  const source = context2d(land).getImageData(0, 0, width, height).data;
  const target = createCanvas(width, height);
  const targetContext = context2d(target);
  const outline = targetContext.createImageData(width, height);
  const output = outline.data;
  const threshold = 24;

  for (let y = 1; y < height - 1; y += 1) {
    const row = y * width;
    for (let x = 1; x < width - 1; x += 1) {
      const index = (row + x) * 4 + 3;
      if (source[index] < threshold) continue;
      const edge =
        source[index - 4] < threshold ||
        source[index + 4] < threshold ||
        source[index - width * 4] < threshold ||
        source[index + width * 4] < threshold;
      if (!edge) continue;
      output[index - 3] = 46;
      output[index - 2] = 35;
      output[index - 1] = 22;
      output[index] = 205;
    }
  }

  targetContext.putImageData(outline, 0, 0);
  coastCanvas = target;
  onUpdate();
  return coastCanvas;
}

/** Coalesce rapid stroke ends into a single rebuild. */
export function scheduleCoastlineRebuild(delay = 140) {
  clearTimeout(timer);
  timer = setTimeout(rebuildCoastline, delay);
}
