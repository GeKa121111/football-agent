import test from "node:test";
import assert from "node:assert/strict";
import { WORLD_DATABASE } from "../src/data/world-database.js";
import {
  buildSimulationTeam,
  generateSeasonFixtures,
  createInitialFootballState,
  advanceFootballSeasonDay,
  isValidFootballState,
  getUpcomingFootballFixtures,
  getRecentFootballResults,
  getCompetitionStandings
} from "../src/engines/football-season.js";

function dateDistance(left, right) {
  return Math.round((Date.parse(left + "T00:00:00Z") - Date.parse(right + "T00:00:00Z")) / 86400000);
}

test("builds complete 18-player fictional squads and starting XIs without emergency fillers", () => {
  const club = WORLD_DATABASE.clubs[0];
  const team = buildSimulationTeam(club.id);
  assert.equal(team.squad.length, 18);
  assert.equal(team.lineup.length, 11);
  assert.equal(team.bench.length, 7);
  assert.equal(team.lineup.filter((player) => player.role === "حراسة").length, 1);
  assert.equal(new Set(team.lineup.map((player) => player.id)).size, 11);
  assert.ok(team.lineup.every((player) => player.simulationOnly === false));
  assert.equal(new Set(team.squad.map((player) => player.id)).size, 18);
});

test("preserves 18-player squad composition, identity and portrait coverage for all clubs", () => {
  const targets = new Map([["حراسة", 2], ["دفاع", 6], ["وسط", 6], ["هجوم", 4]]);
  assert.equal(WORLD_DATABASE.players.length, 48);
  assert.equal(WORLD_DATABASE.squadPlayers.length, 384);
  assert.equal(new Set([...WORLD_DATABASE.players, ...WORLD_DATABASE.squadPlayers].map((player) => player.id)).size, 432);
  for (const club of WORLD_DATABASE.clubs) {
    const roster = [...WORLD_DATABASE.players, ...WORLD_DATABASE.squadPlayers].filter((player) => player.clubId === club.id);
    assert.equal(roster.length, 18);
    assert.equal(new Set(roster.map((player) => player.shirtNumber)).size, 18);
    assert.equal(new Set(roster.map((player) => player.portraitAssetId)).size, 18);
    for (const [role, count] of targets) assert.equal(roster.filter((player) => player.role === role).length, count);
  }
});

test("generates deterministic home-and-away fixtures for all seeded competitions", () => {
  const first = generateSeasonFixtures(1, "2026-07-01");
  const second = generateSeasonFixtures(1, "2026-07-01");
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((fixture) => fixture.id)).size, first.length);
  const expected = WORLD_DATABASE.competitions.reduce((sum, competition) => {
    const count = competition.clubIds.length;
    return sum + count * (count - 1);
  }, 0);
  assert.equal(first.length, expected);
  for (const fixture of first) {
    assert.equal(fixture.status, "scheduled");
    assert.equal(fixture.resultId, null);
  }
});

test("keeps club match dates separated by a minimum rest window", () => {
  const fixtures = generateSeasonFixtures(1, "2026-07-01");
  const datesByClub = new Map();
  for (const fixture of fixtures) {
    for (const clubId of [fixture.homeClubId, fixture.awayClubId]) {
      const dates = datesByClub.get(clubId) ?? [];
      dates.push(fixture.date);
      datesByClub.set(clubId, dates);
    }
  }
  for (const dates of datesByClub.values()) {
    dates.sort();
    for (let index = 1; index < dates.length; index += 1) {
      assert.ok(dateDistance(dates[index], dates[index - 1]) >= 3);
    }
  }
});

test("plays fixtures once on their date, stores results and emits linked calendar events", () => {
  const initial = createInitialFootballState(1, "2026-07-01");
  const firstDate = getUpcomingFootballFixtures(initial, "2026-07-01", 1)[0].date;
  const expectedToday = initial.fixtures.filter((fixture) => fixture.date === firstDate);
  const played = advanceFootballSeasonDay(initial, firstDate, 1);

  assert.equal(played.resultsToday.length, expectedToday.length);
  assert.equal(played.football.results.length, expectedToday.length);
  assert.equal(played.events.length, expectedToday.length);
  assert.equal(played.messages.length, expectedToday.length);
  assert.ok(played.events.every((event) => event.type === "football-match-played"));
  assert.ok(played.messages.every((message) => played.events.some((event) => event.id === message.eventId)));
  assert.equal(played.football.fixtures.filter((fixture) => fixture.status === "played").length, expectedToday.length);
  assert.equal(isValidFootballState(played.football, firstDate, 1), true);

  const replay = advanceFootballSeasonDay(played.football, firstDate, 1);
  assert.equal(replay.resultsToday.length, 0);
  assert.equal(replay.football.results.length, expectedToday.length);
});

test("match results persist full-squad player appearances without anonymous fillers in healthy XIs", () => {
  const initial = createInitialFootballState(1, "2026-07-01");
  const firstDate = getUpcomingFootballFixtures(initial, "2026-07-01", 1)[0].date;
  const played = advanceFootballSeasonDay(initial, firstDate, 1);
  const result = played.resultsToday[0];
  assert.equal(result.playerPerformances.length, 22);
  assert.ok(result.playerPerformances.some((player) => player.simulationOnly === false));
  assert.ok(result.playerPerformances.every((player) => player.simulationOnly === false));
  assert.equal(played.football.playerDevelopment.players.length, 432);
  assert.ok(played.football.playerDevelopment.players.some((player) => player.appearances > 0));
});

