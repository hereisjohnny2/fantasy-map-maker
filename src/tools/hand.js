/**
 * Panning tool. Space+drag and middle-drag do the same thing globally, so this
 * is the explicit, discoverable version of that gesture.
 */
import { requestRender } from "../render/renderer.js";
import { panBy } from "../render/view.js";

export const handTool = {
  id: "hand",
  cursor: "grab",
  last: null,

  onPointerDown(event) {
    this.last = { x: event.clientX, y: event.clientY };
  },

  onPointerMove(event) {
    if (!this.last) return;
    panBy(event.clientX - this.last.x, event.clientY - this.last.y);
    this.last = { x: event.clientX, y: event.clientY };
    requestRender();
  },

  onPointerUp() {
    this.last = null;
  },

  deactivate() {
    this.last = null;
  },
};
