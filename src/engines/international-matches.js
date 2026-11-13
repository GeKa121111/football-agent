import { WORLD_DATABASE, getWorldSquadPlayers } from "../data/world-database.js";
import { simulateMatch } from "./match-simulation.js";
import { getInternationalWindows, isValidNationalTeamState } from "./international-breaks.js";

const MAX_RETAINED_INTERNATIONAL_FIXTURES = 600;
const MAX_RETAINED_INTERNATIONAL_MATCHES = 600;
const MAX_RETAINED_INTERNATIONAL_PLAYER_STATS = 10000;
const MATCHDAY_OFFSETS = Object.freeze([1, 5]);
const WINDOW_KEYS = Object.freeze(["spring", "summer", "autumn", "winter"]);
const COMPETITION_ID = "international-friendlies";
const COMPETITION_NAME = "مباريات ودية دولية";
const MATCH_ROLES = Object.freeze(["حراسة", "دفاع", "وسط", "هجوم"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function roundTo(value, decimals = 2) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function addDays(value, days) {
  const date = new Date(value + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function roundRobinPairings(countryIds, roundIndex) {
  const rotation = [...countryIds].sort(compareText);
  if (rotation.length < 2) return [];
  if (rotation.length % 2 === 1) rotation.push(null);

  const roundCount = rotation.length - 1;
  const normalizedRound = ((roundIndex % roundCount) + roundCount) % roundCount;
  for (let step = 0; step < normalizedRound; step += 1) {
    const fixed = rotation[0];
    const remaining = rotation.slice(1);
    remaining.unshift(remaining.pop());
    rotation.splice(0, rotation.length, fixed, ...remaining);
  }

  const pairings = [];
  for (let index = 0; index < rotation.length / 2; index += 1) {
    const first = rotation[index];
    const second = rotation[rotation.length - 1 - index];
    if (!first || !second) continue;
    const firstHosts = (normalizedRound + index) % 2 === 0;
    pairings.push(firstHosts
      ? { homeCountryId: first, awayCountryId: second }
      : { homeCountryId: second, awayCountryId: first });
  }
  return pairings;
}

function createWindowFixtures(window, callups, currentDate, database) {
  const callupsByCountry = new Map(callups
    .filter((callup) => callup.windowId === window.id)
    .map((callup) => [callup.countryId, callup]));
  const countryIds = [...database.countries]
    .map((country) => country.id)
    .filter((countryId) => callupsByCountry.has(countryId))
    .sort(compareText);
  if (countryIds.length !== database.countries.length || countryIds.length < 2) return [];

  const windowIndex = WINDOW_KEYS.indexOf(window.key);
  if (windowIndex < 0) return [];
  const roundCount = Math.max(1, countryIds.length + (countryIds.length % 2) - 1);
  const yearOffset = Math.max(0, window.year - 2026);
  const fixtures = [];

  MATCHDAY_OFFSETS.forEach((offset, matchdayIndex) => {
    const plannedDate = addDays(window.startDate, offset);
    const date = plannedDate < currentDate ? currentDate : plannedDate;
    if (date > window.endDate) return;

    const roundIndex = (yearOffset * MATCHDAY_OFFSETS.length * WINDOW_KEYS.length +
      windowIndex * MATCHDAY_OFFSETS.length + matchdayIndex) % roundCount;
    const pairings = roundRobinPairings(countryIds, roundIndex);
    pairings.forEach((pairing, pairingIndex) => {
      const id = "international-fixture-" + window.id + "-matchday-" +
        (matchdayIndex + 1) + "-" + String(pairingIndex + 1).padStart(2, "0");
      fixtures.push({
        id,
        windowId: window.id,
        date,
        round: roundIndex + 1,
        matchday: matchdayIndex + 1,
        competitionId: COMPETITION_ID,
        competitionName: COMPETITION_NAME,
        homeCountryId: pairing.homeCountryId,
        awayCountryId: pairing.awayCountryId,
        status: "scheduled",
        resultId: null
      });
    });
  });

  return fixtures;
}

function developmentByPlayerId(playerDevelopment) {
  return new Map((playerDevelopment?.players ?? [])
    .filter((player) => isRecord(player) && typeof player.playerId === "string")
    .map((player) => [player.playerId, player]));
}

function toMatchCandidate(calledPlayer, development) {
  const rating = Number.isFinite(development?.rating)
    ? development.rating
    : calledPlayer.rating;
  const fitness = Number.isFinite(development?.fitness)
    ? Math.max(0, Math.min(100, development.fitness))
    : calledPlayer.fitness;
  const injuryDays = Number.isSafeInteger(development?.injuryDays) && development.injuryDays >= 0
    ? development.injuryDays
    : 0;
  if (calledPlayer.status !== "called" || injuryDays > 0 || fitness <= 0 ||
      !Number.isFinite(rating) || rating < 1 || rating > 99 ||
      !MATCH_ROLES.includes(calledPlayer.role)) return null;
  return {
    id: calledPlayer.playerId,
    name: calledPlayer.playerName,
    role: calledPlayer.role,
    rating,
    fitness
  };
}

/**
 * Builds a national 4-3-3 from the registered call-up. If a role is short
 * because of injuries, the manager fills the remaining outfield places with
 * the best available outfield players. A match is never played without a
 * goalkeeper or with fewer than eleven eligible players.
 */
function buildNationalTeamSide(callup, playerDevelopment) {
  if (!isRecord(callup) || !Array.isArray(callup.players)) return null;
  const development = developmentByPlayerId(playerDevelopment);
  const candidates = callup.players
    .map((player) => toMatchCandidate(player, development.get(player.playerId)))
    .filter(Boolean)
    .sort((left, right) =>
      right.rating - left.rating ||
      right.fitness - left.fitness ||
      compareText(left.id, right.id)
    );
  const goalkeeper = candidates.find((player) => player.role === "حراسة");
  if (!goalkeeper) return null;

  const selected = [goalkeeper];
  const selectedIds = new Set([goalkeeper.id]);
  const addRole = (role, count) => {
    for (const player of candidates) {
      if (selected.length >= 11 || count <= 0) break;
      if (player.role !== role || selectedIds.has(player.id)) continue;
      selected.push(player);
      selectedIds.add(player.id);
      count -= 1;
    }
  };

  addRole("دفاع", 4);
  addRole("وسط", 3);
  addRole("هجوم", 3);
  for (const player of candidates) {
    if (selected.length >= 11) break;
    if (player.role === "حراسة" || selectedIds.has(player.id)) continue;
    selected.push(player);
    selectedIds.add(player.id);
  }
  if (selected.length !== 11) return null;

  const teamId = "national-team-" + callup.countryId;
  return {
    clubId: teamId,
    name: callup.teamName,
    strength: roundTo(selected.reduce((sum, player) => sum + player.rating, 0) / selected.length, 2),
    lineup: selected.map(({ id, name, role, rating }) => ({
      id,
      name,
      role,
      rating,
      simulationOnly: false
    }))
  };
}

function rescheduleOrCancelFixture(fixture, window, fixtures, currentDate) {
  let nextDate = addDays(currentDate, 1);
  while (nextDate <= window.endDate) {
    const conflict = fixtures.some((other) =>
      other.id !== fixture.id &&
      other.status === "scheduled" &&
      other.date === nextDate &&
      [other.homeCountryId, other.awayCountryId].some((countryId) =>
        countryId === fixture.homeCountryId || countryId === fixture.awayCountryId
      )
    );
    if (!conflict) {
      return { ...fixture, date: nextDate };
    }
    nextDate = addDays(nextDate, 1);
  }
  return {
    ...fixture,
    status: "cancelled",
    resultId: null,
    cancelReason: "insufficient-eligible-players"
  };
}

function createMatchEvent(result, fixture, window) {
  const score = result.home.goals + " - " + result.away.goals;
  const title = result.home.name + " " + score + " " + result.away.name;
  const event = {
    id: "event-" + fixture.id,
    date: result.date,
    type: "international-match-played",
    title,
    description: COMPETITION_NAME + " · " + window.label + " · " +
      result.home.shotsOnTarget + " تسديدة على المرمى مقابل " +
      result.away.shotsOnTarget + " للفريق الضيف.",
    priority: result.result === "draw" ? "normal" : "high"
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

function buildInternationalPlayerStats(matches) {
  const totals = new Map();
  for (const match of matches) {
    for (const performance of match.playerPerformances) {
      if (performance.minutesPlayed <= 0) continue;
      const key = performance.countryId + "::" + performance.playerId;
      const record = totals.get(key) ?? {
        playerId: performance.playerId,
        playerName: performance.playerName,
        countryId: performance.countryId,
        appearances: 0,
        minutesPlayed: 0,
        goals: 0,
        assists: 0,
        averageMatchRating: null,
        bestMatchRating: null,
        lastMatchDate: match.date
      };
      const nextAppearances = record.appearances + 1;
      const ratingTotal = (record.averageMatchRating ?? 0) * record.appearances +
        performance.rating;
      record.appearances = nextAppearances;
      record.minutesPlayed += performance.minutesPlayed;
      record.goals += performance.goals;
      record.assists += performance.assists;
      record.averageMatchRating = roundTo(ratingTotal / nextAppearances);
      record.bestMatchRating = Math.max(record.bestMatchRating ?? 0, performance.rating);
      if (match.date > record.lastMatchDate) record.lastMatchDate = match.date;
      totals.set(key, record);
    }
  }
  return [...totals.values()]
    .sort((left, right) =>
      compareText(left.countryId, right.countryId) ||
      compareText(left.playerId, right.playerId)
    )
    .slice(0, MAX_RETAINED_INTERNATIONAL_PLAYER_STATS);
}

/**
 * Applies physical match load and injuries only. Club appearances, minutes,
 * goals, assists and competition totals remain untouched by international
 * fixtures and are tracked separately in nationalTeams.playerStats.
 */
function applyInternationalMatchLoad(playerDevelopment, result) {
  const performanceById = new Map(result.playerPerformances
    .map((performance) => [performance.playerId, performance]));
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

function simulateInternationalFixture(fixture, window, homeCallup, awayCallup, playerDevelopment, season) {
  const home = buildNationalTeamSide(homeCallup, playerDevelopment);
  const away = buildNationalTeamSide(awayCallup, playerDevelopment);
  if (!home || !away) return null;

  const simulated = simulateMatch({
    id: fixture.id,
    date: fixture.date,
    competitionId: fixture.competitionId,
    seed: fixture.id + "|" + fixture.date,
    home,
    away
  });
  const homeTeamId = "national-team-" + fixture.homeCountryId;
  const awayTeamId = "national-team-" + fixture.awayCountryId;
  return {
    ...simulated,
    season,
    competitionName: fixture.competitionName,
    matchType: "friendly",
    windowId: window.id,
    round: fixture.round,
    matchday: fixture.matchday,
    home: { ...simulated.home, countryId: fixture.homeCountryId },
    away: { ...simulated.away, countryId: fixture.awayCountryId },
    playerPerformances: simulated.playerPerformances.map((performance) => ({
      ...performance,
      countryId: performance.clubId === homeTeamId
        ? fixture.homeCountryId
        : fixture.awayCountryId
    })),
    rosterType: "registered-national-callups"
  };
}

function isValidInternationalMatchResult(result, fixture, window, countries, playerById) {
  if (!isRecord(result) || result.id !== fixture.id || result.date !== fixture.date ||
      result.status !== "played" || result.competitionId !== COMPETITION_ID ||
      result.competitionName !== COMPETITION_NAME ||
      result.matchType !== "friendly" || result.windowId !== window.id ||
      result.round !== fixture.round || result.matchday !== fixture.matchday ||
      !Number.isSafeInteger(result.season) || result.season < 1 ||
      !Number.isSafeInteger(result.durationMinutes) || result.durationMinutes < 90 || result.durationMinutes > 100 ||
      !isRecord(result.home) || !isRecord(result.away) ||
      result.home.clubId !== "national-team-" + fixture.homeCountryId ||
      result.away.clubId !== "national-team-" + fixture.awayCountryId ||
      result.home.countryId !== fixture.homeCountryId ||
      result.away.countryId !== fixture.awayCountryId ||
      !countries.has(result.home.countryId) || !countries.has(result.away.countryId) ||
      ![result.home.goals, result.away.goals].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      !["home-win", "away-win", "draw"].includes(result.result) ||
      result.home.possession + result.away.possession !== 100 ||
      !Array.isArray(result.events) || !Array.isArray(result.playerPerformances) ||
      result.playerPerformances.length !== 22) return false;

  const expectedOutcome = result.home.goals > result.away.goals ? "home-win"
    : result.away.goals > result.home.goals ? "away-win" : "draw";
  if (result.result !== expectedOutcome) return false;

  const performanceIds = result.playerPerformances.map((performance) => performance?.playerId);
  if (performanceIds.some((id) => typeof id !== "string" || !id.trim()) ||
      new Set(performanceIds).size !== performanceIds.length) return false;
  const goalEvents = result.events.filter((event) => event?.type === "goal");
  if (goalEvents.length !== result.home.goals + result.away.goals ||
      result.playerPerformances.reduce((sum, performance) => sum + performance.goals, 0) !== goalEvents.length) {
    return false;
  }

  return result.playerPerformances.every((performance) => {
    const source = playerById.get(performance.playerId);
    const expectedCountryId = performance.clubId === result.home.clubId
      ? fixture.homeCountryId
      : performance.clubId === result.away.clubId ? fixture.awayCountryId : null;
    return source && expectedCountryId &&
      performance.countryId === expectedCountryId &&
      source.countryId === expectedCountryId &&
      source.name === performance.playerName &&
      MATCH_ROLES.includes(performance.role) &&
      Number.isFinite(performance.rating) && performance.rating >= 4 && performance.rating <= 10 &&
      Number.isSafeInteger(performance.minutesPlayed) && performance.minutesPlayed >= 1 &&
      performance.minutesPlayed <= result.durationMinutes &&
      Number.isSafeInteger(performance.goals) && performance.goals >= 0 &&
      Number.isSafeInteger(performance.assists) && performance.assists >= 0 &&
      Number.isSafeInteger(performance.shots) && performance.shots >= 0 &&
      Number.isSafeInteger(performance.shotsOnTarget) && performance.shotsOnTarget >= 0 &&
      performance.shotsOnTarget <= performance.shots &&
      performance.simulationOnly === false;
  });
}

/** Returns whether the optional international match extension is valid. */
export function isValidInternationalMatchState(state, currentDate, database = WORLD_DATABASE) {
  if (!isRecord(state) || !validDate(currentDate)) return false;
  const fixtures = state.fixtures === undefined ? [] : state.fixtures;
  const matches = state.matches === undefined ? [] : state.matches;
  const playerStats = state.playerStats === undefined ? [] : state.playerStats;
  if (!Array.isArray(fixtures) || fixtures.length > MAX_RETAINED_INTERNATIONAL_FIXTURES ||
      !Array.isArray(matches) || matches.length > MAX_RETAINED_INTERNATIONAL_MATCHES ||
      !Array.isArray(playerStats) || playerStats.length > MAX_RETAINED_INTERNATIONAL_PLAYER_STATS) return false;

  const windows = new Map((state.windows ?? []).map((window) => [window.id, window]));
  const countries = new Set(database.countries.map((country) => country.id));
  const playerById = new Map(getWorldSquadPlayers(database).map((player) => [player.id, player]));
  const fixtureById = new Map();
  const callupKeys = new Set((state.callups ?? []).map((callup) =>
    callup.windowId + "::" + callup.countryId
  ));

  for (const fixture of fixtures) {
    const window = windows.get(fixture?.windowId);
    if (!isRecord(fixture) || !window ||
        typeof fixture.id !== "string" ||
        fixture.id !== "international-fixture-" + window.id + "-matchday-" +
          fixture.matchday + "-" + String(Number(fixture.id.split("-").at(-1))).padStart(2, "0") ||
        fixtureById.has(fixture.id) ||
        !validDate(fixture.date) || fixture.date < window.startDate || fixture.date > window.endDate ||
        !Number.isSafeInteger(fixture.round) || fixture.round < 1 ||
        ![1, 2].includes(fixture.matchday) ||
        fixture.competitionId !== COMPETITION_ID || fixture.competitionName !== COMPETITION_NAME ||
        !countries.has(fixture.homeCountryId) || !countries.has(fixture.awayCountryId) ||
        fixture.homeCountryId === fixture.awayCountryId ||
        !callupKeys.has(window.id + "::" + fixture.homeCountryId) ||
        !callupKeys.has(window.id + "::" + fixture.awayCountryId) ||
        !["scheduled", "played", "cancelled"].includes(fixture.status) ||
        (fixture.status === "played"
          ? fixture.resultId !== fixture.id || fixture.date > currentDate
          : fixture.resultId !== null) ||
        (fixture.status === "cancelled" &&
          fixture.cancelReason !== "insufficient-eligible-players") ||
        (fixture.status !== "cancelled" && fixture.cancelReason !== undefined)) return false;
    fixtureById.set(fixture.id, fixture);
  }

  const matchIds = new Set();
  for (const match of matches) {
    const fixture = fixtureById.get(match?.id);
    const window = fixture ? windows.get(fixture.windowId) : null;
    if (!fixture || fixture.status !== "played" || matchIds.has(match.id) ||
        !isValidInternationalMatchResult(match, fixture, window, countries, playerById)) return false;
    matchIds.add(match.id);
  }
  if (fixtures.some((fixture) =>
    fixture.status === "played" !== matchIds.has(fixture.id)
  )) return false;

  const statKeys = new Set();
  for (const stat of playerStats) {
    const source = playerById.get(stat?.playerId);
    const key = stat?.countryId + "::" + stat?.playerId;
    if (!isRecord(stat) || !source || source.countryId !== stat.countryId ||
        statKeys.has(key) ||
        typeof stat.playerName !== "string" || stat.playerName !== source.name ||
        !Number.isSafeInteger(stat.appearances) || stat.appearances < 1 ||
        !Number.isSafeInteger(stat.minutesPlayed) || stat.minutesPlayed < stat.appearances ||
        !Number.isSafeInteger(stat.goals) || stat.goals < 0 ||
        !Number.isSafeInteger(stat.assists) || stat.assists < 0 ||
        !Number.isFinite(stat.averageMatchRating) || stat.averageMatchRating < 4 || stat.averageMatchRating > 10 ||
        !Number.isFinite(stat.bestMatchRating) || stat.bestMatchRating < stat.averageMatchRating ||
        stat.bestMatchRating > 10 ||
        !validDate(stat.lastMatchDate) || stat.lastMatchDate > currentDate) return false;
    statKeys.add(key);
  }
  return true;
}

/**
 * Schedules two deterministic friendly matchdays for every active call-up
 * window, simulates fixtures once on their in-game date and archives separate
 * international performances. The shared match engine remains the single
 * source of match simulation and the shared development state owns injuries.
 */
export function advanceInternationalMatches(save, database = WORLD_DATABASE) {
  const currentDate = save?.world?.currentDate;
  if (!isRecord(save?.world) || !validDate(currentDate) ||
      !isRecord(save.world.nationalTeams) ||
      !isRecord(save.world.football?.playerDevelopment) ||
      !Array.isArray(save.world.football.playerDevelopment.players)) {
    throw new TypeError("حالة المسيرة غير صالحة لمحاكاة المباريات الدولية.");
  }

  const originalState = save.world.nationalTeams;
  const state = {
    ...originalState,
    fixtures: Array.isArray(originalState.fixtures) ? originalState.fixtures : [],
    matches: Array.isArray(originalState.matches) ? originalState.matches : [],
    playerStats: Array.isArray(originalState.playerStats) ? originalState.playerStats : []
  };
  if (!isValidNationalTeamState(state, currentDate, database) ||
      !isValidInternationalMatchState(state, currentDate, database)) {
    throw new TypeError("سجل المباريات الدولية الحالي غير صالح.");
  }

  const retainedWindowIds = new Set(state.windows.map((window) => window.id));
  let fixtures = state.fixtures.filter((fixture) => retainedWindowIds.has(fixture.windowId));
  let matches = state.matches.filter((match) => retainedWindowIds.has(match.windowId));
  let playerStats = state.playerStats;
  let playerDevelopment = save.world.football.playerDevelopment;
  let changed = fixtures.length !== state.fixtures.length || matches.length !== state.matches.length;
  let matchesChanged = changed && matches.length !== state.matches.length;
  const newEvents = [];
  const newMessages = [];

  const existingWindowFixtureIds = new Set(fixtures.map((fixture) => fixture.windowId));
  for (const window of state.windows.filter((item) =>
    item.status === "active" && currentDate >= item.startDate && currentDate <= item.endDate
  )) {
    if (existingWindowFixtureIds.has(window.id)) continue;
    const additions = createWindowFixtures(window, state.callups, currentDate, database);
    if (additions.length > 0) {
      fixtures.push(...additions);
      existingWindowFixtureIds.add(window.id);
      changed = true;
    }
  }

  const callupByKey = new Map(state.callups.map((callup) =>
    [callup.windowId + "::" + callup.countryId, callup]
  ));
  const fixtureUpdates = new Map();
  const dueFixtures = fixtures
    .filter((fixture) => fixture.status === "scheduled" && fixture.date <= currentDate)
    .sort((left, right) =>
      compareText(left.date, right.date) || compareText(left.id, right.id)
    );

  for (const fixture of dueFixtures) {
    const window = state.windows.find((item) => item.id === fixture.windowId);
    const homeCallup = callupByKey.get(fixture.windowId + "::" + fixture.homeCountryId);
    const awayCallup = callupByKey.get(fixture.windowId + "::" + fixture.awayCountryId);
    const result = window && homeCallup && awayCallup
      ? simulateInternationalFixture(
          fixture,
          window,
          homeCallup,
          awayCallup,
          playerDevelopment,
          save.career?.season ?? 1
        )
      : null;

    if (!result) {
      const nextFixture = window
        ? rescheduleOrCancelFixture(fixture, window, fixtures, currentDate)
        : { ...fixture, status: "cancelled", resultId: null, cancelReason: "insufficient-eligible-players" };
      fixtureUpdates.set(fixture.id, nextFixture);
      changed = true;
      continue;
    }

    matches.push(result);
    fixtureUpdates.set(fixture.id, { ...fixture, status: "played", resultId: fixture.id });
    playerDevelopment = applyInternationalMatchLoad(playerDevelopment, result);
    matchesChanged = true;
    changed = true;
    const records = createMatchEvent(result, fixture, window);
    newEvents.push(records.event);
    newMessages.push(records.message);
  }

  if (fixtureUpdates.size > 0) {
    fixtures = fixtures.map((fixture) => fixtureUpdates.get(fixture.id) ?? fixture);
  }
  fixtures = fixtures
    .sort((left, right) => compareText(left.date, right.date) || compareText(left.id, right.id))
    .slice(-MAX_RETAINED_INTERNATIONAL_FIXTURES);
  matches = matches
    .sort((left, right) => compareText(left.date, right.date) || compareText(left.id, right.id))
    .slice(-MAX_RETAINED_INTERNATIONAL_MATCHES);
  if (matchesChanged) playerStats = buildInternationalPlayerStats(matches);

  if (!changed && !matchesChanged && originalState.fixtures !== undefined &&
      originalState.matches !== undefined && originalState.playerStats !== undefined) return save;

  const nextNationalTeams = {
    ...state,
    fixtures,
    matches,
    playerStats
  };
  if (!isValidNationalTeamState(nextNationalTeams, currentDate, database) ||
      !isValidInternationalMatchState(nextNationalTeams, currentDate, database)) {
    throw new TypeError("تعذر اعتماد نتائج المباريات الدولية الناتجة.");
  }

  const existingEvents = save.world.events ?? [];
  const events = [...existingEvents, ...newEvents].slice(-90);
  const retainedEventIds = new Set(events.map((event) => event.id));
  const inbox = [
    ...(save.world.inbox ?? []).filter((message) => retainedEventIds.has(message.eventId)),
    ...newMessages
  ].slice(-90);

  return {
    ...save,
    world: {
      ...save.world,
      nationalTeams: nextNationalTeams,
      football: {
        ...save.world.football,
        playerDevelopment
      },
      events,
      inbox
    }
  };
}

/** Returns the next scheduled international fixtures after the supplied date. */
export function getUpcomingInternationalFixtures(state, currentDate, limit = 10) {
  if (!Array.isArray(state?.fixtures) || !validDate(currentDate) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return [];
  return state.fixtures
    .filter((fixture) => fixture.status === "scheduled" && fixture.date >= currentDate)
    .sort((left, right) =>
      compareText(left.date, right.date) || compareText(left.id, right.id)
    )
    .slice(0, limit);
}

/** Returns recently completed international results. */
export function getRecentInternationalMatches(state, limit = 10) {
  if (!Array.isArray(state?.matches) || !Number.isSafeInteger(limit) ||
      limit < 1 || limit > 100) return [];
  return [...state.matches]
    .sort((left, right) =>
      compareText(right.date, left.date) || compareText(right.id, left.id)
    )
    .slice(0, limit);
}

/** Returns the separate international record for one known national-team player. */
export function getInternationalPlayerStats(state, playerId) {
  if (!Array.isArray(state?.playerStats) ||
      typeof playerId !== "string" || !playerId.trim()) return null;
  return state.playerStats.find((item) => item.playerId === playerId) ?? null;
}
