/**
 * Scatter tool: drop discrete map symbols at a configurable density.
 *
 * Click drops one cluster; dragging lays a continuous band at the same density.
 * A hover ring shows the cluster size before you commit to it.
 */
import { beginScatter } from "../brush/scatter.js";
import { getSymbol, layerForSymbol } from "../brush/symbols.js";
import { rebuildCoastline, scheduleCoastlineRebuild } from "../render/coastline.js";
import { requestRender } from "../render/renderer.js";
import { view } from "../render/view.js";
import { history } from "../state/history.js";
import { getLayerMeta, setStatus, state } from "../state/store.js";

function afterRasterRestore(layerId) {
  if (layerId === "land") rebuildCoastline();
  requestRender();
}

export const scatterTool = {
  id: "scatter",
  cursor: "cell",
  session: null,
  hover: null,

  onPointerDown(event, point) {
    const layer = getLayerMeta(state.activeLayer);
    if (!layer) return;
    if (layer.locked) {
      setStatus(`The ${layer.label} layer is locked. Unlock it in the Layers panel to scatter into it.`, "error");
      return;
    }
    this.session = beginScatter({
      layerId: layer.id,
      symbolId: state.scatter.symbol,
      radius: state.scatter.radius,
      density: state.scatter.density,
      size: state.scatter.size,
      jitter: state.scatter.jitter,
    }, point);
    requestRender();
  },

  onPointerMove(event, point) {
    this.hover = { x: point.x, y: point.y };
    if (this.session) {
      this.session.extendTo(point);
    }
    requestRender();
  },

  onPointerUp() {
    const session = this.session;
    this.session = null;
    if (!session) return;
    const result = session.finish({ onRestore: afterRasterRestore });
    if (!result) {
      setStatus("Nothing was scattered - try a larger radius or a higher density.");
      return;
    }
    history.push(result.command);
    if (session.layerId === "land") scheduleCoastlineRebuild();
    const layer = getLayerMeta(session.layerId);
    setStatus(`Scattered ${result.count} ${getSymbol(state.scatter.symbol).label.toLowerCase()} element(s) into ${layer.label}.`);
    requestRender();
  },

  drawOverlay(ctx) {
    if (!this.hover) return;
    const unit = 1 / view.scale;
    ctx.save();
    ctx.strokeStyle = "rgba(20, 97, 141, 0.85)";
    ctx.lineWidth = 1.5 * unit;
    ctx.setLineDash([6 * unit, 4 * unit]);
    ctx.beginPath();
    ctx.arc(this.hover.x, this.hover.y, state.scatter.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },

  deactivate() {
    if (this.session) {
      const result = this.session.finish({ onRestore: afterRasterRestore });
      if (result) history.push(result.command);
      this.session = null;
    }
    this.hover = null;
  },
};

/** The terrain layer a symbol belongs in, used when the symbol picker changes. */
export { layerForSymbol };
