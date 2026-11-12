import { WORLD_DATABASE, getWorldSquadPlayers } from "../data/world-database.js";
import { simulateMatch } from "./match-simulation.js";
import { getPlayerCurrentClubId } from "./transfers.js";
import {
  createInitialPlayerDevelopmentState,
  advancePlayerDevelopmentDay,
  recordPlayerMatchPerformances,
  isValidPlayerDevelopmentState
} from "./player-development.js";

const MAX_RETAINED_MATCH_RESULTS = 1000;
const MAX_RETAINED_FIXTURES = 2000;
const MIN_MATCH_REST_DAYS = 3;
const ROLE_SLOTS = [
  "حراسة",
  "دفاع", "دفاع", "دفاع", "دفاع",
  "وسط", "وسط", "وسط",
  "هجوم", "هجوم", "هجوم"
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dateValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = dateValue(value);
  if (!date) throw new TypeError("تاريخ جدول المباريات غير صالح.");
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

function daysBetween(left, right) {
  return Math.round((dateValue(left).getTime() - dateValue(right).getTime()) / 86400000);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createRoundRobinRounds(clubIds) {
  const rotation = [...clubIds];
  if (rotation.length % 2 === 1) rotation.push(null);
  const rounds = [];
  const totalRounds = rotation.length - 1;

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const matches = [];
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const first = rotation[index];
      const second = rotation[rotation.length - 1 - index];
      if (!first || !second) continue;
      const homeClubId = (roundIndex + index) % 2 === 0 ? first : second;
      const awayClubId = homeClubId === first ? second : first;
      matches.push({ homeClubId, awayClubId });
    }
    rounds.push(matches);
    const fixed = rotation[0];
    const remaining = rotation.slice(1);
    remaining.unshift(remaining.pop());
    rotation.splice(0, rotation.length, fixed, ...remaining);
  }
  return rounds;
}

/**
 * Creates a private simulation XI for each club. Existing fictional world
 * players are used when available; missing squad places are filled with
 * explicitly marked anonymous simulation-only players, never inserted into
 * the searchable world-player database.
 */
export function buildSimulationTeam(clubId, database = WORLD_DATABASE, playerDevelopment = null, transferState = null, currentDate = "2026-07-01") {
  const club = database.clubs.find((item) => item.id === clubId);
  if (!club) throw new TypeError("النادي غير موجود في قاعدة العالم: " + clubId);

  const developmentById = new Map((playerDevelopment?.players ?? [])
    .map((player) => [player.playerId, player]));
  const injuredPlayerIds = new Set((playerDevelopment?.players ?? [])
    .filter((player) => player.injuryDays > 0)
    .map((player) => player.playerId));
  const matchdayRating = (player) => developmentById.get(player.id)?.rating ?? player.rating;
  const realPlayers = getWorldSquadPlayers(database)
    .filter((player) => getPlayerCurrentClubId(player.id, player.clubId, transferState, currentDate, database) === clubId && !injuredPlayerIds.has(player.id))
    .sort((a, b) => matchdayRating(b) - matchdayRating(a) || compareText(a.id, b.id));
  const unused = new Set(realPlayers.map((player) => player.id));
  const lineup = ROLE_SLOTS.map((role, slotIndex) => {
    const realPlayer = realPlayers.find((player) =>
      unused.has(player.id) && player.role === role
    );
    if (realPlayer) {
      unused.delete(realPlayer.id);
      return {
        id: realPlayer.id,
        name: realPlayer.name,
        role: realPlayer.role,
        rating: matchdayRating(realPlayer),
        potential: developmentById.get(realPlayer.id)?.potential ?? realPlayer.potential,
        simulationOnly: false
      };
    }

    const number = slotIndex + 1;
    const positionalAdjustment = role === "هجوم" ? 2
      : role === "حراسة" ? -1
        : role === "وسط" ? 1 : 0;
    const deterministicOffset = ((number * 7 + club.simulationProfile) % 5) - 2;
    return {
      id: "sim-" + club.id + "-squad-" + String(number).padStart(2, "0"),
      name: "لاعب محاكاة " + club.shortName + " " + String(number).padStart(2, "0"),
      role,
      rating: Math.max(40, Math.min(95, club.simulationProfile + positionalAdjustment + deterministicOffset)),
      potential: Math.min(99, club.simulationProfile + 8),
      simulationOnly: true
    };
  });

  const startingIds = new Set(lineup.filter((player) => player.simulationOnly !== true).map((player) => player.id));
  const toSquadEntry = (player) => ({
    id: player.id,
    name: player.name,
    role: player.role,
    rating: matchdayRating(player),
    potential: developmentById.get(player.id)?.potential ?? player.potential,
    simulationOnly: false
  });
  return {
    clubId: club.id,
    name: club.nameAr,
    strength: club.simulationProfile,
    lineup,
    squad: realPlayers.map(toSquadEntry),
    bench: realPlayers.filter((player) => !startingIds.has(player.id)).map(toSquadEntry)
  };
}

