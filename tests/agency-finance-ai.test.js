import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave, isValidSave } from "../src/core/storage.js";
import { getWorldPlayerProfiles } from "../src/data/world-database.js";
import {
  getAgencyCompetitorSummary,
  getAgencyManagementSummary,
  getAgencySponsorshipOffers,
  getAgencyStaffModifiers,
  getRivalClientIds,
  hireAgencyEmployee,
  signAgencySponsorship,
  advanceAgencyManagementDay
} from "../src/engines/agency-management.js";
import {
  createRepresentationOffer,
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
  assert.equal(isValidSave(save), true);

  const advanced = advanceAgencyManagementDay(save, "2026-07-02", PLAYERS);
  assert.equal(isValidSave(advanced.save), true);
  assert.ok(Array.isArray(advanced.save.agency.management.sponsorships));
  assert.equal(advanced.save.agency.management.competitors.length, 3);
});
