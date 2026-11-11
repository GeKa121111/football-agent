import test from "node:test";
import assert from "node:assert/strict";
import {
  STORAGE_KEY,
  SAVE_VERSION,
  createInitialSave,
  isValidSave,
  readSave,
  writeSave,
  WATCHLIST_KEY,
  readWatchlist,
  writeWatchlist
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


test("rejects saves with invalid financial, career, or world values", () => {
  const invalidBalance = createInitialSave();
  invalidBalance.agency.balance = Number.NaN;
  assert.equal(isValidSave(invalidBalance), false);

  const invalidReputation = createInitialSave();
  invalidReputation.agency.reputation = 101;
  assert.equal(isValidSave(invalidReputation), false);

  const invalidCareer = createInitialSave();
  invalidCareer.career.week = 0;
  assert.equal(isValidSave(invalidCareer), false);

  const invalidDate = createInitialSave();
  invalidDate.world.currentDate = "2026-02-30";
  assert.equal(isValidSave(invalidDate), false);
});

test("persists unique watchlist player IDs", () => {
  const storage = memoryStorage();
  assert.deepEqual(readWatchlist(storage), { status: "new", ids: [], error: null });

  const saved = writeWatchlist(["player-1", "player-2", "player-1"], storage);
  assert.deepEqual(saved, ["player-1", "player-2"]);
  assert.deepEqual(readWatchlist(storage).ids, ["player-1", "player-2"]);
  assert.equal(storage.getItem(WATCHLIST_KEY), JSON.stringify(["player-1", "player-2"]));
});

test("does not overwrite a corrupt watchlist", () => {
  const storage = memoryStorage({ [WATCHLIST_KEY]: "{broken json" });
  const result = readWatchlist(storage);
  assert.equal(result.status, "corrupt");
  assert.equal(storage.getItem(WATCHLIST_KEY), "{broken json");
  assert.throws(() => writeWatchlist([42], storage), TypeError);
});


test("migrates version 1 saves without losing career or agency progress", () => {
  const legacy = createInitialSave("2026-07-01T00:00:00.000Z");
  legacy.meta.version = 1;
  legacy.career.day = 42;
  legacy.career.week = 6;
  legacy.agency.name = "Legacy Agency";
  legacy.agency.balance = 765432;
  legacy.agency.clients = ["player-legacy"];
  legacy.world.currentDate = "2026-08-11";
  legacy.world.players = [{ id: "saved-player", career: { goals: 8, appearances: 21 } }];
  legacy.world.clubs = [{ id: "saved-club", reputation: 17 }];
  legacy.world.competitions = [{ id: "saved-competition", season: 4 }];
  legacy.world.activeOffers = [{ id: "saved-offer", playerId: "saved-player" }];
  delete legacy.world.events;
  delete legacy.world.inbox;
  delete legacy.world.tasks;

  const raw = JSON.stringify(legacy);
  const storage = memoryStorage({ [STORAGE_KEY]: raw });
  const result = readSave(storage);

  assert.equal(result.status, "loaded");
  assert.equal(result.migrated, true);
  assert.equal(result.save.meta.version, SAVE_VERSION);
  assert.equal(result.save.career.day, 42);
  assert.equal(result.save.career.week, 6);
  assert.equal(result.save.agency.name, "Legacy Agency");
  assert.equal(result.save.agency.balance, 765432);
  assert.deepEqual(result.save.agency.clients, ["player-legacy"]);
  assert.equal(result.save.world.currentDate, "2026-08-11");
  assert.deepEqual(result.save.world.players, [{ id: "saved-player", career: { goals: 8, appearances: 21 } }]);
  assert.deepEqual(result.save.world.clubs, [{ id: "saved-club", reputation: 17 }]);
  assert.deepEqual(result.save.world.competitions, [{ id: "saved-competition", season: 4 }]);
  assert.deepEqual(result.save.world.activeOffers, [{ id: "saved-offer", playerId: "saved-player" }]);
  assert.deepEqual(result.save.world.events, []);
  assert.deepEqual(result.save.world.inbox, []);
  assert.deepEqual(result.save.world.tasks, []);
  assert.equal(storage.getItem(STORAGE_KEY), raw, "reading must not rewrite the user's save");

  writeSave(result.save, storage);
  const persisted = readSave(storage);
  assert.equal(persisted.status, "loaded");
  assert.equal(persisted.migrated, false);
  assert.equal(persisted.save.career.day, 42);
});

test("rejects duplicate activity IDs and inbox references to missing events", () => {
  const duplicate = createInitialSave();
  duplicate.world.events = [
    { id: "event-1", date: "2026-07-01", type: "briefing", title: "A", description: "A", priority: "normal" },
    { id: "event-1", date: "2026-07-02", type: "briefing", title: "B", description: "B", priority: "normal" }
  ];
  assert.equal(isValidSave(duplicate), false);

  const missingReference = createInitialSave();
  missingReference.world.inbox = [{
    id: "message-1",
    eventId: "missing-event",
    date: "2026-07-01",
    title: "رسالة",
    body: "محتوى",
    read: false
  }];
  assert.equal(isValidSave(missingReference), false);
});
