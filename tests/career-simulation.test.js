import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave, isValidSave, readSave, writeSave } from "../src/core/storage.js";
import { getWorldPlayerProfiles, WORLD_DATABASE } from "../src/data/world-database.js";
import { startScoutingMission } from "../src/engines/scouting.js";
import {
  createRepresentationOffer,
  evaluateRepresentationOffer,
  acceptRepresentationCounterOffer,
  createRepresentationInteraction,
  getPlayerRepresentationProfile
} from "../src/engines/representation.js";
import { advanceCareerSimulationDay, advanceCareerSimulationDays } from "../src/engines/career-simulation.js";
import { hireAgencyEmployee, signAgencySponsorship, takeAgencyCredit } from "../src/engines/agency-management.js";
import { setPlayerTrainingPlan } from "../src/engines/player-development.js";
import { createTransferOffer, evaluateTransferOffer, completeTransfer, getPlayerCurrentClubId } from "../src/engines/transfers.js";

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


test("runs agency payroll on the shared Monday career tick", () => {
  const initial = createInitialSave();
  const hired = hireAgencyEmployee(initial, "analyst");
  assert.equal(hired.changed, true, hired.error);
  const weeklySalary = hired.employee.weeklySalaryEgp;
  const advanced = advanceCareerSimulationDays(hired.save, 7, PLAYERS);

  assert.equal(advanced.save.world.currentDate, "2026-07-08");
  assert.equal(advanced.save.agency.management.lastPayrollDate, "2026-07-06");
  const payroll = advanced.save.agency.management.ledger.find((entry) =>
    entry.type === "weekly-operations" && entry.date === "2026-07-06"
  );
  assert.ok(payroll);
  assert.equal(payroll.amountEgp, weeklySalary);
  assert.equal(payroll.paidEgp, weeklySalary);
  assert.equal(advanced.save.agency.balance, hired.save.agency.balance - weeklySalary);
  assert.equal(isValidSave(advanced.save), true);
});


