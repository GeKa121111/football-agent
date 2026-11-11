import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave, isValidSave } from "../src/core/storage.js";
import { advanceCareerDays } from "../src/engines/career-calendar.js";
import {
  createInitialRepresentationState,
  createRepresentationOffer,
  evaluateRepresentationOffer,
  acceptRepresentationCounterOffer,
  rejectRepresentationOffer,
  terminateRepresentationContract,
  advanceRepresentationState,
  calculateRepresentationCommission,
  isValidRepresentationState
} from "../src/engines/representation.js";

function player(overrides = {}) {
  return {
    id: "seed-test-player",
    name: "لاعب تجريبي",
    age: 18,
    club: "نادي تجريبي",
    position: "مهاجم",
    rating: 82,
    potential: 91,
    ...overrides
  };
}

function advanceToDate(save, targetDate) {
  const current = Date.parse(save.world.currentDate + "T00:00:00.000Z");
  const target = Date.parse(targetDate + "T00:00:00.000Z");
  let days = Math.round((target - current) / 86400000);
  assert.ok(days >= 0, "test date must not precede the saved career date");
  let advanced = save;
  while (days > 0) {
    const step = Math.min(days, 31);
    advanced = advanceCareerDays(advanced, step);
    days -= step;
  }
  return advanced;
}

function sendOffer(save, profile = player(), terms = { commissionRate: 15, termDays: 1095 }) {
  return createRepresentationOffer(save, profile, terms);
}

test("creates a clean representation workspace as part of a valid new save", () => {
  const save = createInitialSave();
  assert.deepEqual(save.agency.representation, createInitialRepresentationState());
  assert.equal(isValidRepresentationState(save.agency.representation, save.world.currentDate, save.agency.clients), true);
  assert.equal(isValidSave(save), true);
});

test("creates a pending representation offer without charging the agency", () => {
  const save = createInitialSave();
  const result = sendOffer(save);
  assert.equal(result.changed, true);
  assert.equal(result.status, "pending");
  assert.equal(result.offer.id, "representation-offer-1");
  assert.equal(result.offer.expiresDate, "2026-07-31");
  assert.equal(result.save.agency.balance, 100000);
  assert.deepEqual(result.save.agency.clients, []);
  assert.equal(result.save.agency.representation.history[0].type, "offer-sent");
  assert.equal(isValidSave(result.save), true);
});

test("validates strict calendar dates before creating representation offers", () => {
  const save = createInitialSave();
  const valid = createRepresentationOffer(save, player(), { commissionRate: 8, termDays: 365 }, "2026-07-01");
  assert.equal(valid.changed, true);
  const invalid = createRepresentationOffer(save, player(), { commissionRate: 8, termDays: 365 }, "2026-02-30");
  assert.equal(invalid.changed, false);
  assert.match(invalid.error, /تاريخ المسيرة غير صالح/);
});

test("prevents duplicate open offers and duplicate client representation", () => {
  const first = sendOffer(createInitialSave());
  const duplicate = sendOffer(first.save);
  assert.equal(duplicate.changed, false);
  assert.match(duplicate.error, /عرض تمثيل مفتوح/);

  const clientSave = {
    ...createInitialSave(),
    agency: { ...createInitialSave().agency, clients: ["seed-test-player"] }
  };
  const existingClient = sendOffer(clientSave);
  assert.equal(existingClient.changed, false);
  assert.match(existingClient.error, /عميل حالي/);
});

test("player can counter a high commission and long mandate, then sign when the agency accepts", () => {
  const sent = sendOffer(createInitialSave());
  const response = evaluateRepresentationOffer(sent.save, sent.offer.id);
  assert.equal(response.changed, true);
  assert.equal(response.status, "countered");
  assert.deepEqual(response.counterOffer, { commissionRate: 8, termDays: 365 });
  assert.equal(response.save.agency.clients.length, 0);
  assert.equal(response.save.agency.representation.offers[0].status, "countered");

  const accepted = acceptRepresentationCounterOffer(response.save, sent.offer.id);
  assert.equal(accepted.changed, true);
  assert.equal(accepted.status, "signed");
  assert.equal(accepted.contract.commissionRate, 8);
  assert.equal(accepted.contract.termDays, 365);
  assert.equal(accepted.contract.status, "active");
  assert.deepEqual(accepted.save.agency.clients, ["seed-test-player"]);
  assert.equal(accepted.save.agency.representation.offers[0].resolution, "counter-accepted");
  assert.deepEqual(
    accepted.save.agency.representation.history.slice(0, 4).map((entry) => entry.type),
    ["contract-signed", "offer-accepted", "player-countered", "offer-sent"]
  );
  assert.equal(isValidSave(accepted.save), true);
});

