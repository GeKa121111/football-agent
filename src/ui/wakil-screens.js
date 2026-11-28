// وَكِيل — WAKIL — المرحلة 2: الشاشات الست (§2 في design/UXUI.md).
// طبقة عرض فوق المحركات الحالية، خلف Feature Flag نفسه
// (football-agent.wakil-ui) — لا تلمس محركات المحاكاة ولا حفظ v9.
// كل القيم الجديدة هنا «مشتقة» حتميًا من بيانات موجودة (الثقة والولاء
// ونطاق الإمكانات وStar Plan)، فلا حقل حفظ جديد ولا migration.
// الاستثناء الوحيد لحالة جديدة: لوحة TransferRoom تُحفظ داخل الحفظ
// نفسه (world.transferRoom — حقل اختياري في v9) منذ المرحلة 3، مع
// ترحيل تلقائي لمرة واحدة من المفتاح المنفصل القديم عند تحميل الحفظ.
// لا صور لاعبين حقيقيين مرخّصين إطلاقًا؛ البورتريهات SVG الحتمية
// من src/ui/player-portrait.js كما في المرحلة 1.
import { node, actionButton } from "./dom.js";
import { createPlayerPortrait } from "./player-portrait.js";
import { formatMoney, formatEuroMoney } from "./format.js";
import { getTodaySummary, toggleWakilTheme, resolveWakilTheme } from "./wakil.js";
import {
  getPlayerRepresentationProfile,
  getRepresentationContractCommission,
  getRepresentationContractExpiry,
  getRepresentationRelationshipLabel
} from "../engines/representation.js";
import { getAgencyFinancialSummary } from "../engines/agency-financial-ledger.js";
import {
  getAgencyManagementSummary,
  getAgencyStaffModifiers,
  AGENCY_JOB_ROLES,
  AGENCY_BRANCH_LOCATIONS
} from "../engines/agency-management.js";
import { getUpcomingCareerEvents } from "../engines/career-calendar.js";
import { getTransferWindow } from "../engines/transfers.js";
import { getUpcomingFootballFixtures } from "../engines/football-season.js";
import {
  getPlayerDevelopmentRecord,
  setPlayerTrainingPlan,
  TRAINING_FOCUSES
} from "../engines/player-development.js";
import { WORLD_DATABASE } from "../data/world-database.js";

export const TRANSFER_ROOM_KEY = "football-agent.transfer-room";
export const WAKIL_NEGOTIATION_MAX_ROUNDS = 4;
export const WAKIL_INTERMEDIARY_MAX_PCT = 10;

const clampNum = (value, min, max) => Math.max(min, Math.min(max, value));
const asNumber = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const asInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
};

function daysBetween(fromDate, toDate) {
  const from = new Date(fromDate + "T00:00:00Z");
  const to = new Date(toDate + "T00:00:00Z");
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return null;
  return Math.round((to - from) / 86400000);
}

function formatHomeDate(value) {
  if (!value) return "—";
  const date = new Date(value + "T12:00:00Z");
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

// ---------------------------------------------------------------------------
// 1) التقييم بالنجوم ونطاق الإمكانات (UXUI §2.2 — الغموض جزء من اللعبة)
// ---------------------------------------------------------------------------

// التقييم 1–99 إلى نجوم 1–6 (درس Top Eleven): القراءة السريعة بالنجوم،
// والرقم الدقيق يظهر في التفاصيل فقط.
export function starsForRating(rating) {
  return clampNum(Math.ceil(asNumber(rating, 50) / 17), 1, 6);
}

// نطاق الإمكانات: لا يُعرض رقم إمكانات واحد مكشوف أبدًا. النطاق مركزه
// الإمكانات الحقيقية، وعرضه يضيق مع مستوى الكشافة (محلل الأداء يضيّق
// النطاق — أثر ميكانيكي مكتوب صراحة كما في §2.6).
// scoutLevel: 0 = بلا محلل، 1–2 = محلل أداء نشط.
export function getPotentialRange(player = {}, scoutLevel = 0) {
  const rating = clampNum(Math.round(asNumber(player.rating, 50)), 1, 99);
  const potential = clampNum(Math.round(asNumber(player.potential, rating)), rating, 99);
  const spread = Math.max(2, 8 - clampNum(asInt(scoutLevel, 0), 0, 3) * 2);
  const low = Math.max(rating, potential - spread);
  const high = Math.min(99, potential + spread);
  return {
    current: rating,
    low,
    high,
    spread: high - low,
    certaintyLabel: spread <= 2 ? "مؤكد" : spread <= 5 ? "غير مؤكد" : "تقدير واسع",
    scoutNote: scoutLevel > 0
      ? "محلل الأداء ضيّق النطاق إلى ±" + spread
      : "كشاف أحسن هيضيّق النطاق ده"
  };
}

// ---------------------------------------------------------------------------
// 2) الثقة والولاء وخطر المغادرة (UXUI §2.2 — فكرة FAM)
// ---------------------------------------------------------------------------

// مشتقة حتميًا من ملف التمثيل (الولاء 1–5 والطموح) ومن العقد النشط
// (علاقة التمثيل وقرب انتهاء العقد) — بلا أي حقل حفظ جديد.
export function getPlayerTrust(player = {}, contract = null, currentDate = null) {
  const profile = getPlayerRepresentationProfile(player);
  const loyalty = clampNum(asInt(profile.loyalty, 3), 1, 5);
  const ambition = clampNum(asInt(profile.ambition, 3), 1, 5);
  let trust = 55 + (loyalty - 3) * 12 - (ambition >= 4 ? 5 : 0);
  let daysToExpiry = null;
  let relationshipLabel = null;
  if (contract) {
    const score = asNumber(contract.relationshipScore, NaN);
    if (Number.isFinite(score)) {
      trust = Math.round(trust * 0.5 + clampNum(score, 0, 100) * 0.5);
      relationshipLabel = getRepresentationRelationshipLabel(Math.round(score));
    }
    const expiry = getRepresentationContractExpiry(contract);
    if (currentDate && expiry) {
      daysToExpiry = daysBetween(currentDate, expiry);
      if (daysToExpiry !== null && daysToExpiry <= 90) trust -= 10;
      if (daysToExpiry !== null && daysToExpiry <= 30) trust -= 5;
    }
  }
  trust = clampNum(Math.round(trust), 0, 100);
  const trustLabel = trust >= 75 ? "بيثق فيك" : trust >= 50 ? "متردد" : "فقد الثقة";
  const loyaltyLabel = loyalty >= 4 ? "مخلص" : loyalty >= 3 ? "بيفكر" : "بيدوّر على وكيل تاني";
  const departureRisk = trust < 40 || loyalty <= 2 ? "عالي"
    : trust < 65 || loyalty <= 3 ? "متوسط" : "منخفض";
  return {
    trust, trustLabel, loyalty, loyaltyLabel,
    ambition, departureRisk, daysToExpiry, relationshipLabel,
    needsAction: departureRisk === "عالي"
  };
}

// عقد الوكيل بنسبة مزدوجة (فكرة FootyAgent): نسبة الانتقال مخزنة في العقد،
// ونسبة الراتب مشتقة عرضيًا (نصف نسبة الانتقال، 3–8%) حتى تُضاف نسبة
// راتب مخزنة في مرحلة لاحقة — لا تغيير في حساب العمولة الحالي.
export function getDualCommission(contract = {}, currentDate = null) {
  const transferRate = clampNum(asInt(getRepresentationContractCommission(contract, currentDate), 0), 0, 15);
  const salaryRate = transferRate > 0 ? clampNum(Math.round(transferRate / 2), 3, 8) : 0;
  return { transferRate, salaryRate };
}

// ---------------------------------------------------------------------------
// 3) مسيرة العميل المرئية وStar Plan (UXUI §2.2 — فكرة Touchline Capital)
// ---------------------------------------------------------------------------

export function getPlayerTimeline(player = {}) {
  const entries = [];
  const season = asInt(player.currentSeason, 1);
  const perf = player.seasonPerformance ?? {};
  if (asInt(perf.appearances, 0) > 0) {
    entries.push({
      season, kind: "season",
      title: "الموسم الحالي مع " + (player.club ?? "ناديه"),
      detail: perf.appearances + " مشاركة · " + asInt(perf.goals, 0) + " هدف · " + asInt(perf.assists, 0) + " صناعة"
    });
  }
  for (const honor of Array.isArray(player.honors) ? player.honors : []) {
    const award = honor.awardType === "topScorer" ? "هداف البطولة"
      : honor.awardType === "topAssists" ? "الأكثر صناعة" : "أفضل لاعب";
    entries.push({
      season: asInt(honor.season, season), kind: "honor",
      title: award + " — " + (honor.competitionName ?? ""),
      detail: "قيمة " + (honor.value ?? "—")
    });
  }
  for (const stat of Array.isArray(player.internationalTournamentStats) ? player.internationalTournamentStats : []) {
    entries.push({
      season: asInt(stat.season, season), kind: "international",
      title: (stat.tournamentName ?? "بطولة دولية"),
      detail: stat.appearances + " مشاركة · " + stat.goals + " هدف · " + stat.assists + " صناعة"
    });
  }
  if (player.contractUntil) {
    entries.push({
      season, kind: "contract",
      title: "عقد النادي حتى " + formatHomeDate(player.contractUntil),
      detail: (player.club ?? "لاعب حر")
    });
  }
  entries.sort((a, b) => b.season - a.season);
  return entries;
}

// Star Plan: 3 أهداف فردية للعميل، من بيانات الموسم الحالي — أهداف
// قابلة للقياس، لا وعود مكتوبة يدويًا.
export function getStarPlan(player = {}) {
  const perf = player.seasonPerformance ?? {};
  const role = String(player.role ?? player.position ?? "");
  const isAttacker = /attack|هجوم|مهاجم|جناح/i.test(role);
  const isMidfielder = /midfield|وسط/i.test(role);
  const goalsTarget = isAttacker ? 10 : isMidfielder ? 6 : 3;
  const assistsTarget = isAttacker ? 5 : isMidfielder ? 8 : 3;
  const appearancesTarget = 25;
  const goals = asInt(perf.goals, 0);
  const assists = asInt(perf.assists, 0);
  const appearances = asInt(perf.appearances, 0);
  const goal = (id, title, current, target, unit) => ({
    id, title, current, target, unit,
    progressPct: clampNum(Math.round((current / Math.max(1, target)) * 100), 0, 100),
    done: current >= target
  });
  return [
    goal("goals", "سجّل " + goalsTarget + " أهداف الموسم ده", goals, goalsTarget, "هدف"),
    goal("assists", "اصنع " + assistsTarget + " أهداف الموسم ده", assists, assistsTarget, "صناعة"),
    goal("appearances", "العب " + appearancesTarget + " مباراة الموسم ده", appearances, appearancesTarget, "مباراة")
  ];
}

// ---------------------------------------------------------------------------
// 4) قرارات «اليوم» (UXUI §2.1 — القرار قبل المعلومة)
// ---------------------------------------------------------------------------

export function getTodayDecisions(save = {}, players = []) {
  const decisions = [];
  const world = save.world ?? {};
  const currentDate = world.currentDate ?? null;
  const tasks = Array.isArray(world.tasks) ? world.tasks : [];
  for (const task of tasks.filter((item) => item.status === "open" || item.status === "overdue")) {
    decisions.push({
      id: "task-" + task.id, kind: "task",
      title: task.title ?? "مهمة معلقة",
      detail: task.description ?? "",
      deadline: task.dueDate ?? null,
      overdue: task.status === "overdue",
      action: "إنجاز المهمة", destination: "dashboard"
    });
  }
  const transfers = world.transfers ?? {};
  const byId = new Map(players.map((player) => [player.id, player]));
  for (const offer of Array.isArray(transfers.offers) ? transfers.offers : []) {
    if (!["pending", "countered"].includes(offer.status)) continue;
    const player = byId.get(offer.playerId);
    decisions.push({
      id: "offer-" + offer.id, kind: "offer",
      title: "عرض انتقال لـ " + (player?.name ?? offer.playerName ?? "عميلك"),
      detail: (offer.toClubName ?? "نادٍ") + " · " + (offer.status === "countered" ? "النادي رد بشروط مضادة" : "بانتظار رد النادي"),
      deadline: offer.expiresDate ?? null,
      overdue: false, action: "شوف العرض", destination: "market", offerId: offer.id
    });
  }
  const contracts = save.agency?.representation?.contracts ?? [];
  for (const contract of contracts.filter((item) => item.status === "active")) {
    const expiry = getRepresentationContractExpiry(contract);
    if (!currentDate || !expiry) continue;
    const days = daysBetween(currentDate, expiry);
    if (days !== null && days <= 30) {
      const player = byId.get(contract.playerId);
      decisions.push({
        id: "contract-" + contract.playerId, kind: "contract",
        title: "عقد تمثيل " + (player?.name ?? "عميلك") + " بيخلص خلال " + days + " يوم",
        detail: "جدّد العقد قبل ما ينتهي", deadline: expiry,
        overdue: days <= 0, action: "جدّد العقد", destination: "agency"
      });
    }
  }
  for (const playerId of save.agency?.clients ?? []) {
    const player = byId.get(playerId);
    if (!player) continue;
    const contract = contracts.find((item) => item.playerId === playerId && item.status === "active");
    const trust = getPlayerTrust(player, contract ?? null, currentDate);
    if (trust.departureRisk === "عالي") {
      decisions.push({
        id: "trust-" + playerId, kind: "trust",
        title: "خطر مغادرة عالٍ: " + player.name,
        detail: "الثقة " + trust.trustLabel + " · الولاء: " + trust.loyaltyLabel,
        deadline: null, overdue: false, action: "كلم عميلك", destination: "agency"
      });
    }
  }
  return decisions.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
}

export function getWeekFinance(save = {}) {
  const summary = getAgencyFinancialSummary(save);
  return {
    incomeEgp: summary.egp.operatingIncomePaidEgp,
    expensesEgp: summary.egp.operatingExpensesPaidEgp,
    netEgp: summary.egp.netOperatingCashFlowEgp,
    commissionReceivableEur: summary.eur.commissionReceivableEur,
    entryCount: summary.entryCount
  };
}

// ---------------------------------------------------------------------------
// 5) السوق الموحد (UXUI §2.3)
// ---------------------------------------------------------------------------

export function filterMarketPlayers(players = [], filters = {}) {
  const position = filters.position ?? "all";
  const ageBand = filters.ageBand ?? "all";
  const minStars = asInt(filters.minStars, 0);
  const query = String(filters.query ?? "").trim().toLocaleLowerCase("ar");
  return players.filter((player) => {
    if (!player || typeof player.id !== "string") return false;
    if (position !== "all" && player.position !== position && player.role !== position) return false;
    const age = asInt(player.age, 25);
    if (ageBand === "u21" && age >= 21) return false;
    if (ageBand === "21-28" && (age < 21 || age > 28)) return false;
    if (ageBand === "over28" && age <= 28) return false;
    if (minStars > 0 && starsForRating(player.rating) < minStars) return false;
    if (query && !String(player.name ?? "").toLocaleLowerCase("ar").includes(query)) return false;
    return true;
  });
}

export function sortMarketPlayers(players = [], sort = "rating") {
  const list = [...players];
  if (sort === "value") return list.sort((a, b) => asNumber(b.marketValueEur) - asNumber(a.marketValueEur));
  if (sort === "youngest") return list.sort((a, b) => asInt(a.age) - asInt(b.age));
  if (sort === "potential") return list.sort((a, b) => asNumber(b.potential) - asNumber(a.potential));
  return list.sort((a, b) => asNumber(b.rating) - asNumber(a.rating));
}

export function getMarketOffers(save = {}, players = []) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const offers = save.world?.transfers?.offers ?? [];
  return offers
    .filter((offer) => ["pending", "countered", "agreed"].includes(offer.status))
    .map((offer) => ({ offer, player: byId.get(offer.playerId) ?? null }))
    .filter((item) => item.player);
}

