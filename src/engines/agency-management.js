import { WORLD_DATABASE } from "../data/world-database.js";
import { getClubTransferFinancials, getTransferWindowForClub } from "./club-transfer-rules.js";
const MAX_LEDGER_ENTRIES = 1000;
const MAX_MONEY_EGP = 2000000000;
const MAX_ACTIVE_STAFF = 6;
const MAX_ACTIVE_BRANCHES = 4;

export const AGENCY_JOB_ROLES = Object.freeze([
  Object.freeze({ id:"negotiator", name:"مفاوض تعاقدات", description:"إدارة عروض التمثيل والتفاوض مع الأندية.", hiringCostEgp:9000, weeklySalaryEgp:1800, maxHeadcount:2 }),
  Object.freeze({ id:"analyst", name:"محلل أداء", description:"تحليل أداء اللاعبين ومقارنة فرص السوق.", hiringCostEgp:7500, weeklySalaryEgp:1450, maxHeadcount:2 }),
  Object.freeze({ id:"legal", name:"مستشار قانوني", description:"مراجعة العقود وبنود الانتقالات والمخاطر.", hiringCostEgp:11000, weeklySalaryEgp:2100, maxHeadcount:1 }),
  Object.freeze({ id:"media", name:"مسؤول إعلام", description:"إدارة صورة الوكالة وعلاقاتها الإعلامية.", hiringCostEgp:6500, weeklySalaryEgp:1250, maxHeadcount:1 }),
  Object.freeze({ id:"operations", name:"مدير عمليات", description:"تنظيم العمل والمهام والتوسع التشغيلي.", hiringCostEgp:10000, weeklySalaryEgp:1900, maxHeadcount:1 })
]);

export const AGENCY_BRANCH_LOCATIONS = Object.freeze([
  Object.freeze({ id:"alexandria", name:"الإسكندرية", setupCostEgp:18000, weeklyRentEgp:1200, region:"مصر" }),
  Object.freeze({ id:"madrid", name:"مدريد", setupCostEgp:45000, weeklyRentEgp:3400, region:"أوروبا" }),
  Object.freeze({ id:"london", name:"لندن", setupCostEgp:60000, weeklyRentEgp:4200, region:"أوروبا" })
]);export const AGENCY_SPONSOR_PACKAGES = Object.freeze([
  Object.freeze({ id:"local-media", name:"شريك إعلامي محلي", description:"رعاية أسبوعية للمحتوى والظهور الإعلامي للوكالة.", signingBonusEgp:8000, weeklyRevenueEgp:3000, termDays:365, minClients:0, minReputation:50 }),
  Object.freeze({ id:"sportswear", name:"شريك ملابس رياضية", description:"شراكة متوسطة ترتبط بحجم قائمة اللاعبين وسمعة الوكالة.", signingBonusEgp:16000, weeklyRevenueEgp:6200, termDays:365, minClients:2, minReputation:58 }),
  Object.freeze({ id:"global-brand", name:"شريك علامة عالمية", description:"اتفاق طويل المدى لوكالة ذات قاعدة عملاء وسمعة قوية.", signingBonusEgp:35000, weeklyRevenueEgp:12500, termDays:730, minClients:4, minReputation:72 })
]);

const COMPETITOR_BLUEPRINTS = Object.freeze([
  Object.freeze({ id:"rival-north-star", name:"North Star Sports", region:"أوروبا", focus:"المواهب الهجومية والوسط", focusKey:"attack", reputation:78, budgetEgp:320000, acquisitionCostEgp:9000, maxClients:24 }),
  Object.freeze({ id:"rival-pioneer", name:"Pioneer Football Group", region:"شمال أفريقيا", focus:"المواهب الشابة والدفاع", focusKey:"youth-defense", reputation:62, budgetEgp:240000, acquisitionCostEgp:7000, maxClients:20 }),
  Object.freeze({ id:"rival-atlas", name:"Atlas Player Partners", region:"عالمي", focus:"اللاعبون أصحاب التقييم المرتفع", focusKey:"elite", reputation:86, budgetEgp:420000, acquisitionCostEgp:14000, maxClients:30 })
]);
const MAX_SPONSORSHIPS = 20;
const MAX_COMPETITIVE_HISTORY = 300;
const MAX_RIVAL_CLIENTS = 100;
const MAX_CLUB_INTERESTS = 200;

export const AGENCY_CREDIT_PRODUCTS = Object.freeze([
  Object.freeze({ id:"working-capital", name:"تمويل رأس مال عامل", description:"تمويل قصير لتغطية التشغيل والسيولة.", principalEgp:50000, interestRatePct:12, termWeeks:12, minClients:0, minReputation:50 }),
  Object.freeze({ id:"expansion-credit", name:"تمويل التوسع", description:"تمويل أكبر للوكالات ذات قاعدة عملاء وسمعة أعلى.", principalEgp:120000, interestRatePct:15, termWeeks:16, minClients:3, minReputation:65 })
]);
const MAX_CREDIT_FACILITIES = 10;



