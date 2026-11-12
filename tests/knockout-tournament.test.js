import test from "node:test";
import assert from "node:assert/strict";
import { WORLD_DATABASE } from "../src/data/world-database.js";
import { buildCompetitionGroups } from "../src/data/competition-rules.js";
import { getCompetitionStandings } from "../src/engines/football-season.js";
import {
  buildKnockoutOpeningPairings,
  resolveKnockoutOutcome,
  advanceKnockoutRound
} from "../src/engines/knockout-tournament.js";

const cup = WORLD_DATABASE.competitions.find((competition) => competition.type === "cup");

const continental = WORLD_DATABASE.competitions.find((competition) =>
  competition.type === "continental" && competition.knockoutAfterGroups === true
);

function createCompletedContinentalGroupStage(competition) {
  const database = {
    ...WORLD_DATABASE,
    competitions: [competition]
  };
  const groups = buildCompetitionGroups(competition, database);
  const fixtures = [];
  const results = [];
  const clubById = new Map(database.clubs.map((club) => [club.id, club]));

  groups.forEach((group) => {
    for (let homeIndex = 0; homeIndex < group.clubIds.length; homeIndex += 1) {
      for (let awayIndex = homeIndex + 1; awayIndex < group.clubIds.length; awayIndex += 1) {
        const homeClubId = group.clubIds[homeIndex];
        const awayClubId = group.clubIds[awayIndex];
        const homeWins = clubById.get(homeClubId).simulationProfile >=
          clubById.get(awayClubId).simulationProfile;
        const fixture = {
          id: "continental-group-" + group.id + "-" + homeClubId + "-" + awayClubId,
          season: 1,
          competitionId: competition.id,
          competitionName: competition.nameAr,
          groupId: group.id,
          groupName: group.nameAr,
          date: "2026-08-01",
          round: 1,
          leg: 1,
          homeClubId,
          awayClubId,
          status: "played",
          resultId: null
        };
        fixtures.push(fixture);
        results.push({
          id: fixture.id,
          season: 1,
          competitionId: competition.id,
          round: fixture.round,
          leg: fixture.leg,
          status: "played",
          date: fixture.date,
          home: { clubId: homeClubId, goals: homeWins ? 2 : 0 },
          away: { clubId: awayClubId, goals: homeWins ? 0 : 2 },
          playerPerformances: []
        });
      }
    }
  });

  return { database, groups, fixtures, results, clubById };
}

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

test("qualifies the top two clubs from each continental group into a semi-final bracket", () => {
  const { database, groups, fixtures, results } = createCompletedContinentalGroupStage(continental);
  const groupStandings = groups.map((group) =>
    getCompetitionStandings({ season: 1, results }, continental.id, database, 1, group.id)
  );
  const progression = advanceKnockoutRound(
    continental, 1, fixtures, results, database
  );

  assert.equal(progression.advanced, true);
  assert.equal(progression.championClubId, null);
  assert.equal(progression.fixtures.length, 2);
  assert.ok(progression.fixtures.every((fixture) =>
    fixture.groupId === null && fixture.round === 2 && fixture.status === "scheduled"
  ));
  assert.deepEqual(
    [progression.fixtures[0].homeClubId, progression.fixtures[0].awayClubId],
    [groupStandings[0][0].clubId, groupStandings[1][1].clubId]
  );
  assert.deepEqual(
    [progression.fixtures[1].homeClubId, progression.fixtures[1].awayClubId],
    [groupStandings[1][0].clubId, groupStandings[0][1].clubId]
  );
  assert.equal(new Set(progression.fixtures.flatMap((fixture) => [
    fixture.homeClubId, fixture.awayClubId
  ])).size, 4);
});

test("continental bracket waits for the entire group stage and crowns the final winner", () => {
  const { database, fixtures, results } = createCompletedContinentalGroupStage(continental);
  const pending = advanceKnockoutRound(
    continental,
    1,
    fixtures.map((fixture, index) => index === 0 ? { ...fixture, status: "scheduled" } : fixture),
    results,
    database
  );
  assert.equal(pending.advanced, false);
  assert.equal(pending.fixtures.length, 0);

  const semiFinals = advanceKnockoutRound(continental, 1, fixtures, results, database).fixtures;
  const semiFixtures = semiFinals.map((fixture) => ({ ...fixture, status: "played" }));
  const semiResults = semiFixtures.map((fixture) => ({
    id: fixture.id,
    knockoutDecision: { winnerClubId: fixture.homeClubId }
  }));
  const finalProgression = advanceKnockoutRound(
    continental,
    1,
    [...fixtures, ...semiFixtures],
    [...results, ...semiResults],
    database
  );
  assert.equal(finalProgression.fixtures.length, 1);
  assert.equal(finalProgression.fixtures[0].round, 3);

  const finalFixture = { ...finalProgression.fixtures[0], status: "played" };
  const finalResult = {
    id: finalFixture.id,
    knockoutDecision: { winnerClubId: finalFixture.awayClubId }
  };
  const champion = advanceKnockoutRound(
    continental,
    1,
    [...fixtures, ...semiFixtures, finalFixture],
    [...results, ...semiResults, finalResult],
    database
  );
  assert.equal(champion.advanced, true);
  assert.equal(champion.championClubId, finalFixture.awayClubId);
  assert.deepEqual(champion.fixtures, []);
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
