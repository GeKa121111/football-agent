import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave, isValidSave } from "../src/core/storage.js";
import { getWorldPlayerProfiles } from "../src/data/world-database.js";
import {
  getAgencyClubInterestSummary,
  getAgencyCompetitorSummary,
  getAgencyCreditOffers,
  getAgencyManagementSummary,
  getAgencySponsorshipOffers,
  getAgencyStaffModifiers,
  getRivalClientIds,
  hireAgencyEmployee,
  signAgencySponsorship,
  takeAgencyCredit,
  advanceAgencyManagementDay
} from "../src/engines/agency-management.js";
import {
  acceptRepresentationCounterOffer,
  createRepresentationOffer,
  evaluateRepresentationOffer,
  getPlayerRepresentationProfile
} from "../src/engines/representation.js";
import { advanceCareerSimulationDays } from "../src/engines/career-simulation.js";

const PLAYERS = getWorldPlayerProfiles();

test("signing a sponsorship pays its signing bonus once and records earned revenue", () => {
  const initial = createInitialSave();
  const starter = getAgencySponsorshipOffers(initial).find((item) => item.id === "local-media");
  assert.equal(starter.available, true);

  const signed = signAgencySponsorship(initial, "local-media");
  assert.equal(signed.changed, true, signed.error);
  assert.equal(signed.save.agency.balance, initial.agency.balance + starter.signingBonusEgp);
  assert.equal(signed.save.agency.management.sponsorships.length, 1);
  assert.equal(getAgencyManagementSummary(signed.save).totalRevenueEgp, starter.signingBonusEgp);
  assert.equal(isValidSave(signed.save), true);

  const duplicate = signAgencySponsorship(signed.save, "local-media");
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.save, signed.save);
});

test("collects sponsorship revenue on the next Monday without double-paying the same week", () => {
  const initial = createInitialSave();
  const signed = signAgencySponsorship(initial, "local-media");
  const weeklyRevenue = signed.deal.weeklyRevenueEgp;
  const monday = advanceCareerSimulationDays(signed.save, 5, PLAYERS);

  assert.equal(monday.save.world.currentDate, "2026-07-06");
  assert.equal(monday.save.agency.balance, initial.agency.balance + signed.deal.signingBonusEgp + weeklyRevenue);
  const weeklyEntries = monday.save.agency.management.ledger.filter((entry) =>
    entry.type === "sponsorship-income" && entry.incomeKind === "weekly"
  );
  assert.equal(weeklyEntries.length, 1);
  assert.equal(weeklyEntries[0].paidEgp, weeklyRevenue);
  assert.equal(isValidSave(monday.save), true);

  const duplicate = advanceAgencyManagementDay(monday.save, "2026-07-06", PLAYERS);
  assert.equal(duplicate.save.agency.balance, monday.save.agency.balance);
  assert.equal(duplicate.save.agency.management.ledger.filter((entry) =>
    entry.type === "sponsorship-income" && entry.incomeKind === "weekly"
  ).length, 1);
});

test("competitor agencies autonomously send and resolve offers on the shared calendar", () => {
  const initial = createInitialSave();
  const monday = advanceCareerSimulationDays(initial, 5, PLAYERS);
  const rivals = getAgencyCompetitorSummary(monday.save);
  assert.equal(monday.save.world.currentDate, "2026-07-06");
  assert.equal(rivals.length, 3);
  assert.ok(rivals.reduce((sum, rival) => sum + rival.pendingOffers, 0) > 0);
  assert.ok(monday.save.agency.management.competitiveHistory.some((entry) => entry.type === "offer-sent"));
  assert.equal(isValidSave(monday.save), true);

  const resolved = advanceCareerSimulationDays(monday.save, 3, PLAYERS);
  const offers = resolved.save.agency.management.competitors.flatMap((rival) => rival.pendingOffers);
  assert.ok(offers.some((offer) => ["accepted", "rejected"].includes(offer.status)));
  assert.ok(resolved.save.agency.management.competitiveHistory.some((entry) =>
    ["offer-accepted", "offer-rejected"].includes(entry.type)
  ));
  assert.equal(isValidSave(resolved.save), true);
});

test("staff modifiers affect negotiation and protect player mandates from rival agencies", () => {
  let save = createInitialSave();
  const hire = hireAgencyEmployee(save, "negotiator");
  assert.equal(hire.changed, true, hire.error);
  save = hire.save;
  assert.equal(getAgencyStaffModifiers(save).negotiationBonus, 3);

  const player = PLAYERS[0];
  const preferences = getPlayerRepresentationProfile(player);
  const sent = createRepresentationOffer(save, player, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays,
    representationType: preferences.prefersExclusive ? "exclusive" : "non-exclusive"
  });
  assert.equal(sent.changed, true, sent.error);
  assert.equal(sent.offer.negotiationBonus, 3);
  assert.equal(isValidSave(sent.save), true);

  const rivalSave = createInitialSave();
  const rival = rivalSave.agency.management.competitors[0];
  rival.clients = [{
    playerId:player.id,playerName:player.name,position:player.position,
    rating:player.rating,potential:player.potential,commissionRate:9,signedDate:rivalSave.world.currentDate
  }];
  assert.equal(getRivalClientIds(rivalSave).has(player.id), true);
  const blocked = createRepresentationOffer(rivalSave, player, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays,
    representationType: preferences.prefersExclusive ? "exclusive" : "non-exclusive"
  });
  assert.equal(blocked.changed, false);
  assert.match(blocked.error, /وكالة منافسة/);
  assert.equal(isValidSave(rivalSave), true);
});

