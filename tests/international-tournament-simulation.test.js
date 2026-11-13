import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave, isValidSave, readSave, writeSave } from "../src/core/storage.js";
import { createInitialFootballState } from "../src/engines/football-season.js";
import { createInitialCareerCalendar } from "../src/engines/career-calendar.js";
import { isValidInternationalTournamentState } from "../src/engines/international-tournament-simulation.js";
import {
  advanceInternationalTournaments,
  getInternationalTournamentOverview
} from "../src/engines/international-tournament-simulation.js";

function saveAt(date, season) {
  const initial = createInitialSave();
  return {
    ...initial,
    career: { ...initial.career, season },
    world: {
      ...initial.world,
      currentDate: date,
      football: createInitialFootballState(season, date)
    }
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

test("completed continental tournaments generate one durable archive with individual awards", () => {
  const initial = saveAt("2027-06-10", 1);
  const completed = runDays(initial, 42);
  const national = completed.world.nationalTeams;

  assert.equal(national.tournamentArchives.length, 3);
  assert.equal(new Set(national.tournamentArchives.map((item) => item.id)).size, 3);
  for (const archive of national.tournamentArchives) {
    assert.ok(archive.championTeamId);
    assert.equal(archive.matchesPlayed, archive.results.length);
    assert.ok(archive.results.every((result) => !("playerPerformances" in result) && !("events" in result)));
    assert.ok(archive.standings.length >= 0);
    assert.ok(archive.teams.some((team) => team.id === archive.championTeamId));
    assert.ok(archive.awards.topScorer);
    assert.ok(archive.awards.topAssists);
    assert.ok(archive.awards.bestPlayer);
  }
  assert.equal(isValidInternationalTournamentState(national, completed.world.currentDate), true);

  const repeated = advanceInternationalTournaments(completed);
  assert.equal(repeated, completed);
  assert.equal(repeated.world.nationalTeams.tournamentArchives.length, 3);
});

test("legacy national-team saves without tournament extensions remain valid", () => {
  const initial = createInitialSave();
  assert.equal(
    isValidInternationalTournamentState(initial.world.nationalTeams, initial.world.currentDate),
    true
  );
  assert.equal(initial.world.nationalTeams.tournamentSeasons, undefined);
  assert.equal(initial.world.nationalTeams.tournamentArchives, undefined);
});

test("v8 saves round-trip completed international archives without changing the schema version", () => {
  const initial = saveAt("2027-06-10", 1);
  const simulated = runDays(initial, 42);
  const currentDate = simulated.world.currentDate;
  const save = {
    ...simulated,
    world: {
      ...simulated.world,
      football: createInitialFootballState(1, currentDate),
      tasks: []
    }
  };
  assert.equal(isValidSave(save), true);

  const data = new Map();
  const storage = {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, value); },
    removeItem(key) { data.delete(key); }
  };
  const written = writeSave(save, storage, "2027-07-22T12:00:00.000Z");
  assert.equal(written.meta.version, 8);
  const loaded = readSave(storage);
  assert.equal(loaded.status, "loaded");
  assert.equal(loaded.save.meta.version, 8);
  assert.deepEqual(
    loaded.save.world.nationalTeams.tournamentArchives.map((item) => item.id),
    save.world.nationalTeams.tournamentArchives.map((item) => item.id)
  );
  assert.equal(
    isValidInternationalTournamentState(loaded.save.world.nationalTeams, currentDate),
    true
  );
});

test("save validation rejects duplicate or corrupted international archive data", () => {
  const initial = saveAt("2027-06-10", 1);
  const simulated = runDays(initial, 42);
  const currentDate = simulated.world.currentDate;
  const base = {
    ...simulated,
    world: {
      ...simulated.world,
      football: createInitialFootballState(1, currentDate),
      tasks: []
    }
  };
  assert.equal(isValidSave(base), true);

  const duplicate = structuredClone(base);
  duplicate.world.nationalTeams.tournamentArchives.push(
    structuredClone(duplicate.world.nationalTeams.tournamentArchives[0])
  );
  assert.equal(isValidSave(duplicate), false);

  const damaged = structuredClone(base);
  damaged.world.nationalTeams.tournamentArchives[0].championTeamId = "missing-team";
  assert.equal(isValidSave(damaged), false);
});

test("multi-season archive survives a World Cup cycle and a v8 save reload", () => {
  const firstSeason = runDays(saveAt("2027-06-10", 1), 42);
  assert.equal(firstSeason.world.nationalTeams.tournamentArchives.length, 3);

  const secondStartDate = "2030-06-10";
  const worldCupSave = {
    ...firstSeason,
    career: { ...firstSeason.career, season: 4 },
    world: {
      ...firstSeason.world,
      currentDate: secondStartDate,
      football: createInitialFootballState(4, secondStartDate),
      tasks: []
    }
  };
  const launched = advanceInternationalTournaments(worldCupSave);
  assert.equal(launched.world.nationalTeams.tournamentSeasons.length, 2);
  const completed = runDays(launched, 125);
  const national = completed.world.nationalTeams;

  assert.equal(national.tournamentArchives.length, 4);
  assert.equal(new Set(national.tournamentArchives.map((item) => item.id)).size, 4);
  assert.ok(national.tournamentArchives.some((item) =>
    item.type === "world" && item.season === 4 && item.championTeamId
  ));
  assert.equal(isValidInternationalTournamentState(national, completed.world.currentDate), true);

  const cleanSave = createInitialSave();
  const cleanNationalState = cleanSave.world.nationalTeams;
  const finalSave = {
    ...cleanSave,
    career: { ...cleanSave.career, season: 4 },
    world: {
      ...cleanSave.world,
      currentDate: completed.world.currentDate,
      ...createInitialCareerCalendar(completed.world.currentDate, 4),
      nationalTeams: {
        ...cleanNationalState,
        tournamentSeasons: national.tournamentSeasons,
        tournamentArchives: national.tournamentArchives
      },
      football: createInitialFootballState(4, completed.world.currentDate)
    }
  };
  assert.equal(isValidSave(finalSave), true);
  const data = new Map();
  const storage = {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, value); },
    removeItem(key) { data.delete(key); }
  };
  writeSave(finalSave, storage, "2030-10-13T12:00:00.000Z");
  const reloaded = readSave(storage);
  assert.equal(reloaded.status, "loaded");
  assert.deepEqual(
    reloaded.save.world.nationalTeams.tournamentArchives.map((item) => item.id),
    finalSave.world.nationalTeams.tournamentArchives.map((item) => item.id)
  );
});
