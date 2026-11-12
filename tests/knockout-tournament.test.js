import test from "node:test";
import assert from "node:assert/strict";
import { WORLD_DATABASE } from "../src/data/world-database.js";
import {
  buildKnockoutOpeningPairings,
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
