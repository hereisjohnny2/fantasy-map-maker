# Fantasy Map Maker

A browser-based fantasy map editor with **no build step and no dependencies** - plain HTML, CSS
and native ES modules. Start from a blank blue ocean with a compass rose already in place, generate
a landmass, scatter forests and mountains, add rivers, roads, borders, labels and markers, then
export a PNG or save a portable `.fmap` file.

Every texture is generated procedurally in JavaScript, so the repository contains no binary
assets and the app works offline once loaded.

## Run it locally

ES modules need an HTTP origin, so serve the folder rather than opening `index.html` from disk:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/>. Any static server works (`npx serve`, `php -S`, nginx...).

Open <http://localhost:8000/tests.html> to run the built-in assertion suite for the pure modules
(seeded RNG, noise, name generation, splines, grid labels, history).

## Deploy to GitHub Pages

This repo includes [`.github/workflows/pages.yml`](.github/workflows/pages.yml), which publishes the
site on every push to `main` (or manually via **Actions > Deploy to GitHub Pages > Run workflow**).

1. Push this repository to GitHub.
2. **Settings > Pages > Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main` (or trigger the workflow manually) and wait for the run to finish; the deployed
   URL shows up in the workflow run summary and on the **Settings > Pages** screen.

No build step runs in the workflow - it just uploads the repository as-is. Every asset path is
relative, so the app works both at `user.github.io` and at a project subpath like
`user.github.io/fantasy-map-maker/`.

Prefer the simpler **Deploy from a branch** source instead? Every asset path is already relative,
so pointing it at your default branch's **`/ (root)`** folder works too, with no workflow needed.

## Controls

| Action | How |
|---|---|
| Zoom | Mouse wheel (zooms at the cursor), the Zoom buttons, or a two-finger pinch |
| Pan | `Space`+drag, middle-mouse drag, or the Hand tool (`H`) |
| Fit the map | **Fit map** button |
| Undo / redo | `Ctrl+Z`, `Ctrl+Y` or `Ctrl+Shift+Z`, or the toolbar buttons |
| Tools | `S` scatter, `E` eraser, `T` text, `M` marker, `P` path, `C` compass, `V` select, `H` hand |
| Delete selection | `Delete` or `Backspace`, or the inspector's Delete button |

**Terrain layers.** Each terrain type (land, forest, mountains, hills, desert, swamp, city) has its
own raster layer with independent visibility, opacity and lock, picked as the *Active layer* in the
Layers panel. Layers are only allocated once something is drawn into them, by the terrain generator,
the Scatter tool or the Eraser.

**Scattering.** The Scatter tool (`S`) drops discrete symbols - broadleaf trees, pines, mountains,
hills, dunes, marsh tufts, buildings - instead of smearing a texture. Set the element, the
**density**, the cluster radius, and the element size and size variation; the panel shows roughly
how many elements a single click will drop. Click for one cluster or drag to lay a band at the
same density. Picking an element switches *Active layer* to the layer it belongs in, and because
elements are baked into that layer the Eraser removes them like any other terrain.

**Paths.** Click to place control points; `Enter` or double-click finishes; `Esc` cancels. To edit
an existing path, drag a control point, click a segment to insert one, or `Alt`+click a point to
remove it. Rivers taper from source to mouth, roads get a casing plus a dashed or double line, and
borders use dash-dot. Any path can be drawn beneath the terrain layers.

**Naming.** Markers and paths prompt for a name; leave it blank and you get something like
*"Castle Belmiran"* from the built-in syllable generator. Legend entries can be renamed, hidden,
reordered, deleted, and clicked to centre the view on them.

**Custom fonts.** Font files can be loaded in Text options and are registered at runtime with the
`FontFace` API, so a loaded font travels inside saved maps and autosaves.

**Lock.** The global lock stops edits but deliberately keeps panning, zooming, saving and
exporting available, so a finished map stays browsable.

## Saving and exporting

- **Save / Load** downloads a portable `.fmap` file: title, size, view, terrain layer PNGs,
  objects, legend, custom fonts, grid settings and generator seed.
- **Autosave** writes to IndexedDB after each change and offers to restore your last session when
  you reopen the app. Raster data is never put in `localStorage`, which is only used for small UI
  preferences.
- **Export PNG** renders the full map at 1x, 2x or 4x with optional title banner, legend box and
  grid overlay.

## Project layout

```
index.html          app shell
styles/             app.css (layout, chrome) and panels.css (side panels)
src/main.js         entry point: input, tool registry, document actions, autosave
src/state/          store, undo/redo command stack, IndexedDB persistence
src/render/         compositor, view transform, layers, coastline, splines, grid, compass art
src/brush/          procedural textures, eraser stamp engine, scatter engine, symbols
src/gen/            seeded RNG, noise, name generator, terrain generator
src/tools/          scatter, eraser, text, marker, path, compass, select, hand
src/ui/             titlebar, toolbar, layers, grid, inspector, legend, dialogs
src/io/             .fmap documents, PNG export, font loading
tests.html          zero-dependency test runner
docs/architecture/  the architecture and implementation plan
```

The full design rationale is in
[`docs/architecture/fantasy-map-maker.md`](docs/architecture/fantasy-map-maker.md).

## Manual QA checklist

- [ ] A fresh load shows a blue ocean with faint wave hatching, a default compass rose in the
      bottom-right corner, and no land.
- [ ] Wheel zoom stays centred on the cursor; `Space`+drag, middle-drag and pinch all pan/zoom.
- [ ] **Fit map** frames the whole map at any window size; resizing the window never blanks it.
- [ ] Scatter drops elements at the configured density; a click matches the "per click" estimate,
      and dragging keeps the same density rather than piling up.
- [ ] Picking a scatter element switches *Active layer* to its layer; the Eraser removes
      scattered elements.
- [ ] Layer visibility, opacity and lock each behave independently; a locked layer refuses strokes
      and says which layer refused.
- [ ] Erasing a coastline updates the ink outline after the stroke ends.
- [ ] Undo/redo restores strokes exactly, via both buttons and keyboard.
- [ ] The same seed and settings regenerate an identical map; changing the seed changes it.
- [ ] Land amount from 15 to 85 gives visibly more land each step.
- [ ] Markers, paths, compass roses and labels can be created, selected, moved, edited and deleted.
- [ ] Blank name prompts produce `<Type> <Name>` entries in the legend.
- [ ] Legend rename, hide, reorder, delete and click-to-centre all work.
- [ ] Path points can be dragged, inserted on a segment, and `Alt`+click removed.
- [ ] A river tapers; a road shows its casing and dashes; a border is dash-dot.
- [ ] "Draw beneath terrain" moves a path under the forest/mountain layers.
- [ ] Each grid style renders, coordinate labels appear, and the grid can be excluded from export.
- [ ] Compass corner handles scale it and the rotation handle spins it; inspector numbers agree.
- [ ] A loaded font appears in the text font list and renders on the map.
- [ ] Export at 1x/2x/4x with each of title, legend and grid toggled produces the expected PNG.
- [ ] Save a `.fmap`, reload the page, load it back: layers, objects, legend, grid, title and seed
      all survive.
- [ ] Reopening the app offers to restore the autosave; declining it starts clean.
- [ ] With the map locked, editing is blocked but pan, zoom, save and export still work.
- [ ] Every control is reachable by keyboard and shows a visible focus ring.
