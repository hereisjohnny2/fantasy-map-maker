# Fantasy Map Maker - Architecture and Implementation Plan

**Date:** 2026-08-28
**Author:** Joao Cardoso
**Version:** 1.0.0

---

## Problem

Build a browser-based fantasy map editor: start from a blank parchment ocean, paint
continents/forests/mountains/cities with texture brushes, annotate with text and named
legend markers, pan/zoom, undo/redo, lock, and export to PNG - with no build step, so it
can be dropped onto GitHub Pages as-is.

## Approach

**Zero-dependency static site.** Plain `index.html` + CSS + ES modules. No npm, no bundler,
no framework. Everything (textures, noise, name generation) is produced procedurally in JS,
so the repo has no binary assets and no third-party licensing exposure. All asset paths are
relative so it works from a subpath like `user.github.io/fantasy-map-maker/`.

### Rendering model - hybrid raster + vector

| Tier | What | Why |
|---|---|---|
| Ocean | Procedural parchment + wave hatching, redrawn each frame | Never painted, so no memory cost |
| Raster layers | One canvas per brush type (`land`, `forest`, `mountains`, `hills`, `desert`, `swamp`, `city`), **allocated lazily on first use** | Per-type opacity / visibility / lock, without paying for unused types |
| Coastline | Derived ink outline of the `land` layer, recomputed (debounced) on stroke end | Gives the classic hand-inked coast |
| Grid overlay | Square / hex grid drawn at composite time, never rasterised | Non-destructive, restyleable at any moment |
| Object layer | Paths (rivers/roads/borders), text labels, legend markers, compass rose - held as JS objects, drawn on top each frame | Stays editable, selectable, movable forever |

The object layer draws in fixed sub-passes so ordering is predictable regardless of creation
order: **paths -> markers (and compass roses) -> text**. Paths additionally support a
"draw beneath terrain" toggle that moves them into the composite between the `land` layer
and the terrain layers, for maps where rivers should read as carved into the land rather
than laid over the forest canopy.

The full composite order implemented in `render/renderer.js` is:

```
ocean -> land -> beneath-terrain paths -> forest, mountains, hills, desert, swamp, city
      -> coastline -> grid -> paths -> markers and compasses -> text -> tool overlay
```

A single visible `<canvas>` composites the stack through a view transform
`{scale, tx, ty}`. Pointer coords go screen->world via the inverse transform, so pan/zoom
never touches the pixel data.

```
screenCss = world * scale + translation
devicePx  = screenCss * devicePixelRatio
```

`resizeToStage()` owns the DPR-aware backing store. Because assigning `canvas.width` clears
the canvas, that function **always** queues a repaint; an earlier revision let a resize land
on an already-clean frame and left the map blank, which is exactly the failure this rule
prevents.

### Brush and scatter engines

Two ways to deposit terrain, sharing one undo mechanism.

**Brush** - stamp-based: along the pointer path, place stamps every `size * 0.15` px. Each stamp
is built in a scratch canvas - fill with the brush's tiling pattern (pattern origin anchored to
**world** coords via `CanvasPattern.setTransform`, with a translate fallback, so texture doesn't
swim with the stroke), then `destination-in` a radial gradient for the feathered edge, then
`drawImage` onto the target layer at the brush alpha.

This gives the three "fading" controls the requirements imply:

- **Brush opacity** - alpha of each stroke as it is laid down
- **Hardness / feather** - where the edge gradient starts falling off
- **Layer opacity** - a per-layer slider to fade an entire element type on screen

Eraser is the same pipeline with `destination-out`.

**Scatter** - drops discrete symbols (broadleaf tree, pine, mountain, hill, dune, marsh tuft,
building) rather than smearing a texture, because that is how hand-drawn maps actually depict
terrain. Density is expressed per 10,000 world px^2 and held constant whether you click or drag:
a click fills the whole cluster disc, a drag fills only the strip newly swept since the last drop,
so dragging slowly does not pile up elements. Three details make the output read as drawn rather
than stamped:

- candidates are rejected when they land within half an element of one already placed, using a
  spatial hash, so a thicket looks scattered instead of clumped;
- the cluster rim is thinned probabilistically, so a click is not a hard-edged circle;
- each cluster is sorted by y and drawn back to front, so nearer elements overlap farther ones.

Choosing a symbol also switches the active layer to the one it belongs in, so trees land in
Forest and peaks land in Mountains without a second step.

