import { createInitialCalendarRecords, DAYS_PER_SEASON, DAYS_PER_WEEK } from "../engines/calendar-engine.js";

export const STORAGE_KEY = "football-agent.save";
export const SAVE_VERSION = 2;
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
      season: 1,
      totalDays: 1
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
      activeOffers: [],
      ...createInitialCalendarRecords("2026-07-01")
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
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidAgency(value) {
  if (!isRecord(value)) return false;
  const { id, name, balance, reputation, clients } = value;
  return typeof id === "string" && Boolean(id.trim())
    && typeof name === "string" && Boolean(name.trim())
    && typeof balance === "number" && Number.isFinite(balance) && balance >= 0
    && Number.isInteger(reputation) && reputation >= 0 && reputation <= 100
    && Array.isArray(clients);
}
function isValidWorldBase(value) {
  if (!isRecord(value) || !isValidCalendarDate(value.currentDate)) return false;
  return ["players", "clubs", "competitions", "activeOffers"].every((key) => Array.isArray(value[key]));
}
function isValidLegacySave(value) {
  if (!isRecord(value) || !isRecord(value.meta) || !isRecord(value.career)) return false;
  if (!isRecord(value.agency) || !isValidWorldBase(value.world) || value.meta.version !== 1) return false;
  if (!isValidTimestamp(value.meta.createdAt) || !isValidTimestamp(value.meta.updatedAt)) return false;
  const { day, week, season } = value.career;
  return [day, week, season].every((item) => Number.isInteger(item) && item >= 1) && isValidAgency(value.agency);
}
function isValidEvent(item) {
  return isRecord(item) && typeof item.id === "string" && Boolean(item.id.trim())
    && typeof item.type === "string" && typeof item.title === "string"
    && typeof item.description === "string" && isValidCalendarDate(item.date);
}
function isValidInboxMessage(item) {
  return isRecord(item) && typeof item.id === "string" && Boolean(item.id.trim())
    && typeof item.type === "string" && typeof item.title === "string"
    && typeof item.body === "string" && isValidCalendarDate(item.date) && typeof item.read === "boolean";
}
function isValidTask(item) {
  return isRecord(item) && typeof item.id === "string" && Boolean(item.id.trim())
    && typeof item.title === "string" && typeof item.description === "string"
    && isValidCalendarDate(item.createdAt) && isValidCalendarDate(item.dueDate)
    && ["active", "overdue", "completed"].includes(item.status)
    && (item.completedAt === null || isValidCalendarDate(item.completedAt));
}

export function isValidSave(value) {
  if (!isRecord(value) || !isRecord(value.meta) || !isRecord(value.career)) return false;
  if (!isRecord(value.agency) || !isValidWorldBase(value.world) || value.meta.version !== SAVE_VERSION) return false;
  if (!isValidTimestamp(value.meta.createdAt) || !isValidTimestamp(value.meta.updatedAt) || !isValidAgency(value.agency)) return false;
  const { day, week, season, totalDays } = value.career;
  if (![day, week, season, totalDays].every((item) => Number.isInteger(item) && item >= 1)) return false;
  if (totalDays !== (season - 1) * DAYS_PER_SEASON + day) return false;
  if (day > DAYS_PER_SEASON || week !== Math.floor((day - 1) / DAYS_PER_WEEK) + 1) return false;
  return ["events", "inbox", "tasks"].every((key) => Array.isArray(value.world[key]))
    && value.world.events.every(isValidEvent)
    && value.world.inbox.every(isValidInboxMessage)
    && value.world.tasks.every(isValidTask);
}
function migrateLegacySave(value) {
  const totalDays = Math.max(1, Math.floor(value.career.day));
  const day = ((totalDays - 1) % DAYS_PER_SEASON) + 1;
  const season = Math.floor((totalDays - 1) / DAYS_PER_SEASON) + 1;
  return {
    ...value,
    meta: { ...value.meta, version: SAVE_VERSION },
    career: { ...value.career, day, week: Math.floor((day - 1) / DAYS_PER_WEEK) + 1, season, totalDays },
    world: { ...value.world, ...createInitialCalendarRecords(value.world.currentDate) }
  };
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
    if (parsed?.meta?.version === 1) {
      if (!isValidLegacySave(parsed)) return { status: "corrupt", save: null, error: null };
      const migrated = migrateLegacySave(parsed);
      if (!isValidSave(migrated)) return { status: "corrupt", save: null, error: null };
      return { status: "loaded", save: migrated, error: null, migrated: true };
    }
    if (!isValidSave(parsed)) return { status: "corrupt", save: null, error: null };
    return { status: "loaded", save: parsed, error: null, migrated: false };
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
