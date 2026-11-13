import test from "node:test";
import assert from "node:assert/strict";
import { WORLD_DATABASE } from "../src/data/world-database.js";
import { createInitialSave, isValidSave } from "../src/core/storage.js";
import { advanceCareerSimulationDays } from "../src/engines/career-simulation.js";
import { advanceInternationalWindows } from "../src/engines/international-breaks.js";
import {
  advanceInternationalMatches,
  getInternationalPlayerStats,
  getRecentInternationalMatches,
  getUpcomingInternationalFixtures,
  isValidInternationalMatchState
} from "../src/engines/international-matches.js";

function withDate(save, currentDate) {
  return {
    ...save,
    world: {
      ...save.world,
      currentDate
    }
  };
}

function createMatchdaySave() {
  const callupDate = withDate(createInitialSave(), "2026-09-07");
  const calledUp = advanceInternationalWindows(callupDate);
  return withDate(calledUp, "2026-09-08");
}

test("schedules two deterministic friendly matchdays for all available national teams", () => {
  const first = advanceInternationalMatches(createMatchdaySave());
  const state = first.world.nationalTeams;
  const fixtures = state.fixtures.filter((fixture) =>
    fixture.windowId === "international-window-2026-autumn"
  );

  assert.equal(fixtures.length, WORLD_DATABASE.countries.length);
  assert.equal(fixtures.filter((fixture) => fixture.matchday === 1).length, WORLD_DATABASE.countries.length / 2);
  assert.equal(fixtures.filter((fixture) => fixture.matchday === 2).length, WORLD_DATABASE.countries.length / 2);
  assert.ok(fixtures.every((fixture) => fixture.status === "played" || fixture.status === "scheduled"));
  assert.ok(fixtures.filter((fixture) => fixture.matchday === 1).every((fixture) =>
    fixture.date === "2026-09-08"
  ));
  assert.ok(fixtures.filter((fixture) => fixture.matchday === 2).every((fixture) =>
    fixture.date === "2026-09-12"
  ));

  for (const matchday of [1, 2]) {
    const teams = fixtures.filter((fixture) => fixture.matchday === matchday)
      .flatMap((fixture) => [fixture.homeCountryId, fixture.awayCountryId]);
    assert.equal(new Set(teams).size, teams.length);
    assert.equal(teams.length, WORLD_DATABASE.countries.length);
  }
  assert.equal(isValidInternationalMatchState(state, first.world.currentDate), true);
});

test("reuses the club match engine and records complete national-team match results", () => {
  const first = advanceInternationalMatches(createMatchdaySave());
  const state = first.world.nationalTeams;
  const results = state.matches.filter((match) => match.date === "2026-09-08");

  assert.equal(results.length, WORLD_DATABASE.countries.length / 2);
  assert.ok(results.every((match) =>
    match.matchType === "friendly" &&
    match.competitionId === "international-friendlies" &&
    match.status === "played" &&
    match.playerPerformances.length === 22
  ));
  for (const match of results) {
    assert.equal(match.home.possession + match.away.possession, 100);
    for (const teamId of [match.home.clubId, match.away.clubId]) {
      const lineup = match.playerPerformances.filter((player) => player.clubId === teamId);
      assert.equal(lineup.length, 11);
      assert.equal(lineup.filter((player) => player.role === "حراسة").length, 1);
      assert.ok(lineup.every((player) => player.simulationOnly === false));
    }
  }
  assert.ok(first.world.events.some((event) => event.type === "international-match-played"));
  assert.ok(first.world.inbox.some((message) =>
    message.eventId.startsWith("event-international-fixture-")
  ));
  assert.equal(isValidInternationalMatchState(state, first.world.currentDate), true);
});

