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
  assert.ok(result.save.world.events.some((event) => event.type === "season-opening"));
  assert.equal(result.save.world.inbox.length, 2);
  assert.equal(result.save.world.tasks[0].category, "season-planning");
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

test("validates career counter consistency and stable IDs in persisted collections", () => {
  const inconsistentWeek = createInitialSave();
  inconsistentWeek.career.day = 8;
  inconsistentWeek.career.week = 1;
  assert.equal(isValidSave(inconsistentWeek), false);

  const inconsistentDay = createInitialSave();
  inconsistentDay.career.day = 2;
  inconsistentDay.career.week = 2;
  assert.equal(isValidSave(inconsistentDay), false);

  const duplicateClients = createInitialSave();
  duplicateClients.agency.clients = ["player-1", "player-1"];
  assert.equal(isValidSave(duplicateClients), false);

  const invalidClientId = createInitialSave();
  invalidClientId.agency.clients = ["player-1", " "];
  assert.equal(isValidSave(invalidClientId), false);

  for (const collection of ["players", "clubs", "competitions", "activeOffers"]) {
    const duplicateEntity = createInitialSave();
    duplicateEntity.world[collection] = [{ id: "entity-1" }, { id: "entity-1" }];
    assert.equal(isValidSave(duplicateEntity), false, collection + " must reject duplicate IDs");

    const missingEntityId = createInitialSave();
    missingEntityId.world[collection] = [{ name: "missing stable ID" }];
    assert.equal(isValidSave(missingEntityId), false, collection + " must require stable IDs");
  }

  const valid = createInitialSave();
  valid.career.day = 8;
  valid.career.week = 2;
  valid.agency.clients = ["player-1", "player-2"];
  valid.world.players = [{ id: "player-1" }];
  valid.world.clubs = [{ id: "club-1" }];
  valid.world.competitions = [{ id: "competition-1" }];
  valid.world.activeOffers = [{ id: "offer-1" }];
  assert.equal(isValidSave(valid), true);
});

