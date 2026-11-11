import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave, isValidSave } from "../src/core/storage.js";
import { advanceCareerDays } from "../src/engines/career-calendar.js";
import {
  createInitialRepresentationState,
  createRepresentationOffer,
  evaluateRepresentationOffer,
  acceptRepresentationCounterOffer,
  submitRepresentationCounterOffer,
  createRepresentationRenewalOffer,
  createRepresentationInteraction,
  completeRepresentationMeeting,
  getPlayerRepresentationProfile,
  getRepresentationContractExpiry,
  getRepresentationContractCommission,
  getRepresentationContractType,
  getRepresentationRelationshipLabel,
  getAgencyReputationScore,
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
  assert.deepEqual(response.counterOffer, {
    commissionRate: sent.offer.playerPreferences.preferredCommissionRate,
    termDays: sent.offer.playerPreferences.preferredTermDays,
    representationType: sent.offer.playerPreferences.prefersExclusive ? "exclusive" : "non-exclusive"
  });
  assert.equal(response.save.agency.clients.length, 0);
  assert.equal(response.save.agency.representation.offers[0].status, "countered");

  const accepted = acceptRepresentationCounterOffer(response.save, sent.offer.id);
  assert.equal(accepted.changed, true);
  assert.equal(accepted.status, "signed");
  assert.equal(accepted.contract.commissionRate, sent.offer.playerPreferences.preferredCommissionRate);
  assert.equal(accepted.contract.termDays, sent.offer.playerPreferences.preferredTermDays);
  assert.equal(accepted.contract.status, "active");
  assert.equal(accepted.contract.representationType, sent.offer.playerPreferences.prefersExclusive ? "exclusive" : "non-exclusive");
  assert.deepEqual(accepted.save.agency.clients, ["seed-test-player"]);
  assert.equal(accepted.save.agency.representation.offers[0].resolution, "counter-accepted");
  assert.deepEqual(
    accepted.save.agency.representation.history.slice(0, 4).map((entry) => entry.type),
    ["contract-signed", "offer-accepted", "player-countered", "offer-sent"]
  );
  assert.equal(isValidSave(accepted.save), true);
});

test("player accepts an offer that fits the player's commission and term limits", () => {
  const profile = player({ id: "test-player-22", age: 22, rating: 68, potential: 80 });
  const preferences = getPlayerRepresentationProfile(profile);
  const sent = createRepresentationOffer(createInitialSave(), profile, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
  });
  const response = evaluateRepresentationOffer(sent.save, sent.offer.id);
  assert.equal(response.status, "signed");
  assert.equal(response.contract.commissionRate, preferences.preferredCommissionRate);
  assert.equal(response.contract.termDays, preferences.preferredTermDays);
  assert.equal(response.contract.relationshipScore, preferences.prefersExclusive ? 70 : 62);
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
  const profile = player({ age: 22, rating: 68, potential: 80 });
  const preferences = getPlayerRepresentationProfile(profile);
  const sent = createRepresentationOffer(createInitialSave(), profile, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
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
  const profile = player({ age: 22, rating: 68, potential: 80 });
  const preferences = getPlayerRepresentationProfile(profile);
  const sent = createRepresentationOffer(createInitialSave(), profile, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
  });
  const offerAtExpiry = advanceToDate(sent.save, "2026-08-01");
  const noResponse = advanceRepresentationState(offerAtExpiry, "2026-08-01");
  assert.deepEqual(noResponse.expiredOffers, [sent.offer.id]);
  assert.equal(noResponse.save.agency.representation.offers[0].status, "expired");
  assert.equal(isValidSave(noResponse.save), true);

  const signedOffer = createRepresentationOffer(createInitialSave(), profile, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
  });
  const signed = evaluateRepresentationOffer(signedOffer.save, signedOffer.offer.id);
  const contractAtExpiry = advanceToDate(signed.save, signed.contract.expiresOn);
  const expired = advanceRepresentationState(contractAtExpiry, signed.contract.expiresOn);
  assert.deepEqual(expired.expiredContracts, [signed.contract.id]);
  assert.equal(expired.save.agency.representation.contracts[0].status, "expired");
  assert.deepEqual(expired.save.agency.clients, []);
  assert.equal(expired.save.agency.representation.history[0].type, "contract-expired");
  assert.equal(isValidSave(expired.save), true);
});

