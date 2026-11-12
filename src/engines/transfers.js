import { WORLD_DATABASE } from "../data/world-database.js";
import { getRepresentationContractExpiry, getRepresentationContractCommission } from "./representation.js";
import {
  FREE_AGENT_CLUB_ID, MAX_CLUB_FINANCE_ENTRIES, getTransferWindowForClub,
  getPlayerCurrentClubIdFromState, getClubRegistrationStatus, getClubTransferFinancials
} from "./club-transfer-rules.js";

export const TRANSFER_OFFER_VALIDITY_DAYS = 14;
export const MAX_TRANSFER_OFFERS = 1000;
export const MAX_TRANSFER_MOVES = 1000;
export const MAX_TRANSFER_HISTORY = 5000;
export const MAX_TRANSFER_LEDGER = 1000;
export const TRANSFER_CONTRACT_YEARS = Object.freeze([1, 2, 3, 4, 5]);
export const TRANSFER_LOAN_MONTHS = Object.freeze([3, 6, 9, 12, 18, 24]);
const MAX_EUR = 2_000_000_000;
const OFFER_STATUSES = new Set(["pending", "countered", "agreed", "completed", "rejected", "expired"]);
const HISTORY_TYPES = new Set(["offer-sent", "club-countered", "agency-countered", "offer-agreed", "offer-rejected", "offer-expired", "transfer-completed", "loan-returned", "contract-expired"]);

