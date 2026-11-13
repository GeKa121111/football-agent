import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave } from "../src/core/storage.js";
import {
  advanceInternationalTournaments,
  getInternationalTournamentOverview
} from "../src/engines/international-tournament-simulation.js";

function saveAt(date, season) {
  const initial = createInitialSave();
  return {
    ...initial,
    career: { ...initial.career, season },
    world: { ...initial.world, currentDate: date }
  };
}

function nextDay(save) {
  const date = new Date(save.world.currentDate + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return {
    ...save,
    world: { ...save.world, currentDate: date.toISOString().slice(0, 10) }
  };
}

function runDays(save, days) {
  let current = save;
  for (let index = 0; index < days; index += 1) {
    current = advanceInternationalTournaments(current);
    current = nextDay(current);
  }
  return current;
}

test("career season 1 schedules continental tournaments and simulates due fixtures once", () => {
  const initial = saveAt("2027-06-10", 1);
  const clubAppearances = new Map(initial.world.football.playerDevelopment.players
    .map((player) => [player.playerId, player.appearances]));
  const advanced = advanceInternationalTournaments(initial);
  const state = advanced.world.nationalTeams.tournamentSeasons;

  assert.equal(state.length, 1);
  assert.equal(state[0].tournaments.length, 3);
  assert.ok(state[0].tournaments.every((item) => item.type === "continental"));
  assert.ok(state[0].tournaments.some((item) => item.results.length > 0));
  assert.ok(advanced.world.events.some((event) => event.type === "international-tournaments-opened"));
  assert.ok(advanced.world.inbox.some((message) => message.title === "انطلاق بطولات المنتخبات"));

  const repeated = advanceInternationalTournaments(advanced);
  assert.equal(repeated, advanced);

  for (const player of advanced.world.football.playerDevelopment.players) {
    assert.equal(player.appearances, clubAppearances.get(player.playerId));
  }
});

test("continental tournaments complete through groups, semifinals and finals with a single champion", () => {
  const initial = saveAt("2027-06-10", 1);
  const completed = runDays(initial, 42);
  const overview = getInternationalTournamentOverview(
    completed.world.nationalTeams,
    completed.world.currentDate
  );
  const season = overview.tournaments.filter((item) => item.season === 1);

  assert.equal(season.length, 3);
  assert.ok(season.every((item) => item.status === "completed"));
  assert.ok(season.every((item) => item.championTeamId));
  assert.equal(new Set(season.map((item) => item.championTeamId)).size, 3);
  assert.equal(overview.champions.length, 3);

  for (const tournament of season) {
    assert.ok(tournament.results.length > 0);
    assert.ok(tournament.fixtures.every((fixture) => fixture.status === "played"));
    assert.equal(new Set(tournament.results.map((result) => result.fixtureId)).size, tournament.results.length);
  }
});

test("career season 2 does not create an international tournament cycle", () => {
  const initial = saveAt("2028-06-10", 2);
  const advanced = advanceInternationalTournaments(initial);
  assert.equal(advanced.world.nationalTeams.tournamentSeasons, undefined);
});

test("career season 4 schedules a World Cup only and completes it over later matchdays", () => {
  const initial = saveAt("2030-06-10", 4);
  const launched = advanceInternationalTournaments(initial);
  const season = launched.world.nationalTeams.tournamentSeasons[0];
  assert.equal(season.tournaments.length, 1);
  assert.equal(season.tournaments[0].type, "world");
  assert.equal(season.tournaments[0].nameAr, "كأس العالم للمنتخبات");
  assert.equal(season.tournaments[0].results.length, 0);

  const completed = runDays(launched, 125);
  const overview = getInternationalTournamentOverview(
    completed.world.nationalTeams,
    completed.world.currentDate
  );
  const worldCup = overview.tournaments.find((item) => item.season === 4);
  assert.ok(worldCup);
  assert.equal(worldCup.status, "completed");
  assert.ok(worldCup.championTeamId);
  assert.ok(worldCup.fixtures.some((fixture) => fixture.phase === "semi-final"));
  assert.ok(worldCup.fixtures.some((fixture) => fixture.phase === "final"));
});

test("tournament results and player statistics remain separate from club competition records", () => {
  const initial = saveAt("2027-06-10", 1);
  const trackedId = initial.world.football.playerDevelopment.players[0].playerId;
  const before = initial.world.football.playerDevelopment.players
    .find((player) => player.playerId === trackedId);
  const completed = runDays(initial, 42);
  const after = completed.world.football.playerDevelopment.players
    .find((player) => player.playerId === trackedId);
  const tournamentStats = completed.world.nationalTeams.tournamentSeasons
    .flatMap((record) => record.tournaments.flatMap((tournament) => tournament.playerStats));

  assert.equal(after.appearances, before.appearances);
  assert.equal(after.goals, before.goals);
  assert.equal(after.assists, before.assists);
  assert.ok(tournamentStats.length > 0);
  assert.ok(completed.world.nationalTeams.tournamentSeasons.every((record) =>
    record.tournaments.every((tournament) =>
      tournament.results.every((result) => result.tournamentId === tournament.id)
    )
  ));
});
