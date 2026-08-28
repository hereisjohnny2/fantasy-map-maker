/**
 * Syllable-based fantasy name generator used whenever the user leaves a name
 * prompt blank, producing entries such as "Castle Belmiran".
 */
import { pick } from "./rng.js";

const HEADS = ["ael", "bel", "cor", "dun", "el", "fal", "gar", "hal", "ith", "kel", "lor", "mor", "nar", "orm", "pel", "quel", "ran", "sar", "tal", "ul", "val", "wyn", "yr", "zel"];
const MIDDLES = ["a", "an", "ar", "en", "es", "ia", "il", "im", "or", "ov", "ra", "th", "un", "ys"];
const TAILS = ["ad", "ath", "dor", "eth", "gard", "heim", "hold", "iel", "mir", "nor", "reth", "rond", "shire", "thal", "vale", "wick", "wyr"];

/** Build a single capitalised name from the syllable tables. */
export function generateName(rng) {
  const useMiddle = rng() < 0.55;
  const raw = pick(rng, HEADS) + (useMiddle ? pick(rng, MIDDLES) : "") + pick(rng, TAILS);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Title-case a structure/preset id such as "hex-pointy" or "mountains". */
export function titleCase(value) {
  return String(value)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Resolve a user-entered name. Blank input becomes "<Type> <RandomName>",
 * which is the auto-naming rule the legend relies on.
 */
export function resolveName(kind, typed, rng) {
  const trimmed = typeof typed === "string" ? typed.trim() : "";
  if (trimmed) return trimmed;
  return `${titleCase(kind)} ${generateName(rng)}`;
}
