/**
 * Brush stamp construction.
 *
 * Each stamp is built in a reused scratch canvas: fill with the brush's tiling
 * pattern, then `destination-in` a radial gradient for the feathered edge. The
 * pattern origin is anchored to *world* coordinates so the texture stays put
 * on the map instead of swimming along with the stroke.
 */
let scratch = null;
let scratchContext = null;

function getScratch(size) {
  if (!scratch) {
    scratch = document.createElement("canvas");
    scratchContext = scratch.getContext("2d");
  }
  if (scratch.width !== size || scratch.height !== size) {
    scratch.width = size;
    scratch.height = size;
  } else {
    scratchContext.setTransform(1, 0, 0, 1, 0, 0);
    scratchContext.globalCompositeOperation = "source-over";
    scratchContext.globalAlpha = 1;
    scratchContext.clearRect(0, 0, size, size);
  }
  return scratchContext;
}

function phase(value, period) {
  const result = value % period;
  return result < 0 ? result + period : result;
}

/**
 * Build one feathered, world-anchored stamp.
 * Returns the scratch canvas; draw it before requesting another stamp.
 */
export function buildStamp({ texture, diameter, hardness, worldX, worldY }) {
  const size = Math.max(1, Math.ceil(diameter));
  const ctx = getScratch(size);
  const radius = size / 2;
  const left = worldX - radius;
  const top = worldY - radius;

  const pattern = ctx.createPattern(texture, "repeat");
  if (!pattern) throw new Error("the brush texture could not be tiled");

  ctx.save();
  if (typeof pattern.setTransform === "function" && typeof DOMMatrix === "function") {
    pattern.setTransform(new DOMMatrix().translateSelf(-phase(left, texture.width), -phase(top, texture.height)));
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, size, size);
  } else {
    // Fallback for engines without CanvasPattern.setTransform.
    const offsetX = phase(left, texture.width);
    const offsetY = phase(top, texture.height);
    ctx.translate(-offsetX, -offsetY);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, size + texture.width, size + texture.height);
  }
  ctx.restore();

  const inner = Math.max(0, Math.min(0.98, hardness)) * radius;
  const gradient = ctx.createRadialGradient(radius, radius, inner, radius, radius, radius);
  gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
  gradient.addColorStop(0.75, "rgba(0, 0, 0, 0.72)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";

  return scratch;
}

/** The matching soft alpha mask used by the eraser's destination-out pass. */
export function eraserGradient(ctx, x, y, radius, hardness) {
  const inner = Math.max(0, Math.min(0.98, hardness)) * radius;
  const gradient = ctx.createRadialGradient(x, y, inner, x, y, radius);
  gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
  gradient.addColorStop(0.75, "rgba(0, 0, 0, 0.72)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  return gradient;
}
