import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave, isValidSave } from "../src/core/storage.js";
import { advanceCareerDays } from "../src/engines/career-calendar.js";
import { getWorldPlayerProfiles } from "../src/data/world-database.js";
import {
  SCOUTING_MISSION_TYPES,
  SCOUTING_SOURCES,
  advanceScoutingMissions,
  createInitialScoutingState,
  getScoutingDaysRemaining,
  getPlayerScoutingHistory,
  getScoutingCandidates,
  getScoutingRoster,
  getScoutingScoutFit,
  SCOUTING_SCOUTS,
  startScoutingMission
} from "../src/engines/scouting.js";

const PLAYERS = getWorldPlayerProfiles();

test("creates a clean scouting state and defines transparent mission trade-offs", () => {
  const state = createInitialScoutingState();
  assert.equal(state.nextMissionSequence, 1);
  assert.deepEqual(state.activeMissions, []);
  assert.deepEqual(state.reports, []);
  assert.deepEqual(state.scouts.map((scout) => scout.id), SCOUTING_SCOUTS.map((scout) => scout.id));
  assert.equal(new Set(state.scouts.map((scout) => scout.id)).size, 4);
  assert.equal(SCOUTING_MISSION_TYPES.local.cost, 5000);
  assert.equal(SCOUTING_MISSION_TYPES.regional.durationDays, 14);
  assert.ok(SCOUTING_MISSION_TYPES.elite.accuracy > SCOUTING_MISSION_TYPES.local.accuracy);
});

