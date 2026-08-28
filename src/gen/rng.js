/**
 * Deterministic pseudo-random numbers. Every generator in the app draws from
 * here so that a map is fully reproducible from its stored seed string.
 */

/** FNV-1a hash of an arbitrary seed string into an unsigned 32-bit integer. */
export function hashSeed(seed) {
  let hash = 2166136261;
  const text = String(seed);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Classic mulberry32: tiny, fast, and stable across browsers. */
export function mulberry32(seedNumber) {
  let state = seedNumber >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), 1 | value);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create a random function from any seed string or number. */
export function createRng(seed) {
  return mulberry32(hashSeed(seed));
}

/** A short pronounceable seed for the "shuffle" button. */
export function randomSeedString() {
  return Math.random().toString(36).slice(2, 9);
}

/** Integer in [min, max] inclusive. */
export function randomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pick one member of a non-empty array. */
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length) % items.length];
}
