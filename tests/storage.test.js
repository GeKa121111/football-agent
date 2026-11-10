import test from "node:test";
import assert from "node:assert/strict";
import {
  STORAGE_KEY,
  SAVE_VERSION,
  createInitialSave,
  isValidSave,
  readSave,
  writeSave
} from "../src/core/storage.js";

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

test("creates a new save when storage is empty", () => {
  const result = readSave(memoryStorage());
  assert.equal(result.status, "new");
  assert.equal(result.save.meta.version, SAVE_VERSION);
  assert.equal(result.save.agency.clients.length, 0);
});

test("writes and reads a save without losing the agency data", () => {
  const storage = memoryStorage();
  const save = createInitialSave("2026-11-10T18:00:00.000Z");
  save.agency.name = "GeKa Agency";

  const written = writeSave(save, storage, "2026-11-10T18:05:00.000Z");
  const loaded = readSave(storage);

  assert.equal(written.meta.updatedAt, "2026-11-10T18:05:00.000Z");
  assert.equal(loaded.status, "loaded");
  assert.equal(loaded.save.agency.name, "GeKa Agency");
});

test("does not accept an invalid save structure", () => {
  assert.equal(isValidSave({ meta: { version: SAVE_VERSION } }), false);
  assert.throws(() => writeSave({ bad: true }, memoryStorage()), TypeError);
});

test("preserves corrupt data instead of overwriting it", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: "{broken json" });
  const result = readSave(storage);
  assert.equal(result.status, "corrupt");
  assert.equal(storage.getItem(STORAGE_KEY), "{broken json");
});

test("detects saves created by a newer game version", () => {
  const futureSave = createInitialSave();
  futureSave.meta.version = SAVE_VERSION + 1;
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(futureSave) });

  assert.equal(readSave(storage).status, "unsupported");
});
