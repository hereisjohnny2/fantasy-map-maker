/**
 * The compositor.
 *
 * A single visible canvas draws the whole stack through the view transform:
 *
 *   ocean -> land -> beneath-terrain paths -> remaining terrain layers ->
 *   coastline -> grid -> paths -> markers and compasses -> text -> overlay
 *
 * The object tier draws in fixed sub-passes so z-order never depends on the
 * order things happened to be created in. The same function paints the export
 * canvas, so what you see is what gets downloaded.
 */
import { getOceanTexture } from "../brush/textures.js";
import { TERRAIN_LAYERS, isObjectVisible, state } from "../state/store.js";
import { compassRadius, drawCompass } from "./compassArt.js";
import { getCoastline } from "./coastline.js";
import { drawGrid } from "./gridOverlay.js";
import { getRaster } from "./layers.js";
import { samplePath, wobbleSamples } from "./spline.js";
import { setViewport, view } from "./view.js";

let canvas = null;
let ctx = null;
let frameRequested = false;
let overlayPainter = null;

export function attachCanvas(element) {
  canvas = element;
  ctx = canvas.getContext("2d");
}

/** The active tool draws transient chrome (draft paths, handles) through this. */
export function setOverlayPainter(painter) {
  overlayPainter = painter;
}

/** Coalesce repaint requests into one animation frame. */
export function requestRender() {
  if (frameRequested || !ctx) return;
  frameRequested = true;
  requestAnimationFrame(() => {
    frameRequested = false;
    renderNow();
  });
}

/**
 * Match the backing store to the stage size and device pixel ratio.
 * Resizing clears the canvas, so this always queues a repaint.
 */
export function resizeToStage(stage) {
  if (!canvas) return;
  const rect = stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  setViewport(rect.width, rect.height, dpr);
  requestRender();
}

export function renderNow() {
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4f4638";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const zoom = view.dpr * view.scale;
  ctx.setTransform(zoom, 0, 0, zoom, view.dpr * view.tx, view.dpr * view.ty);
  ctx.imageSmoothingEnabled = true;
  renderScene(ctx, { grid: state.grid.style !== "none", interactive: true });
}

/** Paint the whole map into any world-space context. */
export function renderScene(target, { grid = true, interactive = false } = {}) {
  const { width, height } = state.map;

  target.save();
  target.fillStyle = target.createPattern(getOceanTexture(), "repeat");
  target.fillRect(0, 0, width, height);

  const beneath = [];
  const above = [];
  for (const object of state.objects) {
    if (object.type !== "path" || !isObjectVisible(object)) continue;
    (object.beneathTerrain ? beneath : above).push(object);
  }

  drawLayer(target, "land");
  for (const path of beneath) renderPath(target, path);
  for (const layer of TERRAIN_LAYERS) {
    if (layer.id !== "land") drawLayer(target, layer.id);
  }

  const coast = getCoastline();
  if (coast) target.drawImage(coast, 0, 0, width, height);

  if (grid) drawGrid(target, state.grid, width, height);

  for (const path of above) renderPath(target, path);
  for (const object of state.objects) {
    if (!isObjectVisible(object)) continue;
    if (object.type === "marker") drawMarker(target, object);
    else if (object.type === "compass") drawCompass(target, object);
  }
  for (const object of state.objects) {
    if (object.type === "text" && isObjectVisible(object)) drawText(target, object);
  }

  target.strokeStyle = "rgba(72, 56, 34, 0.85)";
  target.lineWidth = 3;
  target.setLineDash([]);
  target.strokeRect(0, 0, width, height);

  if (interactive && overlayPainter) overlayPainter(target);
  target.restore();
}

function drawLayer(target, id) {
  const meta = state.layers.find((layer) => layer.id === id);
  const raster = getRaster(id);
  if (!raster || !meta || !meta.visible || meta.opacity <= 0) return;
  target.save();
  target.globalAlpha = meta.opacity;
  target.drawImage(raster, 0, 0, state.map.width, state.map.height);
  target.restore();
}

