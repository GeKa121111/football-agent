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
      activeOffers: [],
      events: [],
      inbox: [],
      tasks: []
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


function hasUniqueIds(items) {
  const ids = items.map((item) => isRecord(item) ? item.id : null);
  return ids.every((id) => typeof id === "string" && id.trim()) && new Set(ids).size === ids.length;
}

function isValidActivityCollections(world) {
  const { events, inbox, tasks } = world;
  if (![events, inbox, tasks].every(Array.isArray)) return false;
  if (!hasUniqueIds(events) || !hasUniqueIds(inbox) || !hasUniqueIds(tasks)) return false;

  if (!events.every((event) =>
    isRecord(event) &&
    isValidCalendarDate(event.date) &&
    typeof event.type === "string" && event.type.trim() &&
    typeof event.title === "string" && event.title.trim() &&
    typeof event.description === "string" &&
    ["low", "normal", "high"].includes(event.priority)
  )) return false;

  const eventIds = new Set(events.map((event) => event.id));
  if (!inbox.every((message) =>
    isRecord(message) &&
    typeof message.eventId === "string" && eventIds.has(message.eventId) &&
    isValidCalendarDate(message.date) &&
    typeof message.title === "string" && message.title.trim() &&
    typeof message.body === "string" &&
    typeof message.read === "boolean"
  )) return false;

  return tasks.every((task) =>
    isRecord(task) &&
    typeof task.title === "string" && task.title.trim() &&
    typeof task.description === "string" &&
    isValidCalendarDate(task.createdDate) &&
    isValidCalendarDate(task.dueDate) &&
    typeof task.category === "string" && task.category.trim() &&
    ["open", "completed"].includes(task.status) &&
    (task.status !== "completed" || isValidCalendarDate(task.completedDate))
  );
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
  return isValidActivityCollections(value.world);
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


function migrateSave(value) {
  if (!isRecord(value) || !isRecord(value.meta) || !isRecord(value.world)) return value;
  if (value.meta.version !== 1) return value;

  return {
    ...value,
    meta: {
      ...value.meta,
      version: SAVE_VERSION
    },
    world: {
      ...value.world,
      events: Array.isArray(value.world.events) ? value.world.events : [],
      inbox: Array.isArray(value.world.inbox) ? value.world.inbox : [],
      tasks: Array.isArray(value.world.tasks) ? value.world.tasks : []
    }
  };
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

    const migrated = parsed?.meta?.version === 1;
    if (migrated) parsed = migrateSave(parsed);

    if (!isValidSave(parsed)) {
      return { status: "corrupt", save: null, error: null };
    }

    return { status: "loaded", save: parsed, migrated, error: null };
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