test("rejects invalid terms, tampered contracts, and active contracts missing from clients", () => {
  const invalidTerms = sendOffer(createInitialSave(), player(), { commissionRate: 16, termDays: 365 });
  assert.equal(invalidTerms.changed, false);

  const profile = player({ age: 22, rating: 68, potential: 80 });
  const preferences = getPlayerRepresentationProfile(profile);
  const sent = createRepresentationOffer(createInitialSave(), profile, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
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

test("generates stable personality and negotiation preferences for each player identity", () => {
  const profile = getPlayerRepresentationProfile(player());
  assert.deepEqual(getPlayerRepresentationProfile(player()), profile);
  assert.ok(["ambitious", "loyal", "pragmatic", "cautious", "professional"].includes(profile.personality));
  assert.ok(profile.ambition >= 1 && profile.ambition <= 5);
  assert.ok(profile.loyalty >= 1 && profile.loyalty <= 5);
  assert.ok(profile.professionalism >= 1 && profile.professionalism <= 5);
  assert.ok(profile.preferredCommissionRate >= 7 && profile.preferredCommissionRate <= 12);
  assert.ok([365, 730, 1095].includes(profile.preferredTermDays));
  assert.notDeepEqual(profile, getPlayerRepresentationProfile(player({ id: "different-player-id" })));
});

test("supports multiple negotiation rounds and records both agency and player counters", () => {
  const sent = sendOffer(createInitialSave());
  const firstCounter = evaluateRepresentationOffer(sent.save, sent.offer.id);
  assert.equal(firstCounter.status, "countered");
  assert.equal(firstCounter.save.agency.representation.offers[0].round, 2);

  const agencyReply = submitRepresentationCounterOffer(firstCounter.save, sent.offer.id, {
    commissionRate: 15,
    termDays: 1095
  });
  assert.equal(agencyReply.status, "countered");
  assert.equal(agencyReply.save.agency.representation.offers[0].round, 3);
  assert.ok(agencyReply.counterOffer.commissionRate < 15);

  const finalAgreement = submitRepresentationCounterOffer(agencyReply.save, sent.offer.id, agencyReply.counterOffer);
  assert.equal(finalAgreement.status, "signed");
  assert.equal(finalAgreement.save.agency.clients.includes(sent.offer.playerId), true);
  assert.equal(finalAgreement.save.agency.representation.offers[0].resolution, "agency-countered");
  assert.ok(finalAgreement.save.agency.representation.history.some((entry) => entry.type === "agency-countered"));
  assert.equal(isValidSave(finalAgreement.save), true);
});

test("rejects a player negotiation after the final unsuccessful agency counter", () => {
  const sent = sendOffer(createInitialSave());
  const firstCounter = evaluateRepresentationOffer(sent.save, sent.offer.id);
  const secondCounter = submitRepresentationCounterOffer(firstCounter.save, sent.offer.id, {
    commissionRate: 15,
    termDays: 1095
  });
  const rejected = submitRepresentationCounterOffer(secondCounter.save, sent.offer.id, {
    commissionRate: 15,
    termDays: 1095
  });
  assert.equal(rejected.status, "rejected");
  assert.deepEqual(rejected.save.agency.clients, []);
  assert.equal(rejected.save.agency.representation.offers[0].status, "rejected");
  assert.equal(rejected.save.agency.representation.history[0].type, "offer-rejected");
  assert.equal(isValidSave(rejected.save), true);
});

test("renews a representation mandate without replacing its original contract history", () => {
  const save = createInitialSave();
  const profile = player({ age: 22, rating: 68, potential: 80 });
  const preferences = getPlayerRepresentationProfile(profile);
  const sent = createRepresentationOffer(save, profile, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
  });
  const signed = evaluateRepresentationOffer(sent.save, sent.offer.id);
  assert.equal(signed.status, "signed");

  const originalExpiry = signed.contract.expiresOn;
  const daysToAdvance = Math.round((Date.parse(originalExpiry + "T00:00:00.000Z") -
    Date.parse(signed.save.world.currentDate + "T00:00:00.000Z")) / 86400000) - 60;
  const nearExpiry = advanceToDate(signed.save, new Date(
    Date.parse(signed.save.world.currentDate + "T00:00:00.000Z") + daysToAdvance * 86400000
  ).toISOString().slice(0, 10));
  const renewal = createRepresentationRenewalOffer(nearExpiry, signed.contract.id, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
  });
  assert.equal(renewal.changed, true);
  assert.equal(renewal.offer.kind, "renewal");
  assert.equal(isValidSave(renewal.save), true);

  const renewed = evaluateRepresentationOffer(renewal.save, renewal.offer.id);
  assert.equal(renewed.status, "renewed");
  assert.equal(renewed.contract.id, signed.contract.id);
  assert.equal(renewed.contract.expiresOn, originalExpiry);
  assert.equal(renewed.contract.renewals.length, 1);
  assert.ok(getRepresentationContractExpiry(renewed.contract) > originalExpiry);
  assert.equal(getRepresentationContractCommission(renewed.contract, nearExpiry.world.currentDate), signed.contract.commissionRate);
  assert.equal(renewed.save.agency.clients.includes(profile.id), true);
  assert.equal(isValidSave(renewed.save), true);

  const afterRenewalStarts = advanceToDate(renewed.save, originalExpiry);
  assert.equal(getRepresentationContractCommission(
    afterRenewalStarts.agency.representation.contracts[0],
    afterRenewalStarts.world.currentDate
  ), preferences.preferredCommissionRate);
  assert.equal(isValidSave(afterRenewalStarts), true);
});

test("only allows renewal offers during the final 90 days and blocks duplicate renewals", () => {
  const save = createInitialSave();
  const profile = player({ age: 22, rating: 68, potential: 80 });
  const preferences = getPlayerRepresentationProfile(profile);
  const terms = {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
  };
  const sent = createRepresentationOffer(save, profile, terms);
  const signed = evaluateRepresentationOffer(sent.save, sent.offer.id);
  const tooEarly = createRepresentationRenewalOffer(signed.save, signed.contract.id, terms);
  assert.equal(tooEarly.changed, false);

  const remainingDate = new Date(Date.parse(signed.contract.expiresOn + "T00:00:00.000Z") - 60 * 86400000)
    .toISOString().slice(0, 10);
  const nearExpiry = advanceToDate(signed.save, remainingDate);
  const first = createRepresentationRenewalOffer(nearExpiry, signed.contract.id, terms);
  assert.equal(first.changed, true);
  const duplicate = createRepresentationRenewalOffer(first.save, signed.contract.id, terms);
  assert.equal(duplicate.changed, false);
  assert.match(duplicate.error, /عرض تجديد مفتوح/);
  assert.equal(isValidSave(first.save), true);
});

test("keeps first-slice v4 contracts valid and can renew them without profile metadata", () => {
  const profile = player({ id: "test-player-22", age: 22, rating: 68, potential: 80 });
  const preferences = getPlayerRepresentationProfile(profile);
  const sent = createRepresentationOffer(createInitialSave(), profile, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
  });
  const signed = evaluateRepresentationOffer(sent.save, sent.offer.id);
  const legacy = structuredClone(signed.save);
  delete legacy.agency.representation.offers[0].kind;
  delete legacy.agency.representation.offers[0].playerPreferences;
  delete legacy.agency.representation.contracts[0].rating;
  delete legacy.agency.representation.contracts[0].potential;
  delete legacy.agency.representation.contracts[0].playerPreferences;
  delete legacy.agency.representation.contracts[0].renewals;
  assert.equal(isValidSave(legacy), true);

  const targetDate = new Date(Date.parse(signed.contract.expiresOn + "T00:00:00.000Z") - 60 * 86400000)
    .toISOString().slice(0, 10);
  const nearExpiry = advanceToDate(legacy, targetDate);
  const renewal = createRepresentationRenewalOffer(nearExpiry, signed.contract.id, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
  });
  assert.equal(renewal.changed, true);
  assert.equal(isValidSave(renewal.save), true);
});

