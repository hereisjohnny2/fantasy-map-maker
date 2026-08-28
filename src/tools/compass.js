/**
 * Compass rose placement. The rose is procedural vector art, so it is a normal
 * object: it inherits undo, .fmap saving, export and locking for free.
 */
import { requestRender } from "../render/renderer.js";
import { addObject, newId, setStatus, state } from "../state/store.js";

export const compassTool = {
  id: "compass",
  cursor: "copy",

  onPointerDown(event, point) {
    const compass = {
      id: newId("compass"),
      type: "compass",
      x: point.x,
      y: point.y,
      style: state.compass.style,
      size: 90,
      rotation: 0,
      color: "#3a2a19",
      alpha: 0.92,
      letters: true,
      visible: true,
    };
    addObject(compass, null);
    setStatus("Compass placed. Drag it, or use the corner and rotation handles with the Select tool.");
    requestRender();
  },
};
