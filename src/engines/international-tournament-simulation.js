import { WORLD_DATABASE, getWorldSquadPlayers } from "../data/world-database.js";
import { selectNationalTeamSquad } from "./national-teams.js";
import { simulateMatch } from "./match-simulation.js";
import {
  createInternationalTournamentPlan,
  advanceInternationalTournament,
  getInternationalTournamentStandings
} from "./international-tournaments.js";

const MAX_TOURNAMENT_SEASONS = 12;
const MAX_TOURNAMENT_RESULTS = 1200;
const MAX_TOURNAMENT_ARCHIVES = 80;
const MATCH_ROLES = Object.freeze(["حراسة", "دفاع", "وسط", "هجوم"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function roundTo(value, decimals = 2) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function addDays(value, amount) {
  const date = new Date(value + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTournamentSeason(year) {
  return Number.isSafeInteger(year) && year >= 1 &&
    (year % 2 === 1 || year % 4 === 0);
}

function tournamentTypesForSeason(season) {
  return {
    continental: season % 2 === 1,
    worldCup: season % 4 === 0
  };
}

function buildTournamentPlan(season, startDate, database, playerDevelopment) {
  const types = tournamentTypesForSeason(season);
  const fullPlan = createInternationalTournamentPlan({
    season,
    startDate,
    database,
    playerDevelopment
  });
  const tournaments = [
    ...(types.continental ? fullPlan.continental : []),
    ...(types.worldCup ? [fullPlan.worldCup] : [])
  ];
  return {
    season,
    generatedAt: startDate,
    tournaments: tournaments.map((tournament) => ({
      ...tournament,
      results: [],
      playerStats: []
    }))
  };
}

function findCountryTeam(tournament, teamId) {
  return tournament.teams.find((team) => team.id === teamId) ?? null;
}

function createTournamentSide(team, { database, playerDevelopment }) {
  const squad = selectNationalTeamSquad(team.countryId, {
    database,
    playerDevelopment
  });
  const candidates = squad.players
    .filter((player) => player.fitness > 0)
    .sort((left, right) =>
      right.rating - left.rating ||
      right.fitness - left.fitness ||
      compareText(left.playerId, right.playerId)
    );
  const goalkeeper = candidates.find((player) => player.role === "حراسة");
  if (!goalkeeper) throw new RangeError("المنتخب لا يملك حارسًا صالحًا للمباراة الدولية.");

  const selected = [goalkeeper];
  const selectedIds = new Set([goalkeeper.playerId]);
  const addRole = (role, count) => {
    for (const player of candidates) {
      if (count <= 0) break;
      if (player.role !== role || selectedIds.has(player.playerId)) continue;
      selected.push(player);
      selectedIds.add(player.playerId);
      count -= 1;
    }
  };
  addRole("دفاع", 4);
  addRole("وسط", 3);
  addRole("هجوم", 3);
  for (const player of candidates) {
    if (selected.length >= 11) break;
    if (player.role === "حراسة" || selectedIds.has(player.playerId)) continue;
    selected.push(player);
    selectedIds.add(player.playerId);
  }
  if (selected.length !== 11 ||
      selected.filter((player) => player.role === "حراسة").length !== 1) {
    throw new RangeError("تعذر تكوين تشكيل دولي من 11 لاعبًا وحارس واحد.");
  }

  return {
    clubId: team.id,
    name: team.nameAr,
    strength: team.strength,
    lineup: selected.map((player) => ({
      id: player.playerId,
      name: player.playerName,
      role: player.role,
      rating: player.rating
    }))
  };
}

function createPenaltyDecision(fixture, homeGoals, awayGoals) {
  if (homeGoals !== awayGoals) {
    return {
      winnerTeamId: homeGoals > awayGoals ? fixture.homeTeamId : fixture.awayTeamId,
      decision: "regular-time",
      penaltyShootout: null
    };
  }

  let seed = 2166136261;
  for (const character of fixture.id) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  const homeWins = (seed & 1) === 0;
  const homeGoalsOnPenalties = homeWins ? 5 : 4;
  const awayGoalsOnPenalties = homeWins ? 4 : 5;
  return {
    winnerTeamId: homeWins ? fixture.homeTeamId : fixture.awayTeamId,
    decision: "penalties",
    penaltyShootout: {
      home: homeGoalsOnPenalties,
      away: awayGoalsOnPenalties,
      note: "حُسم التعادل بركلات الترجيح بعد الوقت الأصلي."
    }
  };
}

function simulateTournamentFixture(fixture, tournament, playerDevelopment, database) {
  const homeTeam = findCountryTeam(tournament, fixture.homeTeamId);
  const awayTeam = findCountryTeam(tournament, fixture.awayTeamId);
  if (!homeTeam || !awayTeam) {
    throw new TypeError("مباراة البطولة تشير إلى منتخب غير موجود.");
  }

  let home;
  let away;
  try {
    home = createTournamentSide(homeTeam, { database, playerDevelopment });
    away = createTournamentSide(awayTeam, { database, playerDevelopment });
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
  const simulated = simulateMatch({
    id: fixture.id,
    date: fixture.date,
    competitionId: tournament.id,
    seed: fixture.id + "|" + fixture.date,
    home,
    away
  });
  const decision = fixture.stage === "knockout"
    ? createPenaltyDecision(fixture, simulated.home.goals, simulated.away.goals)
    : {
        winnerTeamId: simulated.home.goals === simulated.away.goals ? null
          : simulated.home.goals > simulated.away.goals ? fixture.homeTeamId : fixture.awayTeamId,
        decision: simulated.result,
        penaltyShootout: null
      };
  const countryByTeamId = new Map([
    [homeTeam.id, homeTeam.countryId],
    [awayTeam.id, awayTeam.countryId]
  ]);
  const playerById = new Map(getWorldSquadPlayers(database).map((player) => [player.id, player]));

  return {
    fixtureId: fixture.id,
    id: fixture.id,
    date: fixture.date,
    season: tournament.season,
    tournamentId: tournament.id,
    tournamentName: tournament.nameAr,
    tournamentType: tournament.type,
    confederation: tournament.confederation,
    stage: fixture.stage,
    phase: fixture.phase ?? "groups",
    round: fixture.round,
    groupId: fixture.groupId,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeGoals: simulated.home.goals,
    awayGoals: simulated.away.goals,
    winnerTeamId: decision.winnerTeamId,
    decision: decision.decision,
    penaltyShootout: decision.penaltyShootout,
    home: simulated.home,
    away: simulated.away,
    durationMinutes: simulated.durationMinutes,
    events: simulated.events,
    manOfTheMatchPlayerId: simulated.manOfTheMatchPlayerId,
    playerPerformances: simulated.playerPerformances.map((performance) => ({
      ...performance,
      countryId: countryByTeamId.get(performance.clubId) ?? playerById.get(performance.playerId)?.countryId ?? null
    }))
  };
}

function updateDevelopment(playerDevelopment, result) {
  const performanceById = new Map(result.playerPerformances.map((item) => [item.playerId, item]));
  const injuryById = new Map(result.events
    .filter((event) => event.type === "injury")
    .map((event) => [event.playerId, event.daysOut]));
  return {
    ...playerDevelopment,
    players: playerDevelopment.players.map((player) => {
      const performance = performanceById.get(player.playerId);
      if (!performance) return player;
      return {
        ...player,
        fatigue: roundTo(Math.min(100, player.fatigue + Math.ceil(performance.minutesPlayed / 30)), 1),
        fitness: roundTo(Math.max(0, player.fitness - Math.ceil(performance.minutesPlayed / 25)), 1),
        injuryDays: Math.max(player.injuryDays, injuryById.get(player.playerId) ?? 0)
      };
    })
  };
}

function createTournamentArchive(tournament, completedDate) {
  const stats = [...tournament.playerStats];
  const rank = (left, right, primary, secondary) =>
    (right[primary] ?? 0) - (left[primary] ?? 0) ||
    (right[secondary] ?? 0) - (left[secondary] ?? 0) ||
    (right.averageMatchRating ?? 0) - (left.averageMatchRating ?? 0) ||
    compareText(left.playerId, right.playerId);
  const awardRecord = (player, value) => player ? ({
    playerId: player.playerId,
    playerName: player.playerName,
    countryId: player.countryId,
    value,
    appearances: player.appearances,
    goals: player.goals,
    assists: player.assists,
    averageMatchRating: player.averageMatchRating
  }) : null;
  const topScorer = [...stats].sort((a, b) => rank(a, b, "goals", "assists"))[0] ?? null;
  const topAssists = [...stats].sort((a, b) => rank(a, b, "assists", "goals"))[0] ?? null;
  const bestPlayer = [...stats].sort((left, right) =>
    (right.averageMatchRating ?? 0) - (left.averageMatchRating ?? 0) ||
    right.appearances - left.appearances ||
    (right.goals + right.assists) - (left.goals + left.assists) ||
    compareText(left.playerId, right.playerId)
  )[0] ?? null;
  const champion = tournament.teams.find((team) => team.id === tournament.championTeamId);
  const standings = getInternationalTournamentStandings(tournament, tournament.results)
    .map((group) => ({
      groupId: group.groupId,
      nameAr: group.nameAr,
      standings: group.standings ? group.standings.map((row) => ({ ...row })) : null
    }));

  return {
    id: "international-archive-" + tournament.id,
    tournamentId: tournament.id,
    season: tournament.season,
    nameAr: tournament.nameAr,
    type: tournament.type,
    confederation: tournament.confederation,
    completedDate,
    championTeamId: tournament.championTeamId,
    championName: champion?.nameAr ?? "منتخب غير معروف",
    teamCount: tournament.teams.length,
    matchesPlayed: tournament.results.length,
    fixtures: tournament.fixtures.map((fixture) => ({ ...fixture })),
    standings,
    awards: {
      topScorer: awardRecord(topScorer, topScorer?.goals ?? 0),
      topAssists: awardRecord(topAssists, topAssists?.assists ?? 0),
      bestPlayer: awardRecord(bestPlayer, bestPlayer?.averageMatchRating ?? 0)
    },
    results: tournament.results.map((result) => ({ ...result })),
    playerStats: tournament.playerStats.map((record) => ({ ...record }))
  };
}

function buildTournamentPlayerStats(results) {
  const totals = new Map();
  for (const result of results) {
    for (const performance of result.playerPerformances) {
      if (!performance.countryId || performance.minutesPlayed <= 0) continue;
      const record = totals.get(performance.playerId) ?? {
        playerId: performance.playerId,
        playerName: performance.playerName,
        countryId: performance.countryId,
        appearances: 0,
        minutesPlayed: 0,
        goals: 0,
        assists: 0,
        averageMatchRating: null,
        bestMatchRating: null,
        lastMatchDate: result.date
      };
      const nextAppearances = record.appearances + 1;
      const ratingTotal = (record.averageMatchRating ?? 0) * record.appearances + performance.rating;
      record.appearances = nextAppearances;
      record.minutesPlayed += performance.minutesPlayed;
      record.goals += performance.goals;
      record.assists += performance.assists;
      record.averageMatchRating = roundTo(ratingTotal / nextAppearances);
      record.bestMatchRating = Math.max(record.bestMatchRating ?? 0, performance.rating);
      if (result.date > record.lastMatchDate) record.lastMatchDate = result.date;
      totals.set(performance.playerId, record);
    }
  }
  return [...totals.values()].sort((left, right) =>
    compareText(left.countryId, right.countryId) || compareText(left.playerId, right.playerId)
  );
}

function createTournamentActivity(result) {
  const score = result.homeGoals + " - " + result.awayGoals;
  const shootout = result.penaltyShootout
    ? " (" + result.penaltyShootout.home + "-" + result.penaltyShootout.away + " ركلات ترجيح)"
    : "";
  const title = result.home.name + " " + score + shootout + " " + result.away.name;
  const event = {
    id: "event-" + result.fixtureId,
    date: result.date,
    type: "international-tournament-match-played",
    title,
    description: result.tournamentName + " · " +
      (result.phase === "groups" ? "دور المجموعات" : result.phase === "semi-final" ? "نصف النهائي" : "النهائي"),
    priority: result.winnerTeamId ? "high" : "normal"
  };
  return {
    event,
    message: {
      id: "message-" + event.id,
      eventId: event.id,
      date: event.date,
      title: "نتيجة مباراة دولية: " + title,
      body: event.description,
      read: false
    }
  };
}

function createTournamentLaunchEvent(plan) {
  const names = plan.tournaments.map((item) => item.nameAr).join("، ");
  const event = {
    id: "event-international-tournaments-season-" + plan.season,
    date: plan.generatedAt,
    type: "international-tournaments-opened",
    title: "انطلاق بطولات المنتخبات",
    description: "بدأت بطولات الموسم " + plan.season + ": " + names + ".",
    priority: "high"
  };
  return {
    event,
    message: {
      id: "message-" + event.id,
      eventId: event.id,
      date: event.date,
      title: event.title,
      body: event.description,
      read: false
    }
  };
}


function isValidTournamentPlayerStat(stat, countryIds, currentDate) {
  return isRecord(stat) &&
    typeof stat.playerId === "string" && stat.playerId.trim() &&
    typeof stat.playerName === "string" && stat.playerName.trim() &&
    countryIds.has(stat.countryId) &&
    Number.isSafeInteger(stat.appearances) && stat.appearances >= 1 &&
    Number.isSafeInteger(stat.minutesPlayed) && stat.minutesPlayed >= stat.appearances &&
    Number.isSafeInteger(stat.goals) && stat.goals >= 0 &&
    Number.isSafeInteger(stat.assists) && stat.assists >= 0 &&
    Number.isFinite(stat.averageMatchRating) && stat.averageMatchRating >= 4 && stat.averageMatchRating <= 10 &&
    Number.isFinite(stat.bestMatchRating) && stat.bestMatchRating >= stat.averageMatchRating && stat.bestMatchRating <= 10 &&
    isDate(stat.lastMatchDate) && (!currentDate || stat.lastMatchDate <= currentDate);
}

function isValidTournamentResult(result, fixture, teamIds, currentDate) {
  if (!isRecord(result) || result.fixtureId !== fixture.id || result.id !== fixture.id ||
      result.tournamentId !== fixture.tournamentId || result.date !== fixture.date ||
      result.season !== fixture.season || result.homeTeamId !== fixture.homeTeamId ||
      result.awayTeamId !== fixture.awayTeamId || !teamIds.has(result.homeTeamId) ||
      !teamIds.has(result.awayTeamId) || !isDate(result.date) ||
      (currentDate && result.date > currentDate) ||
      !Number.isSafeInteger(result.homeGoals) || result.homeGoals < 0 ||
      !Number.isSafeInteger(result.awayGoals) || result.awayGoals < 0 ||
      !Number.isSafeInteger(result.durationMinutes) || result.durationMinutes < 90 || result.durationMinutes > 100 ||
      !Array.isArray(result.events) || !Array.isArray(result.playerPerformances) ||
      !isRecord(result.home) || !isRecord(result.away) ||
      result.home.clubId !== result.homeTeamId || result.away.clubId !== result.awayTeamId ||
      result.home.goals !== result.homeGoals || result.away.goals !== result.awayGoals) return false;

  if (fixture.stage === "groups") {
    const expectedWinner = result.homeGoals === result.awayGoals ? null
      : result.homeGoals > result.awayGoals ? fixture.homeTeamId : fixture.awayTeamId;
    if (result.winnerTeamId !== expectedWinner || result.penaltyShootout !== null) return false;
  } else {
    if (![fixture.homeTeamId, fixture.awayTeamId].includes(result.winnerTeamId)) return false;
    if (result.homeGoals === result.awayGoals) {
      if (result.decision !== "penalties" || !isRecord(result.penaltyShootout) ||
          !Number.isSafeInteger(result.penaltyShootout.home) ||
          !Number.isSafeInteger(result.penaltyShootout.away) ||
          result.penaltyShootout.home < 0 || result.penaltyShootout.away < 0 ||
          result.penaltyShootout.home === result.penaltyShootout.away) return false;
      const penaltyWinner = result.penaltyShootout.home > result.penaltyShootout.away
        ? fixture.homeTeamId : fixture.awayTeamId;
      if (result.winnerTeamId !== penaltyWinner) return false;
    } else {
      const expectedWinner = result.homeGoals > result.awayGoals ? fixture.homeTeamId : fixture.awayTeamId;
      if (result.winnerTeamId !== expectedWinner || result.penaltyShootout !== null) return false;
    }
  }

  const performanceIds = new Set();
  for (const performance of result.playerPerformances) {
    if (!isRecord(performance) || typeof performance.playerId !== "string" ||
        !performance.playerId.trim() || performanceIds.has(performance.playerId) ||
        ![fixture.homeTeamId, fixture.awayTeamId].includes(performance.clubId) ||
        typeof performance.playerName !== "string" || !performance.playerName.trim() ||
        !Number.isSafeInteger(performance.minutesPlayed) || performance.minutesPlayed < 1 ||
        performance.minutesPlayed > result.durationMinutes ||
        !Number.isSafeInteger(performance.goals) || performance.goals < 0 ||
        !Number.isSafeInteger(performance.assists) || performance.assists < 0 ||
        !Number.isFinite(performance.rating) || performance.rating < 4 || performance.rating > 10) return false;
    performanceIds.add(performance.playerId);
  }
  return performanceIds.size === 22;
}

function isValidTournamentArchive(archive, currentDate) {
  if (!isRecord(archive) || typeof archive.id !== "string" ||
      archive.id !== "international-archive-" + archive.tournamentId ||
      !Number.isSafeInteger(archive.season) || archive.season < 1 ||
      typeof archive.nameAr !== "string" || !archive.nameAr.trim() ||
      !["continental", "world"].includes(archive.type) ||
      typeof archive.confederation !== "string" || !archive.confederation.trim() ||
      !isDate(archive.completedDate) || (currentDate && archive.completedDate > currentDate) ||
      !Array.isArray(archive.teams) || archive.teams.length < 2 ||
      !Array.isArray(archive.results) || archive.results.length < 1 ||
      !Array.isArray(archive.fixtures) || archive.fixtures.length !== archive.results.length ||
      archive.matchesPlayed !== archive.results.length ||
      archive.teamCount !== archive.teams.length ||
      !Array.isArray(archive.standings) || !isRecord(archive.awards) ||
      !Array.isArray(archive.playerStats)) return false;

  const teamIds = new Set();
  const countryIds = new Set();
  for (const team of archive.teams) {
    if (!isRecord(team) || typeof team.id !== "string" || !team.id.trim() ||
        teamIds.has(team.id) || typeof team.countryId !== "string" || !team.countryId.trim() ||
        typeof team.nameAr !== "string" || !team.nameAr.trim() ||
        !Number.isFinite(team.strength) || team.strength < 1 || team.strength > 99) return false;
    teamIds.add(team.id);
    countryIds.add(team.countryId);
  }
  if (!teamIds.has(archive.championTeamId) ||
      archive.championName !== archive.teams.find((team) => team.id === archive.championTeamId)?.nameAr) return false;

  const fixtureById = new Map();
  for (const fixture of archive.fixtures) {
    if (!isRecord(fixture) || typeof fixture.id !== "string" || fixtureById.has(fixture.id) ||
        fixture.tournamentId !== archive.tournamentId || fixture.season !== archive.season ||
        !isDate(fixture.date) || fixture.date > archive.completedDate ||
        !teamIds.has(fixture.homeTeamId) || !teamIds.has(fixture.awayTeamId) ||
        fixture.homeTeamId === fixture.awayTeamId || fixture.status !== "played" ||
        !["groups", "knockout"].includes(fixture.stage)) return false;
    fixtureById.set(fixture.id, fixture);
  }
  const resultIds = new Set();
  for (const result of archive.results) {
    const fixture = fixtureById.get(result?.fixtureId);
    if (!fixture || resultIds.has(result.fixtureId) ||
        !isValidTournamentResult(result, fixture, teamIds, archive.completedDate)) return false;
    resultIds.add(result.fixtureId);
  }
  if (archive.fixtures.some((fixture) => !resultIds.has(fixture.id))) return false;
  for (const group of archive.standings) {
    if (!isRecord(group) || typeof group.groupId !== "string" ||
        typeof group.nameAr !== "string" || !Array.isArray(group.standings)) return false;
    const rowIds = new Set();
    for (const row of group.standings) {
      if (!isRecord(row) || !teamIds.has(row.teamId) || rowIds.has(row.teamId) ||
          !["played", "wins", "draws", "losses", "goalsFor", "goalsAgainst", "points"]
            .every((key) => Number.isSafeInteger(row[key]) && row[key] >= 0) ||
          !Number.isSafeInteger(row.goalDifference)) return false;
      rowIds.add(row.teamId);
    }
  }
  for (const awardType of ["topScorer", "topAssists", "bestPlayer"]) {
    const award = archive.awards[awardType];
    if (award === null) continue;
    if (!isRecord(award) || typeof award.playerId !== "string" ||
        typeof award.playerName !== "string" || !countryIds.has(award.countryId) ||
        !Number.isFinite(award.value) || award.value < 0 ||
        !Number.isSafeInteger(award.appearances) || award.appearances < 1 ||
        !Number.isSafeInteger(award.goals) || award.goals < 0 ||
        !Number.isSafeInteger(award.assists) || award.assists < 0 ||
        !Number.isFinite(award.averageMatchRating) ||
        award.averageMatchRating < 4 || award.averageMatchRating > 10) return false;
  }
  const statIds = new Set();
  for (const stat of archive.playerStats) {
    if (!isValidTournamentPlayerStat(stat, countryIds, archive.completedDate) ||
        statIds.has(stat.playerId)) return false;
    statIds.add(stat.playerId);
  }
  return true;
}

export function isValidTournamentSeasonRecord(record, season, currentDate = null) {
  if (!isRecord(record) || record.season !== season || !isDate(record.generatedAt) ||
      (currentDate && record.generatedAt > currentDate) ||
      !Array.isArray(record.tournaments) || record.tournaments.length < 1 ||
      record.tournaments.length > 8) return false;
  const tournamentIds = new Set();
  for (const tournament of record.tournaments) {
    if (!isRecord(tournament) || typeof tournament.id !== "string" ||
        !tournament.id.trim() || tournamentIds.has(tournament.id) ||
        tournament.season !== season ||
        !["continental", "world"].includes(tournament.type) ||
        typeof tournament.nameAr !== "string" || !tournament.nameAr.trim() ||
        typeof tournament.confederation !== "string" || !tournament.confederation.trim() ||
        !Array.isArray(tournament.teams) || tournament.teams.length < 2 ||
        tournament.teams.length > 32 || !Array.isArray(tournament.groups) ||
        !Array.isArray(tournament.fixtures) || tournament.fixtures.length > 500 ||
        !Array.isArray(tournament.results) || tournament.results.length > 500 ||
        !Array.isArray(tournament.playerStats) ||
        !["scheduled", "completed"].includes(tournament.status) ||
        !["groups", "semi-final", "final", "completed"].includes(tournament.stage)) return false;
    tournamentIds.add(tournament.id);

    const teamIds = new Set();
    const countryIds = new Set();
    for (const team of tournament.teams) {
      if (!isRecord(team) || typeof team.id !== "string" || !team.id.trim() ||
          teamIds.has(team.id) || typeof team.countryId !== "string" || !team.countryId.trim() ||
          typeof team.nameAr !== "string" || !team.nameAr.trim() ||
          !Number.isFinite(team.strength) || team.strength < 1 || team.strength > 99 ||
          !Number.isSafeInteger(team.seed) || team.seed < 1) return false;
      teamIds.add(team.id);
      countryIds.add(team.countryId);
    }

    const groupIds = new Set();
    const groupedTeams = new Set();
    for (const group of tournament.groups) {
      if (!isRecord(group) || typeof group.id !== "string" || !group.id.trim() ||
          groupIds.has(group.id) || typeof group.nameAr !== "string" || !group.nameAr.trim() ||
          !Array.isArray(group.teamIds) || group.teamIds.length < 2 ||
          group.teamIds.some((id) => !teamIds.has(id) || groupedTeams.has(id))) return false;
      groupIds.add(group.id);
      group.teamIds.forEach((id) => groupedTeams.add(id));
    }
    if (tournament.groups.length > 0 && groupedTeams.size !== teamIds.size) return false;

    const fixtureById = new Map();
    for (const fixture of tournament.fixtures) {
      if (!isRecord(fixture) || typeof fixture.id !== "string" || !fixture.id.trim() ||
          fixtureById.has(fixture.id) || fixture.tournamentId !== tournament.id ||
          fixture.season !== season || !isDate(fixture.date) ||
          (currentDate && fixture.date > addDays(currentDate, 365)) ||
          !teamIds.has(fixture.homeTeamId) || !teamIds.has(fixture.awayTeamId) ||
          fixture.homeTeamId === fixture.awayTeamId ||
          !Number.isSafeInteger(fixture.round) || fixture.round < 1 ||
          !["groups", "knockout"].includes(fixture.stage) ||
          !["scheduled", "played"].includes(fixture.status)) return false;
      if (fixture.stage === "groups") {
        if (!groupIds.has(fixture.groupId) ||
            !tournament.groups.some((group) => group.id === fixture.groupId &&
              group.teamIds.includes(fixture.homeTeamId) && group.teamIds.includes(fixture.awayTeamId))) return false;
      } else if (fixture.groupId !== null ||
          !["semi-final", "final"].includes(fixture.phase)) return false;
      fixtureById.set(fixture.id, fixture);
    }

    const resultById = new Map();
    for (const result of tournament.results) {
      const fixture = fixtureById.get(result?.fixtureId);
      if (!fixture || fixture.status !== "played" || resultById.has(result.fixtureId) ||
          !isValidTournamentResult(result, fixture, teamIds, currentDate)) return false;
      resultById.set(result.fixtureId, result);
    }
    if (tournament.fixtures.some((fixture) =>
      (fixture.status === "played") !== resultById.has(fixture.id)
    )) return false;

    const statIds = new Set();
    for (const stat of tournament.playerStats) {
      if (!isValidTournamentPlayerStat(stat, countryIds, currentDate) || statIds.has(stat.playerId)) return false;
      statIds.add(stat.playerId);
    }

    if (tournament.status === "completed") {
      if (tournament.stage !== "completed" || !teamIds.has(tournament.championTeamId)) return false;
      // Earlier Phase 10.5 saves may contain a completed tournament before its
      // first archive pass; keep those saves loadable so the next career day can backfill it.
      if (tournament.archive !== undefined &&
          (!isValidTournamentArchive(tournament.archive, currentDate) ||
            tournament.archive.tournamentId !== tournament.id ||
            tournament.archive.championTeamId !== tournament.championTeamId)) return false;
    } else if (tournament.championTeamId !== null ||
        (tournament.archive !== undefined && !isValidTournamentArchive(tournament.archive, currentDate))) {
      return false;
    }
  }
  return true;
}

export function isValidInternationalTournamentState(state, currentDate) {
  if (!isRecord(state) || !isDate(currentDate)) return false;
  const seasons = state.tournamentSeasons;
  const archives = state.tournamentArchives;
  if (seasons !== undefined && (!Array.isArray(seasons) || seasons.length > MAX_TOURNAMENT_SEASONS)) return false;
  if (archives !== undefined && (!Array.isArray(archives) || archives.length > MAX_TOURNAMENT_ARCHIVES)) return false;
  const seasonRecords = seasons ?? [];
  const archiveRecords = archives ?? [];
  const seasonsSeen = new Set();
  for (const record of seasonRecords) {
    if (!isValidTournamentSeasonRecord(record, record?.season, currentDate) ||
        seasonsSeen.has(record.season)) return false;
    seasonsSeen.add(record.season);
  }
  const archiveIds = new Set();
  for (const archive of archiveRecords) {
    if (!isValidTournamentArchive(archive, currentDate) || archiveIds.has(archive.id)) return false;
    archiveIds.add(archive.id);
  }
  const archivesById = new Map(archiveRecords.map((archive) => [archive.id, archive]));
  const generatedArchives = seasonRecords.flatMap((record) => record.tournaments
    .filter((tournament) => tournament.archive)
    .map((tournament) => tournament.archive));
  for (const archive of generatedArchives) {
    const storedArchive = archivesById.get(archive.id);
    if (!storedArchive || JSON.stringify(storedArchive) !== JSON.stringify(archive)) return false;
  }
  return true;
}

/**
 * Runs scheduled national-team tournament fixtures on their in-game dates.
 * Continental championships run every two career seasons; the World Cup runs
 * every four seasons. All results are isolated from club competitions.
 */
export function advanceInternationalTournaments(save, database = WORLD_DATABASE) {
  const currentDate = save?.world?.currentDate;
  const season = save?.career?.season;
  const originalNationalTeams = save?.world?.nationalTeams;
  const playerDevelopment = save?.world?.football?.playerDevelopment;
  if (!isRecord(save?.world) || !isDate(currentDate) ||
      !Number.isSafeInteger(season) || season < 1 ||
      !isRecord(originalNationalTeams) || !isRecord(playerDevelopment) ||
      !Array.isArray(playerDevelopment.players)) {
    throw new TypeError("حالة المسيرة غير صالحة لمحاكاة البطولات الدولية.");
  }

  let tournamentArchives = Array.isArray(originalNationalTeams.tournamentArchives)
    ? [...originalNationalTeams.tournamentArchives]
    : [];
  let tournamentSeasons = Array.isArray(originalNationalTeams.tournamentSeasons)
    ? [...originalNationalTeams.tournamentSeasons]
    : [];
  let changed = false;
  let nextPlayerDevelopment = playerDevelopment;
  const newEvents = [];
  const newMessages = [];

  if (currentDate.slice(5) === "06-10" && isTournamentSeason(season) &&
      !tournamentSeasons.some((item) => item.season === season)) {
    const plan = buildTournamentPlan(season, currentDate, database, playerDevelopment);
    if (plan.tournaments.length > 0) {
      if (!isValidTournamentSeasonRecord(plan, season)) {
        throw new TypeError("خطة البطولات الدولية غير صالحة.");
      }
      tournamentSeasons.push(plan);
      const launch = createTournamentLaunchEvent(plan);
      newEvents.push(launch.event);
      newMessages.push(launch.message);
      changed = true;
    }
  }

  for (let seasonIndex = 0; seasonIndex < tournamentSeasons.length; seasonIndex += 1) {
    let record = tournamentSeasons[seasonIndex];
    const nextTournaments = [];
    for (let tournament of record.tournaments) {
      let fixtures = [...tournament.fixtures];
      let results = [...tournament.results];
      const resultIds = new Set(results.map((result) => result.fixtureId));
      const due = fixtures
        .filter((fixture) => fixture.status === "scheduled" && fixture.date <= currentDate)
        .sort((left, right) => compareText(left.date, right.date) || compareText(left.id, right.id));
      for (const fixture of due) {
        const result = simulateTournamentFixture(fixture, tournament, nextPlayerDevelopment, database);
        if (!result) {
          let nextDate = addDays(currentDate, 1);
          for (let attempt = 0; attempt < 21; attempt += 1) {
            const hasConflict = fixtures.some((other) =>
              other.id !== fixture.id && other.status === "scheduled" &&
              other.date === nextDate &&
              [other.homeTeamId, other.awayTeamId].some((teamId) =>
                teamId === fixture.homeTeamId || teamId === fixture.awayTeamId
              )
            );
            if (!hasConflict) break;
            nextDate = addDays(nextDate, 1);
          }
          fixtures = fixtures.map((item) => item.id === fixture.id
            ? { ...item, date: nextDate }
            : item);
          changed = true;
          continue;
        }
        results.push(result);
        resultIds.add(fixture.id);
        fixtures = fixtures.map((item) => item.id === fixture.id
          ? { ...item, status: "played", resultId: fixture.id }
          : item);
        nextPlayerDevelopment = updateDevelopment(nextPlayerDevelopment, result);
        const activity = createTournamentActivity(result);
        newEvents.push(activity.event);
        newMessages.push(activity.message);
        changed = true;
      }

      tournament = { ...tournament, fixtures, results };
      const advanced = advanceInternationalTournament(tournament, results);
      if (advanced.advanced) {
        tournament = { ...advanced };
        delete tournament.advanced;
        changed = true;
      }
      const playerStats = buildTournamentPlayerStats(results);
      if (JSON.stringify(playerStats) !== JSON.stringify(tournament.playerStats)) {
        tournament = { ...tournament, playerStats };
        changed = true;
      }
      if (tournament.status === "completed" && !tournament.archive) {
        const archive = createTournamentArchive(tournament, currentDate);
        tournament = { ...tournament, archive };
        tournamentArchives.push(archive);
        changed = true;
      }
      nextTournaments.push(tournament);
    }
    tournamentSeasons[seasonIndex] = { ...record, tournaments: nextTournaments };
  }

  tournamentSeasons = tournamentSeasons
    .sort((left, right) => left.season - right.season)
    .slice(-MAX_TOURNAMENT_SEASONS);
  tournamentArchives = tournamentArchives
    .sort((left, right) => right.completedDate.localeCompare(left.completedDate) ||
      compareText(right.id, left.id))
    .slice(0, MAX_TOURNAMENT_ARCHIVES);
  const resultCount = tournamentSeasons.reduce((sum, item) =>
    sum + item.tournaments.reduce((count, tournament) => count + tournament.results.length, 0), 0
  );
  if (resultCount > MAX_TOURNAMENT_RESULTS) {
    throw new RangeError("سجل نتائج البطولات الدولية تجاوز الحد الآمن.");
  }

  if (!changed) return save;
  for (const record of tournamentSeasons) {
    if (!isValidTournamentSeasonRecord(record, record.season)) {
      throw new TypeError("سجل البطولة الدولية الناتج غير صالح.");
    }
  }

  const events = [...(save.world.events ?? []), ...newEvents].slice(-90);
  const retainedIds = new Set(events.map((event) => event.id));
  const inbox = [
    ...(save.world.inbox ?? []).filter((message) => retainedIds.has(message.eventId)),
    ...newMessages
  ].slice(-90);

  return {
    ...save,
    world: {
      ...save.world,
      nationalTeams: {
        ...originalNationalTeams,
        tournamentSeasons,
        tournamentArchives
      },
      football: {
        ...save.world.football,
        playerDevelopment: nextPlayerDevelopment
      },
      events,
      inbox
    }
  };
}

export function getUpcomingInternationalTournamentFixtures(state, currentDate, limit = 20) {
  if (!Array.isArray(state?.tournamentSeasons) || !isDate(currentDate) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return [];
  return state.tournamentSeasons
    .flatMap((record) => record.tournaments.flatMap((tournament) =>
      tournament.fixtures
        .filter((fixture) => fixture.status === "scheduled" && fixture.date >= currentDate)
        .map((fixture) => ({
          ...fixture,
          tournamentName: tournament.nameAr,
          tournamentType: tournament.type,
          confederation: tournament.confederation,
          stage: fixture.phase ?? fixture.stage
        }))
    ))
    .sort((left, right) => compareText(left.date, right.date) || compareText(left.id, right.id))
    .slice(0, limit);
}

export function getRecentInternationalTournamentResults(state, limit = 20) {
  if (!Array.isArray(state?.tournamentSeasons) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return [];
  return state.tournamentSeasons
    .flatMap((record) => record.tournaments.flatMap((tournament) =>
      tournament.results.map((result) => ({
        ...result,
        tournamentName: tournament.nameAr,
        tournamentType: tournament.type
      }))
    ))
    .sort((left, right) => compareText(right.date, left.date) || compareText(right.id, left.id))
    .slice(0, limit);
}

export function getInternationalTournamentPlayerStats(state, playerId) {
  if (!Array.isArray(state?.tournamentSeasons) ||
      typeof playerId !== "string" || !playerId.trim()) return [];
  return state.tournamentSeasons
    .flatMap((record) => record.tournaments.flatMap((tournament) =>
      tournament.playerStats.filter((item) => item.playerId === playerId)
        .map((item) => ({ ...item, tournamentName: tournament.nameAr, season: tournament.season }))
    ))
    .sort((left, right) => right.season - left.season || compareText(left.tournamentName, right.tournamentName));
}

export function getInternationalTournamentOverview(state, currentDate) {
  if (!isRecord(state) || !isDate(currentDate)) {
    return { tournaments: [], upcomingFixtures: [], recentResults: [], champions: [], archives: [] };
  }
  const seasonRecords = Array.isArray(state.tournamentSeasons) ? state.tournamentSeasons : [];
  const archives = Array.isArray(state.tournamentArchives) ? state.tournamentArchives : [];
  const tournaments = seasonRecords.flatMap((record) =>
    record.tournaments.map((tournament) => ({
      ...tournament,
      season: record.season,
      standings: getInternationalTournamentStandings(tournament, tournament.results)
    }))
  );
  const championsById = new Map();
  for (const archive of archives) {
    championsById.set(archive.tournamentId, {
      tournamentId: archive.tournamentId,
      tournamentName: archive.nameAr,
      season: archive.season,
      championTeamId: archive.championTeamId,
      champion: archive.championName,
      completedDate: archive.completedDate
    });
  }
  for (const tournament of tournaments) {
    if (tournament.status === "completed" && tournament.championTeamId &&
        !championsById.has(tournament.id)) {
      championsById.set(tournament.id, {
        tournamentId: tournament.id,
        tournamentName: tournament.nameAr,
        season: tournament.season,
        championTeamId: tournament.championTeamId,
        champion: tournament.teams.find((team) => team.id === tournament.championTeamId)?.nameAr ?? "منتخب غير معروف",
        completedDate: tournament.fixtures.reduce((latest, fixture) =>
          fixture.date > latest ? fixture.date : latest, tournament.fixtures[0]?.date ?? currentDate)
      });
    }
  }
  return {
    tournaments: tournaments.sort((left, right) =>
      right.season - left.season || compareText(left.nameAr, right.nameAr)
    ),
    upcomingFixtures: getUpcomingInternationalTournamentFixtures({ tournamentSeasons: seasonRecords }, currentDate, 12),
    recentResults: getRecentInternationalTournamentResults({ tournamentSeasons: seasonRecords }, 12),
    champions: [...championsById.values()].sort((left, right) =>
      right.completedDate.localeCompare(left.completedDate) || compareText(right.tournamentId, left.tournamentId)
    ),
    archives: [...archives].sort((left, right) =>
      right.completedDate.localeCompare(left.completedDate) || compareText(right.id, left.id)
    )
  };
}
