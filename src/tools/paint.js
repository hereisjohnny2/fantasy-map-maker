/**
 * Terrain painting. The eraser reuses this factory with `erasing: true`.
 */
import { beginStroke } from "../brush/brushEngine.js";
import { resolveName } from "../gen/nameGen.js";
import { createRng, randomSeedString } from "../gen/rng.js";
import { rebuildCoastline, scheduleCoastlineRebuild } from "../render/coastline.js";
import { requestRender } from "../render/renderer.js";
import { centroidOf } from "../render/spline.js";
import { history } from "../state/history.js";
import { addLegendEntry, getLayerMeta, setStatus, state } from "../state/store.js";

function afterRasterRestore(layerId) {
  if (layerId === "land") rebuildCoastline();
  requestRender();
}

export function createBrushTool({ erasing }) {
  return {
    id: erasing ? "eraser" : "paint",
    cursor: "crosshair",
    session: null,

    onPointerDown(event, point) {
      const layer = getLayerMeta(state.activeLayer);
      if (!layer) return;
      if (layer.locked) {
        setStatus(`The ${layer.label} layer is locked. Unlock it in the Layers panel to ${erasing ? "erase" : "paint"}.`, "error");
        return;
      }
      this.session = beginStroke({
        layerId: layer.id,
        erasing,
        size: state.brush.size,
        opacity: state.brush.opacity,
        hardness: state.brush.hardness,
        textureId: state.brush.textureId,
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

      if (!erasing && state.brush.nameStroke && result.points.length) {
        const layer = getLayerMeta(session.layerId);
        const centre = centroidOf(result.points);
        const typed = window.prompt(`Name this ${layer.label.toLowerCase()} stroke (blank for a generated name):`, "");
        if (typed !== null) {
          const name = resolveName(layer.label, typed, createRng(randomSeedString()));
          addLegendEntry({ kind: layer.label.toLowerCase(), name, x: centre.x, y: centre.y });
          setStatus(`Added "${name}" to the legend.`);
        }
      }
      requestRender();
    },

    deactivate() {
      if (!this.session) return;
      const result = this.session.finish({ onRestore: afterRasterRestore });
      if (result) history.push(result.command);
      this.session = null;
    },
  };
}

export const paintTool = createBrushTool({ erasing: false });