// ---------------------------------------------------------------------------
// 6) المفاوضات — 3 عناصر على جولات (UXUI §2.4)
// ---------------------------------------------------------------------------

export const NEGOTIATION_ROLES = Object.freeze(["أساسي", "تناوب", "احتياطي"]);

// حالة تفاوض جديدة من عرض انتقال موجود في المحرك. دور وقت اللعب تفضيل
// تفاوضي يُسجَّل في سجل الجولات (المحرك لا يخزن دورًا)؛ أما المدة
// والراتب وقيمة الانتقال فتُركَّب منها شروط الرد وتُرسل للمحرك كما هي.
export function createNegotiation(offer = {}, player = {}) {
  const terms = offer.status === "countered" && offer.counterOffer ? offer.counterOffer : offer.terms ?? {};
  const isLoan = offer.type === "loan";
  return {
    offerId: offer.id,
    playerId: offer.playerId,
    playerName: player.name ?? offer.playerName ?? "لاعب",
    clubName: offer.toClubName ?? "",
    type: offer.type ?? "permanent",
    round: asInt(offer.round, 1),
    maxRounds: WAKIL_NEGOTIATION_MAX_ROUNDS,
    expiresDate: offer.expiresDate ?? null,
    role: "تناوب",
    contractYears: isLoan
      ? Math.round(asInt(terms.loanMonths, 6) / 6)
      : clampNum(asInt(terms.contractYears, 3), 1, 5),
    weeklyWageEur: asInt(terms.weeklyWageEur, 0),
    feeEur: isLoan ? asInt(terms.loanFeeEur, 0) : asInt(terms.feeEur, 0),
    clubFeeEur: isLoan ? asInt(terms.loanFeeEur, 0) : asInt(terms.feeEur, 0),
    clubWageEur: asInt(terms.weeklyWageEur, 0),
    sellOnPct: 0,
    useIntermediary: false,
    log: [{
      round: asInt(offer.round, 1),
      text: offer.status === "countered"
        ? "النادي رد بشروط مضادة — راجعها قبل ما ترد."
        : "أرسلت العرض الأول — بانتظار رد النادي."
    }]
  };
}

// خطر انهيار الصفقة: فجوة الراتب + فجوة القيمة + طموح الدور + رقم الجولة.
// الوسيط يخفض الخطر 15 نقطة (بحد أقصى 10% من الصفقة — يُعرض قبل الموافقة).
export function getCollapseRisk(neg = {}) {
  const reasons = [];
  let score = 0;
  const wageGap = neg.clubWageEur > 0
    ? (asNumber(neg.weeklyWageEur) - asNumber(neg.clubWageEur)) / neg.clubWageEur : 0;
  if (wageGap > 0) {
    score += Math.min(40, Math.round(wageGap * 100));
    reasons.push("الراتب المطلوب أعلى من موقف النادي بـ " + Math.round(wageGap * 100) + "%");
  }
  const feeGap = neg.clubFeeEur > 0
    ? (asNumber(neg.feeEur) - asNumber(neg.clubFeeEur)) / neg.clubFeeEur : 0;
  if (feeGap > 0) {
    score += Math.min(25, Math.round(feeGap * 50));
    reasons.push("القيمة المطلوبة أعلى من موقف النادي بـ " + Math.round(feeGap * 100) + "%");
  }
  if (neg.role === "أساسي") {
    score += 15;
    reasons.push("طلب دور أساسي بيرفع سقف مطالب النادي");
  }
  const round = asInt(neg.round, 1);
  if (round > 1) {
    score += (round - 1) * 10;
    reasons.push("الجولة " + round + " من " + WAKIL_NEGOTIATION_MAX_ROUNDS + " — كل جولة بتزوّد الخطر");
  }
  if (neg.useIntermediary) {
    score -= 15;
    reasons.push("الوسيط بيخفف الخطر 15 نقطة مقابل حتى 10% من الصفقة");
  }
  score = clampNum(Math.round(score), 0, 100);
  return {
    score,
    level: score < 35 ? "low" : score < 65 ? "medium" : "high",
    levelLabel: score < 35 ? "منخفض" : score < 65 ? "متوسط" : "عالٍ",
    reasons
  };
}

// يركّب شروط الرد من عناصر التفاوض الثلاثة (+ القيمة) بصيغة المحرك.
export function buildCounterTerms(neg = {}) {
  const isLoan = neg.type === "loan";
  const common = {
    weeklyWageEur: Math.max(0, asInt(neg.weeklyWageEur, 0)),
    signingBonusEur: 0,
    sellOnPct: clampNum(asInt(neg.sellOnPct, 0), 0, 25),
    playingRole: neg.role
  };
  if (isLoan) {
    return {
      ...common,
      loanFeeEur: Math.max(0, asInt(neg.feeEur, 0)),
      loanMonths: clampNum(asInt(neg.contractYears, 1), 1, 4) * 6,
      optionToBuyEur: 0,
      mandatoryBuy: false,
      mandatoryBuyContractYears: 3,
      recallable: true,
      recallNoticeDays: 14,
      wageSharePercent: 100
    };
  }
  return { ...common, feeEur: Math.max(0, asInt(neg.feeEur, 0)), contractYears: clampNum(asInt(neg.contractYears, 1), 1, 5) };
}

export function applyNegotiationCounter(neg = {}, counter = {}) {
  const next = {
    ...neg,
    role: NEGOTIATION_ROLES.includes(counter.role) ? counter.role : neg.role,
    contractYears: clampNum(asInt(counter.contractYears, neg.contractYears), 1, 5),
    weeklyWageEur: Math.max(0, asInt(counter.weeklyWageEur, neg.weeklyWageEur)),
    feeEur: Math.max(0, asInt(counter.feeEur, neg.feeEur)),
    sellOnPct: clampNum(asInt(counter.sellOnPct, neg.sellOnPct ?? 0), 0, 25),
    useIntermediary: counter.useIntermediary === true,
    round: Math.min(WAKIL_NEGOTIATION_MAX_ROUNDS, asInt(neg.round, 1) + 1),
    log: [...(neg.log ?? []), {
      round: Math.min(WAKIL_NEGOTIATION_MAX_ROUNDS, asInt(neg.round, 1) + 1),
      text: "عارضت: " + (counter.role ?? neg.role) + " · " +
        asInt(counter.contractYears, neg.contractYears) + " مواسم · راتب " +
        formatEuroMoney(asInt(counter.weeklyWageEur, neg.weeklyWageEur)) + " أسبوعيًا" +
        (asInt(counter.sellOnPct, 0) > 0 ? " · بند بيع مستقبلي " + asInt(counter.sellOnPct, 0) + "%" : "") +
        (counter.useIntermediary ? " · بوسيط" : "")
    }]
  };
  return next;
}

// ---------------------------------------------------------------------------
// 7) التقويم والمواسم (UXUI §2.5)
// ---------------------------------------------------------------------------

export function getCalendarData(save = {}, players = []) {
  const career = save.career ?? {};
  const world = save.world ?? {};
  const currentDate = world.currentDate ?? "2026-07-01";
  const season = asInt(career.season, 1);
  const week = asInt(career.week, 1);
  const day = asInt(career.day, 1);
  const seasonWeek = clampNum(week, 1, 52);
  let upcoming = [];
  try {
    upcoming = getUpcomingCareerEvents(currentDate, season, 365) ?? [];
  } catch {
    upcoming = [];
  }
  const byId = new Map(players.map((player) => [player.id, player]));
  const contracts = (save.agency?.representation?.contracts ?? [])
    .filter((contract) => contract.status === "active")
    .map((contract) => {
      const expiry = getRepresentationContractExpiry(contract);
      const days = expiry ? daysBetween(currentDate, expiry) : null;
      return {
        playerId: contract.playerId,
        playerName: byId.get(contract.playerId)?.name ?? "عميل",
        expiry, days,
        urgency: days === null ? "low" : days <= 30 ? "high" : days <= 180 ? "medium" : "low"
      };
    })
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
  const archives = (world.football?.archives ?? []).slice(-5).reverse().map((archive) => ({
    competitionName: archive.competitionName ?? "بطولة",
    season: asInt(archive.season, season),
    champion: archive.championName ?? archive.winnerName ?? "—",
    completedDate: archive.completedDate ?? null
  }));
  const transferWindow = (() => {
    try {
      const windows = WORLD_DATABASE.clubs.map((club) => getTransferWindow(currentDate, club.id));
      const active = windows.filter((item) => item.active);
      const next = windows.map((item) => item.nextWindow).filter(Boolean)
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))[0] ?? null;
      return { activeCount: active.length, nextWindow: next };
    } catch {
      return { activeCount: 0, nextWindow: null };
    }
  })();
  return {
    currentDate, season, week, day,
    seasonProgressPct: clampNum(Math.round(((seasonWeek - 1) / 51) * 100), 0, 100),
    upcoming: upcoming.slice(0, 10),
    contractsExpiring: contracts,
    archives,
    transferWindow
  };
}

// ---------------------------------------------------------------------------
// 8) الوكالة — المستوى والسقف والرخص (UXUI §2.6)
// ---------------------------------------------------------------------------

export const AGENCY_LEVELS = Object.freeze([
  Object.freeze({ level: 1, title: "محلية", clientCap: 3, requirement: "ابدأ بأول عميل" }),
  Object.freeze({ level: 2, title: "صاعدة", clientCap: 5, requirement: "3 عملاء + رصيد 25,000" }),
  Object.freeze({ level: 3, title: "إقليمية", clientCap: 7, requirement: "5 عملاء + رصيد 50,000" }),
  Object.freeze({ level: 4, title: "قارية", clientCap: 9, requirement: "7 عملاء + رصيد 100,000" }),
  Object.freeze({ level: 5, title: "دولية", clientCap: 12, requirement: "9 عملاء + رصيد 250,000" }),
  Object.freeze({ level: 6, title: "أسطورية", clientCap: 15, requirement: "12 عميلًا + رصيد 500,000" })
]);

export function getAgencyLevel(save = {}) {
  const clients = asInt(save.agency?.clients?.length, 0);
  const balance = asNumber(save.agency?.balance, 0);
  let level = 1;
  if (clients >= 12 && balance >= 500000) level = 6;
  else if (clients >= 9 && balance >= 250000) level = 5;
  else if (clients >= 7 && balance >= 100000) level = 4;
  else if (clients >= 5 && balance >= 50000) level = 3;
  else if (clients >= 3 && balance >= 25000) level = 2;
  const current = AGENCY_LEVELS[level - 1];
  const next = AGENCY_LEVELS[level] ?? null;
  return {
    level, title: current.title, clientCap: current.clientCap,
    clients, balance,
    nextLevel: next ? { level: next.level, title: next.title, requirement: next.requirement } : null,
    progressPct: next
      ? clampNum(Math.round((clients / next.clientCap) * 100), 0, 100) : 100
  };
}