test("legacy v8 agency state without sponsorship and competitor fields remains readable", () => {
  const save = createInitialSave();
  delete save.agency.management.sponsorships;
  delete save.agency.management.competitors;
  delete save.agency.management.competitiveHistory;
  delete save.agency.management.nextSponsorshipSequence;
  delete save.agency.management.nextCompetitiveSequence;
  delete save.agency.management.creditFacilities;
  delete save.agency.management.nextCreditSequence;
  delete save.agency.management.clubInterests;
  delete save.agency.management.nextClubInterestSequence;
  assert.equal(isValidSave(save), true);

  const advanced = advanceAgencyManagementDay(save, save.world.currentDate, PLAYERS);
  assert.equal(isValidSave(advanced.save), true);
  assert.ok(Array.isArray(advanced.save.agency.management.sponsorships));
  assert.equal(advanced.save.agency.management.competitors.length, 3);
});


test("credit facilities are financing, not revenue, and repay on the shared Monday tick", () => {
  const initial = createInitialSave();
  const offer = getAgencyCreditOffers(initial).find((item) => item.id === "working-capital");
  assert.equal(offer.eligible, true);
  assert.equal(offer.totalRepaymentEgp, 56000);

  const drawn = takeAgencyCredit(initial, "working-capital");
  assert.equal(drawn.changed, true, drawn.error);
  assert.equal(drawn.save.agency.balance, initial.agency.balance + 50000);
  assert.equal(getAgencyManagementSummary(drawn.save).totalRevenueEgp, 0);
  assert.equal(getAgencyManagementSummary(drawn.save).totalDebtEgp, 56000);
  assert.equal(isValidSave(drawn.save), true);

  const duplicate = takeAgencyCredit(drawn.save, "working-capital");
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.save, drawn.save);

  const monday = advanceCareerSimulationDays(drawn.save, 5, PLAYERS);
  const loan = monday.save.agency.management.creditFacilities[0];
  assert.equal(monday.save.world.currentDate, "2026-07-06");
  assert.equal(loan.paidEgp, loan.weeklyInstallmentEgp);
  assert.equal(loan.remainingEgp, loan.totalRepaymentEgp - loan.weeklyInstallmentEgp);
  assert.equal(loan.lastPaymentDate, "2026-07-06");
  assert.equal(getAgencyManagementSummary(monday.save).totalDebtEgp, loan.remainingEgp);
  assert.equal(isValidSave(monday.save), true);
});

test("credit repayment remains bounded by available cash and records missed installments", () => {
  let save = createInitialSave();
  const drawn = takeAgencyCredit(save, "working-capital");
  save = {
    ...drawn.save,
    agency:{...drawn.save.agency,balance:100}
  };
  const monday = advanceCareerSimulationDays(save, 5, PLAYERS);
  const loan = monday.save.agency.management.creditFacilities[0];
  const entry = monday.save.agency.management.ledger.find((item) => item.type === "credit-repayment");
  assert.equal(entry.paidEgp, 100);
  assert.equal(loan.lateWeeks, 1);
  assert.equal(monday.save.agency.balance, 0);
  assert.ok(loan.remainingEgp > 0);
  assert.equal(isValidSave(monday.save), true);
});


test("clubs independently monitor agency clients and raise enquiries during open windows", () => {
  const initial = createInitialSave();
  const player = PLAYERS[0];
  const preferences = getPlayerRepresentationProfile(player);
  const offer = createRepresentationOffer(initial,player,{
    commissionRate:preferences.preferredCommissionRate,
    termDays:preferences.preferredTermDays,
    representationType:preferences.prefersExclusive ? "exclusive" : "non-exclusive"
  });
  assert.equal(offer.changed,true,offer.error);
  const response = evaluateRepresentationOffer(offer.save,offer.offer.id);
  let signedSave = response.save;
  if (response.status === "countered") {
    const accepted = acceptRepresentationCounterOffer(response.save,offer.offer.id);
    assert.equal(accepted.changed,true,accepted.error);
    signedSave = accepted.save;
  }
  assert.ok(signedSave.agency.clients.includes(player.id));
  assert.equal(isValidSave(signedSave),true);

  const monday = advanceCareerSimulationDays(signedSave,5,PLAYERS);
  const summary = getAgencyClubInterestSummary(monday.save);
  assert.equal(monday.save.world.currentDate,"2026-07-06");
  assert.ok(summary.total > 0);
  assert.ok(summary.monitoring + summary.enquiries > 0);
  assert.ok(monday.save.agency.management.clubInterests.some((interest) =>
    interest.playerId === player.id
  ));
  assert.equal(isValidSave(monday.save),true);

  const nextWeek = advanceCareerSimulationDays(monday.save,7,PLAYERS);
  const playerInterests = nextWeek.save.agency.management.clubInterests.filter((interest) =>
    interest.playerId === player.id && ["monitoring","enquiry"].includes(interest.status)
  );
  const uniqueClubs = new Set(playerInterests.map((interest) => interest.clubId));
  assert.equal(uniqueClubs.size,playerInterests.length);
  assert.equal(isValidSave(nextWeek.save),true);
});