/* ------------------------------------------------------------------ paths */

function dashPattern(style, width) {
  switch (style) {
    case "dashed": return [width * 2.4, width * 1.5];
    case "dotted": return [width * 0.12, width * 1.7];
    case "dash-dot": return [width * 2.6, width * 1.2, width * 0.12, width * 1.2];
    default: return [];
  }
}

function pathSamples(path) {
  const samples = samplePath(path.points, 7);
  const widest = Math.max(path.startWidth ?? 6, path.endWidth ?? 6);
  const amount = (path.wobble ?? 0) * Math.max(4, widest) * 1.1;
  return wobbleSamples(samples, amount, path.id ?? "draft");
}

function strokePolyline(target, samples) {
  target.beginPath();
  target.moveTo(samples[0].x, samples[0].y);
  for (let index = 1; index < samples.length; index += 1) target.lineTo(samples[index].x, samples[index].y);
}

function offsetPolyline(samples, offset) {
  return samples.map((sample, index) => {
    const previous = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: sample.x - (dy / length) * offset, y: sample.y + (dx / length) * offset };
  });
}

export function renderPath(target, path) {
  if (!path.points || path.points.length < 2) return;
  const samples = pathSamples(path);
  if (samples.length < 2) return;

  const startWidth = Math.max(0.5, path.startWidth ?? 6);
  const endWidth = Math.max(0.5, path.endWidth ?? startWidth);
  const color = path.color ?? "#37698f";

  target.save();
  target.globalAlpha = path.alpha ?? 0.9;
  target.lineCap = "round";
  target.lineJoin = "round";

  if (path.casing) {
    target.setLineDash([]);
    target.strokeStyle = "rgba(56, 40, 24, 0.8)";
    target.lineWidth = Math.max(startWidth, endWidth) + Math.max(2, startWidth * 0.5);
    strokePolyline(target, samples);
    target.stroke();
  }

  if (Math.abs(startWidth - endWidth) > 0.25) {
    // Tapered source-to-mouth stroke, drawn segment by segment.
    target.setLineDash([]);
    target.strokeStyle = color;
    for (let index = 1; index < samples.length; index += 1) {
      const t = index / (samples.length - 1);
      target.lineWidth = startWidth + (endWidth - startWidth) * t;
      target.beginPath();
      target.moveTo(samples[index - 1].x, samples[index - 1].y);
      target.lineTo(samples[index].x, samples[index].y);
      target.stroke();
    }
  } else if (path.dash === "double") {
    target.setLineDash([]);
    target.strokeStyle = color;
    target.lineWidth = Math.max(1, startWidth * 0.32);
    for (const offset of [-startWidth * 0.42, startWidth * 0.42]) {
      strokePolyline(target, offsetPolyline(samples, offset));
      target.stroke();
    }
  } else {
    target.strokeStyle = color;
    target.lineWidth = startWidth;
    target.setLineDash(dashPattern(path.dash, startWidth));
    strokePolyline(target, samples);
    target.stroke();
  }

  target.restore();
}

/* ---------------------------------------------------------------- markers */

