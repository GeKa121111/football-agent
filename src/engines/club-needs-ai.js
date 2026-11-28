import { WORLD_DATABASE, getWorldSquadPlayers } from "../data/world-database.js";
import { getPlayerCurrentClubIdFromState } from "./club-transfer-rules.js";

const POSITION_GROUPS = Object.freeze({
  goalkeeper: Object.freeze({ key:"goalkeeper", label:"حراسة المرمى", targetDepth:2 }),
  centreBack: Object.freeze({ key:"centreBack", label:"قلب الدفاع", targetDepth:2 }),
  fullBack: Object.freeze({ key:"fullBack", label:"الأظهرة", targetDepth:4 }),
  defensiveMidfield: Object.freeze({ key:"defensiveMidfield", label:"الوسط الدفاعي", targetDepth:2 }),
  centralMidfield: Object.freeze({ key:"centralMidfield", label:"الوسط المركزي", targetDepth:2 }),
  attackingMidfield: Object.freeze({ key:"attackingMidfield", label:"الوسط الهجومي", targetDepth:2 }),
  winger: Object.freeze({ key:"winger", label:"الأجنحة", targetDepth:2 }),
  striker: Object.freeze({ key:"striker", label:"رأس الحربة", targetDepth:2 }),
  defense: Object.freeze({ key:"defense", label:"الدفاع", targetDepth:6 }),
  midfield: Object.freeze({ key:"midfield", label:"الوسط", targetDepth:6 }),
  attack: Object.freeze({ key:"attack", label:"الهجوم", targetDepth:4 }),
  unknown: Object.freeze({ key:"unknown", label:"مركز غير محدد", targetDepth:1 })
});

function normalise(value) {
  return String(value ?? "").trim().toLocaleLowerCase("en");
}