test("runs a multi-system career, saves and reloads it, then resumes without losing linked state", () => {
  let save = signFirstClient(createInitialSave()).save;
  const transferPlayer = WORLD_DATABASE.players.find((player) => player.id === PLAYERS[0].id);
  assert.ok(transferPlayer);
  const sourceClub = WORLD_DATABASE.clubs.find((club) => club.id === transferPlayer.clubId);
  const destinationClub = WORLD_DATABASE.clubs.find((club) =>
    club.id !== sourceClub.id && club.leagueId === sourceClub.leagueId
  );
  assert.ok(destinationClub);

  const transfer = createTransferOffer(save, transferPlayer.id, destinationClub.id, "permanent", {
    feeEur: Math.round(transferPlayer.marketValueEur * 1.1),
    weeklyWageEur: 20000,
    signingBonusEur: 100000,
    contractYears: 3
  });
  assert.equal(transfer.changed, true, transfer.error);
  const decision = evaluateTransferOffer(transfer.save, transfer.offer.id);
  assert.equal(decision.status, "agreed", decision.error);
  const completedTransfer = completeTransfer(decision.save, transfer.offer.id);
  assert.equal(completedTransfer.status, "completed", completedTransfer.error);
  save = completedTransfer.save;
  assert.equal(
    getPlayerCurrentClubId(transferPlayer.id, transferPlayer.clubId, save.world.transfers, save.world.currentDate),
    destinationClub.id
  );

  const contract = save.agency.representation.contracts.find((item) =>
    item.playerId === PLAYERS[0].id
  );
  assert.ok(contract);

  const interaction = createRepresentationInteraction(save, contract.id, "message");
  assert.equal(interaction.changed, true, interaction.error);
  save = interaction.save;

  const hired = hireAgencyEmployee(save, "analyst");
  assert.equal(hired.changed, true, hired.error);
  save = hired.save;

  const sponsorship = signAgencySponsorship(save, "local-media");
  assert.equal(sponsorship.changed, true, sponsorship.error);
  save = sponsorship.save;

  const credit = takeAgencyCredit(save, "working-capital");
  assert.equal(credit.changed, true, credit.error);
  save = credit.save;

  const mission = startScoutingMission(save, {
    type: "local",
    countryId: "country-eg",
    role: "all",
    sourceId: "academy"
  }, PLAYERS);
  assert.equal(mission.changed, true, mission.error);
  save = mission.save;

  const plan = setPlayerTrainingPlan(
    save.world.football.playerDevelopment,
    PLAYERS[0].id,
    "technical",
    "normal"
  );
  assert.equal(plan.changed, true);
  save = {
    ...save,
    world: {
      ...save.world,
      football: {
        ...save.world.football,
        playerDevelopment: plan.state
      }
    }
  };

  for (let week = 0; week < 4; week += 1) {
    save = advanceCareerSimulationDays(save, 7, PLAYERS).save;
    assert.equal(isValidSave(save), true, "complete save must remain valid after week " + (week + 1));
  }

  assert.equal(save.world.currentDate, "2026-07-29");
  assert.ok(save.world.football.results.length > 0, "football fixtures must resolve during the shared simulation");
  assert.ok(save.world.scouting.reports.some((report) => report.missionId === mission.mission.id));
  assert.equal(
    save.agency.representation.interactions.find((item) => item.id === interaction.interaction.id).status,
    "resolved"
  );
  assert.ok(save.world.football.playerDevelopment.trainingHistory.length > 0);
  assert.ok(save.agency.management.ledger.some((entry) => entry.type === "sponsorship-income" && entry.incomeKind === "weekly"));
  assert.ok(save.agency.management.ledger.some((entry) => entry.type === "credit-repayment"));
  assert.ok(save.agency.management.ledger.some((entry) => entry.type === "weekly-operations"));

  const records = new Map();
  const storage = {
    getItem(key) { return records.has(key) ? records.get(key) : null; },
    setItem(key, value) { records.set(key, String(value)); },
    removeItem(key) { records.delete(key); }
  };
  writeSave(save, storage, "2026-07-29T12:00:00.000Z");

  const loaded = readSave(storage);
  assert.equal(loaded.status, "loaded");
  assert.equal(loaded.migrated, false);
  const expectedPersisted = JSON.parse(JSON.stringify({
    ...save,
    meta: {
      ...save.meta,
      version: save.meta.version,
      updatedAt: "2026-07-29T12:00:00.000Z"
    }
  }));
  assert.deepEqual(loaded.save, expectedPersisted);

  const resumed = advanceCareerSimulationDays(loaded.save, 7, PLAYERS).save;
  assert.equal(resumed.world.currentDate, "2026-08-05");
  assert.equal(isValidSave(resumed), true);
  assert.equal(resumed.world.scouting.reports.length, loaded.save.world.scouting.reports.length);
  assert.ok(resumed.world.football.results.length >= loaded.save.world.football.results.length);
});