export function generateSeasonFixtures(season, startDate, database = WORLD_DATABASE) {
  if (!Number.isSafeInteger(season) || season < 1 || !dateValue(startDate)) {
    throw new TypeError("بيانات إنشاء جدول الموسم غير صالحة.");
  }
  const templates = [];
  const competitions = [...database.competitions]
    .filter((competition) => Array.isArray(competition.clubIds) && competition.clubIds.length >= 2)
    .sort((a, b) => compareText(a.id, b.id));

  for (const competition of competitions) {
    const clubIds = [...competition.clubIds].sort(compareText);
    const firstLegRounds = createRoundRobinRounds(clubIds);
    const totalRounds = firstLegRounds.length;
    firstLegRounds.forEach((roundMatches, roundIndex) => {
      roundMatches.forEach((match) => {
        templates.push({
          competition,
          round: roundIndex + 1,
          leg: 1,
          ...match
        });
        templates.push({
          competition,
          round: roundIndex + 1 + totalRounds,
          leg: 2,
          homeClubId: match.awayClubId,
          awayClubId: match.homeClubId
        });
      });
    });
  }

  templates.sort((a, b) =>
    a.round - b.round ||
    compareText(a.competition.id, b.competition.id) ||
    compareText(a.homeClubId, b.homeClubId) ||
    compareText(a.awayClubId, b.awayClubId)
  );

  const lastMatchDateByClub = new Map();
  const fixtures = templates.map((template) => {
    let matchDate = addDays(startDate, 3 + (template.round - 1) * 7);
    while ([template.homeClubId, template.awayClubId].some((clubId) => {
      const previousDate = lastMatchDateByClub.get(clubId);
      return previousDate && daysBetween(matchDate, previousDate) < MIN_MATCH_REST_DAYS;
    })) {
      matchDate = addDays(matchDate, 1);
    }

    lastMatchDateByClub.set(template.homeClubId, matchDate);
    lastMatchDateByClub.set(template.awayClubId, matchDate);
    const fixtureId = [
      "match",
      season,
      template.competition.id,
      "round-" + template.round,
      "leg-" + template.leg,
      template.homeClubId,
      template.awayClubId
    ].join("-");

    return {
      id: fixtureId,
      season,
      competitionId: template.competition.id,
      competitionName: template.competition.nameAr,
      date: matchDate,
      round: template.round,
      leg: template.leg,
      homeClubId: template.homeClubId,
      awayClubId: template.awayClubId,
      status: "scheduled",
      resultId: null
    };
  });

  return fixtures.sort((a, b) =>
    compareText(a.date, b.date) ||
    compareText(a.competitionId, b.competitionId) ||
    compareText(a.id, b.id)
  );
}

export function createInitialFootballState(season = 1, currentDate = "2026-07-01", database = WORLD_DATABASE) {
  if (!Number.isSafeInteger(season) || season < 1 || !dateValue(currentDate)) {
    throw new TypeError("بيانات بداية موسم كرة القدم غير صالحة.");
  }
  return {
    version: 1,
    season,
    fixtures: generateSeasonFixtures(season, currentDate, database),
    results: [],
    playerDevelopment: createInitialPlayerDevelopmentState(getWorldSquadPlayers(database))
  };
}

function createMatchEvent(result, fixture) {
  const score = result.home.goals + " - " + result.away.goals;
  const title = result.home.name + " " + score + " " + result.away.name;
  const description = fixture.competitionName + " · الجولة " + fixture.round +
    " · " + result.home.shotsOnTarget + " تسديدة على المرمى مقابل " +
    result.away.shotsOnTarget + " للفريق الضيف.";

  const event = {
    id: "event-" + fixture.id,
    date: fixture.date,
    type: "football-match-played",
    title,
    description,
    priority: result.result === "draw" ? "normal" : "high"
  };
  return {
    event,
    message: {
      id: "message-" + event.id,
      eventId: event.id,
      date: event.date,
      title: "نتيجة مباراة: " + title,
      body: description,
      read: false
    }
  };
}

/**
 * Processes fixtures on the exact in-game date. A fixture is marked played
 * only after its result has been computed and is appended exactly once.
 */
