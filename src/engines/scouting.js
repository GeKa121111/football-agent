const MISSION_CONFIG = Object.freeze({
  local: Object.freeze({ label: "بعثة محلية", cost: 5000, durationDays: 7, accuracy: 0.62 }),
  regional: Object.freeze({ label: "بعثة إقليمية", cost: 12000, durationDays: 14, accuracy: 0.76 }),
  elite: Object.freeze({ label: "بعثة نخبة", cost: 25000, durationDays: 21, accuracy: 0.88 })
});

const VALID_ROLES = Object.freeze(["all", "هجوم", "وسط", "دفاع", "حراسة"]);
const REPORT_LIMIT = 50;
const FINDING_LIMIT = 6;

export const SCOUTING_MISSION_TYPES = MISSION_CONFIG;

export function createInitialScoutingState() {
  return {
    nextMissionSequence: 1,
    activeMissions: [],
    reports: []
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function matchesMissionScope(player, mission) {
  return (mission.countryId === "all" || player.countryId === mission.countryId) &&
    (mission.role === "all" || player.role === mission.role);
}

function getMissionTargets(players, countryId, role) {
  if (!Array.isArray(players)) return [];
  return players.filter((player) =>
    player && typeof player.id === "string" &&
    (countryId === "all" || player.countryId === countryId) &&
    (role === "all" || player.role === role)
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
  const estimatedRating = clamp(player.rating + ratingError, 1, 99);
  const estimatedPotential = clamp(Math.max(estimatedRating, player.potential + potentialError), estimatedRating, 99);
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
    rationale
  };
}

function createReport(mission, players) {
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
 * Starts a scouting mission after validating its scope, available budget and concurrency.
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
  if (typeof countryId !== "string" || !countryId.trim() ||
      !VALID_ROLES.includes(role)) {
    return { changed: false, save, mission: null, error: "نطاق البحث المحدد غير صالح." };
  }

  const scouting = save.world.scouting ?? createInitialScoutingState();
  if (!Array.isArray(scouting.activeMissions) || !Array.isArray(scouting.reports) ||
      !Number.isSafeInteger(scouting.nextMissionSequence) || scouting.nextMissionSequence < 1) {
    return { changed: false, save, mission: null, error: "سجل الكشافين غير صالح؛ لم يتم تغييره." };
  }
  if (scouting.activeMissions.length >= 3) {
    return { changed: false, save, mission: null, error: "وصلت للحد الأقصى: 3 بعثات نشطة في نفس الوقت." };
  }

  const targets = getMissionTargets(players, countryId, role);
  if (targets.length === 0) {
    return { changed: false, save, mission: null, error: "مفيش لاعبين مطابقين لنطاق البحث ده." };
  }
  if (!Number.isFinite(save.agency.balance) || save.agency.balance < config.cost) {
    return { changed: false, save, mission: null, error: "رصيد الوكالة غير كافٍ للبعثة. اختار مستوى أقل أو زوّد الرصيد." };
  }

  const sequence = scouting.nextMissionSequence;
  const mission = {
    id: "scout-mission-" + sequence,
    reportId: "scout-report-" + sequence,
    type,
    name: config.label,
    countryId,
    role,
    startDate: save.world.currentDate,
    dueDate: addDays(save.world.currentDate, config.durationDays),
    durationDays: config.durationDays,
    cost: config.cost,
    accuracy: config.accuracy,
    targetCount: targets.length
  };

  const nextScouting = {
    nextMissionSequence: sequence + 1,
    activeMissions: [...scouting.activeMissions, mission],
    reports: [...scouting.reports]
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

/**
 * Completes every due mission and stores a deterministic, explainable report.
 * Call after the career calendar has advanced to its new currentDate.
 */
export function advanceScoutingMissions(save, players, currentDate = save?.world?.currentDate) {
  if (!save?.world || !isValidDate(currentDate)) {
    throw new TypeError("تاريخ إكمال بعثات الكشافين غير صالح.");
  }
  const scouting = save.world.scouting ?? createInitialScoutingState();
  if (!Array.isArray(scouting.activeMissions) || !Array.isArray(scouting.reports)) {
    throw new TypeError("سجل بعثات الكشافين غير صالح.");
  }

  const dueMissions = scouting.activeMissions.filter((mission) => mission.dueDate <= currentDate);
  if (dueMissions.length === 0) {
    return { changed: false, save, completedReports: [] };
  }

  const dueIds = new Set(dueMissions.map((mission) => mission.id));
  const completedReports = dueMissions.map((mission) => createReport(mission, players));
  const nextScouting = {
    ...scouting,
    activeMissions: scouting.activeMissions.filter((mission) => !dueIds.has(mission.id)),
    reports: [...completedReports, ...scouting.reports].slice(0, REPORT_LIMIT)
  };

  return {
    changed: true,
    save: { ...save, world: { ...save.world, scouting: nextScouting } },
    completedReports
  };
}

export function getScoutingDaysRemaining(mission, currentDate) {
  if (!mission || !isValidDate(mission.dueDate) || !isValidDate(currentDate)) return null;
  return Math.max(0, dayDifference(currentDate, mission.dueDate));
}