// الأثر الميكانيكي لكل دور موظف — مكتوب صراحة (UXUI §2.6): ممنوع موظف
// من غير أثر مكتوب. الأرقام من getAgencyStaffModifiers في المحرك.
export function getStaffEffects(save = {}) {
  const modifiers = getAgencyStaffModifiers(save);
  return {
    negotiator: "مفاوض تعاقدات — مكافأة تفاوض +" + modifiers.negotiationBonus + " (تسهّل قبول الشروط)",
    analyst: "محلل أداء — دقة كشافة +" + Math.round(modifiers.scoutingAccuracyBonus * 100) + "% (بيضيّق نطاق الإمكانات)",
    legal: "مستشار قانوني — حماية قانونية +" + modifiers.legalProtectionBonus + "%",
    media: "مسؤول إعلام — وصول العلامة +" + modifiers.brandReachBonus + "%",
    operations: "مدير عمليات — كفاءة تشغيل +" + modifiers.operationsEfficiencyPct + "% (بيقلل المصروف الأسبوعي)"
  };
}

// ---------------------------------------------------------------------------
// 9) لوحة TransferRoom (UXUI §2.3 — فكرة FM24)
// ---------------------------------------------------------------------------

export function readTransferRoomListings(source, storage) {
  // source: حفظ (كائن له world) أو storage قديم — التوقيع القديم
  // readTransferRoomListings(storage) ما زال يعمل كما هو.
  if (source && typeof source === "object" && "world" in source) {
    const fromSave = getTransferRoomFromSave(source);
    if (fromSave !== null) return fromSave;
  }
  const store = (source && typeof source.getItem === "function")
    ? source
    : (storage ?? globalThis.localStorage);
  try {
    const raw = store?.getItem(TRANSFER_ROOM_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeTransferRoomListings(listings, source, storage) {
  if (source && typeof source === "object" && "world" in source) {
    if (!source.world || typeof source.world !== "object") source.world = {};
    source.world.transferRoom = Array.isArray(listings) ? [...listings] : [];
    try {
      (storage ?? globalThis.localStorage)?.removeItem(TRANSFER_ROOM_KEY);
    } catch {
      // إزالة المفتاح القديم أفضل جهد — فشلها لا يمنع الحفظ داخل الحفظ.
    }
    return true;
  }
  const store = (source && typeof source.setItem === "function")
    ? source
    : (storage ?? globalThis.localStorage);
  try {
    store?.setItem(TRANSFER_ROOM_KEY, JSON.stringify(listings));
    return true;
  } catch {
    return false;
  }
}

// القوائم المخزنة داخل الحفظ نفسه (world.transferRoom) — حقل اختياري،
// فحفظ v9 قديم بلا الحقل يبقى صالحًا تمامًا (isValidSave يتجاهل الحقول
// الإضافية، وreadSave لا يملأ قيمًا افتراضية).
export function getTransferRoomFromSave(save = {}) {
  const listings = save.world?.transferRoom;
  return Array.isArray(listings) ? listings : null;
}

// ترحيل لمرة واحدة من المفتاح المنفصل إلى داخل الحفظ — يُستدعى عند تحميل
// الحفظ في app.js. يعدّل كائن الحفظ في الذاكرة فقط، ويُحفظ مع أول writeSave
// تالٍ؛ فلا كتابة مباشرة ولا تغيير إصدار هنا.
export function migrateTransferRoomToSave(save = {}, storage) {
  if (!save || typeof save !== "object") return { migrated: false, count: 0, reason: "invalid-save" };
  if (Array.isArray(save.world?.transferRoom)) return { migrated: false, count: 0, reason: "already-in-save" };
  const legacy = readTransferRoomListings(storage);
  if (legacy.length === 0) return { migrated: false, count: 0, reason: "nothing-to-migrate" };
  if (!save.world || typeof save.world !== "object") save.world = {};
  save.world.transferRoom = legacy;
  try {
    (storage ?? globalThis.localStorage)?.removeItem(TRANSFER_ROOM_KEY);
  } catch {
    // المفتاح القديم قد يبقى إن تعذرت إزالته — القراءة من الحفظ أولًا
    // على أي حال، فلا ازدواج في العرض.
  }
  return { migrated: true, count: legacy.length };
}

export function createTransferRoomListing(save = {}, playerId, clubIds = []) {
  const listings = readTransferRoomListings(save);
  const listing = {
    id: "transfer-room-" + (listings.length + 1) + "-" + String(playerId ?? "unknown"),
    playerId,
    clubIds: [...new Set(clubIds)].slice(0, 3),
    status: "pending",
    createdDate: save.world?.currentDate ?? null,
    responses: []
  };
  return listing;
}

// ردود الأندية حتمية من الـ seed (id القائمة + id النادي) — نفس العرض
// = نفس الردود دائمًا، من غير Math.random.
export function resolveTransferRoomResponses(listing = {}, players = []) {
  const seedText = String(listing.id ?? "") + "|" + String(listing.playerId ?? "");
  let hash = 2166136261;
  for (const character of seedText) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const player = players.find((item) => item.id === listing.playerId);
  const rating = asNumber(player?.rating, 60);
  return (listing.clubIds ?? []).map((clubId, index) => {
    const clubHash = (hash >>> (index * 5)) % 100;
    const interested = clubHash + rating > 95;
    const club = WORLD_DATABASE.clubs.find((item) => item.id === clubId);
    return {
      clubId,
      clubName: club?.nameAr ?? clubId,
      interested,
      note: interested
        ? "النادي مهتم — هيبعت عرض رسمي خلال أيام داخل اللعبة"
        : "النادي مش مهتم دلوقتي — الفريق مكتمل في المركز ده"
    };
  });
}

// ---------------------------------------------------------------------------
// 10) Pre-Match Hub وDevelopment Hub وStar Plan الكامل ولوحة المسيرة
// و«سنة في مراجعة» — المرحلة 3 (UXUI §5).
// كلها مشتقة حتميًا من بيانات موجودة؛ لا حقل حفظ جديد ولا migration.
// الاستثناء الوحيد لحالة جديدة: «قرار المباراة» قرار جلسة فقط
// (module-level Map) — لا يُحفظ ولا يغيّر المحاكاة، ويُعلن ذلك في الواجهة.
// ---------------------------------------------------------------------------

// أقرب مباراة قادمة لنادي اللاعب من جدول الموسم.
export function getNextFixtureForPlayer(player = {}, save = {}) {
  const football = save.world?.football ?? {};
  const currentDate = save.world?.currentDate ?? null;
  const clubId = player.clubId;
  if (typeof clubId !== "string" || !currentDate || !Array.isArray(football.fixtures)) return null;
  let upcoming = [];
  try {
    upcoming = getUpcomingFootballFixtures(football, currentDate, 10);
  } catch {
    return null;
  }
  const fixture = upcoming.find((item) => item.homeClubId === clubId || item.awayClubId === clubId);
  if (!fixture) return null;
  const isHome = fixture.homeClubId === clubId;
  const opponentId = isHome ? fixture.awayClubId : fixture.homeClubId;
  const opponent = WORLD_DATABASE.clubs.find((club) => club.id === opponentId) ?? null;
  const ownClub = WORLD_DATABASE.clubs.find((club) => club.id === clubId) ?? null;
  return {
    fixtureId: fixture.id ?? null,
    date: fixture.date ?? null,
    daysUntil: daysBetween(currentDate, fixture.date),
    isHome,
    competitionName: fixture.competitionName ?? "",
    round: fixture.round ?? null,
    opponentId,
    opponentName: opponent?.nameAr ?? opponentId,
    opponentProfile: asInt(opponent?.simulationProfile, 80),
    ownProfile: asInt(ownClub?.simulationProfile, 80)
  };
}

// توقع إعلامي حتمي من فرق قوة الفريقين (simulationProfile) — رأي صحفي
// معروض، لا تنبؤ محاكاة ولا نتيجة مضمونة.
export function getMediaPrediction(nextFixture) {
  if (!nextFixture) return null;
  const diff = asInt(nextFixture.opponentProfile, 80) - asInt(nextFixture.ownProfile, 80);
  if (diff >= 6) return "الصحافة بترشح الخصم بقوة — فريقك داخل المباراة دي كطرف أضعف على الورق.";
  if (diff >= 2) return "الخصم مرشح بفارق بسيط — مباراة ممكن تتقلب بتفصيلة واحدة.";
  if (diff <= -6) return "فريقك مرشح بقوة — الصحافة مستنية فوز مريح.";
  if (diff <= -2) return "فريقك مرشح بفارق بسيط — المطلوب التركيز عشان الفوز ما يضيعش.";
  return "مباراة متكافئة على الورق — أي نتيجة واردة.";
}

export function getAgentMatchAdvice(player = {}, nextFixture) {
  if (!nextFixture) return null;
  const perf = player.seasonPerformance ?? {};
  const goals = asInt(perf.goals, 0);
  const appearances = asInt(perf.appearances, 0);
  const diff = asInt(nextFixture.opponentProfile, 80) - asInt(nextFixture.ownProfile, 80);
  if (diff >= 6) return "الخصم أقوى بكتير — نصيحة الوكيل: العب بحذر، ركّز على التمرير الآمن، وأي نقطة مكسب.";
  if (diff >= 2) return "الخصم أقوى شوية — فرصتك تثبت نفسك: اضغط في أول ربع ساعة قبل ما الخصم يفرض إيقاعه.";
  if (goals >= 5 && appearances > 0) return "إنت في فورمة تهديفية — دي مباراتك: اطلب الكرة في المناطق الخطرة.";
  if (appearances < 5) return "لسه ما لعبتش كتير الموسم ده — المباراة دي فرصتك تثبت للمدرب إنك تستحق مكان أساسي.";
  return "مباراة في المتناول — العب لعبك الطبيعي وخلي تركيزك على تنفيذ الخطة.";
}

export const MATCH_DECISION_OPTIONS = Object.freeze(["confident", "patient", "rest"]);
export const MATCH_DECISION_LABELS = Object.freeze({
  confident: "العب بثقة وهجوم",
  patient: "العب بحذر وصبر",
  rest: "اطلب الراحة من المدرب"
});
const MATCH_DECISIONS = new Map();

export function setMatchDecision(playerId, decision) {
  if (typeof playerId !== "string" || !MATCH_DECISION_OPTIONS.includes(decision)) return false;
  MATCH_DECISIONS.set(playerId, decision);
  return true;
}

export function getMatchDecision(playerId) {
  return MATCH_DECISIONS.get(playerId) ?? null;
}

export function clearMatchDecisions() {
  MATCH_DECISIONS.clear();
}

export function getPreMatchBrief(player = {}, save = {}) {
  const next = getNextFixtureForPlayer(player, save);
  if (!next) {
    return { hasFixture: false, next: null, mediaPrediction: null, advice: null, decision: getMatchDecision(player.id) };
  }
  return {
    hasFixture: true,
    next,
    mediaPrediction: getMediaPrediction(next),
    advice: getAgentMatchAdvice(player, next),
    decision: getMatchDecision(player.id)
  };
}

// تركيز التدريب المقترح: أضعف مهارة في سجل التطوير حسب المركز.
// حارس → حراسة المرمى دائمًا (المحرك يرفض غيرها للحراس).
export function recommendTrainingFocus(player = {}, record = null) {
  const role = String(player.role ?? player.position ?? "");
  if (/حراسة|حارس|goalkeeper/i.test(role)) return "goalkeeping";
  const skills = record?.skills ?? null;
  if (!skills || typeof skills !== "object") return "balanced";
  const focusBySkill = {
    finishing: "attacking",
    passing: "technical",
    dribbling: "technical",
    defending: "defending",
    pace: "physical",
    stamina: "physical"
  };
  let weakest = null;
  let lowest = Infinity;
  for (const key of Object.keys(focusBySkill)) {
    const value = asNumber(skills[key], 99);
    if (value < lowest) {
      lowest = value;
      weakest = key;
    }
  }
  return focusBySkill[weakest] ?? "balanced";
}

export function recommendLoanOrStay(player = {}) {
  const age = asInt(player.age, 99);
  const appearances = asInt(player.seasonPerformance?.appearances, 0);
  const rating = asInt(player.rating, 0);
  if (age <= 21 && appearances < 8) {
    return { verdict: "loan", title: "إعارة أفضل", detail: "عمره " + age + " سنة ولعب " + appearances + " مباريات بس — الإعارة لنادٍ أصغر تضمن له دقائق." };
  }
  if (appearances >= 20) {
    return { verdict: "stay", title: "البقاء أفضل", detail: "لعب " + appearances + " مباراة — أساسي في فريقه، والإعارة هتضيع الاستقرار ده." };
  }
  if (rating >= 75 && appearances < 15) {
    return { verdict: "stay-ask", title: "البقاء مع طلب دقائق", detail: "موهبته أعلى من دقائقه — اطلب من المدرب دور أكبر قبل التفكير في إعارة." };
  }
  return { verdict: "stay", title: "البقاء أفضل", detail: "الموسم لسه في أوله — قيّم بعد 10 مباريات." };
}

export function getDevelopmentHub(player = {}, save = {}) {
  const devState = save.world?.football?.playerDevelopment ?? null;
  const record = devState ? getPlayerDevelopmentRecord(devState, player.id) : null;
  const currentFocus = record?.trainingFocus ?? "balanced";
  const recommended = recommendTrainingFocus(player, record);
  return {
    hasRecord: record !== null,
    currentFocus,
    currentFocusLabel: TRAINING_FOCUSES[currentFocus]?.label ?? currentFocus,
    currentIntensity: record?.trainingIntensity ?? "normal",
    recommendedFocus: recommended,
    recommendedFocusLabel: TRAINING_FOCUSES[recommended]?.label ?? recommended,
    focusChanged: recommended !== currentFocus,
    fitness: record ? asInt(record.fitness, 100) : null,
    fatigue: record ? asInt(record.fatigue, 0) : null,
    injuryDays: record ? asInt(record.injuryDays, 0) : 0,
    appearances: record ? asInt(record.appearances, 0) : asInt(player.seasonPerformance?.appearances, 0),
    averageMatchRating: record?.averageMatchRating ?? null,
    loan: recommendLoanOrStay(player)
  };
}

// تطبيق خطة تدريب على الحفظ — يعيد حفظًا جديدًا، ولا يعدّل الأصلي.
// يُستدعى من app.js (setTrainingPlan) ثم يُحفظ بـ writeSave.
export function applyTrainingPlan(save = {}, playerId, focus, intensity = "normal") {
  const devState = save.world?.football?.playerDevelopment;
  if (!devState) return { save, changed: false, reason: "no-development-state" };
  const result = setPlayerTrainingPlan(devState, playerId, focus, intensity);
  if (!result.changed) return { save, changed: false, reason: result.reason };
  return {
    save: {
      ...save,
      world: {
        ...save.world,
        football: { ...save.world.football, playerDevelopment: result.state }
      }
    },
    changed: true,
    reason: null
  };
}

// Star Plan الكامل: الأهداف الثلاثة + مكافأة معنوية لكل هدف مكتمل
// (عرض رعاية / تجديد أفضل / سمعة أعلى) — تقدير عرضي، لا قيد في الدفتر.
export function getStarPlanRewards(player = {}) {
  const plan = getStarPlan(player);
  return plan.map((goal) => ({
    ...goal,
    reward: goal.done
      ? (goal.id === "goals"
        ? "جاهز لعرض رعاية — هداف الفريق في الواجهة"
        : goal.id === "assists"
          ? "صانع اللعب الأول — يستحق التفاوض على عقد أفضل"
          : "لاعب أساسي ثابت — سمعته في السوق ارتفعت")
      : null
  }));
}

export function getStarPlanSummary(player = {}) {
  const plan = getStarPlanRewards(player);
  const done = plan.filter((goal) => goal.done).length;
  return { total: plan.length, done, allDone: done === plan.length, plan };
}

// لوحة مسيرة العملاء: كل عميل في سطر — النادي، التقييم، Star Plan،
// الثقة وخطر المغادرة، وأيام العقد المتبقية.
export function getCareerBoard(save = {}, players = []) {
  const currentDate = save.world?.currentDate ?? null;
  const clients = (save.agency?.clients ?? [])
    .map((id) => players.find((player) => player.id === id))
    .filter(Boolean);
  return clients.map((player) => {
    const contract = (save.agency?.representation?.contracts ?? [])
      .find((item) => item.playerId === player.id && item.status === "active") ?? null;
    const summary = getStarPlanSummary(player);
    const trust = getPlayerTrust(player, contract, currentDate);
    return {
      playerId: player.id,
      name: player.name,
      club: player.club ?? "لاعب حر",
      rating: asInt(player.rating, 0),
      potential: asInt(player.potential, 0),
      age: asInt(player.age, 0),
      starPlanDone: summary.done,
      starPlanTotal: summary.total,
      trust: trust.trust,
      departureRisk: trust.departureRisk,
      contractDaysLeft: trust.daysToExpiry,
      timelineCount: getPlayerTimeline(player).length
    };
  }).sort((a, b) => b.potential - a.potential || b.rating - a.rating);
}

// «سنة في مراجعة»: أرشيف الموسم الماضي (الأبطال)، وStar Plan لكل العملاء،
// وأفضل عميل (ألقاب الموسم الماضي ثم أكبر قفزة محتملة)، وملخص العمولات
// التراكمي من الدفتر — معلنًا أنه تراكمي لا موسمي، لأن الدفتر لا يفصل
// العمولات حسب الموسم.
export function getSeasonReview(save = {}, players = []) {
  const season = asInt(save.career?.season, 1);
  const lastSeason = season - 1;
  const archives = (save.world?.football?.archives ?? [])
    .filter((archive) => asInt(archive.season, 0) === lastSeason);
  const clients = (save.agency?.clients ?? [])
    .map((id) => players.find((player) => player.id === id))
    .filter(Boolean);
  const plans = clients.map((player) => getStarPlanSummary(player));
  const goalsDone = plans.reduce((sum, item) => sum + item.done, 0);
  const goalsTotal = plans.reduce((sum, item) => sum + item.total, 0);
  const bestClient = [...clients].sort((a, b) => {
    const honorsA = (a.honors ?? []).filter((honor) => asInt(honor.season, 0) === lastSeason).length;
    const honorsB = (b.honors ?? []).filter((honor) => asInt(honor.season, 0) === lastSeason).length;
    return honorsB - honorsA ||
      ((b.potential - b.rating) - (a.potential - a.rating)) ||
      b.rating - a.rating;
  })[0] ?? null;
  let finance = null;
  try {
    const summary = getAgencyFinancialSummary(save);
    finance = {
      commissionReceivableEur: summary.eur.commissionReceivableEur,
      commissionEntryCount: summary.eur.commissionEntryCount,
      netOperatingCashFlowEgp: summary.egp.netOperatingCashFlowEgp
    };
  } catch {
    finance = null;
  }
  return {
    season: lastSeason,
    hasLastSeason: lastSeason >= 1,
    archives,
    clientsCount: clients.length,
    goalsDone,
    goalsTotal,
    bestClientId: bestClient?.id ?? null,
    bestClientName: bestClient?.name ?? null,
    finance
  };
}

// ---------------------------------------------------------------------------
// محركات العرض (DOM) — الشاشات الست. تُستدعى من src/app.js خلف الـ Flag فقط.
// كل شاشة تتسلم مع حالاتها الثلاث (فارغ/تحميل/خطأ) كما في UXUI §5.
// ---------------------------------------------------------------------------

function starsRow(stars) {
  const row = node("span", "wakil-stars");
  row.setAttribute("role", "img");
  row.setAttribute("aria-label", "تقييم " + stars + " من 6 نجوم");
  for (let index = 1; index <= 6; index += 1) {
    row.append(node("span", index <= stars ? "wakil-star is-filled" : "wakil-star", index <= stars ? "★" : "☆"));
  }
  return row;
}

function meterBar(pct, tone = "") {
  const track = node("div", "wakil-meter-track" + (tone ? " tone-" + tone : ""));
  const fill = node("span", "wakil-meter-fill");
  fill.style.width = clampNum(Math.round(pct), 0, 100) + "%";
  track.append(fill);
  return track;
}

function statusChip(text, tone) {
  return node("span", "wakil-chip tone-" + tone, text);
}

function sectionHeading(title, subtitle, level = "h2") {
  const head = node("div", "wakil-section-head");
  head.append(node(level, "", title));
  if (subtitle) head.append(node("p", "", subtitle));
  return head;
}

function emptyState(title, description, actionLabel, onAction) {
  const section = node("section", "wakil-empty");
  section.setAttribute("role", "status");
  section.append(node("h2", "", title), node("p", "", description));
  if (actionLabel && onAction) {
    section.append(actionButton(actionLabel, "button-primary wakil-empty-action", onAction));
  }
  return section;
}

// ---------------------------------------------------------------------------
// 2.1 شاشة «اليوم» — الداشبورد (تحل محل renderDashboard خلف الـ Flag).
// تحافظ على خطافات الاختبارات القديمة (.dashboard-intro و
// .dashboard-agency-card و.dashboard-day-card و3 أزرار .dashboard-quick-action
// وعنصر .agent-name) حتى لا تنكسر اختبارات المتصفح دون تنسيق.
// ---------------------------------------------------------------------------

export function renderWakilToday(context) {
  const save = context.save ?? {};
  const summary = getTodaySummary(save);
  const decisions = getTodayDecisions(save, context.players ?? []);
  const finance = getWeekFinance(save);
  const agency = save.agency ?? {};
  const unread = (save.world?.inbox ?? []).filter((message) => !message.read).length;
  const clients = (agency.clients ?? [])
    .map((id) => (context.players ?? []).find((player) => player.id === id))
    .filter(Boolean);
  const starClient = [...clients].sort((a, b) => asNumber(b.potential) - asNumber(a.potential))[0] ?? null;
  const youngClients = clients.filter((player) => asInt(player.age, 99) < 21).length;

  const page = node("div", "page-content home-dashboard rebuild-dashboard wakil-today");

  // الهيدر: تحية + التاريخ + الرصيد + البريد بعدّاد.
  const intro = node("section", "dashboard-intro wakil-today-intro");
  const introCopy = node("div", "dashboard-intro-copy");
  introCopy.append(
    node("span", "dashboard-eyebrow", "وَكِيل · WAKIL — اصنع النجوم، مش بس اشتريهم"),
    node("h1", "dashboard-heading", "صباح الخير يا وكيل"),
    node("p", "dashboard-subtitle", "قرارات النهاردة الأول، وبعدها كل حاجة تانية.")
  );
  const introActions = node("div", "dashboard-intro-actions");
  const inboxButton = actionButton(
    unread > 0 ? "البريد (" + unread + ")" : "البريد",
    "button-outline wakil-inbox-button",
    () => context.openInbox(),
    "صندوق الوارد — " + unread + " رسائل غير مقروءة"
  );
  // زر Dark Mode — المرحلة 3 (UXUI §1.2): يبدّل بين الفاتح والداكن فورًا
  // (الكلاس على documentElement يقلب المتغيرات)، ويحدّث نصه بنفسه.
  const isDarkNow = resolveWakilTheme() === "dark";
  const themeButton = actionButton(
    isDarkNow ? "الوضع الفاتح" : "الوضع الداكن",
    "button-outline wakil-theme-button",
    () => {
      const next = toggleWakilTheme();
      const dark = next === "dark";
      themeButton.textContent = dark ? "الوضع الفاتح" : "الوضع الداكن";
      themeButton.setAttribute("aria-label", dark ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن");
    },
    isDarkNow ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن"
  );
  introActions.append(
    actionButton("ابدأ يوم جديد", "day-advance-button", context.advanceDay),
    actionButton("تقدم أسبوعًا", "week-advance-button", context.advanceWeek),
    inboxButton,
    themeButton
  );
  intro.append(introCopy, introActions);

  // بطاقة الوكالة + بطاقة اليوم (خطافات قديمة محفوظة).
  const overview = node("section", "dashboard-overview");
  const agencyCard = node("article", "dashboard-agency-card wakil-agency-card");
  const agencyTop = node("div", "dashboard-agency-top");
  agencyTop.append(
    node("span", "dashboard-agency-monogram wakil-monogram", "و"),
    node("div", "dashboard-agency-identity")
  );
  agencyTop.children[1].append(
    node("small", "", "ملف الوكالة · المستوى 1"),
    node("strong", "agent-name", agency.name ?? "وكالتك الجديدة")
  );
  agencyCard.append(agencyTop);
  const agencyStats = node("div", "dashboard-agency-stats");
  [
    ["الرصيد المتاح", formatMoney(summary.balance)],
    ["العملاء", String(summary.clientsCount)],
    ["الرسائل الجديدة", String(unread)]
  ].forEach(([label, value]) => {
    const stat = node("div", "dashboard-stat");
    stat.append(node("span", "", label), node("strong", "", value));
    agencyStats.append(stat);
  });
  agencyCard.append(agencyStats);

  const dayCard = node("article", "dashboard-day-card wakil-day-card");
  dayCard.append(
    node("div", "dashboard-day-head"),
    node("div", "dashboard-day-metrics"),
    node("p", "dashboard-day-note", "تقدم الزمن يعالج الأحداث والمواعيد والمهام بالتتابع، ويحفظ التغييرات في مسيرتك.")
  );
  dayCard.children[0].append(
    node("span", "", formatHomeDate(save.world?.currentDate)),
    node("strong", "", "الموسم " + summary.season)
  );
  [
    ["اليوم", String(summary.day)],
    ["الأسبوع", String(summary.week)],
    ["الوارد", String(unread)]
  ].forEach(([label, value]) => {
    const metric = node("div", "dashboard-day-metric");
    metric.append(node("small", "", label), node("strong", "", value));
    dayCard.children[1].append(metric);
  });
  overview.append(agencyCard, dayCard);
  page.append(intro, overview);

  // بطاقة «محتاج قرارك» — أهم بطاقة في اللعبة.
  const decisionsSection = node("section", "wakil-decisions");
  decisionsSection.append(sectionHeading(
    "محتاج قرارك",
    decisions.length > 0 ? decisions.length + " قرارات معلقة — الأقرب مهلة الأول" : "يوم هادي"
  ));
  if (decisions.length === 0) {
    decisionsSection.append(emptyState(
      "مفيش قرارات معلّقة — يوم هادي، استغله في الكشافة",
      "مفيش عروض تنتظر ردك ولا عقود بتخلص ولا عميل في خطر.",
      "اكتشف مواهب",
      () => context.navigate("scouting")
    ));
  } else {
    const list = node("div", "wakil-decision-list");
    decisions.slice(0, 5).forEach((decision) => {
      const row = node("article", "wakil-decision-row" + (decision.overdue ? " is-overdue" : ""));
      const copy = node("div", "wakil-decision-copy");
      copy.append(
        node("strong", "", decision.title),
        node("span", "", decision.detail),
        node("small", "", decision.deadline
          ? (decision.overdue ? "متأخرة منذ: " : "المهلة: ") + formatHomeDate(decision.deadline)
          : "بلا مهلة محددة")
      );
      const action = actionButton(decision.action, "button-primary wakil-decision-action", () => {
        if (decision.kind === "task") context.completeTask(decision.id.replace("task-", ""));
        else context.navigate(decision.destination);
      });
      row.append(copy, action);
      list.append(row);
    });
    decisionsSection.append(list);
  }
  page.append(decisionsSection);

  // ماتشات عملاء النهاردة (مصغّر Pre-Match Hub).
  const matchesSection = node("section", "wakil-matches");
  matchesSection.append(sectionHeading("ماتشات عملاء النهاردة", "عميلك هيلعب إمتى، وضد مين"));
  const soon = (context.upcomingEvents ?? []).filter((event) => asInt(event.daysUntil, 99) <= 2).slice(0, 3);
  if (soon.length === 0) {
    matchesSection.append(node("p", "wakil-note", "مفيش ماتشات النهاردة — الماتش الجاي هيظهر هنا قبلها بيومين."));
  } else {
    const list = node("div", "wakil-match-list");
    soon.forEach((event) => {
      const row = node("article", "wakil-match-row");
      row.append(
        node("strong", "", event.title),
        node("span", "", event.description ?? ""),
        node("small", "", formatHomeDate(event.date) + " · بعد " + event.daysUntil + " يوم")
      );
      list.append(row);
    });
    matchesSection.append(list);
  }
  page.append(matchesSection);

  // ملخص مالي سريع + نجم الأسبوع + هدف الأسبوع.
  const financeSection = node("section", "wakil-finance-summary");
  financeSection.append(sectionHeading("ملخص مالي سريع", "دخل ومصروف الأسبوع ده"));
  const financeGrid = node("div", "wakil-finance-grid");
  [
    ["دخل الأسبوع", formatMoney(finance.incomeEgp), "دخل"],
    ["مصروف الأسبوع", formatMoney(finance.expensesEgp), "مصروف"],
    ["الصافي", formatMoney(finance.netEgp), finance.netEgp >= 0 ? "دخل" : "مصروف"]
  ].forEach(([label, value, tone]) => {
    const card = node("div", "wakil-finance-card");
    card.append(node("span", "", label), node("strong", "", value), node("small", "", tone));
    financeGrid.append(card);
  });
  financeSection.append(financeGrid);
  financeSection.append(actionButton("افتح دفتر الوكالة المالي", "text-button", () => context.navigate("agency")));
  page.append(financeSection);

  if (starClient) {
    const starSection = node("section", "wakil-star-client");
    starSection.append(sectionHeading("نجم الأسبوع", "أعلى عميل عندك إمكانيات"));
    const card = node("article", "wakil-star-card");
    const art = node("div", "wakil-star-art");
    art.append(createPlayerPortrait(starClient));
    const copy = node("div", "wakil-star-copy");
    const range = getPotentialRange(starClient, 0);
    copy.append(
      node("strong", "", starClient.name),
      node("span", "", starClient.position + " · " + starClient.age + " سنة · " + (starClient.club ?? "")),
      starsRow(starsForRating(starClient.rating)),
      node("span", "", "الإمكانيات " + range.low + "–" + range.high + " (" + range.certaintyLabel + ")")
    );
    card.append(art, copy, actionButton("افتح ملفه", "button-outline", () => context.openPlayer(starClient)));
    starSection.append(card);
    page.append(starSection);
  }

  const goalSection = node("section", "wakil-week-goal");
  goalSection.append(sectionHeading("هدف الأسبوع", "وقّع مع لاعب شاب واحد"));
  const goalCard = node("div", "wakil-goal-card");
  goalCard.append(
    node("strong", "", "عملاء شباب (تحت 21 سنة): " + youngClients + " من 1"),
    meterBar(youngClients >= 1 ? 100 : 0, youngClients >= 1 ? "success" : ""),
    node("span", "", youngClients >= 1 ? "الهدف اتحقق — مبروك يا وكيل" : "لسه موقعتش مع لاعب شاب الأسبوع ده")
  );
  goalSection.append(goalCard);
  page.append(goalSection);

  // اختصارات (3 — نفس عدد الخطاف القديم).
  const quickSection = node("section", "dashboard-section");
  const quickHeading = node("div", "dashboard-section-head");
  quickHeading.append(node("div", ""));
  quickHeading.children[0].append(
    node("h2", "", "اختصارات العمل"),
    node("p", "", "انتقل مباشرة إلى الأنظمة المتاحة حاليًا.")
  );
  const quickActions = node("div", "dashboard-quick-actions");
  [
    ["◉", "قاعدة اللاعبين", "استعرض ملفات المواهب", "players"],
    ["⌕", "عمليات الكشافين", "ابدأ بعثة أو راجع تقريرًا", "scouting"],
    ["▦", "إدارة العملاء", "العقود والعلاقات الحالية", "agency"]
  ].forEach(([icon, title, description, destination]) => {
    const button = actionButton("", "dashboard-quick-action", () => context.navigate(destination));
    const copy = node("span", "dashboard-quick-copy");
    copy.append(node("strong", "", title), node("small", "", description));
    button.append(node("span", "dashboard-quick-icon", icon), copy);
    quickActions.append(button);
  });
  quickSection.append(quickHeading, quickActions);
  page.append(quickSection);

  if (clients.length === 0) {
    page.append(emptyState(
      "وكالتك لسه فاضية — أول خطوة: اكتشف أول موهبة",
      "من غير عملاء مفيش عمولات ولا مفاوضات. الكشافة أول خطوة.",
      "ابدأ الكشافة",
      () => context.navigate("scouting")
    ));
  }
  return page;
}

// ---------------------------------------------------------------------------
// 2.2 ملف اللاعب — قصة مش رقم (يُلحق بمودال ملف اللاعب الحالي في app.js).
// تبويبات: القصة (نطاق + ثقة + Star Plan + عقد مزدوج) | المسيرة | المحادثات
// | المباراة الجاية (Pre-Match Hub) | التطوير (Development Hub) — المرحلة 3.
// ---------------------------------------------------------------------------

export function buildPlayerStorySection(player, save = {}, actions = {}) {
  const currentDate = save.world?.currentDate ?? null;
  const contracts = save.agency?.representation?.contracts ?? [];
  const contract = contracts.find((item) => item.playerId === player.id && item.status === "active") ?? null;
  const trust = getPlayerTrust(player, contract, currentDate);
  const range = getPotentialRange(player, 0);
  const commission = getDualCommission(contract ?? {}, currentDate);
  const timeline = getPlayerTimeline(player);
  const starPlan = getStarPlanRewards(player);
  const interactions = (save.agency?.representation?.interactions ?? [])
    .filter((item) => item.playerId === player.id).slice(-6).reverse();

  const section = node("section", "wakil-player-story");
  // عنوان القسم h3 مش h2: القسم ده بيتعرض جوه ديالوج «ملف اللاعب» اللي
  // عنوانه h2 واحد، وأي h2 تانية بتكسر اختبار استعادة التركيز بعد Escape.
  section.append(sectionHeading("ملف العميل — قصة مش رقم", "نطاق الإمكانات والثقة والمسيرة والخطة — كلها من بيانات اللعبة", "h3"));

  const tabs = node("div", "wakil-tabs");
  const tabButtons = node("div", "wakil-tab-bar");
  const panels = {};
  const tabDefs = [
    ["story", "القصة"],
    ["career", "المسيرة"],
    ["talks", "المحادثات"],
    ["prematch", "المباراة الجاية"],
    ["development", "التطوير"]
  ];
  tabDefs.forEach(([id, label], index) => {
    const button = actionButton(label, "wakil-tab-button" + (index === 0 ? " is-active" : ""), () => {
      tabButtons.querySelectorAll(".wakil-tab-button").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      Object.values(panels).forEach((panel) => { panel.hidden = true; });
      panels[id].hidden = false;
    });
    button.setAttribute("aria-label", "تبويب " + label + " في ملف اللاعب");
    tabButtons.append(button);
  });
  tabs.append(tabButtons);

  // — تبويب القصة —
  const story = node("div", "wakil-tab-panel");
  const rangeBlock = node("div", "wakil-range-block");
  rangeBlock.append(
    node("strong", "", "نطاق الإمكانات: " + range.low + "–" + range.high),
    node("span", "", "الحالي " + range.current + " · تقدير الكشافة: " + range.certaintyLabel + " — " + range.scoutNote)
  );
  rangeBlock.append(meterBar(((range.low - 1) / 98) * 100 + ((range.high - range.low) / 98) * 50));
  story.append(rangeBlock);
  story.append(starsRow(starsForRating(player.rating)));

  const trustGrid = node("div", "wakil-trust-grid");
  const trustCard = (label, value, tone) => {
    const card = node("div", "wakil-trust-card");
    card.append(node("span", "", label), node("strong", "", value));
    card.append(statusChip(tone === "danger" ? "يحتاج تدخل" : tone === "warning" ? "انتبه" : "مستقر", tone));
    return card;
  };
  trustGrid.append(
    trustCard("الثقة: " + trust.trustLabel, trust.trust + "/100", trust.trust < 50 ? "danger" : trust.trust < 75 ? "warning" : "success"),
    trustCard("الولاء: " + trust.loyaltyLabel, trust.loyalty + "/5", trust.loyalty <= 2 ? "danger" : trust.loyalty <= 3 ? "warning" : "success"),
    trustCard("خطر المغادرة", trust.departureRisk, trust.departureRisk === "عالي" ? "danger" : trust.departureRisk === "متوسط" ? "warning" : "success")
  );
  story.append(trustGrid);
  if (trust.needsAction) {
    story.append(node("p", "wakil-alert", "⚠ وكيل منافس ممكن يكلمه — اتصرف دلوقتي: كلم عميلك قبل ما يفكر يمشي."));
  }

  if (contract) {
    const contractBlock = node("div", "wakil-contract-block");
    contractBlock.append(
      node("strong", "", "عقد الوكيل — نسبة مزدوجة"),
      node("span", "", "عمولة الانتقال " + commission.transferRate + "% · عمولة الراتب " + commission.salaryRate + "% (مشتقة من العقد)"),
      node("small", "", "العقد ينتهي " + (trust.daysToExpiry !== null ? "خلال " + trust.daysToExpiry + " يوم" : "—"))
    );
    if (actions.onRenegotiate) {
      contractBlock.append(actionButton("أعد التفاوض على العقد", "button-outline", () => actions.onRenegotiate(player)));
    }
    story.append(contractBlock);
  } else {
    story.append(node("p", "wakil-note", "مفيش عقد تمثيل نشط مع اللاعب ده — ابدأ عرض تمثيل من ملف اللاعب."));
  }

  const planBlock = node("div", "wakil-star-plan");
  planBlock.append(node("strong", "", "Star Plan — خطة النجم"));
  starPlan.forEach((goal) => {
    const row = node("div", "wakil-goal-row");
    row.append(
      node("span", "", goal.title + ": " + goal.current + " من " + goal.target + " " + goal.unit),
      meterBar(goal.progressPct, goal.done ? "success" : "")
    );
    // مكافأة الهدف المكتمل (المرحلة 3) — تقدير عرضي، لا قيد في الدفتر.
    if (goal.done && goal.reward) {
      row.append(node("small", "wakil-star-reward", "✓ اكتمل — " + goal.reward));
    }
    planBlock.append(row);
  });
  story.append(planBlock);
  panels.story = story;

  // — تبويب المسيرة —
  const careerPanel = node("div", "wakil-tab-panel");
  careerPanel.hidden = true;
  if (timeline.length === 0) {
    careerPanel.append(node("p", "wakil-note", "لسه ملعبش ماتشات رسمية — المسيرة هتظهر هنا مع أول موسم."));
  } else {
    const list = node("ol", "wakil-timeline");
    timeline.forEach((entry) => {
      const item = node("li", "wakil-timeline-item");
      item.append(
        node("strong", "", "الموسم " + entry.season + " — " + entry.title),
        node("span", "", entry.detail)
      );
      list.append(item);
    });
    careerPanel.append(list);
  }
  panels.career = careerPanel;

  // — تبويب المحادثات (العملاء بيفتكروا كلامك) —
  const talksPanel = node("div", "wakil-tab-panel");
  talksPanel.hidden = true;
  if (interactions.length === 0) {
    talksPanel.append(node("p", "wakil-note", "لسه مفيش محادثات مسجلة مع العميل ده — كل وعد وكل رد هيتسجل هنا بتاريخه."));
  } else {
    const list = node("div", "wakil-talks-list");
    interactions.forEach((item) => {
      const row = node("article", "wakil-talk-row");
      row.append(
        node("strong", "", (item.kind ?? "تواصل") + " · " + formatHomeDate(item.date ?? item.createdDate)),
        node("span", "", item.summary ?? item.note ?? ""),
        node("small", "", "الحالة: " + (item.status ?? "—"))
      );
      list.append(row);
    });
    talksPanel.append(list);
  }
  panels.talks = talksPanel;

  // — تبويب المباراة الجاية — Pre-Match Hub (المرحلة 3) —
  const brief = getPreMatchBrief(player, save);
  const prematchPanel = node("div", "wakil-tab-panel");
  prematchPanel.hidden = true;
  if (!brief.hasFixture) {
    prematchPanel.append(node("p", "wakil-note", "مفيش مباراة قادمة مجدولة لفريق اللاعب ده حاليًا."));
  } else {
    const next = brief.next;
    prematchPanel.append(
      node("strong", "", "المباراة الجاية: ضد " + next.opponentName + (next.isHome ? " (على أرضك)" : " (خارج أرضك)")),
      node("span", "", next.competitionName + (next.round ? " · الجولة " + next.round : "") + " · " + formatHomeDate(next.date) + " · بعد " + next.daysUntil + " يوم"),
      node("p", "", "قوة الخصم " + next.opponentProfile + " مقابل قوة فريقك " + next.ownProfile),
      node("p", "", brief.mediaPrediction),
      node("p", "wakil-note", "نصيحة الوكيل: " + brief.advice)
    );
    const decisionNote = node("small", "", "قرارك كوكيل قبل المباراة — يُسجَّل في الجلسة دي بس، ولا يغيّر المحاكاة ولا يُحفظ.");
    const decisionRow = node("div", "wakil-decision-row");
    MATCH_DECISION_OPTIONS.forEach((option) => {
      const decisionButton = actionButton(
        MATCH_DECISION_LABELS[option],
        "button-outline" + (brief.decision === option ? " is-active" : ""),
        () => {
          setMatchDecision(player.id, option);
          decisionRow.querySelectorAll("button").forEach((item) => item.classList.remove("is-active"));
          decisionButton.classList.add("is-active");
          decisionNote.textContent = "قرارك: " + MATCH_DECISION_LABELS[option] + " — يُسجَّل في الجلسة دي بس، ولا يغيّر المحاكاة ولا يُحفظ.";
        },
        "قرار المباراة: " + MATCH_DECISION_LABELS[option]
      );
      decisionRow.append(decisionButton);
    });
    prematchPanel.append(decisionRow, decisionNote);
  }
  panels.prematch = prematchPanel;

  // — تبويب التطوير — Development Hub (المرحلة 3) —
  const dev = getDevelopmentHub(player, save);
  const devPanel = node("div", "wakil-tab-panel");
  devPanel.hidden = true;
  devPanel.append(node("strong", "", "التطوير والتدريب"));
  if (!dev.hasRecord) {
    devPanel.append(node("p", "wakil-note", "لسه مفيش سجل تطوير للاعب ده في الموسم ده."));
  } else {
    devPanel.append(
      node("span", "", "التركيز الحالي: " + dev.currentFocusLabel + " · الشدة: " + dev.currentIntensity),
      node("span", "", "اللياقة " + dev.fitness + "% · الإرهاق " + dev.fatigue + "%" + (dev.injuryDays > 0 ? " · مصاب — يرجع بعد " + dev.injuryDays + " يوم" : "")),
      node("span", "", "مشاركات الموسم: " + dev.appearances + (dev.averageMatchRating !== null ? " · متوسط تقييم المباريات " + dev.averageMatchRating : ""))
    );
    if (dev.focusChanged) {
      devPanel.append(node("p", "wakil-note", "المقترح: غيّر التركيز لـ " + dev.recommendedFocusLabel + " — أضعف مهارة عنده حسب سجل التطوير."));
      if (actions.onSetTrainingPlan) {
        devPanel.append(actionButton("طبّق تركيز " + dev.recommendedFocusLabel, "button-primary", () => actions.onSetTrainingPlan(player, dev.recommendedFocus)));
      }
    } else {
      devPanel.append(node("p", "", "التركيز الحالي هو المقترح — كمل عليه."));
    }
  }
  devPanel.append(
    node("strong", "", "إعارة ولا بقاء؟"),
    node("p", "", dev.loan.title + " — " + dev.loan.detail)
  );
  panels.development = devPanel;

  tabs.append(story, careerPanel, talksPanel, prematchPanel, devPanel);
  section.append(tabs);

  const actionsRow = node("div", "wakil-player-actions");
  if (actions.onOfferToClubs) actionsRow.append(actionButton("اعرضه على الأندية", "button-primary", () => actions.onOfferToClubs(player)));
  if (actions.onNegotiate) actionsRow.append(actionButton("تفاوض على عقد جديد", "button-outline", () => actions.onNegotiate(player)));
  if (actions.onTalk) actionsRow.append(actionButton("كلم عميلك", "button-outline", () => actions.onTalk(player)));
  if (actionsRow.children.length > 0) section.append(actionsRow);
  return section;
}

// ---------------------------------------------------------------------------
// 2.3 السوق الموحد + TransferRoom (تحل محل renderMarket خلف الـ Flag).
// تبويبان: اكتشف مواهب (أحرار) | عروض لعملائي، ولوحة TransferRoom.
// بطاقة النافذة والنموذج وقوائم الصفقات والمالية والأحرار القديمة
// بتتضمّن من app.js تحت أقسام وكيل، عشان خطافاتها وسلوكها يفضل كما هو.
// ---------------------------------------------------------------------------

export function renderWakilMarket(context) {
  const save = context.save ?? {};
  const currentDate = save.world?.currentDate ?? "2026-07-01";
  const transferState = context.transferState ?? {};
  const freeAgents = transferState.freeAgents ?? [];
  const byId = new Map((context.players ?? []).map((player) => [player.id, player]));
  const freePlayers = freeAgents
    .map((record) => byId.get(record.playerId))
    .filter(Boolean);
  const offers = getMarketOffers(save, context.players ?? []);
  const activeContracts = (save.agency?.representation?.contracts ?? [])
    .filter((contract) => contract.status === "active" && getRepresentationContractExpiry(contract) > currentDate);
  const representedPlayers = activeContracts
    .map((contract) => (context.players ?? []).find((player) => player.id === contract.playerId))
    .filter(Boolean);

  const page = node("div", "page-content rebuild-screen market-screen wakil-market");
  page.append(
    node("p", "eyebrow rebuild-page-kicker", "حركة الأندية والصفقات"),
    node("h1", "page-title rebuild-page-title", "سوق الانتقالات"),
    node("p", "page-subtitle rebuild-page-subtitle", "مكان واحد: وقّع مع مواهب حرة، وراجع عروض الأندية لعملائك، واعرض عميلك بنفسك على الأندية.")
  );

  // حالة النافذة والنموذج وقوائم الصفقات والمالية والأحرار: الأقسام القديمة
  // الكاملة بتتضمّن من app.js (renderMarket) عشان كل الخطافات والسلوك
  // يفضل زي ما هو — بطاقتي المبسطة ونموذجي المختصر اتشالوا عشان كانوا
  // بيكرروا نفس الكلاسات وبيكسروا اختبارات المتصفح.

  // تبويبا السوق.
  const tabs = node("div", "wakil-market-tabs");
  const tabBar = node("div", "wakil-tab-bar");
  const panels = {};
  const freeButton = actionButton("اكتشف مواهب (" + freePlayers.length + ")", "wakil-tab-button is-active", () => switchTab("free"));
  const offersButton = actionButton("عروض لعملائي (" + offers.length + ")", "wakil-tab-button", () => switchTab("offers"));
  const switchTab = (id) => {
    [freeButton, offersButton].forEach((button) => button.classList.remove("is-active"));
    (id === "free" ? freeButton : offersButton).classList.add("is-active");
    panels.free.hidden = id !== "free";
    panels.offers.hidden = id !== "offers";
  };
  tabBar.append(freeButton, offersButton);
  tabs.append(tabBar);

  // — تبويب الأحرار: فلاتر + بطاقات بنطاق إمكانات —
  const freePanel = node("div", "wakil-tab-panel");
  const filters = { position: "all", ageBand: "all", minStars: 0, sort: "rating" };
  const filterBar = node("div", "wakil-filter-bar");
  const filterState = node("div", "wakil-filter-state");
  const renderFreeList = () => {
    filterState.replaceChildren();
    const filtered = sortMarketPlayers(filterMarketPlayers(freePlayers, filters), filters.sort);
    if (filtered.length === 0) {
      filterState.append(emptyState(
        "مفيش لاعبين مطابقين للفلتر ده",
        "جرّب توسّع الفلتر أو استنى السوق يتجدد الأسبوع الجاي.",
        "امسح الفلاتر",
        () => { Object.assign(filters, { position: "all", ageBand: "all", minStars: 0, sort: "rating" }); renderFreeList(); }
      ));
      return;
    }
    const list = node("div", "wakil-market-list");
    filtered.slice(0, 40).forEach((player) => {
      const range = getPotentialRange(player, 0);
      const card = node("article", "wakil-market-card");
      const art = node("div", "wakil-market-art");
      art.append(createPlayerPortrait(player));
      const copy = node("div", "wakil-market-copy");
      copy.append(
        node("strong", "", player.name),
        node("span", "", player.position + " · " + player.age + " سنة · " + (player.club ?? "لاعب حر")),
        starsRow(starsForRating(player.rating)),
        node("span", "", "الإمكانيات " + range.low + "–" + range.high + " · القيمة " + formatEuroMoney(player.marketValueEur))
      );
      card.append(art, copy, actionButton("فتح الملف", "button-outline", () => context.openPlayer(player)));
      list.append(card);
    });
    filterState.append(list);
  };
  const chip = (label, active, onClick) => actionButton(
    label, "wakil-chip-filter" + (active ? " is-active" : ""), onClick
  );
  const positionChips = node("div", "wakil-chips");
  ["all", "حارس", "دفاع", "وسط", "هجوم"].forEach((position) => {
    positionChips.append(chip(position === "all" ? "كل المراكز" : position, filters.position === position, () => {
      filters.position = position; renderFreeList();
      positionChips.querySelectorAll(".wakil-chip-filter").forEach((item, index) => {
        item.classList.toggle("is-active", ["all", "حارس", "دفاع", "وسط", "هجوم"][index] === position);
      });
    }));
  });
  const sortSelect = node("select", "search-input wakil-sort-select");
  sortSelect.setAttribute("aria-label", "ترتيب السوق");
  [["rating", "الأعلى تقييمًا"], ["potential", "الأعلى إمكانيات"], ["value", "الأغلى قيمة"], ["youngest", "الأصغر سنًا"]].forEach(([value, label]) => {
    const option = node("option", "", label);
    option.value = value;
    sortSelect.append(option);
  });
  sortSelect.addEventListener("change", () => { filters.sort = sortSelect.value; renderFreeList(); });
  filterBar.append(positionChips, sortSelect);
  freePanel.append(filterBar, filterState);
  renderFreeList();
  panels.free = freePanel;

  // — تبويب عروض عملائي —
  const offersPanel = node("div", "wakil-tab-panel");
  offersPanel.hidden = true;
  if (offers.length === 0) {
    offersPanel.append(emptyState(
      "مفيش عروض لعملائك دلوقتي — اعرض عميل بنفسك",
      "العروض اللي توصل من الأندية هتظهر هنا بمهلة رد واضحة.",
      representedPlayers.length > 0 ? "اعرض عميل على الأندية" : null,
      representedPlayers.length > 0 ? () => document.querySelector(".wakil-transfer-room")?.scrollIntoView() : null
    ));
  } else {
    const list = node("div", "wakil-offer-list");
    offers.forEach(({ offer, player }) => {
      const terms = ["agreed", "completed"].includes(offer.status) ? offer.agreedTerms : offer.terms;
      const card = node("article", "wakil-offer-card wakil-status-" + offer.status);
      const copy = node("div", "wakil-offer-copy");
      copy.append(
        node("strong", "", player.name + " · " + (offer.type === "loan" ? "إعارة" : "انتقال نهائي")),
        node("span", "", (offer.fromClubId ?? "") + " ← " + (offer.toClubName ?? "")),
        node("span", "", offer.type === "loan"
          ? "رسوم الإعارة " + formatEuroMoney(terms?.loanFeeEur) + " · راتب أسبوعي " + formatEuroMoney(terms?.weeklyWageEur)
          : "قيمة الانتقال " + formatEuroMoney(terms?.feeEur) + " · راتب أسبوعي " + formatEuroMoney(terms?.weeklyWageEur)),
        node("small", "", "الجولة " + offer.round + " من 4 · أُرسل " + formatHomeDate(offer.createdDate) +
          (offer.expiresDate ? " · ينتهي " + formatHomeDate(offer.expiresDate) : ""))
      );
      card.append(copy);
      const actions = node("div", "wakil-offer-actions");
      if (offer.status === "countered") {
        actions.append(
          actionButton("اقبل شروط النادي", "button-primary", () => context.acceptTransferCounterOffer(offer.id)),
          actionButton("تفاوض", "button-outline", () => context.openWakilNegotiation(offer)),
          actionButton("ارفض", "button-outline", () => context.rejectTransferOffer(offer.id))
        );
      } else if (offer.status === "pending") {
        actions.append(
          actionButton("تفاوض", "button-primary", () => context.openWakilNegotiation(offer)),
          actionButton("محاكاة رد النادي", "button-outline", () => context.evaluateTransferOffer(offer.id)),
          actionButton("إلغاء", "button-outline", () => context.rejectTransferOffer(offer.id))
        );
      } else if (offer.status === "agreed") {
        actions.append(actionButton("تنفيذ الصفقة", "button-primary", () => context.completeTransfer(offer.id)));
      }
      card.append(actions);
      list.append(card);
    });
    offersPanel.append(list);
  }
  panels.offers = offersPanel;
  tabs.append(freePanel, offersPanel);
  page.append(tabs);

  // — نموذج فتح ملف انتقال جديد: النموذج القديم الكامل (renderMarket في
  // app.js) بيتضمّن تحت، بكل حقوله وبنوده المتقدمة ومنطق قفل الإعارة
  // للاعب الحر — النموذج المختصر اتشال عشان كان بيفقد كل ده.

  // — لوحة TransferRoom: اعرض عميلي على الأندية —
  const roomSection = node("section", "wakil-transfer-room");
  roomSection.append(sectionHeading("اعرض عميلي على الأندية — TransferRoom", "اختار عميل و3 أندية مهتمة — الأندية بترد خلال أيام داخل اللعبة، مش فوري."));
  if (representedPlayers.length === 0) {
    // كلاس خاص بوكيل (مش transfer-empty-clients) عشان الحالة الفارغة دي
    // متتكررش مع الحالة الفارغة بتاعة نموذج الانتقال القديم.
    const emptyClients = node("div", "wakil-empty-clients");
    emptyClients.append(
      node("strong", "", "لا توجد صفقات عملاء جاهزة"),
      node("p", "", "لازم يكون اللاعب عميلًا بعقد تمثيل نشط قبل ما تقدر تعرضه على الأندية.")
    );
    roomSection.append(emptyClients);
    roomSection.append(actionButton("إدارة العملاء والعقود", "button-primary", () => context.navigate("agency")));
  } else {
    const form = node("div", "wakil-transfer-room-form");
    const playerSelect = node("select", "search-input");
    playerSelect.setAttribute("aria-label", "العميل المعروض");
    representedPlayers.forEach((player) => {
      const option = node("option", "", player.name + " · " + player.club);
      option.value = player.id;
      playerSelect.append(option);
    });
    const clubSelect = node("select", "search-input");
    clubSelect.multiple = true;
    clubSelect.setAttribute("aria-label", "الأندية المهتمة — اختر حتى 3 أندية");
    clubSelect.size = 4;
    WORLD_DATABASE.clubs.slice(0, 12).forEach((club) => {
      const option = node("option", "", club.nameAr);
      option.value = club.id;
      clubSelect.append(option);
    });
    form.append(
      node("label", "wakil-field-label", "العميل"),
      playerSelect,
      node("label", "wakil-field-label", "الأندية المهتمة (حتى 3)"),
      clubSelect,
      actionButton("اعرض العميل", "button-primary", () => {
        const chosen = [...clubSelect.selectedOptions].map((option) => option.value).slice(0, 3);
        if (chosen.length === 0) { context.toast("اختار نادي واحد على الأقل."); return; }
        const listing = createTransferRoomListing(save, playerSelect.value, chosen);
        const next = [...readTransferRoomListings(save), listing];
        writeTransferRoomListings(next, save);
        context.toast("تم عرض العميل على " + chosen.length + " أندية — الردود هتوصل في البريد.");
        renderRoomList();
      })
    );
    roomSection.append(form);
    const roomList = node("div", "wakil-transfer-room-list");
    roomSection.append(roomList);
    const renderRoomList = () => {
      roomList.replaceChildren();
      const current = readTransferRoomListings(save);
      if (current.length === 0) {
        roomList.append(node("p", "wakil-note", "لسه مفيش عروض معروضة — أول عرض هيظهر هنا."));
        return;
      }
      current.slice(-5).reverse().forEach((listing) => {
        const item = node("article", "wakil-transfer-room-item");
        const player = byId.get(listing.playerId);
        item.append(
          node("strong", "", (player?.name ?? listing.playerId) + " — " + (listing.status === "answered" ? "وصلت الردود" : "بانتظار رد الأندية")),
          node("span", "", "الأندية: " + listing.clubIds.join("، "))
        );
        if (listing.status !== "answered") {
          item.append(actionButton("شوف ردود الأندية", "button-outline", () => {
            const responses = resolveTransferRoomResponses(listing, context.players ?? []);
            const updated = readTransferRoomListings(save).map((entry) =>
              entry.id === listing.id ? { ...entry, status: "answered", responses } : entry);
            writeTransferRoomListings(updated, save);
            renderRoomList();
          }));
        } else {
          (listing.responses ?? []).forEach((response) => {
            item.append(node("p", "", (response.interested ? "✓ " : "✗ ") + response.clubName + " — " + response.note));
          });
        }
        roomList.append(item);
      });
    };
    renderRoomList();
  }
  page.append(roomSection);
  return page;
}

// ---------------------------------------------------------------------------
// 2.4 شاشة المفاوضات — 3 عناصر على جولات (مودال فوق السوق/ملف اللاعب).
// تُرسل شروط الرد للمحرك الحالي كما هي (submitTransferCounterOffer) —
// لا منطق تفاوض جديد في المحرك، والمودال طبقة توجيه وعرض فقط.
// ---------------------------------------------------------------------------

export function openWakilNegotiation(context, offer) {
  const player = (context.players ?? []).find((item) => item.id === offer.playerId);
  let neg = createNegotiation(offer, player ?? {});
  const isLoan = neg.type === "loan";
  const isCountered = offer.status === "countered";

  const refresh = () => {
    riskArea.replaceChildren();
    const risk = getCollapseRisk(neg);
    const riskBar = node("div", "wakil-risk-block tone-" + risk.level);
    riskBar.append(
      node("strong", "", "خطر انهيار الصفقة: " + risk.levelLabel + " (" + risk.score + "/100)"),
      meterBar(risk.score, risk.level === "high" ? "danger" : risk.level === "medium" ? "warning" : "success")
    );
    if (risk.reasons.length > 0) {
      riskBar.append(node("p", "", risk.reasons.join(" · ")));
    } else {
      riskBar.append(node("p", "", "شروطك قريبة من موقف النادي — الصفقة في أمان نسبيًا."));
    }
    riskArea.append(riskBar);
  };

  const content = node("div", "wakil-negotiation");
  const head = node("div", "wakil-negotiation-head");
  head.append(
    node("h3", "", neg.playerName + " ← " + neg.clubName),
    node("span", "", (isLoan ? "إعارة" : "انتقال نهائي") + " · الجولة " + neg.round + " من " + neg.maxRounds +
      (neg.expiresDate ? " · ينتهي " + formatHomeDate(neg.expiresDate) : ""))
  );
  content.append(head);

  // العنصر 1: دور وقت اللعب (3 شرائح).
  const roleRow = node("div", "wakil-negotiation-row");
  roleRow.append(node("strong", "", "دور وقت اللعب"));
  const roleGroup = node("div", "wakil-segmented");
  NEGOTIATION_ROLES.forEach((role) => {
    const button = actionButton(role, "wakil-segment" + (neg.role === role ? " is-active" : ""), () => {
      neg = { ...neg, role };
      roleGroup.querySelectorAll(".wakil-segment").forEach((item) => item.classList.toggle("is-active", item.textContent === role));
      refresh();
    });
    button.setAttribute("aria-label", "دور وقت اللعب: " + role);
    roleGroup.append(button);
  });
  roleRow.append(roleGroup);
  content.append(roleRow);

  // العنصر 2: مدة العقد (شرائح 1–5 مواسم / للإعارة 6–24 شهرًا).
  const yearsRow = node("div", "wakil-negotiation-row");
  yearsRow.append(node("strong", "", isLoan ? "مدة الإعارة" : "مدة العقد"));
  const yearsGroup = node("div", "wakil-segmented");
  (isLoan ? [1, 2, 3, 4] : [1, 2, 3, 4, 5]).forEach((years) => {
    const label = isLoan ? (years * 6) + " شهر" : years + " سنة";
    const button = actionButton(label, "wakil-segment" + (neg.contractYears === years ? " is-active" : ""), () => {
      neg = { ...neg, contractYears: years };
      yearsGroup.querySelectorAll(".wakil-segment").forEach((item) => item.classList.toggle("is-active", item.textContent === label));
      refresh();
    });
    button.setAttribute("aria-label", "مدة العقد: " + label);
    yearsGroup.append(button);
  });
  yearsRow.append(yearsGroup);
  content.append(yearsRow);

  // العنصر 3: الراتب الأسبوعي (Slider + رقم) + قيمة الانتقال.
  const wageRow = node("div", "wakil-negotiation-row");
  wageRow.append(node("strong", "", "الراتب الأسبوعي"));
  const wageInput = node("input", "wakil-range");
  wageInput.type = "range";
  wageInput.min = "0";
  wageInput.max = String(Math.max(10000, neg.clubWageEur * 2));
  wageInput.step = "100";
  wageInput.value = String(neg.weeklyWageEur);
  wageInput.setAttribute("aria-label", "الراتب الأسبوعي باليورو");
  const wageValue = node("strong", "wakil-range-value", formatEuroMoney(neg.weeklyWageEur));
  wageInput.addEventListener("input", () => {
    neg = { ...neg, weeklyWageEur: Number(wageInput.value) };
    wageValue.textContent = formatEuroMoney(neg.weeklyWageEur);
    refresh();
  });
  wageRow.append(wageInput, wageValue);
  content.append(wageRow);

  const feeRow = node("div", "wakil-negotiation-row");
  feeRow.append(node("strong", "", isLoan ? "رسوم الإعارة" : "قيمة الانتقال"));
  const feeInput = node("input", "search-input wakil-fee-input");
  feeInput.type = "number";
  feeInput.min = "0";
  feeInput.step = "1000";
  feeInput.value = String(neg.feeEur);
  feeInput.setAttribute("aria-label", isLoan ? "رسوم الإعارة باليورو" : "قيمة الانتقال باليورو");
  feeInput.addEventListener("input", () => {
    neg = { ...neg, feeEur: Math.max(0, Number(feeInput.value) || 0) };
    refresh();
  });
  feeRow.append(feeInput);
  content.append(feeRow);

  // بنود إضافية: بند بيع مستقبلي + وسيط.
  const extras = node("div", "wakil-negotiation-extras");
  const sellOnLabel = node("label", "wakil-field-label", "بند بيع مستقبلي (Sell-on): " + neg.sellOnPct + "%");
  const sellOnInput = node("input", "wakil-range");
  sellOnInput.type = "range";
  sellOnInput.min = "0";
  sellOnInput.max = "25";
  sellOnInput.step = "5";
  sellOnInput.value = String(neg.sellOnPct);
  sellOnInput.setAttribute("aria-label", "بند البيع المستقبلي بالنسبة المئوية");
  sellOnInput.addEventListener("input", () => {
    neg = { ...neg, sellOnPct: Number(sellOnInput.value) };
    sellOnLabel.textContent = "بند بيع مستقبلي (Sell-on): " + neg.sellOnPct + "%";
    refresh();
  });
  const intermediaryLabel = node("label", "wakil-checkbox-label");
  const intermediaryInput = node("input", "");
  intermediaryInput.type = "checkbox";
  intermediaryInput.addEventListener("change", () => {
    neg = { ...neg, useIntermediary: intermediaryInput.checked };
    refresh();
  });
  intermediaryLabel.append(intermediaryInput, node("span", "", "استعن بوسيط — حتى 10% من الصفقة (بيخفف خطر الانهيار)"));
  extras.append(sellOnLabel, sellOnInput, intermediaryLabel);
  content.append(extras);

  // مؤشر الخطر + سجل الجولات.
  const riskArea = node("div", "wakil-risk-area");
  content.append(riskArea);
  const logList = node("div", "wakil-negotiation-log");
  neg.log.forEach((entry) => {
    logList.append(node("p", "", "الجولة " + entry.round + ": " + entry.text));
  });
  content.append(node("strong", "", "سجل الجولات"), logList);
  content.append(node("p", "wakil-note", "لو عارضت، النادي ممكن يقبل أو يعارض أو يمشي — والجولة بتزيد. بعد الجولة الرابعة مفيش جولات إضافية."));
  refresh();

  const actions = node("div", "wakil-negotiation-actions");
  // ملاحظة: أكشنات المحرك (قبول/رد/رفض) تعيد رسم الصفحة كاملة، فالمودال
  // بيتقفل تلقائيًا مع إعادة الرسم — مفيش حاجة اسمها إغلاق يدوي هنا.
  if (isCountered) {
    actions.append(actionButton("اقبل شروط النادي", "button-primary", () => {
      context.acceptTransferCounterOffer(offer.id);
    }));
  } else {
    actions.append(actionButton("محاكاة رد النادي", "button-primary", () => {
      context.evaluateTransferOffer(offer.id);
    }));
  }
  const counterButton = actionButton("عارض بشروطي", "button-outline", () => {
    // المحرك يقبل الرد المضاد فقط على عرض مضاد مفتوح (status = countered).
    if (offer.status !== "countered") {
      context.toast("استنى رد النادي الأول — دوس «محاكاة رد النادي» وبعدها عارض بشروطك.");
      return;
    }
    if (neg.round >= WAKIL_NEGOTIATION_MAX_ROUNDS) {
      context.toast("ده آخر عرض من النادي في الجولة الرابعة؛ تقدر تقبله أو ترفضه، لكن لا توجد جولة تفاوض إضافية.");
      return;
    }
    neg = applyNegotiationCounter(neg, {
      role: neg.role,
      contractYears: neg.contractYears,
      weeklyWageEur: neg.weeklyWageEur,
      feeEur: neg.feeEur,
      sellOnPct: neg.sellOnPct,
      useIntermediary: neg.useIntermediary
    });
    context.submitTransferCounterOffer(offer.id, buildCounterTerms(neg));
  });
  const walkButton = actionButton("امشي من المفاوضات", "button-outline wakil-danger-button", () => {
    if (walkButton.dataset.confirm !== "1") {
      walkButton.dataset.confirm = "1";
      walkButton.textContent = "تأكيد الانسحاب؟ اضغط تاني";
      return;
    }
    context.rejectTransferOffer(offer.id);
  });
  actions.append(counterButton, walkButton);
  content.append(actions);

  context.openModal("المفاوضات — " + neg.playerName, [content], "إغلاق");
}

// ---------------------------------------------------------------------------
// 2.5 التقويم / المواسم.
// ---------------------------------------------------------------------------

export function renderWakilCalendar(context) {
  const data = getCalendarData(context.save ?? {}, context.players ?? {});
  const page = node("div", "page-content rebuild-screen wakil-calendar");
  page.append(
    node("p", "eyebrow rebuild-page-kicker", "الزمن في اللعبة"),
    node("h1", "page-title rebuild-page-title", "التقويم والمواسم"),
    node("p", "page-subtitle rebuild-page-subtitle", "الموسم رايح على فين، وإمتى فترات الانتقالات، وعقود مين بتخلص إمتى.")
  );

  const seasonSection = node("section", "wakil-season-bar");
  seasonSection.append(
    node("strong", "", "الموسم " + data.season + " — الأسبوع " + data.week + " من 52"),
    meterBar(data.seasonProgressPct),
    node("span", "", "التاريخ داخل اللعبة: " + formatHomeDate(data.currentDate) +
      (data.transferWindow.activeCount > 0
        ? " · فترة الانتقالات مفتوحة في " + data.transferWindow.activeCount + " أندية"
        : data.transferWindow.nextWindow
          ? " · أقرب نافذة: " + formatHomeDate(data.transferWindow.nextWindow.startDate)
          : ""))
  );
  seasonSection.append(actionButton("قدّم أسبوع", "button-primary", context.advanceWeek));
  page.append(seasonSection);

  const upcomingSection = node("section", "wakil-upcoming");
  upcomingSection.append(sectionHeading("اللي جاي", "مرتبة زمنيًا — أول حدث الأول"));
  if (data.upcoming.length === 0) {
    upcomingSection.append(node("p", "wakil-note", "الموسم لسه بيبدأ — الأحداث هتظهر هنا."));
  } else {
    const list = node("div", "wakil-upcoming-list");
    data.upcoming.forEach((event) => {
      const row = node("article", "wakil-upcoming-row");
      row.append(
        node("strong", "", event.title),
        node("span", "", event.description ?? ""),
        node("small", "", formatHomeDate(event.date) + " · بعد " + event.daysUntil + " يوم")
      );
      list.append(row);
    });
    upcomingSection.append(list);
  }
  page.append(upcomingSection);

  const contractsSection = node("section", "wakil-contracts-planner");
  contractsSection.append(sectionHeading("مخطط العقود", "عملاؤك مرتبين حسب تاريخ انتهاء عقد التمثيل — الأقرب الأول"));
  if (data.contractsExpiring.length === 0) {
    contractsSection.append(node("p", "wakil-note", "مفيش عقود تمثيل نشطة — وقّع مع أول عميل من السوق أو الكشافة."));
  } else {
    const list = node("div", "wakil-contracts-list");
    data.contractsExpiring.slice(0, 10).forEach((contract) => {
      const row = node("article", "wakil-contract-row" + (contract.urgency === "high" ? " is-urgent" : ""));
      row.append(
        node("strong", "", contract.playerName),
        node("span", "", contract.expiry ? "ينتهي " + formatHomeDate(contract.expiry) : "بلا تاريخ انتهاء"),
        node("small", "", contract.days !== null
          ? contract.days <= 0 ? "انتهى — جدّد فورًا" : "متبقي " + contract.days + " يوم"
          : ""),
        contract.urgency === "high"
          ? statusChip("عاجل", "danger")
          : contract.urgency === "medium" ? statusChip("قريب", "warning") : statusChip("مستقر", "success")
      );
      row.append(actionButton("ابدأ التفاوض على التجديد", "button-outline", () => context.navigate("agency")));
      list.append(row);
    });
    contractsSection.append(list);
  }
  page.append(contractsSection);

  // — سنة في مراجعة — (المرحلة 3) —
  const review = getSeasonReview(context.save ?? {}, context.players ?? []);
  const reviewSection = node("section", "wakil-season-review");
  reviewSection.append(sectionHeading("سنة في مراجعة", "ملخص الموسم اللي فات — أبطال، أهداف، وأفضل عميل"));
  if (!review.hasLastSeason) {
    reviewSection.append(node("p", "wakil-note", "لسه الموسم الأول مخلصش — المراجعة هتظهر هنا مع نهاية أول موسم."));
  } else {
    if (review.archives.length === 0) {
      reviewSection.append(node("p", "wakil-note", "الموسم " + review.season + " خلص، بس لسه مفيش أرشيف بطولات مسجل له."));
    } else {
      const list = node("div", "wakil-review-list");
      review.archives.forEach((archive) => {
        list.append(node("p", "", "الموسم " + archive.season + " — " + archive.competitionName + ": البطل " + archive.champion));
      });
      reviewSection.append(list);
    }
    reviewSection.append(node("p", "", "Star Plan لكل العملاء: " + review.goalsDone + " من " + review.goalsTotal + " أهداف مكتملة."));
    if (review.bestClientName) {
      reviewSection.append(node("p", "", "أفضل عميل في الموسم: " + review.bestClientName + "."));
    }
    if (review.finance) {
      reviewSection.append(node("p", "wakil-note", "عمولات مستحقة (تراكمي من الدفتر، مش موسمي): " + formatEuroMoney(review.finance.commissionReceivableEur) + " · " + review.finance.commissionEntryCount + " قيد عمولة."));
    }
  }
  page.append(reviewSection);

  const archiveSection = node("section", "wakil-archive");
  archiveSection.append(sectionHeading("أرشيف المواسم", "المواسم اللي فاتت"));
  if (data.archives.length === 0) {
    archiveSection.append(node("p", "wakil-note", "لسه مفيش مواسم مكتملة في الأرشيف — أول موسم هيتسجل هنا."));
  } else {
    const list = node("div", "wakil-archive-list");
    data.archives.forEach((archive) => {
      list.append(node("p", "", "الموسم " + archive.season + " — " + archive.competitionName + ": البطل " + archive.champion));
    });
    archiveSection.append(list);
  }
  page.append(archiveSection);
  return page;
}

// ---------------------------------------------------------------------------
// 2.6 شاشة الوكالة — تبويبات وكيل فوق صفحة الوكالة الحالية:
// المالية | الموظفون (بأثر ميكانيكي مكتوب) | المكتب والرخص.
// تُدرج في أعلى renderAgency في app.js خلف الـ Flag، وباقي الصفحة كما هي.
// ---------------------------------------------------------------------------

export function renderWakilAgencyTabs(context) {
  const save = context.save ?? {};
  const section = node("section", "wakil-agency-tabs");
  section.append(sectionHeading("وكالتك بتكبر", "فلوسك، وفريقك، ومكتبك — في 3 تبويبات"));

  const tabBar = node("div", "wakil-tab-bar");
  const panels = {};
  const switchTab = (id, button) => {
    tabBar.querySelectorAll(".wakil-tab-button").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    Object.values(panels).forEach((panel) => { panel.hidden = true; });
    panels[id].hidden = false;
  };
  const tabDefs = [["finance", "المالية"], ["staff", "الموظفون"], ["office", "المكتب والرخص"], ["board", "مسيرة العملاء"]];
  tabDefs.forEach(([id, label], index) => {
    const button = actionButton(label, "wakil-tab-button" + (index === 0 ? " is-active" : ""), () => switchTab(id, button));
    button.setAttribute("aria-label", "تبويب الوكالة: " + label);
    tabBar.append(button);
  });
  section.append(tabBar);

  // — المالية —
  const financePanel = node("div", "wakil-tab-panel");
  const mgmt = getAgencyManagementSummary(save);
  const finance = getWeekFinance(save);
  const balance = asNumber(save.agency?.balance, 0);
  const weeklyBurn = asNumber(mgmt.totalOperatingCommitmentEgp, 0);
  const weeksToBankruptcy = weeklyBurn > 0 ? Math.floor(balance / weeklyBurn) : null;
  const financeGrid = node("div", "wakil-finance-grid");
  [
    ["الرصيد", formatMoney(balance), "دخل"],
    ["صافي التشغيل الأسبوعي", formatMoney(finance.netEgp), finance.netEgp >= 0 ? "دخل" : "مصروف"],
    ["التزامات أسبوعية", formatMoney(weeklyBurn), "مصروف"],
    ["عمولات مستحقة (يورو)", formatEuroMoney(finance.commissionReceivableEur), "دخل"]
  ].forEach(([label, value, tone]) => {
    const card = node("div", "wakil-finance-card");
    card.append(node("span", "", label), node("strong", "", value), node("small", "", tone));
    financeGrid.append(card);
  });
  financePanel.append(financeGrid);
  if (weeksToBankruptcy !== null && weeksToBankruptcy <= 4) {
    financePanel.append(node("p", "wakil-alert", "⚠ لو فضلت بالمعدل ده، هتفلس خلال " + weeksToBankruptcy + " أسابيع — الإفلاس نهاية محتملة، مش مفاجأة. قلل المصروف أو زود الدخل دلوقتي."));
  }
  financePanel.append(node("p", "wakil-note", "الدفتر المالي الكامل (كل المعاملات) موجود في صفحة الوكالة تحت — ده الملخص السريع بس."));
  panels.finance = financePanel;

  // — الموظفون —
  const staffPanel = node("div", "wakil-tab-panel");
  staffPanel.hidden = true;
  const effects = getStaffEffects(save);
  const staff = (save.agency?.management?.staff ?? []).filter((item) => item.status === "active");
  if (staff.length === 0) {
    staffPanel.append(node("p", "wakil-note", "إنت لوحدك دلوقتي — أول موظف هيفرق معاك."));
  } else {
    const list = node("div", "wakil-staff-list");
    staff.forEach((employee) => {
      const row = node("article", "wakil-staff-row");
      row.append(
        node("strong", "", employee.name ?? employee.roleId),
        node("span", "", effects[employee.roleId] ?? "موظف وكالة"),
        node("small", "", "راتب أسبوعي " + formatMoney(employee.weeklySalaryEgp))
      );
      row.append(actionButton("إنهاء التعاقد", "button-outline", () => context.dismissAgencyEmployee(employee.id)));
      list.append(row);
    });
    staffPanel.append(list);
  }
  const candidates = node("div", "wakil-candidates");
  candidates.append(node("strong", "", "وظّف جديد — كل دور بأثره الميكانيكي:"));
  AGENCY_JOB_ROLES.forEach((role) => {
    const card = node("article", "wakil-candidate-card");
    card.append(
      node("strong", "", role.name),
      node("span", "", role.description),
      node("span", "", effects[role.id] ?? ""),
      node("small", "", "تكلفة التعيين " + formatMoney(role.hiringCostEgp) + " · راتب أسبوعي " + formatMoney(role.weeklySalaryEgp))
    );
    card.append(actionButton("وظّف", "button-primary", () => context.hireAgencyEmployee(role.id)));
    candidates.append(card);
  });
  staffPanel.append(candidates);
  panels.staff = staffPanel;

  // — المكتب والرخص —
  const officePanel = node("div", "wakil-tab-panel");
  officePanel.hidden = true;
  const level = getAgencyLevel(save);
  const levelBlock = node("div", "wakil-level-block");
  levelBlock.append(
    node("strong", "", "مستوى الوكالة: " + level.title + " (المستوى " + level.level + " من 6)"),
    node("span", "", "عملاؤك " + level.clients + " من " + level.clientCap + " — السقف مرتبط بحجم المكتب"),
    meterBar(level.progressPct),
    node("small", "", level.nextLevel
      ? "للمستوى الجاي (" + level.nextLevel.title + "): " + level.nextLevel.requirement
      : "وصلت أعلى مستوى — أسطورية")
  );
  officePanel.append(levelBlock);
  const branches = node("div", "wakil-branches");
  branches.append(node("strong", "", "الفروع والرخص:"));
  AGENCY_BRANCH_LOCATIONS.forEach((location) => {
    const active = (save.agency?.management?.branches ?? []).some((branch) => branch.locationId === location.id && branch.status === "active");
    const card = node("article", "wakil-branch-card");
    card.append(
      node("strong", "", location.name + " — " + location.region),
      node("span", "", active ? "فرع مفتوح" : "تكلفة الافتتاح " + formatMoney(location.setupCostEgp) + " · إيجار أسبوعي " + formatMoney(location.weeklyRentEgp))
    );
    if (!active) card.append(actionButton("افتتح الفرع", "button-outline", () => context.openAgencyBranch(location.id)));
    branches.append(card);
  });
  officePanel.append(branches);
  officePanel.append(node("p", "wakil-note", "شجرة مهارات الوكيل (التفاوض / الكشافة / العلاقات) — نقاطها بتيجي من الإنجازات، ومؤجلة لمرحلة لاحقة بعد المرحلة 3."));
  panels.office = officePanel;

  // — لوحة مسيرة العملاء — (المرحلة 3) —
  const boardPanel = node("div", "wakil-tab-panel");
  boardPanel.hidden = true;
  const board = getCareerBoard(save, context.players ?? []);
  if (board.length === 0) {
    boardPanel.append(node("p", "wakil-note", "لسه مفيش عملاء — وقّع مع أول عميل من السوق أو الكشافة، ومسيرته هتظهر هنا."));
  } else {
    const list = node("div", "wakil-board-list");
    board.forEach((entry) => {
      const row = node("article", "wakil-board-row");
      row.append(
        node("strong", "", entry.name + " — " + entry.club),
        node("span", "", "التقييم " + entry.rating + " · الإمكانات " + entry.potential + " · العمر " + entry.age),
        node("span", "", "Star Plan: " + entry.starPlanDone + " من " + entry.starPlanTotal + " أهداف · الثقة " + entry.trust + "/100 · خطر المغادرة " + entry.departureRisk),
        node("small", "", entry.contractDaysLeft !== null
          ? (entry.contractDaysLeft <= 0 ? "عقد التمثيل انتهى — جدّد فورًا" : "عقد التمثيل ينتهي خلال " + entry.contractDaysLeft + " يوم")
          : "بلا عقد تمثيل نشط")
      );
      row.append(actionButton("افتح ملف اللاعب", "button-outline", () => context.openPlayer(entry.playerId)));
      list.append(row);
    });
    boardPanel.append(list);
  }
  panels.board = boardPanel;

  section.append(financePanel, staffPanel, officePanel, boardPanel);
  return section;
}
