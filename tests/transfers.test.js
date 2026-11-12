import test from "node:test";
import assert from "node:assert/strict";
import {
  createInitialTransferState, createTransferOffer, evaluateTransferOffer,
  submitTransferCounterOffer, acceptTransferCounterOffer, rejectTransferOffer,
  completeTransfer, exerciseLoanOption, advanceTransferState, getTransferWindow,
  getPlayerCurrentClubId, isValidTransferState
} from "../src/engines/transfers.js";

const database = {
  clubs: [
    { id: "club-home", nameAr: "نادي المصدر", simulationProfile: 70 },
    { id: "club-target", nameAr: "نادي الوجهة", simulationProfile: 90 },
    { id: "club-other", nameAr: "نادي آخر", simulationProfile: 65 }
  ],
  players: [{
    id: "player-1", name: "لاعب تجريبي", age: 21, clubId: "club-home",
    position: "مهاجم", rating: 70, potential: 88, marketValueEur: 2_000_000,
    contractUntil: "2028-06-30"
  }],
  squadPlayers: []
};

function makeSave(date = "2026-07-01") {
  return {
    world: { currentDate: date, transfers: createInitialTransferState() },
    agency: {
      clients: ["player-1"],
      representation: { contracts: [{
        id: "representation-contract-1", playerId: "player-1", commissionRate: 10,
        status: "active", expiresOn: "2029-06-30"
      }] }
    }
  };
}
const permanentTerms = { feeEur: 1_000_000, weeklyWageEur: 20_000, signingBonusEur: 100_000, contractYears: 3 };
const loanTerms = { loanFeeEur: 50_000, weeklyWageEur: 10_000, signingBonusEur: 20_000, loanMonths: 6, optionToBuyEur: 1_500_000 };

function send(save = makeSave(), type = "permanent", terms = permanentTerms, destination = "club-target") {
  return createTransferOffer(save, "player-1", destination, type, terms, save.world.currentDate, database);
}

test("uses explicit summer and winter windows and identifies the next window", () => {
  assert.equal(getTransferWindow("2026-07-01").active, true);
  assert.equal(getTransferWindow("2026-08-31").active, true);
  assert.equal(getTransferWindow("2026-09-01").active, false);
  assert.equal(getTransferWindow("2027-01-31").active, true);
  assert.equal(getTransferWindow("2027-02-01").nextWindow.startDate, "2027-07-01");
  assert.equal(getTransferWindow("2026-02-30").active, false);
});

test("creates a stable, dated proposal for an active agency client", () => {
  const result = send();
  assert.equal(result.changed, true);
  assert.equal(result.offer.id, "transfer-offer-1");
  assert.equal(result.offer.fromClubId, "club-home");
  assert.equal(result.offer.toClubId, "club-target");
  assert.equal(result.offer.expiresDate, "2026-07-15");
  assert.equal(result.save.world.transfers.history[0].type, "offer-sent");
  assert.equal(isValidTransferState(result.save.world.transfers, "2026-07-01", result.save.agency.clients, result.save.agency.representation), true);
});

test("blocks offers outside windows, without a mandate, to the current club, and duplicate open offers", () => {
  assert.equal(send(makeSave("2026-09-01")).changed, false);
  const noMandate = makeSave();
  noMandate.agency.clients = [];
  assert.match(createTransferOffer(noMandate, "player-1", "club-target", "permanent", permanentTerms, "2026-07-01", database).error, /عقد تمثيل نشط/);
  assert.match(send(makeSave(), "permanent", permanentTerms, "club-home").error, /بالفعل/);
  const first = send();
  assert.equal(send(first.save).changed, false);
});

