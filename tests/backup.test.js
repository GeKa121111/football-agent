import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave, writeSave, STORAGE_KEY } from "../src/core/storage.js";
import {
  exportSaveText, importSaveText, saveToSlot, loadFromSlot, parseBackupText,
  describeSlot, exportRawSaveText, restorePreImportSave, hasPreImportSave,
  PRE_IMPORT_KEY
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
  const storage = mem();
  writeSave(createInitialSave(), storage);
  assert.throws(() => saveToSlot(0, storage));
  assert.throws(() => saveToSlot(4, storage));
  assert.throws(() => saveToSlot(1.5, storage));
  assert.throws(() => loadFromSlot(0, storage));
});

function makeLegacyV8Save() {
  const save = createInitialSave();
  save.meta.version = 8;
  delete save.agency.management;
  delete save.world.playerIncome;
  return save;
}

test("imports a legacy v8 save and migrates it to v9", () => {
  const storage = mem();
  const legacy = makeLegacyV8Save();
  importSaveText(JSON.stringify(legacy), storage);
  const stored = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(stored.meta.version, 9);
  assert.ok(stored.agency.management);
  assert.ok(stored.world.playerIncome);
});

test("parseBackupText migrates a v8 backup to a valid v9 save", () => {
  const migrated = parseBackupText(JSON.stringify(makeLegacyV8Save()));
  assert.equal(migrated.meta.version, 9);
  assert.ok(migrated.agency.management);
});

test("import keeps a pre-import safety copy that can be restored", () => {
  const storage = mem();
  const first = createInitialSave();
  writeSave(first, storage);
  const firstRaw = storage.getItem(STORAGE_KEY);

  const second = createInitialSave();
  second.agency.name = "وكالة ثانية";
  writeSave(second, storage);
  const secondText = exportSaveText(storage);

  // استعد الحفظ الأول، ثم استورد الثاني — نسخة الأمان يجب أن تحتوي الأول.
  const target = mem();
  target.setItem(STORAGE_KEY, firstRaw);
  assert.equal(hasPreImportSave(target), false);
  importSaveText(secondText, target);
  assert.equal(hasPreImportSave(target), true);
  assert.equal(target.getItem(PRE_IMPORT_KEY), firstRaw);
  assert.equal(JSON.parse(target.getItem(STORAGE_KEY)).agency.name, "وكالة ثانية");
  restorePreImportSave(target);
  assert.equal(JSON.parse(target.getItem(STORAGE_KEY)).agency.name, first.agency.name);
});

test("raw export returns a corrupt save as-is while normal export fails", () => {
  const storage = mem();
  storage.setItem(STORAGE_KEY, "{corrupt");
  assert.throws(() => exportSaveText(storage));
  assert.equal(exportRawSaveText(storage), "{corrupt");
});
