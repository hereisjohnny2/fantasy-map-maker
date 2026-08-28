/**
 * Procedural, seamlessly tileable parchment and ink textures.
 *
 * Nothing here loads an image: every default texture is generated into a small
 * canvas at first use, which keeps the repository free of binary assets and of
 * third-party licensing exposure. Tileability comes from periodic noise plus
 * drawing each feature at its wrap-around offsets.
 */
import { periodicFbm } from "../gen/noise.js";
import { createRng } from "../gen/rng.js";
import { TERRAIN_LAYERS } from "../state/store.js";

const TILE = 192;
const NOISE_CELLS = 6;

const generated = new Map();
const custom = new Map();

const TERRAIN_STYLE = {
  land: { base: "#dcc78f", light: "#e9d9a9", dark: "#c3ab74", ink: "#8b7446" },
  forest: { base: "#7d9159", light: "#95a86a", dark: "#4d6438", ink: "#3b4f2b" },
  mountains: { base: "#a89880", light: "#c3b49a", dark: "#7a6c58", ink: "#4f4436" },
  hills: { base: "#c9ab74", light: "#dcc08a", dark: "#a98d5b", ink: "#6f5a35" },
  desert: { base: "#e6cf94", light: "#f2e0af", dark: "#cdb377", ink: "#9a8149" },
  swamp: { base: "#8d9463", light: "#a3a878", dark: "#67704a", ink: "#414a2f" },
  city: { base: "#c98f68", light: "#dba97f", dark: "#a06d4b", ink: "#5c3a24" },
};

function makeTile() {
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  return canvas;
}

/** Run `paint` nine times so features that cross an edge reappear on the other side. */
function paintWrapped(ctx, paint) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      ctx.save();
      ctx.translate(dx * TILE, dy * TILE);
      paint(ctx);
      ctx.restore();
    }
  }
}