export function drawMarker(target, marker) {
  const size = Math.max(6, marker.size ?? 28);
  const unit = size / 2;
  const ink = marker.color ?? "#3d2b1a";
  const fill = marker.fill ?? "#e8d6a4";

  target.save();
  target.translate(marker.x, marker.y);
  target.globalAlpha = marker.alpha ?? 1;
  target.strokeStyle = ink;
  target.fillStyle = fill;
  target.lineWidth = Math.max(1, size / 13);
  target.lineJoin = "round";
  target.setLineDash([]);

  const type = marker.markerType ?? "city";
  if (type === "city") {
    target.fillRect(-unit * 0.75, -unit * 0.15, unit * 1.5, unit * 1.05);
    target.strokeRect(-unit * 0.75, -unit * 0.15, unit * 1.5, unit * 1.05);
    target.beginPath();
    target.moveTo(-unit * 0.95, -unit * 0.15);
    target.lineTo(0, -unit * 0.95);
    target.lineTo(unit * 0.95, -unit * 0.15);
    target.closePath();
    target.fill();
    target.stroke();
  } else if (type === "castle") {
    target.fillRect(-unit * 0.9, -unit * 0.2, unit * 1.8, unit * 1.1);
    target.strokeRect(-unit * 0.9, -unit * 0.2, unit * 1.8, unit * 1.1);
    for (const x of [-0.9, -0.3, 0.3, 0.9]) {
      target.fillRect(x * unit - unit * 0.14, -unit * 0.75, unit * 0.28, unit * 0.58);
      target.strokeRect(x * unit - unit * 0.14, -unit * 0.75, unit * 0.28, unit * 0.58);
    }
  } else if (type === "ruin") {
    target.beginPath();
    target.moveTo(-unit * 0.9, unit * 0.9);
    target.lineTo(-unit * 0.6, -unit * 0.6);
    target.lineTo(-unit * 0.25, unit * 0.2);
    target.moveTo(unit * 0.15, unit * 0.9);
    target.lineTo(unit * 0.35, -unit * 0.85);
    target.lineTo(unit * 0.85, unit * 0.3);
    target.stroke();
    target.beginPath();
    target.moveTo(-unit, unit * 0.9);
    target.lineTo(unit, unit * 0.9);
    target.stroke();
  } else if (type === "port") {
    target.beginPath();
    target.arc(0, -unit * 0.62, unit * 0.24, 0, Math.PI * 2);
    target.stroke();
    target.beginPath();
    target.moveTo(0, -unit * 0.38);
    target.lineTo(0, unit * 0.8);
    target.moveTo(-unit * 0.55, -unit * 0.1);
    target.lineTo(unit * 0.55, -unit * 0.1);
    target.stroke();
    target.beginPath();
    target.arc(0, unit * 0.2, unit * 0.72, Math.PI * 0.16, Math.PI * 0.84);
    target.stroke();
  } else if (type === "peak") {
    target.beginPath();
    target.moveTo(-unit, unit * 0.75);
    target.lineTo(0, -unit * 0.95);
    target.lineTo(unit, unit * 0.75);
    target.closePath();
    target.fill();
    target.stroke();
    target.beginPath();
    target.moveTo(-unit * 0.3, -unit * 0.1);
    target.lineTo(0, -unit * 0.5);
    target.lineTo(unit * 0.3, -unit * 0.1);
    target.stroke();
  } else {
    for (const [cx, cy, r] of [[-0.5, 0.1, 0.44], [0.5, 0.1, 0.44], [0, -0.35, 0.52]]) {
      target.beginPath();
      target.arc(cx * unit, cy * unit, r * unit, 0, Math.PI * 2);
      target.fill();
      target.stroke();
    }
    target.beginPath();
    target.moveTo(0, unit * 0.2);
    target.lineTo(0, unit * 0.95);
    target.stroke();
  }

  target.restore();
}

/* ------------------------------------------------------------------- text */

export function fontString(text) {
  const style = text.italic ? "italic " : "";
  const weight = text.bold ? "bold " : "";
  return `${style}${weight}${Math.max(4, text.size ?? 36)}px ${text.font ?? "Georgia"}, serif`;
}

export function textLines(text) {
  return String(text.content ?? "").split("\n");
}

/** Unrotated width/height of a text object, measured with the real font. */
export function measureTextObject(text) {
  if (!ctx) return { width: 0, height: 0, lineHeight: 0 };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = fontString(text);
  const lines = textLines(text);
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width), 1);
  ctx.restore();
  const lineHeight = (text.size ?? 36) * 1.25;
  return { width, height: lineHeight * lines.length, lineHeight };
}

