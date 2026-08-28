/**
 * User-supplied assets: fonts.
 *
 * Fonts are registered at runtime with the FontFace API rather than bundled,
 * which avoids shipping licensed font binaries, and travel inside the
 * `.fmap` file and the autosave document as data URLs.
 */
import { setStatus, state } from "../state/store.js";

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("the file could not be read"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function familyFromFileName(name) {
  return name.replace(/\.[^.]+$/, "").replace(/[^\w\s-]/g, "").trim() || "Custom Font";
}

/** Register a user font file so labels can use it immediately. */
export async function addFontFromFile(file) {
  if (typeof FontFace === "undefined" || !document.fonts) {
    throw new Error("this browser cannot register fonts at runtime");
  }
  const dataUrl = await readFileAsDataUrl(file);
  const family = familyFromFileName(file.name);
  const face = new FontFace(family, `url(${dataUrl})`);
  await face.load();
  document.fonts.add(face);
  if (!state.customFonts.some((font) => font.family === family)) {
    state.customFonts.push({ family, dataUrl });
  }
  return family;
}

/** Re-register fonts carried inside a loaded document. */
export async function restoreCustomFonts(fonts = []) {
  if (typeof FontFace === "undefined" || !document.fonts) return [];
  const restored = [];
  for (const font of fonts) {
    try {
      const face = new FontFace(font.family, `url(${font.dataUrl})`);
      await face.load();
      document.fonts.add(face);
      restored.push(font);
    } catch {
      setStatus(`Custom font "${font.family}" could not be restored.`, "error");
    }
  }
  return restored;
}
