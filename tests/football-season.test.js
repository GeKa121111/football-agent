import test from "node:test";
import assert from "node:assert/strict";
import { WORLD_DATABASE, getWorldSummary, getWorldSquadPlayers, validateWorldDatabase } from "../src/data/world-database.js";
import { buildCompetitionGroups } from "../src/data/competition-rules.js";
import { createInitialPlayerDevelopmentState } from "../src/engines/player-development.js";
import {
  buildSimulationTeam,
  generateSeasonFixtures,
  createInitialFootballState,
  advanceFootballSeasonDay,
  isValidFootballState,
  getUpcomingFootballFixtures,
  getRecentFootballResults,
  getCompetitionStandings,
  getCompetitionSeasonHistory,
  getCompetitionSeasonAwards
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

test("uses saved player development ratings when selecting matchday squads and team strength", () => {
  const club = WORLD_DATABASE.clubs[0];
  const baseline = buildSimulationTeam(club.id);
  const developedPlayer = baseline.lineup.find((player) => player.simulationOnly !== true);
  assert.ok(developedPlayer, "the baseline XI must include a real world player");

  const development = createInitialPlayerDevelopmentState(getWorldSquadPlayers());
  const updatedDevelopment = {
    ...development,
    players: development.players.map((player) => player.playerId === developedPlayer.id
      ? { ...player, rating: 99, potential: 99 }
      : player)
  };
  const developedTeam = buildSimulationTeam(
    club.id, WORLD_DATABASE, updatedDevelopment
  );
  const updatedStarter = developedTeam.lineup.find((player) => player.id === developedPlayer.id);
  const updatedSquadPlayer = developedTeam.squad.find((player) => player.id === developedPlayer.id);

  assert.equal(updatedStarter.rating, 99);
  assert.equal(updatedStarter.potential, 99);
  assert.equal(updatedSquadPlayer.rating, 99);
  const averageRating = (team) =>
    team.lineup.reduce((total, player) => total + player.rating, 0) / team.lineup.length;
  assert.ok(averageRating(developedTeam) > averageRating(baseline));
});

test("moves permanent and loaned players between matchday squads using saved transfer records", () => {
  const [sourceClub, destinationClub] = WORLD_DATABASE.clubs;
  const player = getWorldSquadPlayers().find((candidate) =>
    candidate.clubId === sourceClub.id && candidate.role === "هجوم"
  );
  assert.ok(player, "source club must provide a test player");

  const permanentTransfers = {
    moves: [{
      id: "transfer-move-test-permanent",
      playerId: player.id,
      type: "permanent",
      status: "active",
      effectiveDate: "2026-07-01",
      toClubId: destinationClub.id
    }]
  };
  const sourceAfterPermanent = buildSimulationTeam(sourceClub.id, WORLD_DATABASE, null, permanentTransfers, "2026-07-02");
  const destinationAfterPermanent = buildSimulationTeam(destinationClub.id, WORLD_DATABASE, null, permanentTransfers, "2026-07-02");
  assert.equal(sourceAfterPermanent.squad.some((member) => member.id === player.id), false);
  assert.equal(destinationAfterPermanent.squad.some((member) => member.id === player.id), true);

  const activeLoan = {
    moves: [{
      id: "transfer-move-test-loan",
      playerId: player.id,
      type: "loan",
      status: "active",
      effectiveDate: "2026-07-01",
      toClubId: destinationClub.id
    }]
  };
  const sourceDuringLoan = buildSimulationTeam(sourceClub.id, WORLD_DATABASE, null, activeLoan, "2026-07-02");
  const destinationDuringLoan = buildSimulationTeam(destinationClub.id, WORLD_DATABASE, null, activeLoan, "2026-07-02");
  assert.equal(sourceDuringLoan.squad.some((member) => member.id === player.id), false);
  assert.equal(destinationDuringLoan.squad.some((member) => member.id === player.id), true);

  const returnedLoan = { moves: [{ ...activeLoan.moves[0], status: "returned" }] };
  const sourceAfterLoan = buildSimulationTeam(sourceClub.id, WORLD_DATABASE, null, returnedLoan, "2027-01-01");
  const destinationAfterLoan = buildSimulationTeam(destinationClub.id, WORLD_DATABASE, null, returnedLoan, "2027-01-01");
  assert.equal(sourceAfterLoan.squad.some((member) => member.id === player.id), true);
  assert.equal(destinationAfterLoan.squad.some((member) => member.id === player.id), false);
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


test("validates the expanded fictional world database and reports squad coverage separately from prospects", () => {
  const validation = validateWorldDatabase(WORLD_DATABASE);
  assert.equal(validation.valid, true, validation.errors.join(" | "));
  const summary = getWorldSummary(WORLD_DATABASE);
  assert.equal(summary.players, 48);
  assert.equal(summary.squadPlayers, 384);
  assert.equal(summary.rosterPlayers, 432);
  assert.equal(summary.clubs, 24);
});

test("generates deterministic home-and-away fixtures for all seeded competitions", () => {
  const first = generateSeasonFixtures(1, "2026-07-01");
  const second = generateSeasonFixtures(1, "2026-07-01");
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((fixture) => fixture.id)).size, first.length);
  const expected = WORLD_DATABASE.competitions.reduce((sum, competition) => {
    if (competition.type === "cup") return sum + competition.clubIds.length / 2;
    if (competition.type === "league") {
      const count = competition.clubIds.length;
      return sum + count * (count - 1);
    }
    return sum + buildCompetitionGroups(competition, WORLD_DATABASE).reduce((groupTotal, group) => {
      const count = group.clubIds.length;
      return groupTotal + count * (count - 1);
    }, 0);
  }, 0);
  assert.equal(first.length, expected);
  for (const fixture of first) {
    assert.equal(fixture.status, "scheduled");
    assert.equal(fixture.resultId, null);
    const competition = WORLD_DATABASE.competitions.find((item) => item.id === fixture.competitionId);
    if (competition.type === "continental") {
      const group = buildCompetitionGroups(competition, WORLD_DATABASE).find((item) => item.id === fixture.groupId);
      assert.ok(group, "continental fixture must reference a known group");
      assert.ok(group.clubIds.includes(fixture.homeClubId));
      assert.ok(group.clubIds.includes(fixture.awayClubId));
    } else {
      assert.equal(fixture.groupId, null);
    }
  }
});

test("plays a full continental group stage then semi-finals and a final exactly once", () => {
  const competition = WORLD_DATABASE.competitions.find((item) =>
    item.type === "continental" && item.knockoutAfterGroups === true
  );
  const database = { ...WORLD_DATABASE, competitions: [competition] };
  let football = createInitialFootballState(1, "2026-07-01", database);
  const initialGroupFixtures = football.fixtures.filter((fixture) =>
    fixture.competitionId === competition.id && fixture.groupId
  );
  assert.ok(initialGroupFixtures.length > 0);
  assert.equal(football.fixtures.some((fixture) =>
    fixture.competitionId === competition.id && !fixture.groupId
  ), false);

  const start = new Date("2026-07-01T00:00:00.000Z");
  const end = new Date("2026-10-31T00:00:00.000Z");
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const currentDate = cursor.toISOString().slice(0, 10);
    football = advanceFootballSeasonDay(football, currentDate, 1, database).football;
    const competitionFixtures = football.fixtures.filter((fixture) =>
      fixture.competitionId === competition.id
    );
    const knockoutFixtures = competitionFixtures.filter((fixture) => !fixture.groupId);
    if (knockoutFixtures.length === 3 && knockoutFixtures.every((fixture) => fixture.status === "played")) {
      break;
    }
  }

  const competitionFixtures = football.fixtures.filter((fixture) =>
    fixture.competitionId === competition.id
  );
  const knockoutFixtures = competitionFixtures.filter((fixture) => !fixture.groupId);
  const competitionResults = football.results.filter((result) =>
    result.competitionId === competition.id
  );
  assert.equal(knockoutFixtures.length, 3);
  assert.ok(knockoutFixtures.every((fixture) => fixture.status === "played"));
  assert.deepEqual([...new Set(knockoutFixtures.map((fixture) => fixture.round))].sort((a, b) => a - b),
    [Math.max(...initialGroupFixtures.map((fixture) => fixture.round)) + 1,
      Math.max(...initialGroupFixtures.map((fixture) => fixture.round)) + 2,
      Math.max(...initialGroupFixtures.map((fixture) => fixture.round)) + 2]);
  assert.ok(knockoutFixtures.every((fixture) =>
    competitionResults.find((result) => result.id === fixture.id)?.knockoutDecision?.winnerClubId
  ));
  assert.equal(new Set(knockoutFixtures.flatMap((fixture) => [
    fixture.homeClubId, fixture.awayClubId
  ])).size, 6);
  assert.equal(isValidFootballState(football, "2026-10-31", 1, database), true);
  const history = getCompetitionSeasonHistory(football, competition.id, database);
  assert.equal(history[0].complete, true);
  assert.ok(competition.clubIds.includes(history[0].championClubId));
});

