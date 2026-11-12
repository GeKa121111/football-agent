import { WORLD_DATABASE, getWorldSquadPlayers } from "../data/world-database.js";

export const FREE_AGENT_CLUB_ID = "free-agent";
export const MAX_CLUB_FINANCE_ENTRIES = 5000;

const DEFAULT_RULES = Object.freeze({
  windows: Object.freeze([
    Object.freeze({ type: "winter", start: "01-01", end: "01-31" }),
    Object.freeze({ type: "summer", start: "07-01", end: "08-31" })
  ]),
  maxRegisteredPlayers: 30,
  maxSeniorPlayers: 25,
  u21ExemptionAge: 21,
  maxForeignPlayers: 10,
  maxIncomingLoans: 5,
  maxMidSeasonRegistrations: 10
});

// These are deliberately labeled simulation rules, not live federation regulations.
export const LEAGUE_TRANSFER_RULES = Object.freeze({
  "league-eg-premier": Object.freeze({ ...DEFAULT_RULES, windows: Object.freeze([
    Object.freeze({ type: "winter", start: "01-01", end: "02-01" }),
    Object.freeze({ type: "summer", start: "07-01", end: "09-15" })
  ]), maxForeignPlayers: 5 }),
  "league-ma-botola": Object.freeze({ ...DEFAULT_RULES, windows: Object.freeze([
    Object.freeze({ type: "winter", start: "01-01", end: "02-15" }),
    Object.freeze({ type: "summer", start: "08-01", end: "09-15" })
  ]), maxForeignPlayers: 5 }),
  "league-tn-ligue1": Object.freeze({ ...DEFAULT_RULES, windows: Object.freeze([
    Object.freeze({ type: "winter", start: "01-01", end: "02-15" }),
    Object.freeze({ type: "summer", start: "08-01", end: "09-15" })
  ]), maxForeignPlayers: 5 }),
  "league-eng-premier": DEFAULT_RULES,
  "league-es-laliga": Object.freeze({ ...DEFAULT_RULES, maxForeignPlayers: 3 }),
  "league-de-bundesliga": DEFAULT_RULES,
  "league-fr-ligue1": Object.freeze({ ...DEFAULT_RULES, maxForeignPlayers: 8 }),
  "league-it-seriea": DEFAULT_RULES,
  "league-nl-eredivisie": DEFAULT_RULES,
  "league-pt-primeira": DEFAULT_RULES,
  "league-br-serie-a": Object.freeze({ ...DEFAULT_RULES, windows: Object.freeze([
    Object.freeze({ type: "summer", start: "01-01", end: "02-28" }),
    Object.freeze({ type: "winter", start: "07-01", end: "08-31" })
  ]), maxForeignPlayers: 8 }),
  "league-ar-primera": Object.freeze({ ...DEFAULT_RULES, windows: Object.freeze([
    Object.freeze({ type: "summer", start: "01-01", end: "02-28" }),
    Object.freeze({ type: "winter", start: "07-01", end: "08-31" })
  ]), maxForeignPlayers: 8 })
});

function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateInYear(year, monthDay) {
  const value = year + "-" + monthDay;
  const date = new Date(value + "T00:00:00.000Z");
  if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value) return value;
  const [month] = monthDay.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return year + "-" + monthDay.slice(0, 3) + String(lastDay).padStart(2, "0");
}

function daysBetween(left, right) {
  return Math.round((Date.parse(right + "T00:00:00.000Z") - Date.parse(left + "T00:00:00.000Z")) / 86400000);
}

function getClub(database, clubId) {
  return (database?.clubs ?? []).find((club) => club.id === clubId) ?? null;
}

export function getLeagueTransferRules(leagueId) {
  return LEAGUE_TRANSFER_RULES[leagueId] ?? DEFAULT_RULES;
}

/**
 * Registration rules are explicit simulation presets. They are intentionally
 * not presented as a live copy of any federation's current regulations.
 */
export function getCompetitionRegistrationRules(leagueId, competition = "league") {
  const leagueRules = getLeagueTransferRules(leagueId);
  if (competition === "continental") {
    return {
      ...leagueRules,
      maxRegisteredPlayers: 25,
      maxSeniorPlayers: 25,
      u21ExemptionAge: 21,
      maxForeignPlayers: leagueRules.maxForeignPlayers,
      maxNonAssociationPlayers: 17,
      maxIncomingLoans: 3,
      maxMidSeasonRegistrations: 3,
      competition
    };
  }
  if (competition === "domestic-cup") {
    return {
      ...leagueRules,
      maxRegisteredPlayers: 30,
      maxSeniorPlayers: 25,
      u21ExemptionAge: 21,
      maxIncomingLoans: 5,
      maxMidSeasonRegistrations: 10,
      competition
    };
  }
  return { ...leagueRules, competition: "league" };
}