test("runs one complete integrated career season and resumes it safely after a save reload", () => {
  let save = signFirstClient(createInitialSave("2026-07-01T00:00:00.000Z")).save;
  const transferPlayer = WORLD_DATABASE.players.find((player) => player.id === PLAYERS[0].id);
  assert.ok(transferPlayer);
  const sourceClub = WORLD_DATABASE.clubs.find((club) => club.id === transferPlayer.clubId);
  const destinationClub = WORLD_DATABASE.clubs.find((club) =>
    club.id !== sourceClub.id && club.leagueId === sourceClub.leagueId
  );
  assert.ok(sourceClub);
  assert.ok(destinationClub);

  const transfer = createTransferOffer(save, transferPlayer.id, destinationClub.id, "permanent", {
    feeEur: Math.round(transferPlayer.marketValueEur * 1.1),
    weeklyWageEur: 20000,
    signingBonusEur: 100000,
    contractYears: 3
  });
  assert.equal(transfer.changed, true, transfer.error);
  const decision = evaluateTransferOffer(transfer.save, transfer.offer.id);
  assert.equal(decision.status, "agreed", decision.error);
  const completedTransfer = completeTransfer(decision.save, transfer.offer.id);
  assert.equal(completedTransfer.status, "completed", completedTransfer.error);
  save = completedTransfer.save;

  const clientContract = save.agency.representation.contracts.find((item) =>
    item.playerId === PLAYERS[0].id
  );
  assert.ok(clientContract);
  const interaction = createRepresentationInteraction(save, clientContract.id, "message");
  assert.equal(interaction.changed, true, interaction.error);
  save = interaction.save;

  const hired = hireAgencyEmployee(save, "analyst");
  assert.equal(hired.changed, true, hired.error);
  save = hired.save;
  const sponsorship = signAgencySponsorship(save, "local-media");
  assert.equal(sponsorship.changed, true, sponsorship.error);
  save = sponsorship.save;
  const credit = takeAgencyCredit(save, "working-capital");
  assert.equal(credit.changed, true, credit.error);
  save = credit.save;

  const mission = startScoutingMission(save, {
    type: "local",
    countryId: "country-eg",
    role: "all",
    sourceId: "academy"
  }, PLAYERS);
  assert.equal(mission.changed, true, mission.error);
  save = mission.save;

  const trainingPlan = setPlayerTrainingPlan(
    save.world.football.playerDevelopment,
    PLAYERS[0].id,
    "technical",
    "normal"
  );
  assert.equal(trainingPlan.changed, true);
  save = {
    ...save,
    world: {
      ...save.world,
      football: {
        ...save.world.football,
        playerDevelopment: trainingPlan.state
      }
    }
  };

  const firstSeasonFixtureCount = save.world.football.fixtures
    .filter((fixture) => fixture.season === 1).length;
  assert.ok(firstSeasonFixtureCount > 0);
  const storageRecords = new Map();
  const storage = {
    getItem(key) { return storageRecords.has(key) ? storageRecords.get(key) : null; },
    setItem(key, value) { storageRecords.set(key, String(value)); },
    removeItem(key) { storageRecords.delete(key); }
  };

  let advancedDays = 0;
  while (advancedDays < 365) {
    const step = Math.min(31, 365 - advancedDays);
    save = advanceCareerSimulationDays(save, step, PLAYERS).save;
    advancedDays += step;
    assert.equal(isValidSave(save), true, "save must remain valid on day " + advancedDays);
    assert.equal(
      save.world.currentDate,
      new Date(Date.parse("2026-07-01T00:00:00.000Z") + advancedDays * 86400000)
        .toISOString().slice(0, 10)
    );

    if (advancedDays === 186) {
      writeSave(save, storage, save.world.currentDate + "T12:00:00.000Z");
      const loaded = readSave(storage);
      assert.equal(loaded.status, "loaded");
      assert.equal(loaded.migrated, false);
      save = loaded.save;
      assert.equal(isValidSave(save), true, "mid-season restored save must remain valid");
    }
  }

  assert.equal(save.world.currentDate, "2027-07-01");
  assert.equal(save.career.season, 2);
  assert.equal(save.world.football.season, 2);
  assert.equal(
    save.world.football.results.filter((result) => result.season === 1).length,
    firstSeasonFixtureCount
  );
  assert.equal(
    save.world.football.fixtures.filter((fixture) =>
      fixture.season === 1 && fixture.status === "scheduled"
    ).length,
    0
  );
  assert.equal(new Set(save.world.football.results.map((result) => result.id)).size,
    save.world.football.results.length);
  assert.ok(save.world.football.fixtures.some((fixture) =>
    fixture.season === 2 && fixture.status === "scheduled"
  ));
  assert.ok(save.world.football.playerDevelopment.trainingHistory.length > 0);
  assert.ok(save.world.scouting.reports.some((report) => report.missionId === mission.mission.id));
  assert.equal(
    save.agency.representation.interactions.find((item) => item.id === interaction.interaction.id).status,
    "resolved"
  );
  assert.ok(save.agency.management.ledger.some((entry) =>
    entry.type === "weekly-operations"
  ));
  assert.ok(save.agency.management.ledger.some((entry) =>
    entry.type === "sponsorship-income" && entry.incomeKind === "weekly"
  ));
  assert.ok(save.agency.management.ledger.some((entry) =>
    entry.type === "credit-repayment"
  ));
  assert.equal(
    getPlayerCurrentClubId(
      transferPlayer.id,
      transferPlayer.clubId,
      save.world.transfers,
      save.world.currentDate
    ),
    destinationClub.id
  );
  assert.equal(isValidSave(save), true);
});
