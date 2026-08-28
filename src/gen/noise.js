/**
 * Value noise and fractal Brownian motion.
 *
 * `periodicNoise` wraps its lattice coordinates, which is what makes the
 * procedural textures tile seamlessly without any image asset.
 */

function latticeValue(x, y, seed) {
  let value = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + (seed | 0)) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function wrap(value, period) {
  if (!period) return value;
  const result = value % period;
  return result < 0 ? result + period : result;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smooth value noise in [0, 1]. */
export function valueNoise(x, y, seed = 1) {
  return periodicNoise(x, y, 0, 0, seed);
}

/**
 * Smooth value noise in [0, 1] whose lattice repeats every `periodX`/`periodY`
 * cells. Pass 0 for a period to disable wrapping on that axis.
 */
export function periodicNoise(x, y, periodX, periodY, seed = 1) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = fade(x - xi);
  const ty = fade(y - yi);
  const x0 = wrap(xi, periodX);
  const y0 = wrap(yi, periodY);
  const x1 = wrap(xi + 1, periodX);
  const y1 = wrap(yi + 1, periodY);
  const top = lerp(latticeValue(x0, y0, seed), latticeValue(x1, y0, seed), tx);
  const bottom = lerp(latticeValue(x0, y1, seed), latticeValue(x1, y1, seed), tx);
  return lerp(top, bottom, ty);
}

/** Fractal Brownian motion built from value noise, normalised to [0, 1]. */
export function fbm(x, y, seed = 1, octaves = 4, persistence = 0.55) {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let normal = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
    normal += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return total / normal;
}

/** Tileable fractal Brownian motion over a `period x period` cell field. */
export function periodicFbm(x, y, period, seed = 1, octaves = 4, persistence = 0.55) {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let normal = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const cells = period * frequency;
    total += periodicNoise(x * frequency, y * frequency, cells, cells, seed + octave * 1013) * amplitude;
    normal += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return total / normal;
}