export function drawText(target, text) {
  const lines = textLines(text);
  const { lineHeight } = measureTextObject(text);
  target.save();
  target.translate(text.x, text.y);
  target.rotate(((text.rotation ?? 0) * Math.PI) / 180);
  target.globalAlpha = text.alpha ?? 1;
  target.font = fontString(text);
  target.textAlign = "left";
  target.textBaseline = "top";
  target.lineJoin = "round";
  target.setLineDash([]);
  lines.forEach((line, index) => {
    const y = index * lineHeight;
    if (text.halo !== false && (text.outlineWidth ?? 4) > 0) {
      target.strokeStyle = text.outlineColor ?? "#f6ecc9";
      target.lineWidth = text.outlineWidth ?? 4;
      target.strokeText(line, 0, y);
    }
    target.fillStyle = text.color ?? "#332514";
    target.fillText(line, 0, y);
  });
  target.restore();
}

/* -------------------------------------------------------------- geometry */

/** Axis-aligned world bounds of an object, used for selection and hit-testing. */
export function objectBounds(object) {
  if (object.type === "text") {
    const { width, height } = measureTextObject(object);
    return { x: object.x, y: object.y, width, height };
  }
  if (object.type === "marker") {
    const size = Math.max(6, object.size ?? 28);
    return { x: object.x - size / 2, y: object.y - size / 2, width: size, height: size };
  }
  if (object.type === "compass") {
    const radius = compassRadius(object);
    return { x: object.x - radius, y: object.y - radius, width: radius * 2, height: radius * 2 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of object.points ?? []) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** A representative anchor point, used for legend "pan to" and stroke naming. */
export function objectAnchor(object) {
  const bounds = objectBounds(object);
  if (object.type === "marker" || object.type === "compass") return { x: object.x, y: object.y };
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

/**
 * Scale and rotation handles for compass and text objects, in world space.
 * Handle size is expressed in CSS pixels so it stays grabbable at any zoom.
 */
export function handlesFor(object) {
  if (object.type !== "compass" && object.type !== "text") return [];
  const bounds = objectBounds(object);
  const corners = [
    { id: "nw", x: bounds.x, y: bounds.y },
    { id: "ne", x: bounds.x + bounds.width, y: bounds.y },
    { id: "se", x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { id: "sw", x: bounds.x, y: bounds.y + bounds.height },
  ];
  const rotate = { id: "rotate", x: bounds.x + bounds.width / 2, y: bounds.y - 34 / view.scale };
  return [...corners.map((corner) => ({ ...corner, kind: "scale" })), { ...rotate, kind: "rotate" }];
}

/** Draw the selection rectangle and handles for the selected object. */
export function drawSelectionChrome(target, object) {
  if (!object) return;
  const bounds = objectBounds(object);
  const unit = 1 / view.scale;
  target.save();
  target.strokeStyle = "#14618d";
  target.lineWidth = 1.5 * unit;
  target.setLineDash([6 * unit, 4 * unit]);
  target.strokeRect(bounds.x - 4 * unit, bounds.y - 4 * unit, bounds.width + 8 * unit, bounds.height + 8 * unit);
  target.setLineDash([]);

  for (const handle of handlesFor(object)) {
    const radius = (handle.kind === "rotate" ? 6 : 5) * unit;
    if (handle.kind === "rotate") {
      target.beginPath();
      target.moveTo(bounds.x + bounds.width / 2, bounds.y - 4 * unit);
      target.lineTo(handle.x, handle.y);
      target.stroke();
    }
    target.beginPath();
    target.arc(handle.x, handle.y, radius, 0, Math.PI * 2);
    target.fillStyle = handle.kind === "rotate" ? "#d8eaf5" : "#fff8e6";
    target.fill();
    target.stroke();
  }

  if (object.type === "path") {
    for (const point of object.points) drawControlPoint(target, point);
  }
  target.restore();
}

export function drawControlPoint(target, point, active = false) {
  const unit = 1 / view.scale;
  target.save();
  target.beginPath();
  target.arc(point.x, point.y, 5.5 * unit, 0, Math.PI * 2);
  target.fillStyle = active ? "#d8eaf5" : "#fff8e6";
  target.strokeStyle = "#14618d";
  target.lineWidth = 1.5 * unit;
  target.setLineDash([]);
  target.fill();
  target.stroke();
  target.restore();
}
