import { getPlayerMediaProfile } from "./player-media.js";

const STRATEGIES = Object.freeze({
  "rival-north-star": Object.freeze({
    key: "attacking-specialist",
    label: "خبير المواهب الهجومية",
    description: "يركّز على المهاجمين وصنّاع اللعب، ويوازن بين المستوى الحالي والتطور.",
    focus: "attack",
    ratingWeight: 0.6,
    potentialWeight: 0.4,
    minimumTargetScore: 61,
    acceptanceThreshold: 135,
    mediaWeight: 0.02,
    formWeight: 0.35
  }),
  "rival-pioneer": Object.freeze({
    key: "youth-investor",
    label: "مستثمر في المواهب الشابة",
    description: "يفضّل اللاعبين الصغار ذوي الإمكانات العالية، خصوصًا المدافعين.",
    focus: "youth-defense",
    ratingWeight: 0.35,
    potentialWeight: 0.65,
    minimumTargetScore: 60,
    acceptanceThreshold: 124,
    mediaWeight: 0.02,
    formWeight: 0.25
  }),
  "rival-atlas": Object.freeze({
    key: "elite-collector",
    label: "صائد النجوم",
    description: "يستهدف النخبة واللاعبين أصحاب الحضور الإعلامي والإنجازات.",
    focus: "elite",
    ratingWeight: 0.75,
    potentialWeight: 0.25,
    minimumTargetScore: 70,
    acceptanceThreshold: 148,
    mediaWeight: 0.08,
    formWeight: 0.2
  })
});

