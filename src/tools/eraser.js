/**
 * Eraser: stamp-based `destination-out` compositing, sharing spacing,
 * feathering and tiled undo capture with the scatter tool.
 */
import { beginStroke } from "../brush/brushEngine.js";
import { rebuildCoastline, scheduleCoastlineRebuild } from "../render/coastline.js";
import { requestRender } from "../render/renderer.js";
import { history } from "../state/history.js";
import { getLayerMeta, setStatus, state } from "../state/store.js";

function afterRasterRestore(layerId) {
  if (layerId === "land") rebuildCoastline();
  requestRender();
}

export const eraserTool = {
  id: "eraser",
  cursor: "crosshair",
  session: null,

  onPointerDown(event, point) {
    const layer = getLayerMeta(state.activeLayer);
    if (!layer) return;
    if (layer.locked) {
      setStatus(`The ${layer.label} layer is locked. Unlock it in the Layers panel to erase.`, "error");
      return;
    }
    this.session = beginStroke({
      layerId: layer.id,
      size: state.eraser.size,
      opacity: state.eraser.opacity,
      hardness: state.eraser.hardness,
    }, point);
    requestRender();
  },

  onPointerMove(event, point) {
    if (!this.session) return;
    this.session.extendTo(point);
    requestRender();
  },

  onPointerUp() {
    const session = this.session;
    this.session = null;
    if (!session) return;

    const result = session.finish({ onRestore: afterRasterRestore });
    if (!result) return;
    history.push(result.command);

    if (session.layerId === "land") scheduleCoastlineRebuild();
    requestRender();
  },

  deactivate() {
    if (!this.session) return;
    const result = this.session.finish({ onRestore: afterRasterRestore });
    if (result) history.push(result.command);
    this.session = null;
  },
};
