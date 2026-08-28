/**
 * Feathered radial-gradient mask for the eraser's `destination-out` stamps.
 */

/** The soft alpha mask used by the eraser's destination-out pass. */
export function eraserGradient(ctx, x, y, radius, hardness) {
  const inner = Math.max(0, Math.min(0.98, hardness)) * radius;
  const gradient = ctx.createRadialGradient(x, y, inner, x, y, radius);
  gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
  gradient.addColorStop(0.75, "rgba(0, 0, 0, 0.72)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  return gradient;
}