export function advanceFootballSeasonDay(state, currentDate, season, database = WORLD_DATABASE, transferState = null) {
  if (!isRecord(state) || !Array.isArray(state.fixtures) ||
      !Array.isArray(state.results) || !dateValue(currentDate) ||
      !Number.isSafeInteger(season) || season < state.season) {
    throw new TypeError("حالة موسم كرة القدم غير صالحة.");
  }

  let nextState = state;
  if (season > state.season) {
    nextState = {
      ...state,
      season,
      fixtures: [
        ...state.fixtures,
        ...generateSeasonFixtures(season, currentDate, database)
      ]
    };
  }

  let playerDevelopment = advancePlayerDevelopmentDay(
    nextState.playerDevelopment,
    currentDate,
    season
  );
  const todayFixtures = nextState.fixtures.filter((fixture) =>
    fixture.status === "scheduled" && fixture.date === currentDate
  );
  const playedResults = [];
  const matchEvents = [];
  const matchMessages = [];

  for (const fixture of todayFixtures) {
    const home = buildSimulationTeam(fixture.homeClubId, database, playerDevelopment, transferState, currentDate);
    const away = buildSimulationTeam(fixture.awayClubId, database, playerDevelopment, transferState, currentDate);
    const simulated = simulateMatch({
      id: fixture.id,
      date: fixture.date,
      competitionId: fixture.competitionId,
      seed: fixture.id + "|" + fixture.date,
      home,
      away
    });
    const result = {
      ...simulated,
      season: fixture.season,
      round: fixture.round,
      leg: fixture.leg,
      competitionName: fixture.competitionName,
      rosterType: "fictional-mixed-with-simulation-only-fillers"
    };
    playerDevelopment = recordPlayerMatchPerformances(playerDevelopment, result, currentDate);
    playedResults.push(result);
    const records = createMatchEvent(result, fixture);
    matchEvents.push(records.event);
    matchMessages.push(records.message);
  }

  const resultMap = new Map(playedResults.map((result) => [result.id, result]));
  const fixtures = nextState.fixtures.map((fixture) => resultMap.has(fixture.id)
    ? { ...fixture, status: "played", resultId: fixture.id }
    : fixture);
  const results = [...nextState.results, ...playedResults].slice(-MAX_RETAINED_MATCH_RESULTS);
  const retainedResultIds = new Set(results.map((result) => result.id));
  const retainedFixtures = fixtures
    .filter((fixture) => fixture.status === "scheduled" || retainedResultIds.has(fixture.id))
    .slice(-MAX_RETAINED_FIXTURES);

  return {
    football: {
      ...nextState,
      fixtures: retainedFixtures,
      results,
      playerDevelopment
    },
    resultsToday: playedResults,
    events: matchEvents,
    messages: matchMessages
  };
}

function isValidMatchResult(result, fixture) {
  if (!isRecord(result) || result.id !== fixture.id || result.date !== fixture.date ||
      result.status !== "played" || result.season !== fixture.season ||
      !isRecord(result.home) || !isRecord(result.away) ||
      result.home.clubId !== fixture.homeClubId ||
      result.away.clubId !== fixture.awayClubId ||
      ![result.home.goals, result.away.goals].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      !["home-win", "away-win", "draw"].includes(result.result) ||
      result.home.possession + result.away.possession !== 100 ||
      !Array.isArray(result.events) || !Array.isArray(result.playerPerformances) ||
      result.playerPerformances.length !== 22) return false;

  const performanceIds = result.playerPerformances.map((player) => player?.playerId);
  if (performanceIds.some((id) => typeof id !== "string" || !id.trim()) ||
      new Set(performanceIds).size !== performanceIds.length) return false;
  const goals = result.events.filter((event) => event.type === "goal");
  if (goals.length !== result.home.goals + result.away.goals ||
      result.playerPerformances.reduce((total, player) => total + player.goals, 0) !== goals.length) return false;

  return result.playerPerformances.every((player) =>
    typeof player.playerName === "string" && player.playerName.trim() &&
    [fixture.homeClubId, fixture.awayClubId].includes(player.clubId) &&
    ["هجوم", "وسط", "دفاع", "حراسة"].includes(player.role) &&
    Number.isFinite(player.rating) && player.rating >= 4 && player.rating <= 10 &&
    Number.isSafeInteger(player.minutesPlayed) && player.minutesPlayed >= 1 &&
    player.minutesPlayed <= result.durationMinutes &&
    Number.isSafeInteger(player.goals) && player.goals >= 0 &&
    Number.isSafeInteger(player.assists) && player.assists >= 0 &&
    Number.isSafeInteger(player.shots) && player.shots >= 0 &&
    Number.isSafeInteger(player.shotsOnTarget) && player.shotsOnTarget >= 0 &&
    player.shotsOnTarget <= player.shots &&
    typeof player.simulationOnly === "boolean"
  );
}