test("does not overwrite saves rejected by career or entity invariants", () => {
  const invalidSaves = [];

  const badCounters = createInitialSave();
  badCounters.career.day = 15;
  badCounters.career.week = 2;
  invalidSaves.push(badCounters);

  const duplicatePlayers = createInitialSave();
  duplicatePlayers.world.players = [{ id: "player-1" }, { id: "player-1" }];
  invalidSaves.push(duplicatePlayers);

  const duplicateClients = createInitialSave();
  duplicateClients.agency.clients = ["player-1", "player-1"];
  invalidSaves.push(duplicateClients);

  for (const invalid of invalidSaves) {
    const raw = JSON.stringify(invalid);
    const storage = memoryStorage({ [STORAGE_KEY]: raw });
    assert.equal(readSave(storage).status, "corrupt");
    assert.equal(storage.getItem(STORAGE_KEY), raw);
    assert.throws(() => writeSave(invalid, storage), TypeError);
    assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
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
  delete legacy.world.scouting;

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
  assert.deepEqual(result.save.world.scouting, { nextMissionSequence: 1, activeMissions: [], reports: [] });
  assert.equal(storage.getItem(STORAGE_KEY), raw, "reading must not rewrite the user's save");

  writeSave(result.save, storage);
  const persisted = readSave(storage);
  assert.equal(persisted.status, "loaded");
  assert.equal(persisted.migrated, false);
  assert.equal(persisted.save.career.day, 42);
});


test("migrates version 2 saves to schema v4 without rewriting on read", () => {
  const legacy = createInitialSave("2026-07-01T00:00:00.000Z");
  legacy.meta.version = 2;
  delete legacy.world.scouting;
  legacy.agency.balance = 456789;
  const raw = JSON.stringify(legacy);
  const storage = memoryStorage({ [STORAGE_KEY]: raw });

  const result = readSave(storage);
  assert.equal(result.status, "loaded");
  assert.equal(result.migrated, true);
  assert.equal(result.save.meta.version, SAVE_VERSION);
  assert.equal(result.save.agency.balance, 456789);
  assert.deepEqual(result.save.world.scouting, {
    nextMissionSequence: 1,
    activeMissions: [],
    reports: []
  });
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test("migrates version 3 saves to representation schema v4 without rewriting on read", () => {
  const legacy = createInitialSave("2026-07-01T00:00:00.000Z");
  legacy.meta.version = 3;
  legacy.agency.balance = 456789;
  legacy.agency.clients = ["legacy-client"];
  delete legacy.agency.representation;
  const raw = JSON.stringify(legacy);
  const storage = memoryStorage({ [STORAGE_KEY]: raw });

  const result = readSave(storage);
  assert.equal(result.status, "loaded");
  assert.equal(result.migrated, true);
  assert.equal(result.save.meta.version, SAVE_VERSION);
  assert.equal(result.save.agency.balance, 456789);
  assert.deepEqual(result.save.agency.clients, ["legacy-client"]);
  assert.deepEqual(result.save.agency.representation, {
    nextOfferSequence: 1,
    nextContractSequence: 1,
    nextHistorySequence: 1,
    nextInteractionSequence: 1,
    reputationScore: 50,
    offers: [],
    contracts: [],
    interactions: [],
    history: []
  });
  assert.equal(isValidSave(result.save), true);
  assert.equal(storage.getItem(STORAGE_KEY), raw, "reading must not rewrite the user's schema-v3 save");
});

test("validates active scouting mission dates, costs and accuracy", () => {
  const save = createInitialSave();
  save.world.scouting = {
    nextMissionSequence: 2,
    activeMissions: [{
      id: "scout-mission-1",
      reportId: "scout-report-1",
      type: "local",
      name: "بعثة محلية",
      countryId: "country-eg",
      role: "all",
      startDate: "2026-07-01",
      dueDate: "2026-07-08",
      durationDays: 7,
      cost: 5000,
      accuracy: 0.62,
      targetCount: 2
    }],
    reports: []
  };
  assert.equal(isValidSave(save), true);

  const invalidDueDate = structuredClone(save);
  invalidDueDate.world.scouting.activeMissions[0].dueDate = "2026-07-09";
  assert.equal(isValidSave(invalidDueDate), false);

  const invalidAccuracy = structuredClone(save);
  invalidAccuracy.world.scouting.activeMissions[0].accuracy = 1.5;
  assert.equal(isValidSave(invalidAccuracy), false);

  const invalidCost = structuredClone(save);
  invalidCost.world.scouting.activeMissions[0].cost = -1;
  assert.equal(isValidSave(invalidCost), false);
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


test("validates task lifecycle dates against the saved career date", () => {
  const validOpen = createInitialSave();
  validOpen.world.tasks = [{
    id: "task-open-valid",
    title: "مهمة مفتوحة",
    description: "موعدها لم يمر.",
    createdDate: "2026-07-01",
    dueDate: "2026-07-03",
    category: "timeline-test",
    status: "open"
  }];
  assert.equal(isValidSave(validOpen), true);

  const overdue = createInitialSave();
  overdue.world.tasks = [{
    id: "task-overdue-valid",
    title: "مهمة متأخرة",
    description: "تجاوزت موعدها.",
    createdDate: "2026-06-28",
    dueDate: "2026-06-30",
    overdueDate: "2026-07-01",
    category: "timeline-test",
    status: "overdue"
  }];
  assert.equal(isValidSave(overdue), true);

  const completedLate = createInitialSave();
  completedLate.world.currentDate = "2026-07-02";
  completedLate.world.tasks = [{
    id: "task-completed-late-valid",
    title: "مهمة مكتملة متأخرًا",
    description: "اكتملت بعد الموعد.",
    createdDate: "2026-06-28",
    dueDate: "2026-06-30",
    overdueDate: "2026-07-01",
    completedDate: "2026-07-02",
    completedLate: true,
    category: "timeline-test",
    status: "completed"
  }];
  assert.equal(isValidSave(completedLate), true);

  const invalidCases = [
    (task) => { task.dueDate = "2026-06-30"; },
    (task) => { task.createdDate = "2026-07-02"; },
    (task) => { task.status = "overdue"; task.overdueDate = "2026-07-01"; },
    (task) => { task.status = "completed"; task.completedDate = "2026-07-02"; task.completedLate = true; },
    (task) => { task.status = "completed"; task.completedDate = "2026-07-04"; task.completedLate = false; },
    (task) => { task.status = "completed"; task.completedDate = "2026-07-02"; task.completedLate = true; task.overdueDate = "2026-07-03"; }
  ];

  for (const mutate of invalidCases) {
    const save = createInitialSave();
    const task = {
      id: "task-timeline-invalid",
      title: "مهمة اختبار",
      description: "اختبار اتساق التواريخ.",
      createdDate: "2026-07-01",
      dueDate: "2026-07-03",
      category: "timeline-test",
      status: "open"
    };
    mutate(task);
    save.world.tasks = [task];
    assert.equal(isValidSave(save), false);
  }
});

test("requires inbox messages to use the linked event date", () => {
  const save = createInitialSave();
  save.world.inbox[0].date = "2026-07-02";
  assert.equal(isValidSave(save), false);
});

test("preserves a save with impossible task chronology instead of rewriting it", () => {
  const invalid = createInitialSave();
  invalid.world.tasks = [{
    id: "task-impossible",
    title: "مهمة غير متسقة",
    description: "موعد التسليم قبل الإنشاء.",
    createdDate: "2026-07-02",
    dueDate: "2026-07-01",
    category: "timeline-test",
    status: "open"
  }];
  const raw = JSON.stringify(invalid);
  const storage = memoryStorage({ [STORAGE_KEY]: raw });

  assert.equal(readSave(storage).status, "corrupt");
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.throws(() => writeSave(invalid, memoryStorage()), TypeError);
});


test("rejects a completed task falsely marked as on-time after its deadline", () => {
  const save = createInitialSave();
  save.world.currentDate = "2026-07-05";
  save.world.tasks = [{
    id: "task-falsely-on-time",
    title: "مهمة متأخرة بعلامة خاطئة",
    description: "تاريخ الإنجاز بعد الموعد لكن الحالة تقول في الموعد.",
    createdDate: "2026-07-01",
    dueDate: "2026-07-03",
    completedDate: "2026-07-04",
    completedLate: false,
    category: "timeline-test",
    status: "completed"
  }];
  assert.equal(isValidSave(save), false);
});


test("migrates version 4 agency saves into football season schema v6 without rewriting on read", () => {
  const legacy = createInitialSave("2026-07-01T00:00:00.000Z");
  legacy.meta.version = 4;
  legacy.agency.name = "Phase Four Agency";
  legacy.agency.balance = 654321;
  delete legacy.world.football;
  const raw = JSON.stringify(legacy);
  const storage = memoryStorage({ [STORAGE_KEY]: raw });

  const result = readSave(storage);
  assert.equal(result.status, "loaded");
  assert.equal(result.migrated, true);
  assert.equal(result.save.meta.version, SAVE_VERSION);
  assert.equal(result.save.agency.name, "Phase Four Agency");
  assert.equal(result.save.agency.balance, 654321);
  assert.equal(result.save.world.football.season, result.save.career.season);
  assert.ok(result.save.world.football.fixtures.length > 0);
  assert.equal(result.save.world.football.results.length, 0);
  assert.equal(isValidSave(result.save), true);
  assert.equal(storage.getItem(STORAGE_KEY), raw, "migration must not rewrite a save on read");
});

test("migrates v5 player progress into the expanded 432-player squad roster without rewriting on read", () => {
  const legacy = createInitialSave("2026-07-01T00:00:00.000Z");
  legacy.meta.version = 5;
  const development = legacy.world.football.playerDevelopment;
  development.players = development.players.slice(0, 48);
  development.players[0] = {
    ...development.players[0],
    appearances: 9,
    minutesPlayed: 810,
    goals: 4,
    assists: 3,
    averageMatchRating: 7.45
  };
  const preservedPlayer = structuredClone(development.players[0]);
  const raw = JSON.stringify(legacy);
  const storage = memoryStorage({ [STORAGE_KEY]: raw });

  const result = readSave(storage);
  assert.equal(result.status, "loaded");
  assert.equal(result.migrated, true);
  assert.equal(result.save.meta.version, SAVE_VERSION);
  assert.equal(result.save.world.football.playerDevelopment.players.length, 432);
  assert.deepEqual(
    result.save.world.football.playerDevelopment.players.find((player) => player.playerId === preservedPlayer.playerId),
    preservedPlayer
  );
  assert.ok(result.save.world.football.playerDevelopment.players.some((player) => player.playerId.startsWith("squad-")));
  assert.equal(new Set(result.save.world.football.playerDevelopment.players.map((player) => player.playerId)).size, 432);
  assert.equal(isValidSave(result.save), true);
  assert.equal(storage.getItem(STORAGE_KEY), raw, "migration must not rewrite a save on read");
});
