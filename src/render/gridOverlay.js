/**
 * Non-destructive grid overlay.
 *
 * Drawn at composite time in world coordinates, so it never touches pixel data
 * and can be restyled or switched off at any moment.
 */

export function withAlpha(hexColor, alpha) {
  const hex = String(hexColor).replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return `rgba(0, 0, 0, ${alpha})`;
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** Spreadsheet-style column name: 0 -> A, 25 -> Z, 26 -> AA. */
export function columnLabel(index) {
  let result = "";
  let value = index + 1;
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function hexPath(ctx, cx, cy, radius, pointy) {
  ctx.beginPath();
  for (let corner = 0; corner < 6; corner += 1) {
    const angle = (Math.PI / 180) * (60 * corner + (pointy ? 30 : 0));
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    if (corner === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawSquareGrid(ctx, grid, width, height) {
  const size = grid.size;
  const startColumn = Math.floor(-grid.offsetX / size);
  const startRow = Math.floor(-grid.offsetY / size);
  const endColumn = Math.ceil((width - grid.offsetX) / size);
  const endRow = Math.ceil((height - grid.offsetY) / size);

  ctx.beginPath();
  for (let column = startColumn; column <= endColumn; column += 1) {
    const x = grid.offsetX + column * size;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let row = startRow; row <= endRow; row += 1) {
    const y = grid.offsetY + row * size;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  if (!grid.labels) return;
  ctx.font = `${Math.max(9, Math.min(size * 0.2, 34))}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (let column = startColumn; column < endColumn; column += 1) {
    for (let row = startRow; row < endRow; row += 1) {
      const x = grid.offsetX + column * size;
      const y = grid.offsetY + row * size;
      if (x < -size || y < -size || x > width || y > height) continue;
      ctx.fillText(`${columnLabel(Math.max(0, column))}${Math.max(0, row) + 1}`, x + size * 0.08, y + size * 0.08);
    }
  }
}

function drawHexGrid(ctx, grid, width, height, pointy) {
  const radius = grid.size / Math.sqrt(3);
  const stepX = pointy ? Math.sqrt(3) * radius : 1.5 * radius;
  const stepY = pointy ? 1.5 * radius : Math.sqrt(3) * radius;
  const columns = Math.ceil(width / stepX) + 2;
  const rows = Math.ceil(height / stepY) + 2;

  if (grid.labels) {
    ctx.font = `${Math.max(8, Math.min(radius * 0.34, 26))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  }

  for (let row = -1; row <= rows; row += 1) {
    for (let column = -1; column <= columns; column += 1) {
      const cx = grid.offsetX + column * stepX + (pointy && Math.abs(row % 2) === 1 ? stepX / 2 : 0);
      const cy = grid.offsetY + row * stepY + (!pointy && Math.abs(column % 2) === 1 ? stepY / 2 : 0);
      if (cx < -radius * 2 || cy < -radius * 2 || cx > width + radius * 2 || cy > height + radius * 2) continue;
      hexPath(ctx, cx, cy, radius, pointy);
      ctx.stroke();
      if (grid.labels) {
        // Axial coordinates: q along the offset axis, r along the row axis.
        const q = pointy ? column - ((row - (row & 1)) >> 1) : column;
        const r = pointy ? row : row - ((column - (column & 1)) >> 1);
        ctx.fillText(`${q},${r}`, cx, cy);
      }
    }
  }
}

/** Paint the configured grid into a world-space context. */
export function drawGrid(ctx, grid, width, height) {
  if (!grid || grid.style === "none" || !(grid.size > 0) || grid.alpha <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  ctx.strokeStyle = withAlpha(grid.color, grid.alpha);
  ctx.fillStyle = withAlpha(grid.color, Math.min(1, grid.alpha + 0.25));
  ctx.lineWidth = grid.width;
  ctx.lineCap = "butt";
  ctx.setLineDash([]);

  if (grid.style === "square") drawSquareGrid(ctx, grid, width, height);
  else drawHexGrid(ctx, grid, width, height, grid.style === "hex-pointy");

  ctx.restore();
}
