const AWARD_PROFILE = Object.freeze({
  bestPlayer: Object.freeze({ label: "أفضل لاعب", localPoints: 7, internationalPoints: 10 }),
  topScorer: Object.freeze({ label: "هداف البطولة", localPoints: 6, internationalPoints: 8 }),
  topAssists: Object.freeze({ label: "الأكثر صناعة", localPoints: 4, internationalPoints: 6 })
});

const MEDIA_TIERS = Object.freeze([
  Object.freeze({ min: 80, key: "star", label: "نجم إعلامي" }),
  Object.freeze({ min: 60, key: "prominent", label: "بارز" }),
  Object.freeze({ min: 40, key: "rising", label: "صاعد" }),
  Object.freeze({ min: 0, key: "limited", label: "حضور محدود" })
]);

const MAX_HEADLINES = 6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function normaliseHonors(items, source) {
  if (!Array.isArray(items)) return [];
  const unique = new Map();
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        !AWARD_PROFILE[item.awardType] ||
        typeof item.competitionName !== "string" || !item.competitionName.trim() ||
        !Number.isSafeInteger(item.season) || item.season < 1) continue;
    const competitionId = typeof item.competitionId === "string" && item.competitionId
      ? item.competitionId
      : typeof item.tournamentId === "string" && item.tournamentId
        ? item.tournamentId
        : item.competitionName;
    const id = [source, competitionId, item.season, item.awardType].join("|");
    unique.set(id, {
      id,
      source,
      awardType: item.awardType,
      label: AWARD_PROFILE[item.awardType].label,
      competitionName: item.competitionName,
      season: item.season,
      date: typeof item.completedDate === "string" ? item.completedDate : null,
      points: source === "international"
        ? AWARD_PROFILE[item.awardType].internationalPoints
        : AWARD_PROFILE[item.awardType].localPoints
    });
  }
  return [...unique.values()];
}

/**
 * Builds a deterministic media profile from completed achievements and
 * recorded performances. It does not create transfers, offers, or save data.
 */
export function getPlayerMediaProfile(player) {
  const localHonors = normaliseHonors(player?.honors, "local");
  const internationalHonors = normaliseHonors(
    player?.internationalTournamentHonors,
    "international"
  );

  const internationalFriendlyAppearances = positiveInteger(
    player?.internationalFriendlyStats?.appearances
  );
  const tournamentStats = Array.isArray(player?.internationalTournamentStats)
    ? player.internationalTournamentStats
    : [];
  const tournamentById = new Map();
  for (const stat of tournamentStats) {
    if (!stat || typeof stat !== "object" || Array.isArray(stat)) continue;
    const tournamentId = typeof stat.tournamentId === "string" && stat.tournamentId
      ? stat.tournamentId
      : String(stat.tournamentName ?? "");
    const key = tournamentId + "|" + String(stat.season ?? "");
    const appearances = positiveInteger(stat.appearances);
    if (appearances > 0) tournamentById.set(key, appearances);
  }
  const internationalTournamentAppearances = [...tournamentById.values()]
    .reduce((sum, value) => sum + value, 0);
  const internationalAppearances = internationalFriendlyAppearances +
    internationalTournamentAppearances;

  const localAwardPoints = Math.min(24, localHonors.reduce((sum, honor) => sum + honor.points, 0));
  const internationalAwardPoints = Math.min(
    30,
    internationalHonors.reduce((sum, honor) => sum + honor.points, 0)
  );
  const appearancePoints = Math.min(8, Math.floor(internationalAppearances / 3));

  const performance = player?.seasonPerformance ?? {};
  const appearances = positiveInteger(performance.appearances) ||
    positiveInteger(player?.appearances);
  const ratingValue = Number.isFinite(performance.averageMatchRating)
    ? performance.averageMatchRating
    : Number.isFinite(player?.averageMatchRating) ? player.averageMatchRating : null;
  const recentFormRating = ratingValue === null ? null : clamp(ratingValue, 4, 10);
  const formPoints = appearances >= 3 && recentFormRating !== null
    ? recentFormRating >= 8 ? 8 : recentFormRating >= 7.5 ? 5 : recentFormRating >= 7 ? 2 : 0
    : 0;

  const score = clamp(
    20 + localAwardPoints + internationalAwardPoints + appearancePoints + formPoints,
    0,
    100
  );
  const tier = MEDIA_TIERS.find((item) => score >= item.min) ?? MEDIA_TIERS.at(-1);
  const clubInterestBonus = score >= 80 ? 3 : score >= 65 ? 2 : score >= 50 ? 1 : 0;

  const headlines = [
    ...localHonors.map((honor) => ({
      id: honor.id,
      source: honor.source,
      date: honor.date,
      season: honor.season,
      title: "حصل على جائزة " + honor.label + " في " + honor.competitionName
    })),
    ...internationalHonors.map((honor) => ({
      id: honor.id,
      source: honor.source,
      date: honor.date,
      season: honor.season,
      title: "إنجاز دولي: " + honor.label + " في " + honor.competitionName
    }))
  ];

  if (internationalAppearances >= 3) {
    headlines.push({
      id: "international-appearances",
      source: "international-record",
      date: null,
      season: null,
      title: "سجل " + internationalAppearances + " مشاركة دولية"
    });
  }
  if (appearances >= 5 && recentFormRating !== null && recentFormRating >= 7.5) {
    headlines.push({
      id: "season-form",
      source: "club-performance",
      date: null,
      season: Number.isSafeInteger(player?.currentSeason) ? player.currentSeason : null,
      title: "مستوى لافت بمتوسط تقييم " + recentFormRating.toFixed(2) + "/10"
    });
  }

  headlines.sort((left, right) =>
    String(right.date ?? "").localeCompare(String(left.date ?? "")) ||
    (right.season ?? 0) - (left.season ?? 0) ||
    left.id.localeCompare(right.id)
  );

  return {
    score,
    tierKey: tier.key,
    tierLabel: tier.label,
    clubInterestBonus,
    localHonorsCount: localHonors.length,
    internationalHonorsCount: internationalHonors.length,
    internationalAppearances,
    recentFormRating,
    headlines: headlines.slice(0, MAX_HEADLINES)
  };
}