test("calculates player of the season, golden boot and top assists from match records", () => {
  const competition = WORLD_DATABASE.competitions.find((item) => item.type === "league");
  const state = {
    season: 1,
    results: [
      {
        id: "award-match-1",
        competitionId: competition.id,
        season: 1,
        playerPerformances: [
          { playerId: "award-player-a", playerName: "مهاجم أ", clubId: competition.clubIds[0], minutesPlayed: 90, rating: 8.3, goals: 2, assists: 0, simulationOnly: false },
          { playerId: "award-player-b", playerName: "صانع ب", clubId: competition.clubIds[1], minutesPlayed: 90, rating: 8.7, goals: 0, assists: 2, simulationOnly: false },
          { playerId: "award-player-c", playerName: "لاعب محاكاة", clubId: competition.clubIds[0], minutesPlayed: 90, rating: 10, goals: 5, assists: 5, simulationOnly: true }
        ]
      },
      {
        id: "award-match-2",
        competitionId: competition.id,
        season: 1,
        playerPerformances: [
          { playerId: "award-player-a", playerName: "مهاجم أ", clubId: competition.clubIds[0], minutesPlayed: 80, rating: 8.5, goals: 1, assists: 0, simulationOnly: false },
          { playerId: "award-player-b", playerName: "صانع ب", clubId: competition.clubIds[1], minutesPlayed: 90, rating: 8.9, goals: 1, assists: 1, simulationOnly: false }
        ]
      },
      {
        id: "award-match-3",
        competitionId: competition.id,
        season: 1,
        playerPerformances: [
          { playerId: "award-player-a", playerName: "مهاجم أ", clubId: competition.clubIds[0], minutesPlayed: 75, rating: 8.2, goals: 0, assists: 0, simulationOnly: false },
          { playerId: "award-player-b", playerName: "صانع ب", clubId: competition.clubIds[1], minutesPlayed: 90, rating: 9.1, goals: 0, assists: 1, simulationOnly: false }
        ]
      }
    ]
  };

  const awards = getCompetitionSeasonAwards(state, competition.id, 1);
  assert.equal(awards.goldenBoot.playerId, "award-player-a");
  assert.equal(awards.goldenBoot.value, 3);
  assert.equal(awards.topAssists.playerId, "award-player-b");
  assert.equal(awards.topAssists.value, 4);
  assert.equal(awards.playerOfSeason.playerId, "award-player-b");
  assert.ok(awards.playerOfSeason.averageRating > awards.goldenBoot.averageRating);
});

