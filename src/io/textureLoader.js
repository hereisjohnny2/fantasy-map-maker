/**
 * User-supplied assets: brush textures, optional texture packs and fonts.
 *
 * Textures are kept as data URLs so they travel inside the `.fmap` file and
 * the autosave document. Fonts are registered at runtime with the FontFace
 * API rather than bundled, which avoids shipping licensed font binaries.
 */
import { registerCustomTexture } from "../brush/textures.js";
import { newId, setStatus, state } from "../state/store.js";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg"]);

export function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("the image data could not be decoded"));
    image.src = dataUrl;
  });
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("the file could not be read"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

/** Validate, decode and register a PNG/JPEG file as a brush texture. */
export async function addTextureFromFile(file) {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error(`${file.name} is not a PNG or JPEG image`);
  }
  const dataUrl = await readFileAsDataUrl(file);
  const image = await dataUrlToImage(dataUrl);
  const id = newId("texture");
  registerCustomTexture(id, image);
  state.customTextures.push({ id, name: file.name, dataUrl });
  return { id, name: file.name };
}

/** Re-register textures carried inside a loaded document. */
export async function restoreCustomTextures(textures = []) {
  const restored = [];
  for (const texture of textures) {
    try {
      const image = await dataUrlToImage(texture.dataUrl);
      registerCustomTexture(texture.id, image);
      restored.push(texture);
    } catch {
      setStatus(`Custom texture "${texture.name}" could not be restored and was dropped.`, "error");
    }
  }
  return restored;
}

/**
 * Optional texture packs. `textures/textures.json` lists
 * `{ "textures": [{ "name": "...", "file": "..." }] }` relative to that folder.
 */
export async function loadTexturePackManifest() {
  let manifest;
  try {
    const response = await fetch("./textures/textures.json", { cache: "no-cache" });
    if (!response.ok) return [];
    manifest = await response.json();
  } catch {
    return [];
  }

  const entries = Array.isArray(manifest?.textures) ? manifest.textures : [];
  const loaded = [];
  for (const entry of entries) {
    if (!entry?.file) continue;
    try {
      const response = await fetch(`./textures/${entry.file}`, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const dataUrl = await readFileAsDataUrl(blob);
      const image = await dataUrlToImage(dataUrl);
      const id = newId("texture");
      registerCustomTexture(id, image);
      state.customTextures.push({ id, name: entry.name ?? entry.file, dataUrl });
      loaded.push(entry.name ?? entry.file);
    } catch (error) {
      setStatus(`Texture pack entry "${entry.file}" failed to load: ${error.message}`, "error");
    }
  }
  return loaded;
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