/** Fibrous parchment grain built from tileable fractal noise. */
function paintGrain(ctx, style, seed, strength) {
  const image = ctx.createImageData(TILE, TILE);
  const data = image.data;
  const light = hexToRgb(style.light);
  const dark = hexToRgb(style.dark);
  const base = hexToRgb(style.base);
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      const nx = (x / TILE) * NOISE_CELLS;
      const ny = (y / TILE) * NOISE_CELLS;
      const fibre = periodicFbm(nx * 3.1, ny * 0.8, NOISE_CELLS, seed, 4, 0.55);
      const blotch = periodicFbm(nx, ny, NOISE_CELLS, seed + 977, 3, 0.6);
      const mix = (fibre * 0.55 + blotch * 0.45 - 0.5) * strength;
      const target = mix >= 0 ? light : dark;
      const amount = Math.min(1, Math.abs(mix) * 2);
      const index = (y * TILE + x) * 4;
      data[index] = base.r + (target.r - base.r) * amount;
      data[index + 1] = base.g + (target.g - base.g) * amount;
      data[index + 2] = base.b + (target.b - base.b) * amount;
      data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function hexToRgb(hex) {
  const value = Number.parseInt(String(hex).replace("#", ""), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function wavyLine(ctx, x, y, length, amplitude, steps = 8) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    ctx.lineTo(x + length * t, y + Math.sin(t * Math.PI * 2) * amplitude);
  }
  ctx.stroke();
}

function buildOcean() {
  const canvas = makeTile();
  const ctx = canvas.getContext("2d");
  const style = { base: "#e7d7ae", light: "#f2e5c4", dark: "#cdb989", ink: "#8f7f5c" };
  paintGrain(ctx, style, 4211, 0.55);

  const rng = createRng("ocean-hatch");
  ctx.strokeStyle = style.ink;
  ctx.lineWidth = 1;
  paintWrapped(ctx, (target) => {
    target.globalAlpha = 0.26;
    for (let index = 0; index < 11; index += 1) {
      const x = rng() * TILE;
      const y = rng() * TILE;
      const length = 30 + rng() * 44;
      wavyLine(target, x, y, length, 1.8 + rng() * 1.6);
      wavyLine(target, x + 3, y + 6, length * 0.7, 1.3 + rng() * 1.3);
    }
    target.globalAlpha = 1;
  });
  return canvas;
}

/**
 * Only the land tier is a solid fill. Every other terrain is ink symbols on a
 * transparent tile, so a forest reads as drawn trees on the parchment rather
 * than a green blob with trees sitting on top of it.
 */
const FILLED_TERRAIN = new Set(["land"]);

function buildTerrain(id) {
  const style = TERRAIN_STYLE[id] ?? TERRAIN_STYLE.land;
  const filled = FILLED_TERRAIN.has(id);
  const canvas = makeTile();
  const ctx = canvas.getContext("2d");
  if (filled) paintGrain(ctx, style, 100 + id.length * 37, 0.6);

  const rng = createRng(`terrain:${id}`);
  ctx.strokeStyle = style.ink;
  ctx.fillStyle = style.ink;
  ctx.lineWidth = filled ? 1.2 : 1.4;
  ctx.lineCap = "round";
  // Symbols carry the whole layer when there is no fill behind them.
  const symbolAlpha = filled ? 0.55 : 0.82;

  paintWrapped(ctx, (target) => {
    target.globalAlpha = symbolAlpha;
    if (id === "forest") {
      for (let index = 0; index < 44; index += 1) {
        const x = rng() * TILE;
        const y = rng() * TILE;
        const size = 4 + rng() * 4;
        target.beginPath();
        for (let lobe = 0; lobe < 5; lobe += 1) {
          const angle = Math.PI + (lobe * Math.PI) / 4;
          target.arc(x + Math.cos(angle) * size * 0.5, y + Math.sin(angle) * size * 0.3, size * 0.42, Math.PI, 0);
        }
        target.stroke();
        target.beginPath();
        target.moveTo(x, y + size * 0.2);
        target.lineTo(x, y + size * 0.9);
        target.stroke();
      }
    } else if (id === "mountains") {
      for (let index = 0; index < 22; index += 1) {
        const x = rng() * TILE;
        const y = rng() * TILE;
        const width = 10 + rng() * 12;
        const height = 7 + rng() * 9;
        target.beginPath();
        target.moveTo(x - width / 2, y + height / 2);
        target.lineTo(x, y - height / 2);
        target.lineTo(x + width / 2, y + height / 2);
        target.stroke();
        for (let hatch = 1; hatch <= 3; hatch += 1) {
          target.beginPath();
          target.moveTo(x, y - height / 2 + hatch * 2);
          target.lineTo(x + width * 0.18, y + height / 2);
          target.stroke();
        }
      }
    } else if (id === "hills") {
      for (let index = 0; index < 30; index += 1) {
        const x = rng() * TILE;
        const y = rng() * TILE;
        const radius = 4 + rng() * 5;
        target.beginPath();
        target.arc(x, y, radius, Math.PI * 1.05, Math.PI * 1.95);
        target.stroke();
      }
    } else if (id === "desert") {
      for (let index = 0; index < 120; index += 1) {
        target.beginPath();
        target.arc(rng() * TILE, rng() * TILE, 0.7 + rng() * 1.1, 0, Math.PI * 2);
        target.fill();
      }
      for (let index = 0; index < 8; index += 1) {
        const x = rng() * TILE;
        const y = rng() * TILE;
        wavyLine(target, x, y, 24 + rng() * 26, 1.5);
      }
    } else if (id === "swamp") {
      for (let index = 0; index < 46; index += 1) {
        const x = rng() * TILE;
        const y = rng() * TILE;
        for (let blade = -1; blade <= 1; blade += 1) {
          target.beginPath();
          target.moveTo(x + blade * 2, y + 3);
          target.lineTo(x + blade * 3.4, y - 3 - rng() * 2);
          target.stroke();
        }
      }
      for (let index = 0; index < 10; index += 1) {
        wavyLine(target, rng() * TILE, rng() * TILE, 18 + rng() * 20, 1.1);
      }
    } else if (id === "city") {
      for (let index = 0; index < 34; index += 1) {
        const x = rng() * TILE;
        const y = rng() * TILE;
        const width = 4 + rng() * 7;
        const height = 4 + rng() * 6;
        target.strokeRect(x, y, width, height);
        if (rng() < 0.5) {
          target.beginPath();
          target.moveTo(x, y);
          target.lineTo(x + width, y + height);
          target.stroke();
        }
      }
    } else {
      for (let index = 0; index < 22; index += 1) {
        const x = rng() * TILE;
        const y = rng() * TILE;
        wavyLine(target, x, y, 16 + rng() * 22, 1.1, 6);
      }
    }
    target.globalAlpha = 1;
  });

  return canvas;
}

/** The ocean tier: procedural parchment with faint wave hatching. */
export function getOceanTexture() {
  if (!generated.has("ocean")) generated.set("ocean", buildOcean());
  return generated.get("ocean");
}

/** The default ink/parchment texture for a terrain layer. */
export function getTerrainTexture(layerId) {
  const key = `terrain:${layerId}`;
  if (!generated.has(key)) generated.set(key, buildTerrain(layerId));
  return generated.get(key);
}

/** Register a user-supplied image (already decoded) as a brush texture. */
export function registerCustomTexture(id, image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  canvas.getContext("2d").drawImage(image, 0, 0);
  custom.set(id, canvas);
  return canvas;
}

export function hasCustomTexture(id) {
  return custom.has(id);
}

export function clearCustomTextures() {
  custom.clear();
}

/**
 * Resolve a brush texture id to a canvas.
 * `auto` follows the layer being painted; `terrain:<id>` pins a terrain style.
 */
export function resolveTexture(textureId, layerId) {
  if (!textureId || textureId === "auto") return getTerrainTexture(layerId);
  if (custom.has(textureId)) return custom.get(textureId);
  if (textureId.startsWith("terrain:")) return getTerrainTexture(textureId.slice(8));
  return getTerrainTexture(layerId);
}

/** Options for the texture picker, including any loaded custom textures. */
export function listTextures(customTextures = []) {
  return [
    { id: "auto", label: "Match active layer" },
    ...TERRAIN_LAYERS.map((layer) => ({ id: `terrain:${layer.id}`, label: `${layer.label} texture` })),
    ...customTextures.map((texture) => ({ id: texture.id, label: texture.name })),
  ];
}