test("supports exclusive and non-exclusive mandates and lets reputation improve exclusive negotiation", () => {
  let profile;
  for (let index = 0; index < 100; index += 1) {
    const candidate = player({ id: "shared-mandate-player-" + index, age: 22, rating: 68, potential: 80 });
    if (!getPlayerRepresentationProfile(candidate).prefersExclusive) {
      profile = candidate;
      break;
    }
  }
  assert.ok(profile, "test fixture should include a player who prefers non-exclusive representation");
  const preferences = getPlayerRepresentationProfile(profile);
  const save = createInitialSave();
  const sharedOffer = createRepresentationOffer(save, profile, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays,
    representationType: "exclusive"
  });
  const sharedCounter = evaluateRepresentationOffer(sharedOffer.save, sharedOffer.offer.id);
  assert.equal(sharedCounter.status, "countered");
  assert.equal(sharedCounter.counterOffer.representationType, "non-exclusive");
  const acceptedShared = acceptRepresentationCounterOffer(sharedCounter.save, sharedOffer.offer.id);
  assert.equal(acceptedShared.contract.representationType, "non-exclusive");
  assert.equal(acceptedShared.contract.relationshipScore, 60);
  assert.equal(isValidSave(acceptedShared.save), true);

  const reputableSave = createInitialSave();
  reputableSave.agency.representation.reputationScore = 90;
  const exclusiveOffer = createRepresentationOffer(reputableSave, profile, {
    commissionRate: preferences.preferredCommissionRate - 1,
    termDays: preferences.preferredTermDays,
    representationType: "exclusive"
  });
  const exclusiveResponse = evaluateRepresentationOffer(exclusiveOffer.save, exclusiveOffer.offer.id);
  assert.equal(exclusiveResponse.status, "signed");
  assert.equal(exclusiveResponse.contract.representationType, "exclusive");
  assert.equal(exclusiveResponse.contract.relationshipScore, 70);
  assert.equal(getAgencyReputationScore(exclusiveResponse.save.agency.representation), 92);
  assert.equal(getRepresentationContractType(exclusiveResponse.contract, exclusiveResponse.save.world.currentDate), "exclusive");
  assert.equal(isValidSave(exclusiveResponse.save), true);
});

