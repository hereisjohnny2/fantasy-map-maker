/**
 * Full-resolution PNG export.
 *
 * The export canvas is painted by the same `renderScene` the screen uses, so
 * the download matches the editor, then the optional title banner and legend
 * box are drawn on top at map scale.
 */
import { createCanvas } from "../render/layers.js";
import { renderScene } from "../render/renderer.js";
import { state } from "../state/store.js";
import { downloadBlob, safeFileName } from "./projectFile.js";

function drawTitleBanner(ctx, width) {
  const height = Math.max(56, width * 0.045);
  ctx.save();
  ctx.fillStyle = "rgba(246, 236, 205, 0.86)";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(88, 66, 38, 0.9)";
  ctx.lineWidth = Math.max(1, height * 0.03);
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(width, height);
  ctx.stroke();
  ctx.fillStyle = "#3a2a17";
  ctx.font = `bold ${Math.round(height * 0.52)}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(state.map.title, width / 2, height * 0.52);
  ctx.restore();
}

function drawLegendBox(ctx, width, height) {
  const entries = state.legend.filter((entry) => entry.visible !== false);
  if (!entries.length) return;

  const shown = entries.slice(0, 22);
  const fontSize = Math.max(13, width * 0.013);
  const lineHeight = fontSize * 1.5;
  const boxWidth = Math.max(220, width * 0.24);
  const boxHeight = lineHeight * (shown.length + 1.6);
  const x = width - boxWidth - width * 0.02;
  const y = height - boxHeight - height * 0.025;

  ctx.save();
  ctx.fillStyle = "rgba(245, 233, 201, 0.9)";
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.strokeStyle = "rgba(88, 66, 38, 0.9)";
  ctx.lineWidth = Math.max(1, fontSize * 0.12);
  ctx.strokeRect(x, y, boxWidth, boxHeight);

  ctx.fillStyle = "#3a2a17";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `bold ${Math.round(fontSize * 1.15)}px Georgia, serif`;
  ctx.fillText("Legend", x + fontSize, y + lineHeight * 0.85);
  ctx.font = `${Math.round(fontSize)}px Georgia, serif`;
  shown.forEach((entry, index) => {
    const text = `${entry.name} - ${entry.kind}`;
    ctx.fillText(text, x + fontSize, y + lineHeight * (index + 1.9));
  });
  if (entries.length > shown.length) {
    ctx.fillText(`+${entries.length - shown.length} more`, x + fontSize, y + lineHeight * (shown.length + 1.9));
  }
  ctx.restore();
}

/** Render and download the map. Returns the pixel size that was produced. */
export async function exportPng({ scale = 2, title = true, legend = true, grid = true } = {}) {
  const width = Math.round(state.map.width * scale);
  const height = Math.round(state.map.height * scale);
  const maxSide = 16384;
  if (width > maxSide || height > maxSide) {
    throw new Error(`${scale}x exceeds this browser's ${maxSide}px canvas limit - choose a smaller scale`);
  }

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("a 2D canvas context could not be created for export");
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  renderScene(ctx, { grid: grid && state.grid.style !== "none", interactive: false });
  if (title) drawTitleBanner(ctx, state.map.width);
  if (legend) drawLegendBox(ctx, state.map.width, state.map.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("this browser could not encode the PNG (the image may be too large)");
  downloadBlob(blob, safeFileName(state.map.title, "png"));
  return { width, height, bytes: blob.size };
}
