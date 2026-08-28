/**
 * Stamp-based brush engine with tiled dirty-rect undo capture.
 *
 * Along the pointer path a stamp is placed every `size * 0.15` world units.
 * For undo we never copy the whole layer: the canvas is treated as a grid of
 * 128 px tiles and only the tiles a stroke actually touches are captured
 * (once, before their first modification) and re-read at stroke end.
 */
import { context2d, ensureRaster } from "../render/layers.js";
import { markManuallyEdited } from "../state/store.js";
import { buildStamp, eraserGradient } from "./stamp.js";
import { resolveTexture } from "./textures.js";

const TILE = 128;
const SPACING_RATIO = 0.15;

/**
 * Lazily snapshots the 128 px tiles a raster operation touches, so undo costs
 * the area actually modified rather than a full-canvas copy. Shared by the
 * brush and the scatter tool.
 */
export class TileCapture {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = context2d(canvas);
    this.tiles = new Map();
    this.columns = Math.ceil(canvas.width / TILE);
    this.rows = Math.ceil(canvas.height / TILE);
  }

  /** Snapshot every tile a stamp of `radius` at (x, y) can reach. */
  capture(x, y, radius) {
    const minColumn = Math.max(0, Math.floor((x - radius) / TILE));
    const maxColumn = Math.min(this.columns - 1, Math.floor((x + radius) / TILE));
    const minRow = Math.max(0, Math.floor((y - radius) / TILE));
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / TILE));
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const key = `${column}:${row}`;
        if (this.tiles.has(key)) continue;
        const px = column * TILE;
        const py = row * TILE;
        const width = Math.min(TILE, this.canvas.width - px);
        const height = Math.min(TILE, this.canvas.height - py);
        if (width <= 0 || height <= 0) continue;
        this.tiles.set(key, { x: px, y: py, width, height, before: this.ctx.getImageData(px, py, width, height) });
      }
    }
  }

  get size() {
    return this.tiles.size;
  }

  /** Build the undo command for everything captured, or null if nothing was. */
  toCommand(label, layerId, onRestore) {
    if (!this.tiles.size) return null;
    const patches = [];
    let bytes = 0;
    for (const tile of this.tiles.values()) {
      const after = this.ctx.getImageData(tile.x, tile.y, tile.width, tile.height);
      patches.push({ x: tile.x, y: tile.y, before: tile.before, after });
      bytes += tile.before.data.byteLength + after.data.byteLength;
    }
    this.tiles.clear();

    const apply = (key) => {
      const target = context2d(ensureRaster(layerId));
      for (const patch of patches) target.putImageData(patch[key], patch.x, patch.y);
      if (onRestore) onRestore(layerId);
    };

    return { label, bytes, undo: () => apply("before"), redo: () => apply("after") };
  }
}

class StrokeSession {
  constructor({ layerId, erasing = false, size, opacity, hardness, textureId }) {
    this.layerId = layerId;
    this.erasing = erasing;
    this.size = Math.max(1, size);
    this.opacity = Math.min(1, Math.max(0.01, opacity));
    this.hardness = Math.min(1, Math.max(0, hardness));
    this.textureId = textureId;
    this.canvas = ensureRaster(layerId);
    this.ctx = context2d(this.canvas);
    this.texture = erasing ? null : resolveTexture(textureId, layerId);
    this.capture = new TileCapture(this.canvas);
    this.points = [];
    this.last = null;
    this.painted = false;
    this.bounds = null;
  }

  #growBounds(x, y, radius) {
    const minX = x - radius;
    const minY = y - radius;
    const maxX = x + radius;
    const maxY = y + radius;
    if (!this.bounds) this.bounds = { minX, minY, maxX, maxY };
    else {
      this.bounds.minX = Math.min(this.bounds.minX, minX);
      this.bounds.minY = Math.min(this.bounds.minY, minY);
      this.bounds.maxX = Math.max(this.bounds.maxX, maxX);
      this.bounds.maxY = Math.max(this.bounds.maxY, maxY);
    }
  }

  #stamp(point) {
    const radius = this.size / 2;
    if (point.x < -radius || point.y < -radius) return;
    if (point.x > this.canvas.width + radius || point.y > this.canvas.height + radius) return;

    this.capture.capture(point.x, point.y, radius + 2);
    this.#growBounds(point.x, point.y, radius + 2);
    this.ctx.save();
    if (this.erasing) {
      this.ctx.globalCompositeOperation = "destination-out";
      this.ctx.globalAlpha = this.opacity;
      this.ctx.fillStyle = eraserGradient(this.ctx, point.x, point.y, radius, this.hardness);
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      this.ctx.fill();
    } else {
      const stamp = buildStamp({
        texture: this.texture,
        diameter: this.size,
        hardness: this.hardness,
        worldX: point.x,
        worldY: point.y,
      });
      this.ctx.globalAlpha = this.opacity;
      this.ctx.drawImage(stamp, point.x - radius, point.y - radius, this.size, this.size);
    }
    this.ctx.restore();
    this.painted = true;
  }

  /** Place the first stamp of a stroke. */
  begin(point) {
    this.points.push({ x: point.x, y: point.y });
    this.last = { x: point.x, y: point.y };
    this.#stamp(point);
  }

  /** Interpolate stamps from the previous position to `point`. */
  extendTo(point) {
    if (!this.last) {
      this.begin(point);
      return;
    }
    const spacing = Math.max(1, this.size * SPACING_RATIO);
    const distance = Math.hypot(point.x - this.last.x, point.y - this.last.y);
    if (distance < spacing) return;
    const steps = Math.ceil(distance / spacing);
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      this.#stamp({
        x: this.last.x + (point.x - this.last.x) * t,
        y: this.last.y + (point.y - this.last.y) * t,
      });
    }
    this.last = { x: point.x, y: point.y };
    this.points.push({ x: point.x, y: point.y });
  }

  /**
   * Close the stroke and produce an undo command holding only the touched
   * tiles. Returns null when the stroke painted nothing.
   */
  finish({ onRestore } = {}) {
    if (!this.painted) return null;
    markManuallyEdited();
    const command = this.capture.toCommand(this.erasing ? "Erase" : "Paint stroke", this.layerId, onRestore);
    if (!command) return null;
    return { command, points: this.points, bounds: this.bounds };
  }
}

/** Start a stroke. Returns the session used for the rest of the drag. */
export function beginStroke(options, point) {
  const session = new StrokeSession(options);
  session.begin(point);
  return session;
}