export function getTransferWindowForClub(currentDate, clubId = null, database = WORLD_DATABASE) {
  if (!isDate(currentDate)) return { active: false, window: null, nextWindow: null, leagueId: null };
  const club = clubId ? getClub(database, clubId) : null;
  const leagueId = club?.leagueId ?? null;
  const rules = getLeagueTransferRules(leagueId);
  const year = Number(currentDate.slice(0, 4));
  const windows = [];
  for (let targetYear = year - 1; targetYear <= year + 1; targetYear += 1) {
    for (const item of rules.windows) {
      const startDate = dateInYear(targetYear, item.start);
      const endDate = dateInYear(targetYear, item.end);
      windows.push({
        id: (leagueId ?? "global") + "-" + targetYear + "-" + item.type,
        leagueId,
        type: item.type,
        startDate,
        endDate
      });
    }
  }
  windows.sort((a, b) => a.startDate.localeCompare(b.startDate));
  const active = windows.find((item) => currentDate >= item.startDate && currentDate <= item.endDate) ?? null;
  const nextWindow = windows.find((item) => item.startDate > currentDate) ?? null;
  return {
    active: Boolean(active),
    leagueId,
    window: active ? { ...active, daysRemaining: daysBetween(currentDate, active.endDate) + 1 } : null,
    nextWindow
  };
}

export function getPlayerCurrentClubIdFromState(playerId, fallbackClubId, transferState, currentDate, database) {
  const freeAgent = (transferState?.freeAgents ?? []).find((item) =>
    item.playerId === playerId && item.sinceDate <= currentDate
  );
  const moves = (transferState?.moves ?? [])
    .filter((move) => move.playerId === playerId && move.effectiveDate <= currentDate &&
      (move.status === "active" || (move.status === "purchased" && currentDate < move.purchasedDate)) &&
      (move.type !== "loan" || !isDate(move.recallReturnDate ?? move.returnDate) ||
        currentDate < (move.recallReturnDate ?? move.returnDate)))
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) ||
      Number(a.id.split("-").pop()) - Number(b.id.split("-").pop()));
  if (freeAgent && !moves.some((move) => move.type === "permanent" && move.effectiveDate >= freeAgent.sinceDate)) return null;
  const player = getWorldSquadPlayers(database).find((item) => item.id === playerId);
  const hasPermanentMove = (transferState?.moves ?? []).some((move) =>
    move.playerId === playerId && move.type === "permanent" && move.effectiveDate <= currentDate
  );
  const hasActiveLoan = moves.some((move) => move.type === "loan");
  if (!freeAgent && !hasPermanentMove && !hasActiveLoan &&
      isDate(player?.contractUntil) && currentDate >= player.contractUntil) return null;
  let clubId = fallbackClubId ?? null;
  for (const move of moves) clubId = move.toClubId;
  return clubId;
}

export function getClubRegistrationStatus(
  clubId, playerId, transferState, currentDate, database = WORLD_DATABASE,
  moveType = "permanent", competition = "league"
) {
  const club = getClub(database, clubId);
  const player = getWorldSquadPlayers(database).find((item) => item.id === playerId);
  if (!club || !player) return { eligible: false, reason: "بيانات النادي أو اللاعب غير موجودة.", total: 0, senior: 0, foreign: 0 };
  const rules = getCompetitionRegistrationRules(club.leagueId, competition);
  const allPlayers = getWorldSquadPlayers(database);
  const roster = allPlayers.filter((item) =>
    getPlayerCurrentClubIdFromState(item.id, item.clubId, transferState, currentDate, database) === clubId && item.id !== playerId
  );
  const currentPlayerClub = getPlayerCurrentClubIdFromState(playerId, player.clubId, transferState, currentDate, database);
  if (currentPlayerClub === clubId) {
    return { eligible: false, reason: "اللاعب مسجل بالفعل في قائمة النادي المستهدف.", total: roster.length + 1,
      senior: roster.filter((item) => Number(item.age ?? 22) >= 21).length + (Number(player.age ?? 22) >= 21 ? 1 : 0),
      foreign: roster.filter((item) => item.countryId && item.countryId !== club.countryId).length +
        (player.countryId && player.countryId !== club.countryId ? 1 : 0), rules };
  }
  const total = roster.length + 1;
  const senior = roster.filter((item) => Number(item.age ?? 22) >= rules.u21ExemptionAge).length +
    (Number(player.age ?? 22) >= rules.u21ExemptionAge ? 1 : 0);
  const foreign = roster.filter((item) => item.countryId && item.countryId !== club.countryId).length +
    (player.countryId && player.countryId !== club.countryId ? 1 : 0);
  const incomingLoans = (transferState?.moves ?? []).filter((move) =>
    move.type === "loan" && move.status === "active" && move.toClubId === clubId &&
    move.playerId !== playerId && currentDate < (move.recallReturnDate ?? move.returnDate)
  ).length + (moveType === "loan" ? 1 : 0);
  const nonAssociation = foreign;
  const year = Number(currentDate.slice(0, 4));
  const seasonStart = currentDate >= year + "-07-01" ? year + "-07-01" : (year - 1) + "-07-01";
  const midSeasonRegistrations = (transferState?.moves ?? []).filter((move) =>
    move.toClubId === clubId && move.playerId !== playerId && move.effectiveDate >= seasonStart &&
    move.effectiveDate <= currentDate &&
    (move.type !== "loan" || (move.status === "active" && currentDate < (move.recallReturnDate ?? move.returnDate)))
  ).length + 1;
  if (total > rules.maxRegisteredPlayers) return { eligible: false, reason: "قائمة النادي وصلت للحد الأقصى للتسجيل (" + rules.maxRegisteredPlayers + " لاعبًا).", total, senior, foreign, rules };
  if (senior > rules.maxSeniorPlayers) return { eligible: false, reason: "تجاوز النادي الحد الأقصى للاعبين فوق " + (rules.u21ExemptionAge - 1) + " سنة (" + rules.maxSeniorPlayers + ").", total, senior, foreign, rules };
  if (foreign > rules.maxForeignPlayers) return { eligible: false, reason: "لا توجد خانة متاحة للاعب أجنبي في قائمة النادي (" + rules.maxForeignPlayers + " كحد أقصى).", total, senior, foreign, rules };
  if (Number.isInteger(rules.maxNonAssociationPlayers) && nonAssociation > rules.maxNonAssociationPlayers)
    return { eligible: false, reason: "قائمة " + (competition === "continental" ? "المسابقة القارية" : "المسابقة") + " لا تسمح بأكثر من " + rules.maxNonAssociationPlayers + " لاعبًا غير محلي.", total, senior, foreign, rules };
  if (incomingLoans > rules.maxIncomingLoans) return { eligible: false, reason: "النادي تجاوز الحد الأقصى للإعارات الواردة (" + rules.maxIncomingLoans + ").", total, senior, foreign, rules };
  if (midSeasonRegistrations > rules.maxMidSeasonRegistrations)
    return { eligible: false, reason: "تم استنفاد عدد التسجيلات المسموح بها خلال الموسم (" + rules.maxMidSeasonRegistrations + ").", total, senior, foreign, rules };
  return { eligible: true, reason: "", total, senior, foreign, incomingLoans, midSeasonRegistrations, competition: rules.competition, rules };
}

