/**
 * The single world -> screen transform. Pan and zoom only ever touch these
 * numbers, so pixel data is never resampled by navigating the map.
 *
 *   screenCss = world * scale + translation
 *   devicePx  = screenCss * devicePixelRatio
 */
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;

export const view = {
  scale: 0.4,
  tx: 0,
  ty: 0,
  dpr: 1,
  cssWidth: 1,
  cssHeight: 1,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function setViewport(cssWidth, cssHeight, dpr) {
  view.cssWidth = Math.max(1, cssWidth);
  view.cssHeight = Math.max(1, cssHeight);
  view.dpr = dpr > 0 ? dpr : 1;
}

export function screenToWorld(x, y) {
  return { x: (x - view.tx) / view.scale, y: (y - view.ty) / view.scale };
}

export function worldToScreen(x, y) {
  return { x: x * view.scale + view.tx, y: y * view.scale + view.ty };
}

/** Distance in world units for a length measured in CSS pixels. */
export function screenLengthToWorld(length) {
  return length / view.scale;
}

export function panBy(dx, dy) {
  view.tx += dx;
  view.ty += dy;
}

/** Zoom by `factor` while keeping the world point under (screenX, screenY) fixed. */
export function zoomAt(screenX, screenY, factor) {
  const before = screenToWorld(screenX, screenY);
  view.scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  view.tx = screenX - before.x * view.scale;
  view.ty = screenY - before.y * view.scale;
}

/** Set an absolute scale about a screen point (used by pinch gestures). */
export function zoomTo(screenX, screenY, scale) {
  const before = screenToWorld(screenX, screenY);
  view.scale = clamp(scale, MIN_SCALE, MAX_SCALE);
  view.tx = screenX - before.x * view.scale;
  view.ty = screenY - before.y * view.scale;
}

/** Centre the whole map in the viewport with a small margin. */
export function fit(mapWidth, mapHeight, padding = 44) {
  const scale = Math.min(
    (view.cssWidth - padding * 2) / mapWidth,
    (view.cssHeight - padding * 2) / mapHeight,
  );
  view.scale = clamp(scale, MIN_SCALE, MAX_SCALE);
  view.tx = (view.cssWidth - mapWidth * view.scale) / 2;
  view.ty = (view.cssHeight - mapHeight * view.scale) / 2;
}

/** Move the view so a world point sits in the middle of the viewport. */
export function centreOn(worldX, worldY) {
  view.tx = view.cssWidth / 2 - worldX * view.scale;
  view.ty = view.cssHeight / 2 - worldY * view.scale;
}

export function serializeView() {
  return { scale: view.scale, tx: view.tx, ty: view.ty };
}

export function applyView(saved) {
  if (!saved) return;
  if (Number.isFinite(saved.scale)) view.scale = clamp(saved.scale, MIN_SCALE, MAX_SCALE);
  if (Number.isFinite(saved.tx)) view.tx = saved.tx;
  if (Number.isFinite(saved.ty)) view.ty = saved.ty;
}
