/**
 * Seeded landmass generation.
 *
 * A fractal Brownian motion field is multiplied by a radial falloff so
 * continents pull away from the map edge, thresholded into a land mask, and
 * then filled with the land texture. A second seeded pass scatters forest and
 * mountain patches, but only where the mask says there is inland terrain.
 *
 * The same seed and settings always rebuild exactly the same map, which is
 * what lets the history stack undo a generation by re-running it.
 */
import { getTerrainTexture } from "../brush/textures.js";
import {
  clearAllLayers, context2d, createCanvas, ensureRaster, getRasterContext,
} from "../render/layers.js";
import { state } from "../state/store.js";
import { fbm } from "./noise.js";
import { createRng, hashSeed } from "./rng.js";

const MASK_SCALE = 2;

function buildMask(width, height, seedNumber, landAmount, roughness) {
  const maskWidth = Math.ceil(width / MASK_SCALE);
  const maskHeight = Math.ceil(height / MASK_SCALE);
  const mask = new Uint8Array(maskWidth * maskHeight);
  const frequency = 2 + (roughness / 100) * 3.2;
  const octaves = 4 + Math.round((roughness / 100) * 2);
  const persistence = 0.48 + (roughness / 100) * 0.16;
  // fBm clusters tightly around 0.5, so the usable threshold band is narrow.
  const threshold = 0.578 - (landAmount / 100) * 0.318;
  // Roughness also loosens the falloff, letting continents reach further out.
  const falloffPower = 3.6 - (roughness / 100) * 0.8;
  const falloffStrength = 0.92;

  for (let y = 0; y < maskHeight; y += 1) {
    for (let x = 0; x < maskWidth; x += 1) {
      const nx = x / maskWidth - 0.5;
      const ny = y / maskHeight - 0.5;
      // Normalised so 0 is the centre and 1 is a corner of the map.
      const distance = Math.min(1, Math.hypot(nx * 2, ny * 2) / Math.SQRT2);
      const falloff = distance ** falloffPower * falloffStrength;
      const value = fbm((nx + 0.5) * frequency, (ny + 0.5) * frequency, seedNumber, octaves, persistence) - falloff;
      mask[y * maskWidth + x] = value > threshold ? 1 : 0;
    }
  }
  return { mask, maskWidth, maskHeight };
}

function maskAt(mask, maskWidth, maskHeight, x, y) {
  const mx = Math.floor(x / MASK_SCALE);
  const my = Math.floor(y / MASK_SCALE);
  if (mx < 0 || my < 0 || mx >= maskWidth || my >= maskHeight) return 0;
  return mask[my * maskWidth + mx];
}

/** True when the point and a ring around it are all land: keeps scatter off coasts. */
function isInland(mask, maskWidth, maskHeight, x, y, margin) {
  if (!maskAt(mask, maskWidth, maskHeight, x, y)) return false;
  for (const [dx, dy] of [[margin, 0], [-margin, 0], [0, margin], [0, -margin]]) {
    if (!maskAt(mask, maskWidth, maskHeight, x + dx, y + dy)) return false;
  }
  return true;
}

function blobPath(ctx, x, y, radius, rng) {
  const lobes = 9;
  const points = [];
  for (let index = 0; index < lobes; index += 1) {
    const angle = (index / lobes) * Math.PI * 2;
    const reach = radius * (0.74 + rng() * 0.46);
    points.push({ x: x + Math.cos(angle) * reach, y: y + Math.sin(angle) * reach * 0.85 });
  }
  // Quadratic segments through the lobe midpoints give an organic outline
  // rather than the faceted polygon a straight lineTo would produce.
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const first = midpoint(points[points.length - 1], points[0]);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const end = midpoint(current, points[(index + 1) % points.length]);
    ctx.quadraticCurveTo(current.x, current.y, end.x, end.y);
  }
  ctx.closePath();
}

function scatterLayer(layerId, { mask, maskWidth, maskHeight }, rng, options) {
  const { width, height } = state.map;
  const ctx = getRasterContext(layerId);
  ctx.clearRect(0, 0, width, height);
  const pattern = ctx.createPattern(getTerrainTexture(layerId), "repeat");
  const seedNumber = hashSeed(`${layerId}:${options.seed}`);
  const step = options.step;
  let placed = 0;

  ctx.save();
  ctx.globalAlpha = options.alpha;
  ctx.fillStyle = pattern;
  for (let y = step; y < height; y += step) {
    for (let x = step; x < width; x += step) {
      const jitterX = x + (rng() - 0.5) * step;
      const jitterY = y + (rng() - 0.5) * step;
      if (!isInland(mask, maskWidth, maskHeight, jitterX, jitterY, options.margin)) continue;
      const field = fbm((jitterX / width) * options.frequency, (jitterY / height) * options.frequency, seedNumber, 3, 0.55);
      if (field < options.threshold) continue;
      blobPath(ctx, jitterX, jitterY, options.minRadius + rng() * (options.maxRadius - options.minRadius), rng);
      ctx.fill();
      placed += 1;
    }
  }
  ctx.restore();
  return placed;
}

/**
 * Replace every terrain layer with a freshly generated map.
 * Returns a small report used for the status line.
 */
export function generateTerrain({ seed, landAmount, roughness }) {
  const { width, height } = state.map;
  const seedNumber = hashSeed(seed);
  const rng = createRng(`scatter:${seed}`);

  clearAllLayers();

  const maskData = buildMask(width, height, seedNumber, landAmount, roughness);
  const { mask, maskWidth, maskHeight } = maskData;

  // Paint the mask at half resolution, then upscale for a naturally soft coast.
  const small = createCanvas(maskWidth, maskHeight);
  const smallContext = context2d(small);
  const image = smallContext.createImageData(maskWidth, maskHeight);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const offset = index * 4;
    image.data[offset] = 255;
    image.data[offset + 1] = 255;
    image.data[offset + 2] = 255;
    image.data[offset + 3] = 255;
  }
  smallContext.putImageData(image, 0, 0);

  const landCanvas = ensureRaster("land");
  const landContext = context2d(landCanvas);
  landContext.clearRect(0, 0, width, height);
  landContext.save();
  landContext.imageSmoothingEnabled = true;
  landContext.imageSmoothingQuality = "high";
  landContext.drawImage(small, 0, 0, maskWidth, maskHeight, 0, 0, width, height);
  landContext.globalCompositeOperation = "source-in";
  landContext.fillStyle = landContext.createPattern(getTerrainTexture("land"), "repeat");
  landContext.fillRect(0, 0, width, height);
  landContext.restore();

  const forests = scatterLayer("forest", maskData, rng, {
    seed, alpha: 1, step: Math.max(56, width / 20), margin: 26,
    frequency: 5.5, threshold: 0.56, minRadius: 22, maxRadius: 58,
  });
  const mountains = scatterLayer("mountains", maskData, rng, {
    seed, alpha: 1, step: Math.max(72, width / 14), margin: 46,
    frequency: 3.4, threshold: 0.63, minRadius: 20, maxRadius: 48,
  });

  const landCells = mask.reduce((total, cell) => total + cell, 0);
  state.map.seed = seed;
  state.map.generation = { seed, landAmount, roughness };
  state.map.reproducible = true;

  return {
    landRatio: landCells / mask.length,
    forests,
    mountains,
  };
}

/** Clear every terrain layer and forget the generator parameters. */
export function clearTerrain() {
  clearAllLayers();
  state.map.generation = null;
  state.map.reproducible = true;
}
