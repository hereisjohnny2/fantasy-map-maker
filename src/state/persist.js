/**
 * Autosave storage.
 *
 * Layer rasters are PNG data URLs, which blow past the ~5 MB localStorage
 * quota almost immediately, so the autosave document lives in IndexedDB.
 * localStorage is used only for small UI preferences.
 */
const DB_NAME = "fantasy-map-maker";
const DB_VERSION = 1;
const STORE = "documents";
const AUTOSAVE_KEY = "autosave";
const PREFS_KEY = "fmm.prefs";

let unavailableReason = null;

/** A human-readable reason autosave is off, or null when it works. */
export function autosaveUnavailableReason() {
  return unavailableReason;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("this browser has no IndexedDB"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB was blocked"));
    request.onblocked = () => reject(new Error("IndexedDB is blocked by another tab"));
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore(mode, run) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      transaction.onabort = () => reject(transaction.error ?? new Error("transaction aborted"));
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } finally {
    db.close();
  }
}

/** Persist the autosave document. Resolves to false if storage is unusable. */
export async function writeAutosave(document) {
  try {
    await withStore("readwrite", (store) => store.put({ savedAt: Date.now(), document }, AUTOSAVE_KEY));
    unavailableReason = null;
    return true;
  } catch (error) {
    unavailableReason = error.message;
    return false;
  }
}

/** Read the autosave record `{ savedAt, document }`, or null. */
export async function readAutosave() {
  try {
    const record = await withStore("readonly", (store) => store.get(AUTOSAVE_KEY));
    unavailableReason = null;
    return record ?? null;
  } catch (error) {
    unavailableReason = error.message;
    return null;
  }
}

export async function clearAutosave() {
  try {
    await withStore("readwrite", (store) => store.delete(AUTOSAVE_KEY));
    return true;
  } catch (error) {
    unavailableReason = error.message;
    return false;
  }
}

/** Debounce a save so a burst of edits writes once. */
export function createDebouncedSaver(getDocument, { delay = 900, onError } = {}) {
  let timer = null;
  let running = false;
  let queued = false;

  async function run() {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      const ok = await writeAutosave(getDocument());
      if (!ok && onError) onError(unavailableReason);
    } catch (error) {
      if (onError) onError(error.message);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        run();
      }
    }
  }

  return {
    schedule() {
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    },
    flush() {
      clearTimeout(timer);
      return run();
    },
  };
}

/** Small UI preferences only - never raster data. */
export function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function writePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}
