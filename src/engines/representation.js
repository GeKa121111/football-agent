const CONTRACT_TERMS = Object.freeze([365, 730, 1095]);
const OFFER_VALIDITY_DAYS = 30;
const MAX_OFFERS = 50;
const MAX_CONTRACTS = 100;
const MAX_HISTORY = 300;
const MAX_INTERACTIONS = 300;
const INTERACTION_KINDS = new Set(["message", "call", "meeting"]);
const INTERACTION_STATUSES = new Set(["pending_response", "scheduled", "resolved", "missed"]);
const INTERACTION_OUTCOMES = new Set(["positive", "neutral", "negative"]);
const REPRESENTATION_TYPES = new Set(["exclusive", "non-exclusive"]);

const OFFER_STATUSES = new Set(["pending", "countered", "accepted", "rejected", "expired"]);
const CONTRACT_STATUSES = new Set(["active", "terminated", "expired"]);
const HISTORY_TYPES = new Set([
  "offer-sent",
  "player-countered",
  "agency-countered",
  "offer-accepted",
  "offer-rejected",
  "offer-expired",
  "contract-signed",
  "contract-renewed",
  "renewal-offer-sent",
  "message-sent",
  "message-replied",
  "meeting-scheduled",
  "meeting-completed",
  "meeting-missed",
  "contract-terminated",
  "contract-expired"
]);
const PERSONALITIES = Object.freeze({
  ambitious: "طموح",
  loyal: "وفيّ",
  pragmatic: "عملي",
  cautious: "حذر",
  professional: "احترافي"
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(date, days) {
  const value = new Date(date + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function sequenceOf(id, prefix) {
  const match = new RegExp("^" + prefix + "-(\\d+)$").exec(id);
  return match ? Number(match[1]) : 0;
}

function validTerms(commissionRate, termDays) {
  return Number.isInteger(commissionRate) &&
    commissionRate >= 5 && commissionRate <= 15 &&
    CONTRACT_TERMS.includes(termDays);
}


function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isValidPlayerPreferences(value) {
  return isRecord(value) &&
    Object.hasOwn(PERSONALITIES, value.personality) &&
    Number.isInteger(value.ambition) && value.ambition >= 1 && value.ambition <= 5 &&
    Number.isInteger(value.loyalty) && value.loyalty >= 1 && value.loyalty <= 5 &&
    Number.isInteger(value.professionalism) && value.professionalism >= 1 && value.professionalism <= 5 &&
    Number.isInteger(value.preferredCommissionRate) && value.preferredCommissionRate >= 5 && value.preferredCommissionRate <= 15 &&
    CONTRACT_TERMS.includes(value.preferredTermDays) &&
    (value.prefersExclusive === undefined || typeof value.prefersExclusive === "boolean");
}

/**
 * Stable, identity-based player preferences. These are generated once when an
 * offer is created and then snapshotted so a player's negotiation stance
 * cannot change between reloads or browser sessions.
 */
export function getPlayerRepresentationProfile(player) {
  const id = typeof player?.id === "string" ? player.id : "unknown-player";
  const hash = stableHash(id);
  const personalities = Object.keys(PERSONALITIES);
  const personality = personalities[hash % personalities.length];
  const ambition = 1 + ((hash >>> 3) % 5);
  const loyalty = 1 + ((hash >>> 7) % 5);
  const professionalism = 1 + ((hash >>> 11) % 5);
  const rating = Number.isInteger(player?.rating) ? player.rating : 70;
  const age = Number.isInteger(player?.age) ? player.age : 25;
  const baseCommission = rating >= 80 ? 8 : rating >= 72 ? 9 : 10;
  const commissionAdjustment =
    (ambition >= 4 ? -1 : 0) +
    (professionalism >= 4 ? -1 : 0) +
    (loyalty >= 4 ? 1 : 0);
  const preferredCommissionRate = clamp(baseCommission + commissionAdjustment, 7, 12);
  const preferredTermDays = age <= 20
    ? (loyalty >= 4 ? 730 : 365)
    : (loyalty >= 4 ? 1095 : 730);
  return {
    personality,
    ambition,
    loyalty,
    professionalism,
    preferredCommissionRate,
    preferredTermDays,
    prefersExclusive: loyalty >= 4
  };
}

function getOfferPreferences(offer) {
  if (isValidPlayerPreferences(offer.playerPreferences)) return offer.playerPreferences;
  return getPlayerRepresentationProfile({
    id: offer.playerId,
    age: offer.age,
    rating: offer.rating,
    potential: offer.potential
  });
}

export function getRepresentationContractExpiry(contract) {
  const renewals = Array.isArray(contract?.renewals) ? contract.renewals : [];
  return renewals.length > 0 ? renewals[renewals.length - 1].expiresOn : contract?.expiresOn;
}

export function getRepresentationContractCommission(contract, currentDate) {
  let commissionRate = contract?.commissionRate ?? 0;
  const renewals = Array.isArray(contract?.renewals) ? contract.renewals : [];
  for (const renewal of renewals) {
    if (isCalendarDate(currentDate) && currentDate >= renewal.startsOn) {
      commissionRate = renewal.commissionRate;
    }
  }
  return commissionRate;
}

function playerAcceptsTerms(offer, terms) {
  const preferences = getOfferPreferences(offer);
  const agencyReputation = Number.isInteger(offer.agencyReputation) ? offer.agencyReputation : 50;
  const commissionAllowance = preferences.preferredCommissionRate -
    (agencyReputation >= 80 ? 1 : 0) + (offer.round >= 2 ? 1 : 0);
  const preferredRepresentationType = preferences.prefersExclusive === true || agencyReputation >= 90
    ? "exclusive"
    : "non-exclusive";
  return terms.commissionRate <= commissionAllowance &&
    terms.termDays === preferences.preferredTermDays &&
    normalizeRepresentationType(terms.representationType ?? offer.representationType) === preferredRepresentationType;
}

function buildPlayerCounterOffer(offer) {
  const preferences = getOfferPreferences(offer);
  const concession = offer.round >= 2 ? 1 : 0;
  const agencyReputation = Number.isInteger(offer.agencyReputation) ? offer.agencyReputation : 50;
  return {
    commissionRate: clamp(preferences.preferredCommissionRate + concession, 5, 15),
    termDays: preferences.preferredTermDays,
    representationType: preferences.prefersExclusive === true || agencyReputation >= 90
      ? "exclusive"
      : "non-exclusive"
  };
}


function normalizeRepresentationType(value) {
  return value === "non-exclusive" ? "non-exclusive" : "exclusive";
}

function isValidRepresentationType(value) {
  return REPRESENTATION_TYPES.has(value);
}

function currentAgencyReputation(representation) {
  return Number.isInteger(representation?.reputationScore)
    ? clamp(representation.reputationScore, 0, 100)
    : 50;
}

function adjustAgencyReputation(representation, delta) {
  return {
    ...representation,
    reputationScore: clamp(currentAgencyReputation(representation) + delta, 0, 100)
  };
}

function interactionList(representation) {
  return Array.isArray(representation?.interactions) ? representation.interactions : [];
}

function interactionSequence(representation) {
  return Number.isSafeInteger(representation?.nextInteractionSequence) &&
    representation.nextInteractionSequence > 0
    ? representation.nextInteractionSequence
    : 1;
}

function replaceInteraction(representation, interactionId, patch) {
  return {
    ...representation,
    interactions: interactionList(representation).map((interaction) =>
      interaction.id === interactionId ? { ...interaction, ...patch } : interaction
    )
  };
}

function relationshipLabel(score) {
  if (score >= 80) return "ممتازة";
  if (score >= 60) return "جيدة";
  if (score >= 40) return "متوسطة";
  return "متوترة";
}

export function getRepresentationRelationshipLabel(score) {
  return Number.isInteger(score) ? relationshipLabel(clamp(score, 0, 100)) : "غير محددة";
}

export function getAgencyReputationScore(representation) {
  return currentAgencyReputation(representation);
}

function nextHistory(representation, type, player, date, note, references = {}) {
  const entry = {
    id: "representation-history-" + representation.nextHistorySequence,
    type,
    playerId: player.playerId ?? player.id,
    playerName: player.playerName ?? player.name,
    date,
    note,
    ...references
  };
  return {
    ...representation,
    nextHistorySequence: representation.nextHistorySequence + 1,
    history: [entry, ...representation.history].slice(0, MAX_HISTORY)
  };
}

function replaceOffer(representation, offerId, patch) {
  return {
    ...representation,
    offers: representation.offers.map((offer) =>
      offer.id === offerId ? { ...offer, ...patch } : offer
    )
  };
}

function createContract(save, offer, terms, currentDate, resolution) {
  const representation = save.agency.representation;
  const contractId = "representation-contract-" + representation.nextContractSequence;
  const contract = {
    id: contractId,
    offerId: offer.id,
    playerId: offer.playerId,
    playerName: offer.playerName,
    age: offer.age,
    club: offer.club,
    position: offer.position,
    rating: offer.rating,
    potential: offer.potential,
    playerPreferences: getOfferPreferences(offer),
    representationType: normalizeRepresentationType(terms.representationType ?? offer.representationType),
    signedOn: currentDate,
    expiresOn: addDays(currentDate, terms.termDays),
    termDays: terms.termDays,
    commissionRate: terms.commissionRate,
    renewals: [],
    relationshipScore: clamp(
      (resolution === "counter-accepted" ? 68 : resolution === "agency-countered" ? 74 : 70) -
      (normalizeRepresentationType(terms.representationType ?? offer.representationType) === "non-exclusive" ? 8 : 0),
      0,
      100
    ),
    status: "active"
  };
  let updated = {
    ...representation,
    nextContractSequence: representation.nextContractSequence + 1,
    contracts: [contract, ...representation.contracts].slice(0, MAX_CONTRACTS)
  };
  updated = replaceOffer(updated, offer.id, {
    status: "accepted",
    contractId,
    resolution
  });
  updated = nextHistory(updated, "offer-accepted", offer, currentDate,
    resolution === "counter-accepted" ? "وافق الوكيل على الشروط المضادة للاعب." : "وافق اللاعب على عرض التمثيل.");
  updated = nextHistory(updated, "contract-signed", offer, currentDate,
    "تم توقيع عقد تمثيل لمدة " + Math.round(terms.termDays / 365) + " سنة وبعمولة " + terms.commissionRate + "%.",
    { offerId: offer.id, contractId });
  const clients = save.agency.clients.includes(offer.playerId)
    ? save.agency.clients
    : [...save.agency.clients, offer.playerId];
  return {
    ...save,
    agency: {
      ...save.agency,
      clients,
      representation: updated
    }
  };
}


function commitRepresentationAgreement(save, offer, terms, currentDate, resolution) {
  if (offer.kind === "renewal") {
    const representation = save.agency.representation;
    const contract = representation.contracts.find((item) => item.id === offer.renewalContractId);
    if (!contract || contract.status !== "active") {
      return { changed: false, save, error: "عقد اللاعب لم يعد نشطًا ويمكن تجديده." };
    }
    const startsOn = getRepresentationContractExpiry(contract);
    if (!isCalendarDate(startsOn) || startsOn <= currentDate) {
      return { changed: false, save, error: "انتهت مدة العقد قبل اعتماد التجديد." };
    }
    const renewal = {
      offerId: offer.id,
      signedOn: currentDate,
      startsOn,
      expiresOn: addDays(startsOn, terms.termDays),
      termDays: terms.termDays,
      commissionRate: terms.commissionRate,
      representationType: normalizeRepresentationType(terms.representationType ?? offer.representationType ?? contract.representationType)
    };
    const updated = {
      ...representation,
      contracts: representation.contracts.map((item) => item.id === contract.id
        ? { ...item, renewals: [...(item.renewals ?? []), renewal], relationshipScore: clamp(item.relationshipScore + 3, 0, 100) }
        : item)
    };
    let history = replaceOffer(updated, offer.id, {
      status: "accepted",
      contractId: contract.id,
      resolution
    });
    history = nextHistory(history, "offer-accepted", offer, currentDate,
      "تم الاتفاق على تجديد عقد التمثيل.");
    history = nextHistory(history, "contract-renewed", contract, currentDate,
      "تم تجديد العقد بعمولة " + terms.commissionRate + "% لمدة إضافية " + Math.round(terms.termDays / 365) + " سنة.",
      { offerId: offer.id, contractId: contract.id });
    return {
      changed: true,
      status: "renewed",
      contract: history.contracts.find((item) => item.id === contract.id),
      save: { ...save, agency: { ...save.agency, representation: history } }
    };
  }

  const signed = createContract(save, offer, terms, currentDate, resolution);
  return {
    changed: true,
    status: "signed",
    contract: signed.agency.representation.contracts[0],
    save: signed
  };
}

/**
 * Initial representation workspace. Existing agency.clients remains the
 * backward-compatible list of client IDs; signed contracts are the source
 * of truth for new representation relationships.
 */
export function createInitialRepresentationState() {
  return {
    nextOfferSequence: 1,
    nextContractSequence: 1,
    nextHistorySequence: 1,
    nextInteractionSequence: 1,
    reputationScore: 50,
    offers: [],
    contracts: [],
    interactions: [],
    history: []
  };
}

/**
 * Validates the complete persisted representation workspace without silently
 * repairing malformed offers, contracts, or history.
 */
export function isValidRepresentationState(representation, currentDate, clients = []) {
  if (!isRecord(representation) ||
      !isCalendarDate(currentDate) ||
      !Array.isArray(clients) ||
      !clients.every((id) => typeof id === "string" && id.trim()) ||
      new Set(clients).size !== clients.length ||
      !Number.isSafeInteger(representation.nextOfferSequence) || representation.nextOfferSequence < 1 ||
      !Number.isSafeInteger(representation.nextContractSequence) || representation.nextContractSequence < 1 ||
      !Number.isSafeInteger(representation.nextHistorySequence) || representation.nextHistorySequence < 1 ||
      !Array.isArray(representation.offers) ||
      !Array.isArray(representation.contracts) ||
      !Array.isArray(representation.history) ||
      representation.offers.length > MAX_OFFERS ||
      representation.contracts.length > MAX_CONTRACTS ||
      representation.history.length > MAX_HISTORY) return false;

  const offersById = new Map();
  let highestOfferSequence = 0;
  for (const offer of representation.offers) {
    if (!isRecord(offer) ||
        typeof offer.id !== "string" ||
        !sequenceOf(offer.id, "representation-offer") ||
        (offer.kind !== undefined && !["new", "renewal"].includes(offer.kind)) ||
        (offer.playerPreferences !== undefined && !isValidPlayerPreferences(offer.playerPreferences)) ||
        (offer.representationType !== undefined && !isValidRepresentationType(offer.representationType)) ||
        (offer.agencyReputation !== undefined && (!Number.isInteger(offer.agencyReputation) || offer.agencyReputation < 0 || offer.agencyReputation > 100)) ||
        (offer.renewalContractId !== undefined && (typeof offer.renewalContractId !== "string" || !offer.renewalContractId.trim())) ||
        typeof offer.playerId !== "string" || !offer.playerId.trim() ||
        typeof offer.playerName !== "string" || !offer.playerName.trim() ||
        !Number.isInteger(offer.rating) || offer.rating < 1 || offer.rating > 99 ||
        !Number.isInteger(offer.potential) || offer.potential < offer.rating || offer.potential > 99 ||
        !Number.isInteger(offer.age) || offer.age < 15 || offer.age > 45 ||
        typeof offer.club !== "string" || !offer.club.trim() ||
        typeof offer.position !== "string" || !offer.position.trim() ||
        !validTerms(offer.commissionRate, offer.termDays) ||
        !isCalendarDate(offer.createdDate) ||
        !isCalendarDate(offer.expiresDate) ||
        offer.createdDate > currentDate ||
        offer.expiresDate !== addDays(offer.createdDate, OFFER_VALIDITY_DAYS) ||
        !OFFER_STATUSES.has(offer.status) ||
        !Number.isInteger(offer.round) || offer.round < 1 || offer.round > 3) return false;
    const sequence = sequenceOf(offer.id, "representation-offer");
    if (sequence >= representation.nextOfferSequence || offersById.has(offer.id)) return false;
    highestOfferSequence = Math.max(highestOfferSequence, sequence);
    if (["pending", "countered"].includes(offer.status) && currentDate > offer.expiresDate) return false;
    if (offer.status === "countered" || offer.status === "accepted" && offer.counterOffer !== undefined) {
      if (!isRecord(offer.counterOffer) ||
          !validTerms(offer.counterOffer.commissionRate, offer.counterOffer.termDays) ||
          (offer.counterOffer.representationType !== undefined && !isValidRepresentationType(offer.counterOffer.representationType))) return false;
    } else if (offer.counterOffer !== undefined) {
      return false;
    }
    if (offer.kind === "renewal" && typeof offer.renewalContractId !== "string") return false;
    if (offer.kind !== "renewal" && offer.renewalContractId !== undefined) return false;
    if (offer.status === "accepted") {
      if (typeof offer.contractId !== "string" || !offer.contractId.trim() ||
          !["direct", "counter-accepted", "agency-countered", "renewal-direct", "renewal-counter-accepted", "renewal-agency-countered"].includes(offer.resolution)) return false;
    } else if (offer.contractId !== undefined || offer.resolution !== undefined) {
      return false;
    }
    offersById.set(offer.id, offer);
  }

  const contractsById = new Map();
  const activePlayers = new Set();
  let highestContractSequence = 0;
  for (const contract of representation.contracts) {
    if (!isRecord(contract) ||
        typeof contract.id !== "string" ||
        !sequenceOf(contract.id, "representation-contract") ||
        typeof contract.offerId !== "string" ||
        typeof contract.playerId !== "string" || !contract.playerId.trim() ||
        typeof contract.playerName !== "string" || !contract.playerName.trim() ||
        !Number.isInteger(contract.age) || contract.age < 15 || contract.age > 45 ||
        typeof contract.club !== "string" || !contract.club.trim() ||
        typeof contract.position !== "string" || !contract.position.trim() ||
        !isCalendarDate(contract.signedOn) ||
        !isCalendarDate(contract.expiresOn) ||
        !validTerms(contract.commissionRate, contract.termDays) ||
        contract.expiresOn !== addDays(contract.signedOn, contract.termDays) ||
        (contract.rating !== undefined && (!Number.isInteger(contract.rating) || contract.rating < 1 || contract.rating > 99)) ||
        (contract.potential !== undefined && (!Number.isInteger(contract.potential) || contract.potential < 1 || contract.potential > 99)) ||
        (contract.playerPreferences !== undefined && !isValidPlayerPreferences(contract.playerPreferences)) ||
        (contract.representationType !== undefined && !isValidRepresentationType(contract.representationType)) ||
        (contract.renewals !== undefined && (!Array.isArray(contract.renewals) || contract.renewals.length > 20)) ||
        !Number.isInteger(contract.relationshipScore) || contract.relationshipScore < 0 || contract.relationshipScore > 100 ||
        !CONTRACT_STATUSES.has(contract.status)) return false;
    const sequence = sequenceOf(contract.id, "representation-contract");
    if (sequence >= representation.nextContractSequence || contractsById.has(contract.id)) return false;
    highestContractSequence = Math.max(highestContractSequence, sequence);
    const offer = offersById.get(contract.offerId);
    if (!offer || offer.status !== "accepted" || offer.contractId !== contract.id ||
        offer.playerId !== contract.playerId || offer.kind === "renewal") return false;
    if (contract.signedOn > currentDate || contract.signedOn < offer.createdDate) return false;

    let expectedRenewalStart = contract.expiresOn;
    const renewalOfferIds = new Set();
    for (const renewal of contract.renewals ?? []) {
      if (!isRecord(renewal) ||
          typeof renewal.offerId !== "string" ||
          renewalOfferIds.has(renewal.offerId) ||
          !isCalendarDate(renewal.signedOn) ||
          !isCalendarDate(renewal.startsOn) ||
          !isCalendarDate(renewal.expiresOn) ||
          !validTerms(renewal.commissionRate, renewal.termDays) ||
          (renewal.representationType !== undefined && !isValidRepresentationType(renewal.representationType)) ||
          renewal.startsOn !== expectedRenewalStart ||
          renewal.expiresOn !== addDays(renewal.startsOn, renewal.termDays) ||
          renewal.signedOn < contract.signedOn ||
          renewal.signedOn > currentDate ||
          renewal.signedOn > renewal.startsOn) return false;
      const renewalOffer = offersById.get(renewal.offerId);
      const acceptedRenewalTerms = renewalOffer?.resolution?.includes("counter-accepted")
        ? renewalOffer.counterOffer
        : renewalOffer;
      if (!renewalOffer || renewalOffer.kind !== "renewal" ||
          renewalOffer.status !== "accepted" ||
          renewalOffer.renewalContractId !== contract.id ||
          renewalOffer.contractId !== contract.id ||
          renewalOffer.playerId !== contract.playerId ||
          !acceptedRenewalTerms ||
          acceptedRenewalTerms.commissionRate !== renewal.commissionRate ||
          acceptedRenewalTerms.termDays !== renewal.termDays ||
          normalizeRepresentationType(acceptedRenewalTerms.representationType ?? renewalOffer.representationType) !== normalizeRepresentationType(renewal.representationType ?? renewalOffer.representationType)) return false;
      renewalOfferIds.add(renewal.offerId);
      expectedRenewalStart = renewal.expiresOn;
    }
    const effectiveExpiry = getRepresentationContractExpiry(contract);
    if (contract.status === "active") {
      if (effectiveExpiry <= currentDate || contract.endedOn !== undefined ||
          activePlayers.has(contract.playerId) || !clients.includes(contract.playerId)) return false;
      activePlayers.add(contract.playerId);
    } else if (contract.status === "terminated") {
      if (!isCalendarDate(contract.endedOn) ||
          contract.endedOn < contract.signedOn ||
          contract.endedOn > currentDate ||
          contract.endedOn >= effectiveExpiry) return false;
    } else if (
      !isCalendarDate(contract.endedOn) ||
      contract.endedOn < effectiveExpiry ||
      contract.endedOn > currentDate
    ) {
      return false;
    }
    contractsById.set(contract.id, contract);
  }

  const openRenewalContracts = new Set();
  for (const offer of representation.offers) {
    if (offer.kind === "renewal") {
      const renewalContract = contractsById.get(offer.renewalContractId);
      if (!renewalContract || renewalContract.playerId !== offer.playerId) return false;
      const effectiveExpiry = getRepresentationContractExpiry(renewalContract);
      const renewalRecord = (renewalContract.renewals ?? []).find((item) => item.offerId === offer.id);
      const renewalWindowAnchor = renewalRecord?.startsOn ?? effectiveExpiry;
      const renewalWindowDays = Math.round((Date.parse(renewalWindowAnchor + "T00:00:00.000Z") -
        Date.parse(offer.createdDate + "T00:00:00.000Z")) / 86400000);
      if (renewalWindowDays < 1 || renewalWindowDays > 90) return false;
      if (["pending", "countered"].includes(offer.status)) {
        if (renewalContract.status !== "active" || currentDate >= effectiveExpiry ||
            openRenewalContracts.has(renewalContract.id)) return false;
        openRenewalContracts.add(renewalContract.id);
      }
    }
    if (offer.status === "accepted") {
      const contract = contractsById.get(offer.contractId);
      if (!contract || contract.playerId !== offer.playerId) return false;
      const acceptedTerms = offer.resolution.includes("counter-accepted")
        ? offer.counterOffer
        : offer;
      if (!acceptedTerms) return false;
      if (offer.kind === "renewal") {
        const renewal = (contract.renewals ?? []).find((item) => item.offerId === offer.id);
        if (!renewal ||
            renewal.commissionRate !== acceptedTerms.commissionRate ||
            renewal.termDays !== acceptedTerms.termDays) return false;
      } else if (
        contract.offerId !== offer.id ||
        contract.commissionRate !== acceptedTerms.commissionRate ||
        contract.termDays !== acceptedTerms.termDays ||
        normalizeRepresentationType(contract.representationType) !== normalizeRepresentationType(acceptedTerms.representationType ?? offer.representationType)
      ) {
        return false;
      }
    }
  }

  let highestHistorySequence = 0;
  const historyIds = new Set();
  for (const entry of representation.history) {
    if (!isRecord(entry) ||
        typeof entry.id !== "string" ||
        !sequenceOf(entry.id, "representation-history") ||
        !HISTORY_TYPES.has(entry.type) ||
        typeof entry.playerId !== "string" || !entry.playerId.trim() ||
        typeof entry.playerName !== "string" || !entry.playerName.trim() ||
        !isCalendarDate(entry.date) || entry.date > currentDate ||
        typeof entry.note !== "string" || !entry.note.trim()) return false;
    const sequence = sequenceOf(entry.id, "representation-history");
    if (sequence >= representation.nextHistorySequence || historyIds.has(entry.id)) return false;
    highestHistorySequence = Math.max(highestHistorySequence, sequence);
    historyIds.add(entry.id);
    if (entry.offerId !== undefined && !offersById.has(entry.offerId)) return false;
    if (entry.contractId !== undefined && !contractsById.has(entry.contractId)) return false;
  }

  return representation.nextOfferSequence > highestOfferSequence &&
    representation.nextContractSequence > highestContractSequence &&
    representation.nextHistorySequence > highestHistorySequence;
}

/**
 * Starts a representation offer. Terms are explicit: commission is 5–15% and
 * contract length is one, two, or three years (365-day simulation years).
 */
export function createRepresentationOffer(save, player, terms, currentDate = save?.world?.currentDate) {
  const representation = save?.agency?.representation;
  if (!isRecord(representation) || !Array.isArray(representation.offers) ||
      !Array.isArray(representation.contracts) || !Array.isArray(representation.history)) {
    return { changed: false, save, error: "بيانات التمثيل غير متاحة في ملف الحفظ." };
  }
  if (!isRecord(player) || typeof player.id !== "string" || !player.id.trim() ||
      typeof player.name !== "string" || !player.name.trim() ||
      !Number.isInteger(player.age) || player.age < 15 || player.age > 45 ||
      typeof player.club !== "string" || !player.club.trim() ||
      typeof player.position !== "string" || !player.position.trim() ||
      !Number.isInteger(player.rating) || player.rating < 1 || player.rating > 99 ||
      !Number.isInteger(player.potential) || player.potential < player.rating || player.potential > 99) {
    return { changed: false, save, error: "ملف اللاعب غير مكتمل ولا يمكن تقديم عرض تمثيل." };
  }
  if (!isCalendarDate(currentDate)) return { changed: false, save, error: "تاريخ المسيرة غير صالح." };
  if (!validTerms(terms?.commissionRate, terms?.termDays) ||
      (terms?.representationType !== undefined && !isValidRepresentationType(terms.representationType))) {
    return { changed: false, save, error: "اختر عمولة من 5% إلى 15% ومدة سنة أو سنتين أو ثلاث سنوات ونوع تمثيل صالح." };
  }
  if (save.agency.clients.includes(player.id) ||
      representation.contracts.some((contract) => contract.playerId === player.id && contract.status === "active")) {
    return { changed: false, save, error: "اللاعب عميل حالي بالفعل في وكالتك." };
  }
  if (representation.offers.some((offer) =>
    offer.playerId === player.id && ["pending", "countered"].includes(offer.status)
  )) {
    return { changed: false, save, error: "لديك عرض تمثيل مفتوح بالفعل لهذا اللاعب." };
  }
  if (representation.offers.length >= MAX_OFFERS ||
      representation.history.length >= MAX_HISTORY ||
      representation.nextOfferSequence < 1 || !Number.isSafeInteger(representation.nextOfferSequence)) {
    return { changed: false, save, error: "وصل سجل عروض التمثيل إلى الحد المتاح." };
  }

  const offer = {
    id: "representation-offer-" + representation.nextOfferSequence,
    kind: "new",
    playerId: player.id,
    playerName: player.name,
    age: player.age,
    club: player.club,
    position: player.position,
    rating: player.rating,
    potential: player.potential,
    playerPreferences: getPlayerRepresentationProfile(player),
    representationType: normalizeRepresentationType(terms.representationType),
    agencyReputation: currentAgencyReputation(representation),
    commissionRate: terms.commissionRate,
    termDays: terms.termDays,
    createdDate: currentDate,
    expiresDate: addDays(currentDate, OFFER_VALIDITY_DAYS),
    status: "pending",
    round: 1
  };
  let updated = {
    ...representation,
    nextOfferSequence: representation.nextOfferSequence + 1,
    offers: [offer, ...representation.offers]
  };
  updated = nextHistory(updated, "offer-sent", offer, currentDate,
    "أرسلت الوكالة عرض تمثيل بعمولة " + terms.commissionRate + "% لمدة " + Math.round(terms.termDays / 365) + " سنة.",
    { offerId: offer.id });
  return {
    changed: true,
    status: "pending",
    offer,
    save: { ...save, agency: { ...save.agency, representation: updated } }
  };
}

/**
 * Simulates a deterministic player response. High-profile players negotiate
 * a lower commission; players aged 20 or younger prefer a one-year mandate.
 */
export function evaluateRepresentationOffer(save, offerId, currentDate = save?.world?.currentDate) {
  const representation = save?.agency?.representation;
  const offer = representation?.offers?.find((item) => item.id === offerId);
  if (!offer || offer.status !== "pending") {
    return { changed: false, save, error: "لا يوجد عرض مفتوح يمكن تقييمه." };
  }
  if (!isCalendarDate(currentDate)) return { changed: false, save, error: "تاريخ المسيرة غير صالح." };
  if (currentDate > offer.expiresDate) {
    const advanced = advanceRepresentationState(save, currentDate);
    return { changed: true, status: "expired", save: advanced.save, error: "انتهت صلاحية عرض التمثيل." };
  }
  if (representation.history.length > MAX_HISTORY - 2) {
    return { changed: false, save, error: "سجل التفاوض ممتلئ ولا يمكن إضافة رد جديد." };
  }

  const terms = { commissionRate: offer.commissionRate, termDays: offer.termDays };
  if (!playerAcceptsTerms(offer, terms)) {
    const counterOffer = buildPlayerCounterOffer(offer);
    let updated = replaceOffer(representation, offer.id, {
      status: "countered",
      counterOffer,
      round: offer.round + 1
    });
    updated = nextHistory(updated, "player-countered", offer, currentDate,
      "قدم اللاعب عرضه الأول: عمولة " + counterOffer.commissionRate + "% لمدة " + Math.round(counterOffer.termDays / 365) + " سنة.",
      { offerId: offer.id });
    return {
      changed: true,
      status: "countered",
      counterOffer,
      save: { ...save, agency: { ...save.agency, representation: updated } }
    };
  }

  return commitRepresentationAgreement(
    save,
    offer,
    terms,
    currentDate,
    offer.kind === "renewal" ? "renewal-direct" : "direct"
  );
}

/**
 * The agency can answer a player counter with new terms. The player then
 * accepts, returns another counter, or rejects after the final round.
 */
export function submitRepresentationCounterOffer(save, offerId, terms, currentDate = save?.world?.currentDate) {
  const representation = save?.agency?.representation;
  const offer = representation?.offers?.find((item) => item.id === offerId);
  if (!offer || offer.status !== "countered") {
    return { changed: false, save, error: "لا يوجد عرض مضاد مفتوح للرد عليه." };
  }
  if (!isCalendarDate(currentDate) || currentDate > offer.expiresDate) {
    return { changed: false, save, error: "انتهت صلاحية العرض قبل إرسال الرد." };
  }
  if (!validTerms(terms?.commissionRate, terms?.termDays)) {
    return { changed: false, save, error: "شروط العرض المضاد غير صالحة." };
  }
  if (representation.history.length > MAX_HISTORY - 3) {
    return { changed: false, save, error: "سجل التفاوض ممتلئ ولا يمكن إضافة جولة جديدة." };
  }

  if (terms.representationType !== undefined && !isValidRepresentationType(terms.representationType)) {
    return { changed: false, save, error: "نوع التمثيل في العرض المضاد غير صالح." };
  }
  const agencyOffer = {
    ...offer,
    commissionRate: terms.commissionRate,
    termDays: terms.termDays,
    representationType: normalizeRepresentationType(terms.representationType ?? offer.representationType)
  };
  let updated = replaceOffer(representation, offer.id, {
    commissionRate: terms.commissionRate,
    termDays: terms.termDays,
    representationType: normalizeRepresentationType(terms.representationType ?? offer.representationType)
  });
  updated = nextHistory(updated, "agency-countered", offer, currentDate,
    "ردت الوكالة بعمولة " + terms.commissionRate + "% لمدة " + Math.round(terms.termDays / 365) + " سنة.",
    { offerId: offer.id });
  const intermediateSave = {
    ...save,
    agency: { ...save.agency, representation: updated }
  };

  if (playerAcceptsTerms(agencyOffer, terms)) {
    return commitRepresentationAgreement(
      intermediateSave,
      agencyOffer,
      terms,
      currentDate,
      offer.kind === "renewal" ? "renewal-agency-countered" : "agency-countered"
    );
  }

  if (offer.round >= 3) {
    updated = replaceOffer(updated, offer.id, { status: "rejected", counterOffer: undefined });
    updated = nextHistory(updated, "offer-rejected", offer, currentDate,
      "رفض اللاعب العرض المضاد الأخير وانتهى التفاوض بعد ثلاث جولات.",
      { offerId: offer.id });
    return {
      changed: true,
      status: "rejected",
      save: { ...save, agency: { ...save.agency, representation: updated } }
    };
  }

  const counterOffer = buildPlayerCounterOffer({ ...agencyOffer, round: offer.round });
  updated = replaceOffer(updated, offer.id, {
    status: "countered",
    counterOffer,
    round: offer.round + 1
  });
  updated = nextHistory(updated, "player-countered", offer, currentDate,
    "عاد اللاعب بعرض مضاد: عمولة " + counterOffer.commissionRate + "% لمدة " + Math.round(counterOffer.termDays / 365) + " سنة.",
    { offerId: offer.id });
  return {
    changed: true,
    status: "countered",
    counterOffer,
    save: { ...save, agency: { ...save.agency, representation: updated } }
  };
}

/** Accepts the player's current counteroffer and completes the agreement. */
export function acceptRepresentationCounterOffer(save, offerId, currentDate = save?.world?.currentDate) {
  const representation = save?.agency?.representation;
  const offer = representation?.offers?.find((item) => item.id === offerId);
  if (!offer || offer.status !== "countered" || !isRecord(offer.counterOffer)) {
    return { changed: false, save, error: "لا يوجد عرض مضاد صالح لقبوله." };
  }
  if (!isCalendarDate(currentDate) || currentDate > offer.expiresDate) {
    return { changed: false, save, error: "انتهت صلاحية العرض المضاد." };
  }
  if (representation.history.length > MAX_HISTORY - 2 ||
      (offer.kind !== "renewal" && representation.contracts.length >= MAX_CONTRACTS)) {
    return { changed: false, save, error: "وصل سجل العقود أو التعاملات إلى الحد المتاح." };
  }
  return commitRepresentationAgreement(
    save,
    offer,
    offer.counterOffer,
    currentDate,
    offer.kind === "renewal" ? "renewal-counter-accepted" : "counter-accepted"
  );
}

/**
 * Creates a renewal offer during the final 90 days of an active mandate.
 * Renewals append a dated extension to the existing contract, preserving its
 * original signing terms and the full amendment history.
 */
export function createRepresentationRenewalOffer(save, contractId, terms, currentDate = save?.world?.currentDate) {
  const representation = save?.agency?.representation;
  const contract = representation?.contracts?.find((item) => item.id === contractId);
  if (!contract || contract.status !== "active") {
    return { changed: false, save, error: "لا يوجد عقد نشط يمكن تجديده." };
  }
  if (!isCalendarDate(currentDate)) return { changed: false, save, error: "تاريخ المسيرة غير صالح." };
  const expiresOn = getRepresentationContractExpiry(contract);
  const remainingDays = Math.round((Date.parse(expiresOn + "T00:00:00.000Z") - Date.parse(currentDate + "T00:00:00.000Z")) / 86400000);
  if (remainingDays < 1 || remainingDays > 90) {
    return { changed: false, save, error: "يمكن فتح التجديد خلال آخر 90 يومًا من العقد فقط." };
  }
  if (!validTerms(terms?.commissionRate, terms?.termDays)) {
    return { changed: false, save, error: "اختر عمولة من 5% إلى 15% ومدة تجديد سنة أو سنتين أو ثلاث سنوات." };
  }
  if (representation.offers.some((offer) =>
    offer.kind === "renewal" && offer.renewalContractId === contract.id &&
    ["pending", "countered"].includes(offer.status)
  )) {
    return { changed: false, save, error: "يوجد عرض تجديد مفتوح لهذا العقد بالفعل." };
  }
  if (representation.offers.length >= MAX_OFFERS || representation.history.length >= MAX_HISTORY ||
      !Number.isSafeInteger(representation.nextOfferSequence) || representation.nextOfferSequence < 1) {
    return { changed: false, save, error: "وصل سجل عروض التمثيل إلى الحد المتاح." };
  }

  const rating = contract.rating ?? 70;
  const potential = Math.max(rating, contract.potential ?? 80);
  const playerPreferences = contract.playerPreferences ?? getPlayerRepresentationProfile({
    id: contract.playerId,
    age: contract.age,
    rating,
    potential
  });
  const offer = {
    id: "representation-offer-" + representation.nextOfferSequence,
    kind: "renewal",
    renewalContractId: contract.id,
    playerId: contract.playerId,
    playerName: contract.playerName,
    age: contract.age,
    club: contract.club,
    position: contract.position,
    rating,
    potential,
    playerPreferences,
    representationType: normalizeRepresentationType(contract.representationType),
    agencyReputation: currentAgencyReputation(representation),
    commissionRate: terms.commissionRate,
    termDays: terms.termDays,
    createdDate: currentDate,
    expiresDate: addDays(currentDate, OFFER_VALIDITY_DAYS),
    status: "pending",
    round: 1
  };
  let updated = {
    ...representation,
    nextOfferSequence: representation.nextOfferSequence + 1,
    offers: [offer, ...representation.offers]
  };
  updated = nextHistory(updated, "renewal-offer-sent", offer, currentDate,
    "أرسلت الوكالة عرض تجديد بعمولة " + terms.commissionRate + "% لمدة " + Math.round(terms.termDays / 365) + " سنة.",
    { offerId: offer.id, contractId: contract.id });
  return {
    changed: true,
    status: "pending",
    offer,
    save: { ...save, agency: { ...save.agency, representation: updated } }
  };
}

/**
 * Sends a client message/call or schedules a meeting. Messages and calls
 * resolve automatically when their response deadline is reached; meetings
 * remain scheduled until the agent records the meeting outcome.
 */
export function createRepresentationInteraction(save, contractId, kind, meetingDate, currentDate = save?.world?.currentDate) {
  const representation = save?.agency?.representation;
  const contract = representation?.contracts?.find((item) => item.id === contractId);
  if (!contract || contract.status !== "active") {
    return { changed: false, save, error: "لا يوجد عقد نشط لهذا اللاعب." };
  }
  if (!isCalendarDate(currentDate) || !INTERACTION_KINDS.has(kind)) {
    return { changed: false, save, error: "نوع التواصل أو تاريخ المسيرة غير صالح." };
  }
  const interactions = interactionList(representation);
  if (interactions.length >= MAX_INTERACTIONS ||
      !Number.isSafeInteger(interactionSequence(representation)) ||
      representation.history.length >= MAX_HISTORY) {
    return { changed: false, save, error: "وصل سجل تواصل العملاء إلى الحد المتاح." };
  }

  let dueDate;
  let status;
  if (kind === "meeting") {
    if (!isCalendarDate(meetingDate)) {
      return { changed: false, save, error: "حدد تاريخًا صالحًا للاجتماع." };
    }
    const daysUntilMeeting = Math.round((Date.parse(meetingDate + "T00:00:00.000Z") -
      Date.parse(currentDate + "T00:00:00.000Z")) / 86400000);
    if (daysUntilMeeting < 1 || daysUntilMeeting > 30) {
      return { changed: false, save, error: "يمكن تحديد الاجتماع خلال الثلاثين يومًا القادمة." };
    }
    if (interactions.some((item) => item.contractId === contract.id && item.kind === "meeting" && item.status === "scheduled")) {
      return { changed: false, save, error: "يوجد اجتماع مجدول بالفعل لهذا اللاعب." };
    }
    dueDate = meetingDate;
    status = "scheduled";
  } else {
    if (interactions.some((item) => item.contractId === contract.id && item.kind === kind && item.status === "pending_response")) {
      return { changed: false, save, error: kind === "message"
        ? "هناك رسالة بانتظار رد اللاعب بالفعل."
        : "هناك مكالمة بانتظار رد اللاعب بالفعل." };
    }
    dueDate = addDays(currentDate, kind === "message" ? 3 : 1);
    status = "pending_response";
  }

  const interaction = {
    id: "representation-interaction-" + interactionSequence(representation),
    contractId: contract.id,
    playerId: contract.playerId,
    playerName: contract.playerName,
    kind,
    createdDate: currentDate,
    dueDate,
    status
  };
  let updated = {
    ...representation,
    nextInteractionSequence: interactionSequence(representation) + 1,
    interactions: [interaction, ...interactions]
  };
  const historyType = kind === "meeting" ? "meeting-scheduled" : "message-sent";
  const note = kind === "meeting"
    ? "تم تحديد اجتماع مع اللاعب في " + dueDate + "."
    : kind === "call"
      ? "تم تسجيل مكالمة مع اللاعب، والرد متوقع خلال يوم."
      : "تم إرسال رسالة للاعب، والرد متوقع خلال ثلاثة أيام.";
  updated = nextHistory(updated, historyType, contract, currentDate, note, {
    contractId: contract.id,
    interactionId: interaction.id
  });
  return {
    changed: true,
    interaction,
    save: { ...save, agency: { ...save.agency, representation: updated } }
  };
}

/** Records the outcome of a scheduled client meeting within its grace period. */
export function completeRepresentationMeeting(save, interactionId, outcome, currentDate = save?.world?.currentDate) {
  const representation = save?.agency?.representation;
  const interaction = interactionList(representation).find((item) => item.id === interactionId);
  if (!interaction || interaction.kind !== "meeting" || interaction.status !== "scheduled") {
    return { changed: false, save, error: "لا يوجد اجتماع مجدول يمكن تسجيل نتيجته." };
  }
  if (!isCalendarDate(currentDate) || !INTERACTION_OUTCOMES.has(outcome) ||
      currentDate < interaction.dueDate || currentDate > addDays(interaction.dueDate, 7)) {
    return { changed: false, save, error: "يمكن تسجيل نتيجة الاجتماع من موعده وحتى سبعة أيام بعده." };
  }
  const contract = representation.contracts.find((item) => item.id === interaction.contractId);
  if (!contract || contract.status !== "active") {
    return { changed: false, save, error: "عقد التمثيل لم يعد نشطًا." };
  }
  const relationshipDelta = outcome === "positive" ? 7 : outcome === "neutral" ? 3 : -6;
  const reputationDelta = outcome === "positive" ? 2 : outcome === "neutral" ? 0 : -2;
  let updated = {
    ...representation,
    contracts: representation.contracts.map((item) => item.id === contract.id
      ? { ...item, relationshipScore: clamp(item.relationshipScore + relationshipDelta, 0, 100) }
      : item)
  };
  updated = replaceInteraction(updated, interaction.id, {
    status: "resolved",
    outcome,
    resolvedDate: currentDate
  });
  updated = adjustAgencyReputation(updated, reputationDelta);
  const outcomeLabel = outcome === "positive" ? "إيجابية" : outcome === "neutral" ? "محايدة" : "سلبية";
  updated = nextHistory(updated, "meeting-completed", interaction, currentDate,
    "تم عقد الاجتماع وكانت نتيجته " + outcomeLabel + ".",
    { contractId: contract.id, interactionId: interaction.id });
  return {
    changed: true,
    interaction: updated.interactions.find((item) => item.id === interaction.id),
    contract: updated.contracts.find((item) => item.id === contract.id),
    save: { ...save, agency: { ...save.agency, representation: updated } }
  };
}

/** Declines the player's counteroffer without creating a client relationship. */
export function rejectRepresentationOffer(save, offerId, currentDate = save?.world?.currentDate) {
  const representation = save?.agency?.representation;
  const offer = representation?.offers?.find((item) => item.id === offerId);
  if (!offer || !["pending", "countered"].includes(offer.status)) {
    return { changed: false, save, error: "لا يوجد عرض مفتوح لرفضه." };
  }
  if (!isCalendarDate(currentDate) || currentDate > offer.expiresDate) {
    return { changed: false, save, error: "انتهت صلاحية العرض." };
  }
  let updated = replaceOffer(representation, offer.id, { status: "rejected", counterOffer: undefined });
  updated = nextHistory(updated, "offer-rejected", offer, currentDate,
    "تم رفض عرض التمثيل وإغلاق التفاوض.", { offerId: offer.id });
  return {
    changed: true,
    status: "rejected",
    save: { ...save, agency: { ...save.agency, representation: updated } }
  };
}

/** Ends an active mandate and archives it instead of deleting its history. */
export function terminateRepresentationContract(save, contractId, currentDate = save?.world?.currentDate) {
  const representation = save?.agency?.representation;
  const contract = representation?.contracts?.find((item) => item.id === contractId);
  if (!contract || contract.status !== "active") {
    return { changed: false, save, error: "عقد التمثيل غير نشط بالفعل." };
  }
  if (!isCalendarDate(currentDate) || currentDate < contract.signedOn || currentDate >= getRepresentationContractExpiry(contract)) {
    return { changed: false, save, error: "تاريخ إنهاء العقد غير صالح." };
  }
  let updated = {
    ...representation,
    contracts: representation.contracts.map((item) => item.id === contractId
      ? { ...item, status: "terminated", endedOn: currentDate, relationshipScore: Math.max(0, item.relationshipScore - 15) }
      : item)
  };
  for (const offer of representation.offers) {
    if (offer.kind === "renewal" && offer.renewalContractId === contractId &&
        ["pending", "countered"].includes(offer.status)) {
      updated = replaceOffer(updated, offer.id, { status: "rejected", counterOffer: undefined });
      updated = nextHistory(updated, "offer-rejected", offer, currentDate,
        "أُغلق عرض التجديد بسبب إنهاء عقد التمثيل.", { offerId: offer.id, contractId });
    }
  }
  const history = nextHistory(updated, "contract-terminated", contract, currentDate,
    "أنهت الوكالة عقد التمثيل قبل موعد انتهائه.", { offerId: contract.offerId, contractId });
  const hasAnotherActiveContract = history.contracts.some((item) =>
    item.playerId === contract.playerId && item.status === "active"
  );
  const clients = hasAnotherActiveContract
    ? save.agency.clients
    : save.agency.clients.filter((id) => id !== contract.playerId);
  return {
    changed: true,
    save: { ...save, agency: { ...save.agency, clients, representation: history } }
  };
}

/**
 * Expires pending offers and ended mandates as the career calendar advances.
 * Legacy client IDs that predate schema v4 are retained because they have no
 * contractual metadata to infer an expiry from.
 */
export function advanceRepresentationState(save, currentDate = save?.world?.currentDate) {
  const representation = save?.agency?.representation;
  if (!isRecord(representation) || !isCalendarDate(currentDate)) {
    return { save, expiredOffers: [], expiredContracts: [] };
  }

  let updated = representation;
  const expiredOffers = [];
  const expiredContracts = [];

  for (const offer of representation.offers) {
    const renewalContract = offer.kind === "renewal"
      ? representation.contracts.find((contract) => contract.id === offer.renewalContractId)
      : null;
    const renewalContractEnded = Boolean(renewalContract) &&
      currentDate >= getRepresentationContractExpiry(renewalContract);
    if (["pending", "countered"].includes(offer.status) &&
        (currentDate > offer.expiresDate || renewalContractEnded)) {
      updated = replaceOffer(updated, offer.id, { status: "expired", counterOffer: undefined });
      updated = nextHistory(updated, "offer-expired", offer, currentDate,
        "انتهت صلاحية عرض التمثيل دون اتفاق.", { offerId: offer.id });
      expiredOffers.push(offer.id);
    }
  }

  for (const contract of representation.contracts) {
    if (contract.status === "active" && currentDate >= getRepresentationContractExpiry(contract)) {
      updated = {
        ...updated,
        contracts: updated.contracts.map((item) => item.id === contract.id
          ? { ...item, status: "expired", endedOn: currentDate }
          : item)
      };
      updated = nextHistory(updated, "contract-expired", contract, currentDate,
        "انتهت مدة عقد التمثيل دون تجديد.", { offerId: contract.offerId, contractId: contract.id });
      expiredContracts.push(contract.id);
    }
  }

  if (expiredOffers.length === 0 && expiredContracts.length === 0) {
    return { save, expiredOffers, expiredContracts };
  }

  const representedPlayers = new Set(updated.contracts
    .filter((contract) => contract.status === "active")
    .map((contract) => contract.playerId));
  const playersWithContractHistory = new Set(updated.contracts.map((contract) => contract.playerId));
  const clients = save.agency.clients.filter((playerId) =>
    !playersWithContractHistory.has(playerId) || representedPlayers.has(playerId)
  );
  return {
    save: { ...save, agency: { ...save.agency, clients, representation: updated } },
    expiredOffers,
    expiredContracts
  };
}

export function calculateRepresentationCommission(income, commissionRate) {
  if (!Number.isFinite(income) || income < 0 ||
      !Number.isInteger(commissionRate) || commissionRate < 5 || commissionRate > 15) {
    throw new TypeError("دخل اللاعب ونسبة العمولة غير صالحين.");
  }
  return Math.round(income * commissionRate / 100);
}