function estimateWeeklyWage(player) {
  const rating = Math.max(40, Math.min(99, Number.isFinite(player?.rating) ? player.rating : 55));
  return Math.round(rating * rating * 5);
}

export function getClubTransferFinancials(clubId, transferState, currentDate, database = WORLD_DATABASE) {
  const club = getClub(database, clubId);
  if (!club) return { clubId, budgetEur: 0, wageBudgetWeeklyEur: 0, committedWagesWeeklyEur: 0,
    availableWagesWeeklyEur: 0, valid: false };
  const profile = Math.max(40, Math.min(99, Number.isInteger(club.simulationProfile) ? club.simulationProfile : 60));
  const baseBudgetEur = Math.round(profile * profile * 10000);
  const financeEntries = (transferState?.financeLedger ?? []).filter((entry) => entry.clubId === clubId);
  const seasonEntries = (transferState?.financeSeasons ?? []).filter((entry) => entry.clubId === clubId);
  const seasonBalanceEur = seasonEntries.reduce((sum, entry) => sum + entry.netEur, 0);
  const budgetEur = baseBudgetEur + financeEntries.reduce((sum, entry) => sum + entry.amountEur, 0) + seasonBalanceEur;
  const roster = getWorldSquadPlayers(database).filter((player) =>
    getPlayerCurrentClubIdFromState(player.id, player.clubId, transferState, currentDate, database) === clubId
  );
  const committedWagesWeeklyEur = roster.reduce((sum, player) => {
    const latestMove = (transferState?.moves ?? [])
      .filter((move) => move.playerId === player.id && move.effectiveDate <= currentDate &&
        (move.status === "active" || (move.status === "purchased" && currentDate < move.purchasedDate)) &&
        (move.type !== "loan" || !isDate(move.recallReturnDate ?? move.returnDate) ||
        currentDate < (move.recallReturnDate ?? move.returnDate)))
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) ||
        Number(b.id.split("-").pop()) - Number(a.id.split("-").pop()))[0];
    const wage = latestMove ? latestMove.weeklyWageEur : estimateWeeklyWage(player);
    const paidShare = latestMove?.type === "loan" ? (latestMove.wageSharePercent ?? 100) : 100;
    return sum + Math.round(wage * paidShare / 100);
  }, 0);
  // The roster's estimated payroll is the baseline; the profile-based margin
  // is the additional weekly room available for new contracts.
  const wageBudgetWeeklyEur = committedWagesWeeklyEur + profile * 650;
  return {
    clubId,
    budgetEur,
    wageBudgetWeeklyEur,
    committedWagesWeeklyEur,
    availableWagesWeeklyEur: Math.max(0, wageBudgetWeeklyEur - committedWagesWeeklyEur),
    seasonBalanceEur,
    projectedAnnualRevenueEur: Math.round(profile * profile * 4500),
    projectedAnnualWageCostsEur: committedWagesWeeklyEur * 52,
    projectedAnnualOperatingCostsEur: Math.round(profile * 15000),
    projectedAnnualNetEur: Math.round(profile * profile * 4500) -
      committedWagesWeeklyEur * 52 - Math.round(profile * 15000),
    valid: budgetEur >= 0
  };
}