test("validates fees, wages, terms and unknown entities before changing the save", () => {
  const save = makeSave();
  const raw = structuredClone(save);
  assert.equal(createTransferOffer(save, "player-1", "missing-club", "permanent", permanentTerms, "2026-07-01", database).changed, false);
  assert.equal(createTransferOffer(save, "player-1", "club-target", "permanent", { ...permanentTerms, feeEur: -1 }, "2026-07-01", database).changed, false);
  assert.equal(createTransferOffer(save, "player-1", "club-target", "permanent", { ...permanentTerms, contractYears: 7 }, "2026-07-01", database).changed, false);
  assert.deepEqual(save, raw);
});

test("rejects responses and completion dates that predate their offer or agreement", () => {
  const sent = send();
  assert.equal(evaluateTransferOffer(sent.save, sent.offer.id, "2026-06-30", database).changed, false);

  const countered = evaluateTransferOffer(sent.save, sent.offer.id, "2026-07-01", database);
  assert.equal(submitTransferCounterOffer(countered.save, sent.offer.id, permanentTerms, "2026-06-30").changed, false);
  assert.equal(acceptTransferCounterOffer(countered.save, sent.offer.id, "2026-06-30").changed, false);

  const agreed = acceptTransferCounterOffer(countered.save, sent.offer.id, "2026-07-02");
  assert.equal(completeTransfer(agreed.save, sent.offer.id, "2026-07-01").changed, false);
});

test("club responses are deterministic and may counter a low bid", () => {
  const sent = send();
  const first = evaluateTransferOffer(sent.save, sent.offer.id, "2026-07-01", database);
  const second = evaluateTransferOffer(sent.save, sent.offer.id, "2026-07-01", database);
  assert.equal(first.status, "countered");
  assert.deepEqual(first.counterOffer, second.counterOffer);
  assert.equal(first.counterOffer.feeEur, 1_800_000);
  assert.equal(first.offer.round, 2);
  assert.equal(isValidTransferState(first.save.world.transfers, "2026-07-01", first.save.agency.clients, first.save.agency.representation), true);
});

test("supports counter-proposals and reaches an agreement within bounded rounds", () => {
  const sent = send();
  const clubCounter = evaluateTransferOffer(sent.save, sent.offer.id, "2026-07-01", database);
  const agencyCounter = submitTransferCounterOffer(clubCounter.save, sent.offer.id, { ...permanentTerms, feeEur: 1_900_000 }, "2026-07-01");
  assert.equal(agencyCounter.changed, true);
  assert.equal(agencyCounter.status, "pending");
  const agreement = evaluateTransferOffer(agencyCounter.save, sent.offer.id, "2026-07-01", database);
  assert.equal(agreement.status, "agreed");
  assert.equal(agreement.offer.agreedTerms.feeEur, 1_900_000);
  assert.equal(isValidTransferState(agreement.save.world.transfers, "2026-07-01", agreement.save.agency.clients, agreement.save.agency.representation), true);
});

test("supports a final club counter in round four and blocks a fifth negotiation turn", () => {
  const sent = send();
  const clubCounterOne = evaluateTransferOffer(sent.save, sent.offer.id, "2026-07-01", database);
  assert.equal(clubCounterOne.offer.round, 2);

  const agencyCounter = submitTransferCounterOffer(clubCounterOne.save, sent.offer.id,
    { ...permanentTerms, feeEur: 1_200_000 }, "2026-07-01");
  assert.equal(agencyCounter.offer.round, 3);

  const clubCounterTwo = evaluateTransferOffer(agencyCounter.save, sent.offer.id, "2026-07-01", database);
  assert.equal(clubCounterTwo.status, "countered");
  assert.equal(clubCounterTwo.offer.round, 4);
  assert.equal(clubCounterTwo.counterOffer.feeEur, 1_800_000);

  const blockedFifthTurn = submitTransferCounterOffer(clubCounterTwo.save, sent.offer.id,
    { ...permanentTerms, feeEur: 1_700_000 }, "2026-07-01");
  assert.equal(blockedFifthTurn.changed, false);

  const agreement = acceptTransferCounterOffer(clubCounterTwo.save, sent.offer.id, "2026-07-02");
  assert.equal(agreement.status, "agreed");
  assert.equal(agreement.offer.round, 4);
  assert.equal(isValidTransferState(agreement.save.world.transfers, "2026-07-02",
    agreement.save.agency.clients, agreement.save.agency.representation), true);
});