test("creates a new scheduled season without deleting historical results", () => {
  const initial = createInitialFootballState(1, "2026-07-01");
  const firstDate = getUpcomingFootballFixtures(initial, "2026-07-01", 1)[0].date;
  const played = advanceFootballSeasonDay(initial, firstDate, 1);
  const nextSeason = advanceFootballSeasonDay(played.football, "2027-07-01", 2);

  assert.equal(nextSeason.football.season, 2);
  assert.ok(nextSeason.football.fixtures.some((fixture) => fixture.season === 2));
  assert.equal(nextSeason.football.results.length, played.football.results.length);
  assert.equal(isValidFootballState(nextSeason.football, "2027-07-01", 2), true);
});

test("rejects corrupted football schedules and dangling results", () => {
  const initial = createInitialFootballState(1, "2026-07-01");
  const badSchedule = {
    ...initial,
    fixtures: initial.fixtures.map((fixture, index) => index === 0
      ? { ...fixture, homeClubId: fixture.awayClubId }
      : fixture)
  };
  assert.equal(isValidFootballState(badSchedule, "2026-07-01", 1), false);
  assert.equal(isValidFootballState({ ...initial, results: [{ id: "missing" }] }, "2026-07-01", 1), false);
});

test("upcoming fixtures and recent results are stable and bounded", () => {
  const initial = createInitialFootballState(1, "2026-07-01");
  const upcoming = getUpcomingFootballFixtures(initial, "2026-07-01", 5);
  assert.equal(upcoming.length, 5);
  assert.ok(upcoming.every((fixture) => fixture.date > "2026-07-01"));
  assert.deepEqual(getRecentFootballResults(initial), []);
});


test("excludes injured world players from a matchday starting XI", () => {
  const club = WORLD_DATABASE.clubs[0];
  const player = WORLD_DATABASE.players.find((item) => item.clubId === club.id);
  const state = createInitialFootballState(1, "2026-07-01");
  const development = {
    ...state.playerDevelopment,
    players: state.playerDevelopment.players.map((item) => item.playerId === player.id
      ? { ...item, injuryDays: 5 }
      : item)
  };
  const team = buildSimulationTeam(club.id, WORLD_DATABASE, development);
  assert.equal(team.lineup.length, 11);
  assert.equal(team.lineup.some((item) => item.id === player.id), false);
  assert.ok(team.squad.every((item) => item.id !== player.id));
  assert.ok(team.lineup.every((item) => item.simulationOnly === false));
});

test("calculates competition standings from saved results with deterministic tie-breaks", () => {
  const competition = WORLD_DATABASE.competitions.find((item) => item.id === "competition-eg-premier");
  const [ahly, zamalek] = competition.clubIds;
  const state = {
    results: [
      {
        season: 1,
        competitionId: competition.id,
        home: { clubId: ahly, goals: 2 },
        away: { clubId: zamalek, goals: 0 }
      },
      {
        season: 1,
        competitionId: competition.id,
        home: { clubId: zamalek, goals: 1 },
        away: { clubId: ahly, goals: 1 }
      },
      {
        season: 2,
        competitionId: competition.id,
        home: { clubId: zamalek, goals: 8 },
        away: { clubId: ahly, goals: 0 }
      }
    ],
    season: 1
  };
  const table = getCompetitionStandings(state, competition.id);
  assert.equal(table.length, 2);
  assert.equal(table[0].clubId, ahly);
  assert.equal(table[0].played, 2);
  assert.equal(table[0].wins, 1);
  assert.equal(table[0].draws, 1);
  assert.equal(table[0].points, 4);
  assert.equal(table[1].clubId, zamalek);
  assert.equal(table[1].points, 1);
  assert.equal(getCompetitionStandings(state, "missing-competition").length, 0);
});

test("simulates three complete seasons without duplicate fixtures, lost results or invalid player state", () => {
  const start = new Date("2026-07-01T00:00:00.000Z");
  const end = new Date("2029-07-01T00:00:00.000Z");
  let football = createInitialFootballState(1, "2026-07-01");
  const expectedPerSeason = generateSeasonFixtures(1, "2026-07-01").length;
  let dayIndex = 0;

  for (const cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const currentDate = cursor.toISOString().slice(0, 10);
    const season = Number(currentDate.slice(0, 4)) - 2026 +
      (Number(currentDate.slice(5, 7)) >= 7 ? 1 : 0);
    const advanced = advanceFootballSeasonDay(football, currentDate, season);
    football = advanced.football;

    const playedIds = football.results.map((result) => result.id);
    assert.equal(new Set(playedIds).size, playedIds.length, "result IDs must remain unique");
    if (dayIndex % 30 === 0) {
      assert.equal(isValidFootballState(football, currentDate, season), true);
    }
    dayIndex += 1;
  }

  assert.equal(football.season, 3);
  assert.equal(football.results.length, expectedPerSeason * 3);
  assert.equal(football.fixtures.filter((fixture) => fixture.status === "scheduled").length, 0);
  assert.equal(football.playerDevelopment.players.length, 432);
  assert.ok(football.playerDevelopment.players.some((player) => player.appearances >= 10));
  assert.ok(football.playerDevelopment.players.every((player) =>
    player.rating <= player.potential && player.fitness >= 0 && player.fitness <= 100 &&
    player.fatigue >= 0 && player.fatigue <= 100
  ));
  for (const season of [1, 2, 3]) {
    assert.equal(football.results.filter((result) => result.season === season).length, expectedPerSeason);
  }
  assert.equal(isValidFootballState(football, "2029-06-30", 3), true);
});
