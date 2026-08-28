/**
 * Selection, movement and object editing.
 *
 * Hit-testing lives here (the other tools import it) and runs in reverse draw
 * order - text, then markers and compasses, then paths - so the topmost thing
 * under the cursor is what you grab.
 */
import { requestRender, handlesFor, measureTextObject, objectBounds } from "../render/renderer.js";
import { hitControlPoint, nearestSegment } from "../render/spline.js";
import { screenLengthToWorld } from "../render/view.js";
import {
  commitObjectSnapshot, getObject, isObjectVisible, setSelection, setStatus, state,
} from "../state/store.js";

/** Rotate a world point into an object's own unrotated frame. */
export function worldToLocal(object, point) {
  const angle = ((object.rotation ?? 0) * Math.PI) / 180;
  if (!angle) return { x: point.x - (object.x ?? 0), y: point.y - (object.y ?? 0) };
  const dx = point.x - object.x;
  const dy = point.y - object.y;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

function hitsText(object, point) {
  const local = worldToLocal(object, point);
  const { width, height } = measureTextObject(object);
  const pad = screenLengthToWorld(4);
  return local.x >= -pad && local.x <= width + pad && local.y >= -pad && local.y <= height + pad;
}

/**
 * Find what is under a world point.
 * Returns `{ object, kind, handle?, pointIndex?, insertIndex? }` or null.
 */
export function hitTest(point, { includeHandles = true } = {}) {
  const selected = getObject(state.selectedId);
  if (includeHandles && selected && isObjectVisible(selected)) {
    const grab = screenLengthToWorld(9);
    for (const handle of handlesFor(selected)) {
      if (Math.hypot(handle.x - point.x, handle.y - point.y) <= grab) {
        return { object: selected, kind: "handle", handle };
      }
    }
    if (selected.type === "path") {
      const index = hitControlPoint(selected.points, point, screenLengthToWorld(9));
      if (index >= 0) return { object: selected, kind: "point", pointIndex: index };
    }
  }

  const visible = state.objects.filter(isObjectVisible);

  for (let index = visible.length - 1; index >= 0; index -= 1) {
    const object = visible[index];
    if (object.type === "text" && hitsText(object, point)) return { object, kind: "body" };
  }

  for (let index = visible.length - 1; index >= 0; index -= 1) {
    const object = visible[index];
    if (object.type !== "marker" && object.type !== "compass") continue;
    const bounds = objectBounds(object);
    const radius = Math.max(bounds.width, bounds.height) / 2;
    if (Math.hypot(object.x - point.x, object.y - point.y) <= radius) return { object, kind: "body" };
  }

  for (let index = visible.length - 1; index >= 0; index -= 1) {
    const object = visible[index];
    if (object.type !== "path" || object.points.length < 2) continue;
    const pointIndex = hitControlPoint(object.points, point, screenLengthToWorld(9));
    if (pointIndex >= 0) return { object, kind: "point", pointIndex };
    const segment = nearestSegment(object.points, point);
    const tolerance = Math.max(screenLengthToWorld(7), (object.startWidth ?? 6) * 0.8);
    if (segment.distance <= tolerance) return { object, kind: "segment", insertIndex: segment.insertIndex };
  }

  return null;
}

function beginDrag(hit, point) {
  return {
    kind: hit.kind,
    objectId: hit.object.id,
    handle: hit.handle,
    pointIndex: hit.pointIndex,
    before: structuredClone(hit.object),
    origin: point,
    last: point,
  };
}

/** Shared drag application, reused by the path tool. */
export function applyDrag(drag, point) {
  const object = getObject(drag.objectId);
  if (!object) return;

  if (drag.kind === "point" && object.type === "path") {
    object.points[drag.pointIndex] = { x: point.x, y: point.y };
    return;
  }

  if (drag.kind === "handle" && drag.handle) {
    if (drag.handle.kind === "rotate") {
      const angle = (Math.atan2(point.y - object.y, point.x - object.x) * 180) / Math.PI + 90;
      object.rotation = Math.round(angle);
      return;
    }
    const bounds = objectBounds(drag.before.type ? drag.before : object);
    const centreX = drag.before.x ?? bounds.x + bounds.width / 2;
    const centreY = drag.before.y ?? bounds.y + bounds.height / 2;
    const startDistance = Math.max(1, Math.hypot(drag.origin.x - centreX, drag.origin.y - centreY));
    const nowDistance = Math.hypot(point.x - centreX, point.y - centreY);
    const factor = Math.max(0.08, nowDistance / startDistance);
    if (object.type === "compass") object.size = Math.round(Math.min(1200, Math.max(12, (drag.before.size ?? 90) * factor)));
    else if (object.type === "text") object.size = Math.round(Math.min(400, Math.max(6, (drag.before.size ?? 36) * factor)));
    return;
  }

  const dx = point.x - drag.last.x;
  const dy = point.y - drag.last.y;
  if (object.type === "path") for (const node of object.points) { node.x += dx; node.y += dy; }
  else { object.x += dx; object.y += dy; }
  drag.last = point;
}

export const selectTool = {
  id: "select",
  cursor: "default",
  drag: null,

  onPointerDown(event, point) {
    const hit = hitTest(point);
    if (!hit) {
      setSelection(null);
      requestRender();
      return;
    }
    setSelection(hit.object.id);
    if (state.locked) {
      setStatus("The map is locked, so objects can be inspected but not moved.");
      requestRender();
      return;
    }
    if (hit.kind === "segment") {
      this.drag = beginDrag({ ...hit, kind: "body" }, point);
      requestRender();
      return;
    }
    this.drag = beginDrag(hit, point);
    requestRender();
  },

  onPointerMove(event, point) {
    if (!this.drag) return;
    applyDrag(this.drag, point);
    requestRender();
  },

  onPointerUp() {
    if (!this.drag) return;
    const { objectId, before, kind } = this.drag;
    this.drag = null;
    const label = kind === "handle" ? "Transform object" : kind === "point" ? "Move path point" : "Move object";
    commitObjectSnapshot(objectId, before, label);
    requestRender();
  },

  onDoubleClick(event, point) {
    const hit = hitTest(point);
    if (hit?.object.type === "text") return { editText: hit.object };
    return null;
  },

  deactivate() {
    this.drag = null;
  },
};
