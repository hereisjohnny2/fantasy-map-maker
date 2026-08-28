/**
 * Procedural map symbols used by the scatter tool.
 *
 * Each symbol is line art drawn around its own origin, sized so `size` is
 * roughly its full height. They stay simple deliberately: at normal map zoom a
 * tree is only a dozen screen pixels, so fine detail is wasted work.
 */

export const SYMBOLS = [
  { id: "tree", label: "Broadleaf tree", layer: "forest", ink: "#3b4f2b", fill: "#6f8a4e" },
  { id: "pine", label: "Pine", layer: "forest", ink: "#2f4526", fill: "#5c7a45" },
  { id: "mountain", label: "Mountain", layer: "mountains", ink: "#4f4436", fill: "#a2937c" },
  { id: "hill", label: "Hill", layer: "hills", ink: "#6f5a35", fill: "#c2a675" },
  { id: "dune", label: "Dune", layer: "desert", ink: "#9a8149", fill: "#e2ca90" },
  { id: "marsh", label: "Marsh tuft", layer: "swamp", ink: "#414a2f", fill: "#7c8757" },
  { id: "building", label: "Building", layer: "city", ink: "#5c3a24", fill: "#c08a63" },
];

export function getSymbol(id) {
  return SYMBOLS.find((symbol) => symbol.id === id) ?? SYMBOLS[0];
}

/** The terrain layer a symbol naturally belongs to. */
export function layerForSymbol(id) {
  return getSymbol(id).layer;
}

function wobblyCircle(ctx, cx, cy, radius, lobes, rng) {
  const points = [];
  for (let index = 0; index < lobes; index += 1) {
    const angle = (index / lobes) * Math.PI * 2;
    const reach = radius * (0.82 + rng() * 0.34);
    points.push({ x: cx + Math.cos(angle) * reach, y: cy + Math.sin(angle) * reach * 0.92 });
  }
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = midpoint(points[points.length - 1], points[0]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const end = midpoint(current, points[(index + 1) % points.length]);
    ctx.quadraticCurveTo(current.x, current.y, end.x, end.y);
  }
  ctx.closePath();
}

function drawTree(ctx, size, rng) {
  ctx.beginPath();
  ctx.moveTo(0, size * 0.12);
  ctx.lineTo(0, size * 0.5);
  ctx.stroke();
  wobblyCircle(ctx, 0, -size * 0.12, size * 0.34, 7, rng);
  ctx.fill();
  ctx.stroke();
}

function drawPine(ctx, size, rng) {
  ctx.beginPath();
  ctx.moveTo(0, size * 0.2);
  ctx.lineTo(0, size * 0.5);
  ctx.stroke();
  const tiers = 3;
  for (let tier = 0; tier < tiers; tier += 1) {
    const t = tier / tiers;
    const halfWidth = size * (0.32 - t * 0.09) * (0.9 + rng() * 0.2);
    const top = -size * (0.5 - t * 0.24);
    const base = top + size * 0.28;
    ctx.beginPath();
    ctx.moveTo(-halfWidth, base);
    ctx.lineTo(0, top);
    ctx.lineTo(halfWidth, base);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawMountain(ctx, size, rng) {
  const halfWidth = size * 0.52;
  const peak = -size * 0.46;
  ctx.beginPath();
  ctx.moveTo(-halfWidth, size * 0.4);
  ctx.lineTo(-size * 0.12, peak * (0.72 + rng() * 0.2));
  ctx.lineTo(halfWidth * 0.1, size * 0.16);
  ctx.lineTo(size * 0.2, peak * (0.5 + rng() * 0.2));
  ctx.lineTo(halfWidth, size * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Hachures down the shaded flank.
  ctx.beginPath();
  for (let hatch = 1; hatch <= 3; hatch += 1) {
    const t = hatch / 4;
    ctx.moveTo(-size * 0.12, peak * 0.72 + size * 0.1 * hatch);
    ctx.lineTo(-size * 0.12 - halfWidth * t * 0.7, size * 0.4);
  }
  ctx.stroke();
}

function drawHill(ctx, size, rng) {
  const width = size * (0.48 + rng() * 0.14);
  ctx.beginPath();
  ctx.moveTo(-width, size * 0.22);
  ctx.quadraticCurveTo(0, -size * 0.46, width, size * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (rng() < 0.5) {
    ctx.beginPath();
    ctx.moveTo(width * 0.5, size * 0.22);
    ctx.quadraticCurveTo(width * 1.05, -size * 0.12, width * 1.55, size * 0.22);
    ctx.stroke();
  }
}

function drawDune(ctx, size, rng) {
  const width = size * 0.6;
  ctx.beginPath();
  ctx.moveTo(-width, size * 0.16);
  ctx.quadraticCurveTo(-width * 0.1, -size * 0.3, width, size * 0.02);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-width * 0.5, size * 0.34);
  ctx.quadraticCurveTo(width * 0.2, -size * 0.02, width * 1.1, size * 0.26);
  ctx.stroke();
  if (rng() < 0.6) {
    ctx.beginPath();
    ctx.arc(width * (rng() - 0.5), size * 0.42, size * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMarsh(ctx, size, rng) {
  ctx.beginPath();
  ctx.moveTo(-size * 0.5, size * 0.34);
  ctx.lineTo(size * 0.5, size * 0.34);
  ctx.moveTo(-size * 0.34, size * 0.5);
  ctx.lineTo(size * 0.24, size * 0.5);
  ctx.stroke();
  ctx.beginPath();
  for (let blade = -1; blade <= 1; blade += 1) {
    const lean = blade * size * 0.16;
    ctx.moveTo(lean, size * 0.3);
    ctx.lineTo(lean + blade * size * 0.12, -size * (0.24 + rng() * 0.2));
  }
  ctx.stroke();
}

function drawBuilding(ctx, size, rng) {
  const width = size * (0.4 + rng() * 0.16);
  const height = size * 0.4;
  ctx.beginPath();
  ctx.rect(-width, size * 0.1 - height, width * 2, height);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-width * 1.2, size * 0.1 - height);
  ctx.lineTo(0, -size * 0.5);
  ctx.lineTo(width * 1.2, size * 0.1 - height);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

const PAINTERS = {
  tree: drawTree,
  pine: drawPine,
  mountain: drawMountain,
  hill: drawHill,
  dune: drawDune,
  marsh: drawMarsh,
  building: drawBuilding,
};

/**
 * Draw one symbol centred on (x, y). `rng` supplies the per-element variation,
 * so a scatter run is reproducible from its seed.
 */
export function drawSymbol(ctx, id, x, y, size, rng) {
  const symbol = getSymbol(id);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(0.6, size * 0.055);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = symbol.ink;
  ctx.fillStyle = symbol.fill;
  (PAINTERS[symbol.id] ?? drawTree)(ctx, size, rng);
  ctx.restore();
}