test("keeps national-team statistics separate from the player's club record", () => {
  const initial = createMatchdaySave();
  const first = advanceInternationalMatches(initial);
  const performance = first.world.nationalTeams.matches[0].playerPerformances[0];
  const before = initial.world.football.playerDevelopment.players.find((player) =>
    player.playerId === performance.playerId
  );
  const after = first.world.football.playerDevelopment.players.find((player) =>
    player.playerId === performance.playerId
  );
  const international = getInternationalPlayerStats(first.world.nationalTeams, performance.playerId);

  assert.ok(before);
  assert.ok(after);
  assert.equal(after.appearances, before.appearances);
  assert.equal(after.minutesPlayed, before.minutesPlayed);
  assert.equal(after.goals, before.goals);
  assert.equal(after.assists, before.assists);
  assert.deepEqual(after.competitionStats, before.competitionStats);
  assert.ok(after.fatigue > before.fatigue);
  assert.ok(after.fitness < before.fitness);
  assert.ok(international);
  assert.equal(international.appearances, 1);
  assert.equal(international.minutesPlayed, performance.minutesPlayed);
  assert.equal(international.goals, performance.goals);
  assert.equal(international.assists, performance.assists);
});

test("does not replay a completed international fixture when the same date is processed twice", () => {
  const first = advanceInternationalMatches(createMatchdaySave());
  const second = advanceInternationalMatches(first);
  assert.equal(second, first);
  assert.equal(second.world.nationalTeams.matches.length, WORLD_DATABASE.countries.length / 2);
  assert.equal(new Set(second.world.nationalTeams.matches.map((match) => match.id)).size,
    second.world.nationalTeams.matches.length);
});

test("delays a fixture rather than inventing a goalkeeper when all called-up keepers are injured", () => {
  const save = createMatchdaySave();
  const egypt = save.world.nationalTeams.callups.find((callup) => callup.countryId === "country-eg");
  const injuredKeeperIds = new Set(egypt.players
    .filter((player) => player.role === "حراسة")
    .map((player) => player.playerId));
  assert.equal(injuredKeeperIds.size, 3);

  const playerDevelopment = {
    ...save.world.football.playerDevelopment,
    players: save.world.football.playerDevelopment.players.map((player) =>
      injuredKeeperIds.has(player.playerId) ? { ...player, injuryDays: 5 } : player
    )
  };
  const injuredSave = {
    ...save,
    world: {
      ...save.world,
      football: { ...save.world.football, playerDevelopment }
    }
  };
  const advanced = advanceInternationalMatches(injuredSave);
  const egyptFixture = advanced.world.nationalTeams.fixtures.find((fixture) =>
    fixture.date === "2026-09-08" &&
    [fixture.homeCountryId, fixture.awayCountryId].includes("country-eg")
  );

  assert.ok(egyptFixture);
  assert.equal(egyptFixture.status, "scheduled");
  assert.equal(egyptFixture.date, "2026-09-09");
  assert.equal(advanced.world.nationalTeams.matches.some((match) =>
    match.home.countryId === "country-eg" || match.away.countryId === "country-eg"
  ), false);
  assert.equal(isValidInternationalMatchState(advanced.world.nationalTeams, advanced.world.currentDate), true);
});

test("exposes upcoming and recent international fixtures and rejects duplicate results", () => {
  const first = advanceInternationalMatches(createMatchdaySave());
  const state = first.world.nationalTeams;
  assert.equal(getRecentInternationalMatches(state, 6).length, 6);
  assert.equal(getUpcomingInternationalFixtures(state, first.world.currentDate, 20).length, 6);

  const corrupted = structuredClone(state);
  corrupted.matches.push(structuredClone(corrupted.matches[0]));
  assert.equal(isValidInternationalMatchState(corrupted, first.world.currentDate), false);
});


test("runs international fixtures through the complete daily career pipeline and keeps the save valid", () => {
  let save = createInitialSave();
  save = advanceCareerSimulationDays(save, 31, []).save;
  save = advanceCareerSimulationDays(save, 31, []).save;
  save = advanceCareerSimulationDays(save, 6, []).save;
  save = advanceCareerSimulationDays(save, 1, []).save;

  assert.equal(save.world.currentDate, "2026-09-08");
  assert.equal(save.world.nationalTeams.matches.length, WORLD_DATABASE.countries.length / 2);
  assert.equal(save.world.nationalTeams.fixtures.filter((fixture) => fixture.status === "played").length,
    WORLD_DATABASE.countries.length / 2);
  assert.equal(isValidSave(save), true);
});