export function isValidFootballState(state, currentDate, season, database = WORLD_DATABASE) {
  if (!isRecord(state) || state.version !== 1 ||
      !Number.isSafeInteger(state.season) || state.season < 1 || state.season > season ||
      !dateValue(currentDate) ||
      !Array.isArray(state.fixtures) || state.fixtures.length > MAX_RETAINED_FIXTURES ||
      !Array.isArray(state.results) || state.results.length > MAX_RETAINED_MATCH_RESULTS ||
      !isValidPlayerDevelopmentState(state.playerDevelopment, state.season)) return false;

  const fixtureIds = state.fixtures.map((fixture) => fixture?.id);
  const resultIds = state.results.map((result) => result?.id);
  if (fixtureIds.some((id) => typeof id !== "string" || !id.trim()) ||
      new Set(fixtureIds).size !== fixtureIds.length ||
      resultIds.some((id) => typeof id !== "string" || !id.trim()) ||
      new Set(resultIds).size !== resultIds.length) return false;

  const expectedPlayerIds = getWorldSquadPlayers(database).map((player) => player.id);
  const savedPlayerIds = new Set(state.playerDevelopment.players.map((player) => player.playerId));
  if (!expectedPlayerIds.every((playerId) => savedPlayerIds.has(playerId))) return false;

  const clubIds = new Set(database.clubs.map((club) => club.id));
  const competitionIds = new Set(database.competitions.map((competition) => competition.id));
  const fixtureById = new Map(state.fixtures.map((fixture) => [fixture.id, fixture]));
  if (!state.fixtures.every((fixture) =>
    isRecord(fixture) &&
    Number.isSafeInteger(fixture.season) && fixture.season >= 1 && fixture.season <= season &&
    competitionIds.has(fixture.competitionId) &&
    typeof fixture.competitionName === "string" && fixture.competitionName.trim() &&
    dateValue(fixture.date) !== null &&
    Number.isSafeInteger(fixture.round) && fixture.round >= 1 &&
    [1, 2].includes(fixture.leg) &&
    clubIds.has(fixture.homeClubId) && clubIds.has(fixture.awayClubId) &&
    fixture.homeClubId !== fixture.awayClubId &&
    ((fixture.status === "scheduled" && fixture.resultId === null) ||
      (fixture.status === "played" && fixture.resultId === fixture.id && fixture.date <= currentDate))
  )) return false;

  if (!state.results.every((result) => {
    const fixture = fixtureById.get(result.id);
    return fixture?.status === "played" && isValidMatchResult(result, fixture);
  })) return false;

  return state.fixtures.every((fixture) =>
    fixture.status !== "played" || state.results.some((result) => result.id === fixture.id)
  );
}

export function getUpcomingFootballFixtures(state, currentDate, limit = 10) {
  if (!Array.isArray(state?.fixtures) || !dateValue(currentDate) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return [];
  return state.fixtures
    .filter((fixture) => fixture.status === "scheduled" && fixture.date > currentDate)
    .sort((a, b) => compareText(a.date, b.date) || compareText(a.id, b.id))
    .slice(0, limit);
}

export function getRecentFootballResults(state, limit = 10) {
  if (!Array.isArray(state?.results) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return [];
  return [...state.results]
    .sort((a, b) => compareText(b.date, a.date) || compareText(b.id, a.id))
    .slice(0, limit);
}

/** Builds a deterministic competition table from persisted match results. */
export function getCompetitionStandings(state, competitionId, database = WORLD_DATABASE, season = state?.season) {
  const competition = database.competitions.find((item) => item.id === competitionId);
  if (!competition || !Array.isArray(state?.results)) return [];
  const clubById = new Map(database.clubs.map((club) => [club.id, club]));
  const standings = new Map(competition.clubIds.map((clubId) => [clubId, {
    clubId,
    clubName: clubById.get(clubId)?.nameAr ?? clubId,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0
  }]));

  for (const result of state.results) {
    if (result.competitionId !== competitionId) continue;
    if (season !== undefined && result.season !== season) continue;
    const home = standings.get(result.home.clubId);
    const away = standings.get(result.away.clubId);
    if (!home || !away) continue;
    home.played += 1;
    away.played += 1;
    home.goalsFor += result.home.goals;
    home.goalsAgainst += result.away.goals;
    away.goalsFor += result.away.goals;
    away.goalsAgainst += result.home.goals;
    if (result.home.goals > result.away.goals) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (result.away.goals > result.home.goals) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  return [...standings.values()]
    .map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort((a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      compareText(a.clubId, b.clubId)
    )
    .map((row, index) => ({ ...row, position: index + 1 }));
}
