const CONTRACT_TERMS = Object.freeze([365, 730, 1095]);
const OFFER_VALIDITY_DAYS = 30;
const MAX_OFFERS = 50;
const MAX_CONTRACTS = 100;
const MAX_HISTORY = 300;

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
    CONTRACT_TERMS.includes(value.preferredTermDays);
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
    preferredTermDays
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
  const commissionAllowance = preferences.preferredCommissionRate + (offer.round >= 2 ? 1 : 0);
  const minimumTerm = offer.round >= 3
    ? Math.max(365, preferences.preferredTermDays - 365)
    : preferences.preferredTermDays;
  return terms.commissionRate <= commissionAllowance && terms.termDays >= minimumTerm;
}

function buildPlayerCounterOffer(offer) {
  const preferences = getOfferPreferences(offer);
  const concession = offer.round >= 2 ? 1 : 0;
  const termConcession = offer.round >= 3 ? 365 : 0;
  return {
    commissionRate: clamp(preferences.preferredCommissionRate + concession, 5, 15),
    termDays: Math.max(365, preferences.preferredTermDays - termConcession)
  };
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
    signedOn: currentDate,
    expiresOn: addDays(currentDate, terms.termDays),
    termDays: terms.termDays,
    commissionRate: terms.commissionRate,
    renewals: [],
    relationshipScore: resolution === "counter-accepted" ? 68 : resolution === "agency-countered" ? 74 : 70,
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
    offers: [],
    contracts: [],
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
        !Number.isInteger(offer.round) || offer.round < 1 || offer.round > 5) return false;
    const sequence = sequenceOf(offer.id, "representation-offer");
    if (sequence >= representation.nextOfferSequence || offersById.has(offer.id)) return false;
    highestOfferSequence = Math.max(highestOfferSequence, sequence);
    if (["pending", "countered"].includes(offer.status) && currentDate > offer.expiresDate) return false;
    if (offer.status === "countered" || offer.status === "accepted" && offer.counterOffer !== undefined) {
      if (!isRecord(offer.counterOffer) ||
          !validTerms(offer.counterOffer.commissionRate, offer.counterOffer.termDays)) return false;
    } else if (offer.counterOffer !== undefined) {
      return false;
    }
    if (offer.status === "accepted") {
      if (typeof offer.contractId !== "string" || !offer.contractId.trim() ||
          !["direct", "counter-accepted"].includes(offer.resolution)) return false;
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
        !Number.isInteger(contract.relationshipScore) || contract.relationshipScore < 0 || contract.relationshipScore > 100 ||
        !CONTRACT_STATUSES.has(contract.status)) return false;
    const sequence = sequenceOf(contract.id, "representation-contract");
    if (sequence >= representation.nextContractSequence || contractsById.has(contract.id)) return false;
    highestContractSequence = Math.max(highestContractSequence, sequence);
    const offer = offersById.get(contract.offerId);
    if (!offer || offer.status !== "accepted" || offer.contractId !== contract.id ||
        offer.playerId !== contract.playerId) return false;
    if (contract.signedOn > currentDate || contract.signedOn < offer.createdDate) return false;
    if (contract.status === "active") {
      if (contract.expiresOn <= currentDate || contract.endedOn !== undefined ||
          activePlayers.has(contract.playerId) || !clients.includes(contract.playerId)) return false;
      activePlayers.add(contract.playerId);
    } else if (contract.status === "terminated") {
      if (!isCalendarDate(contract.endedOn) ||
          contract.endedOn < contract.signedOn ||
          contract.endedOn > currentDate ||
          contract.endedOn >= contract.expiresOn) return false;
    } else if (
      !isCalendarDate(contract.endedOn) ||
      contract.endedOn < contract.expiresOn ||
      contract.endedOn > currentDate
    ) {
      return false;
    }
    contractsById.set(contract.id, contract);
  }

  for (const offer of representation.offers) {
    if (offer.status === "accepted") {
      const contract = contractsById.get(offer.contractId);
      if (!contract) return false;
      const acceptedTerms = offer.resolution === "counter-accepted" ? offer.counterOffer : offer;
      if (!acceptedTerms ||
          contract.commissionRate !== acceptedTerms.commissionRate ||
          contract.termDays !== acceptedTerms.termDays) return false;
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
  if (!validTerms(terms?.commissionRate, terms?.termDays)) {
    return { changed: false, save, error: "اختر عمولة من 5% إلى 15% ومدة سنة أو سنتين أو ثلاث سنوات." };
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
    playerId: player.id,
    playerName: player.name,
    age: player.age,
    club: player.club,
    position: player.position,
    rating: player.rating,
    potential: player.potential,
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
    return { changed: false, save: advanced.save, error: "انتهت صلاحية عرض التمثيل." };
  }

  const targetCommissionRate = offer.rating >= 80 ? 8 : offer.rating >= 72 ? 9 : 10;
  const targetTermDays = offer.age <= 20 ? 365 : 730;
  if (offer.commissionRate > targetCommissionRate || offer.termDays > targetTermDays) {
    const counterOffer = { commissionRate: targetCommissionRate, termDays: targetTermDays };
    let updated = replaceOffer(representation, offer.id, {
      status: "countered",
      counterOffer,
      round: offer.round + 1
    });
    updated = nextHistory(updated, "player-countered", offer, currentDate,
      "طلب اللاعب عمولة " + targetCommissionRate + "% ومدة " + Math.round(targetTermDays / 365) + " سنة.",
      { offerId: offer.id });
    return {
      changed: true,
      status: "countered",
      counterOffer,
      save: { ...save, agency: { ...save.agency, representation: updated } }
    };
  }

  const signed = createContract(save, offer, {
    commissionRate: offer.commissionRate,
    termDays: offer.termDays
  }, currentDate, "direct");
  return {
    changed: true,
    status: "signed",
    contract: signed.agency.representation.contracts[0],
    save: signed
  };
}

/** Accepts the player's counteroffer and creates the representation contract. */
export function acceptRepresentationCounterOffer(save, offerId, currentDate = save?.world?.currentDate) {
  const representation = save?.agency?.representation;
  const offer = representation?.offers?.find((item) => item.id === offerId);
  if (!offer || offer.status !== "countered" || !isRecord(offer.counterOffer)) {
    return { changed: false, save, error: "لا يوجد عرض مضاد صالح لقبوله." };
  }
  if (!isCalendarDate(currentDate) || currentDate > offer.expiresDate) {
    return { changed: false, save, error: "انتهت صلاحية العرض المضاد." };
  }
  if (representation.contracts.length >= MAX_CONTRACTS ||
      representation.history.length > MAX_HISTORY - 2 ||
      !Number.isSafeInteger(representation.nextContractSequence)) {
    return { changed: false, save, error: "وصل سجل العقود إلى الحد المتاح." };
  }
  const signed = createContract(save, offer, offer.counterOffer, currentDate, "counter-accepted");
  return {
    changed: true,
    status: "signed",
    contract: signed.agency.representation.contracts[0],
    save: signed
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
  if (!isCalendarDate(currentDate) || currentDate < contract.signedOn || currentDate >= contract.expiresOn) {
    return { changed: false, save, error: "تاريخ إنهاء العقد غير صالح." };
  }
  const updated = {
    ...representation,
    contracts: representation.contracts.map((item) => item.id === contractId
      ? { ...item, status: "terminated", endedOn: currentDate, relationshipScore: Math.max(0, item.relationshipScore - 15) }
      : item)
  };
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
    if (["pending", "countered"].includes(offer.status) && currentDate > offer.expiresDate) {
      updated = replaceOffer(updated, offer.id, { status: "expired", counterOffer: undefined });
      updated = nextHistory(updated, "offer-expired", offer, currentDate,
        "انتهت صلاحية عرض التمثيل دون اتفاق.", { offerId: offer.id });
      expiredOffers.push(offer.id);
    }
  }

  for (const contract of representation.contracts) {
    if (contract.status === "active" && currentDate >= contract.expiresOn) {
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
