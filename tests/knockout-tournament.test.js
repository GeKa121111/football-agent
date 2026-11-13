import test from "node:test";
import assert from "node:assert/strict";
import { WORLD_DATABASE } from "../src/data/world-database.js";
import { buildCompetitionGroups } from "../src/data/competition-rules.js";
import { generateSeasonFixtures } from "../src/engines/football-season.js";
import {
  buildKnockoutOpeningPairings,
  buildGroupStageSemifinalFixtures,
  resolveKnockoutOutcome,
  advanceKnockoutRound
} from "../src/engines/knockout-tournament.js";

const cup = WORLD_DATABASE.competitions.find((competition) => competition.type === "cup");

test("builds a deterministic seeded opening draw with every participant exactly once", () => {
  const first = buildKnockoutOpeningPairings(cup, WORLD_DATABASE);
  const second = buildKnockoutOpeningPairings(cup, WORLD_DATABASE);
  const participants = first.flatMap((pairing) => [pairing.homeClubId, pairing.awayClubId]);

  assert.deepEqual(first, second);
  assert.equal(first.length, 4);
  assert.equal(new Set(participants).size, cup.clubIds.length);
  assert.deepEqual(new Set(participants), new Set(cup.clubIds));
});

test("resolves a level knockout match through extra time or penalties deterministically", () => {
  const fixture = {
    id: "cup-test-final-2026",
    date: "2026-08-01",
    homeClubId: cup.clubIds[0],
    awayClubId: cup.clubIds[1]
  };
  const result = {
    home: { goals: 1 },
    away: { goals: 1 },
    playerPerformances: [
      ...Array.from({ length: 11 }, (_, index) => ({
        clubId: fixture.homeClubId,
        rating: 7.2 + (index % 3) / 10
      })),
      ...Array.from({ length: 11 }, (_, index) => ({
        clubId: fixture.awayClubId,
        rating: 6.8 + (index % 3) / 10
      }))
    ]
  };
  const first = resolveKnockoutOutcome(result, fixture);
  const second = resolveKnockoutOutcome(result, fixture);

  assert.deepEqual(first, second);
  assert.ok(["extra-time", "penalties"].includes(first.decidedBy));
  assert.ok([fixture.homeClubId, fixture.awayClubId].includes(first.winnerClubId));
  assert.ok(first.extraTime);
  if (first.decidedBy === "penalties") {
    assert.ok(first.penalties.home !== first.penalties.away);
    assert.equal(first.penalties.home, first.penalties.homeKicks.filter(Boolean).length);
    assert.equal(first.penalties.away, first.penalties.awayKicks.filter(Boolean).length);
  }
});

test("does not advance a knockout round until every match is complete", () => {
  const pairings = buildKnockoutOpeningPairings(cup, WORLD_DATABASE);
  const fixtures = pairings.map((pairing, index) => ({
    id: "cup-round-one-" + index,
    season: 1,
    competitionId: cup.id,
    date: "2026-07-04",
    round: 1,
    homeClubId: pairing.homeClubId,
    awayClubId: pairing.awayClubId,
    status: index === 0 ? "played" : "scheduled"
  }));
  const results = [{
    id: fixtures[0].id,
    knockoutDecision: { winnerClubId: fixtures[0].homeClubId }
  }];

  const progression = advanceKnockoutRound(cup, 1, fixtures, results, WORLD_DATABASE);
  assert.equal(progression.advanced, false);
  assert.equal(progression.fixtures.length, 0);
});

test("creates one next-round fixture per pair of unique winners after a completed round", () => {
  const pairings = buildKnockoutOpeningPairings(cup, WORLD_DATABASE);
  const fixtures = pairings.map((pairing, index) => ({
    id: "cup-completed-round-one-" + index,
    season: 1,
    competitionId: cup.id,
    competitionName: cup.nameAr,
    date: "2026-07-04",
    round: 1,
    leg: 1,
    homeClubId: pairing.homeClubId,
    awayClubId: pairing.awayClubId,
    status: "played"
  }));
  const results = fixtures.map((fixture) => ({
    id: fixture.id,
    knockoutDecision: { winnerClubId: fixture.homeClubId }
  }));
  const progression = advanceKnockoutRound(cup, 1, fixtures, results, WORLD_DATABASE);

  assert.equal(progression.advanced, true);
  assert.equal(progression.championClubId, null);
  assert.equal(progression.fixtures.length, 2);
  assert.ok(progression.fixtures.every((fixture) =>
    fixture.round === 2 && fixture.status === "scheduled" && fixture.date > "2026-07-04"
  ));
  const advancingClubs = progression.fixtures.flatMap((fixture) => [
    fixture.homeClubId, fixture.awayClubId
  ]);
  assert.equal(new Set(advancingClubs).size, 4);
});