test("filters candidates through distinct discovery channels without changing the world seed", () => {
  assert.equal(SCOUTING_SOURCES.length, 5);
  assert.equal(getScoutingCandidates(PLAYERS).length, 16);
  assert.equal(getScoutingCandidates(PLAYERS, { sourceId: "academy" }).length, 9);
  assert.equal(getScoutingCandidates(PLAYERS, { sourceId: "club-network" }).length, 7);
  assert.equal(getScoutingCandidates(PLAYERS, { sourceId: "youth-tournament" }).length, 9);
  assert.equal(getScoutingCandidates(PLAYERS, { sourceId: "agent-referral" }).length, 7);
  assert.deepEqual(
    getScoutingCandidates(PLAYERS, { countryId: "country-eg", role: "هجوم", sourceId: "academy" }).map((player) => player.id),
    ["demo-yassin-adel"]
  );
  assert.deepEqual(getScoutingCandidates(PLAYERS, { sourceId: "unknown-channel" }), []);
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
  assert.equal(startScoutingMission(save, { type: "local", sourceId: "unknown-channel" }, PLAYERS).changed, false);
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
  assert.equal(capped.save, activeSave);
  assert.ok(capped.error);
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


test("assigns a specialist, reserves that scout and applies transparent expertise bonuses", () => {
  const save = createInitialSave();
  const scouting = save.world.scouting;
  const fit = getScoutingScoutFit("scout-north-africa", scouting, "country-eg", "هجوم", 0.62);
  assert.ok(fit);
  assert.equal(fit.countryMatch, true);
  assert.equal(fit.roleMatch, true);
  assert.ok(fit.accuracy > 0.62);

  const started = startScoutingMission(save, {
    type: "local",
    countryId: "country-eg",
    role: "هجوم",
    scoutId: "scout-north-africa"
  }, PLAYERS);
  assert.equal(started.changed, true);
  assert.equal(started.mission.scoutId, "scout-north-africa");
  assert.equal(started.mission.scoutName, "عمر شريف");
  assert.equal(started.mission.accuracy, fit.accuracy);
  assert.equal(getScoutingRoster(started.save.world.scouting).find((scout) => scout.id === "scout-north-africa").isBusy, true);

  const unavailable = startScoutingMission(started.save, {
    type: "local",
    countryId: "country-eg",
    role: "هجوم",
    scoutId: "scout-north-africa"
  }, PLAYERS);
  assert.equal(unavailable.changed, false);
  assert.match(unavailable.error, /مرتبط ببعثة نشطة/);
  assert.equal(unavailable.save, started.save);

  const second = startScoutingMission(started.save, {
    type: "local",
    countryId: "country-eg",
    role: "هجوم",
    scoutId: "scout-western-europe"
  }, PLAYERS);
  assert.equal(second.changed, true);
  assert.equal(getScoutingRoster(second.save.world.scouting).filter((scout) => scout.isBusy).length, 2);
});

test("rewards scout experience once when a mission completes and keeps the save valid", () => {
  const save = createInitialSave();
  const started = startScoutingMission(save, {
    type: "regional",
    countryId: "country-eg",
    role: "all",
    scoutId: "scout-north-africa"
  }, PLAYERS);
  const before = started.save.world.scouting.scouts.find((scout) => scout.id === "scout-north-africa");
  const dueSave = advanceCareerDays(started.save, started.mission.durationDays);
  assert.equal(dueSave.world.currentDate, started.mission.dueDate);

  const completed = advanceScoutingMissions(dueSave, PLAYERS);
  const report = completed.completedReports[0];
  const after = completed.save.world.scouting.scouts.find((scout) => scout.id === "scout-north-africa");
  assert.equal(report.scoutId, "scout-north-africa");
  assert.equal(report.experienceAwarded, 32);
  assert.equal(after.experience, before.experience + 32);
  assert.equal(after.missionsCompleted, before.missionsCompleted + 1);
  assert.equal(isValidSave(completed.save), true);

  const repeated = advanceScoutingMissions(completed.save, PLAYERS);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.save.world.scouting.scouts.find((scout) => scout.id === "scout-north-africa").experience, after.experience);
});

test("stores repeat observations by stable player ID and preserves an auditable history", () => {
  const initial = createInitialSave();
  const first = startScoutingMission(initial, {
    type: "local",
    countryId: "country-eg",
    role: "هجوم",
    sourceId: "academy",
    scoutId: "scout-north-africa"
  }, PLAYERS);
  assert.equal(first.changed, true);
  assert.equal(first.mission.sourceLabel, "أكاديميات الشباب");
  assert.equal(first.mission.targetCount, 1);

  const firstDue = advanceCareerDays(first.save, first.mission.durationDays);
  const firstCompleted = advanceScoutingMissions(firstDue, PLAYERS);
  const playerId = "demo-yassin-adel";
  const firstHistory = getPlayerScoutingHistory(firstCompleted.save.world.scouting, playerId);
  assert.equal(firstHistory.totalObservations, 1);
  assert.equal(firstHistory.observations[0].sourceLabels[0], "أكاديميات الشباب");
  assert.equal(firstHistory.observations[0].ratingDelta, null);

  const second = startScoutingMission(firstCompleted.save, {
    type: "local",
    countryId: "country-eg",
    role: "هجوم",
    sourceId: "academy",
    scoutId: "scout-north-africa"
  }, PLAYERS);
  assert.equal(second.changed, true);
  const secondDue = advanceCareerDays(second.save, second.mission.durationDays);
  const secondCompleted = advanceScoutingMissions(secondDue, PLAYERS);
  const history = getPlayerScoutingHistory(secondCompleted.save.world.scouting, playerId);
  assert.equal(history.totalObservations, 2);
  assert.equal(history.firstObservedAt, first.mission.dueDate);
  assert.equal(history.lastObservedAt, second.mission.dueDate);
  assert.equal(history.observations[1].ratingDelta,
    history.observations[1].estimatedRating - history.observations[0].estimatedRating);
  assert.equal(history.observations[1].potentialDelta,
    history.observations[1].estimatedPotential - history.observations[0].estimatedPotential);
  assert.equal(new Set(secondCompleted.save.world.scouting.observations.map((item) => item.id)).size, 2);
  assert.equal(isValidSave(secondCompleted.save), true);

  const malformed = structuredClone(secondCompleted.save);
  malformed.world.scouting.observations[0].confidence = 100;
  assert.equal(isValidSave(malformed), false);

  const duplicate = structuredClone(secondCompleted.save);
  duplicate.world.scouting.observations[1] = { ...duplicate.world.scouting.observations[0] };
  assert.equal(isValidSave(duplicate), false);

  const overflow = structuredClone(secondCompleted.save);
  overflow.world.scouting.observations = Array.from({ length: 301 }, (_, index) => ({
    ...history.observations[0],
    id: "overflow-observation-" + index
  }));
  assert.equal(isValidSave(overflow), false);

  const repeated = advanceScoutingMissions(secondCompleted.save, PLAYERS);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.save.world.scouting.observations.length, 2);
});

test("accepts legacy schema-v3 scouting records without crew fields and rejects invalid crew progress", () => {
  const legacy = createInitialSave();
  delete legacy.world.scouting.scouts;
  delete legacy.world.scouting.observations;
  assert.equal(isValidSave(legacy), true);

  const started = startScoutingMission(legacy, {
    type: "local",
    countryId: "country-eg",
    role: "all"
  }, PLAYERS);
  const legacyMission = { ...started.mission };
  ["scoutId", "scoutName", "scoutLevel", "scoutAccuracyBonus", "baseAccuracy"].forEach((key) => delete legacyMission[key]);
  const legacyActiveSave = {
    ...started.save,
    world: {
      ...started.save.world,
      scouting: {
        ...started.save.world.scouting,
        scouts: undefined,
        activeMissions: [legacyMission]
      }
    }
  };
  assert.equal(isValidSave(legacyActiveSave), true);

  const malformed = JSON.parse(JSON.stringify(createInitialSave()));
  malformed.world.scouting.scouts[0].experience = -1;
  assert.equal(isValidSave(malformed), false);
});
