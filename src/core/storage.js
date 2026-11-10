export const STORAGE_KEY = "football-agent.save";
export const SAVE_VERSION = 1;

export function createInitialSave(now = new Date().toISOString()) {
  return {
    meta: {
      version: SAVE_VERSION,
      createdAt: now,
      updatedAt: now
    },
    career: {
      day: 1,
      week: 1,
      season: 1
    },
    agency: {
      id: "agency-player",
      name: "وكالتك الجديدة",
      balance: 100000,
      reputation: 1,
      clients: []
    },
    world: {
      currentDate: "2026-07-01",
      players: [],
      clubs: [],
      competitions: [],
      activeOffers: []
    }
  };
}

export function isValidSave(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!value.meta || typeof value.meta !== "object") return false;
  if (value.meta.version !== SAVE_VERSION) return false;
  if (!value.career || !value.agency || !value.world) return false;
  if (!Array.isArray(value.agency.clients)) return false;
  if (!Array.isArray(value.world.players)) return false;
  if (!Array.isArray(value.world.clubs)) return false;
  return true;
}

function resolveStorage(storage) {
  const target = storage ?? globalThis.localStorage;
  if (!target || typeof target.getItem !== "function" || typeof target.setItem !== "function") {
    throw new Error("التخزين المحلي غير متاح في البيئة الحالية.");
  }
  return target;
}

/**
 * Reads a save without silently replacing corrupt or newer save data.
 * status: "new" | "loaded" | "corrupt" | "unsupported" | "unavailable"
 */
export function readSave(storage) {
  let target;

  try {
    target = resolveStorage(storage);
    const raw = target.getItem(STORAGE_KEY);

    if (raw === null) {
      return { status: "new", save: createInitialSave(), error: null };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { status: "corrupt", save: null, error };
    }

    if (parsed?.meta?.version > SAVE_VERSION) {
      return { status: "unsupported", save: null, error: null };
    }

    if (!isValidSave(parsed)) {
      return { status: "corrupt", save: null, error: null };
    }

    return { status: "loaded", save: parsed, error: null };
  } catch (error) {
    return { status: "unavailable", save: null, error };
  }
}

export function writeSave(save, storage, now = new Date().toISOString()) {
  if (!isValidSave(save)) {
    throw new TypeError("بيانات الحفظ غير مطابقة لبنية اللعبة الحالية.");
  }

  const target = resolveStorage(storage);
  const snapshot = {
    ...save,
    meta: {
      ...save.meta,
      version: SAVE_VERSION,
      updatedAt: now
    }
  };

  target.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export function deleteSave(storage) {
  const target = resolveStorage(storage);
  if (typeof target.removeItem !== "function") {
    throw new Error("عملية حذف الحفظ غير مدعومة.");
  }
  target.removeItem(STORAGE_KEY);
}
