export const STORAGE_KEY = "football-agent.save";
export const SAVE_VERSION = 1;
export const WATCHLIST_KEY = "football-agent.watchlist";

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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isValidCalendarDate(value) {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidSave(value) {
  if (!isRecord(value) || !isRecord(value.meta) || !isRecord(value.career)) return false;
  if (!isRecord(value.agency) || !isRecord(value.world)) return false;
  if (value.meta.version !== SAVE_VERSION) return false;
  if (!isValidTimestamp(value.meta.createdAt) || !isValidTimestamp(value.meta.updatedAt)) return false;

  const { day, week, season } = value.career;
  if (![day, week, season].every((item) => Number.isInteger(item) && item >= 1)) return false;

  const { id, name, balance, reputation, clients } = value.agency;
  if (typeof id !== "string" || !id.trim()) return false;
  if (typeof name !== "string" || !name.trim()) return false;
  if (typeof balance !== "number" || !Number.isFinite(balance) || balance < 0) return false;
  if (!Number.isInteger(reputation) || reputation < 0 || reputation > 100) return false;
  if (!Array.isArray(clients)) return false;

  const { currentDate, players, clubs, competitions, activeOffers } = value.world;
  if (!isValidCalendarDate(currentDate)) return false;
  if (![players, clubs, competitions, activeOffers].every(Array.isArray)) return false;
  return true;
}

export function readWatchlist(storage) {
  try {
    const target = resolveStorage(storage);
    const raw = target.getItem(WATCHLIST_KEY);
    if (raw === null) return { status: "new", ids: [], error: null };

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { status: "corrupt", ids: [], error };
    }

    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string" && id.trim())) {
      return { status: "corrupt", ids: [], error: null };
    }
    return { status: "loaded", ids: [...new Set(parsed)], error: null };
  } catch (error) {
    return { status: "unavailable", ids: [], error };
  }
}

export function writeWatchlist(ids, storage) {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && id.trim())) {
    throw new TypeError("قائمة المتابعة تحتوي على معرفات غير صالحة.");
  }
  const normalized = [...new Set(ids)];
  const target = resolveStorage(storage);
  target.setItem(WATCHLIST_KEY, JSON.stringify(normalized));
  return normalized;
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
