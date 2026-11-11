import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave } from "../src/core/storage.js";
import { getWorldPlayerProfiles } from "../src/data/world-database.js";
import {
  SCOUTING_MISSION_TYPES,
  advanceScoutingMissions,
  createInitialScoutingState,
  getScoutingDaysRemaining,
  startScoutingMission
} from "../src/engines/scouting.js";

const PLAYERS = getWorldPlayerProfiles();

test("creates a clean scouting state and defines transparent mission trade-offs", () => {
  assert.deepEqual(createInitialScoutingState(), {
    nextMissionSequence: 1,
    activeMissions: [],
    reports: []
  });
  assert.equal(SCOUTING_MISSION_TYPES.local.cost, 5000);
  assert.equal(SCOUTING_MISSION_TYPES.regional.durationDays, 14);
  assert.ok(SCOUTING_MISSION_TYPES.elite.accuracy > SCOUTING_MISSION_TYPES.local.accuracy);
});

test("starts a scoped mission, charges its exact cost and does not mutate the source save", () => {
  const save = createInitialSave();
  const result = startScoutingMission(save, {
    type: "local",
    countryId: "country-eg",
    role: "all"
  }, PLAYERS);

  assert.equal(result.changed, true);
  assert.equal(result.mission.startDate, "2026-07-01");
  assert.equal(result.mission.dueDate, "2026-07-08");
  assert.equal(result.mission.durationDays, 7);
  assert.equal(result.mission.targetCount, 2);
  assert.equal(result.save.agency.balance, 95000);
  assert.equal(save.agency.balance, 100000);
  assert.equal(result.save.world.scouting.activeMissions.length, 1);
  assert.equal(result.save.world.scouting.nextMissionSequence, 2);
});

test("rejects invalid scopes, empty targets, insufficient funds and excess active missions", () => {
  const save = createInitialSave();
  assert.equal(startScoutingMission(save, { type: "unknown" }, PLAYERS).changed, false);
  assert.match(
    startScoutingMission(save, { type: "local", countryId: "country-eg", role: "حراسة" }, PLAYERS).error,
    /مفيش لاعبين/
  );

  const poorSave = { ...save, agency: { ...save.agency, balance: 100 } };
  assert.match(
    startScoutingMission(poorSave, { type: "local", countryId: "all", role: "all" }, PLAYERS).error,
    /غير كافٍ/
  );

  let activeSave = save;
  for (let index = 0; index < 3; index += 1) {
    const result = startScoutingMission(activeSave, {
      type: "local",
      countryId: "all",
      role: "all"
    }, PLAYERS);
    assert.equal(result.changed, true);
    activeSave = result.save;
  }
  const capped = startScoutingMission(activeSave, { type: "local" }, PLAYERS);
  assert.equal(capped.changed, false);
  assert.match(capped.error, /الحد الأقصى/);
});

test("completes due missions into explainable reports only when their duration elapses", () => {
  const started = startScoutingMission(createInitialSave(), {
    type: "regional",
    countryId: "country-eg",
    role: "all"
  }, PLAYERS);
  assert.equal(getScoutingDaysRemaining(started.mission, "2026-07-01"), 14);

  const early = advanceScoutingMissions(started.save, PLAYERS, "2026-07-14");
  assert.equal(early.changed, false);
  assert.equal(early.save, started.save);

  const dueSave = {
    ...started.save,
    world: { ...started.save.world, currentDate: "2026-07-15" }
  };
  const completed = advanceScoutingMissions(dueSave, PLAYERS);
  assert.equal(completed.changed, true);
  assert.equal(completed.save.world.scouting.activeMissions.length, 0);
  assert.equal(completed.save.world.scouting.reports.length, 1);

  const report = completed.completedReports[0];
  assert.equal(report.completedDate, "2026-07-15");
  assert.equal(report.durationDays, 14);
  assert.equal(report.cost, SCOUTING_MISSION_TYPES.regional.cost);
  assert.equal(report.candidateCount, 2);
  assert.ok(report.findings.length > 0 && report.findings.length <= 6);
  for (const finding of report.findings) {
    assert.ok(finding.estimatedRating >= 1 && finding.estimatedRating <= 99);
    assert.ok(finding.estimatedPotential >= finding.estimatedRating && finding.estimatedPotential <= 99);
    assert.ok(finding.confidence >= 40 && finding.confidence <= 99);
    assert.ok(["أولوية", "متابعة", "مراقبة فقط"].includes(finding.recommendation));
    assert.ok(finding.rationale.length > 0);
  }
  assert.equal(getScoutingDaysRemaining(started.mission, "2026-07-16"), 0);
});

test("reports are deterministic for the same mission and world seed", () => {
  const started = startScoutingMission(createInitialSave(), {
    type: "elite",
    countryId: "all",
    role: "all"
  }, PLAYERS);
  const dueSave = {
    ...started.save,
    world: { ...started.save.world, currentDate: started.mission.dueDate }
  };
  const first = advanceScoutingMissions(dueSave, PLAYERS).completedReports[0];
  const second = advanceScoutingMissions(dueSave, PLAYERS).completedReports[0];
  assert.deepEqual(first, second);
});

test("rejects an invalid completion date rather than silently changing mission state", () => {
  assert.throws(() => advanceScoutingMissions(createInitialSave(), PLAYERS, "2026-02-30"), TypeError);
});