test("qualifies the first and second of each completed continental group into cross-group semi-finals exactly once", () => {
  const competition = WORLD_DATABASE.competitions.find((item) =>
    item.id === "competition-conmebol-libertadores"
  );
  const database = { ...WORLD_DATABASE, competitions: [competition] };
  const groups = buildCompetitionGroups(competition, database);
  const groupFixtures = generateSeasonFixtures(1, "2026-07-01", database)
    .filter((fixture) => fixture.competitionId === competition.id);
  const plannedTop = groups.map((group) => group.clubIds[0]);
  const playedFixtures = groupFixtures.map((fixture) => ({ ...fixture, status: "played" }));
  const results = playedFixtures.map((fixture) => {
    const groupIndex = groups.findIndex((group) => group.id === fixture.groupId);
    const topClubId = plannedTop[groupIndex];
    const topAtHome = fixture.homeClubId === topClubId;
    return {
      id: fixture.id,
      competitionId: competition.id,
      season: 1,
      groupId: fixture.groupId,
      home: { clubId: fixture.homeClubId, goals: topAtHome ? 3 : 0 },
      away: { clubId: fixture.awayClubId, goals: topAtHome ? 0 : 3 }
    };
  });

  const incomplete = [...playedFixtures];
  incomplete[0] = { ...incomplete[0], status: "scheduled" };
  assert.deepEqual(
    buildGroupStageSemifinalFixtures(competition, 1, incomplete, results, database),
    []
  );

  const semifinals = buildGroupStageSemifinalFixtures(
    competition, 1, playedFixtures, results, database
  );
  assert.equal(semifinals.length, 2);
  assert.ok(semifinals.every((fixture) =>
    fixture.stage === "knockout" &&
    fixture.phase === "semi-final" &&
    fixture.phaseNameAr === "نصف النهائي" &&
    fixture.status === "scheduled"
  ));
  assert.deepEqual(
    semifinals.map((fixture) => [fixture.homeClubId, fixture.awayClubId]),
    [
      [groups[0].clubIds[0], groups[1].clubIds[1]],
      [groups[1].clubIds[0], groups[0].clubIds[1]]
    ]
  );

  const initialProgression = advanceKnockoutRound(
    competition, 1, playedFixtures, results, database
  );
  assert.deepEqual(initialProgression.fixtures, semifinals);
  const replay = advanceKnockoutRound(
    competition, 1, [...playedFixtures, ...semifinals], results, database
  );
  assert.equal(replay.advanced, false);
  assert.deepEqual(replay.fixtures, []);

  const completedSemifinals = semifinals.map((fixture) => ({
    ...fixture,
    status: "played"
  }));
  const semifinalResults = completedSemifinals.map((fixture) => ({
    id: fixture.id,
    knockoutDecision: { winnerClubId: fixture.homeClubId }
  }));
  const finalProgression = advanceKnockoutRound(
    competition,
    1,
    [...playedFixtures, ...completedSemifinals],
    [...results, ...semifinalResults],
    database
  );
  assert.equal(finalProgression.fixtures.length, 1);
  assert.equal(finalProgression.fixtures[0].phase, "final");
  assert.equal(finalProgression.fixtures[0].phaseNameAr, "النهائي");
  assert.equal(
    new Set([
      finalProgression.fixtures[0].homeClubId,
      finalProgression.fixtures[0].awayClubId
    ]).size,
    2
  );

  const finalFixture = { ...finalProgression.fixtures[0], status: "played" };
  const champion = advanceKnockoutRound(
    competition,
    1,
    [...playedFixtures, ...completedSemifinals, finalFixture],
    [...results, ...semifinalResults, {
      id: finalFixture.id,
      knockoutDecision: { winnerClubId: finalFixture.homeClubId }
    }],
    database
  );
  assert.equal(champion.championClubId, finalFixture.homeClubId);
  assert.equal(champion.fixtures.length, 0);
});
