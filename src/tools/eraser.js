/**
 * The eraser is the brush pipeline with `destination-out` compositing, so it
 * shares spacing, feathering and tiled undo capture with painting.
 */
import { createBrushTool } from "./paint.js";

export const eraserTool = createBrushTool({ erasing: true });