export function getPlayerPositionGroup(player) {
  const position = normalise(player?.position);
  const role = normalise(player?.role);
  const combined = position + " " + role;

  if (/حارس|حراسة|goalkeeper|\bgk\b/.test(combined)) return POSITION_GROUPS.goalkeeper;
  if (/قلب دفاع|centre.?back|center.?back|\bcb\b/.test(position)) return POSITION_GROUPS.centreBack;
  if (/ظهير|full.?back|wing.?back|\b(lb|rb)\b/.test(position)) return POSITION_GROUPS.fullBack;
  if (/وسط دفاعي|defensive midfield|\bdm\b/.test(position)) return POSITION_GROUPS.defensiveMidfield;
  if (/وسط هجومي|صانع ألعاب|attacking midfield|\bam\b/.test(position)) return POSITION_GROUPS.attackingMidfield;
  if (/وسط مركزي|central midfield|\bcm\b/.test(position)) return POSITION_GROUPS.centralMidfield;
  if (/جناح|winger|\b(lw|rw)\b/.test(position)) return POSITION_GROUPS.winger;
  if (/مهاجم|رأس حربة|striker|\b(st|cf)\b/.test(position)) return POSITION_GROUPS.striker;

  if (/حراسة|goalkeeper/.test(role)) return POSITION_GROUPS.goalkeeper;
  if (/دفاع|defen/.test(role)) return POSITION_GROUPS.defense;
  if (/وسط|mid/.test(role)) return POSITION_GROUPS.midfield;
  if (/هجوم|attack|forward/.test(role)) return POSITION_GROUPS.attack;
  return POSITION_GROUPS.unknown;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getClubRecentForm(clubId, results = []) {
  const recent = results
    .filter((result) => result?.home?.clubId === clubId || result?.away?.clubId === clubId)
    .sort((left, right) => String(right.date ?? "").localeCompare(String(left.date ?? "")) ||
      String(right.id ?? "").localeCompare(String(left.id ?? "")))
    .slice(0, 5);

  let points = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  for (const result of recent) {
    const isHome = result.home?.clubId === clubId;
    const scored = Number(isHome ? result.home?.goals : result.away?.goals);
    const conceded = Number(isHome ? result.away?.goals : result.home?.goals);
    if (!Number.isSafeInteger(scored) || scored < 0 ||
        !Number.isSafeInteger(conceded) || conceded < 0) continue;
    goalsFor += scored;
    goalsAgainst += conceded;
    points += scored > conceded ? 3 : scored === conceded ? 1 : 0;
  }

  return {
    matches: recent.length,
    points,
    pointsAvailable: recent.length * 3,
    goalsFor,
    goalsAgainst,
    label: recent.length === 0 ? "لا توجد نتائج كافية" :
      points >= recent.length * 2 ? "نتائج إيجابية" :
        points <= recent.length ? "نتائج متراجعة" : "مستوى متذبذب"
  };
}

/**
 * Analyses a club's position depth from the current fictional world roster.
 * Transfers and loans are applied using the same effective-date rules as the
 * match engine. Injured players do not count as available cover.
 */
export function getClubNeedSnapshot(clubId, candidate, save, database = WORLD_DATABASE) {
  const club = database.clubs.find((item) => item.id === clubId);
  if (!club) {
    return {
      clubId,
      positionKey: POSITION_GROUPS.unknown.key,
      positionLabel: POSITION_GROUPS.unknown.label,
      level: "normal",
      needScore: 0,
      availableDepth: 0,
      targetDepth: POSITION_GROUPS.unknown.targetDepth,
      injuredDepth: 0,
      averageRating: null,
      recentMatches: 0,
      recentPoints: 0,
      recentPointsAvailable: 0,
      formBonus: 0,
      summary: "النادي غير موجود في قاعدة العالم."
    };
  }

  const targetGroup = getPlayerPositionGroup(candidate);
  const developmentById = new Map((save?.world?.football?.playerDevelopment?.players ?? [])
    .map((item) => [item.playerId, item]));
  const roster = getWorldSquadPlayers(database).filter((player) =>
    getPlayerCurrentClubIdFromState(
      player.id,
      player.clubId,
      save?.world?.transfers,
      save?.world?.currentDate ?? "2026-07-01",
      database
    ) === clubId &&
    getPlayerPositionGroup(player).key === targetGroup.key
  );

  const available = roster.filter((player) =>
    (developmentById.get(player.id)?.injuryDays ?? 0) <= 0
  );
  const injuredDepth = roster.length - available.length;
  const availableDepth = available.length;
  const targetDepth = targetGroup.targetDepth;
  const depthGap = Math.max(0, targetDepth - availableDepth);
  const ratings = available.map((player) =>
    developmentById.get(player.id)?.rating ?? player.rating
  ).filter((rating) => Number.isFinite(rating));
  const averageRating = ratings.length > 0
    ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
    : null;
  const qualityGap = averageRating === null ? 18 : Math.max(0, 70 - averageRating);
  const recentForm = getClubRecentForm(clubId, save?.world?.football?.results ?? []);
  const poorForm = recentForm.matches >= 3 && recentForm.points <= recentForm.matches ? 3 : 0;
  const needScore = clamp(Math.round(
    15 + depthGap * 25 + injuredDepth * 10 + qualityGap * 0.8 + poorForm
  ), 0, 100);
  const level = needScore >= 65 ? "critical" : needScore >= 40 ? "high" : "normal";
  const formBonus = poorForm;
  const reasons = [];
  if (depthGap > 0) reasons.push("نقص التغطية المتاحة في المركز");
  if (injuredDepth > 0) reasons.push("وجود " + injuredDepth + " لاعب مصاب في المركز");
  if (averageRating !== null && averageRating < 65) reasons.push("متوسط جودة المركز منخفض");
  if (poorForm > 0) reasons.push("نتائج النادي الأخيرة متراجعة");
  if (reasons.length === 0) reasons.push("قائمة المركز مستقرة حاليًا");

  return {
    clubId,
    positionKey: targetGroup.key,
    positionLabel: targetGroup.label,
    level,
    needScore,
    availableDepth,
    targetDepth,
    injuredDepth,
    averageRating,
    recentMatches: recentForm.matches,
    recentPoints: recentForm.points,
    recentPointsAvailable: recentForm.pointsAvailable,
    formBonus,
    summary: reasons.join("، ")
  };
}

export function getClubNeedFitBonus(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return 0;
  const needBonus = snapshot.level === "critical" ? 8 :
    snapshot.level === "high" ? 5 : 0;
  return needBonus + clamp(Number(snapshot.formBonus) || 0, 0, 3);
}

export const CLUB_POSITION_NEED_GROUPS = Object.freeze(
  Object.values(POSITION_GROUPS).map((group) => ({ ...group }))
);
