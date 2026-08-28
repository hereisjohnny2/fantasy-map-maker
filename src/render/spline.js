/**
 * Catmull-Rom smoothing, sampling and hit-testing for the path tool.
 *
 * A handful of clicked control points becomes a natural curve: the Catmull-Rom
 * spline through them is converted to cubic beziers, which canvas can stroke
 * directly and which we can also sample for tapered / wobbled rivers.
 */
import { createRng } from "../gen/rng.js";

/**
 * Convert control points into cubic bezier segments.
 * Returns `[{ from, cp1, cp2, to }]`; endpoints are preserved exactly.
 */
export function catmullRomToBezier(points, tension = 1) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    segments.push({
      from: { x: p1.x, y: p1.y },
      cp1: { x: p1.x + ((p2.x - p0.x) / 6) * tension, y: p1.y + ((p2.y - p0.y) / 6) * tension },
      cp2: { x: p2.x - ((p3.x - p1.x) / 6) * tension, y: p2.y - ((p3.y - p1.y) / 6) * tension },
      to: { x: p2.x, y: p2.y },
    });
  }
  return segments;
}

/** Trace the smoothed curve into a canvas path (no stroke/fill applied). */
export function traceSpline(ctx, points, tension = 1) {
  const segments = catmullRomToBezier(points, tension);
  if (!segments.length) return false;
  ctx.beginPath();
  ctx.moveTo(segments[0].from.x, segments[0].from.y);
  for (const segment of segments) {
    ctx.bezierCurveTo(segment.cp1.x, segment.cp1.y, segment.cp2.x, segment.cp2.y, segment.to.x, segment.to.y);
  }
  return true;
}

/** Even-ish samples along the smoothed curve, used for tapering and wobble. */
export function samplePath(points, step = 7, tension = 1) {
  const segments = catmullRomToBezier(points, tension);
  if (!segments.length) return points.map((point) => ({ x: point.x, y: point.y }));
  const samples = [{ x: segments[0].from.x, y: segments[0].from.y }];
  for (const { from, cp1, cp2, to } of segments) {
    const rough = Math.hypot(to.x - from.x, to.y - from.y) + Math.hypot(cp1.x - from.x, cp1.y - from.y);
    const steps = Math.max(2, Math.ceil(rough / step));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const u = 1 - t;
      samples.push({
        x: u ** 3 * from.x + 3 * u ** 2 * t * cp1.x + 3 * u * t ** 2 * cp2.x + t ** 3 * to.x,
        y: u ** 3 * from.y + 3 * u ** 2 * t * cp1.y + 3 * u * t ** 2 * cp2.y + t ** 3 * to.y,
      });
    }
  }
  return samples;
}

/**
 * Offset samples along their normals with smooth seeded noise, so a river
 * reads as hand-drawn rather than CAD-straight. Endpoints stay put.
 */
export function wobbleSamples(samples, amount, seed = "river") {
  if (!amount || samples.length < 3) return samples;
  const rng = createRng(seed);
  const phase = rng() * Math.PI * 2;
  const frequency = 0.11 + rng() * 0.07;
  return samples.map((sample, index) => {
    if (index === 0 || index === samples.length - 1) return sample;
    const previous = samples[index - 1];
    const next = samples[index + 1];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const swing = Math.sin(index * frequency + phase) * 0.65 + Math.sin(index * frequency * 2.3 + phase * 1.7) * 0.35;
    const offset = swing * amount;
    return { x: sample.x - (dy / length) * offset, y: sample.y + (dx / length) * offset };
  });
}

export function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.min(1, Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

/** Index of a control point within `tolerance` of `target`, or -1. */
export function hitControlPoint(points, target, tolerance) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (Math.hypot(points[index].x - target.x, points[index].y - target.y) <= tolerance) return index;
  }
  return -1;
}

/**
 * Nearest curve segment to `target`, measured against the smoothed samples so
 * clicking the visible curve works even where it bows away from the polyline.
 * Returns `{ insertIndex, distance }`.
 */
export function nearestSegment(points, target) {
  if (points.length < 2) return { insertIndex: -1, distance: Infinity };
  let best = { insertIndex: -1, distance: Infinity };
  for (let index = 1; index < points.length; index += 1) {
    const samples = samplePath([
      points[index - 2] ?? points[index - 1],
      points[index - 1],
      points[index],
      points[index + 1] ?? points[index],
    ], 6);
    const slice = samples.slice(Math.floor(samples.length / 3), Math.ceil((samples.length * 2) / 3) + 1);
    for (let s = 1; s < slice.length; s += 1) {
      const distance = distanceToSegment(target, slice[s - 1], slice[s]);
      if (distance < best.distance) best = { insertIndex: index, distance };
    }
  }
  return best;
}

export function boundsOfPoints(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

export function centroidOf(points) {
  if (!points.length) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}
