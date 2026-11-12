const DEFAULT_POINTS = Object.freeze({ win: 3, draw: 1, loss: 0 });
const ALLOWED_TIE_BREAKERS = new Set([
  "points",
  "goalDifference",
  "goalsFor",
  "clubId"
]);

export const COMPETITION_FORMATS = Object.freeze({
  ROUND_ROBIN: "round-robin",
  GROUP_STAGE: "group-stage"
});

/**
 * Resolve a competition's format while keeping saves and legacy world data
 * compatible. Existing league definitions remain double round-robin; existing
 * continental definitions become a balanced group stage until their knockout
 * phase is introduced by the later tournament-bracket slice.
 */
export function getCompetitionRules(competition) {
  if (!competition || typeof competition !== "object") {
    throw new TypeError("تعريف المسابقة غير صالح.");
  }

  const format = competition.format ?? (
    competition.type === "league"
      ? COMPETITION_FORMATS.ROUND_ROBIN
      : competition.type === "continental"
        ? COMPETITION_FORMATS.GROUP_STAGE
        : null
  );

  if (!Object.values(COMPETITION_FORMATS).includes(format)) {
    throw new TypeError("صيغة المسابقة غير مدعومة: " + String(format));
  }

  return {
    format,
    legs: competition.legs ?? 2,
    groupCount: format === COMPETITION_FORMATS.GROUP_STAGE
      ? (competition.groupCount ?? 2)
      : null,
    points: { ...DEFAULT_POINTS, ...(competition.points ?? {}) },
    tieBreakers: [...(competition.tieBreakers ?? [
      "points", "goalDifference", "goalsFor", "clubId"
    ])]
  };
}

export function validateCompetitionDefinition(competition, database) {
  const errors = [];
  if (!competition || typeof competition !== "object" || Array.isArray(competition)) {
    return { valid: false, errors: ["تعريف المسابقة غير صالح."] };
  }

  if (!["league", "continental"].includes(competition.type)) {
    errors.push("نوع مسابقة غير مدعوم: " + competition.id);
  }

  if (!Array.isArray(competition.clubIds) || competition.clubIds.length < 2) {
    errors.push("المسابقة يجب أن تضم ناديين مشاركين على الأقل: " + competition.id);
    return { valid: false, errors };
  }

  if (new Set(competition.clubIds).size !== competition.clubIds.length) {
    errors.push("يوجد نادٍ مكرر في المسابقة: " + competition.id);
  }

  const clubs = Array.isArray(database?.clubs) ? database.clubs : [];
  const clubById = new Map(clubs.map((club) => [club.id, club]));
  for (const clubId of competition.clubIds) {
    if (typeof clubId !== "string" || !clubById.has(clubId)) {
      errors.push("المسابقة " + competition.id + " تشير إلى نادٍ غير موجود: " + clubId);
    }
  }

  let rules;
  try {
    rules = getCompetitionRules(competition);
  } catch (error) {
    errors.push(error.message);
    return { valid: false, errors };
  }

  if (competition.type === "league" && rules.format !== COMPETITION_FORMATS.ROUND_ROBIN) {
    errors.push("مسابقة الدوري يجب أن تستخدم نظام الدوري ذهابًا وإيابًا: " + competition.id);
  }
  if (competition.type === "continental" && rules.format !== COMPETITION_FORMATS.GROUP_STAGE) {
    errors.push("المسابقة القارية يجب أن تستخدم نظام المجموعات في هذا الإصدار: " + competition.id);
  }

  if (rules.format === COMPETITION_FORMATS.ROUND_ROBIN) {
    if (![1, 2].includes(rules.legs)) {
      errors.push("عدد مراحل الدوري يجب أن يكون ذهابًا فقط أو ذهابًا وإيابًا: " + competition.id);
    }
    const points = rules.points;
    if (![points.win, points.draw, points.loss].every((value) =>
      Number.isSafeInteger(value) && value >= 0
    ) || !(points.win > points.draw && points.draw >= points.loss)) {
      errors.push("نظام نقاط الدوري غير صالح: " + competition.id);
    }
    if (!Array.isArray(rules.tieBreakers) || rules.tieBreakers.length === 0 ||
        new Set(rules.tieBreakers).size !== rules.tieBreakers.length ||
        !rules.tieBreakers.every((rule) => ALLOWED_TIE_BREAKERS.has(rule))) {
      errors.push("فواصل ترتيب الدوري غير صالحة أو مكررة: " + competition.id);
    }
  }

  if (rules.format === COMPETITION_FORMATS.GROUP_STAGE) {
    if (![1, 2].includes(rules.legs)) {
      errors.push("عدد مباريات المجموعة يجب أن يكون ذهابًا فقط أو ذهابًا وإيابًا: " + competition.id);
    }
    if (!Number.isSafeInteger(rules.groupCount) ||
        rules.groupCount < 2 ||
        rules.groupCount > Math.floor(competition.clubIds.length / 2)) {
      errors.push("عدد مجموعات المسابقة القارية لا يضمن ناديين على الأقل في كل مجموعة: " + competition.id);
    }
  }

  if (competition.type === "league") {
    const league = database?.leagues?.find((item) => item.id === competition.leagueId);
    if (!league) {
      errors.push("مسابقة الدوري تشير إلى دوري غير موجود: " + competition.id);
    } else {
      for (const clubId of competition.clubIds) {
        const club = clubById.get(clubId);
        if (club && club.leagueId !== league.id) {
          errors.push("نادي مشارك لا ينتمي إلى دوري المسابقة: " + competition.id + " / " + clubId);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Creates stable, balanced groups by snake-seeding clubs from strongest to
 * weakest. Club IDs break ties, so the same data always yields the same draw.
 */
export function buildCompetitionGroups(competition, database) {
  const rules = getCompetitionRules(competition);
  if (rules.format !== COMPETITION_FORMATS.GROUP_STAGE) return [];

  const clubById = new Map((database?.clubs ?? []).map((club) => [club.id, club]));
  const rankedClubs = competition.clubIds
    .map((id) => clubById.get(id))
    .filter(Boolean)
    .sort((left, right) =>
      (right.simulationProfile ?? 0) - (left.simulationProfile ?? 0) ||
      left.id.localeCompare(right.id)
    );

  const buckets = Array.from({ length: rules.groupCount }, () => []);
  rankedClubs.forEach((club, index) => {
    const round = Math.floor(index / rules.groupCount);
    const slot = index % rules.groupCount;
    const groupIndex = round % 2 === 0 ? slot : rules.groupCount - slot - 1;
    buckets[groupIndex].push(club.id);
  });

  return buckets.map((clubIds, index) => ({
    id: competition.id + "-group-" + (index + 1),
    nameAr: "المجموعة " + (index + 1),
    clubIds: [...clubIds].sort()
  }));
}
