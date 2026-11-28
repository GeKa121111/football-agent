import { STORAGE_KEY, SAVE_VERSION, isValidSave } from "./storage.js";

export const SLOT_COUNT = 3;
const FORMAT = "football-agent-backup";

function target(storage) {
  const t = storage ?? globalThis.localStorage;
  if (!t || typeof t.getItem !== "function") throw new Error("التخزين المحلي غير متاح.");
  return t;
}

function slotKey(n) {
  if (!Number.isInteger(n) || n < 1 || n > SLOT_COUNT) {
    throw new Error("رقم خانة الحفظ غير صالح.");
  }
  return `${STORAGE_KEY}.slot.${n}`;
}

export function exportSaveText(storage) {
  const raw = target(storage).getItem(STORAGE_KEY);
  if (raw === null) throw new Error("لا يوجد حفظ لتصديره.");
  const save = parseBackupText(raw);
  return JSON.stringify({
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    save
  }, null, 2);
}

export function parseBackupText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("الملف ليس بصيغة صحيحة.");
  }

  const save = data?.format === FORMAT ? data.save : data;
  if (save?.meta?.version > SAVE_VERSION) {
    throw new Error("الملف من نسخة أحدث من اللعبة.");
  }
  if (!isValidSave(save)) {
    throw new Error("الملف لا يطابق بنية حفظ اللعبة.");
  }
  return save;
}

export function importSaveText(text, storage) {
  const save = parseBackupText(text);
  target(storage).setItem(STORAGE_KEY, JSON.stringify(save));
  return save;
}

export function saveToSlot(n, storage) {
  const t = target(storage);
  const raw = t.getItem(STORAGE_KEY);
  if (raw === null) throw new Error("لا يوجد حفظ حالي.");
  const save = parseBackupText(raw);
  t.setItem(slotKey(n), JSON.stringify(save));
}

export function loadFromSlot(n, storage) {
  const t = target(storage);
  const raw = t.getItem(slotKey(n));
  if (raw === null) throw new Error("الخانة فارغة.");
  const save = parseBackupText(raw);
  t.setItem(STORAGE_KEY, JSON.stringify(save));
  return save;
}

export function describeSlot(n, storage) {
  const raw = target(storage).getItem(slotKey(n));
  if (raw === null) return null;
  try {
    const save = parseBackupText(raw);
    return {
      updatedAt: save?.meta?.updatedAt ?? null,
      season: save?.career?.season ?? null
    };
  } catch {
    return { updatedAt: null, season: null, invalid: true };
  }
}
