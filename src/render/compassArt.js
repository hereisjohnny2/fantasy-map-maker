/**
 * Procedural compass rose art - vector only, no image asset.
 *
 * Three styles: a plain 4-point star, an 8-point rose with cardinal letters,
 * and an ornate 16-point rose with a detail ring.
 */
const CARDINALS = ["N", "E", "S", "W"];

function starPoints(ctx, count, outer, inner, waistRatio) {
  const waist = outer * waistRatio;
  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    const half = Math.PI / count;
    const length = index % 2 === 0 ? outer : inner;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle - half) * waist, Math.sin(angle - half) * waist);
    ctx.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
    ctx.lineTo(Math.cos(angle + half) * waist, Math.sin(angle + half) * waist);
    ctx.closePath();
    if (index % 2 === 0) ctx.fill();
    else ctx.stroke();
  }
}

/**
 * Draw one compass object. The context is expected to be in world space;
 * this function applies the object's own translation, rotation and scale.
 */
export function drawCompass(ctx, compass) {
  const radius = Math.max(6, compass.size ?? 90);
  const style = compass.style ?? "points8";
  const color = compass.color ?? "#3a2a19";

  ctx.save();
  ctx.translate(compass.x, compass.y);
  ctx.rotate(((compass.rotation ?? 0) * Math.PI) / 180);
  ctx.globalAlpha = compass.alpha ?? 0.92;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(0.8, radius / 26);
  ctx.lineJoin = "round";

  if (style === "ornate16") {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.92, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
    ctx.stroke();
    for (let tick = 0; tick < 32; tick += 1) {
      const angle = (tick * Math.PI * 2) / 32;
      const long = tick % 4 === 0;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * radius * 0.82, Math.sin(angle) * radius * 0.82);
      ctx.lineTo(Math.cos(angle) * radius * (long ? 0.68 : 0.75), Math.sin(angle) * radius * (long ? 0.68 : 0.75));
      ctx.stroke();
    }
    starPoints(ctx, 16, radius * 0.66, radius * 0.34, 0.1);
  } else if (style === "simple4") {
    starPoints(ctx, 4, radius, radius * 0.4, 0.16);
  } else {
    starPoints(ctx, 8, radius, radius * 0.5, 0.13);
  }

  ctx.beginPath();
  ctx.arc(0, 0, radius * (style === "ornate16" ? 0.09 : 0.11), 0, Math.PI * 2);
  ctx.fill();

  if (compass.letters !== false && style !== "simple4") {
    const distance = style === "ornate16" ? radius * 1.12 : radius * 1.2;
    ctx.font = `bold ${Math.max(10, radius * 0.26)}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    CARDINALS.forEach((letter, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 2;
      ctx.fillText(letter, Math.cos(angle) * distance, Math.sin(angle) * distance);
    });
  }

  ctx.restore();
}

/** Radius used for hit-testing and selection handles. */
export function compassRadius(compass) {
  const base = Math.max(6, compass.size ?? 90);
  return compass.letters !== false && compass.style !== "simple4" ? base * 1.32 : base * 1.05;
}