function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function validId(value) { return typeof value === "string" && value.trim().length > 0; }
function validMoney(value) { return Number.isSafeInteger(value) && value >= 0 && value <= MAX_EUR; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function dateCompare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function sequenceOf(id, prefix) {
  const match = new RegExp("^" + prefix + "-(\\d+)$").exec(id);
  return match ? Number(match[1]) : 0;
}
export function isTransferCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function addDays(value, days) {
  const date = new Date(value + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function addMonths(value, months) {
  const [year, month, day] = value.split("-").map(Number);
  const target = month - 1 + months;
  const targetYear = year + Math.floor(target / 12);
  const targetMonth = ((target % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}
function getPlayer(database, playerId) {
  return [...(database.players ?? []), ...(database.squadPlayers ?? [])].find((player) => player.id === playerId) ?? null;
}
function getClub(database, clubId) { return database.clubs.find((club) => club.id === clubId) ?? null; }
function getActiveRepresentationContract(save, playerId, date) {
  const contracts = save?.agency?.representation?.contracts;
  if (!Array.isArray(contracts)) return null;
  return contracts.find((contract) =>
    contract.playerId === playerId && contract.status === "active" &&
    isTransferCalendarDate(contract.expiresOn) && date < getRepresentationContractExpiry(contract)
  ) ?? null;
}

export function getTransferWindow(currentDate, clubId = null, database = WORLD_DATABASE) {
  return getTransferWindowForClub(currentDate, clubId, database);
}

export function createInitialTransferState() {
  return {
    nextOfferSequence: 1, nextMoveSequence: 1, nextHistorySequence: 1,
    nextLedgerSequence: 1, nextFinanceSequence: 1, earnedCommissionEur: 0,
    offers: [], moves: [], ledger: [], financeLedger: [], freeAgents: [], history: []
  };
}

export function getPlayerCurrentClubId(playerId, fallbackClubId, transferState,
  currentDate = "9999-12-31", database = WORLD_DATABASE) {
  if (!validId(playerId)) return fallbackClubId ?? null;
  return getPlayerCurrentClubIdFromState(playerId, fallbackClubId, transferState, currentDate, database);
}

function replaceOffer(state, offerId, patch) {
  return { ...state, offers: state.offers.map((offer) => offer.id === offerId ? { ...offer, ...patch } : offer) };
}
function appendHistory(state, type, offer, date, note, references = {}) {
  const item = { id: "transfer-history-" + state.nextHistorySequence, type, offerId: offer.id,
    playerId: offer.playerId, playerName: offer.playerName, date, note, ...references };
  return { ...state, nextHistorySequence: state.nextHistorySequence + 1,
    history: [item, ...state.history].slice(0, MAX_TRANSFER_HISTORY) };
}

function appendClubFinance(state, offer, move, date) {
  const terms = offer.agreedTerms ?? offer.terms;
  const fee = offer.type === "permanent" ? terms.feeEur : terms.loanFeeEur;
  const feeType = offer.type === "permanent" ? "transfer-fee" : "loan-fee";
  const entries = [...(state.financeLedger ?? [])];
  let sequence = state.nextFinanceSequence ?? 1;
  const add = (clubId, type, amountEur) => {
    if (!clubId || amountEur === 0) return;
    entries.unshift({ id: "club-finance-" + sequence++, offerId: offer.id, moveId: move.id,
      playerId: offer.playerId, clubId, type, date, currency: "EUR", amountEur });
  };
  add(offer.toClubId, feeType, -fee);
  if (offer.fromClubId !== FREE_AGENT_CLUB_ID) add(offer.fromClubId, feeType, fee);
  add(offer.toClubId, "signing-bonus", -terms.signingBonusEur);
  return { ...state, nextFinanceSequence: sequence, financeLedger: entries };
}

function appendFreeAgent(state, playerId, sinceDate, formerClubId, contractMoveId = null) {
  const records = Array.isArray(state.freeAgents) ? state.freeAgents : [];
  if (records.some((item) => item.playerId === playerId)) return state;
  return { ...state, freeAgents: [...records, { playerId, sinceDate, formerClubId, contractMoveId }] };
}
function validTerms(type, terms) {
  if (!isRecord(terms) || !validMoney(terms.weeklyWageEur) || !validMoney(terms.signingBonusEur)) return false;
  return type === "permanent"
    ? validMoney(terms.feeEur) && TRANSFER_CONTRACT_YEARS.includes(terms.contractYears)
    : type === "loan" && validMoney(terms.loanFeeEur) && validMoney(terms.optionToBuyEur) && TRANSFER_LOAN_MONTHS.includes(terms.loanMonths);
}
function normalizeTerms(type, terms) {
  const base = { weeklyWageEur: terms.weeklyWageEur, signingBonusEur: terms.signingBonusEur };
  return type === "permanent"
    ? { ...base, feeEur: terms.feeEur, contractYears: terms.contractYears }
    : { ...base, loanFeeEur: terms.loanFeeEur, loanMonths: terms.loanMonths, optionToBuyEur: terms.optionToBuyEur };
}

export function createTransferOffer(save, playerId, destinationClubId, type, terms,
  currentDate = save?.world?.currentDate, database = WORLD_DATABASE) {
  const state = save?.world?.transfers;
  if (!isRecord(state) || !Array.isArray(state.offers) || !Array.isArray(state.moves) ||
      !Array.isArray(state.history) || !Array.isArray(state.financeLedger) || !Array.isArray(state.freeAgents))
    return { changed: false, save, error: "محرك الانتقالات غير موجود في ملف الحفظ." };
  if (!isTransferCalendarDate(currentDate)) return { changed: false, save, error: "تاريخ المسيرة غير صالح." };
  if (!validId(playerId) || !validId(destinationClubId) || !["permanent", "loan"].includes(type) || !validTerms(type, terms))
    return { changed: false, save, error: "بيانات عرض الانتقال غير مكتملة أو غير صالحة." };
  const player = getPlayer(database, playerId);
  const club = getClub(database, destinationClubId);
  if (!player || !club) return { changed: false, save, error: "اللاعب أو النادي المستهدف غير موجود في قاعدة العالم." };
  const window = getTransferWindow(currentDate, destinationClubId, database);
  if (!window.active) return { changed: false, save, error: "نافذة انتقالات " + club.nameAr + " مغلقة. أقرب نافذة: " + (window.nextWindow?.startDate ?? "غير محددة") + "." };
  const resolvedFromClubId = getPlayerCurrentClubId(playerId, player.clubId, state, currentDate, database);
  const fromClubId = resolvedFromClubId ?? FREE_AGENT_CLUB_ID;
  if (resolvedFromClubId === destinationClubId) return { changed: false, save, error: "اللاعب موجود بالفعل في النادي المستهدف." };
  if (fromClubId === FREE_AGENT_CLUB_ID && type === "loan")
    return { changed: false, save, error: "لا يمكن إعارة لاعب حر؛ يجب التفاوض على انتقال نهائي." };
  if (fromClubId === FREE_AGENT_CLUB_ID && terms.feeEur !== 0)
    return { changed: false, save, error: "لا توجد رسوم انتقال مستحقة للاعب الحر." };
  if (!save.agency.clients.includes(playerId) || !getActiveRepresentationContract(save, playerId, currentDate))
    return { changed: false, save, error: "لا يمكن التفاوض على انتقال لاعب قبل توقيع عقد تمثيل نشط معه." };
  const registration = getClubRegistrationStatus(destinationClubId, playerId, state, currentDate, database, type);
  if (!registration.eligible) return { changed: false, save, error: registration.reason };
  if (state.offers.some((offer) => offer.playerId === playerId && ["pending", "countered", "agreed"].includes(offer.status)))
    return { changed: false, save, error: "يوجد بالفعل ملف انتقال مفتوح لهذا اللاعب." };
  if (state.moves.some((move) => move.playerId === playerId && move.type === "loan" && move.status === "active"))
    return { changed: false, save, error: "اللاعب معار حاليًا ولا يمكن بدء انتقال آخر." };
  if (state.offers.length >= MAX_TRANSFER_OFFERS || state.history.length >= MAX_TRANSFER_HISTORY ||
      state.financeLedger.length + 3 > MAX_CLUB_FINANCE_ENTRIES ||
      !Number.isSafeInteger(state.nextOfferSequence) || state.nextOfferSequence < 1 ||
      !Number.isSafeInteger(state.nextFinanceSequence) || state.nextFinanceSequence < 1)
    return { changed: false, save, error: "وصل سجل الانتقالات أو ميزانيات الأندية إلى الحد المتاح." };
  const offer = {
    id: "transfer-offer-" + state.nextOfferSequence, playerId, playerName: player.name, type,
    fromClubId, toClubId: destinationClubId, toClubName: club.nameAr,
    marketValueEur: Number.isSafeInteger(player.marketValueEur) ? player.marketValueEur : 0,
    terms: normalizeTerms(type, terms), status: "pending", round: 1,
    createdDate: currentDate, expiresDate: addDays(currentDate, TRANSFER_OFFER_VALIDITY_DAYS),
    counterOffer: null, agreedDate: null, completedDate: null, moveId: null
  };
  let next = { ...state, nextOfferSequence: state.nextOfferSequence + 1, offers: [offer, ...state.offers] };
  next = appendHistory(next, "offer-sent", offer, currentDate,
    (type === "loan" ? "تم إرسال طلب إعارة إلى " : "تم إرسال عرض انتقال إلى ") + club.nameAr + ".");
  return { changed: true, status: "pending", offer, save: { ...save, world: { ...save.world, transfers: next } } };
}

export function evaluateTransferOffer(save, offerId, currentDate = save?.world?.currentDate, database = WORLD_DATABASE) {
  const state = save?.world?.transfers;
  const offer = state?.offers?.find((item) => item.id === offerId);
  if (!offer || !["pending", "countered"].includes(offer.status)) return { changed: false, save, error: "عرض الانتقال غير متاح للرد." };
  if (!isTransferCalendarDate(currentDate) || currentDate < offer.createdDate)
    return { changed: false, save, error: "تاريخ الرد لا يمكن أن يسبق إرسال العرض." };
  if (currentDate > offer.expiresDate) return expireTransferOffer(save, offer, currentDate);
  if (!getTransferWindow(currentDate, offer.toClubId, database).active)
    return { changed: false, save, error: "انتهت نافذة انتقالات النادي قبل إتمام التفاوض." };
  if (!getActiveRepresentationContract(save, offer.playerId, currentDate))
    return expireTransferOffer(save, offer, currentDate);
  const player = getPlayer(database, offer.playerId);
  const club = getClub(database, offer.toClubId);
  if (!player || !club) return { changed: false, save, error: "بيانات اللاعب أو النادي غير متاحة." };
  const marketValue = Number.isSafeInteger(player.marketValueEur) ? player.marketValueEur : 0;
  const financials = getClubTransferFinancials(club.id, state, currentDate, database);
  const wageCeiling = financials.availableWagesWeeklyEur;
  const maximumAffordableFee = Math.max(0, financials.budgetEur - offer.terms.signingBonusEur);
  const nextRound = offer.round + 1;
  let counter = null;
  if (offer.type === "permanent") {
    const minFee = offer.fromClubId === FREE_AGENT_CLUB_ID ? 0 : Math.round(marketValue * 0.9);
    const fee = offer.terms.feeEur;
    if (fee >= minFee && fee + offer.terms.signingBonusEur <= financials.budgetEur &&
        offer.terms.weeklyWageEur <= wageCeiling) {
      let next = replaceOffer(state, offer.id, { status: "agreed", round: Math.min(4, nextRound),
        agreedDate: currentDate, agreedTerms: offer.terms, counterOffer: null });
      next = appendHistory(next, "offer-agreed", offer, currentDate, "وافق النادي على شروط الانتقال.");
      return { changed: true, status: "agreed", offer: next.offers.find((item) => item.id === offer.id),
        save: { ...save, world: { ...save.world, transfers: next } } };
    }
    counter = { ...offer.terms,
      feeEur: Math.min(maximumAffordableFee, Math.max(offer.terms.feeEur, minFee)),
      weeklyWageEur: Math.min(offer.terms.weeklyWageEur, wageCeiling) };
  } else {
    const minLoanFee = Math.round(marketValue * 0.015);
    const fee = offer.terms.loanFeeEur;
    if (fee >= minLoanFee && fee + offer.terms.signingBonusEur <= financials.budgetEur &&
        offer.terms.weeklyWageEur <= wageCeiling) {
      let next = replaceOffer(state, offer.id, { status: "agreed", round: Math.min(4, nextRound),
        agreedDate: currentDate, agreedTerms: offer.terms, counterOffer: null });
      next = appendHistory(next, "offer-agreed", offer, currentDate, "وافق النادي على شروط الإعارة.");
      return { changed: true, status: "agreed", offer: next.offers.find((item) => item.id === offer.id),
        save: { ...save, world: { ...save.world, transfers: next } } };
    }
    counter = { ...offer.terms,
      loanFeeEur: Math.min(maximumAffordableFee, Math.max(offer.terms.loanFeeEur, minLoanFee)),
      weeklyWageEur: Math.min(offer.terms.weeklyWageEur, wageCeiling) };
  }
  if (offer.round >= 4) {
    let next = replaceOffer(state, offer.id, { status: "rejected", round: 4, counterOffer: null });
    next = appendHistory(next, "offer-rejected", offer, currentDate, "رفض النادي العرض بعد استنفاد جولات التفاوض.");
    return { changed: true, status: "rejected", save: { ...save, world: { ...save.world, transfers: next } } };
  }
  let next = replaceOffer(state, offer.id, { status: "countered", round: nextRound, counterOffer: counter });
  next = appendHistory(next, "club-countered", offer, currentDate, "أرسل النادي شروطًا مضادة للجولة " + nextRound + ".");
  return { changed: true, status: "countered", offer: next.offers.find((item) => item.id === offer.id),
    counterOffer: counter, save: { ...save, world: { ...save.world, transfers: next } } };
}

export function submitTransferCounterOffer(save, offerId, terms, currentDate = save?.world?.currentDate) {
  const state = save?.world?.transfers;
  const offer = state?.offers?.find((item) => item.id === offerId);
  if (!offer || offer.status !== "countered") return { changed: false, save, error: "لا توجد شروط مضادة مفتوحة لهذا العرض." };
  if (!isTransferCalendarDate(currentDate) || currentDate < offer.createdDate ||
      currentDate > offer.expiresDate || !getTransferWindow(currentDate, offer.toClubId).active)
    return { changed: false, save, error: "لا يمكن إرسال رد خارج مدة العرض أو نافذة الانتقالات." };
  if (!getActiveRepresentationContract(save, offer.playerId, currentDate))
    return expireTransferOffer(save, offer, currentDate);
  if (!validTerms(offer.type, terms)) return { changed: false, save, error: "شروط الرد المالي أو مدة العقد غير صالحة." };
  if (offer.round >= 4) return { changed: false, save, error: "تم استنفاد جولات التفاوض الأربع." };
  let next = replaceOffer(state, offer.id, { status: "pending", round: offer.round + 1,
    terms: normalizeTerms(offer.type, terms), counterOffer: null });
  next = appendHistory(next, "agency-countered", offer, currentDate, "أرسلت الوكالة شروطًا مضادة للنادي.");
  return { changed: true, status: "pending", offer: next.offers.find((item) => item.id === offer.id),
    save: { ...save, world: { ...save.world, transfers: next } } };
}

export function acceptTransferCounterOffer(save, offerId, currentDate = save?.world?.currentDate) {
  const state = save?.world?.transfers;
  const offer = state?.offers?.find((item) => item.id === offerId);
  if (!offer || offer.status !== "countered" || !offer.counterOffer) return { changed: false, save, error: "لا يوجد عرض مضاد صالح لقبوله." };
  if (!isTransferCalendarDate(currentDate) || currentDate < offer.createdDate ||
      currentDate > offer.expiresDate || !getTransferWindow(currentDate, offer.toClubId).active)
    return { changed: false, save, error: "انتهت صلاحية العرض أو نافذة الانتقالات." };
  if (!getActiveRepresentationContract(save, offer.playerId, currentDate))
    return expireTransferOffer(save, offer, currentDate);
  let next = replaceOffer(state, offer.id, { status: "agreed", agreedDate: currentDate,
    agreedTerms: offer.counterOffer, counterOffer: null });
  next = appendHistory(next, "offer-agreed", offer, currentDate, "وافقت الوكالة على الشروط المضادة للنادي.");
  return { changed: true, status: "agreed", offer: next.offers.find((item) => item.id === offer.id),
    save: { ...save, world: { ...save.world, transfers: next } } };
}

export function rejectTransferOffer(save, offerId, currentDate = save?.world?.currentDate) {
  const state = save?.world?.transfers;
  const offer = state?.offers?.find((item) => item.id === offerId);
  if (!offer || !["pending", "countered", "agreed"].includes(offer.status)) return { changed: false, save, error: "العرض غير متاح للإلغاء." };
  if (!isTransferCalendarDate(currentDate) || currentDate < offer.createdDate) return { changed: false, save, error: "تاريخ الإلغاء غير صالح." };
  let next = replaceOffer(state, offer.id, { status: "rejected", counterOffer: null, rejectedDate: currentDate });
  next = appendHistory(next, "offer-rejected", offer, currentDate, "ألغت الوكالة التفاوض على الانتقال.");
  return { changed: true, status: "rejected", save: { ...save, world: { ...save.world, transfers: next } } };
}

function expireTransferOffer(save, offer, currentDate) {
  let next = replaceOffer(save.world.transfers, offer.id, { status: "expired", counterOffer: null, expiredDate: currentDate });
  next = appendHistory(next, "offer-expired", offer, currentDate, "انتهت صلاحية عرض الانتقال دون اتفاق.");
  return { changed: true, status: "expired", expiredOffers: [offer.id], save: { ...save, world: { ...save.world, transfers: next } } };
}

export function completeTransfer(save, offerId, currentDate = save?.world?.currentDate, database = WORLD_DATABASE) {
  const state = save?.world?.transfers;
  const offer = state?.offers?.find((item) => item.id === offerId);
  if (!offer || offer.status !== "agreed" || !offer.agreedTerms) return { changed: false, save, error: "لا يمكن تنفيذ صفقة قبل اتفاق الطرفين على الشروط." };
  if (!isTransferCalendarDate(currentDate) || currentDate < offer.agreedDate ||
      !getTransferWindow(currentDate, offer.toClubId, database).active)
    return { changed: false, save, error: "تنفيذ الصفقة متاح فقط بعد الاتفاق وداخل نافذة انتقالات النادي المستهدف." };
  if (state.moves.some((move) => move.playerId === offer.playerId && move.type === "loan" && move.status === "active"))
    return { changed: false, save, error: "اللاعب لديه إعارة نشطة بالفعل." };
  const currentClubId = getPlayerCurrentClubId(offer.playerId,
    offer.fromClubId === FREE_AGENT_CLUB_ID ? null : offer.fromClubId, state, currentDate, database);
  if ((currentClubId ?? FREE_AGENT_CLUB_ID) !== offer.fromClubId)
    return { changed: false, save, error: "تغير النادي الحالي للاعب منذ بدء التفاوض؛ يجب فتح عرض جديد." };
  const registration = getClubRegistrationStatus(offer.toClubId, offer.playerId, state, currentDate, database, offer.type);
  if (!registration.eligible) return { changed: false, save, error: registration.reason };
  const financials = getClubTransferFinancials(offer.toClubId, state, currentDate, database);
  const terms = offer.agreedTerms;
  const fee = offer.type === "permanent" ? terms.feeEur : terms.loanFeeEur;
  if (fee + terms.signingBonusEur > financials.budgetEur)
    return { changed: false, save, error: "ميزانية النادي لا تكفي رسوم الصفقة ومكافأة التوقيع." };
  if (terms.weeklyWageEur > financials.availableWagesWeeklyEur)
    return { changed: false, save, error: "النادي لا يملك مساحة كافية في ميزانية الرواتب الأسبوعية." };
  const mandate = getActiveRepresentationContract(save, offer.playerId, currentDate);
  if (!mandate) return { changed: false, save, error: "انتهى عقد التمثيل قبل إتمام الصفقة." };
  if (state.moves.length >= MAX_TRANSFER_MOVES || state.ledger.length >= MAX_TRANSFER_LEDGER ||
      state.history.length >= MAX_TRANSFER_HISTORY || state.financeLedger.length + 3 > MAX_CLUB_FINANCE_ENTRIES)
    return { changed: false, save, error: "وصل سجل الصفقات أو العمولات أو ميزانيات الأندية إلى الحد المتاح." };
  const contractWeeks = offer.type === "permanent"
    ? terms.contractYears * 52
    : Math.round(terms.loanMonths * 52 / 12);
  const commissionBasisEur = terms.weeklyWageEur * contractWeeks + terms.signingBonusEur;
  if (!validMoney(commissionBasisEur))
    return { changed: false, save, error: "قيمة دخل اللاعب التعاقدي تجاوزت الحد المالي المسموح." };
  const commissionRate = getRepresentationContractCommission(mandate, currentDate);
  const commissionEur = Math.round(commissionBasisEur * commissionRate / 100);
  if (state.earnedCommissionEur + commissionEur > MAX_EUR) return { changed: false, save, error: "سجل عمولات الوكالة تجاوز الحد المالي المسموح." };
  const moveId = "transfer-move-" + state.nextMoveSequence;
  const move = {
    id: moveId, offerId: offer.id, playerId: offer.playerId, playerName: offer.playerName,
    type: offer.type, fromClubId: offer.fromClubId, toClubId: offer.toClubId,
    effectiveDate: currentDate, status: "active",
    feeEur: offer.type === "permanent" ? terms.feeEur : 0,
    loanFeeEur: offer.type === "loan" ? terms.loanFeeEur : 0,
    optionToBuyEur: offer.type === "loan" ? terms.optionToBuyEur : 0,
    weeklyWageEur: terms.weeklyWageEur,
    contractYears: offer.type === "permanent" ? terms.contractYears : null,
    contractEndDate: offer.type === "permanent" ? addMonths(currentDate, terms.contractYears * 12) : null,
    returnDate: offer.type === "loan" ? addMonths(currentDate, terms.loanMonths) : null
  };
  let next = {
    ...state, nextMoveSequence: state.nextMoveSequence + 1, moves: [move, ...state.moves],
    freeAgents: state.freeAgents.filter((item) => item.playerId !== offer.playerId),
    offers: state.offers.map((item) => item.id === offer.id ? { ...item, status: "completed", completedDate: currentDate, moveId } : item)
  };
  if (commissionEur > 0) {
    const entry = { id: "transfer-ledger-" + next.nextLedgerSequence, type: "agent-commission",
      offerId: offer.id, moveId, playerId: offer.playerId, date: currentDate, currency: "EUR",
      amountEur: commissionEur, commissionRate, representationContractId: mandate.id, basisEur: commissionBasisEur };
    next = { ...next, nextLedgerSequence: next.nextLedgerSequence + 1,
      earnedCommissionEur: next.earnedCommissionEur + commissionEur, ledger: [entry, ...next.ledger] };
  }
  next = appendClubFinance(next, { ...offer, agreedTerms: terms }, move, currentDate);
  next = appendHistory(next, "transfer-completed", offer, currentDate,
    (offer.type === "loan" ? "اكتملت إعارة اللاعب إلى " : "اكتمل انتقال اللاعب إلى ") + offer.toClubName + ".", { moveId });
  return { changed: true, status: "completed", move, commissionEur,
    save: { ...save, world: { ...save.world, transfers: next } } };
}

/**
 * Exercises an agreed loan purchase option: the temporary loan closes and a
 * permanent, fully budgeted transfer is recorded for the borrowing club.
 */
export function exerciseLoanOption(save, moveId, currentDate = save?.world?.currentDate, database = WORLD_DATABASE) {
  const state = save?.world?.transfers;
  const loan = state?.moves?.find((move) => move.id === moveId);
  if (!loan || loan.type !== "loan" || loan.status !== "active" || loan.optionToBuyEur <= 0)
    return { changed: false, save, error: "الإعارة لا تحتوي على خيار شراء نشط." };
  if (!isTransferCalendarDate(currentDate) || currentDate < loan.effectiveDate || currentDate >= loan.returnDate)
    return { changed: false, save, error: "خيار الشراء متاح خلال مدة الإعارة فقط." };
  if (!getTransferWindow(currentDate, loan.toClubId, database).active)
    return { changed: false, save, error: "نافذة انتقالات النادي المستعير مغلقة؛ لا يمكن تفعيل الشراء الآن." };
  const mandate = getActiveRepresentationContract(save, loan.playerId, currentDate);
  if (!mandate) return { changed: false, save, error: "يجب أن يظل عقد تمثيل اللاعب نشطًا لتفعيل خيار الشراء." };
  if (state.offers.length >= MAX_TRANSFER_OFFERS || state.moves.length >= MAX_TRANSFER_MOVES ||
      state.history.length + 3 > MAX_TRANSFER_HISTORY || state.ledger.length >= MAX_TRANSFER_LEDGER ||
      state.financeLedger.length + 3 > MAX_CLUB_FINANCE_ENTRIES)
    return { changed: false, save, error: "وصل سجل الانتقالات أو العمولات أو الميزانيات إلى الحد المتاح." };
  const player = getPlayer(database, loan.playerId);
  const club = getClub(database, loan.toClubId);
  if (!player || !club) return { changed: false, save, error: "بيانات اللاعب أو النادي المستعير غير متاحة." };
  const financials = getClubTransferFinancials(loan.toClubId, state, currentDate, database);
  if (loan.optionToBuyEur > financials.budgetEur)
    return { changed: false, save, error: "ميزانية النادي لا تكفي قيمة خيار الشراء." };
  if (loan.weeklyWageEur > financials.availableWagesWeeklyEur + loan.weeklyWageEur)
    return { changed: false, save, error: "ميزانية الرواتب لا تسمح بتثبيت عقد اللاعب." };
  const commissionBasisEur = loan.weeklyWageEur * 156;
  if (!validMoney(commissionBasisEur)) return { changed: false, save, error: "أساس احتساب العمولة غير صالح." };
  const commissionRate = getRepresentationContractCommission(mandate, currentDate);
  const commissionEur = Math.round(commissionBasisEur * commissionRate / 100);
  if (state.earnedCommissionEur + commissionEur > MAX_EUR)
    return { changed: false, save, error: "سجل عمولات الوكالة تجاوز الحد المالي المسموح." };

  const offerId = "transfer-offer-" + state.nextOfferSequence;
  const permanentMoveId = "transfer-move-" + state.nextMoveSequence;
  const terms = { feeEur: loan.optionToBuyEur, weeklyWageEur: loan.weeklyWageEur,
    signingBonusEur: 0, contractYears: 3 };
  const offer = {
    id: offerId, playerId: loan.playerId, playerName: loan.playerName, type: "permanent",
    fromClubId: loan.fromClubId, toClubId: loan.toClubId, toClubName: club.nameAr,
    marketValueEur: Number.isSafeInteger(player.marketValueEur) ? player.marketValueEur : loan.optionToBuyEur,
    terms, agreedTerms: terms, status: "completed", round: 1,
    createdDate: currentDate, expiresDate: addDays(currentDate, TRANSFER_OFFER_VALIDITY_DAYS),
    counterOffer: null, agreedDate: currentDate, completedDate: currentDate, moveId: permanentMoveId
  };
  const permanentMove = {
    id: permanentMoveId, offerId, playerId: loan.playerId, playerName: loan.playerName,
    type: "permanent", fromClubId: loan.fromClubId, toClubId: loan.toClubId,
    effectiveDate: currentDate, status: "active", feeEur: loan.optionToBuyEur,
    loanFeeEur: 0, optionToBuyEur: 0, weeklyWageEur: loan.weeklyWageEur,
    contractYears: 3, contractEndDate: addMonths(currentDate, 36), returnDate: null
  };
  let next = {
    ...state, nextOfferSequence: state.nextOfferSequence + 1, nextMoveSequence: state.nextMoveSequence + 1,
    offers: [offer, ...state.offers],
    moves: [permanentMove, ...state.moves.map((item) => item.id === loan.id
      ? { ...item, status: "purchased", purchasedDate: currentDate, purchaseMoveId: permanentMoveId } : item)]
  };
  if (commissionEur > 0) {
    const entry = { id: "transfer-ledger-" + next.nextLedgerSequence, type: "agent-commission",
      offerId, moveId: permanentMoveId, playerId: loan.playerId, date: currentDate, currency: "EUR",
      amountEur: commissionEur, commissionRate, representationContractId: mandate.id, basisEur: commissionBasisEur };
    next = { ...next, nextLedgerSequence: next.nextLedgerSequence + 1,
      earnedCommissionEur: next.earnedCommissionEur + commissionEur, ledger: [entry, ...next.ledger] };
  }
  next = appendClubFinance(next, offer, permanentMove, currentDate);
  next = appendHistory(next, "offer-sent", offer, currentDate, "تم تفعيل بند خيار الشراء من عقد الإعارة.");
  next = appendHistory(next, "offer-agreed", offer, currentDate, "تم الاتفاق تلقائيًا وفق قيمة خيار الشراء المحددة في العقد.");
  next = appendHistory(next, "transfer-completed", offer, currentDate, "تحولت الإعارة إلى انتقال نهائي لصالح " + club.nameAr + ".", { moveId: permanentMoveId });
  return { changed: true, status: "completed", action: "option-exercised", move: permanentMove, commissionEur,
    save: { ...save, world: { ...save.world, transfers: next } } };
}

export function advanceTransferState(save, currentDate = save?.world?.currentDate, database = WORLD_DATABASE) {
  const state = save?.world?.transfers;
  if (!isRecord(state) || !isTransferCalendarDate(currentDate))
    return { save, expiredOffers: [], returnedLoans: [], expiredContracts: [] };
  let nextSave = save;
  const expiredOffers = [];
  const returnedLoans = [];
  for (const offer of state.offers) {
    const agreedWindow = offer.status === "agreed"
      ? getTransferWindow(offer.agreedDate, offer.toClubId, database).window : null;
    const agreementMissedWindow = offer.status === "agreed" &&
      (!agreedWindow || currentDate > agreedWindow.endDate);
    const offerWindow = getTransferWindow(offer.createdDate, offer.toClubId, database).window;
    const offerWindowClosed = !offerWindow || currentDate > offerWindow.endDate;
    const mandateEnded = ["pending", "countered", "agreed"].includes(offer.status) &&
      !getActiveRepresentationContract(nextSave, offer.playerId, currentDate);
    const staleOpenOffer = ["pending", "countered"].includes(offer.status) &&
      (currentDate > offer.expiresDate || offerWindowClosed);
    if (agreementMissedWindow || staleOpenOffer || mandateEnded) {
      const result = expireTransferOffer(nextSave, offer, currentDate);
      nextSave = result.save;
      expiredOffers.push(offer.id);
    }
  }

  let next = nextSave.world.transfers;
  for (const move of [...next.moves]) {
    if (move.type === "loan" && move.status === "active" && currentDate >= move.returnDate) {
      next = { ...next, moves: next.moves.map((item) =>
        item.id === move.id ? { ...item, status: "returned", returnedDate: currentDate } : item) };
      next = { ...next, history: [{
        id: "transfer-history-" + next.nextHistorySequence,
        type: "loan-returned", offerId: move.offerId, moveId: move.id,
        playerId: move.playerId, playerName: move.playerName, date: currentDate,
        note: "انتهت مدة الإعارة وعاد اللاعب إلى ناديه الأصلي."
      }, ...next.history].slice(0, MAX_TRANSFER_HISTORY), nextHistorySequence: next.nextHistorySequence + 1 };
      returnedLoans.push(move.id);
    }
  }

  const expiredContracts = [];
  for (const move of [...next.moves]) {
    if (move.type !== "permanent" || move.status !== "active" ||
        !isTransferCalendarDate(move.contractEndDate) || currentDate < move.contractEndDate) continue;
    next = { ...next, moves: next.moves.map((item) =>
      item.id === move.id ? { ...item, status: "expired", expiredDate: currentDate } : item) };
    const before = next.freeAgents.length;
    next = appendFreeAgent(next, move.playerId, move.contractEndDate, move.toClubId, move.id);
    if (next.freeAgents.length > before) {
      expiredContracts.push(move.playerId);
      const originalOffer = next.offers.find((item) => item.id === move.offerId);
      if (originalOffer && next.history.length < MAX_TRANSFER_HISTORY)
        next = appendHistory(next, "contract-expired", originalOffer, currentDate,
          "انتهى العقد الاحترافي وأصبح اللاعب حرًا.", { moveId: move.id });
    }
  }

  // Seed player contracts also expire. A loan delays free agency until the player returns.
  for (const player of [...(database.players ?? []), ...(database.squadPlayers ?? [])]) {
    if (!isTransferCalendarDate(player.contractUntil) || currentDate < player.contractUntil ||
        next.freeAgents.some((item) => item.playerId === player.id)) continue;
    const hasPermanentMove = next.moves.some((move) =>
      move.playerId === player.id && move.type === "permanent" && move.effectiveDate <= currentDate
    );
    const hasActiveLoan = next.moves.some((move) =>
      move.playerId === player.id && move.type === "loan" &&
      move.status === "active" && currentDate < move.returnDate
    );
    if (!hasPermanentMove && !hasActiveLoan) {
      const previousClubId = player.clubId ?? FREE_AGENT_CLUB_ID;
      const before = next.freeAgents.length;
      next = appendFreeAgent(next, player.id, player.contractUntil, previousClubId, null);
      if (next.freeAgents.length > before) expiredContracts.push(player.id);
    }
  }

  if (next !== nextSave.world.transfers)
    nextSave = { ...nextSave, world: { ...nextSave.world, transfers: next } };
  return { save: nextSave, expiredOffers, returnedLoans, expiredContracts };
}

export function isValidTransferState(state, currentDate, clients = [], representation = null, database = WORLD_DATABASE) {
  if (!isRecord(state) || !isTransferCalendarDate(currentDate) || !Array.isArray(clients) ||
      !["nextOfferSequence", "nextMoveSequence", "nextHistorySequence", "nextLedgerSequence", "nextFinanceSequence"].every((key) => Number.isSafeInteger(state[key]) && state[key] >= 1) ||
      !validMoney(state.earnedCommissionEur) ||
      !Array.isArray(state.offers) || state.offers.length > MAX_TRANSFER_OFFERS ||
      !Array.isArray(state.moves) || state.moves.length > MAX_TRANSFER_MOVES ||
      !Array.isArray(state.history) || state.history.length > MAX_TRANSFER_HISTORY ||
      !Array.isArray(state.ledger) || state.ledger.length > MAX_TRANSFER_LEDGER ||
      !Array.isArray(state.financeLedger) || state.financeLedger.length > MAX_CLUB_FINANCE_ENTRIES ||
      !Array.isArray(state.freeAgents) || state.freeAgents.length > 5000) return false;
  const collections = [state.offers, state.moves, state.history, state.ledger, state.financeLedger];
  if (collections.some((items) => items.some((item) => !isRecord(item) || !validId(item.id)) ||
      new Set(items.map((item) => item.id)).size !== items.length)) return false;
  const offers = new Map();
  const openOfferPlayers = new Set();
  let highestOffer = 0;
  for (const offer of state.offers) {
    if (!sequenceOf(offer.id, "transfer-offer") || !validId(offer.playerId) || !validId(offer.playerName) ||
        !["permanent", "loan"].includes(offer.type) || !validId(offer.fromClubId) || !validId(offer.toClubId) ||
        offer.fromClubId === offer.toClubId || !validId(offer.toClubName) || !validMoney(offer.marketValueEur) ||
        !validTerms(offer.type, offer.terms) || !OFFER_STATUSES.has(offer.status) ||
        !Number.isInteger(offer.round) || offer.round < 1 || offer.round > 4 ||
        !isTransferCalendarDate(offer.createdDate) || !isTransferCalendarDate(offer.expiresDate) ||
        offer.createdDate > currentDate || offer.expiresDate !== addDays(offer.createdDate, TRANSFER_OFFER_VALIDITY_DAYS) ||
        (offer.counterOffer !== null && !validTerms(offer.type, offer.counterOffer))) return false;
    const createdWindow = getTransferWindow(offer.createdDate, offer.toClubId, database).window;
    if (!createdWindow || offer.createdDate < createdWindow.startDate || offer.createdDate > createdWindow.endDate) return false;
    if (offer.status === "countered" && !offer.counterOffer) return false;
    if ((offer.status === "countered") !== (offer.counterOffer !== null)) return false;
    if (["agreed", "completed"].includes(offer.status)) {
      const agreedWindow = isTransferCalendarDate(offer.agreedDate) ? getTransferWindow(offer.agreedDate, offer.toClubId, database).window : null;
      if (!validTerms(offer.type, offer.agreedTerms) || !agreedWindow ||
          offer.agreedDate < offer.createdDate || offer.agreedDate > currentDate ||
          agreedWindow.id !== createdWindow.id ||
          (offer.status === "agreed" && currentDate > agreedWindow.endDate)) return false;
    }
    if (["pending", "countered"].includes(offer.status) &&
        (currentDate > offer.expiresDate || currentDate > createdWindow.endDate)) return false;
    if (offer.status === "completed" &&
        (!validId(offer.moveId) || !isTransferCalendarDate(offer.completedDate) ||
         offer.completedDate < offer.agreedDate || offer.completedDate > currentDate ||
         !getTransferWindow(offer.completedDate).active ||
         getTransferWindow(offer.completedDate).window.id !== createdWindow.id)) return false;
    if (offer.status !== "completed" && offer.moveId !== null) return false;
    if (["pending", "countered", "agreed"].includes(offer.status)) {
      if (!clients.includes(offer.playerId) || openOfferPlayers.has(offer.playerId)) return false;
      openOfferPlayers.add(offer.playerId);
    }
    offers.set(offer.id, offer);
    highestOffer = Math.max(highestOffer, sequenceOf(offer.id, "transfer-offer"));
  }
  if (state.nextOfferSequence <= highestOffer) return false;

  const moves = new Map();
  let highestMove = 0;
  const activeLoans = new Set();
  for (const move of state.moves) {
    const offer = offers.get(move.offerId);
    if (!sequenceOf(move.id, "transfer-move") || !offer || offer.status !== "completed" ||
        offer.moveId !== move.id || offer.playerId !== move.playerId || offer.type !== move.type ||
        !validId(move.playerId) || !validId(move.playerName) || !["permanent", "loan"].includes(move.type) ||
        !validId(move.fromClubId) || !validId(move.toClubId) || move.fromClubId === move.toClubId ||
        move.fromClubId !== offer.fromClubId || move.toClubId !== offer.toClubId ||
        !isTransferCalendarDate(move.effectiveDate) || move.effectiveDate > currentDate ||
        move.effectiveDate !== offer.completedDate || move.effectiveDate < offer.agreedDate ||
        !["active", "returned", "purchased", "expired"].includes(move.status) || !validMoney(move.feeEur) ||
        !validMoney(move.loanFeeEur) || !validMoney(move.optionToBuyEur) || !validMoney(move.weeklyWageEur)) return false;
    if (move.type === "loan") {
      const terms = offer.agreedTerms;
      if (move.feeEur !== 0 || move.contractYears !== null || !isTransferCalendarDate(move.returnDate) ||
          move.returnDate !== addMonths(move.effectiveDate, terms.loanMonths) ||
          move.loanFeeEur !== terms.loanFeeEur || move.optionToBuyEur !== terms.optionToBuyEur ||
          move.weeklyWageEur !== terms.weeklyWageEur ||
          (move.status === "active" && (currentDate >= move.returnDate || move.returnedDate !== undefined)) ||
          (move.status === "returned" && (!isTransferCalendarDate(move.returnedDate) || move.returnedDate < move.returnDate || move.returnedDate > currentDate))) return false;
      if (move.status === "active") {
        if (activeLoans.has(move.playerId)) return false;
        activeLoans.add(move.playerId);
      }
    } else if (!["active", "expired"].includes(move.status) || move.returnDate !== null ||
        move.loanFeeEur !== 0 || move.optionToBuyEur !== 0 ||
        move.feeEur !== offer.agreedTerms.feeEur ||
        move.weeklyWageEur !== offer.agreedTerms.weeklyWageEur ||
        !Number.isInteger(move.contractYears) || move.contractYears !== offer.agreedTerms.contractYears ||
        move.contractYears < 1 || move.contractYears > 5 ||
        move.contractEndDate !== addMonths(move.effectiveDate, move.contractYears * 12) ||
        (move.status === "expired" && (!isTransferCalendarDate(move.expiredDate) || move.expiredDate < move.contractEndDate || move.expiredDate > currentDate)) ||
        (move.status === "active" && currentDate >= move.contractEndDate)) return false;
    moves.set(move.id, move);
    highestMove = Math.max(highestMove, sequenceOf(move.id, "transfer-move"));
  }
  if (state.nextMoveSequence <= highestMove) return false;
  for (const offer of state.offers) if (offer.status === "completed" && !moves.has(offer.moveId)) return false;

  let ledgerTotal = 0;
  let highestLedger = 0;
  for (const entry of state.ledger) {
    const offer = offers.get(entry.offerId);
    const move = moves.get(entry.moveId);
    if (!sequenceOf(entry.id, "transfer-ledger") || !offer || offer.status !== "completed" ||
        !move || move.offerId !== entry.offerId || move.id !== offer.moveId ||
        entry.playerId !== move.playerId || entry.date !== move.effectiveDate ||
        entry.type !== "agent-commission" || !isTransferCalendarDate(entry.date) || entry.date > currentDate ||
        entry.currency !== "EUR" || !validMoney(entry.amountEur) ||
        !Number.isInteger(entry.commissionRate) || entry.commissionRate < 5 || entry.commissionRate > 15 ||
        !validMoney(entry.basisEur) || entry.amountEur !== Math.round(entry.basisEur * entry.commissionRate / 100)) return false;
    const contracts = Array.isArray(representation?.contracts) ? representation.contracts : [];
    const contract = contracts.find((item) => item.id === entry.representationContractId);
    if (!contract || contract.playerId !== entry.playerId || entry.date < contract.signedOn ||
        entry.date >= getRepresentationContractExpiry(contract) ||
        (contract.endedOn && entry.date > contract.endedOn) ||
        getRepresentationContractCommission(contract, entry.date) !== entry.commissionRate) return false;
    const terms = offer.agreedTerms;
    const contractWeeks = offer.type === "permanent"
      ? terms.contractYears * 52
      : Math.round(terms.loanMonths * 52 / 12);
    const expectedBasis = terms.weeklyWageEur * contractWeeks + terms.signingBonusEur;
    if (entry.basisEur !== expectedBasis) return false;
    ledgerTotal += entry.amountEur;
    highestLedger = Math.max(highestLedger, sequenceOf(entry.id, "transfer-ledger"));
  }
  if (state.nextLedgerSequence <= highestLedger || ledgerTotal !== state.earnedCommissionEur) return false;

  let highestHistory = 0;
  for (const item of state.history) {
    const offer = offers.get(item.offerId);
    const move = item.moveId === undefined ? null : moves.get(item.moveId);
    if (!sequenceOf(item.id, "transfer-history") || !HISTORY_TYPES.has(item.type) ||
        !offer || item.playerId !== offer.playerId || item.playerName !== offer.playerName ||
        !isTransferCalendarDate(item.date) || item.date > currentDate || typeof item.note !== "string" || !item.note.trim() ||
        (item.moveId !== undefined && (!move || move.offerId !== item.offerId)) ||
        (["transfer-completed", "loan-returned"].includes(item.type) && !move)) return false;
    highestHistory = Math.max(highestHistory, sequenceOf(item.id, "transfer-history"));
  }
  if (state.nextHistorySequence <= highestHistory) return false;

  const purchaseMoves = new Map(state.moves.filter((move) => move.type === "permanent").map((move) => [move.id, move]));
  for (const loan of state.moves.filter((move) => move.type === "loan" && move.status === "purchased")) {
    const purchase = purchaseMoves.get(loan.purchaseMoveId);
    if (!purchase || purchase.playerId !== loan.playerId || purchase.fromClubId !== loan.fromClubId ||
        purchase.toClubId !== loan.toClubId || purchase.effectiveDate !== loan.purchasedDate ||
        purchase.feeEur !== loan.optionToBuyEur) return false;
  }

  let highestFinance = 0;
  for (const entry of state.financeLedger) {
    const offer = offers.get(entry.offerId);
    const move = moves.get(entry.moveId);
    if (!sequenceOf(entry.id, "club-finance") || !offer || offer.status !== "completed" ||
        !move || move.offerId !== offer.id || entry.playerId !== move.playerId ||
        !validId(entry.clubId) || !["transfer-fee", "loan-fee", "signing-bonus"].includes(entry.type) ||
        entry.currency !== "EUR" || !Number.isSafeInteger(entry.amountEur) ||
        !isTransferCalendarDate(entry.date) || entry.date !== move.effectiveDate) return false;
    highestFinance = Math.max(highestFinance, sequenceOf(entry.id, "club-finance"));
  }
  if (state.nextFinanceSequence <= highestFinance) return false;

  const freeAgentPlayers = new Set();
  for (const item of state.freeAgents) {
    if (!isRecord(item) || !validId(item.playerId) || !isTransferCalendarDate(item.sinceDate) ||
        item.sinceDate > currentDate || !validId(item.formerClubId) ||
        (item.contractMoveId !== null && item.contractMoveId !== undefined &&
          (!moves.has(item.contractMoveId) || moves.get(item.contractMoveId).playerId !== item.playerId)) ||
        freeAgentPlayers.has(item.playerId)) return false;
    freeAgentPlayers.add(item.playerId);
  }
  return true;
}
