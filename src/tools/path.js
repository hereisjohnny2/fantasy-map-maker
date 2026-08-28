/**
 * Path tool for rivers, roads and borders.
 *
 * Click to lay control points; Enter or double-click finishes; Esc cancels.
 * Finished paths remain fully editable: drag a control point, click a segment
 * to insert one, Alt+click a point to remove it, or drag the path body.
 */
import { resolveName } from "../gen/nameGen.js";
import { createRng, randomSeedString } from "../gen/rng.js";
import { drawControlPoint, renderPath, requestRender } from "../render/renderer.js";
import { PATH_PRESETS, addObject, commitObjectSnapshot, newId, setSelection, setStatus, state } from "../state/store.js";
import { applyDrag, hitTest } from "./select.js";

let draft = null;
let drag = null;

function draftFromPreset(preset, point) {
  return {
    id: "draft-path",
    type: "path",
    kind: preset,
    points: [{ x: point.x, y: point.y }],
    ...structuredClone(PATH_PRESETS[preset] ?? PATH_PRESETS.river),
    visible: true,
  };
}

export function hasDraftPath() {
  return Boolean(draft);
}

export function cancelDraftPath() {
  if (!draft) return false;
  draft = null;
  setStatus("Path cancelled.");
  requestRender();
  return true;
}

/** Finish the in-progress path, prompting for its legend name. */
export function finishDraftPath() {
  if (!draft) return false;
  if (draft.points.length < 2) {
    draft = null;
    setStatus("A path needs at least two points.");
    requestRender();
    return false;
  }
  const points = draft.points;
  const kind = draft.kind;
  const typed = window.prompt(`Name this ${kind} (leave blank for a generated name):`, "");
  const finished = { ...draft, id: newId("path"), points };
  draft = null;

  if (typed === null) {
    setStatus("Path discarded.");
    requestRender();
    return false;
  }
  const name = resolveName(kind, typed, createRng(randomSeedString()));
  const middle = points[Math.floor(points.length / 2)];
  addObject(finished, { kind, name, x: middle.x, y: middle.y });
  setStatus(`Added "${name}".`);
  requestRender();
  return true;
}

export const pathTool = {
  id: "path",
  cursor: "crosshair",

  onPointerDown(event, point) {
    if (!draft) {
      const hit = hitTest(point);
      if (hit && hit.object.type === "path") {
        setSelection(hit.object.id);

        if (hit.kind === "point" && event.altKey) {
          if (hit.object.points.length <= 2) {
            setStatus("A path must keep at least two points.", "error");
            return;
          }
          const before = structuredClone(hit.object);
          hit.object.points.splice(hit.pointIndex, 1);
          commitObjectSnapshot(hit.object.id, before, "Remove path point");
          requestRender();
          return;
        }

        if (hit.kind === "segment") {
          const before = structuredClone(hit.object);
          hit.object.points.splice(hit.insertIndex, 0, { x: point.x, y: point.y });
          drag = {
            kind: "point",
            objectId: hit.object.id,
            pointIndex: hit.insertIndex,
            before,
            origin: point,
            last: point,
          };
          requestRender();
          return;
        }

        drag = {
          kind: hit.kind,
          objectId: hit.object.id,
          pointIndex: hit.pointIndex,
          handle: hit.handle,
          before: structuredClone(hit.object),
          origin: point,
          last: point,
        };
        requestRender();
        return;
      }

      draft = draftFromPreset(state.path.preset, point);
      setStatus("Click to add points. Enter or double-click finishes, Esc cancels.");
      requestRender();
      return;
    }

    draft.points.push({ x: point.x, y: point.y });
    requestRender();
  },

  onPointerMove(event, point) {
    if (drag) {
      applyDrag(drag, point);
      requestRender();
      return;
    }
    if (draft) {
      draft.preview = { x: point.x, y: point.y };
      requestRender();
    }
  },

  onPointerUp() {
    if (!drag) return;
    const { objectId, before, kind } = drag;
    drag = null;
    commitObjectSnapshot(objectId, before, kind === "point" ? "Edit path points" : "Move path");
    requestRender();
  },

  onDoubleClick() {
    if (draft) {
      finishDraftPath();
      return { handled: true };
    }
    return null;
  },

  drawOverlay(ctx) {
    if (!draft) return;
    const preview = draft.preview && draft.points.length
      ? { ...draft, points: [...draft.points, draft.preview] }
      : draft;
    renderPath(ctx, preview);
    for (const point of draft.points) drawControlPoint(ctx, point, true);
  },

  deactivate() {
    drag = null;
    if (draft) {
      draft = null;
      requestRender();
    }
  },
};