Both engines write into the terrain raster through the same `TileCapture` helper, so scattered
elements inherit layer visibility, opacity and lock, are removable with the Eraser, and are saved
and exported like any other pixels. Individually movable symbols remain the Marker tool's job,
which keeps the two concepts cleanly separated.

### Default texture set (hand-drawn parchment / ink)

Generated on first use into small tileable canvases (192 px), cached: aged-cream parchment
with fibre grain (ocean gets faint wave hatching), lighter tan land, scalloped tree-tops,
hatched chevron mountains, arc hills, dotted desert, tufted swamp, hatched city blocks.
Tileability comes from *periodic* value noise for the grain (the lattice wraps at the tile
period) plus drawing every ink feature at its nine wrap-around offsets, so no feature is
clipped at a tile seam.

**Only `land` is a solid fill.** Every other terrain tile is ink symbols on a transparent
background, so a forest reads as drawn trees on the parchment rather than a green blob with
trees sitting on top of it - which is how hand-drawn maps actually depict terrain. This falls
out of the layer model for free: the overlay layers composite over the land fill, so leaving
their tiles unfilled needs no special case anywhere in the renderer, the brush, or export.
Layer opacity still works, fading the symbols rather than a wash of colour.

### Undo/redo

One command stack, three entry kinds:

- **Raster op** - before/after bitmaps of only the stroke's **dirty rect**, implemented as
  128 px tiles captured lazily the first time a stamp or scattered element touches them. A
  stroke therefore costs the tiles it actually crossed, never a full-canvas copy.
- **Object op** - JSON snapshots for add/remove/move/edit of text, markers, paths and roses.
- **Map op** - generate / reset / new. Generation re-runs from the stored seed instead of
  snapshotting *when the current map is still reproducible*; once the map contains
  hand-painted pixels that no seed can recreate, it falls back to a bounded raster snapshot.
  This is tracked by `state.map.reproducible`, which any raster edit clears.

Capped by both entry count (50) and a total byte budget (160 MB), evicting oldest.
`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` plus toolbar buttons.

### Random landmass generation

Seeded PRNG (mulberry32) -> fractal Brownian motion value noise -> threshold to a land mask,
multiplied by a radial falloff so continents pull away from the map edge. The mask is written
into the land layer, then a second noise field (plus an inland test against the mask)
auto-scatters forest and mountain texture. The dialog exposes seed, land amount, and roughness.

Calibration here was measured rather than guessed. fBm output clusters tightly around 0.5, so
the usable threshold band is narrow, and the falloff must stay near zero over most of the map
or nothing but a small central disc survives. With `distance` normalised so 1.0 is a map
corner, `falloff = distance ^ (3.6 - roughness) * 0.92` and
`threshold = 0.578 - landAmount * 0.318` give a clean monotonic response, measured at a fixed
seed:

| Land amount | 15 | 30 | 45 | 60 | 85 |
|---|---|---|---|---|---|
| Land coverage | 13% | 22% | 34% | 48% | 63% |

Scatter density was tuned the same way, down to tens of groves from the hundreds that first
carpeted the continent.

### Text and legend

- **Text tool** - click a point to drop a label; an inline editor overlay opens at that screen
  position. Properties: font, size, colour, alpha, bold/italic, rotation, and an outline/halo
  (essential for legibility over textured terrain). Double-click to re-edit, drag to move.
- **Marker tool** - click to place a legend structure (city, castle, ruin, port, peak, forest).
  It prompts for a name; blank input auto-fills `"<Type> <RandomName>"` from a syllable-based
  fantasy name generator. Terrain brushes also have an optional "name this stroke" toggle that
  drops a legend entry at the stroke centroid, so any structure can be named.
- **Legend panel** - editable names, click-to-pan, show/hide, reorder, delete; optional legend
  box baked into the PNG export. Legend order is stored independently of draw order, so
  reordering the list never changes what covers what on the map.

### Paths, grid, and compass

- **Path tool (rivers / roads / borders)** - click to lay control points, `Enter`/double-click to
  finish, `Esc` to cancel. Points are smoothed with a Catmull-Rom spline converted to cubic
  beziers, so a handful of clicks yields a natural curve. Once created, a path stays fully
  editable: drag a control point, click a segment to insert one, `Alt`+click to remove one, or
  drag the whole path.
  Three presets over one renderer:
  - *River* - tapered width interpolated from source to mouth, ink-blue, with an optional
    seeded hand-drawn wobble so it doesn't look CAD-straight
  - *Road* - constant width, dark casing plus a dashed or double line
  - *Border* - dotted/dash-dot political boundary

  Props: preset, colour, alpha, start/end width, wobble, dash pattern, casing, and the
  "beneath terrain" toggle. Paths are nameable and register into the legend like any other
  structure, so you get *"River Vaeloth"* with the same blank-input auto-naming.