test("rejects offers without creating moves or earning commissions", () => {
  const sent = send();
  const rejected = rejectTransferOffer(sent.save, sent.offer.id, "2026-07-02");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.save.world.transfers.moves.length, 0);
  assert.equal(rejected.save.world.transfers.earnedCommissionEur, 0);
  assert.equal(isValidTransferState(rejected.save.world.transfers, "2026-07-02", rejected.save.agency.clients, rejected.save.agency.representation), true);
});

test("completes an agreed permanent transfer and records a EUR agent commission exactly once", () => {
  const sent = send();
  const countered = evaluateTransferOffer(sent.save, sent.offer.id, "2026-07-01", database);
  const agreed = acceptTransferCounterOffer(countered.save, sent.offer.id, "2026-07-02");
  const completed = completeTransfer(agreed.save, sent.offer.id, "2026-07-02");
  assert.equal(completed.status, "completed");
  assert.equal(completed.commissionEur, 322_000);
  assert.equal(completed.save.world.transfers.earnedCommissionEur, 322_000);
  assert.equal(completed.save.world.transfers.ledger[0].currency, "EUR");
  assert.equal(completed.save.world.transfers.ledger[0].basisEur, 3_220_000);
  assert.equal(completed.save.world.transfers.ledger[0].commissionRate, 10);
  assert.equal(getPlayerCurrentClubId("player-1", "club-home", completed.save.world.transfers, "2026-07-02"), "club-target");
  assert.equal(completeTransfer(completed.save, sent.offer.id, "2026-07-02").changed, false);
  assert.equal(isValidTransferState(completed.save.world.transfers, "2026-07-02", completed.save.agency.clients, completed.save.agency.representation), true);
});

test("retains completed historical deals after an agency mandate ends", () => {
  const sent = send();
  const countered = evaluateTransferOffer(sent.save, sent.offer.id, "2026-07-01", database);
  const agreed = acceptTransferCounterOffer(countered.save, sent.offer.id, "2026-07-02");
  const completed = completeTransfer(agreed.save, sent.offer.id, "2026-07-02");
  assert.equal(isValidTransferState(completed.save.world.transfers, "2026-07-02", [], completed.save.agency.representation), true);
});

test("returns a loan to the most recent permanent club after an earlier permanent transfer", () => {
  const permanentOffer = send();
  const countered = evaluateTransferOffer(permanentOffer.save, permanentOffer.offer.id, "2026-07-01", database);
  const agreed = acceptTransferCounterOffer(countered.save, permanentOffer.offer.id, "2026-07-02");
  const permanentMove = completeTransfer(agreed.save, permanentOffer.offer.id, "2026-07-02");
  assert.equal(getPlayerCurrentClubId("player-1", "club-home", permanentMove.save.world.transfers, "2026-07-02"), "club-target");

  const loanOffer = createTransferOffer(permanentMove.save, "player-1", "club-other", "loan",
    loanTerms, "2026-07-03", database);
  assert.equal(loanOffer.offer.fromClubId, "club-target");
  const loanAgreed = evaluateTransferOffer(loanOffer.save, loanOffer.offer.id, "2026-07-03", database);
  const loanMove = completeTransfer(loanAgreed.save, loanOffer.offer.id, "2026-07-03");
  assert.equal(getPlayerCurrentClubId("player-1", "club-home", loanMove.save.world.transfers, "2026-12-31"), "club-other");

  const returned = advanceTransferState(loanMove.save, "2027-01-03");
  assert.equal(getPlayerCurrentClubId("player-1", "club-home", returned.save.world.transfers, "2027-01-03"), "club-target");
  assert.equal(isValidTransferState(returned.save.world.transfers, "2027-01-03", returned.save.agency.clients, returned.save.agency.representation), true);
});

