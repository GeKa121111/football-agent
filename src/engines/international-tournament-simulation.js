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
  const homeGoalsOnPenalties = 4 + ((seed >>> 3) % 2);
  const awayGoalsOnPenalties = homeGoalsOnPenalties === 5 ? 4 : 3;
  return {
    winnerTeamId: fixture.homeTeamId,
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

  const home = createTournamentSide(homeTeam, { database, playerDevelopment });
  const away = createTournamentSide(awayTeam, { database, playerDevelopment });
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

function isValidTournamentSeason(record, season) {
  if (!isRecord(record) || record.season !== season || !isDate(record.generatedAt) ||
      !Array.isArray(record.tournaments) || record.tournaments.length < 1 ||
      record.tournaments.length > 8) return false;
  const ids = new Set();
  for (const tournament of record.tournaments) {
    if (!isRecord(tournament) || typeof tournament.id !== "string" ||
        ids.has(tournament.id) || !Array.isArray(tournament.teams) ||
        !Array.isArray(tournament.groups) || !Array.isArray(tournament.fixtures) ||
        !Array.isArray(tournament.results) || !Array.isArray(tournament.playerStats)) return false;
    ids.add(tournament.id);
    const teamIds = new Set(tournament.teams.map((team) => team.id));
    const fixtureIds = new Set();
    for (const fixture of tournament.fixtures) {
      if (!isRecord(fixture) || typeof fixture.id !== "string" ||
          fixtureIds.has(fixture.id) || fixture.tournamentId !== tournament.id ||
          !isDate(fixture.date) || !teamIds.has(fixture.homeTeamId) ||
          !teamIds.has(fixture.awayTeamId) || fixture.homeTeamId === fixture.awayTeamId ||
          !["groups", "knockout"].includes(fixture.stage) ||
          !["scheduled", "played"].includes(fixture.status)) return false;
      fixtureIds.add(fixture.id);
    }
    const resultIds = new Set();
    for (const result of tournament.results) {
      if (!isRecord(result) || !fixtureIds.has(result.fixtureId) ||
          resultIds.has(result.fixtureId) || !Number.isSafeInteger(result.homeGoals) ||
          result.homeGoals < 0 || !Number.isSafeInteger(result.awayGoals) ||
          result.awayGoals < 0 || !teamIds.has(result.homeTeamId) ||
          !teamIds.has(result.awayTeamId) || result.homeTeamId === result.awayTeamId ||
          !isDate(result.date)) return false;
      resultIds.add(result.fixtureId);
    }
    if (tournament.fixtures.some((fixture) =>
      (fixture.status === "played") !== resultIds.has(fixture.id)
    )) return false;
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
      if (!isValidTournamentSeason(plan, season)) {
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
      nextTournaments.push(tournament);
    }
    tournamentSeasons[seasonIndex] = { ...record, tournaments: nextTournaments };
  }

  tournamentSeasons = tournamentSeasons
    .sort((left, right) => left.season - right.season)
    .slice(-MAX_TOURNAMENT_SEASONS);
  const resultCount = tournamentSeasons.reduce((sum, item) =>
    sum + item.tournaments.reduce((count, tournament) => count + tournament.results.length, 0), 0
  );
  if (resultCount > MAX_TOURNAMENT_RESULTS) {
    throw new RangeError("سجل نتائج البطولات الدولية تجاوز الحد الآمن.");
  }

  if (!changed && originalNationalTeams.tournamentSeasons !== undefined) return save;
  for (const record of tournamentSeasons) {
    if (!isValidTournamentSeason(record, record.season)) {
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
        tournamentSeasons
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
  if (!Array.isArray(state?.tournamentSeasons) || !isDate(currentDate)) {
    return { tournaments: [], upcomingFixtures: [], recentResults: [], champions: [] };
  }
  const tournaments = state.tournamentSeasons.flatMap((record) =>
    record.tournaments.map((tournament) => ({
      ...tournament,
      season: record.season,
      standings: getInternationalTournamentStandings(tournament, tournament.results)
    }))
  );
  return {
    tournaments: tournaments.sort((left, right) =>
      right.season - left.season || compareText(left.nameAr, right.nameAr)
    ),
    upcomingFixtures: getUpcomingInternationalTournamentFixtures(state, currentDate, 12),
    recentResults: getRecentInternationalTournamentResults(state, 12),
    champions: tournaments
      .filter((tournament) => tournament.status === "completed" && tournament.championTeamId)
      .map((tournament) => ({
        tournamentId: tournament.id,
        tournamentName: tournament.nameAr,
        season: tournament.season,
        championTeamId: tournament.championTeamId,
        champion: tournament.teams.find((team) => team.id === tournament.championTeamId)?.nameAr ?? "منتخب غير معروف"
      }))
  };
}
