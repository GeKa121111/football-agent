import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateRivalAgencyOffer,
  getRivalAgencyCommissionRate,
  getRivalAgencyStrategy,
  scoreRivalAgencyTarget
} from "../src/engines/rival-agency-ai.js";

const northStar = {
  id: "rival-north-star",
  reputation: 78,
  budgetEgp: 320000,
  acquisitionCostEgp: 9000,
  maxClients: 24,
  clients: []
};
const pioneer = {
  id: "rival-pioneer",
  reputation: 62,
  budgetEgp: 240000,
  acquisitionCostEgp: 7000,
  maxClients: 20,
  clients: []
};
const atlas = {
  id: "rival-atlas",
  reputation: 86,
  budgetEgp: 420000,
  acquisitionCostEgp: 14000,
  maxClients: 30,
  clients: []
};

test("rival agencies use distinct, explainable football strategies", () => {
  assert.notEqual(getRivalAgencyStrategy(northStar).key, getRivalAgencyStrategy(pioneer).key);
  assert.notEqual(getRivalAgencyStrategy(pioneer).key, getRivalAgencyStrategy(atlas).key);
  assert.match(getRivalAgencyStrategy(northStar).description, /المهاجمين/);
  assert.match(getRivalAgencyStrategy(pioneer).description, /الصغار/);
  assert.match(getRivalAgencyStrategy(atlas).description, /النخبة/);
});

test("the youth agency favours a young defensive prospect over the other rival strategies", () => {
  const prospect = { id: "young-defender", name: "Young Defender", age: 19, position: "CB", rating: 65, potential: 90 };
  const scores = [
    scoreRivalAgencyTarget(northStar, prospect).score,
    scoreRivalAgencyTarget(pioneer, prospect).score,
    scoreRivalAgencyTarget(atlas, prospect).score
  ];
  assert.ok(scores[1] > scores[0]);
  assert.ok(scores[1] > scores[2]);
  assert.equal(scoreRivalAgencyTarget(pioneer, prospect).eligible, true);
});

test("the elite agency gives more weight to a proven star and recorded media achievements", () => {
  const star = {
    id: "elite-star",
    name: "Elite Star",
    age: 27,
    position: "ST",
    rating: 90,
    potential: 92,
    seasonPerformance: { appearances: 14, averageMatchRating: 8.2 },
    honors: [{ competitionId: "league-one", season: 1, awardType: "bestPlayer", competitionName: "الدوري الأول" }],
    internationalFriendlyStats: { appearances: 18 }
  };
  const scores = [
    scoreRivalAgencyTarget(northStar, star).score,
    scoreRivalAgencyTarget(pioneer, star).score,
    scoreRivalAgencyTarget(atlas, star).score
  ];
  assert.ok(scores[2] > scores[0]);
  assert.ok(scores[2] > scores[1]);
  assert.equal(scoreRivalAgencyTarget(atlas, star).eligible, true);
});

test("rival target scores are deterministic and reject invalid player data", () => {
  const player = { id: "steady-midfielder", age: 24, position: "CM", rating: 71, potential: 76 };
  assert.deepEqual(scoreRivalAgencyTarget(northStar, player), scoreRivalAgencyTarget(northStar, player));
  const invalid = scoreRivalAgencyTarget(northStar, { id: "broken", rating: "75", potential: 90 });
  assert.equal(invalid.eligible, false);
  assert.equal(invalid.score, 0);
});

test("commission offers reflect agency positioning without leaving valid contract bounds", () => {
  const youth = { age: 19, rating: 68, potential: 86 };
  const elite = { age: 27, rating: 90, potential: 92 };
  assert.ok(getRivalAgencyCommissionRate(pioneer, youth) < getRivalAgencyCommissionRate(northStar, youth));
  assert.ok(getRivalAgencyCommissionRate(atlas, elite) < getRivalAgencyCommissionRate(northStar, elite));
  for (const agency of [northStar, pioneer, atlas]) {
    assert.ok(getRivalAgencyCommissionRate(agency, elite) >= 5);
    assert.ok(getRivalAgencyCommissionRate(agency, elite) <= 15);
  }
});

test("offer decisions account for player protection, legal staff, budget and client capacity", () => {
  const offer = { rating: 57, potential: 57, commissionRate: 10 };
  const accepted = evaluateRivalAgencyOffer(northStar, offer);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.score, 135);

  const protectedByLegal = evaluateRivalAgencyOffer(northStar, offer, { legalProtectionBonus: 6 });
  assert.equal(protectedByLegal.accepted, false);
  assert.equal(protectedByLegal.reason, "below-threshold");

  const protectedByPlayerInterest = evaluateRivalAgencyOffer(northStar, offer, { userHasTakenInterest: true });
  assert.equal(protectedByPlayerInterest.reason, "player-protected");

  const broke = evaluateRivalAgencyOffer({ ...northStar, budgetEgp: 0 }, offer);
  assert.equal(broke.reason, "budget");

  const full = evaluateRivalAgencyOffer({ ...northStar, clients: Array.from({ length: 24 }, () => ({})) }, offer);
  assert.equal(full.reason, "capacity");
});