test("player accepts an offer that fits the player's commission and term limits", () => {
  const sent = sendOffer(createInitialSave(), player({ age: 22, rating: 68, potential: 80 }), {
    commissionRate: 9,
    termDays: 730
  });
  const response = evaluateRepresentationOffer(sent.save, sent.offer.id);
  assert.equal(response.status, "signed");
  assert.equal(response.contract.commissionRate, 9);
  assert.equal(response.contract.termDays, 730);
  assert.equal(response.contract.relationshipScore, 70);
  assert.equal(isValidSave(response.save), true);
});

test("agency can decline a counteroffer without creating a client", () => {
  const sent = sendOffer(createInitialSave());
  const counter = evaluateRepresentationOffer(sent.save, sent.offer.id);
  const declined = rejectRepresentationOffer(counter.save, sent.offer.id);
  assert.equal(declined.changed, true);
  assert.equal(declined.status, "rejected");
  assert.deepEqual(declined.save.agency.clients, []);
  assert.equal(declined.save.agency.representation.offers[0].counterOffer, undefined);
  assert.equal(isValidSave(declined.save), true);
});

test("ending a mandate removes the active client but preserves the contract and history", () => {
  const sent = sendOffer(createInitialSave(), player({ age: 22, rating: 68, potential: 80 }), {
    commissionRate: 9,
    termDays: 730
  });
  const signed = evaluateRepresentationOffer(sent.save, sent.offer.id);
  const atTerminationDate = advanceToDate(signed.save, "2026-08-01");
  const ended = terminateRepresentationContract(atTerminationDate, signed.contract.id, "2026-08-01");
  assert.equal(ended.changed, true);
  assert.deepEqual(ended.save.agency.clients, []);
  assert.equal(ended.save.agency.representation.contracts[0].status, "terminated");
  assert.equal(ended.save.agency.representation.contracts[0].endedOn, "2026-08-01");
  assert.equal(ended.save.agency.representation.history[0].type, "contract-terminated");
  assert.equal(isValidSave(ended.save), true);
});

test("calendar progression expires offers and contracts without dropping archival history", () => {
  const sent = sendOffer(createInitialSave(), player({ age: 22, rating: 68, potential: 80 }), {
    commissionRate: 9,
    termDays: 365
  });
  const offerAtExpiry = advanceToDate(sent.save, "2026-08-01");
  const noResponse = advanceRepresentationState(offerAtExpiry, "2026-08-01");
  assert.deepEqual(noResponse.expiredOffers, [sent.offer.id]);
  assert.equal(noResponse.save.agency.representation.offers[0].status, "expired");
  assert.equal(isValidSave(noResponse.save), true);

  const signedOffer = sendOffer(createInitialSave(), player({ age: 22, rating: 68, potential: 80 }), {
    commissionRate: 9,
    termDays: 365
  });
  const signed = evaluateRepresentationOffer(signedOffer.save, signedOffer.offer.id);
  const contractAtExpiry = advanceToDate(signed.save, "2027-07-01");
  const expired = advanceRepresentationState(contractAtExpiry, "2027-07-01");
  assert.deepEqual(expired.expiredContracts, [signed.contract.id]);
  assert.equal(expired.save.agency.representation.contracts[0].status, "expired");
  assert.deepEqual(expired.save.agency.clients, []);
  assert.equal(expired.save.agency.representation.history[0].type, "contract-expired");
  assert.equal(isValidSave(expired.save), true);
});

test("rejects invalid terms, tampered contracts, and active contracts missing from clients", () => {
  const invalidTerms = sendOffer(createInitialSave(), player(), { commissionRate: 16, termDays: 365 });
  assert.equal(invalidTerms.changed, false);

  const sent = sendOffer(createInitialSave(), player({ age: 22, rating: 68, potential: 80 }), {
    commissionRate: 9,
    termDays: 365
  });
  const signed = evaluateRepresentationOffer(sent.save, sent.offer.id);
  const badRate = structuredClone(signed.save);
  badRate.agency.representation.contracts[0].commissionRate = 30;
  assert.equal(isValidSave(badRate), false);

  const missingClient = structuredClone(signed.save);
  missingClient.agency.clients = [];
  assert.equal(isValidSave(missingClient), false);

  const duplicateHistory = structuredClone(signed.save);
  duplicateHistory.agency.representation.history.push({ ...duplicateHistory.agency.representation.history[0] });
  assert.equal(isValidSave(duplicateHistory), false);
});

test("calculates the agreed commission without pretending it is already collected", () => {
  assert.equal(calculateRepresentationCommission(50000, 10), 5000);
  assert.equal(calculateRepresentationCommission(125000, 8), 10000);
  assert.throws(() => calculateRepresentationCommission(-1, 10), TypeError);
  assert.throws(() => calculateRepresentationCommission(1000, 20), TypeError);
});