test("supports loans, tracks the temporary club, and returns the player on the due date", () => {
  const sent = send(makeSave(), "loan", loanTerms);
  const response = evaluateTransferOffer(sent.save, sent.offer.id, "2026-07-01", database);
  assert.equal(response.status, "agreed");
  const completed = completeTransfer(response.save, sent.offer.id, "2026-07-01");
  assert.equal(completed.status, "completed");
  assert.equal(completed.move.returnDate, "2027-01-01");
  assert.equal(getPlayerCurrentClubId("player-1", "club-home", completed.save.world.transfers, "2026-12-31"), "club-target");
  const returned = advanceTransferState(completed.save, "2027-01-01");
  assert.deepEqual(returned.returnedLoans, [completed.move.id]);
  assert.equal(getPlayerCurrentClubId("player-1", "club-home", returned.save.world.transfers, "2027-01-01"), "club-home");
  assert.equal(isValidTransferState(returned.save.world.transfers, "2027-01-01", returned.save.agency.clients, returned.save.agency.representation), true);
});

test("expires open transfer negotiations when the representation mandate ends", () => {
  const sent = send();
  const terminated = structuredClone(sent.save);
  terminated.agency.clients = [];
  terminated.agency.representation.contracts[0] = {
    ...terminated.agency.representation.contracts[0],
    status: "terminated",
    endedOn: "2026-07-02"
  };
  const advanced = advanceTransferState(terminated, "2026-07-02");
  assert.deepEqual(advanced.expiredOffers, [sent.offer.id]);
  assert.equal(advanced.save.world.transfers.offers[0].status, "expired");
  assert.equal(isValidTransferState(advanced.save.world.transfers, "2026-07-02", [],
    terminated.agency.representation), true);
});

test("expires agreed transfer files when no active representation mandate remains", () => {
  const sent = send();
  const countered = evaluateTransferOffer(sent.save, sent.offer.id, "2026-07-01", database);
  const agreed = acceptTransferCounterOffer(countered.save, sent.offer.id, "2026-07-02");
  const terminated = structuredClone(agreed.save);
  terminated.agency.clients = [];
  terminated.agency.representation.contracts[0] = {
    ...terminated.agency.representation.contracts[0],
    status: "terminated",
    endedOn: "2026-07-03"
  };
  const advanced = advanceTransferState(terminated, "2026-07-03");
  assert.deepEqual(advanced.expiredOffers, [sent.offer.id]);
  assert.equal(advanced.save.world.transfers.offers[0].status, "expired");
  assert.equal(isValidTransferState(advanced.save.world.transfers, "2026-07-03", [],
    terminated.agency.representation), true);
});

test("expires stale offers as career time advances", () => {
  const sent = send();
  const advanced = advanceTransferState(sent.save, "2026-07-16");
  assert.deepEqual(advanced.expiredOffers, [sent.offer.id]);
  assert.equal(advanced.save.world.transfers.offers[0].status, "expired");
  assert.equal(isValidTransferState(advanced.save.world.transfers, "2026-07-16", advanced.save.agency.clients, advanced.save.agency.representation), true);
});

test("expires open offers when the transfer window closes before their 14-day validity", () => {
  const sent = send(makeSave("2026-08-31"));
  assert.equal(sent.offer.expiresDate, "2026-09-14");
  const advanced = advanceTransferState(sent.save, "2026-09-01");
  assert.deepEqual(advanced.expiredOffers, [sent.offer.id]);
  assert.equal(advanced.save.world.transfers.offers[0].status, "expired");
});

