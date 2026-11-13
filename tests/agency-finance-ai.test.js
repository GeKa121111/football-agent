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
  isValidAgencyManagementState,
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

test("legal staff reduces the probability that a rival agency poaches a target", () => {
  const target = {
    id:"rival-offer-legal-protection-target",playerId:"legal-protection-target",
    playerName:"Legal Protection Target",position:"وسط",
    rating:57,potential:57,commissionRate:10,
    offeredDate:"2026-07-01",dueDate:"2026-07-04",
    status:"pending",decisionDate:null
  };
  const prepare = (save) => ({
    ...save,
    agency:{...save.agency,management:{
      ...save.agency.management,
      competitors:save.agency.management.competitors.map((rival,index) =>
        index===0 ? {...rival,pendingOffers:[{...target,status:"pending",decisionDate:null}]} : rival
      )
    }},
    world:{...save.world,currentDate:"2026-07-04"}
  });
  const unprotected = advanceAgencyManagementDay(prepare(createInitialSave()),"2026-07-04",PLAYERS);
  assert.equal(
    unprotected.save.agency.management.competitors[0].pendingOffers[0].status,
    "accepted"
  );

  const hired = hireAgencyEmployee(createInitialSave(),"legal");
  const protectedSave = prepare(hired.save);
  const protectedResult = advanceAgencyManagementDay(protectedSave,"2026-07-04",PLAYERS);
  assert.equal(
    protectedResult.save.agency.management.competitors[0].pendingOffers[0].status,
    "rejected"
  );
  assert.equal(isValidAgencyManagementState(protectedResult.save.agency.management,"2026-07-04"),true);
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
  assert.equal(getAgencyManagementSummary(monday.save).lateCreditFacilities, 1);
  assert.equal(getAgencyManagementSummary(monday.save).liquidityStatus, "attention");
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

  const performancePlayers = PLAYERS.map((item) => item.id === player.id ? {
    ...item,
    seasonPerformance: {
      appearances: 12,
      minutesPlayed: 980,
      goals: 8,
      assists: 4,
      averageMatchRating: 7.8
    },
    honors: [{ competitionId: "competition-test", season: 1, awardType: "bestPlayer" }]
  } : item);
  const monday = advanceCareerSimulationDays(signedSave,5,performancePlayers);
  const summary = getAgencyClubInterestSummary(monday.save);
  assert.equal(monday.save.world.currentDate,"2026-07-06");
  assert.ok(summary.total > 0);
  assert.ok(summary.monitoring + summary.enquiries > 0);
  const firstInterest = monday.save.agency.management.clubInterests.find((interest) =>
    interest.playerId === player.id
  );
  assert.ok(firstInterest);
  assert.ok(firstInterest.clubBudgetEur > 0);
  assert.ok(firstInterest.estimatedFeeEur > 0);
  assert.ok(firstInterest.performanceBonus > 0);
  assert.equal(firstInterest.averageMatchRating,7.8);
  assert.equal(firstInterest.seasonAppearances,12);
  assert.equal(firstInterest.seasonGoals,8);
  assert.equal(firstInterest.seasonAssists,4);
  assert.equal(firstInterest.honorsCount,1);
  assert.equal(isValidSave(monday.save),true);

  const nextWeek = advanceCareerSimulationDays(monday.save,7,PLAYERS);
  const playerInterests = nextWeek.save.agency.management.clubInterests.filter((interest) =>
    interest.playerId === player.id && ["monitoring","enquiry"].includes(interest.status)
  );
  const uniqueClubs = new Set(playerInterests.map((interest) => interest.clubId));
  assert.equal(uniqueClubs.size,playerInterests.length);
  assert.equal(isValidSave(nextWeek.save),true);
});