test("messages and calls receive deterministic responses as career time advances", () => {
  const profile = player({ id: "relationship-message-player", age: 22, rating: 68, potential: 80 });
  const preferences = getPlayerRepresentationProfile(profile);
  const sent = createRepresentationOffer(createInitialSave(), profile, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
  });
  const signed = evaluateRepresentationOffer(sent.save, sent.offer.id);
  const initialTrust = signed.contract.relationshipScore;
  const initialReputation = getAgencyReputationScore(signed.save.agency.representation);

  const message = createRepresentationInteraction(signed.save, signed.contract.id, "message");
  assert.equal(message.changed, true);
  assert.equal(message.interaction.status, "pending_response");
  assert.equal(message.interaction.dueDate, "2026-07-04");
  assert.equal(isValidSave(message.save), true);

  const duplicate = createRepresentationInteraction(message.save, signed.contract.id, "message");
  assert.equal(duplicate.changed, false);
  assert.match(duplicate.error, /رسالة بانتظار رد/);

  const afterReply = advanceToDate(message.save, message.interaction.dueDate);
  const storedInteraction = afterReply.agency.representation.interactions.find((item) => item.id === message.interaction.id);
  const updatedContract = afterReply.agency.representation.contracts.find((item) => item.id === signed.contract.id);
  assert.equal(storedInteraction.status, "resolved");
  assert.ok(["positive", "neutral", "negative"].includes(storedInteraction.outcome));
  assert.notEqual(updatedContract.relationshipScore, initialTrust);
  assert.equal(afterReply.agency.representation.history[0].type, "message-replied");
  assert.ok([initialReputation - 1, initialReputation, initialReputation + 1].includes(
    getAgencyReputationScore(afterReply.agency.representation)
  ));
  assert.equal(isValidSave(afterReply), true);

  const call = createRepresentationInteraction(afterReply, signed.contract.id, "call");
  assert.equal(call.changed, true);
  assert.equal(call.interaction.kind, "call");
  assert.equal(call.interaction.dueDate, "2026-07-05");
  const afterCall = advanceToDate(call.save, call.interaction.dueDate);
  assert.equal(afterCall.agency.representation.interactions.find((item) => item.id === call.interaction.id).status, "resolved");
  assert.equal(isValidSave(afterCall), true);
});