const FALLBACK_STRATEGY = Object.freeze({
  key: "balanced",
  label: "وكالة متوازنة",
  description: "تبحث عن أفضل فرصة متاحة وفق المستوى والإمكانات.",
  focus: "balanced",
  ratingWeight: 0.6,
  potentialWeight: 0.4,
  minimumTargetScore: 61,
  acceptanceThreshold: 140,
  mediaWeight: 0.03,
  formWeight: 0.25
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundScore(value) {
  return Math.round(value * 100) / 100;
}

function positionBonus(player, focus) {
  const position = String(player?.position ?? "").toLocaleLowerCase("en");
  const role = String(player?.role ?? "").toLocaleLowerCase("en");
  const combined = position + " " + role;

  if (focus === "attack") {
    return /(^|\b)(st|cf|fw|lw|rw|am)(\b|$)|مهاجم|هجوم|جناح|صانع لعب/.test(combined) ? 4 : 0;
  }
  if (focus === "youth-defense") {
    return /(^|\b)(cb|lb|rb|def)(\b|$)|مدافع|دفاع|ظهير/.test(combined) ? 5 : 0;
  }
  return 0;
}

function ageBonus(player, focus) {
  const age = Number(player?.age);
  if (!Number.isFinite(age)) return 0;
  if (focus !== "youth-defense") return 0;
  if (age <= 20) return 8;
  if (age <= 23) return 4;
  return 0;
}

function formBonus(player) {
  const performance = player?.seasonPerformance ?? {};
  const appearances = Number(performance.appearances ?? player?.appearances ?? 0);
  const rating = Number(performance.averageMatchRating ?? player?.averageMatchRating);
  if (!Number.isFinite(appearances) || appearances < 3 || !Number.isFinite(rating)) return 0;
  if (rating >= 8) return 4;
  if (rating >= 7.5) return 3;
  if (rating >= 7) return 1.5;
  return 0;
}

export function getRivalAgencyStrategy(agencyOrId) {
  const id = typeof agencyOrId === "string" ? agencyOrId : agencyOrId?.id;
  return STRATEGIES[id] ?? FALLBACK_STRATEGY;
}

/**
 * Scores a target using the rival agency's footballing strategy.
 * The result is deterministic and uses only recorded player attributes.
 */
export function scoreRivalAgencyTarget(agency, player) {
  const strategy = getRivalAgencyStrategy(agency);
  const rating = player?.rating;
  const potential = player?.potential;
  if (!player || !Number.isInteger(rating) || rating < 1 || rating > 99 ||
      !Number.isInteger(potential) || potential < rating || potential > 99) {
    return {
      score: 0,
      eligible: false,
      minimumTargetScore: strategy.minimumTargetScore,
      strategyKey: strategy.key,
      rationale: "بيانات اللاعب غير مكتملة."
    };
  }

  const baseScore = rating * strategy.ratingWeight + potential * strategy.potentialWeight;
  const age = ageBonus(player, strategy.focus);
  const position = positionBonus(player, strategy.focus);
  const form = formBonus(player) * strategy.formWeight;
  const mediaScore = getPlayerMediaProfile(player).score;
  const media = mediaScore * strategy.mediaWeight;
  const eliteBonus = strategy.key === "elite-collector"
    ? rating >= 85 ? 6 : rating >= 80 ? 3 : 0
    : 0;
  const score = roundScore(baseScore + age + position + form + media + eliteBonus);
  const reasons = [];
  if (age > 0) reasons.push("العمر مناسب لاستراتيجية الوكالة");
  if (position > 0) reasons.push("المركز يطابق تخصص الوكالة");
  if (form > 0) reasons.push("الأداء الأخير يدعم التعاقد");
  if (media > 3) reasons.push("الحضور الإعلامي يعزز القيمة");
  if (eliteBonus > 0) reasons.push("التقييم يؤهل اللاعب لفئة النخبة");
  if (reasons.length === 0) reasons.push("التقييم الفني والإمكانات مناسبان");

  return {
    score,
    eligible: score >= strategy.minimumTargetScore,
    minimumTargetScore: strategy.minimumTargetScore,
    strategyKey: strategy.key,
    rationale: reasons.join("، ")
  };
}

export function getRivalAgencyCommissionRate(agency, player) {
  const strategy = getRivalAgencyStrategy(agency);
  const rating = Number(player?.rating ?? 0);
  let commission = rating >= 80 ? 8 : rating >= 72 ? 9 : 10;

  if ((agency?.reputation ?? 0) >= 80) commission -= 1;
  if (strategy.key === "youth-investor" && Number(player?.age) <= 21) commission -= 1;
  if (strategy.key === "elite-collector" && rating >= 85) commission -= 2;
  return clamp(commission, 5, 15);
}

/**
 * Evaluates a pending rival offer. The score and reason are exposed so the
 * simulation can explain why the offer succeeded or failed.
 */
export function evaluateRivalAgencyOffer(agency, offer, options = {}) {
  const strategy = getRivalAgencyStrategy(agency);
  const averageAbility = Math.round((Number(offer?.rating ?? 0) + Number(offer?.potential ?? 0)) / 2);
  const commissionRate = Number(offer?.commissionRate ?? 10);
  const commissionAppeal = clamp(10 - commissionRate, -5, 5);
  const legalProtectionBonus = clamp(Number(options.legalProtectionBonus ?? 0), 0, 10);
  const score = (Number(agency?.reputation) || 0) + averageAbility +
    commissionAppeal - legalProtectionBonus;
  const canAfford = Number(agency?.budgetEgp) >= Number(agency?.acquisitionCostEgp);
  const hasCapacity = Number(agency?.clients?.length ?? 0) < Number(agency?.maxClients ?? 0);

  let reason = null;
  if (options.userHasTakenInterest) reason = "player-protected";
  else if (options.rivalAlreadyRepresents) reason = "already-represented";
  else if (!hasCapacity) reason = "capacity";
  else if (!canAfford) reason = "budget";
  else if (score < strategy.acceptanceThreshold) reason = "below-threshold";

  const notes = {
    "player-protected": "دخلت وكالتك في المنافسة على اللاعب، فتراجعت الوكالة المنافسة.",
    "already-represented": "اللاعب مرتبط بالفعل بوكالة منافسة أخرى.",
    capacity: "وصلت الوكالة إلى الحد الأقصى لعملائها.",
    budget: "ميزانية الوكالة لا تسمح بإتمام التعاقد.",
    "below-threshold": "لم يصل تقييم العرض إلى مستوى قبول الوكالة."
  };

  return {
    accepted: reason === null,
    reason: reason ?? "accepted",
    score,
    threshold: strategy.acceptanceThreshold,
    strategyKey: strategy.key,
    note: reason
      ? notes[reason] + " (التقييم " + score + " من " + strategy.acceptanceThreshold + ")."
      : "قُبل العرض وفق استراتيجية " + strategy.label + " (التقييم " + score + " من " + strategy.acceptanceThreshold + ")."
  };
}

export const RIVAL_AGENCY_STRATEGY_KEYS = Object.freeze(
  Object.values(STRATEGIES).map((strategy) => strategy.key)
);
