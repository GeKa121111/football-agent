import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave, isValidSave } from "../src/core/storage.js";
import { getWorldPlayerProfiles } from "../src/data/world-database.js";
import { startScoutingMission } from "../src/engines/scouting.js";
import {
  createRepresentationOffer,
  evaluateRepresentationOffer,
  acceptRepresentationCounterOffer,
  createRepresentationInteraction,
  getPlayerRepresentationProfile
} from "../src/engines/representation.js";
import { advanceCareerSimulationDay, advanceCareerSimulationDays } from "../src/engines/career-simulation.js";

const PLAYERS = getWorldPlayerProfiles();

function signFirstClient(save) {
  const player = PLAYERS[0];
  const preferences = getPlayerRepresentationProfile(player);
  const sent = createRepresentationOffer(save, player, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
  });
  assert.equal(sent.changed, true, sent.error);

  const response = evaluateRepresentationOffer(sent.save, sent.offer.id);
  assert.equal(response.changed, true, response.error);
  if (response.status === "countered") {
    const accepted = acceptRepresentationCounterOffer(response.save, sent.offer.id);
    assert.equal(accepted.changed, true, accepted.error);
    return { save: accepted.save, playerId: player.id };
  }
  assert.equal(response.status, "signed");
  return { save: response.save, playerId: player.id };
}

test("one career day advances the shared clock without mutating the source save", () => {
  const initial = createInitialSave();
  const signed = signFirstClient(initial);
  const contract = signed.save.agency.representation.contracts.find((item) => item.playerId === signed.playerId);
  const interaction = createRepresentationInteraction(signed.save, contract.id, "message");
  assert.equal(interaction.changed, true, interaction.error);
  const mission = startScoutingMission(interaction.save, {
    type: "local", countryId: "country-eg", role: "all"
  }, PLAYERS);
  assert.equal(mission.changed, true, mission.error);

  const transferStateBefore = structuredClone(mission.save.world.transfers);
  const advanced = advanceCareerSimulationDay(mission.save, PLAYERS);
  const savedInteraction = advanced.save.agency.representation.interactions
    .find((item) => item.id === interaction.interaction.id);
  assert.equal(advanced.save.world.currentDate, "2026-07-02");
  assert.equal(advanced.save.career.day, 2);
  assert.deepEqual(mission.save.world.transfers, transferStateBefore);
  assert.equal(savedInteraction.status, "pending_response");
  assert.equal(advanced.save.world.scouting.activeMissions.length, 1);
  assert.equal(mission.save.career.day, 1);
  assert.equal(advanced.completedReports.length, 0);
  assert.equal(isValidSave(advanced.save), true);
});

test("weekly progression processes due agency responses and scouting reports on their exact dates", () => {
  const initial = createInitialSave();
  const signed = signFirstClient(initial);
  const contract = signed.save.agency.representation.contracts.find((item) => item.playerId === signed.playerId);
  const interaction = createRepresentationInteraction(signed.save, contract.id, "message");
  assert.equal(interaction.changed, true, interaction.error);

  const mission = startScoutingMission(interaction.save, {
    type: "local",
    countryId: "country-eg",
    role: "all"
  }, PLAYERS);
  assert.equal(mission.changed, true, mission.error);

  const advanced = advanceCareerSimulationDays(mission.save, 7, PLAYERS);
  const savedInteraction = advanced.save.agency.representation.interactions
    .find((item) => item.id === interaction.interaction.id);
  const savedReport = advanced.save.world.scouting.reports
    .find((report) => report.missionId === mission.mission.id);

  assert.equal(advanced.save.world.currentDate, "2026-07-08");
  assert.equal(savedInteraction.status, "resolved");
  assert.equal(savedInteraction.resolvedDate, interaction.interaction.dueDate);
  assert.equal(savedInteraction.resolvedDate, "2026-07-04");
  assert.ok(savedReport);
  assert.equal(savedReport.completedDate, mission.mission.dueDate);
  assert.equal(savedReport.completedDate, "2026-07-08");
  assert.ok(advanced.save.world.football.results.length > 0);
  assert.ok(advanced.save.world.events.some((event) =>
    event.type === "football-match-played" && event.date === "2026-07-04"
  ));
  assert.equal(isValidSave(advanced.save), true);
});

test("refreshes scouting player data on each day and uses the latest development snapshot", () => {
  const initial = createInitialSave();
  const mission = startScoutingMission(initial, {
    type: "local",
    countryId: "country-eg",
    role: "هجوم",
    sourceId: "academy"
  }, PLAYERS);
  assert.equal(mission.changed, true, mission.error);

  const providerDates = [];
  const advanced = advanceCareerSimulationDays(mission.save, 7, (currentSave) => {
    providerDates.push(currentSave.world.currentDate);
    return PLAYERS.map((player) => player.id === "demo-yassin-adel" &&
      currentSave.world.currentDate === mission.mission.dueDate
      ? { ...player, rating: 99, potential: 99 }
      : player);
  });

  assert.deepEqual(providerDates, [
    "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05",
    "2026-07-06", "2026-07-07", "2026-07-08"
  ]);
  const report = advanced.save.world.scouting.reports.find((item) =>
    item.missionId === mission.mission.id
  );
  assert.ok(report);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].playerId, "demo-yassin-adel");
  assert.ok(report.findings[0].estimatedRating >= 96);
  assert.equal(Number.isInteger(report.findings[0].estimatedRating), true);
  assert.equal(Number.isInteger(report.findings[0].estimatedPotential), true);
  assert.equal(isValidSave(advanced.save), true);
});

test("rejects invalid multi-day advances and missing scouting data without modifying the input", () => {
  const save = createInitialSave();
  assert.throws(() => advanceCareerSimulationDays(save, 0, PLAYERS), /من يوم واحد إلى 31 يومًا/);
  assert.throws(() => advanceCareerSimulationDay(save, null), /قاعدة لاعبي الكشافة/);
  assert.equal(save.world.currentDate, "2026-07-01");
});
