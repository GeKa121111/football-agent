import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave, isValidSave } from "../src/core/storage.js";
import { advanceCareerDay, advanceCareerDays } from "../src/engines/career-calendar.js";
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
  getScoutingRecruitmentOptions,
  getScoutingScoutFit,
  renewScoutingContract,
  signScoutingContract,
  SCOUTING_SCOUTS,
  startScoutingMission
} from "../src/engines/scouting.js";

const PLAYERS = getWorldPlayerProfiles();

test("creates a clean scouting state and defines transparent mission trade-offs", () => {
  const state = createInitialScoutingState();
  assert.equal(state.nextMissionSequence, 1);
  assert.deepEqual(state.activeMissions, []);
  assert.deepEqual(state.reports, []);
  assert.equal(state.scouts.length, 4);
  assert.equal(new Set(state.scouts.map((scout) => scout.id)).size, 4);
  assert.equal(SCOUTING_SCOUTS.length, 6);
  assert.equal(getScoutingRoster(state).length, 4);
  assert.equal(getScoutingRecruitmentOptions(state).length, 2);
  assert.equal(SCOUTING_MISSION_TYPES.local.cost, 5000);
  assert.equal(SCOUTING_MISSION_TYPES.regional.durationDays, 14);
  assert.ok(SCOUTING_MISSION_TYPES.elite.accuracy > SCOUTING_MISSION_TYPES.local.accuracy);
});

test("filters candidates through distinct discovery channels without changing the world seed", () => {
  assert.equal(SCOUTING_SOURCES.length, 5);
  assert.equal(getScoutingCandidates(PLAYERS).length, 48);
  assert.equal(getScoutingCandidates(PLAYERS, { sourceId: "academy" }).length, 25);
  assert.equal(getScoutingCandidates(PLAYERS, { sourceId: "club-network" }).length, 23);
  assert.equal(getScoutingCandidates(PLAYERS, { sourceId: "youth-tournament" }).length, 25);
  assert.equal(getScoutingCandidates(PLAYERS, { sourceId: "agent-referral" }).length, 23);
  assert.deepEqual(
    getScoutingCandidates(PLAYERS, { countryId: "country-eg", role: "هجوم", sourceId: "academy" }).map((player) => player.id),
    ["demo-yassin-adel"]
  );
  assert.deepEqual(getScoutingCandidates(PLAYERS, { sourceId: "unknown-channel" }), []);
});


