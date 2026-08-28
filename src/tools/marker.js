/**
 * Legend marker placement. A blank name prompt auto-fills
 * "<Type> <RandomName>" from the syllable name generator.
 */
import { resolveName } from "../gen/nameGen.js";
import { createRng, randomSeedString } from "../gen/rng.js";
import { requestRender } from "../render/renderer.js";
import { addObject, newId, setStatus, state } from "../state/store.js";

export const markerTool = {
  id: "marker",
  cursor: "copy",

  onPointerDown(event, point) {
    const type = state.marker.type;
    const typed = window.prompt(`Name this ${type} (leave blank for a generated name):`, "");
    if (typed === null) return;

    const name = resolveName(type, typed, createRng(randomSeedString()));
    const marker = {
      id: newId("marker"),
      type: "marker",
      markerType: type,
      x: point.x,
      y: point.y,
      size: state.marker.size,
      color: "#3d2b1a",
      fill: "#e8d6a4",
      alpha: 1,
      visible: true,
    };
    addObject(marker, { kind: type, name, x: point.x, y: point.y });
    setStatus(`Placed "${name}".`);
    requestRender();
  },
};