test("generates and completes a seeded knockout cup with automatic rounds and a single champion", () => {
  const competition = WORLD_DATABASE.competitions.find((item) => item.type === "cup");
  const database = { ...WORLD_DATABASE, competitions: [competition] };
  let football = createInitialFootballState(1, "2026-07-01", database);
  const initialCupFixtures = football.fixtures.filter((fixture) => fixture.competitionId === competition.id);
  assert.equal(initialCupFixtures.length, 4);
  assert.equal(new Set(initialCupFixtures.flatMap((fixture) => [fixture.homeClubId, fixture.awayClubId])).size, 8);
  assert.ok(initialCupFixtures.every((fixture) => fixture.round === 1 && fixture.leg === 1));

  const start = new Date("2026-07-01T00:00:00.000Z");
  const end = new Date("2026-10-01T00:00:00.000Z");
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const currentDate = cursor.toISOString().slice(0, 10);
    football = advanceFootballSeasonDay(football, currentDate, 1, database).football;
    const cupFixtures = football.fixtures.filter((fixture) => fixture.competitionId === competition.id);
    if (cupFixtures.length === 7 && cupFixtures.every((fixture) => fixture.status === "played")) break;
  }

  const cupFixtures = football.fixtures.filter((fixture) => fixture.competitionId === competition.id);
  const cupResults = football.results.filter((result) => result.competitionId === competition.id);
  assert.equal(cupFixtures.length, 7);
  assert.equal(cupResults.length, 7);
  assert.ok(cupFixtures.every((fixture) => fixture.status === "played"));
  assert.deepEqual([...new Set(cupFixtures.map((fixture) => fixture.round))].sort(), [1, 2, 3]);
  assert.ok(cupResults.every((result) => result.knockoutDecision?.winnerClubId));
  assert.equal(isValidFootballState(football, "2026-10-01", 1, database), true);

  const history = getCompetitionSeasonHistory(football, competition.id, database);
  assert.equal(history.length, 1);
  assert.equal(history[0].complete, true);
  assert.ok(competition.clubIds.includes(history[0].championClubId));

  const archived = advanceFootballSeasonDay(football, "2027-07-01", 2, database).football;
  const savedCupArchive = archived.archives.find((archive) => archive.competitionId === competition.id);
  assert.equal(savedCupArchive.complete, true);
  assert.equal(savedCupArchive.championClubId, history[0].championClubId);
  assert.ok(savedCupArchive.awards);
  assert.ok(["playerOfSeason", "goldenBoot", "topAssists"]
    .every((awardKey) => Object.hasOwn(savedCupArchive.awards, awardKey)));
  assert.equal(isValidFootballState(archived, "2027-07-01", 2, database), true);

  const corrupted = {
    ...archived,
    results: archived.results.map((result) => result.competitionId === competition.id
      ? { ...result, knockoutDecision: { ...result.knockoutDecision, winnerClubId: "club-not-in-match" } }
      : result)
  };
  assert.equal(isValidFootballState(corrupted, "2027-07-01", 2, database), false);
});

