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
  getRecentFootballResults
} from "../src/engines/football-season.js";

function dateDistance(left, right) {
  return Math.round((Date.parse(left + "T00:00:00Z") - Date.parse(right + "T00:00:00Z")) / 86400000);
}

test("builds complete simulation XIs and clearly marks anonymous generated squad players", () => {
  const club = WORLD_DATABASE.clubs[0];
  const team = buildSimulationTeam(club.id);
  assert.equal(team.lineup.length, 11);
  assert.equal(team.lineup.filter((player) => player.role === "حراسة").length, 1);
  assert.equal(new Set(team.lineup.map((player) => player.id)).size, 11);
  assert.ok(team.lineup.some((player) => player.simulationOnly === false));
  assert.ok(team.lineup.some((player) => player.simulationOnly === true));
  assert.ok(team.lineup.filter((player) => player.simulationOnly).every((player) => player.name.includes("لاعب محاكاة")));
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

test("match results carry real fictional player appearances and explicitly marked anonymous fillers", () => {
  const initial = createInitialFootballState(1, "2026-07-01");
  const firstDate = getUpcomingFootballFixtures(initial, "2026-07-01", 1)[0].date;
  const played = advanceFootballSeasonDay(initial, firstDate, 1);
  const result = played.resultsToday[0];
  assert.equal(result.playerPerformances.length, 22);
  assert.ok(result.playerPerformances.some((player) => player.simulationOnly === false));
  assert.ok(result.playerPerformances.some((player) => player.simulationOnly === true));
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