test("expires an agreed deal that misses the end of its registration window", () => {
  const save = makeSave();
  const sent = createTransferOffer(save, "player-1", "club-target", "permanent",
    { ...permanentTerms, feeEur: 2_000_000 }, "2026-08-31", database);
  const agreed = evaluateTransferOffer(sent.save, sent.offer.id, "2026-08-31", database);
  assert.equal(agreed.status, "agreed");
  const advanced = advanceTransferState(agreed.save, "2026-09-01");
  assert.deepEqual(advanced.expiredOffers, [sent.offer.id]);
  assert.equal(advanced.save.world.transfers.offers[0].status, "expired");
  assert.equal(isValidTransferState(advanced.save.world.transfers, "2026-09-01", advanced.save.agency.clients, advanced.save.agency.representation), true);
});

test("rejects impossible transfer timelines and inconsistent permanent/loan moves", () => {
  const sent = send();
  const expiredOpen = structuredClone(sent.save.world.transfers);
  assert.equal(isValidTransferState(expiredOpen, "2026-07-16", sent.save.agency.clients, sent.save.agency.representation), false);

  const countered = evaluateTransferOffer(sent.save, sent.offer.id, "2026-07-01", database);
  const agreed = acceptTransferCounterOffer(countered.save, sent.offer.id, "2026-07-02");
  const completed = completeTransfer(agreed.save, sent.offer.id, "2026-07-02");

  const badClub = structuredClone(completed.save.world.transfers);
  badClub.moves[0].toClubId = "club-other";
  assert.equal(isValidTransferState(badClub, "2026-07-02", completed.save.agency.clients, completed.save.agency.representation), false);

  const endedPermanent = structuredClone(completed.save.world.transfers);
  endedPermanent.moves[0].status = "returned";
  endedPermanent.moves[0].returnedDate = "2026-07-03";
  assert.equal(isValidTransferState(endedPermanent, "2026-07-03", completed.save.agency.clients, completed.save.agency.representation), false);

  const loanOffer = send(makeSave(), "loan", loanTerms);
  const loanAgreed = evaluateTransferOffer(loanOffer.save, loanOffer.offer.id, "2026-07-01", database);
  const loanCompleted = completeTransfer(loanAgreed.save, loanOffer.offer.id, "2026-07-01");
  assert.equal(isValidTransferState(loanCompleted.save.world.transfers, "2027-01-01",
    loanCompleted.save.agency.clients, loanCompleted.save.agency.representation), false,
    "a loan past its return date must be advanced and marked returned");
});

test("safely rejects malformed representation contract collections", () => {
  const noContracts = makeSave();
  noContracts.agency.representation.contracts = {};
  const failedOffer = createTransferOffer(noContracts, "player-1", "club-target",
    "permanent", permanentTerms, "2026-07-01", database);
  assert.equal(failedOffer.changed, false);

  const sent = send();
  const countered = evaluateTransferOffer(sent.save, sent.offer.id, "2026-07-01", database);
  const agreed = acceptTransferCounterOffer(countered.save, sent.offer.id, "2026-07-02");
  const completed = completeTransfer(agreed.save, sent.offer.id, "2026-07-02");
  const malformed = { ...completed.save.agency.representation, contracts: {} };
  assert.equal(isValidTransferState(completed.save.world.transfers, "2026-07-02",
    completed.save.agency.clients, malformed), false);
});

test("rejects malformed, duplicated or financially inconsistent transfer state", () => {
  const sent = send();
  const duplicate = structuredClone(sent.save.world.transfers);
  duplicate.offers.push({ ...duplicate.offers[0] });
  assert.equal(isValidTransferState(duplicate, "2026-07-01", sent.save.agency.clients, sent.save.agency.representation), false);
  const badLedger = structuredClone(sent.save.world.transfers);
  badLedger.earnedCommissionEur = 1;
  assert.equal(isValidTransferState(badLedger, "2026-07-01", sent.save.agency.clients, sent.save.agency.representation), false);

  const sentForLedger = send();
  const countered = evaluateTransferOffer(sentForLedger.save, sentForLedger.offer.id, "2026-07-01", database);
  const agreed = acceptTransferCounterOffer(countered.save, sentForLedger.offer.id, "2026-07-02");
  const completed = completeTransfer(agreed.save, sentForLedger.offer.id, "2026-07-02");
  const wrongBasis = structuredClone(completed.save.world.transfers);
  wrongBasis.ledger[0].basisEur += 1;
  assert.equal(isValidTransferState(wrongBasis, "2026-07-02", completed.save.agency.clients, completed.save.agency.representation), false);
});

