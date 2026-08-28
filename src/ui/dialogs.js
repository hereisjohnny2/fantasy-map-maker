/**
 * Modal dialogs: generator, save/load, export, map size and autosave restore.
 *
 * Long-running work (generation, export) reports through the status line and
 * surfaces real error text rather than failing silently.
 */
import { randomSeedString } from "../gen/rng.js";
import { exportPng } from "../io/exportPng.js";
import { downloadDocument, readDocumentFile } from "../io/projectFile.js";
import { requestRender } from "../render/renderer.js";
import { MAP_PRESETS, setStatus, state } from "../state/store.js";

const $ = (id) => document.getElementById(id);

function show(dialog) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

export function openGenerator() {
  $("gen-seed").value = state.map.generation?.seed ?? state.map.seed ?? "eldoria";
  const land = state.map.generation?.landAmount ?? 45;
  const roughness = state.map.generation?.roughness ?? 55;
  $("gen-land").value = String(land);
  $("gen-land-value").value = `${land}%`;
  $("gen-roughness").value = String(roughness);
  $("gen-roughness-value").value = `${roughness}%`;
  show($("dialog-generator"));
}

export function openProject() {
  show($("dialog-project"));
}

function updateExportEstimate() {
  const scale = Number($("export-scale").value);
  $("export-estimate").textContent =
    `Output: ${Math.round(state.map.width * scale)} x ${Math.round(state.map.height * scale)} pixels.`;
}

export function openExport() {
  $("export-grid").checked = state.grid.includeInExport;
  updateExportEstimate();
  show($("dialog-export"));
}

export function openSize() {
  const preset = MAP_PRESETS.find((entry) => entry.width === state.map.width && entry.height === state.map.height);
  $("size-preset").value = preset ? preset.id : "custom";
  $("size-width").value = String(state.map.width);
  $("size-height").value = String(state.map.height);
  show($("dialog-size"));
}

/** Ask whether to restore an autosaved document. Resolves to true/false. */
export function askToRestore(savedAt) {
  const dialog = $("dialog-restore");
  $("restore-detail").textContent =
    `An autosaved map from ${new Date(savedAt).toLocaleString()} is stored in this browser.`;
  show(dialog);
  return new Promise((resolve) => {
    const finish = (value) => {
      dialog.close();
      resolve(value);
    };
    $("restore-accept").onclick = () => finish(true);
    $("restore-discard").onclick = () => finish(false);
  });
}

export function initDialogs(actions) {
  const sizeSelect = $("size-preset");
  for (const preset of MAP_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    sizeSelect.append(option);
  }

  $("action-generate").addEventListener("click", openGenerator);
  $("action-project").addEventListener("click", openProject);
  $("action-export").addEventListener("click", openExport);
  $("action-size").addEventListener("click", openSize);

  $("gen-land").addEventListener("input", (event) => {
    $("gen-land-value").value = `${event.target.value}%`;
  });
  $("gen-roughness").addEventListener("input", (event) => {
    $("gen-roughness-value").value = `${event.target.value}%`;
  });
  $("gen-shuffle").addEventListener("click", () => {
    $("gen-seed").value = randomSeedString();
  });
  $("gen-run").addEventListener("click", () => {
    const seed = $("gen-seed").value.trim() || randomSeedString();
    const landAmount = Number($("gen-land").value);
    const roughness = Number($("gen-roughness").value);
    $("dialog-generator").close();
    setStatus("Generating landmass...", "busy");
    // Yield once so the status line paints before the synchronous generator runs.
    requestAnimationFrame(() => {
      try {
        const report = actions.generate({ seed, landAmount, roughness });
        setStatus(`Generated "${seed}": ${Math.round(report.landRatio * 100)}% land, ${report.forests} forests, ${report.mountains} mountain groups.`);
      } catch (error) {
        setStatus(`Generation failed: ${error.message}`, "error");
      }
    });
  });

  $("project-save").addEventListener("click", () => {
    try {
      const bytes = downloadDocument();
      setStatus(`Saved ${(bytes / 1024).toFixed(0)} KB to a .fmap file.`);
      $("dialog-project").close();
    } catch (error) {
      setStatus(`Save failed: ${error.message}`, "error");
    }
  });

  $("project-file").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    event.target.value = "";
    if (!file) return;
    setStatus("Loading map...", "busy");
    try {
      await readDocumentFile(file);
      $("dialog-project").close();
      requestRender();
      setStatus(`Loaded "${state.map.title}".`);
    } catch (error) {
      setStatus(`Load failed: ${error.message}`, "error");
    }
  });

  $("export-scale").addEventListener("change", updateExportEstimate);
  $("export-run").addEventListener("click", async () => {
    const options = {
      scale: Number($("export-scale").value),
      title: $("export-title").checked,
      legend: $("export-legend").checked,
      grid: $("export-grid").checked,
    };
    setStatus("Rendering PNG...", "busy");
    try {
      const result = await exportPng(options);
      $("dialog-export").close();
      setStatus(`Exported ${result.width} x ${result.height} PNG (${(result.bytes / 1024 / 1024).toFixed(1)} MB).`);
    } catch (error) {
      setStatus(`Export failed: ${error.message}`, "error");
    }
  });

  sizeSelect.addEventListener("change", () => {
    const preset = MAP_PRESETS.find((entry) => entry.id === sizeSelect.value);
    if (!preset || preset.id === "custom") return;
    $("size-width").value = String(preset.width);
    $("size-height").value = String(preset.height);
  });

  $("size-apply").addEventListener("click", () => {
    const width = Math.round(Number($("size-width").value));
    const height = Math.round(Number($("size-height").value));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 256 || height < 256) {
      setStatus("Map size must be at least 256 x 256.", "error");
      return;
    }
    $("dialog-size").close();
    actions.applySize(width, height);
  });
}
