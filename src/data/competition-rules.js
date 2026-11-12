const DEFAULT_POINTS = Object.freeze({ win: 3, draw: 1, loss: 0 });
const ALLOWED_TIE_BREAKERS = new Set([
  "points",
  "goalDifference",
  "goalsFor",
  "wins",
  "goalsAgainst",
  "clubId"
]);

export const COMPETITION_FORMATS = Object.freeze({
  ROUND_ROBIN: "round-robin",
  GROUP_STAGE: "group-stage",
  KNOCKOUT: "knockout"
});

/**
 * Resolve a competition's format while keeping saves and legacy world data
 * compatible. Existing league definitions remain double round-robin;
 * continental competitions use balanced groups and may qualify the top clubs
 * into a knockout bracket when knockoutAfterGroups is enabled.
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
        : competition.type === "cup"
          ? COMPETITION_FORMATS.KNOCKOUT
          : null
  );

  if (!Object.values(COMPETITION_FORMATS).includes(format)) {
    throw new TypeError("صيغة المسابقة غير مدعومة: " + String(format));
  }

  return {
    format,
    legs: competition.legs ?? (format === COMPETITION_FORMATS.KNOCKOUT ? 1 : 2),
    groupCount: format === COMPETITION_FORMATS.GROUP_STAGE
      ? (competition.groupCount ?? 2)
      : null,
    qualifiersPerGroup: format === COMPETITION_FORMATS.GROUP_STAGE && competition.knockoutAfterGroups === true
      ? (competition.qualifiersPerGroup ?? 2)
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

  if (!["league", "continental", "cup"].includes(competition.type)) {
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
  if (competition.type === "cup" && rules.format !== COMPETITION_FORMATS.KNOCKOUT) {
    errors.push("مسابقة الكأس يجب أن تستخدم نظام خروج المغلوب: " + competition.id);
  }

  const points = rules.points;
  if (![points.win, points.draw, points.loss].every((value) =>
    Number.isSafeInteger(value) && value >= 0
  ) || !(points.win > points.draw && points.draw >= points.loss)) {
    errors.push("نظام نقاط المسابقة غير صالح: " + competition.id);
  }
  if (!Array.isArray(rules.tieBreakers) || rules.tieBreakers.length === 0 ||
      new Set(rules.tieBreakers).size !== rules.tieBreakers.length ||
      !rules.tieBreakers.every((rule) => ALLOWED_TIE_BREAKERS.has(rule))) {
    errors.push("فواصل ترتيب المسابقة غير صالحة أو مكررة: " + competition.id);
  }
  if (rules.format === COMPETITION_FORMATS.ROUND_ROBIN && ![1, 2].includes(rules.legs)) {
    errors.push("عدد مراحل الدوري يجب أن يكون ذهابًا فقط أو ذهابًا وإيابًا: " + competition.id);
  }

  if (rules.format === COMPETITION_FORMATS.KNOCKOUT) {
    const participantCount = competition.clubIds.length;
    if (!Number.isSafeInteger(rules.legs) || rules.legs !== 1) {
      errors.push("مواجهات الكأس يجب أن تكون من مباراة واحدة في هذا الإصدار: " + competition.id);
    }
    if (participantCount < 2 || participantCount > 32 ||
        (participantCount & (participantCount - 1)) !== 0) {
      errors.push("عدد أندية الكأس يجب أن يكون قوة للعدد 2 بين 2 و32: " + competition.id);
    }
    if (competition.countryId !== null || competition.leagueId !== null) {
      errors.push("الكأس المفتوح لا يجب أن يرتبط بدولة أو دوري محلي: " + competition.id);
    }
  }

  if (rules.format === COMPETITION_FORMATS.GROUP_STAGE) {
    if (competition.knockoutAfterGroups !== undefined &&
        typeof competition.knockoutAfterGroups !== "boolean") {
      errors.push("إعداد التأهل الإقصائي يجب أن يكون قيمة منطقية: " + competition.id);
    }
    if (competition.knockoutAfterGroups === true &&
        (rules.groupCount !== 2 || rules.qualifiersPerGroup !== 2)) {
      errors.push("مسار التأهل القاري الحالي يتطلب مجموعتين وتأهل أول وثاني كل مجموعة: " + competition.id);
    }
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
      if (competition.countryId !== league.countryId) {
        errors.push("دولة المسابقة لا تطابق دولة الدوري: " + competition.id);
      }
      for (const clubId of competition.clubIds) {
        const club = clubById.get(clubId);
        if (club && (club.leagueId !== league.id || club.countryId !== league.countryId)) {
          errors.push("نادي مشارك لا ينتمي إلى دوري أو دولة المسابقة: " + competition.id + " / " + clubId);
        }
      }
    }
  } else if (competition.type === "continental") {
    if (competition.countryId !== null || competition.leagueId !== null) {
      errors.push("المسابقة القارية لا يجب أن ترتبط بدولة أو دوري محلي: " + competition.id);
    }
    const countriesById = new Map((database?.countries ?? []).map((country) => [country.id, country]));
    const confederations = new Set(competition.clubIds
      .map((clubId) => countriesById.get(clubById.get(clubId)?.countryId)?.confederation)
      .filter(Boolean));
    if (confederations.size > 1) {
      errors.push("أندية المسابقة القارية يجب أن تنتمي إلى اتحاد قاري واحد: " + competition.id);
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