test("can launch a valid scouting scope for every country and general role", () => {
  const countries = ["country-eg", "country-ma", "country-tn", "country-gb", "country-es", "country-de", "country-fr", "country-it", "country-nl", "country-pt", "country-br", "country-ar"];
  const roles = ["هجوم", "وسط", "دفاع", "حراسة"];

  for (const countryId of countries) {
    for (const role of roles) {
      const candidates = getScoutingCandidates(PLAYERS, { countryId, role });
      assert.equal(candidates.length, 1, countryId + " / " + role);
      const started = startScoutingMission(createInitialSave(), {
        type: "local", countryId, role
      }, PLAYERS);
      assert.equal(started.changed, true, countryId + " / " + role + ": " + started.error);
      assert.equal(started.mission.targetCount, 1);
      assert.equal(started.mission.countryId, countryId);
      assert.equal(started.mission.role, role);
    }
  }
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
  assert.equal(result.mission.targetCount, 4);
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
    startScoutingMission(save, { type: "local", countryId: "country-eg", role: "دفاع", sourceId: "academy" }, PLAYERS).error,
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
  assert.equal(report.candidateCount, 4);
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

test("rejects partial explicit scout rosters without silently recreating permanent staff", () => {
  const complete = createInitialSave();
  const partial = structuredClone(complete);
  partial.world.scouting.scouts = partial.world.scouting.scouts.filter((scout) => scout.id !== "scout-north-africa");

  assert.equal(isValidSave(partial), false);
  const visibleRoster = getScoutingRoster(partial.world.scouting);
  assert.equal(visibleRoster.length, 3);
  assert.equal(visibleRoster.some((scout) => scout.id === "scout-north-africa"), false);

  const rejectedMission = startScoutingMission(partial, {
    type: "local", countryId: "all", role: "all"
  }, PLAYERS);
  assert.equal(rejectedMission.changed, false);
  assert.match(rejectedMission.error, /سجل الكشافين غير صالح/);

  const legacy = structuredClone(complete);
  delete legacy.world.scouting.scouts;
  assert.equal(isValidSave(legacy), true);
  assert.equal(getScoutingRoster(legacy.world.scouting).length, 4);
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


test("signs a paid annual contract, prevents duplicate hires and limits renewal to the final 30 days", () => {
  const initial = createInitialSave();
  const recruit = getScoutingRecruitmentOptions(initial.world.scouting).find((candidate) => candidate.id === "scout-iberian-network");
  assert.ok(recruit); assert.equal(recruit.contractCost, 18000); assert.equal(recruit.contractDays, 365);
  const signed = signScoutingContract(initial, recruit.id);
  assert.equal(signed.changed, true); assert.equal(signed.fee, 18000); assert.equal(signed.contractExpiresOn, "2027-07-01");
  assert.equal(signed.save.agency.balance, 82000); assert.equal(getScoutingRoster(signed.save.world.scouting, signed.save.world.currentDate).length, 5);
  assert.equal(getScoutingRecruitmentOptions(signed.save.world.scouting).length, 1); assert.equal(isValidSave(signed.save), true);
  const duplicate = signScoutingContract(signed.save, recruit.id); assert.equal(duplicate.changed, false); assert.equal(duplicate.save, signed.save);
  assert.match(duplicate.error, /متعاقد معه بالفعل/);
  const tooEarly = renewScoutingContract(signed.save, recruit.id); assert.equal(tooEarly.changed, false); assert.equal(tooEarly.save, signed.save);
  assert.match(tooEarly.error, /آخر 30 يومًا/);
  const poor = { ...initial, agency: { ...initial.agency, balance: 100 } };
  const rejected = signScoutingContract(poor, recruit.id); assert.equal(rejected.changed, false); assert.equal(rejected.save, poor);
  assert.match(rejected.error, /لا يكفي/);
});

test("treats the contract expiry date as inactive for new assignments and allows renewal", () => {
  const initial = createInitialSave();
  const signed = signScoutingContract(initial, "scout-iberian-network");
  assert.equal(signed.changed, true);

  let expiryDay = signed.save;
  for (let elapsed = 0; elapsed < 365;) {
    const step = Math.min(31, 365 - elapsed);
    expiryDay = advanceCareerDays(expiryDay, step);
    elapsed += step;
  }
  assert.equal(expiryDay.world.currentDate, "2027-07-01");
  const scout = getScoutingRoster(expiryDay.world.scouting, expiryDay.world.currentDate)
    .find((item) => item.id === "scout-iberian-network");
  assert.equal(scout.isContractExpired, true);
  assert.equal(scout.contractDaysRemaining, 0);
  assert.equal(scout.canRenewContract, true);
  assert.equal(getScoutingScoutFit("scout-iberian-network", expiryDay.world.scouting, "all", "all", 0.62, expiryDay.world.currentDate), null);

  const rejected = startScoutingMission(expiryDay, {
    type: "local", countryId: "all", role: "all", scoutId: "scout-iberian-network"
  }, PLAYERS);
  assert.equal(rejected.changed, false);
  assert.match(rejected.error, /انتهى عقد الكشاف/);

  const renewed = renewScoutingContract(expiryDay, "scout-iberian-network");
  assert.equal(renewed.changed, true);
  assert.equal(renewed.contractExpiresOn, "2028-06-30");
  assert.equal(renewed.save.agency.balance, 74000);
  assert.equal(isValidSave(renewed.save), true);
});

test("allows a mission started before contract expiry to finish after the contract expires", () => {
  const initial = createInitialSave(); const signed = signScoutingContract(initial, "scout-iberian-network");
  const nearExpiry = { ...signed.save, world: { ...signed.save.world, currentDate: "2027-06-30" } };
  const started = startScoutingMission(nearExpiry, { type: "local", countryId: "all", role: "all", scoutId: "scout-iberian-network" }, PLAYERS);
  assert.equal(started.changed, true);
  const due = advanceCareerDays(started.save, 7); assert.equal(due.world.currentDate, "2027-07-07");
  const completed = advanceScoutingMissions(due, PLAYERS); assert.equal(completed.changed, true);
  assert.equal(completed.completedReports[0].scoutId, "scout-iberian-network"); assert.equal(completed.save.world.scouting.reports.length, 1);
  assert.equal(isValidSave(completed.save), true);
  assert.equal(getScoutingRoster(completed.save.world.scouting, due.world.currentDate).find((scout) => scout.id === "scout-iberian-network").isContractExpired, true);
});

test("simulates scouting contracts and paid missions across two season boundaries without overspending", () => {
  let save = createInitialSave(); const hired = signScoutingContract(save, "scout-iberian-network"); assert.equal(hired.changed, true); save = hired.save;
  const schedule = new Map([[0,"local"],[100,"regional"],[200,"local"],[300,"elite"],[400,"local"],[500,"regional"],[600,"local"]]);
  let completedReportCount = 0; const completedReports = []; let lowestObservedBalance = save.agency.balance;
  assert.equal(PLAYERS.length, 48, "long-run balance test must use the expanded 48-player pool");
  for (let day = 0; day < 732; day += 1) {
    if (day === 340) { const renewal = renewScoutingContract(save, "scout-iberian-network"); assert.equal(renewal.changed, true); assert.equal(renewal.fee, 8000); save = renewal.save; }
    const missionType = schedule.get(day);
    if (missionType) { const started = startScoutingMission(save, { type: missionType, countryId: "all", role: "all", scoutId: "scout-iberian-network" }, PLAYERS); assert.equal(started.changed, true, started.error); save = started.save; lowestObservedBalance = Math.min(lowestObservedBalance, save.agency.balance); }
    save = advanceCareerDay(save); const result = advanceScoutingMissions(save, PLAYERS); save = result.save;
    completedReportCount += result.completedReports.length; completedReports.push(...result.completedReports); lowestObservedBalance = Math.min(lowestObservedBalance, save.agency.balance); assert.ok(save.agency.balance >= 0);
  }
  assert.equal(completedReportCount, 7); assert.equal(completedReports.length, 7); assert.equal(save.career.season, 3); assert.equal(save.world.currentDate, "2028-07-02");
  assert.ok(completedReports.every((report) => report.candidateCount === PLAYERS.length), "each long-run report must cover all 48 players");
  assert.ok(completedReports.every((report) => report.findings.length === 6), "each report must retain the six best findings");
  assert.equal(save.agency.balance, 5000); assert.equal(lowestObservedBalance, 5000); assert.equal(save.world.scouting.reports.length, 7);
  assert.equal(save.world.scouting.observations.length, 42, "seven reports should retain six player observations each"); assert.equal(isValidSave(save), true);
  const staff = getScoutingRoster(save.world.scouting, save.world.currentDate).find((scout) => scout.id === "scout-iberian-network"); assert.equal(staff.isContractExpired, true);
  const rejected = startScoutingMission(save, { type: "local", countryId: "all", role: "all", scoutId: "scout-iberian-network" }, PLAYERS);
  assert.equal(rejected.changed, false); assert.match(rejected.error, /انتهى عقد الكشاف/);
});


test("balances paid scouting across countries, roles, discovery channels and all mission tiers", () => {
  const scenarios = [
    { type: "local", countryId: "country-eg", role: "هجوم", sourceId: "academy", playerIds: ["demo-yassin-adel"] },
    { type: "regional", countryId: "country-gb", role: "دفاع", sourceId: "club-network", playerIds: ["seed-noah-bennett"] },
    { type: "elite", countryId: "country-fr", role: "دفاع", sourceId: "agent-referral", playerIds: ["seed-lucas-moreau"] },
    { type: "local", countryId: "country-es", role: "هجوم", sourceId: "youth-tournament", playerIds: ["seed-es-madrid-forward"] },
    { type: "regional", countryId: "country-de", role: "all", sourceId: "club-network", playerIds: ["seed-leon-fischer", "seed-de-dortmund-striker"] }
  ];

  let save = createInitialSave();
  let expectedTotalCost = 0;
  let totalObservations = 0;

  for (const scenario of scenarios) {
    const config = SCOUTING_MISSION_TYPES[scenario.type];
    const balanceBefore = save.agency.balance;
    const started = startScoutingMission(save, scenario, PLAYERS);

    assert.equal(started.changed, true, scenario.countryId + " / " + scenario.role + " / " + scenario.sourceId + ": " + started.error);
    assert.equal(started.mission.countryId, scenario.countryId);
    assert.equal(started.mission.role, scenario.role);
    assert.equal(started.mission.sourceId, scenario.sourceId);
    assert.equal(started.mission.targetCount, scenario.playerIds.length);
    assert.equal(started.mission.cost, config.cost);
    assert.equal(started.mission.durationDays, config.durationDays);
    assert.ok(started.mission.accuracy >= config.accuracy && started.mission.accuracy <= 0.99);
    assert.equal(started.save.agency.balance, balanceBefore - config.cost);
    assert.equal(isValidSave(started.save), true);
    expectedTotalCost += config.cost;
    save = started.save;

    let completed = [];
    for (let day = 0; day < config.durationDays; day += 1) {
      save = advanceCareerDay(save);
      const result = advanceScoutingMissions(save, PLAYERS);
      save = result.save;
      completed.push(...result.completedReports);
      assert.ok(save.agency.balance >= 0);
      assert.equal(isValidSave(save), true);
    }

    assert.equal(completed.length, 1);
    const report = completed[0];
    assert.equal(report.candidateCount, scenario.playerIds.length);
    assert.equal(report.cost, config.cost);
    assert.equal(report.durationDays, config.durationDays);
    assert.equal(report.sourceId, scenario.sourceId);
    assert.equal(report.countryId, scenario.countryId);
    assert.equal(report.role, scenario.role);
    assert.deepEqual(report.findings.map((finding) => finding.playerId).sort(), [...scenario.playerIds].sort());

    const newObservations = save.world.scouting.observations.filter((observation) => observation.reportId === report.id);
    assert.equal(newObservations.length, scenario.playerIds.length);
    assert.ok(newObservations.every((observation) => observation.sourceIds.length === 1 && observation.sourceIds[0] === scenario.sourceId));
    assert.deepEqual(newObservations.map((observation) => observation.playerId).sort(), [...scenario.playerIds].sort());
    totalObservations += scenario.playerIds.length;
  }

  assert.equal(save.agency.balance, 100000 - expectedTotalCost);
  assert.equal(expectedTotalCost, 59000);
  assert.equal(save.agency.balance, 41000);
  assert.equal(save.world.scouting.reports.length, scenarios.length);
  assert.equal(save.world.scouting.observations.length, totalObservations);
  assert.equal(totalObservations, 6);
  assert.equal(save.world.scouting.activeMissions.length, 0);
  assert.equal(isValidSave(save), true);
});


test("enforces exact budget boundaries for local, regional and elite missions", () => {
  for (const [type, config] of Object.entries(SCOUTING_MISSION_TYPES)) {
    const underBudget = {
      ...createInitialSave(),
      agency: { ...createInitialSave().agency, balance: config.cost - 1 }
    };
    const rejected = startScoutingMission(underBudget, {
      type, countryId: "all", role: "all"
    }, PLAYERS);
    assert.equal(rejected.changed, false, type + " mission must reject a one-pound shortfall");
    assert.equal(rejected.save, underBudget);
    assert.equal(rejected.save.agency.balance, config.cost - 1);

    const exactBudgetBase = createInitialSave();
    const exactBudget = {
      ...exactBudgetBase,
      agency: { ...exactBudgetBase.agency, balance: config.cost }
    };
    const accepted = startScoutingMission(exactBudget, {
      type, countryId: "all", role: "all"
    }, PLAYERS);
    assert.equal(accepted.changed, true, type + " mission must accept an exact budget");
    assert.equal(accepted.mission.cost, config.cost);
    assert.equal(accepted.mission.durationDays, config.durationDays);
    assert.equal(accepted.save.agency.balance, 0);
    assert.equal(isValidSave(accepted.save), true);
  }
});