- **Grid overlay** - off by default; square, pointy-top hex, or flat-top hex. Props: cell size,
  origin offset, line colour, alpha, line width, optional cell coordinate labels (`A1`/`B2` for
  square, axial `q,r` for hex), and an include-in-export toggle. Purely a composite-time pass,
  so it never touches pixel data and can be restyled or removed at any time.
- **Compass rose** - a placeable object drawn as procedural vector art (no image asset), in
  three styles: simple 4-point, 8-point with cardinal letters, and an ornate 16-point with ring
  detail. Draggable, scalable via corner handles, and freely rotatable via a rotation handle,
  with equivalent numeric size and rotation fields in the inspector so the transform is also
  keyboard-reachable.

All three are ordinary members of the object model, which means they inherit undo/redo, `.fmap`
serialisation, PNG export, and lock behaviour for free - no architectural change.

### Persistence

- **`.fmap` project file** - JSON with map name, size, view, layer rasters as PNG data URLs,
  objects, legend, custom textures and fonts, grid config, and seed. Save/Load buttons. Loading
  validates the format marker, version and dimensions before touching the editor.
- **Autosave** - debounced write after each change, with a "Restore last session?" prompt on load.

> **Deviation, confirmed during planning:** the original request said `localStorage`, but layer
> rasters as PNG data URLs will exceed its ~5 MB quota almost immediately. The implementation
> uses **IndexedDB** for the autosave document (same behaviour, no quota problem) and keeps
> `localStorage` for small UI prefs only. When IndexedDB is unavailable the status line says so
> explicitly and points at Save / Load, rather than silently losing work.

### File layout

```
index.html
styles/            app.css, panels.css
src/
  main.js
  state/     store.js  history.js  persist.js
  render/    renderer.js  layers.js  view.js  coastline.js  spline.js
             gridOverlay.js  compassArt.js
  brush/     brushEngine.js  stamp.js  textures.js  scatter.js  symbols.js
  tools/     paint.js  eraser.js  text.js  marker.js  path.js  compass.js
             hand.js  select.js  scatter.js
  gen/       noise.js  terrainGen.js  nameGen.js  rng.js
  ui/        toolbar.js  titlebar.js  layersPanel.js  legendPanel.js  dialogs.js
             inspector.js  gridPanel.js
  io/        exportPng.js  projectFile.js  textureLoader.js
textures/          optional user texture packs + textures.json manifest
tests.html         tiny zero-dep assertion runner for pure modules
README.md
```

Two `ui/` modules were added to the planned list rather than forced into an ill-fitting file:
`inspector.js` (the selected-object property editor) and `gridPanel.js` (the grid controls).
Both are property editors with their own refresh cycle; folding them into `layersPanel.js` or
`dialogs.js` would have mixed unrelated responsibilities.

Dependency direction is one-way: `state` knows nothing about rendering, `render` knows nothing
about tools or UI, `tools` and `ui` depend on `state` + `render`, and `main.js` wires them.
`coastline.js` takes a repaint callback instead of importing the renderer, which keeps that edge
acyclic. `state/history.js` is pure, which is what lets `tests.html` exercise it directly.

Deployment: GitHub Pages "deploy from branch -> root". No workflow or build required.
Note ES modules require an HTTP origin - locally use `python -m http.server`, not `file://`.

---

## Todos

All eighteen planned work items are implemented.