test("retains a new competitor offer after the rival history reaches its rolling cap", () => {
  const initial = createInitialSave();
  const rival = initial.agency.management.competitors[0];
  rival.lastActionDate = "2026-06-29";
  rival.pendingOffers = Array.from({ length:40 },(_,index) => ({
    id:"rival-offer-old-" + index,
    playerId:"historic-player-" + index,
    playerName:"Historic Player " + index,
    position:"وسط",
    rating:65,
    potential:75,
    commissionRate:10,
    offeredDate:"2026-06-20",
    dueDate:"2026-06-23",
    status:"rejected",
    decisionDate:"2026-06-23"
  }));
  assert.equal(isValidSave(initial),true);

  const monday = advanceCareerSimulationDays(initial,5,PLAYERS);
  const afterMonday = monday.save.agency.management.competitors.find((item) => item.id === rival.id);
  const newOffer = afterMonday.pendingOffers.find((item) => item.offeredDate === "2026-07-06");
  assert.ok(newOffer);
  assert.equal(afterMonday.pendingOffers.length,41);

  const resolved = advanceCareerSimulationDays(monday.save,3,PLAYERS);
  const afterResolution = resolved.save.agency.management.competitors.find((item) => item.id === rival.id);
  const savedOffer = afterResolution.pendingOffers.find((item) => item.id === newOffer.id);
  assert.ok(savedOffer);
  assert.ok(["accepted","rejected"].includes(savedOffer.status));
  assert.equal(isValidSave(resolved.save),true);
});


test("keeps agency finance, sponsorship, rivals and club interest valid across three seasons", () => {
  let save = createInitialSave();
  const employee = hireAgencyEmployee(save,"operations");
  assert.equal(employee.changed,true,employee.error);
  save = employee.save;

  const sponsor = signAgencySponsorship(save,"local-media");
  assert.equal(sponsor.changed,true,sponsor.error);
  save = sponsor.save;

  const credit = takeAgencyCredit(save,"working-capital");
  assert.equal(credit.changed,true,credit.error);
  save = credit.save;

  save = {
    ...save,
    agency:{...save.agency,clients:[PLAYERS[0].id]}
  };
  assert.equal(isValidAgencyManagementState(save.agency.management,save.world.currentDate),true);

  let currentDate = "2026-07-06";
  const addDays = (value,days) => {
    const date = new Date(value + "T00:00:00.000Z");
    date.setUTCDate(date.getUTCDate()+days);
    return date.toISOString().slice(0,10);
  };

  for (let week=0;week<156;week+=1) {
    for (let day=0;day<7;day+=1) {
      save = {...save,world:{...save.world,currentDate}};
      const result = advanceAgencyManagementDay(save,currentDate,PLAYERS);
      assert.equal(result.error,undefined,"agency tick must remain valid at " + currentDate);
      save = result.save;
      assert.equal(isValidAgencyManagementState(save.agency.management,currentDate),true,
        "management schema must remain valid at " + currentDate);
      assert.ok(save.agency.balance >= 0);
      assert.ok(save.agency.management.ledger.length <= 1000);
      assert.ok(save.agency.management.competitiveHistory.length <= 300);
      assert.ok(save.agency.management.clubInterests.length <= 200);
      currentDate = addDays(currentDate,1);
    }
  }

  const management = save.agency.management;
  assert.equal(management.creditFacilities[0].status,"repaid");
  assert.equal(management.sponsorships[0].status,"expired");
  assert.ok(management.competitors.some((rival) => rival.clients.length > 0));
  assert.ok(management.clubInterests.length > 0);
  assert.ok(management.arrearsEgp > 0,"prolonged payroll deficits remain visible as arrears");
  assert.equal(management.ledger.some((entry) => entry.type === "credit-drawdown" && entry.direction === "financing"),true);
  assert.equal(management.ledger.some((entry) => entry.type === "credit-repayment"),true);
});


test("expires a sponsorship on the first agency tick after its contract end date", () => {
  const signed = signAgencySponsorship(createInitialSave(),"local-media");
  assert.equal(signed.changed,true,signed.error);
  const currentDate = "2027-07-02";
  const save = {
    ...signed.save,
    world:{...signed.save.world,currentDate}
  };
  assert.equal(isValidAgencyManagementState(save.agency.management,currentDate),true);
  const updated = advanceAgencyManagementDay(save,currentDate,PLAYERS);
  assert.equal(updated.error,undefined);
  assert.equal(updated.save.agency.management.sponsorships[0].status,"expired");
  assert.equal(isValidAgencyManagementState(updated.save.agency.management,currentDate),true);
});
