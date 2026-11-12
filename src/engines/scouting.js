import { getAgencyStaffModifiers } from "./agency-management.js";

const MISSION_CONFIG = Object.freeze({
  local: Object.freeze({ label: "بعثة محلية", cost: 5000, durationDays: 7, accuracy: 0.62 }),
  regional: Object.freeze({ label: "بعثة إقليمية", cost: 12000, durationDays: 14, accuracy: 0.76 }),
  elite: Object.freeze({ label: "بعثة نخبة", cost: 25000, durationDays: 21, accuracy: 0.88 })
});

const VALID_ROLES = Object.freeze(["all", "هجوم", "وسط", "دفاع", "حراسة"]);
const REPORT_LIMIT = 50;
const FINDING_LIMIT = 6;
const SCOUT_EXPERIENCE_AWARDS = Object.freeze({ local: 20, regional: 32, elite: 45 });
const SCOUT_LEVEL_THRESHOLDS = Object.freeze([0, 60, 140, 250, 400]);

export const SCOUTING_MISSION_TYPES = MISSION_CONFIG;

export const SCOUTING_SCOUTS = Object.freeze([
  Object.freeze({
    id: "scout-north-africa",
    name: "عمر شريف",
    region: "شمال أفريقيا",
    countryIds: Object.freeze(["country-eg", "country-ma", "country-tn"]),
    roles: Object.freeze(["هجوم", "وسط"]),
    specialty: "المواهب الهجومية في شمال أفريقيا",
    initialExperience: 60,
    startingStaff: true
  }),
  Object.freeze({
    id: "scout-western-europe",
    name: "مارتن فيشر",
    region: "أوروبا الغربية",
    countryIds: Object.freeze(["country-gb", "country-es", "country-de", "country-fr", "country-nl", "country-pt"]),
    roles: Object.freeze(["وسط", "دفاع"]),
    specialty: "لاعبو الوسط والدفاع في أوروبا",
    initialExperience: 140,
    startingStaff: true
  }),
  Object.freeze({
    id: "scout-mediterranean",
    name: "يوسف بن سالم",
    region: "حوض المتوسط",
    countryIds: Object.freeze(["country-tn", "country-it", "country-fr"]),
    roles: Object.freeze(["دفاع", "حراسة"]),
    specialty: "المدافعون وحراس المرمى",
    initialExperience: 30,
    startingStaff: true
  }),
  Object.freeze({
    id: "scout-global-youth",
    name: "دانيال كوستا",
    region: "اكتشاف المواهب",
    countryIds: Object.freeze([]),
    roles: Object.freeze(["all"]),
    specialty: "متابعة المواهب الشابة متعددة المراكز",
    initialExperience: 0,
    startingStaff: true
  }),
  Object.freeze({ id: "scout-iberian-network", name: "رافاييل أورتيغا", region: "إيبيريا", countryIds: Object.freeze(["country-es", "country-pt"]), roles: Object.freeze(["هجوم", "وسط"]), specialty: "المواهب الهجومية وصناع اللعب في إسبانيا والبرتغال", initialExperience: 0, startingStaff: false, contractCost: 18000, renewalCost: 8000, contractDays: 365 }),
  Object.freeze({ id: "scout-central-europe", name: "ماتياس كروغر", region: "أوروبا الوسطى", countryIds: Object.freeze(["country-de", "country-fr", "country-it"]), roles: Object.freeze(["دفاع", "حراسة"]), specialty: "المدافعون وحراس المرمى في أوروبا الوسطى", initialExperience: 0, startingStaff: false, contractCost: 15000, renewalCost: 7000, contractDays: 365 })
]);