\ntest("uses league-specific registration windows and roster limits", async () => {
  const { getLeagueTransferRules, getTransferWindowForClub, getClubRegistrationStatus, getClubTransferFinancials } =
    await import("../src/engines/club-transfer-rules.js");
  const leagueDb = {
    clubs: [{ id: "egypt", nameAr: "نادي مصري", leagueId: "league-eg-premier", countryId: "EG", simulationProfile: 70 }],
    players: [{ id: "foreign", name: "Foreign", clubId: "other", countryId: "BR", age: 25, rating: 70 }],
    squadPlayers: []
  };
  assert.equal(getTransferWindowForClub("2026-09-10", "egypt", leagueDb).active, true);
  assert.equal(getTransferWindowForClub("2026-09-16", "egypt", leagueDb).active, false);
  assert.equal(getLeagueTransferRules("league-eg-premier").maxForeignPlayers, 5);
  const roster = Array.from({ length: 5 }, (_, index) => ({
    id: "foreign-" + index, name: "Foreign " + index, clubId: "egypt", countryId: "BR", age: 25, rating: 60
  }));
  const db = { ...leagueDb, players: [...leagueDb.players, ...roster] };
  const status = getClubRegistrationStatus("egypt", "foreign", createInitialTransferState(), "2026-07-01", db);
  assert.equal(status.eligible, false);
  assert.match(status.reason, /أجنبي/);
  const finances = getClubTransferFinancials("egypt", createInitialTransferState(), "2026-07-01", db);
  assert.equal(finances.valid, true);
  assert.ok(finances.budgetEur > 0);
  assert.ok(finances.availableWagesWeeklyEur >= 0);
});

test("turns an expired permanent contract into a free agent", () => {
  const sent = send(makeSave("2026-07-01"), "permanent", { ...permanentTerms, contractYears: 1 });
  const agreed = evaluateTransferOffer(sent.save, sent.offer.id, "2026-07-01", database);
  const completed = completeTransfer(agreed.save, sent.offer.id, "2026-07-01");
  const advanced = advanceTransferState(completed.save, "2027-07-01", database);
  assert.deepEqual(advanced.expiredContracts, ["player-1"]);
  assert.equal(advanced.save.world.transfers.moves[0].status, "expired");
  assert.equal(getPlayerCurrentClubId("player-1", "club-home", advanced.save.world.transfers, "2027-07-01", database), null);
  assert.equal(isValidTransferState(advanced.save.world.transfers, "2027-07-01",
    advanced.save.agency.clients, advanced.save.agency.representation), true);
});

test("exercises a loan purchase option and keeps the purchased club registration", () => {
  const sent = send(makeSave(), "loan", loanTerms);
  const agreed = evaluateTransferOffer(sent.save, sent.offer.id, "2026-07-01", database);
  const loan = completeTransfer(agreed.save, sent.offer.id, "2026-07-01");
  const purchased = exerciseLoanOption(loan.save, loan.move.id, "2026-07-02", database);
  assert.equal(purchased.changed, true);
  assert.equal(purchased.action, "option-exercised");
  assert.equal(purchased.move.type, "permanent");
  assert.equal(getPlayerCurrentClubId("player-1", "club-home", purchased.save.world.transfers, "2026-07-02", database), "club-target");
  assert.equal(purchased.save.world.transfers.moves.find((item) => item.id === loan.move.id).status, "purchased");
  assert.equal(isValidTransferState(purchased.save.world.transfers, "2026-07-02",
    purchased.save.agency.clients, purchased.save.agency.representation), true);
  assert.equal(exerciseLoanOption(purchased.save, loan.move.id, "2026-07-03", database).changed, false);
});
