/**
 * Scatter deposition.
 *
 * Instead of smearing a tiling texture, this drops discrete symbols at a
 * configurable density. Density is expressed per 10,000 world px^2 and held
 * constant whether you click once or drag: a click fills the whole disc, and a
 * drag fills only the strip newly swept since the last drop. Elements are
 * rejected when they land too close to one already placed in the same run, so
 * a forest looks scattered rather than clumped.
 *
 * The result is baked into the terrain raster, so it is erasable, exportable
 * and saved with the layer, and undo captures only the tiles it touched.
 */
import { createRng, randomSeedString } from "../gen/rng.js";
import { context2d, ensureRaster } from "../render/layers.js";
import { markManuallyEdited } from "../state/store.js";
import { TileCapture } from "./brushEngine.js";
import { drawSymbol, getSymbol } from "./symbols.js";

const DENSITY_AREA = 10000;
const HASH_CELL = 48;

class ScatterSession {
  constructor({ layerId, symbolId, radius, density, size, jitter, seed }) {
    this.layerId = layerId;
    this.symbolId = symbolId;
    this.radius = Math.max(4, radius);
    this.density = Math.max(0.1, density);
    this.size = Math.max(2, size);
    this.jitter = Math.min(1, Math.max(0, jitter));
    this.canvas = ensureRaster(layerId);
    this.ctx = context2d(this.canvas);
    this.capture = new TileCapture(this.canvas);
    this.rng = createRng(seed ?? randomSeedString());
    this.placed = new Map();
    this.count = 0;
    this.last = null;
  }

  #hashKey(x, y) {
    return `${Math.floor(x / HASH_CELL)}:${Math.floor(y / HASH_CELL)}`;
  }

  /** True when nothing already sits within `gap` of this candidate. */
  #isClear(x, y, gap) {
    const cellX = Math.floor(x / HASH_CELL);
    const cellY = Math.floor(y / HASH_CELL);
    const reach = Math.ceil(gap / HASH_CELL);
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        for (const point of this.placed.get(`${cellX + dx}:${cellY + dy}`) ?? []) {
          if (Math.hypot(point.x - x, point.y - y) < gap) return false;
        }
      }
    }
    return true;
  }

  #remember(x, y) {
    const key = this.#hashKey(x, y);
    if (!this.placed.has(key)) this.placed.set(key, []);
    this.placed.get(key).push({ x, y });
  }

  #place(x, y) {
    const scale = 1 + (this.rng() * 2 - 1) * this.jitter * 0.5;
    const size = Math.max(2, this.size * scale);
    if (x < -size || y < -size || x > this.canvas.width + size || y > this.canvas.height + size) return false;

    this.capture.capture(x, y, size);
    this.ctx.save();
    this.ctx.globalAlpha = 0.82 + this.rng() * 0.18;
    drawSymbol(this.ctx, this.symbolId, x, y, size, this.rng);
    this.ctx.restore();
    this.count += 1;
    return true;
  }

  /** Drop `count` elements inside the disc at (cx, cy). */
  #fillDisc(cx, cy, count) {
    const gap = this.size * 0.52;
    const chosen = [];
    for (let index = 0; index < count; index += 1) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        // sqrt keeps the distribution uniform over area, not radius.
        const distance = this.radius * Math.sqrt(this.rng());
        const angle = this.rng() * Math.PI * 2;
        const x = cx + Math.cos(angle) * distance;
        const y = cy + Math.sin(angle) * distance;
        // Thin the rim so a cluster reads as a thicket, not a stamped circle.
        const edge = distance / this.radius;
        if (edge > 0.72 && this.rng() < (edge - 0.72) / 0.28) continue;
        if (!this.#isClear(x, y, gap)) continue;
        this.#remember(x, y);
        chosen.push({ x, y });
        break;
      }
    }
    // Draw back to front so nearer elements overlap the ones behind them.
    chosen.sort((a, b) => a.y - b.y);
    for (const point of chosen) this.#place(point.x, point.y);
  }

  /** Elements needed to cover an area at the configured density. */
  #countFor(area) {
    const expected = (this.density * area) / DENSITY_AREA;
    const whole = Math.floor(expected);
    // Carry the fraction probabilistically so low densities still deposit.
    return whole + (this.rng() < expected - whole ? 1 : 0);
  }

  /** First drop: fill the whole cluster disc. */
  begin(point) {
    this.last = { x: point.x, y: point.y };
    this.#fillDisc(point.x, point.y, this.#countFor(Math.PI * this.radius ** 2));
  }

  /** Continue a drag, filling only the strip swept since the last drop. */
  extendTo(point) {
    if (!this.last) {
      this.begin(point);
      return;
    }
    const step = this.radius * 0.5;
    const distance = Math.hypot(point.x - this.last.x, point.y - this.last.y);
    if (distance < step) return;
    const steps = Math.floor(distance / step);
    for (let index = 1; index <= steps; index += 1) {
      const t = (index * step) / distance;
      const x = this.last.x + (point.x - this.last.x) * t;
      const y = this.last.y + (point.y - this.last.y) * t;
      this.#fillDisc(x, y, this.#countFor(2 * this.radius * step));
    }
    this.last = {
      x: this.last.x + (point.x - this.last.x) * ((steps * step) / distance),
      y: this.last.y + (point.y - this.last.y) * ((steps * step) / distance),
    };
  }

  finish({ onRestore } = {}) {
    if (!this.count) return null;
    markManuallyEdited();
    const label = `Scatter ${getSymbol(this.symbolId).label.toLowerCase()}`;
    const command = this.capture.toCommand(label, this.layerId, onRestore);
    if (!command) return null;
    return { command, count: this.count };
  }
}

export function beginScatter(options, point) {
  const session = new ScatterSession(options);
  session.begin(point);
  return session;
}

/** Elements a single click will drop, for the "per drop" readout in the UI. */
export function elementsPerDrop(density, radius) {
  return Math.max(1, Math.round((density * Math.PI * radius ** 2) / DENSITY_AREA));
}