test("keeps continental matches inside deterministic groups and exposes group-specific tables", () => {
  const competition = WORLD_DATABASE.competitions.find((item) => item.type === "continental");
  const groups = buildCompetitionGroups(competition, WORLD_DATABASE);
  const fixtures = generateSeasonFixtures(1, "2026-07-01")
    .filter((fixture) => fixture.competitionId === competition.id);

  for (const group of groups) {
    const groupFixtures = fixtures.filter((fixture) => fixture.groupId === group.id);
    const expectedMatches = group.clubIds.length * (group.clubIds.length - 1);
    assert.equal(groupFixtures.length, expectedMatches);
    const pairCounts = new Map();
    for (const fixture of groupFixtures) {
      const pair = [fixture.homeClubId, fixture.awayClubId].sort().join("|");
      pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
    }
    assert.equal(pairCounts.size, group.clubIds.length * (group.clubIds.length - 1) / 2);
    assert.ok([...pairCounts.values()].every((count) => count === 2));
  }

  const group = groups[0];
  const [homeClubId, awayClubId] = group.clubIds;
  const state = {
    season: 1,
    results: [{
      competitionId: competition.id,
      groupId: group.id,
      season: 1,
      home: { clubId: homeClubId, goals: 2 },
      away: { clubId: awayClubId, goals: 1 }
    }]
  };
  const table = getCompetitionStandings(state, competition.id, WORLD_DATABASE, 1, group.id);
  assert.equal(table.length, group.clubIds.length);
  assert.ok(table.every((row) => group.clubIds.includes(row.clubId)));
  assert.equal(table[0].clubId, homeClubId);
  assert.equal(getCompetitionStandings(state, competition.id, WORLD_DATABASE, 1, "missing-group").length, 0);
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

test("migrates older saves by assigning legacy continental matches to valid groups", () => {
  const initial = createInitialFootballState(1, "2026-07-01");
  const continental = WORLD_DATABASE.competitions.find((item) => item.type === "continental");
  const firstFixture = initial.fixtures.find((fixture) => fixture.competitionId === continental.id);
  const played = advanceFootballSeasonDay(initial, firstFixture.date, 1);
  const legacy = {
    ...played.football,
    fixtures: played.football.fixtures.map((fixture) => {
      if (fixture.competitionId !== continental.id) return fixture;
      const { groupId, groupName, ...oldFixture } = fixture;
      return oldFixture;
    }),
    results: played.football.results.map((result) => {
      if (result.competitionId !== continental.id) return result;
      const { groupId, groupName, ...oldResult } = result;
      return oldResult;
    })
  };
  delete legacy.archives;

  const nextDate = new Date(Date.parse(firstFixture.date + "T00:00:00.000Z") + 86400000)
    .toISOString().slice(0, 10);
  const migrated = advanceFootballSeasonDay(legacy, nextDate, 1).football;
  const migratedFixture = migrated.fixtures.find((fixture) => fixture.id === firstFixture.id);
  const migratedResult = migrated.results.find((result) => result.id === firstFixture.id);

  assert.ok(migratedFixture.groupId);
  assert.equal(migratedResult.groupId, migratedFixture.groupId);
  assert.equal(isValidFootballState(migrated, nextDate, 1), true);
  const table = getCompetitionStandings(migrated, continental.id, WORLD_DATABASE, 1, migratedFixture.groupId);
  assert.ok(table.some((row) => row.played > 0));
});

test("adds the new current-season cup once when loading a pre-cup save", () => {
  const initial = createInitialFootballState(1, "2026-07-01");
  const cup = WORLD_DATABASE.competitions.find((item) => item.type === "cup");
  const legacy = {
    ...initial,
    fixtures: initial.fixtures.filter((fixture) => fixture.competitionId !== cup.id)
  };
  delete legacy.archives;

  const migrated = advanceFootballSeasonDay(legacy, "2026-07-01", 1).football;
  const cupFixtures = migrated.fixtures.filter((fixture) =>
    fixture.competitionId === cup.id && fixture.season === 1
  );
  assert.equal(cupFixtures.length, 4);
  assert.ok(cupFixtures.every((fixture) => fixture.date > "2026-07-01"));
  assert.equal(isValidFootballState(migrated, "2026-07-01", 1), true);

  const replay = advanceFootballSeasonDay(migrated, "2026-07-02", 1).football;
  assert.equal(replay.fixtures.filter((fixture) =>
    fixture.competitionId === cup.id && fixture.season === 1
  ).length, 4);
});

test("archives competition tables once a new season starts and exposes retained season history", () => {
  const competition = WORLD_DATABASE.competitions.find((item) => item.id === "competition-eg-premier");
  const database = {
    ...WORLD_DATABASE,
    competitions: [competition]
  };
  let football = createInitialFootballState(1, "2026-07-01", database);
  const scheduledDates = [...new Set(football.fixtures.map((fixture) => fixture.date))].sort();
  for (const currentDate of scheduledDates) {
    football = advanceFootballSeasonDay(football, currentDate, 1, database).football;
  }

  const currentHistory = getCompetitionSeasonHistory(football, competition.id, database);
  assert.equal(currentHistory.length, 1);
  assert.equal(currentHistory[0].complete, true);
  assert.equal(currentHistory[0].matchesPlayed, currentHistory[0].matchesTotal);
  assert.equal(currentHistory[0].standings.length, 2);

  const nextSeason = advanceFootballSeasonDay(football, "2027-07-01", 2, database).football;
  assert.equal(nextSeason.archives.length, 1);
  assert.equal(nextSeason.archives[0].complete, true);
  assert.ok(nextSeason.archives[0].championClubId);
  assert.equal(isValidFootballState(nextSeason, "2027-07-01", 2, database), true);

  const history = getCompetitionSeasonHistory(nextSeason, competition.id, database);
  assert.equal(history.length, 2);
  assert.equal(history[0].season, 2);
  assert.equal(history[0].matchesPlayed, 0);
  assert.equal(history[0].matchesScheduled, 2);
  assert.equal(history[1].season, 1);
  assert.equal(history[1].complete, true);
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

  const cup = WORLD_DATABASE.competitions.find((competition) => competition.type === "cup");
  const badCupParticipant = {
    ...initial,
    fixtures: initial.fixtures.map((fixture) =>
      fixture.competitionId === cup.id
        ? { ...fixture, homeClubId: "club-marseille" }
        : fixture
    )
  };
  assert.equal(isValidFootballState(badCupParticipant, "2026-07-01", 1), false);
  assert.equal(isValidFootballState({ ...initial, results: [{ id: "missing" }] }, "2026-07-01", 1), false);
});

test("upcoming fixtures and recent results are stable and bounded", () => {
  const initial = createInitialFootballState(1, "2026-07-01");
  const upcoming = getUpcomingFootballFixtures(initial, "2026-07-01", 5);
  assert.equal(upcoming.length, 5);
  assert.ok(upcoming.every((fixture) => fixture.date > "2026-07-01"));
  assert.deepEqual(getRecentFootballResults(initial), []);
});



test("uses clearly marked emergency fillers only when every real player in a role is unavailable", () => {
  const club = WORLD_DATABASE.clubs[0];
  const withoutKeepers = {
    ...WORLD_DATABASE,
    players: WORLD_DATABASE.players.filter((player) => player.clubId !== club.id || player.role !== "حراسة"),
    squadPlayers: WORLD_DATABASE.squadPlayers.filter((player) => player.clubId !== club.id || player.role !== "حراسة")
  };
  const team = buildSimulationTeam(club.id, withoutKeepers);
  const keeper = team.lineup.find((player) => player.role === "حراسة");
  assert.equal(keeper.simulationOnly, true);
  assert.match(keeper.name, /لاعب محاكاة/);
  assert.equal(team.lineup.length, 11);
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

test("keeps a player out for the full injury day and restores eligibility on the following day", () => {
  const initial = createInitialFootballState(1, "2026-07-01");
  const fixture = initial.fixtures[0];
  const clubId = fixture.homeClubId;
  const starter = buildSimulationTeam(clubId).lineup.find((player) => player.simulationOnly !== true);
  assert.ok(starter, "fixture club must have a real starting player");

  const injuredState = {
    ...initial,
    playerDevelopment: {
      ...initial.playerDevelopment,
      players: initial.playerDevelopment.players.map((player) => player.playerId === starter.id
        ? { ...player, injuryDays: 1 }
        : player)
    }
  };
  const advanced = advanceFootballSeasonDay(injuredState, fixture.date, 1);
  const match = advanced.resultsToday.find((result) =>
    result.home.clubId === clubId || result.away.clubId === clubId
  );
  assert.ok(match);
  assert.equal(match.playerPerformances.some((player) => player.playerId === starter.id), false);
  assert.equal(advanced.football.playerDevelopment.players
    .find((player) => player.playerId === starter.id).injuryDays, 0);

  const nextTimestamp = Date.parse(fixture.date + "T00:00:00.000Z") + 86400000;
  const nextDate = new Date(nextTimestamp).toISOString().slice(0, 10);
  const nextTeam = buildSimulationTeam(
    clubId, WORLD_DATABASE, advanced.football.playerDevelopment, null, nextDate
  );
  assert.equal(nextTeam.squad.some((player) => player.id === starter.id), true);
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

test("applies competition-specific win, draw and loss points to standings", () => {
  const competition = WORLD_DATABASE.competitions.find((item) => item.type === "league");
  const customizedCompetition = {
    ...competition,
    points: { win: 5, draw: 2, loss: 1 },
    tieBreakers: ["goalsFor", "points", "clubId"]
  };
  const database = {
    ...WORLD_DATABASE,
    competitions: WORLD_DATABASE.competitions.map((item) =>
      item.id === competition.id ? customizedCompetition : item
    )
  };
  const [homeClubId, awayClubId] = competition.clubIds;
  const state = {
    season: 1,
    results: [
      {
        competitionId: competition.id,
        season: 1,
        home: { clubId: homeClubId, goals: 1 },
        away: { clubId: awayClubId, goals: 1 }
      },
      {
        competitionId: competition.id,
        season: 1,
        home: { clubId: homeClubId, goals: 3 },
        away: { clubId: awayClubId, goals: 0 }
      }
    ]
  };

  const table = getCompetitionStandings(state, competition.id, database, 1);
  assert.equal(table.length, 2);
  assert.equal(table.find((row) => row.clubId === homeClubId).points, 7);
  assert.equal(table.find((row) => row.clubId === awayClubId).points, 3);
});

test("simulates three complete seasons without duplicate fixtures, lost results or invalid player state", () => {
  const start = new Date("2026-07-01T00:00:00.000Z");
  const end = new Date("2029-07-01T00:00:00.000Z");
  let football = createInitialFootballState(1, "2026-07-01");
  const openingFixturesPerSeason = generateSeasonFixtures(1, "2026-07-01").length;
  const additionalKnockoutFixturesPerSeason = WORLD_DATABASE.competitions
    .filter((competition) => competition.type === "cup" || competition.knockoutAfterGroups === true)
    .reduce((total, competition) => total + (competition.type === "cup"
      ? competition.clubIds.length - 1 - competition.clubIds.length / 2
      : (competition.groupCount ?? 2) * (competition.qualifiersPerGroup ?? 2) - 1), 0);
  const expectedPerSeason = openingFixturesPerSeason + additionalKnockoutFixturesPerSeason;
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