test("schedules and completes a client meeting, improving trust and agency reputation", () => {
  const profile = player({ id: "relationship-meeting-player", age: 22, rating: 68, potential: 80 });
  const preferences = getPlayerRepresentationProfile(profile);
  const sent = createRepresentationOffer(createInitialSave(), profile, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
  });
  const signed = evaluateRepresentationOffer(sent.save, sent.offer.id);
  const meetingDate = new Date(Date.parse(signed.save.world.currentDate + "T00:00:00.000Z") + 5 * 86400000)
    .toISOString().slice(0, 10);
  const scheduled = createRepresentationInteraction(signed.save, signed.contract.id, "meeting", meetingDate);
  assert.equal(scheduled.changed, true);
  assert.equal(scheduled.interaction.status, "scheduled");
  assert.equal(isValidSave(scheduled.save), true);

  const duplicate = createRepresentationInteraction(scheduled.save, signed.contract.id, "meeting", meetingDate);
  assert.equal(duplicate.changed, false);
  assert.match(duplicate.error, /اجتماع مجدول/);

  const tooEarly = completeRepresentationMeeting(scheduled.save, scheduled.interaction.id, "positive");
  assert.equal(tooEarly.changed, false);
  const atMeeting = advanceToDate(scheduled.save, meetingDate);
  const completed = completeRepresentationMeeting(atMeeting, scheduled.interaction.id, "positive");
  assert.equal(completed.changed, true);
  assert.equal(completed.interaction.status, "resolved");
  assert.equal(completed.interaction.outcome, "positive");
  assert.equal(completed.contract.relationshipScore, signed.contract.relationshipScore + 7);
  assert.equal(getAgencyReputationScore(completed.save.agency.representation),
    getAgencyReputationScore(atMeeting.agency.representation) + 2);
  assert.equal(completed.save.agency.representation.history[0].type, "meeting-completed");
  assert.equal(getRepresentationRelationshipLabel(completed.contract.relationshipScore), "جيدة");
  assert.equal(isValidSave(completed.save), true);
});

test("missed client meetings reduce relationship and agency reputation after the grace period", () => {
  const profile = player({ id: "relationship-missed-player", age: 22, rating: 68, potential: 80 });
  const preferences = getPlayerRepresentationProfile(profile);
  const sent = createRepresentationOffer(createInitialSave(), profile, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
  });
  const signed = evaluateRepresentationOffer(sent.save, sent.offer.id);
  const initialReputation = getAgencyReputationScore(signed.save.agency.representation);
  const meetingDate = new Date(Date.parse(signed.save.world.currentDate + "T00:00:00.000Z") + 2 * 86400000)
    .toISOString().slice(0, 10);
  const scheduled = createRepresentationInteraction(signed.save, signed.contract.id, "meeting", meetingDate);
  const afterGrace = advanceToDate(scheduled.save, new Date(
    Date.parse(meetingDate + "T00:00:00.000Z") + 8 * 86400000
  ).toISOString().slice(0, 10));
  const missed = afterGrace.agency.representation.interactions.find((item) => item.id === scheduled.interaction.id);
  const contract = afterGrace.agency.representation.contracts.find((item) => item.id === signed.contract.id);
  assert.equal(missed.status, "missed");
  assert.equal(contract.relationshipScore, signed.contract.relationshipScore - 8);
  assert.equal(getAgencyReputationScore(afterGrace.agency.representation), initialReputation - 2);
  assert.equal(afterGrace.agency.representation.history[0].type, "meeting-missed");
  assert.equal(isValidSave(afterGrace), true);
});

test("rejects tampered agency reputation and client interaction history", () => {
  const invalid = structuredClone(createInitialSave());
  invalid.agency.representation.reputationScore = 101;
  assert.equal(isValidSave(invalid), false);

  const profile = player({ id: "relationship-invalid-player", age: 22, rating: 68, potential: 80 });
  const preferences = getPlayerRepresentationProfile(profile);
  const sent = createRepresentationOffer(createInitialSave(), profile, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays
  });
  const signed = evaluateRepresentationOffer(sent.save, sent.offer.id);
  const message = createRepresentationInteraction(signed.save, signed.contract.id, "message");
  const tampered = structuredClone(message.save);
  tampered.agency.representation.interactions[0].contractId = "missing-contract";
  assert.equal(isValidSave(tampered), false);

  const badHistory = structuredClone(message.save);
  badHistory.agency.representation.history[0].interactionId = "missing-interaction";
  assert.equal(isValidSave(badHistory), false);
});

test("calculates the agreed commission without pretending it is already collected", () => {
  assert.equal(calculateRepresentationCommission(50000, 10), 5000);
  assert.equal(calculateRepresentationCommission(125000, 8), 10000);
  assert.throws(() => calculateRepresentationCommission(-1, 10), TypeError);
  assert.throws(() => calculateRepresentationCommission(1000, 20), TypeError);
});