export const SCOUTING_SOURCES = Object.freeze([
  Object.freeze({ id: "all", label: "كل المصادر", description: "دمج كل قنوات اكتشاف المواهب المتاحة." }),
  Object.freeze({ id: "academy", label: "أكاديميات الشباب", description: "متابعة ملفات المواهب داخل الأكاديميات." }),
  Object.freeze({ id: "club-network", label: "شبكة الأندية", description: "ترشيحات ومتابعة من شبكات الأندية." }),
  Object.freeze({ id: "youth-tournament", label: "بطولات الشباب", description: "مواهب ظهرت في مسابقات الفئات السنية." }),
  Object.freeze({ id: "agent-referral", label: "ترشيحات الوسطاء", description: "ملفات وصلت عبر شبكة الوسطاء." })
]);
const DISCOVERY_SOURCE_IDS = new Set(SCOUTING_SOURCES.filter((source) => source.id !== "all").map((source) => source.id));
export function getScoutingSourceLabel(sourceId = "all") {
  return SCOUTING_SOURCES.find((source) => source.id === sourceId)?.label ?? "مصدر غير معروف";
}
function getPlayerDiscoverySourceIds(player) {
  const ids = Array.isArray(player?.discoverySourceIds)
    ? player.discoverySourceIds.filter((sourceId) => DISCOVERY_SOURCE_IDS.has(sourceId))
    : [];
  return ids.length > 0 ? [...new Set(ids)] : ["club-network"];
}

function initialScoutProgress() {
  return SCOUTING_SCOUTS.filter((scout) => scout.startingStaff).map((scout) => ({ id: scout.id, experience: scout.initialExperience, missionsCompleted: 0 }));
}

function getProgressRecords(scouting) {
  const hasExplicitRoster = scouting?.scouts !== undefined;
  const saved = Array.isArray(scouting?.scouts) ? scouting.scouts : [];
  return SCOUTING_SCOUTS.flatMap((profile) => {
    const record = saved.find((scout) => scout?.id === profile.id);
    if (record) return [{ ...record, id: profile.id }];
    // Only legacy saves with no roster field receive the original default staff.
    // An explicitly partial roster is invalid and must never regain lost progress silently.
    return profile.startingStaff && !hasExplicitRoster
      ? [{ id: profile.id, experience: profile.initialExperience, missionsCompleted: 0 }]
      : [];
  });
}

function getScoutLevel(experience) {
  let level = 1;
  for (let index = 1; index < SCOUT_LEVEL_THRESHOLDS.length; index += 1) {
    if (experience >= SCOUT_LEVEL_THRESHOLDS[index]) level = index + 1;
  }
  return level;
}

export function createInitialScoutingState() {
  return {
    nextMissionSequence: 1,
    activeMissions: [],
    reports: [],
    observations: [],
    scouts: initialScoutProgress()
  };
}

export function getScoutingRoster(scouting = createInitialScoutingState(), currentDate = null) {
  const progress = getProgressRecords(scouting);
  const missions = Array.isArray(scouting?.activeMissions) ? scouting.activeMissions : [];
  return SCOUTING_SCOUTS.filter((profile) => progress.some((item) => item.id === profile.id)).map((profile) => {
    const record = progress.find((item) => item.id === profile.id);
    const activeMission = missions.find((mission) => mission?.scoutId === profile.id);
    const isContracted = Boolean(record.contractExpiresOn);
    const hasDate = isValidDate(currentDate);
    const daysRemaining = isContracted && hasDate ? Math.max(0, dayDifference(currentDate, record.contractExpiresOn)) : null;
    // The end date is exclusive: the scout becomes unavailable once the full 365-day term has elapsed.
    const expired = isContracted && hasDate && currentDate >= record.contractExpiresOn;
    return { id: profile.id, name: profile.name, region: profile.region, countryIds: [...profile.countryIds], roles: [...profile.roles], specialty: profile.specialty,
      experience: record.experience, level: getScoutLevel(record.experience), missionsCompleted: record.missionsCompleted,
      isBusy: Boolean(activeMission), activeMissionId: activeMission?.id ?? null, isContracted,
      contractStartedOn: record.contractStartedOn ?? null, contractExpiresOn: record.contractExpiresOn ?? null,
      contractDaysRemaining: daysRemaining, isContractExpired: expired,
      canRenewContract: isContracted && hasDate && (expired || daysRemaining <= 30), contractRenewalCost: profile.renewalCost ?? null };
  });
}

export function getScoutingRecruitmentOptions(scouting = createInitialScoutingState()) {
  const hired = new Set(getProgressRecords(scouting).map((record) => record.id));
  return SCOUTING_SCOUTS.filter((profile) => !profile.startingStaff && !hired.has(profile.id)).map((profile) => ({ ...profile, countryIds: [...profile.countryIds], roles: [...profile.roles] }));
}

