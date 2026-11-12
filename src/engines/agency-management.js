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
    schemaVersion:1, nextStaffSequence:1, nextBranchSequence:1, nextLedgerSequence:1, nextSponsorshipSequence:1, nextCompetitiveSequence:1,
    lastPayrollDate:null, arrearsEgp:0, staff:[],
    branches:[{
      id:"agency-branch-hq", locationId:"headquarters", name:"المقر الرئيسي", region:"المقر الرئيسي",
      openedDate:"2026-07-01", setupCostEgp:0, weeklyRentEgp:0, isHeadquarters:true,
      status:"active", closedDate:null
    }],
    ledger:[],
    sponsorships:[],
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
        !["hiring","branch-opening","weekly-operations","sponsorship-income"].includes(entry.type) ||
        !validMoney(entry.amountEgp) || entry.amountEgp < 1 ||
        !validMoney(entry.paidEgp) || entry.paidEgp > entry.amountEgp ||
        !validMoney(entry.arrearsAfterEgp) || typeof entry.note !== "string" || !entry.note.trim() ||
        (entry.referenceId !== null && typeof entry.referenceId !== "string") ||
        (entry.direction !== undefined && !["income","expense"].includes(entry.direction)) ||
        (entry.type === "sponsorship-income" && (entry.direction !== "income" ||
          !["signing","weekly"].includes(entry.incomeKind))) ||
        (entry.type !== "sponsorship-income" && entry.direction === "income")) return false;
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
  if ((state.sponsorships ?? []).length >= MAX_SPONSORSHIPS || state.ledger.length >= MAX_LEDGER_ENTRIES)
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
    sponsorships:[deal,...(state.sponsorships ?? [])]
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
  const event = {
    id:"agency-competition-" + state.nextCompetitiveSequence,
    agencyId:agency.id,agencyName:agency.name,playerId:player.id,
    playerName:player.name,date,type,note
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
    competitor.pendingOffers = competitor.pendingOffers.slice(-40);
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
  return {
    activeStaff:activeStaff.length, activeBranches:activeBranches.length,
    weeklyPayrollEgp, weeklyRentEgp, weeklyCostsEgp:weeklyPayrollEgp + weeklyRentEgp,
    arrearsEgp:management.arrearsEgp,
    totalOperatingCommitmentEgp:weeklyPayrollEgp + weeklyRentEgp + management.arrearsEgp
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

/** Settles payroll and branch rent every in-game Monday. Unpaid costs remain as arrears. */
export function advanceAgencyManagementDay(save, currentDate = save?.world?.currentDate) {
  const state = resolveManagement(save,currentDate);
  if (!state) return {changed:false,save,error:"بيانات إدارة الوكالة أو التاريخ غير صالحة."};
  if (new Date(currentDate + "T00:00:00.000Z").getUTCDay() !== 1 || state.lastPayrollDate === currentDate)
    return {changed:false,save,processed:false};
  const weeklyCost = getAgencyManagementSummary(save).weeklyCostsEgp;
  const totalDue = state.arrearsEgp + weeklyCost;
  if (totalDue > 0 && state.ledger.length >= MAX_LEDGER_ENTRIES)
    return {changed:false,save,processed:false,error:"سجل المصروفات ممتلئ؛ لم تتم تسوية الالتزامات."};
  const paidEgp = Math.min(save.agency.balance,totalDue);
  const arrearsAfterEgp = totalDue-paidEgp;
  let next = {...state,lastPayrollDate:currentDate,arrearsEgp:arrearsAfterEgp};
  if (totalDue > 0) next = appendLedger(next,{
    date:currentDate,type:"weekly-operations",referenceId:null,amountEgp:totalDue,
    paidEgp,arrearsAfterEgp,note:"رواتب الفريق وإيجارات الفروع للأسبوع"
  });
  return {
    changed:true,processed:true,dueEgp:totalDue,paidEgp,arrearsEgp:arrearsAfterEgp,
    save:{...save,agency:{...save.agency,balance:save.agency.balance-paidEgp,management:next}}
  };
}