function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
function validMoney(value) { return Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY_EGP; }
function addDays(value, days) {
  const date = new Date(value + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function nextMondayAfter(value) {
  let date = addDays(value, 1);
  for (let index = 0; index < 7 && new Date(date + "T00:00:00.000Z").getUTCDay() !== 1; index += 1) {
    date = addDays(date, 1);
  }
  return date;
}
function stablePositionBonus(player, focusKey) {
  const position = String(player?.position ?? "").toLocaleLowerCase("en");
  const role = String(player?.role ?? "").toLocaleLowerCase("en");
  const combined = position + " " + role;
  if (focusKey === "attack") return /st|cf|fw|lw|rw|مهاجم|هجوم/.test(combined) ? 4 : 0;
  if (focusKey === "youth-defense") return (Number(player?.age) <= 21 ? 4 : 0) + (/cb|lb|rb|def|مدافع|دفاع/.test(combined) ? 3 : 0);
  if (focusKey === "elite") return Number(player?.rating) >= 78 ? 5 : 0;
  return 0;
}
function sequenceOf(id, prefix) {
  const match = new RegExp("^" + prefix + "-(\\d+)$").exec(id);
  return match ? Number(match[1]) : 0;
}
function appendLedger(state, entry) {
  return {
    ...state,
    nextLedgerSequence: state.nextLedgerSequence + 1,
    ledger: [{ id:"agency-ledger-" + state.nextLedgerSequence, ...entry }, ...state.ledger].slice(0, MAX_LEDGER_ENTRIES)
  };
}
function failure(save, error) { return { changed:false, save, error }; }
function resolveManagement(save, currentDate) {
  if (!isRecord(save?.agency) || !validDate(currentDate) || currentDate !== save?.world?.currentDate) return null;
  const management = save.agency.management;
  return isValidAgencyManagementState(management, currentDate) ? management : null;
}

export function createInitialAgencyManagementState() {
  return {
    schemaVersion:1, nextStaffSequence:1, nextBranchSequence:1, nextLedgerSequence:1, nextSponsorshipSequence:1, nextCompetitiveSequence:1, nextCreditSequence:1, nextClubInterestSequence:1,
    lastPayrollDate:null, arrearsEgp:0, staff:[],
    branches:[{
      id:"agency-branch-hq", locationId:"headquarters", name:"المقر الرئيسي", region:"المقر الرئيسي",
      openedDate:"2026-07-01", setupCostEgp:0, weeklyRentEgp:0, isHeadquarters:true,
      status:"active", closedDate:null
    }],
    ledger:[],
    sponsorships:[],
    creditFacilities:[],
    clubInterests:[],
    competitors:COMPETITOR_BLUEPRINTS.map((profile) => ({
      ...profile, clients:[], pendingOffers:[], lastActionDate:null
    })),
    competitiveHistory:[]
  };
}

export function isValidAgencyManagementState(state, currentDate) {
  if (!isRecord(state) || state.schemaVersion !== 1 ||
      !Number.isSafeInteger(state.nextStaffSequence) || state.nextStaffSequence < 1 ||
      !Number.isSafeInteger(state.nextBranchSequence) || state.nextBranchSequence < 1 ||
      !Number.isSafeInteger(state.nextLedgerSequence) || state.nextLedgerSequence < 1 ||
      !validMoney(state.arrearsEgp) || !Array.isArray(state.staff) || state.staff.length > 100 ||
      !Array.isArray(state.branches) || state.branches.length < 1 || state.branches.length > 100 ||
      !Array.isArray(state.ledger) || state.ledger.length > MAX_LEDGER_ENTRIES || !validDate(currentDate)) return false;
  if (state.lastPayrollDate !== null &&
      (!validDate(state.lastPayrollDate) || state.lastPayrollDate > currentDate ||
       new Date(state.lastPayrollDate + "T00:00:00.000Z").getUTCDay() !== 1)) return false;

  const sponsorships = state.sponsorships === undefined ? [] : state.sponsorships;
  const competitors = state.competitors === undefined
    ? COMPETITOR_BLUEPRINTS.map((profile) => ({ ...profile, clients:[], pendingOffers:[], lastActionDate:null }))
    : state.competitors;
  const competitiveHistory = state.competitiveHistory === undefined ? [] : state.competitiveHistory;
  const nextSponsorshipSequence = state.nextSponsorshipSequence ?? 1;
  const nextCompetitiveSequence = state.nextCompetitiveSequence ?? 1;
  const clubInterests = state.clubInterests === undefined ? [] : state.clubInterests;
  const nextClubInterestSequence = state.nextClubInterestSequence ?? 1;
  if (!Number.isSafeInteger(nextClubInterestSequence) || nextClubInterestSequence < 1 ||
      !Array.isArray(clubInterests) || clubInterests.length > MAX_CLUB_INTERESTS) return false;
  const clubInterestIds = new Set();
  let highestClubInterest = 0;
  for (const interest of clubInterests) {
    const club = WORLD_DATABASE.clubs.find((item) => item.id === interest?.clubId);
    if (!isRecord(interest) || !sequenceOf(interest.id,"agency-club-interest") ||
        clubInterestIds.has(interest.id) || !club ||
        typeof interest.playerId !== "string" || !interest.playerId.trim() ||
        typeof interest.playerName !== "string" || !interest.playerName.trim() ||
        typeof interest.position !== "string" || !interest.position.trim() ||
        !Number.isInteger(interest.rating) || interest.rating < 1 || interest.rating > 99 ||
        !Number.isInteger(interest.potential) || interest.potential < interest.rating || interest.potential > 99 ||
        typeof interest.currentClubId !== "string" || !interest.currentClubId.trim() ||
        !validDate(interest.createdDate) || interest.createdDate > currentDate ||
        !validDate(interest.updatedDate) || interest.updatedDate < interest.createdDate || interest.updatedDate > currentDate ||
        !validDate(interest.expiresDate) || interest.expiresDate !== addDays(interest.createdDate,14) ||
        !Number.isInteger(interest.fitScore) || interest.fitScore < 0 || interest.fitScore > 100 ||
        !Number.isSafeInteger(interest.clubBudgetEur) || interest.clubBudgetEur < 0 ||
        !Number.isSafeInteger(interest.estimatedFeeEur) || interest.estimatedFeeEur < 0 ||
        !["monitoring","enquiry","expired","window-closed","withdrawn"].includes(interest.status) ||
        (interest.transferWindowEndDate !== null && !validDate(interest.transferWindowEndDate)) ||
        (interest.status === "expired" && currentDate <= interest.expiresDate)) return false;
    clubInterestIds.add(interest.id);
    highestClubInterest = Math.max(highestClubInterest,sequenceOf(interest.id,"agency-club-interest"));
  }
  if (nextClubInterestSequence <= highestClubInterest) return false;
  const creditFacilities = state.creditFacilities === undefined ? [] : state.creditFacilities;
  const nextCreditSequence = state.nextCreditSequence ?? 1;
  if (!Number.isSafeInteger(nextCreditSequence) || nextCreditSequence < 1 ||
      !Array.isArray(creditFacilities) || creditFacilities.length > MAX_CREDIT_FACILITIES) return false;
  const creditIds = new Set();
  let highestCredit = 0;
  for (const loan of creditFacilities) {
    const product = AGENCY_CREDIT_PRODUCTS.find((item) => item.id === loan?.productId);
    const expectedTotal = product
      ? product.principalEgp + Math.ceil(product.principalEgp * product.interestRatePct / 100)
      : -1;
    if (!isRecord(loan) || !product || typeof loan.id !== "string" ||
        !sequenceOf(loan.id,"agency-credit") || creditIds.has(loan.id) ||
        loan.name !== product.name || loan.principalEgp !== product.principalEgp ||
        loan.interestRatePct !== product.interestRatePct || loan.totalRepaymentEgp !== expectedTotal ||
        loan.termWeeks !== product.termWeeks ||
        loan.weeklyInstallmentEgp !== Math.ceil(expectedTotal / product.termWeeks) ||
        !validDate(loan.issuedDate) || loan.issuedDate > currentDate ||
        !validDate(loan.nextPaymentDate) || loan.nextPaymentDate <= loan.issuedDate ||
        !validMoney(loan.remainingEgp) || loan.remainingEgp > expectedTotal ||
        !validMoney(loan.paidEgp) || loan.paidEgp !== expectedTotal - loan.remainingEgp ||
        !Number.isSafeInteger(loan.lateWeeks) || loan.lateWeeks < 0 ||
        (loan.lastPaymentDate !== null &&
          (!validDate(loan.lastPaymentDate) || loan.lastPaymentDate < loan.issuedDate ||
           loan.lastPaymentDate > currentDate ||
           new Date(loan.lastPaymentDate + "T00:00:00.000Z").getUTCDay() !== 1)) ||
        !["active","repaid"].includes(loan.status) ||
        (loan.status === "active" && loan.remainingEgp <= 0) ||
        (loan.status === "repaid" && loan.remainingEgp !== 0)) return false;
    creditIds.add(loan.id);
    highestCredit = Math.max(highestCredit,sequenceOf(loan.id,"agency-credit"));
  }
  if (nextCreditSequence <= highestCredit) return false;
  if (!Number.isSafeInteger(nextSponsorshipSequence) || nextSponsorshipSequence < 1 ||
      !Number.isSafeInteger(nextCompetitiveSequence) || nextCompetitiveSequence < 1 ||
      !Array.isArray(sponsorships) || sponsorships.length > MAX_SPONSORSHIPS ||
      !Array.isArray(competitors) || competitors.length !== COMPETITOR_BLUEPRINTS.length ||
      !Array.isArray(competitiveHistory) || competitiveHistory.length > MAX_COMPETITIVE_HISTORY) return false;

  const sponsorshipIds = new Set();
  let highestSponsorship = 0;
  for (const deal of sponsorships) {
    const pack = AGENCY_SPONSOR_PACKAGES.find((item) => item.id === deal?.packageId);
    if (!isRecord(deal) || !pack || typeof deal.id !== "string" ||
        !sequenceOf(deal.id,"agency-sponsorship") || sponsorshipIds.has(deal.id) ||
        deal.name !== pack.name || deal.weeklyRevenueEgp !== pack.weeklyRevenueEgp ||
        deal.signingBonusEgp !== pack.signingBonusEgp || deal.termDays !== pack.termDays ||
        !validDate(deal.signedDate) || deal.signedDate > currentDate ||
        deal.expiresDate !== addDays(deal.signedDate,pack.termDays) ||
        !validDate(deal.nextPaymentDate) || deal.nextPaymentDate <= deal.signedDate ||
        (deal.lastPaidDate !== null &&
          (!validDate(deal.lastPaidDate) || deal.lastPaidDate > currentDate ||
           deal.lastPaidDate < deal.signedDate ||
           new Date(deal.lastPaidDate + "T00:00:00.000Z").getUTCDay() !== 1)) ||
        !["active","expired"].includes(deal.status) ||
        (deal.status === "active" && currentDate > deal.expiresDate) ||
        (deal.status === "expired" && currentDate <= deal.expiresDate)) return false;
    sponsorshipIds.add(deal.id);
    highestSponsorship = Math.max(highestSponsorship,sequenceOf(deal.id,"agency-sponsorship"));
  }
  if (nextSponsorshipSequence <= highestSponsorship) return false;
  const activePackages = sponsorships.filter((deal) => deal.status === "active").map((deal) => deal.packageId);
  if (new Set(activePackages).size !== activePackages.length) return false;

  const competitorBlueprintById = new Map(COMPETITOR_BLUEPRINTS.map((profile) => [profile.id,profile]));
  const globalRivalClients = new Set();
  for (const competitor of competitors) {
    const blueprint = competitorBlueprintById.get(competitor?.id);
    if (!isRecord(competitor) || !blueprint ||
        competitor.name !== blueprint.name || competitor.region !== blueprint.region ||
        competitor.focus !== blueprint.focus || competitor.focusKey !== blueprint.focusKey ||
        competitor.reputation !== blueprint.reputation || competitor.maxClients !== blueprint.maxClients ||
        competitor.acquisitionCostEgp !== blueprint.acquisitionCostEgp ||
        !validMoney(competitor.budgetEgp) ||
        !Array.isArray(competitor.clients) || competitor.clients.length > MAX_RIVAL_CLIENTS ||
        !Array.isArray(competitor.pendingOffers) || competitor.pendingOffers.length > 100 ||
        (competitor.lastActionDate !== null &&
          (!validDate(competitor.lastActionDate) || competitor.lastActionDate > currentDate ||
           new Date(competitor.lastActionDate + "T00:00:00.000Z").getUTCDay() !== 1))) return false;
    const localClients = new Set();
    for (const client of competitor.clients) {
      if (!isRecord(client) || typeof client.playerId !== "string" || !client.playerId.trim() ||
          localClients.has(client.playerId) || globalRivalClients.has(client.playerId) ||
          typeof client.playerName !== "string" || !client.playerName.trim() ||
          !validDate(client.signedDate) || client.signedDate > currentDate ||
          !Number.isInteger(client.rating) || client.rating < 1 || client.rating > 99 ||
          !Number.isInteger(client.potential) || client.potential < client.rating || client.potential > 99 ||
          !Number.isInteger(client.commissionRate) || client.commissionRate < 5 || client.commissionRate > 15) return false;
      localClients.add(client.playerId);
      globalRivalClients.add(client.playerId);
    }
    const offerIds = new Set();
    for (const offer of competitor.pendingOffers) {
      if (!isRecord(offer) || typeof offer.id !== "string" || !offer.id.startsWith("rival-offer-") ||
          offerIds.has(offer.id) || typeof offer.playerId !== "string" || !offer.playerId.trim() ||
          typeof offer.playerName !== "string" || !offer.playerName.trim() ||
          !Number.isInteger(offer.rating) || offer.rating < 1 || offer.rating > 99 ||
          !Number.isInteger(offer.potential) || offer.potential < offer.rating || offer.potential > 99 ||
          !Number.isInteger(offer.commissionRate) || offer.commissionRate < 5 || offer.commissionRate > 15 ||
          !validDate(offer.offeredDate) || !validDate(offer.dueDate) ||
          offer.dueDate !== addDays(offer.offeredDate,3) || offer.offeredDate > currentDate ||
          !["pending","accepted","rejected"].includes(offer.status) ||
          (offer.status === "pending" && currentDate > offer.dueDate) ||
          (offer.status !== "pending" &&
            (!validDate(offer.decisionDate) || offer.decisionDate < offer.dueDate || offer.decisionDate > currentDate))) return false;
      offerIds.add(offer.id);
    }
  }

  const historyIds = new Set();
  let highestCompetitive = 0;
  for (const entry of competitiveHistory) {
    if (!isRecord(entry) || !sequenceOf(entry.id,"agency-competition") || historyIds.has(entry.id) ||
        !COMPETITOR_BLUEPRINTS.some((profile) => profile.id === entry.agencyId) ||
        typeof entry.agencyName !== "string" || !entry.agencyName.trim() ||
        typeof entry.playerId !== "string" || !entry.playerId.trim() ||
        typeof entry.playerName !== "string" || !entry.playerName.trim() ||
        !validDate(entry.date) || entry.date > currentDate ||
        !["offer-sent","offer-accepted","offer-rejected"].includes(entry.type) ||
        typeof entry.note !== "string" || !entry.note.trim()) return false;
    historyIds.add(entry.id);
    highestCompetitive = Math.max(highestCompetitive,sequenceOf(entry.id,"agency-competition"));
  }
  if (nextCompetitiveSequence <= highestCompetitive) return false;

  const staffIds = new Set();
  let highestStaff = 0;
  for (const employee of state.staff) {
    const role = AGENCY_JOB_ROLES.find((item) => item.id === employee?.roleId);
    if (!isRecord(employee) || !role || typeof employee.id !== "string" ||
        !sequenceOf(employee.id,"agency-staff") || staffIds.has(employee.id) ||
        employee.name !== role.name || employee.weeklySalaryEgp !== role.weeklySalaryEgp ||
        employee.hiringCostEgp !== role.hiringCostEgp || !validDate(employee.hiredDate) ||
        employee.hiredDate > currentDate || !["active","terminated"].includes(employee.status) ||
        (employee.status === "active" && employee.terminatedDate !== null) ||
        (employee.status === "terminated" &&
         (!validDate(employee.terminatedDate) || employee.terminatedDate < employee.hiredDate ||
          employee.terminatedDate > currentDate))) return false;
    staffIds.add(employee.id);
    highestStaff = Math.max(highestStaff, sequenceOf(employee.id,"agency-staff"));
  }
  if (state.nextStaffSequence <= highestStaff) return false;
  const activeByRole = new Map();
  for (const employee of state.staff.filter((item) => item.status === "active")) {
    activeByRole.set(employee.roleId, (activeByRole.get(employee.roleId) ?? 0) + 1);
  }
  if ([...activeByRole].some(([roleId,count]) =>
      count > AGENCY_JOB_ROLES.find((item) => item.id === roleId).maxHeadcount) ||
      state.staff.filter((item) => item.status === "active").length > MAX_ACTIVE_STAFF) return false;

  const branchIds = new Set();
  const activeLocations = new Set();
  let headquartersCount = 0;
  let highestBranch = 0;
  for (const branch of state.branches) {
    const location = branch?.locationId === "headquarters"
      ? { name:"المقر الرئيسي", region:"المقر الرئيسي", setupCostEgp:0, weeklyRentEgp:0 }
      : AGENCY_BRANCH_LOCATIONS.find((item) => item.id === branch?.locationId);
    if (!isRecord(branch) || !location || typeof branch.id !== "string" ||
        !branch.id.startsWith("agency-branch-") || branchIds.has(branch.id) ||
        branch.name !== location.name || branch.region !== location.region ||
        branch.setupCostEgp !== location.setupCostEgp || branch.weeklyRentEgp !== location.weeklyRentEgp ||
        !validDate(branch.openedDate) || branch.openedDate > currentDate ||
        !["active","closed"].includes(branch.status) ||
        (branch.status === "active" && branch.closedDate !== null) ||
        (branch.status === "closed" &&
         (!validDate(branch.closedDate) || branch.closedDate < branch.openedDate || branch.closedDate > currentDate)) ||
        typeof branch.isHeadquarters !== "boolean" ||
        branch.isHeadquarters !== (branch.locationId === "headquarters")) return false;
    if (branch.isHeadquarters) {
      headquartersCount += 1;
      if (branch.id !== "agency-branch-hq" || branch.status !== "active") return false;
    }
    if (branch.status === "active") {
      if (activeLocations.has(branch.locationId)) return false;
      activeLocations.add(branch.locationId);
    }
    highestBranch = Math.max(highestBranch, sequenceOf(branch.id,"agency-branch"));
    branchIds.add(branch.id);
  }
  if (headquartersCount !== 1 || state.nextBranchSequence <= highestBranch ||
      state.branches.filter((item) => item.status === "active").length > MAX_ACTIVE_BRANCHES) return false;

  const ledgerIds = new Set();
  let highestLedger = 0;
  for (const entry of state.ledger) {
    if (!isRecord(entry) || !sequenceOf(entry.id,"agency-ledger") || ledgerIds.has(entry.id) ||
        !validDate(entry.date) || entry.date > currentDate ||
        !["hiring","branch-opening","weekly-operations","sponsorship-income","credit-drawdown","credit-repayment"].includes(entry.type) ||
        !validMoney(entry.amountEgp) || entry.amountEgp < 1 ||
        !validMoney(entry.paidEgp) || entry.paidEgp > entry.amountEgp ||
        !validMoney(entry.arrearsAfterEgp) || typeof entry.note !== "string" || !entry.note.trim() ||
        (entry.referenceId !== null && typeof entry.referenceId !== "string") ||
        (entry.direction !== undefined && !["income","expense","financing"].includes(entry.direction)) ||
        (entry.type === "sponsorship-income" && (entry.direction !== "income" ||
          !["signing","weekly"].includes(entry.incomeKind))) ||
        (entry.type === "credit-drawdown" && entry.direction !== "financing") ||
        (entry.type === "credit-repayment" && entry.direction !== "expense") ||
        (!["sponsorship-income","credit-drawdown","credit-repayment"].includes(entry.type) &&
          entry.direction === "income")) return false;
    highestLedger = Math.max(highestLedger, sequenceOf(entry.id,"agency-ledger"));
    ledgerIds.add(entry.id);
  }
  return state.nextLedgerSequence > highestLedger;
}


export function getAgencyStaffModifiers(save) {
  const active = (save?.agency?.management?.staff ?? []).filter((item) => item.status === "active");
  const count = (roleId) => active.filter((item) => item.roleId === roleId).length;
  return {
    negotiationBonus:Math.min(6,count("negotiator") * 3),
    scoutingAccuracyBonus:Math.min(0.08,count("analyst") * 0.04),
    legalProtectionBonus:Math.min(10,count("legal") * 6),
    brandReachBonus:Math.min(12,count("media") * 6),
    operationsEfficiencyPct:Math.min(6,count("operations") * 3)
  };
}

export function getAgencySponsorshipOffers(save) {
  const management = save?.agency?.management ?? createInitialAgencyManagementState();
  const reputation = save?.agency?.representation?.reputationScore ?? 50;
  const modifiers = getAgencyStaffModifiers(save);
  const clientCount = save?.agency?.clients?.length ?? 0;
  return AGENCY_SPONSOR_PACKAGES.map((pack) => {
    const active = (management.sponsorships ?? []).some((deal) =>
      deal.packageId === pack.id && deal.status === "active");
    const effectiveReputation = reputation + modifiers.brandReachBonus;
    const lockedReason = active ? "اتفاق نشط بالفعل" :
      clientCount < pack.minClients ? "تحتاج إلى " + pack.minClients + " عملاء على الأقل" :
      effectiveReputation < pack.minReputation ? "تحتاج إلى سمعة " + pack.minReputation + " أو أكثر" : null;
    return {...pack,active,available:!lockedReason,lockedReason,effectiveReputation};
  });
}


export function getAgencyCreditOffers(save) {
  const management = save?.agency?.management ?? createInitialAgencyManagementState();
  const reputation = save?.agency?.representation?.reputationScore ?? 50;
  const activeLoans = (management.creditFacilities ?? []).filter((loan) => loan.status === "active");
  const clientCount = save?.agency?.clients?.length ?? 0;
  return AGENCY_CREDIT_PRODUCTS.map((product) => {
    const eligible = clientCount >= product.minClients && reputation >= product.minReputation &&
      activeLoans.length === 0 && (management.creditFacilities ?? []).length < MAX_CREDIT_FACILITIES &&
      (save?.agency?.balance ?? 0) + product.principalEgp <= MAX_MONEY_EGP;
    const lockedReason = activeLoans.length > 0 ? "سدد التسهيل الحالي قبل طلب تمويل جديد" :
      clientCount < product.minClients ? "تحتاج إلى " + product.minClients + " عملاء على الأقل" :
      reputation < product.minReputation ? "تحتاج إلى سمعة " + product.minReputation + " أو أكثر" :
      (management.creditFacilities ?? []).length >= MAX_CREDIT_FACILITIES ? "وصلت إلى الحد الأقصى للتسهيلات" : null;
    return {
      ...product,eligible,lockedReason,
      totalRepaymentEgp:product.principalEgp + Math.ceil(product.principalEgp * product.interestRatePct / 100),
      weeklyInstallmentEgp:Math.ceil((product.principalEgp + Math.ceil(product.principalEgp * product.interestRatePct / 100)) / product.termWeeks)
    };
  });
}

export function takeAgencyCredit(save, productId, currentDate = save?.world?.currentDate) {
  const state = resolveManagement(save,currentDate);
  if (!state) return failure(save,"بيانات إدارة الوكالة أو التاريخ غير صالحة.");
  const offer = getAgencyCreditOffers(save).find((item) => item.id === productId);
  if (!offer) return failure(save,"منتج التمويل المطلوب غير متاح.");
  if (!offer.eligible) return failure(save,offer.lockedReason ?? "شروط التمويل غير مستوفاة.");
  if ((state.creditFacilities ?? []).length >= MAX_CREDIT_FACILITIES ||
      state.ledger.length >= MAX_LEDGER_ENTRIES) return failure(save,"وصل سجل التمويل أو الدفتر المالي إلى الحد المتاح.");
  const loan = {
    id:"agency-credit-" + (state.nextCreditSequence ?? 1),
    productId:offer.id,name:offer.name,issuedDate:currentDate,
    principalEgp:offer.principalEgp,interestRatePct:offer.interestRatePct,
    totalRepaymentEgp:offer.totalRepaymentEgp,remainingEgp:offer.totalRepaymentEgp,
    paidEgp:0,termWeeks:offer.termWeeks,weeklyInstallmentEgp:offer.weeklyInstallmentEgp,
    nextPaymentDate:nextMondayAfter(currentDate),lastPaymentDate:null,lateWeeks:0,status:"active"
  };
  let next = {
    ...state,nextCreditSequence:(state.nextCreditSequence ?? 1)+1,
    creditFacilities:[loan,...(state.creditFacilities ?? [])]
  };
  next = appendLedger(next,{
    date:currentDate,type:"credit-drawdown",direction:"financing",
    referenceId:loan.id,amountEgp:loan.principalEgp,paidEgp:loan.principalEgp,
    arrearsAfterEgp:state.arrearsEgp,
    note:"صرف تمويل " + loan.name + " مع التزام سداد إجمالي " + loan.totalRepaymentEgp
  });
  return {
    changed:true,loan,
    save:{...save,agency:{...save.agency,balance:save.agency.balance+loan.principalEgp,management:next}}
  };
}


export function getAgencyClubInterestSummary(save) {
  const records = save?.agency?.management?.clubInterests ?? [];
  return {
    total:records.length,
    monitoring:records.filter((item) => item.status === "monitoring").length,
    enquiries:records.filter((item) => item.status === "enquiry").length,
    expired:records.filter((item) => ["expired","window-closed","withdrawn"].includes(item.status)).length
  };
}

function calculateClubInterestFit(player, club, financials) {
  const baseline = Number.isInteger(club?.simulationProfile) ? club.simulationProfile : 60;
  const rating = Number(player?.rating) || 50;
  const potential = Number(player?.potential) || rating;
  const ageBonus = Number(player?.age) <= 23 ? 5 : Number(player?.age) <= 27 ? 2 : 0;
  const youthBonus = Number(player?.age) <= 21 && potential >= 75 ? 4 : 0;
  const estimatedFeeEur = Math.round(Math.pow((rating * 0.55) + (potential * 0.45),2) * 8500);
  const budgetCoverage = estimatedFeeEur > 0 ? financials.budgetEur / estimatedFeeEur : 0;
  const budgetBonus = budgetCoverage >= 1 ? 5 : budgetCoverage >= 0.65 ? 1 : -8;
  const score = Math.round((rating * 0.55) + (potential * 0.25) +
    (baseline * 0.2) + ageBonus + youthBonus + budgetBonus);
  return {
    fitScore:Math.max(0,Math.min(100,score)),
    estimatedFeeEur,
    clubBudgetEur:Math.max(0,Math.round(financials.budgetEur))
  };
}

function advanceClubInterestAI(save,currentDate,players,state) {
  if (!Array.isArray(players) || players.length === 0) return state;
  const playerById = new Map(players.map((player) => [player.id,player]));
  const clubs = WORLD_DATABASE.clubs;
  const activeClientIds = new Set(save.agency.clients ?? []);
  const contracts = save.agency.representation?.contracts ?? [];
  for (const contract of contracts) {
    if (contract.status === "active" && currentDate < contract.expiresOn) activeClientIds.add(contract.playerId);
  }
  const interests = (state.clubInterests ?? []).map((interest) => {
    if (interest.status === "expired" || interest.status === "withdrawn" || interest.status === "window-closed") return interest;
    if (currentDate > interest.expiresDate) return {...interest,status:"expired",updatedDate:currentDate};
    if (!activeClientIds.has(interest.playerId)) return {...interest,status:"withdrawn",updatedDate:currentDate};
    const window = getTransferWindowForClub(currentDate,interest.clubId,WORLD_DATABASE);
    const status = window.active ? "enquiry" : "monitoring";
    return {
      ...interest,status,updatedDate:currentDate,
      transferWindowEndDate:window.window?.endDate ?? null
    };
  });
  const activeInterests = interests.filter((interest) =>
    ["monitoring","enquiry"].includes(interest.status)
  );
  const retainedHistory = interests.filter((interest) =>
    !["monitoring","enquiry"].includes(interest.status)
  ).slice(0,100);
  let next = {
    ...state,
    clubInterests:[...activeInterests,...retainedHistory].slice(0,MAX_CLUB_INTERESTS),
    nextClubInterestSequence:state.nextClubInterestSequence ?? 1
  };
  if (new Date(currentDate + "T00:00:00.000Z").getUTCDay() !== 1 ||
      next.clubInterests.length >= MAX_CLUB_INTERESTS) return next;

  const clubContextById = new Map(clubs.map((club) => [club.id,{
    financials:getClubTransferFinancials(club.id,save.world.transfers,currentDate,WORLD_DATABASE),
    window:getTransferWindowForClub(currentDate,club.id,WORLD_DATABASE)
  }]));
  const reserved = new Set(next.clubInterests.filter((item) =>
    ["monitoring","enquiry"].includes(item.status)
  ).map((item) => item.playerId + "::" + item.clubId));
  const candidates = [...activeClientIds]
    .map((playerId) => playerById.get(playerId))
    .filter((player) => player && Number.isInteger(player.rating) && Number.isInteger(player.potential));
  if (candidates.length === 0) return next;

  const generated = [];
  for (const player of candidates) {
    const playerClubId = player.clubId ?? player.currentClubId ?? null;
    const fits = clubs.filter((club) => club.id !== playerClubId &&
      !reserved.has(player.id + "::" + club.id))
      .map((club) => {
        const clubContext = clubContextById.get(club.id);
        const fit = calculateClubInterestFit(player,club,clubContext.financials);
        return {club,...fit,window:clubContext.window};
      })
      .filter((item) => item.fitScore >= 69 && item.clubBudgetEur > 0)
      .sort((a,b) => b.fitScore-a.fitScore || b.clubBudgetEur-a.clubBudgetEur || a.club.id.localeCompare(b.club.id));
    if (fits.length === 0) continue;
    const seed = [...(player.id + currentDate)].reduce((sum,char) => (sum + char.charCodeAt(0)) >>> 0,0);
    const selected = fits[seed % Math.min(3,fits.length)];
    const record = {
      id:"agency-club-interest-" + next.nextClubInterestSequence++,
      clubId:selected.club.id,clubName:selected.club.nameAr,
      playerId:player.id,playerName:player.name,
      position:player.position ?? "غير محدد",
      rating:player.rating,potential:player.potential,
      currentClubId:playerClubId ?? "free-agent",
      createdDate:currentDate,updatedDate:currentDate,
      expiresDate:addDays(currentDate,14),
      fitScore:selected.fitScore,
      estimatedFeeEur:selected.estimatedFeeEur,
      clubBudgetEur:selected.clubBudgetEur,
      status:selected.window.active ? "enquiry" : "monitoring",
      transferWindowEndDate:selected.window.window?.endDate ?? null
    };
    generated.push(record);
    reserved.add(player.id + "::" + selected.club.id);
    if (generated.length >= 5) break;
  }
  next = {
    ...next,
    clubInterests:[...generated,...next.clubInterests].slice(0,MAX_CLUB_INTERESTS)
  };
  return next;
}

export function getAgencyCompetitorSummary(save) {
  const state = save?.agency?.management ?? createInitialAgencyManagementState();
  const competitors = state.competitors ?? createInitialAgencyManagementState().competitors;
  return competitors.map((agency) => ({
    id:agency.id,name:agency.name,region:agency.region,focus:agency.focus,
    reputation:agency.reputation,clients:agency.clients.length,
    pendingOffers:agency.pendingOffers.filter((offer) => offer.status === "pending").length,
    budgetEgp:agency.budgetEgp
  }));
}

export function getRivalClientIds(save) {
  const competitors = save?.agency?.management?.competitors ?? [];
  return new Set(competitors.flatMap((agency) => (agency.clients ?? []).map((client) => client.playerId)));
}

export function signAgencySponsorship(save, packageId, currentDate = save?.world?.currentDate) {
  const state = resolveManagement(save,currentDate);
  if (!state) return failure(save,"بيانات إدارة الوكالة أو التاريخ غير صالحة.");
  const offer = getAgencySponsorshipOffers(save).find((item) => item.id === packageId);
  if (!offer) return failure(save,"باقة الرعاية المطلوبة غير متاحة.");
  if (!offer.available) return failure(save,offer.lockedReason);
  const existingSponsorships = state.sponsorships ?? [];
  if (existingSponsorships.length >= MAX_SPONSORSHIPS || state.ledger.length >= MAX_LEDGER_ENTRIES)
    return failure(save,"وصل سجل الرعاية أو الدفتر المالي إلى الحد المتاح.");
  if (save.agency.balance + offer.signingBonusEgp > MAX_MONEY_EGP)
    return failure(save,"قيمة مكافأة التوقيع تتجاوز الحد المالي المسموح.");

  const deal = {
    id:"agency-sponsorship-" + (state.nextSponsorshipSequence ?? 1),
    packageId:offer.id,name:offer.name,signedDate:currentDate,
    expiresDate:addDays(currentDate,offer.termDays),termDays:offer.termDays,
    signingBonusEgp:offer.signingBonusEgp,weeklyRevenueEgp:offer.weeklyRevenueEgp,
    nextPaymentDate:nextMondayAfter(currentDate),lastPaidDate:null,status:"active"
  };
  let next = {
    ...state,nextSponsorshipSequence:(state.nextSponsorshipSequence ?? 1)+1,
    sponsorships:[deal,...existingSponsorships]
  };
  if (deal.signingBonusEgp > 0) {
    next = appendLedger(next,{
      date:currentDate,type:"sponsorship-income",direction:"income",incomeKind:"signing",
      referenceId:deal.id,amountEgp:deal.signingBonusEgp,paidEgp:deal.signingBonusEgp,
      arrearsAfterEgp:state.arrearsEgp,note:"مكافأة توقيع اتفاق " + deal.name
    });
  }
  const updated = {
    ...save,
    agency:{...save.agency,balance:save.agency.balance+deal.signingBonusEgp,management:next}
  };
  return {changed:true,deal,save:updated};
}

function appendCompetitiveHistory(state, agency, player, date, type, note) {
  const playerId = player.playerId ?? player.id;
  const playerName = player.playerName ?? player.name;
  const event = {
    id:"agency-competition-" + state.nextCompetitiveSequence,
    agencyId:agency.id,agencyName:agency.name,playerId,
    playerName,date,type,note
  };
  return {
    ...state,nextCompetitiveSequence:state.nextCompetitiveSequence+1,
    competitiveHistory:[event,...state.competitiveHistory].slice(0,MAX_COMPETITIVE_HISTORY)
  };
}

function advanceCompetitorMarket(save, currentDate, players, state) {
  if (!Array.isArray(players)) return state;
  const competitors = (state.competitors ?? createInitialAgencyManagementState().competitors)
    .map((agency) => ({...agency,clients:[...agency.clients],pendingOffers:[...agency.pendingOffers]}));
  let next = {
    ...state,competitors,
    competitiveHistory:Array.isArray(state.competitiveHistory)?state.competitiveHistory:[],
    nextCompetitiveSequence:state.nextCompetitiveSequence ?? 1
  };
  const userOpenOfferIds = new Set((save.agency.representation?.offers ?? [])
    .filter((offer) => ["pending","countered"].includes(offer.status)).map((offer) => offer.playerId));
  const userClientIds = new Set(save.agency.clients ?? []);
  const rivalClientIds = new Set(competitors.flatMap((agency) => agency.clients.map((client) => client.playerId)));
  const modifiers = getAgencyStaffModifiers(save);

  for (const competitor of next.competitors) {
    for (const offer of competitor.pendingOffers) {
      if (offer.status !== "pending" || currentDate < offer.dueDate) continue;
      const userHasTakenInterest = userClientIds.has(offer.playerId) || userOpenOfferIds.has(offer.playerId);
      const score = competitor.reputation +
        Math.round((offer.rating + offer.potential) / 2) + modifiers.legalProtectionBonus;
      const canAfford = competitor.budgetEgp >= competitor.acquisitionCostEgp &&
        competitor.clients.length < competitor.maxClients;
      const accepted = !userHasTakenInterest && score >= 135 && canAfford &&
        !rivalClientIds.has(offer.playerId);
      offer.status = accepted ? "accepted" : "rejected";
      offer.decisionDate = currentDate;
      if (accepted) {
        competitor.budgetEgp -= competitor.acquisitionCostEgp;
        competitor.clients.unshift({
          playerId:offer.playerId,playerName:offer.playerName,position:offer.position,
          rating:offer.rating,potential:offer.potential,commissionRate:offer.commissionRate,
          signedDate:currentDate
        });
        rivalClientIds.add(offer.playerId);
        next = appendCompetitiveHistory(next,competitor,offer,currentDate,"offer-accepted",
          "نجحت الوكالة المنافسة في ضم اللاعب بعد تقييم العرض.");
      } else {
        const reason = userHasTakenInterest ? "دخلت وكالتك في المنافسة على اللاعب." :
          !canAfford ? "لم تسمح ميزانية الوكالة المنافسة بإتمام التعاقد." :
          "رفض اللاعب العرض المنافس وفق تقييمه لشروط التمثيل.";
        next = appendCompetitiveHistory(next,competitor,offer,currentDate,"offer-rejected",reason);
      }
    }
    competitor.pendingOffers = competitor.pendingOffers.slice(0,40);
  }

  if (new Date(currentDate + "T00:00:00.000Z").getUTCDay() !== 1) return next;
  const allReserved = new Set([
    ...userClientIds,...userOpenOfferIds,...rivalClientIds,
    ...next.competitors.flatMap((agency) => agency.pendingOffers
      .filter((offer) => offer.status === "pending").map((offer) => offer.playerId))
  ]);
  for (const competitor of next.competitors) {
    if (competitor.lastActionDate === currentDate ||
        competitor.pendingOffers.some((offer) => offer.status === "pending") ||
        competitor.clients.length >= competitor.maxClients ||
        competitor.budgetEgp < competitor.acquisitionCostEgp) continue;
    const eligible = players.filter((player) =>
      player && typeof player.id === "string" && typeof player.name === "string" &&
      !allReserved.has(player.id) && Number.isInteger(player.rating) &&
      Number.isInteger(player.potential) && player.potential >= player.rating
    ).map((player) => ({
      player,
      score:player.rating * 0.6 + player.potential * 0.4 +
        stablePositionBonus(player,competitor.focusKey) +
        (modifiers.scoutingAccuracyBonus > 0 ? 2 : 0)
    })).filter((item) => item.score >= 61)
      .sort((a,b) => b.score-a.score || a.player.id.localeCompare(b.player.id));
    competitor.lastActionDate = currentDate;
    const selected = eligible[0]?.player;
    if (!selected) continue;
    const preferredCommission = selected.rating >= 80 ? 8 : selected.rating >= 72 ? 9 : 10;
    const commissionRate = Math.max(5,preferredCommission-(competitor.reputation >= 80 ? 1 : 0));
    const offer = {
      id:"rival-offer-" + competitor.id + "-" + currentDate.replaceAll("-",""),
      playerId:selected.id,playerName:selected.name,position:selected.position ?? "غير محدد",
      rating:selected.rating,potential:selected.potential,commissionRate,
      offeredDate:currentDate,dueDate:addDays(currentDate,3),
      status:"pending",decisionDate:null
    };
    competitor.pendingOffers = [offer,...competitor.pendingOffers].slice(0,100);
    allReserved.add(selected.id);
    next = appendCompetitiveHistory(next,competitor,offer,currentDate,"offer-sent",
      "أرسلت الوكالة المنافسة عرض تمثيل للاعب ضمن حملتها الأسبوعية.");
  }
  return next;
}

export function getAgencyManagementSummary(save) {
  const management = save?.agency?.management ?? createInitialAgencyManagementState();
  const activeStaff = management.staff.filter((item) => item.status === "active");
  const activeBranches = management.branches.filter((item) => item.status === "active");
  const weeklyPayrollEgp = activeStaff.reduce((sum,item) => sum + item.weeklySalaryEgp,0);
  const weeklyRentEgp = activeBranches.reduce((sum,item) => sum + item.weeklyRentEgp,0);
  const modifiers = getAgencyStaffModifiers(save);
  const grossWeeklyCostsEgp = weeklyPayrollEgp + weeklyRentEgp;
  const operationalSavingsEgp = Math.floor(grossWeeklyCostsEgp * modifiers.operationsEfficiencyPct / 100);
  const weeklyCostsEgp = grossWeeklyCostsEgp - operationalSavingsEgp;
  const ledger = management.ledger;
  const totalRevenueEgp = ledger.filter((entry) => entry.direction === "income")
    .reduce((sum,entry) => sum + entry.paidEgp,0);
  const totalExpensesEgp = ledger.filter((entry) => entry.direction !== "income" && entry.direction !== "financing")
    .reduce((sum,entry) => sum + entry.paidEgp,0);
  const activeSponsorshipRevenueEgp = (management.sponsorships ?? [])
    .filter((deal) => deal.status === "active")
    .reduce((sum,deal) => sum + deal.weeklyRevenueEgp,0);
  const activeLoans = (management.creditFacilities ?? []).filter((loan) => loan.status === "active");
  const totalDebtEgp = activeLoans.reduce((sum,loan) => sum + loan.remainingEgp,0);
  const weeklyCreditRepaymentEgp = activeLoans.reduce((sum,loan) => sum + Math.min(loan.weeklyInstallmentEgp,loan.remainingEgp),0);
  const lateCreditFacilities = activeLoans.filter((loan) => loan.lateWeeks > 0).length;
  const totalOperatingCommitmentEgp = weeklyCostsEgp + weeklyCreditRepaymentEgp + management.arrearsEgp;
  const cashAfterWeeklyCommitmentsEgp = (save?.agency?.balance ?? 0) - totalOperatingCommitmentEgp;
  const liquidityStatus = lateCreditFacilities > 0 || management.arrearsEgp > 0
    ? "attention"
    : cashAfterWeeklyCommitmentsEgp < (weeklyCostsEgp + weeklyCreditRepaymentEgp) * 2
      ? "watch"
      : "stable";
  return {
    activeStaff:activeStaff.length, activeBranches:activeBranches.length,
    weeklyPayrollEgp, weeklyRentEgp, grossWeeklyCostsEgp, operationalSavingsEgp,
    weeklyCostsEgp, weeklyCreditRepaymentEgp, totalDebtEgp,
    activeCreditFacilities:activeLoans.length, lateCreditFacilities,
    arrearsEgp:management.arrearsEgp, totalOperatingCommitmentEgp,
    cashAfterWeeklyCommitmentsEgp, liquidityStatus,
    totalRevenueEgp,totalExpensesEgp,netCashFlowEgp:totalRevenueEgp-totalExpensesEgp,
    activeSponsorshipRevenueEgp
  };
}

export function hireAgencyEmployee(save, roleId, currentDate = save?.world?.currentDate) {
  const state = resolveManagement(save,currentDate);
  if (!state) return failure(save,"بيانات إدارة الوكالة أو التاريخ غير صالحة.");
  const role = AGENCY_JOB_ROLES.find((item) => item.id === roleId);
  if (!role) return failure(save,"الوظيفة المطلوبة غير متاحة.");
  const active = state.staff.filter((item) => item.status === "active");
  if (active.length >= MAX_ACTIVE_STAFF ||
      active.filter((item) => item.roleId === roleId).length >= role.maxHeadcount)
    return failure(save,"وصلت الوكالة إلى الحد المسموح لهذا المنصب.");
  if (save.agency.balance < role.hiringCostEgp) return failure(save,"رصيد الوكالة لا يكفي تكلفة التعيين.");
  if (state.ledger.length >= MAX_LEDGER_ENTRIES) return failure(save,"سجل المصروفات ممتلئ؛ لا يمكن تسجيل تعيين جديد.");
  const employee = {
    id:"agency-staff-" + state.nextStaffSequence, roleId, name:role.name, hiredDate:currentDate,
    hiringCostEgp:role.hiringCostEgp, weeklySalaryEgp:role.weeklySalaryEgp,
    status:"active", terminatedDate:null
  };
  let next = { ...state, nextStaffSequence:state.nextStaffSequence + 1, staff:[employee,...state.staff] };
  next = appendLedger(next,{
    date:currentDate,type:"hiring",referenceId:employee.id,amountEgp:role.hiringCostEgp,
    paidEgp:role.hiringCostEgp,arrearsAfterEgp:state.arrearsEgp,note:"تكلفة تعيين " + role.name
  });
  return {
    changed:true,employee,
    save:{...save,agency:{...save.agency,balance:save.agency.balance-role.hiringCostEgp,management:next}}
  };
}

export function dismissAgencyEmployee(save, employeeId, currentDate = save?.world?.currentDate) {
  const state = resolveManagement(save,currentDate);
  if (!state) return failure(save,"بيانات إدارة الوكالة أو التاريخ غير صالحة.");
  const employee = state.staff.find((item) => item.id === employeeId && item.status === "active");
  if (!employee) return failure(save,"الموظف غير موجود أو تم إنهاء تعاقده بالفعل.");
  const next = {...state,staff:state.staff.map((item) => item.id === employeeId
    ? {...item,status:"terminated",terminatedDate:currentDate}:item)};
  return {changed:true,employeeId,save:{...save,agency:{...save.agency,management:next}}};
}

export function openAgencyBranch(save, locationId, currentDate = save?.world?.currentDate) {
  const state = resolveManagement(save,currentDate);
  if (!state) return failure(save,"بيانات إدارة الوكالة أو التاريخ غير صالحة.");
  const location = AGENCY_BRANCH_LOCATIONS.find((item) => item.id === locationId);
  if (!location) return failure(save,"موقع الفرع المطلوب غير متاح.");
  if (state.branches.some((item) => item.locationId === locationId && item.status === "active"))
    return failure(save,"لدى الوكالة فرع نشط بالفعل في هذه المدينة.");
  if (state.branches.filter((item) => item.status === "active").length >= MAX_ACTIVE_BRANCHES)
    return failure(save,"وصلت الوكالة إلى الحد الأقصى للفروع النشطة.");
  if (save.agency.balance < location.setupCostEgp) return failure(save,"رصيد الوكالة لا يكفي تكلفة افتتاح الفرع.");
  if (state.ledger.length >= MAX_LEDGER_ENTRIES) return failure(save,"سجل المصروفات ممتلئ؛ لا يمكن تسجيل فرع جديد.");
  const branch = {
    id:"agency-branch-" + state.nextBranchSequence,locationId,name:location.name,region:location.region,
    openedDate:currentDate,setupCostEgp:location.setupCostEgp,weeklyRentEgp:location.weeklyRentEgp,
    isHeadquarters:false,status:"active",closedDate:null
  };
  let next = {...state,nextBranchSequence:state.nextBranchSequence+1,branches:[branch,...state.branches]};
  next = appendLedger(next,{
    date:currentDate,type:"branch-opening",referenceId:branch.id,amountEgp:location.setupCostEgp,
    paidEgp:location.setupCostEgp,arrearsAfterEgp:state.arrearsEgp,note:"تكلفة افتتاح فرع " + location.name
  });
  return {
    changed:true,branch,
    save:{...save,agency:{...save.agency,balance:save.agency.balance-location.setupCostEgp,management:next}}
  };
}

export function closeAgencyBranch(save, branchId, currentDate = save?.world?.currentDate) {
  const state = resolveManagement(save,currentDate);
  if (!state) return failure(save,"بيانات إدارة الوكالة أو التاريخ غير صالحة.");
  const branch = state.branches.find((item) => item.id === branchId && item.status === "active");
  if (!branch || branch.isHeadquarters) return failure(save,"لا يمكن إغلاق المقر الرئيسي أو فرع غير نشط.");
  const next = {...state,branches:state.branches.map((item) => item.id === branchId
    ? {...item,status:"closed",closedDate:currentDate}:item)};
  return {changed:true,branchId,save:{...save,agency:{...save.agency,management:next}}};
}

/** Advances agency operations, sponsor payments and competing agencies on the shared career clock. */
export function advanceAgencyManagementDay(save, currentDate = save?.world?.currentDate, players = []) {
  const state = resolveManagement(save,currentDate);
  if (!state) return {changed:false,save,error:"بيانات إدارة الوكالة أو التاريخ غير صالحة."};
  let nextSave = save;
  let next = {
    ...state,
    sponsorships:state.sponsorships ?? [],
    competitors:state.competitors ?? createInitialAgencyManagementState().competitors,
    competitiveHistory:state.competitiveHistory ?? [],
    nextSponsorshipSequence:state.nextSponsorshipSequence ?? 1,
    nextCompetitiveSequence:state.nextCompetitiveSequence ?? 1,
    creditFacilities:state.creditFacilities ?? [],
    nextCreditSequence:state.nextCreditSequence ?? 1
  };
  let processed = false;
  const isMonday = new Date(currentDate + "T00:00:00.000Z").getUTCDay() === 1;

  for (const deal of [...(next.sponsorships ?? [])]) {
    if (deal.status === "active" && currentDate > deal.expiresDate) {
      next = {
        ...next,
        sponsorships:next.sponsorships.map((item) => item.id === deal.id
          ? {...item,status:"expired"} : item)
      };
    }
  }

  if (isMonday) {
    for (const deal of next.sponsorships.filter((item) =>
      item.status === "active" && currentDate >= item.nextPaymentDate && currentDate <= item.expiresDate
    )) {
      if (next.ledger.length >= MAX_LEDGER_ENTRIES ||
          nextSave.agency.balance + deal.weeklyRevenueEgp > MAX_MONEY_EGP) continue;
      next = appendLedger(next,{
        date:currentDate,type:"sponsorship-income",direction:"income",incomeKind:"weekly",
        referenceId:deal.id,amountEgp:deal.weeklyRevenueEgp,paidEgp:deal.weeklyRevenueEgp,
        arrearsAfterEgp:next.arrearsEgp,note:"دفعة أسبوعية من " + deal.name
      });
      next = {
        ...next,
        sponsorships:next.sponsorships.map((item) => item.id === deal.id
          ? {...item,lastPaidDate:currentDate,nextPaymentDate:addDays(currentDate,7)} : item)
      };
      nextSave = {
        ...nextSave,
        agency:{...nextSave.agency,balance:nextSave.agency.balance+deal.weeklyRevenueEgp,management:next}
      };
      processed = true;
    }
  }

  if (isMonday && state.lastPayrollDate !== currentDate) {
    const weeklyCost = getAgencyManagementSummary(save).weeklyCostsEgp;
    const totalDue = state.arrearsEgp + weeklyCost;
    if (totalDue > 0 && next.ledger.length >= MAX_LEDGER_ENTRIES)
      return {changed:false,save,processed:false,error:"سجل المصروفات ممتلئ؛ لم تتم تسوية الالتزامات."};
    const paidEgp = Math.min(nextSave.agency.balance,totalDue);
    const arrearsAfterEgp = totalDue-paidEgp;
    next = {...next,lastPayrollDate:currentDate,arrearsEgp:arrearsAfterEgp};
    if (totalDue > 0) {
      next = appendLedger(next,{
        date:currentDate,type:"weekly-operations",referenceId:null,
        amountEgp:totalDue,paidEgp,arrearsAfterEgp,
        note:"رواتب الفريق وإيجارات الفروع بعد احتساب كفاءة العمليات"
      });
    }
    nextSave = {
      ...nextSave,
      agency:{...nextSave.agency,balance:nextSave.agency.balance-paidEgp,management:next}
    };
    processed = true;
  }

  if (isMonday) {
    for (const loan of [...next.creditFacilities]) {
      if (loan.status !== "active" || currentDate < loan.nextPaymentDate) continue;
      if (next.ledger.length >= MAX_LEDGER_ENTRIES) continue;
      const dueEgp = Math.min(loan.weeklyInstallmentEgp,loan.remainingEgp);
      const paidEgp = Math.min(nextSave.agency.balance,dueEgp);
      const remainingEgp = loan.remainingEgp-paidEgp;
      const missed = paidEgp < dueEgp;
      next = appendLedger(next,{
        date:currentDate,type:"credit-repayment",direction:"expense",
        referenceId:loan.id,amountEgp:dueEgp,paidEgp,
        arrearsAfterEgp:remainingEgp,
        note:missed ? "سداد جزئي لتسهيل " + loan.name : "سداد قسط تمويل " + loan.name
      });
      next = {
        ...next,
        creditFacilities:next.creditFacilities.map((item) => item.id === loan.id
          ? {
              ...item,remainingEgp,paidEgp:item.paidEgp+paidEgp,
              lateWeeks:item.lateWeeks+(missed?1:0),
              lastPaymentDate:paidEgp>0?currentDate:item.lastPaymentDate,
              nextPaymentDate:addDays(currentDate,7),
              status:remainingEgp===0?"repaid":"active"
            }
          : item)
      };
      nextSave = {
        ...nextSave,
        agency:{...nextSave.agency,balance:nextSave.agency.balance-paidEgp,management:next}
      };
      processed = true;
    }
  }

  nextSave = {...nextSave,agency:{...nextSave.agency,management:next}};
  const beforeEvents = next.competitiveHistory?.length ?? 0;
  next = advanceCompetitorMarket(nextSave,currentDate,players,next);
  next = advanceClubInterestAI(nextSave,currentDate,players,next);
  nextSave = {...nextSave,agency:{...nextSave.agency,management:next}};
  const competitorEvents = Math.max(0,(next.competitiveHistory?.length ?? 0)-beforeEvents);
  return {
    changed:nextSave !== save,
    processed,
    competitorEvents,
    save:nextSave
  };
}