export function getScoutingScoutFit(scoutId, scouting, countryId = "all", role = "all", baseAccuracy = 0, currentDate = null) {
  if (typeof baseAccuracy !== "number" || !Number.isFinite(baseAccuracy) || baseAccuracy < 0 || baseAccuracy > 1) {
    return null;
  }
  const scout = getScoutingRoster(scouting, currentDate).find((item) => item.id === scoutId);
  if (!scout || scout.isContractExpired) return null;

  const countryMatch = countryId !== "all" &&
    (scout.countryIds.length === 0 || scout.countryIds.includes(countryId));
  const roleMatch = role !== "all" &&
    (scout.roles.includes("all") || scout.roles.includes(role));
  const levelBonus = (scout.level - 1) * 0.0125;
  const countryBonus = countryMatch ? 0.025 : 0;
  const roleBonus = roleMatch ? 0.025 : 0;
  const accuracy = Math.round(Math.min(0.97, baseAccuracy + levelBonus + countryBonus + roleBonus) * 1000) / 1000;

  return {
    ...scout,
    countryMatch,
    roleMatch,
    levelBonus,
    countryBonus,
    roleBonus,
    accuracyBonus: Math.round((accuracy - baseAccuracy) * 1000) / 1000,
    accuracy
  };
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(value, days) {
  const date = new Date(value + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDifference(from, to) {
  return Math.round((Date.parse(to + "T00:00:00.000Z") - Date.parse(from + "T00:00:00.000Z")) / 86400000);
}

function hasValidScoutProgress(scouting) {
  if (scouting?.scouts === undefined) return true;
  if (!Array.isArray(scouting.scouts) || scouting.scouts.length > SCOUTING_SCOUTS.length) return false;
  const ids = scouting.scouts.map((record) => record?.id);
  if (ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) return false;
  const requiredStartingIds = SCOUTING_SCOUTS.filter((scout) => scout.startingStaff).map((scout) => scout.id);
  if (!requiredStartingIds.every((id) => ids.includes(id))) return false;
  return scouting.scouts.every((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) return false;
    const profile = SCOUTING_SCOUTS.find((scout) => scout.id === record.id);
    if (!profile || !Number.isSafeInteger(record.experience) || record.experience < 0 || !Number.isSafeInteger(record.missionsCompleted) || record.missionsCompleted < 0) return false;
    const fields = ["contractStartedOn", "contractExpiresOn", "contractCost", "contractRenewals"];
    if (profile.startingStaff) return fields.every((field) => record[field] === undefined);
    return isValidDate(record.contractStartedOn) && isValidDate(record.contractExpiresOn) && record.contractExpiresOn === addDays(record.contractStartedOn, profile.contractDays) &&
      Number.isSafeInteger(record.contractCost) && [profile.contractCost, profile.renewalCost].includes(record.contractCost) && Number.isSafeInteger(record.contractRenewals) && record.contractRenewals >= 0;
  });
}

export function signScoutingContract(save, scoutId) {
  if (!save?.world || !save?.agency || !isValidDate(save.world.currentDate)) return { changed: false, save, error: "بيانات المسيرة الحالية غير صالحة." };
  const current = save.world.scouting ?? createInitialScoutingState();
  if (!Array.isArray(current.activeMissions) || !Array.isArray(current.reports) || (current.observations !== undefined && !Array.isArray(current.observations)) || !hasValidScoutProgress(current)) return { changed: false, save, error: "سجل الكشافين غير صالح؛ لم يتم تغييره." };
  const profile = SCOUTING_SCOUTS.find((scout) => scout.id === scoutId && !scout.startingStaff);
  if (!profile) return { changed: false, save, error: "الكشاف المحدد غير متاح للتعاقد." };
  const progress = getProgressRecords(current);
  if (progress.some((record) => record.id === scoutId)) return { changed: false, save, error: "الكشاف متعاقد معه بالفعل." };
  if (progress.length >= SCOUTING_SCOUTS.length) return { changed: false, save, error: "وصلت إلى الحد الأقصى لشبكة الكشافين." };
  if (!Number.isFinite(save.agency.balance) || save.agency.balance < profile.contractCost) return { changed: false, save, error: "رصيد الوكالة لا يكفي لتوقيع العقد السنوي." };
  const contractExpiresOn = addDays(save.world.currentDate, profile.contractDays);
  const scouting = { ...current, scouts: [...progress, { id: profile.id, experience: profile.initialExperience, missionsCompleted: 0, contractStartedOn: save.world.currentDate, contractExpiresOn, contractCost: profile.contractCost, contractRenewals: 0 }] };
  return { changed: true, scoutId, fee: profile.contractCost, contractExpiresOn, save: { ...save, agency: { ...save.agency, balance: save.agency.balance - profile.contractCost }, world: { ...save.world, scouting } } };
}

export function renewScoutingContract(save, scoutId) {
  if (!save?.world || !save?.agency || !isValidDate(save.world.currentDate)) return { changed: false, save, error: "بيانات المسيرة الحالية غير صالحة." };
  const current = save.world.scouting ?? createInitialScoutingState();
  if (!Array.isArray(current.activeMissions) || !Array.isArray(current.reports) || (current.observations !== undefined && !Array.isArray(current.observations)) || !hasValidScoutProgress(current)) return { changed: false, save, error: "سجل الكشافين غير صالح؛ لم يتم تغييره." };
  const profile = SCOUTING_SCOUTS.find((scout) => scout.id === scoutId && !scout.startingStaff);
  const progress = getProgressRecords(current);
  const record = progress.find((item) => item.id === scoutId);
  if (!profile || !record?.contractExpiresOn) return { changed: false, save, error: "لا يوجد عقد قابل للتجديد لهذا الكشاف." };
  const remaining = Math.max(0, dayDifference(save.world.currentDate, record.contractExpiresOn));
  if (save.world.currentDate <= record.contractExpiresOn && remaining > 30) return { changed: false, save, error: "يتاح تجديد العقد خلال آخر 30 يومًا فقط." };
  if (!Number.isFinite(save.agency.balance) || save.agency.balance < profile.renewalCost) return { changed: false, save, error: "رصيد الوكالة لا يكفي لتجديد العقد." };
  // Renewals signed before expiry start after the existing paid term, so
  // remaining contract days are never discarded. Late renewals start today.
  const contractStartedOn = save.world.currentDate < record.contractExpiresOn
    ? record.contractExpiresOn
    : save.world.currentDate;
  const contractExpiresOn = addDays(contractStartedOn, profile.contractDays);
  const scouting = { ...current, scouts: progress.map((item) => item.id === scoutId ? { ...item, contractStartedOn, contractExpiresOn, contractCost: profile.renewalCost, contractRenewals: (item.contractRenewals ?? 0) + 1 } : item) };
  return { changed: true, scoutId, fee: profile.renewalCost, contractExpiresOn, save: { ...save, agency: { ...save.agency, balance: save.agency.balance - profile.renewalCost }, world: { ...save.world, scouting } } };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function matchesMissionScope(player, mission) {
  return (mission.countryId === "all" || player.countryId === mission.countryId) &&
    (mission.role === "all" || player.role === mission.role) &&
    (mission.sourceId === undefined || mission.sourceId === "all" || getPlayerDiscoverySourceIds(player).includes(mission.sourceId));
}
export function getScoutingCandidates(players, options = {}) {
  const countryId = options.countryId ?? "all";
  const role = options.role ?? "all";
  const sourceId = options.sourceId ?? "all";
  if (!Array.isArray(players) || (sourceId !== "all" && !DISCOVERY_SOURCE_IDS.has(sourceId))) return [];
  return players.filter((player) =>
    player && typeof player.id === "string" &&
    (countryId === "all" || player.countryId === countryId) &&
    (role === "all" || player.role === role) &&
    (sourceId === "all" || getPlayerDiscoverySourceIds(player).includes(sourceId))
  );
}

function hashUnit(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function deterministicOffset(seed, radius) {
  return Math.round((hashUnit(seed) * 2 - 1) * radius);
}

function scorePlayer(player) {
  const upside = Math.max(0, player.potential - player.rating);
  const youthBonus = clamp(25 - player.age, 0, 10);
  return upside * 1.8 + player.potential * 0.35 + youthBonus;
}

function createFinding(player, mission) {
  const errorRadius = Math.max(1, Math.round((1 - mission.accuracy) * 9));
  const ratingError = deterministicOffset(mission.id + ":" + player.id + ":rating", errorRadius);
  const potentialError = deterministicOffset(mission.id + ":" + player.id + ":potential", errorRadius + 1);
  // Player development stores fractional ratings internally; scouting reports
  // persist integer estimates, so normalize before applying deterministic error.
  const estimatedRating = clamp(Math.round(player.rating) + ratingError, 1, 99);
  const estimatedPotential = clamp(
    Math.max(estimatedRating, Math.round(player.potential) + potentialError),
    estimatedRating,
    99
  );
  const confidence = clamp(
    Math.round(mission.accuracy * 100) + deterministicOffset(mission.id + ":" + player.id + ":confidence", 5),
    40,
    99
  );
  const upside = estimatedPotential - estimatedRating;
  let recommendation = "مراقبة فقط";
  let rationale = "المؤشرات الحالية لا تكفي لترشيح اللاعب كأولوية تعاقد.";
  if (upside >= 15 && confidence >= 68) {
    recommendation = "أولوية";
    rationale = "فجوة التطور المقدرة كبيرة مع مستوى ثقة مناسب في التقرير.";
  } else if (upside >= 9 || estimatedRating >= 78) {
    recommendation = "متابعة";
    rationale = "هناك مؤشر فني واعد، ويستحق اللاعب مشاهدة إضافية قبل أي قرار.";
  }

  return {
    playerId: player.id,
    playerName: player.name,
    age: player.age,
    club: player.club,
    country: player.country,
    position: player.position,
    estimatedRating,
    estimatedPotential,
    confidence,
    upside,
    recommendation,
    rationale,
    discoverySourceIds: getPlayerDiscoverySourceIds(player)
  };
}

function createReport(mission, players) {
  const sourceId = mission.sourceId ?? "all";
  const targets = players
    .filter((player) => matchesMissionScope(player, mission))
    .sort((a, b) => scorePlayer(b) - scorePlayer(a) || a.id.localeCompare(b.id));
  const findings = targets.slice(0, FINDING_LIMIT).map((player) => createFinding(player, mission));
  return {
    id: mission.reportId,
    missionId: mission.id,
    missionType: mission.type,
    missionName: mission.name,
    countryId: mission.countryId,
    role: mission.role,
    sourceId,
    sourceLabel: getScoutingSourceLabel(sourceId),
    scoutId: mission.scoutId,
    scoutName: mission.scoutName,
    scoutLevel: mission.scoutLevel,
    accuracyBonus: mission.scoutAccuracyBonus,
    experienceAwarded: mission.scoutId ? SCOUT_EXPERIENCE_AWARDS[mission.type] : 0,
    startDate: mission.startDate,
    completedDate: mission.dueDate,
    durationDays: mission.durationDays,
    cost: mission.cost,
    accuracy: mission.accuracy,
    candidateCount: targets.length,
    findings
  };
}

/**
 * Starts a scouting mission after validating its scope, budget, scout assignment and concurrency.
 * Returns a new save snapshot; the input save is never mutated.
 */
export function startScoutingMission(save, options, players) {
  if (!save || !save.world || !save.agency || !isValidDate(save.world.currentDate)) {
    return { changed: false, save, mission: null, error: "بيانات المسيرة الحالية غير صالحة." };
  }

  const type = options?.type;
  const config = MISSION_CONFIG[type];
  if (!config) return { changed: false, save, mission: null, error: "اختر مستوى بعثة صحيحًا." };

  const countryId = options?.countryId ?? "all";
  const role = options?.role ?? "all";
  const sourceId = options?.sourceId ?? "all";
  if (typeof countryId !== "string" || !countryId.trim() || !VALID_ROLES.includes(role) ||
      (sourceId !== "all" && !DISCOVERY_SOURCE_IDS.has(sourceId))) {
    return { changed: false, save, mission: null, error: "نطاق البحث أو مصدر المواهب المحدد غير صالح." };
  }

  const currentScouting = save.world.scouting ?? createInitialScoutingState();
  if (!Array.isArray(currentScouting.activeMissions) || !Array.isArray(currentScouting.reports) ||
      (currentScouting.observations !== undefined && !Array.isArray(currentScouting.observations)) ||
      (Array.isArray(currentScouting.observations) && currentScouting.observations.length > 300) ||
      !hasValidScoutProgress(currentScouting) || !Number.isSafeInteger(currentScouting.nextMissionSequence) || currentScouting.nextMissionSequence < 1) {
    return { changed: false, save, mission: null, error: "سجل الكشافين غير صالح؛ لم يتم تغييره." };
  }
  if (currentScouting.activeMissions.length >= 3) {
    return { changed: false, save, mission: null, error: "وصلت للحد الأقصى: 3 بعثات نشطة في نفس الوقت." };
  }

  const scouting = { ...currentScouting, scouts: getProgressRecords(currentScouting) };
  const roster = getScoutingRoster(scouting, save.world.currentDate);
  const requestedScoutId = options?.scoutId;
  const availableScouts = roster.filter((scout) => !scout.isBusy && !scout.isContractExpired);
  const chosenScout = requestedScoutId ? availableScouts.find((scout) => scout.id === requestedScoutId) : availableScouts
    .map((scout) => getScoutingScoutFit(scout.id, scouting, countryId, role, config.accuracy, save.world.currentDate))
    .filter(Boolean).sort((a,b) => b.accuracy-a.accuracy || b.level-a.level || a.id.localeCompare(b.id))[0];
  if (!chosenScout) {
    const requested = roster.find((scout) => scout.id === requestedScoutId);
    return { changed: false, save, mission: null, error: requested?.isContractExpired ? "انتهى عقد الكشاف؛ جدده قبل إسناد بعثة جديدة." : requested?.isBusy ? "الكشاف المختار مرتبط ببعثة نشطة بالفعل." : "اختار كشافًا متاحًا من الشبكة قبل إطلاق البعثة." };
  }
  const fit = getScoutingScoutFit(chosenScout.id, scouting, countryId, role, config.accuracy, save.world.currentDate);
  const targets = getScoutingCandidates(players, { countryId, role, sourceId });
  if (targets.length === 0) {
    return { changed: false, save, mission: null, error: "مفيش لاعبين مطابقين لنطاق البحث ده." };
  }
  if (!Number.isFinite(save.agency.balance) || save.agency.balance < config.cost) {
    return { changed: false, save, mission: null, error: "رصيد الوكالة غير كافٍ للبعثة. اختار مستوى أقل أو زوّد الرصيد." };
  }

  const sequence = scouting.nextMissionSequence;
  const agencyAccuracyBonus = Math.min(
    getAgencyStaffModifiers(save).scoutingAccuracyBonus,
    Math.max(0,0.97-fit.accuracy)
  );
  const mission = {
    id: "scout-mission-" + sequence,
    reportId: "scout-report-" + sequence,
    type,
    name: config.label,
    countryId,
    role,
    sourceId,
    sourceLabel: getScoutingSourceLabel(sourceId),
    scoutId: fit.id,
    scoutName: fit.name,
    scoutLevel: fit.level,
    scoutAccuracyBonus: fit.accuracyBonus,
    agencyAccuracyBonus,
    baseAccuracy: config.accuracy,
    startDate: save.world.currentDate,
    dueDate: addDays(save.world.currentDate, config.durationDays),
    durationDays: config.durationDays,
    cost: config.cost,
    accuracy: fit.accuracy,
    targetCount: targets.length
  };

  const nextScouting = {
    ...scouting,
    nextMissionSequence: sequence + 1,
    activeMissions: [...scouting.activeMissions, mission],
    reports: [...scouting.reports],
    observations: [...(Array.isArray(scouting.observations) ? scouting.observations : [])]
  };
  return {
    changed: true,
    error: null,
    mission,
    save: {
      ...save,
      agency: { ...save.agency, balance: save.agency.balance - config.cost },
      world: { ...save.world, scouting: nextScouting }
    }
  };
}

function createObservation(report, finding) {
  const sequence = Number(report.id.slice("scout-report-".length));
  const sourceIds = report.sourceId && report.sourceId !== "all" ? [report.sourceId] : finding.discoverySourceIds;
  return {
    id: "scout-observation-" + sequence + "-" + finding.playerId,
    playerId: finding.playerId,
    playerName: finding.playerName,
    missionId: report.missionId,
    reportId: report.id,
    observedAt: report.completedDate,
    sourceIds: [...sourceIds],
    ...(report.scoutId ? { scoutId: report.scoutId, scoutName: report.scoutName } : {}),
    estimatedRating: finding.estimatedRating,
    estimatedPotential: finding.estimatedPotential,
    confidence: finding.confidence,
    recommendation: finding.recommendation
  };
}

/**
 * Completes every due mission, generates deterministic reports and rewards the assigned scouts.
 * Call after the career calendar has advanced to its new currentDate.
 */
export function advanceScoutingMissions(save, players, currentDate = save?.world?.currentDate) {
  if (!save?.world || !isValidDate(currentDate)) {
    throw new TypeError("تاريخ إكمال بعثات الكشافين غير صالح.");
  }
  const currentScouting = save.world.scouting ?? createInitialScoutingState();
  if (!Array.isArray(currentScouting.activeMissions) || !Array.isArray(currentScouting.reports) ||
      (currentScouting.observations !== undefined && !Array.isArray(currentScouting.observations)) ||
      (Array.isArray(currentScouting.observations) && currentScouting.observations.length > 300) ||
      !hasValidScoutProgress(currentScouting)) {
    throw new TypeError("سجل بعثات الكشافين غير صالح.");
  }

  const dueMissions = currentScouting.activeMissions.filter((mission) => mission.dueDate <= currentDate);
  if (dueMissions.length === 0) {
    return { changed: false, save, completedReports: [] };
  }

  const dueIds = new Set(dueMissions.map((mission) => mission.id));
  const completedReports = dueMissions.map((mission) => createReport(mission, players));
  const nextActiveMissions = currentScouting.activeMissions.filter((mission) => !dueIds.has(mission.id));
  const progress = new Map(getProgressRecords(currentScouting).map((scout) => [scout.id, scout]));
  for (const report of completedReports) {
    if (!report.scoutId) continue;
    const record = progress.get(report.scoutId);
    if (!record) continue;
    progress.set(report.scoutId, {
      ...record,
      experience: record.experience + report.experienceAwarded,
      missionsCompleted: record.missionsCompleted + 1
    });
  }

  const completedObservations = completedReports.flatMap((report) => report.findings.map((finding) => createObservation(report, finding)));
  const nextScouting = {
    ...currentScouting,
    scouts: [...progress.values()],
    activeMissions: nextActiveMissions,
    reports: [...completedReports, ...currentScouting.reports].slice(0, REPORT_LIMIT),
    observations: [...completedObservations, ...(currentScouting.observations ?? [])].slice(0, 300)
  };

  return {
    changed: true,
    save: { ...save, world: { ...save.world, scouting: nextScouting } },
    completedReports
  };
}

export function getPlayerScoutingHistory(scouting, playerId) {
  if (typeof playerId !== "string" || !playerId.trim()) {
    return { playerId: null, playerName: "", totalObservations: 0, firstObservedAt: null, lastObservedAt: null, observations: [] };
  }
  const observations = (Array.isArray(scouting?.observations) ? scouting.observations : [])
    .filter((observation) => observation?.playerId === playerId)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id));
  const history = observations.map((observation, index) => {
    const previous = observations[index - 1];
    return {
      ...observation,
      sourceLabels: observation.sourceIds.map(getScoutingSourceLabel),
      ratingDelta: previous ? observation.estimatedRating - previous.estimatedRating : null,
      potentialDelta: previous ? observation.estimatedPotential - previous.estimatedPotential : null
    };
  });
  return {
    playerId,
    playerName: history.at(-1)?.playerName ?? history[0]?.playerName ?? "",
    totalObservations: history.length,
    firstObservedAt: history[0]?.observedAt ?? null,
    lastObservedAt: history.at(-1)?.observedAt ?? null,
    observations: history
  };
}

export function getScoutingDaysRemaining(mission, currentDate) {
  if (!mission || !isValidDate(mission.dueDate) || !isValidDate(currentDate)) return null;
  return Math.max(0, dayDifference(currentDate, mission.dueDate));
}
