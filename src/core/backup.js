import { STORAGE_KEY, SAVE_VERSION, isValidSave, migrateSave } from "./storage.js";

export const SLOT_COUNT = 3;
const FORMAT = "football-agent-backup";

// نسخة أمان من الحفظ الحالي تُحفظ هنا قبل أي استيراد أو تحميل من خانة
// يستبدل الحفظ الحالي، حتى يمكن التراجع عن الاستبدال.
export const PRE_IMPORT_KEY = `${STORAGE_KEY}.pre-import`;

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

function backupCurrentSave(t) {
  const current = t.getItem(STORAGE_KEY);
  if (current !== null) t.setItem(PRE_IMPORT_KEY, current);
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

// تصدير خام يتجاوز التحقق — للتشخيص عندما يكون الحفظ الحالي تالفًا
// ولا يمكن تصديره بالطريقة العادية.
export function exportRawSaveText(storage) {
  const raw = target(storage).getItem(STORAGE_KEY);
  if (raw === null) throw new Error("لا يوجد حفظ لتصديره.");
  return raw;
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
  // ترحيل v1–v8 لنفس الشكل الذي يقبله readSave()؛ migrateSave تعيد القيمة
  // كما هي لو كان الإصدار خارج 1..8، فالاستدعاء آمن على v9.
  const migrated = migrateSave(save);
  if (!isValidSave(migrated)) {
    throw new Error("الملف لا يطابق بنية حفظ اللعبة.");
  }
  return migrated;
}

export function importSaveText(text, storage) {
  const save = parseBackupText(text);
  const t = target(storage);
  backupCurrentSave(t);
  t.setItem(STORAGE_KEY, JSON.stringify(save));
  return save;
}

export function restorePreImportSave(storage) {
  const t = target(storage);
  const raw = t.getItem(PRE_IMPORT_KEY);
  if (raw === null) throw new Error("لا توجد نسخة أمان سابقة للاستيراد.");
  const save = parseBackupText(raw);
  t.setItem(STORAGE_KEY, JSON.stringify(save));
  return save;
}

export function hasPreImportSave(storage) {
  try {
    return target(storage).getItem(PRE_IMPORT_KEY) !== null;
  } catch {
    return false;
  }
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
  backupCurrentSave(t);
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
