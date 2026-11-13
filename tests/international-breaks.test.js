import test from "node:test";
import assert from "node:assert/strict";
import { WORLD_DATABASE } from "../src/data/world-database.js";
import { createInitialSave, isValidSave } from "../src/core/storage.js";
import { advanceCareerSimulationDays } from "../src/engines/career-simulation.js";
import {
  advanceInternationalWindows,
  createInitialNationalTeamState,
  getInternationalWindows,
  getUpcomingInternationalWindows,
  isValidNationalTeamState
} from "../src/engines/international-breaks.js";

function withDate(save, currentDate) {
  return {
    ...save,
    world: {
      ...save.world,
      currentDate,
      nationalTeams: save.world.nationalTeams ?? createInitialNationalTeamState()
    }
  };
}

test("defines four deterministic, bounded international windows per year", () => {
  const windows = getInternationalWindows(2027);
  assert.equal(windows.length, 4);
  assert.equal(new Set(windows.map((window) => window.id)).size, 4);
  assert.ok(windows.every((window) => window.startDate <= window.endDate));
  assert.deepEqual(
    getUpcomingInternationalWindows("2026-09-01", 3).map((window) => window.key),
    ["autumn", "winter", "spring"]
  );
  assert.throws(() => getInternationalWindows(1899), /سنة التوقف الدولي/);
});

test("initializes a valid empty international state without requiring a save-version bump", () => {
  const save = createInitialSave();
  assert.equal(isValidNationalTeamState(save.world.nationalTeams, save.world.currentDate), true);
  assert.equal(isValidSave(save), true);
  assert.equal(save.meta.version, 8);
});

test("issues one 23-player, nationality-safe call-up for every country on the window start date", () => {
  const save = withDate(createInitialSave(), "2026-09-07");
  const advanced = advanceInternationalWindows(save);
  const state = advanced.world.nationalTeams;
  assert.equal(state.windows.length, 1);
  assert.equal(state.callups.length, WORLD_DATABASE.countries.length);
  assert.equal(state.lastProcessedDate, "2026-09-07");
  assert.ok(state.callups.every((callup) => callup.players.length === 23));
  assert.ok(state.callups.every((callup) => callup.players.every((player) =>
    player.countryId === callup.countryId && player.status === "called"
  )));
  assert.equal(new Set(state.callups.map((callup) => callup.windowId + "::" + callup.countryId)).size, state.callups.length);
  assert.equal(advanced.world.events.filter((event) => event.type === "international-window-opened").length, 1);
  assert.ok(advanced.world.inbox.some((message) => message.eventId === "event-international-window-2026-autumn-national-callups"));
  assert.equal(isValidNationalTeamState(state, advanced.world.currentDate), true);
  assert.equal(isValidSave(advanced), true);
});

test("does not issue duplicate national call-ups when the same date is processed twice", () => {
  const save = withDate(createInitialSave(), "2026-09-07");
  const first = advanceInternationalWindows(save);
  const second = advanceInternationalWindows(first);
  assert.equal(second, first);
  assert.equal(second.world.nationalTeams.callups.length, WORLD_DATABASE.countries.length);
  assert.equal(second.world.events.filter((event) => event.type === "international-window-opened").length, 1);
});

test("records a club's current affiliation without changing a player's national eligibility", () => {
  const save = withDate(createInitialSave(), "2026-09-07");
  const advanced = advanceInternationalWindows(save);
  const egypt = advanced.world.nationalTeams.callups.find((callup) => callup.countryId === "country-eg");
  assert.ok(egypt);
  assert.ok(egypt.players.every((player) => typeof player.currentClubId === "string" && player.currentClubId.length > 0));
  assert.ok(egypt.players.every((player) => player.countryId === "country-eg"));
});

test("withdraws an injured call-up and replaces him with a fit player of the same role and nationality", () => {
  const firstDay = advanceInternationalWindows(withDate(createInitialSave(), "2026-09-07"));
  const egypt = firstDay.world.nationalTeams.callups.find((callup) => callup.countryId === "country-eg");
  const victim = egypt.players[0];
  const playerDevelopment = {
    ...firstDay.world.football.playerDevelopment,
    players: firstDay.world.football.playerDevelopment.players.map((player) =>
      player.playerId === victim.playerId ? { ...player, injuryDays: 6 } : player
    )
  };
  const nextDay = {
    ...firstDay,
    world: {
      ...firstDay.world,
      currentDate: "2026-09-08",
      football: { ...firstDay.world.football, playerDevelopment }
    }
  };
  const advanced = advanceInternationalWindows(nextDay);
  const updated = advanced.world.nationalTeams.callups.find((callup) => callup.id === egypt.id);
  const replacement = updated.players.find((player) => player.shirtNumber === victim.shirtNumber);

  assert.ok(replacement);
  assert.notEqual(replacement.playerId, victim.playerId);
  assert.equal(replacement.role, victim.role);
  assert.equal(replacement.countryId, "country-eg");
  assert.equal(replacement.status, "called");
  assert.ok(updated.changes.some((change) =>
    change.type === "injury-withdrawal" && change.playerId === victim.playerId
  ));
  assert.ok(updated.changes.some((change) =>
    change.type === "replacement" && change.playerId === victim.playerId &&
    change.replacementPlayerId === replacement.playerId
  ));
  assert.equal(updated.players.filter((player) => player.status === "called").length, 23);
  assert.equal(new Set(updated.players.map((player) => player.playerId)).size, 23);
  assert.equal(isValidNationalTeamState(advanced.world.nationalTeams, advanced.world.currentDate), true);
  assert.equal(isValidSave(advanced), true);
});

test("closes the window and its call-ups once the final international date has passed", () => {
  const firstDay = advanceInternationalWindows(withDate(createInitialSave(), "2026-09-07"));
  const afterWindow = {
    ...firstDay,
    world: { ...firstDay.world, currentDate: "2026-09-16" }
  };
  const completed = advanceInternationalWindows(afterWindow);
  assert.equal(completed.world.nationalTeams.windows[0].status, "completed");
  assert.ok(completed.world.nationalTeams.callups.every((callup) => callup.status === "completed"));
  assert.equal(isValidNationalTeamState(completed.world.nationalTeams, completed.world.currentDate), true);
  assert.equal(isValidSave(completed), true);
});

test("rejects corrupted window or duplicate call-up records", () => {
  const firstDay = advanceInternationalWindows(withDate(createInitialSave(), "2026-09-07"));
  const duplicateCallups = structuredClone(firstDay.world.nationalTeams);
  duplicateCallups.callups.push(structuredClone(duplicateCallups.callups[0]));
  assert.equal(isValidNationalTeamState(duplicateCallups, firstDay.world.currentDate), false);

  const invalidWindow = structuredClone(firstDay.world.nationalTeams);
  invalidWindow.windows[0].endDate = "2026-09-01";
  assert.equal(isValidNationalTeamState(invalidWindow, firstDay.world.currentDate), false);
});


test("processes international call-ups through the real shared career-day pipeline", () => {
  let save = createInitialSave();
  save = advanceCareerSimulationDays(save, 31, []).save;
  save = advanceCareerSimulationDays(save, 31, []).save;
  save = advanceCareerSimulationDays(save, 6, []).save;

  assert.equal(save.world.currentDate, "2026-09-07");
  assert.equal(save.world.nationalTeams.callups.length, WORLD_DATABASE.countries.length);
  assert.ok(save.world.events.some((event) => event.type === "international-window-opened"));
  assert.ok(save.world.inbox.some((message) => message.eventId === "event-international-window-2026-autumn-national-callups"));
  assert.equal(isValidSave(save), true);
});
