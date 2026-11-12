import test from "node:test";
import assert from "node:assert/strict";
import { WORLD_DATABASE, validateWorldDatabase } from "../src/data/world-database.js";
import {
  COMPETITION_FORMATS,
  getCompetitionRules,
  validateCompetitionDefinition,
  buildCompetitionGroups
} from "../src/data/competition-rules.js";

test("resolves legacy local leagues as two-leg round-robin competitions", () => {
  const league = WORLD_DATABASE.competitions.find((item) => item.type === "league");
  const rules = getCompetitionRules(league);
  assert.equal(rules.format, COMPETITION_FORMATS.ROUND_ROBIN);
  assert.equal(rules.legs, 2);
  assert.deepEqual(rules.points, { win: 3, draw: 1, loss: 0 });
  assert.deepEqual(rules.tieBreakers, ["points", "goalDifference", "goalsFor", "clubId"]);
});

test("resolves legacy continental competitions as stable group-stage formats", () => {
  const continental = WORLD_DATABASE.competitions.find((item) => item.type === "continental");
  const first = buildCompetitionGroups(continental, WORLD_DATABASE);
  const second = buildCompetitionGroups(continental, WORLD_DATABASE);
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  assert.equal(first.flatMap((group) => group.clubIds).length, continental.clubIds.length);
  assert.equal(new Set(first.flatMap((group) => group.clubIds)).size, continental.clubIds.length);
  assert.ok(first.every((group) => group.clubIds.length >= 2));
  assert.equal(getCompetitionRules(continental).format, COMPETITION_FORMATS.GROUP_STAGE);
});

test("balances group sizes and seeded strength for every current continental competition", () => {
  const continental = WORLD_DATABASE.competitions.filter((item) => item.type === "continental");
  for (const competition of continental) {
    const groups = buildCompetitionGroups(competition, WORLD_DATABASE);
    const sizes = groups.map((group) => group.clubIds.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    const strengths = groups.map((group) => group.clubIds.reduce((total, id) => {
      return total + WORLD_DATABASE.clubs.find((club) => club.id === id).simulationProfile;
    }, 0) / group.clubIds.length);
    assert.ok(Math.max(...strengths) - Math.min(...strengths) <= 10);
  }
});

test("validates world competition definitions and rejects duplicate or unknown participants", () => {
  assert.equal(validateWorldDatabase(WORLD_DATABASE).valid, true);
  const base = WORLD_DATABASE.competitions.find((item) => item.type === "league");
  const duplicate = validateCompetitionDefinition({
    ...base,
    clubIds: [...base.clubIds, base.clubIds[0]]
  }, WORLD_DATABASE);
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.errors.some((message) => message.includes("مكرر")));

  const unknown = validateCompetitionDefinition({
    ...base,
    clubIds: [...base.clubIds.slice(0, 1), "club-not-found"]
  }, WORLD_DATABASE);
  assert.equal(unknown.valid, false);
  assert.ok(unknown.errors.some((message) => message.includes("غير موجود")));
});

test("rejects unsupported formats, invalid league points and impossible group counts", () => {
  const league = WORLD_DATABASE.competitions.find((item) => item.type === "league");
  assert.equal(validateCompetitionDefinition({ ...league, format: "group-stage" }, WORLD_DATABASE).valid, false);
  assert.equal(validateCompetitionDefinition({
    ...league,
    points: { win: 1, draw: 2, loss: 0 }
  }, WORLD_DATABASE).valid, false);

  const continental = WORLD_DATABASE.competitions.find((item) => item.type === "continental");
  const impossibleGroups = validateCompetitionDefinition({
    ...continental,
    groupCount: 20
  }, WORLD_DATABASE);
  assert.equal(impossibleGroups.valid, false);
  assert.ok(impossibleGroups.errors.some((message) => message.includes("عدد مجموعات")));
});
