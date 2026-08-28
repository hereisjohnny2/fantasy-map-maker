/**
 * Text labels with an inline editor overlay positioned over the map.
 *
 * Clicking empty map creates a label; clicking an existing label re-opens it
 * for editing. Typography lives in the inspector so a label stays editable
 * after creation.
 */
import { requestRender } from "../render/renderer.js";
import { worldToScreen } from "../render/view.js";
import { addObject, newId, setSelection, setStatus, state, updateObject } from "../state/store.js";
import { hitTest } from "./select.js";

let overlay = null;
let input = null;
let editingId = null;
let anchor = { x: 0, y: 0 };

function elements() {
  if (!overlay) {
    overlay = document.getElementById("text-overlay");
    input = document.getElementById("text-input");
  }
  return { overlay, input };
}

export function isTextEditorOpen() {
  const { overlay: root } = elements();
  return root ? !root.hidden : false;
}

/** Open the overlay for a new label at `point`, or to edit `object`. */
export function openTextEditor(object, point) {
  const { overlay: root, input: field } = elements();
  if (!root) return;
  editingId = object?.id ?? null;
  anchor = object ? { x: object.x, y: object.y } : { x: point.x, y: point.y };
  field.value = object?.content ?? "";

  const screen = worldToScreen(anchor.x, anchor.y);
  const stage = root.parentElement.getBoundingClientRect();
  root.style.left = `${Math.min(Math.max(0, screen.x), Math.max(0, stage.width - 292))}px`;
  root.style.top = `${Math.min(Math.max(0, screen.y), Math.max(0, stage.height - 116))}px`;
  root.hidden = false;
  field.focus();
  field.select();
}

export function closeTextEditor() {
  const { overlay: root } = elements();
  if (!root) return;
  root.hidden = true;
  editingId = null;
}

/** Commit the overlay contents, creating or updating the label. */
export function applyTextEditor() {
  const { input: field } = elements();
  if (!field) return;
  const content = field.value.replace(/\s+$/g, "");
  const id = editingId;
  closeTextEditor();

  if (!content.trim()) {
    if (id) setStatus("Empty labels are not saved. Delete the label from the inspector instead.");
    return;
  }

  if (id) {
    updateObject(id, { content }, "Edit label");
  } else {
    const label = {
      id: newId("text"),
      type: "text",
      x: anchor.x,
      y: anchor.y,
      content,
      font: state.text.font,
      size: state.text.size,
      color: "#332514",
      alpha: 1,
      bold: false,
      italic: false,
      rotation: 0,
      halo: true,
      outlineColor: "#f6ecc9",
      outlineWidth: 4,
      visible: true,
    };
    addObject(label, null);
    setSelection(label.id);
  }
  requestRender();
}

export const textTool = {
  id: "text",
  cursor: "text",

  onPointerDown(event, point) {
    const hit = hitTest(point, { includeHandles: false });
    if (hit?.object.type === "text") {
      setSelection(hit.object.id);
      openTextEditor(hit.object, point);
      return;
    }
    openTextEditor(null, point);
  },

  deactivate() {
    closeTextEditor();
  },
};