1. **scaffold** - repo skeleton, `index.html`, CSS, ES-module wiring, relative paths, README with local-serve + Pages instructions.
2. **canvas-view** - view transform, wheel-zoom-at-cursor, space/middle-drag pan, pinch, fit-to-screen, DPR-aware resize, rAF render loop.
3. **layer-system** - lazy per-type raster layers, fixed z-order, opacity/visibility/lock, compositing into the view.
4. **texture-gen** - procedural tileable parchment/ink textures for ocean and every brush type.
5. **brush-engine** - stamp pipeline, size/opacity/hardness/spacing, world-anchored patterns, eraser, dirty-rect tracking.
6. **coastline** - debounced ink outline derived from the land layer's alpha.
7. **history** - command stack, dirty-rect raster snapshots, object diffs, memory cap, shortcuts + buttons.
8. **terrain-gen** - seeded fBm noise, radial falloff, continent mask, auto forest/mountain scatter, generation dialog.
9. **text-tool** - click-to-place, inline editor overlay, full typography props, halo, select/move/edit/delete.
10. **markers-legend** - marker tool, name prompt + fantasy name generator, legend panel, name-this-stroke toggle.
11. **path-tools** - spline tool for rivers/roads/borders with post-hoc point editing, tapered river width, wobble, dash styles, "beneath terrain" toggle, legend registration.
12. **grid-overlay** - square / pointy-hex / flat-hex composite-time overlay with cell size, offset, colour, alpha, coordinate labels, and include-in-export toggle.
13. **compass-rose** - placeable procedural compass in 4/8/16-point styles; drag, scale via handles, free rotation, cardinal letters toggle.
14. **custom-textures** - PNG/JPG load via file picker and drag-drop, texture library, `textures.json` pack manifest.
15. **ui-chrome** - toolbar, editable map title bar, tool options panel, global + per-layer lock, layers panel, dialogs, shortcuts.
16. **export-png** - full-resolution composite at 1x/2x/4x, optional title banner, legend box, and grid, `toBlob` download.
17. **project-io** - `.fmap` save/load, IndexedDB autosave + restore prompt, New / Reset flows with confirmation.
18. **polish-deploy** - perf pass on large maps, touch support, keyboard a11y, README/docs, Pages config, manual QA checklist + `tests.html`.

## Notes and considerations

- **Fonts.** Only system/web-safe families ship by default (Georgia, Palatino, Times New Roman,
  Copperplate, serif, system-ui, cursive, fantasy). Bundling display fonts risks licence
  violations - instead users can load their own font file, which is registered at runtime via the
  `FontFace` API and travels inside the `.fmap` document. If bundled fonts are wanted later, pick
  SIL OFL ones (e.g. Cinzel, IM Fell) and include their licences.
- **Memory.** Default map 2048x1536 (options 1600x1200 / 2048x1536 / 3072x2304 / custom). Each
  lazily-created layer is ~12 MB RGBA, so a fully-used map sits around 90 MB plus history. The
  byte-budgeted history cap is what keeps this safe; large maps on mobile will want the smaller
  presets. Export refuses scales beyond the browser's 16384 px canvas limit and says why.
- **Lock.** The global lock disables paint/erase/text/marker/path/compass but deliberately leaves
  pan, zoom, save and export enabled, so a finished map stays browsable. Selection still works for
  inspection with the inspector's inputs disabled - there is no state the UI cannot get out of.
  Per-layer lock is separate and names the layer that refused the stroke.
- **"Structure" naming.** A raw brush stroke isn't naturally a discrete structure, so named entries
  come from the marker tool by default, with the per-stroke naming toggle covering the literal
  requirement.
- **Failure surfaces.** Anything that can fail on a static host reports through the status line
  with the real reason: IndexedDB unavailable, an undecodable image, a rejected file type, a
  foreign `.fmap`, an oversized export, or a font the browser will not register.
- **Extension points** still open: a distance/scale bar, region fill areas for political maps, and
  biome auto-colouring - all fit the object layer without changing the architecture.

## Validation

`tests.html` is a dependency-free assertion runner covering the pure modules: seeded RNG
determinism and uniformity, value/fBm noise range and *periodicity* (the property the tileable
textures depend on), name generation and the blank-input auto-naming rule, Catmull-Rom endpoint
preservation, path sampling, seeded wobble, point/segment hit-testing, grid coordinate labels, and
the history stack including redo-branch clearing and both eviction policies. 29 checks, all
passing.

Behaviour that needs a real browser was exercised through the DevTools protocol against the served
app: parchment ocean on a blank map, painting into a lazily created layer, coastline derivation,
undo/redo via buttons and keyboard, seeded generation reproducibility, marker/path/compass/text
creation with auto-naming, legend population, select-and-drag with undo, grid style switching,
`.fmap` round-trip, rejection of a foreign file, PNG export at map resolution, and the global lock
blocking edits while leaving zoom and export alive. Autosave was verified end to end: debounced
write to IndexedDB, restore prompt on reload, rasters and custom textures rebuilt, and nothing but
UI prefs in `localStorage`. The manual QA checklist in the README covers the rest.
