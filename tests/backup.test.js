import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave, writeSave, STORAGE_KEY } from "../src/core/storage.js";
import {
  exportSaveText, importSaveText, saveToSlot, loadFromSlot, parseBackupText,
  describeSlot, slotKey
} from "../src/core/backup.js";

function mem() {
  const m = new Map();
  return {
    getItem: (key) => m.get(key) ?? null,
    setItem: (key, value) => m.set(key, String(value)),
    removeItem: (key) => m.delete(key)
  };
}

test("export then import round-trips a valid save", () => {
  const source = mem();
  writeSave(createInitialSave(), source);
  const text = exportSaveText(source);

  const target = mem();
  importSaveText(text, target);
  assert.equal(
    JSON.parse(target.getItem(STORAGE_KEY)).meta.version,
    JSON.parse(source.getItem(STORAGE_KEY)).meta.version
  );
});

test("rejects malformed and invalid backup data", () => {
  assert.throws(() => parseBackupText("nope"));
  assert.throws(() => parseBackupText('{"a":1}'));
});

test("slots save, describe, and load valid saves", () => {
  const storage = mem();
  writeSave(createInitialSave(), storage);
  saveToSlot(2, storage);
  assert.ok(describeSlot(2, storage));
  storage.removeItem(STORAGE_KEY);
  loadFromSlot(2, storage);
  assert.ok(storage.getItem(STORAGE_KEY));
  assert.throws(() => loadFromSlot(3, storage));
});

test("rejects invalid slot numbers", () => {
  assert.throws(() => slotKey(0));
  assert.throws(() => slotKey(4));
  assert.throws(() => saveToSlot(1.5, mem()));
});
