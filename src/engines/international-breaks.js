import { WORLD_DATABASE, getWorldSquadPlayers } from "../data/world-database.js";
import {
  getEligibleNationalTeamPlayers,
  selectNationalTeamSquad
} from "./national-teams.js";
import { getPlayerCurrentClubId } from "./transfers.js";

const MAX_RETAINED_WINDOWS = 40;
const MAX_RETAINED_CALLUPS = 480;
const MAX_CALLUP_CHANGES = 100;
const MAX_HISTORY_YEARS = 10;

const WINDOW_BLUEPRINTS = Object.freeze([
  Object.freeze({ key: "spring", label: "توقف مارس الدولي", startMonth: 3, startDay: 22, endMonth: 3, endDay: 30 }),
  Object.freeze({ key: "summer", label: "توقف يونيو الدولي", startMonth: 6, startDay: 1, endMonth: 6, endDay: 9 }),
  Object.freeze({ key: "autumn", label: "توقف سبتمبر الدولي", startMonth: 9, startDay: 7, endMonth: 9, endDay: 15 }),
  Object.freeze({ key: "winter", label: "توقف نوفمبر الدولي", startMonth: 11, startDay: 9, endMonth: 11, endDay: 17 })
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateKey(year, month, day) {
  return [String(year).padStart(4, "0"), String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sequenceOf(id, prefix) {
  const match = new RegExp("^" + prefix + "-(\\d+)$").exec(id);
  return match ? Number(match[1]) : 0;
}

function findSourcePlayer(playerId, database) {
  return getWorldSquadPlayers(database).find((player) => player.id === playerId) ?? null;
}

function getDevelopmentById(playerDevelopment) {
  return new Map((playerDevelopment?.players ?? [])
    .filter((player) => isRecord(player) && typeof player.playerId === "string")
    .map((player) => [player.playerId, player]));
}

function toCallupPlayer(player, shirtNumber, transferState, currentDate, database) {
  return {
    playerId: player.id,
    playerName: player.name,
    countryId: player.countryId,
    role: player.role,
    age: player.age,
    rating: player.rating,
    potential: player.potential,
    fitness: player.fitness,
    currentClubId: getPlayerCurrentClubId(
      player.id, player.clubId, transferState, currentDate, database
    ),
    shirtNumber,
    status: "called"
  };
}

function appendWindowEvent(save, window, nationalTeamCount) {
  const event = {
    id: "event-" + window.id + "-national-callups",
    date: window.startDate,
    type: "international-window-opened",
    title: "بداية " + window.label,
    description: "بدأت فترة التوقف الدولي. صدرت قوائم استدعاء " +
      nationalTeamCount + " منتخبًا، وتُسجل جاهزية اللاعبين والتغييرات خلال الفترة.",
    priority: "high"
  };
  const message = {
    id: "message-" + event.id,
    eventId: event.id,
    date: event.date,
    title: event.title,
    body: event.description,
    read: false
  };
  const events = [...(save.world.events ?? []), event].slice(-90);
  const retainedEventIds = new Set(events.map((item) => item.id));
  const inbox = [
    ...(save.world.inbox ?? []).filter((item) => retainedEventIds.has(item.eventId)),
    message
  ].slice(-90);
  return {
    ...save,
    world: { ...save.world, events, inbox }
  };
}

/**
 * These dates belong to the game's fictional calendar. They are deliberately
 * explicit and deterministic; they are not presented as official FIFA dates.
 */
export function getInternationalWindows(year) {
  if (!Number.isSafeInteger(year) || year < 1900 || year > 9998) {
    throw new TypeError("سنة التوقف الدولي غير صالحة.");
  }
  return WINDOW_BLUEPRINTS.map((blueprint) => ({
    id: "international-window-" + year + "-" + blueprint.key,
    year,
    key: blueprint.key,
    label: blueprint.label,
    startDate: dateKey(year, blueprint.startMonth, blueprint.startDay),
    endDate: dateKey(year, blueprint.endMonth, blueprint.endDay)
  }));
}

export function getUpcomingInternationalWindows(currentDate, limit = 4) {
  if (!validDate(currentDate) || !Number.isSafeInteger(limit) || limit < 1 || limit > 16) {
    throw new TypeError("بيانات عرض فترات التوقف الدولي غير صالحة.");
  }
  const year = Number(currentDate.slice(0, 4));
  return [
    ...getInternationalWindows(year),
    ...getInternationalWindows(year + 1),
    ...getInternationalWindows(year + 2),
    ...getInternationalWindows(year + 3)
  ]
    .filter((window) => window.endDate >= currentDate)
    .slice(0, limit);
}

export function createInitialNationalTeamState() {
  return {
    schemaVersion: 1,
    nextCallupSequence: 1,
    lastProcessedDate: null,
    windows: [],
    callups: []
  };
}

export function isValidNationalTeamState(state, currentDate, database = WORLD_DATABASE) {
  if (!isRecord(state) || state.schemaVersion !== 1 ||
      !Number.isSafeInteger(state.nextCallupSequence) || state.nextCallupSequence < 1 ||
      (state.lastProcessedDate !== null &&
        (!validDate(state.lastProcessedDate) || !validDate(currentDate) || state.lastProcessedDate > currentDate)) ||
      !Array.isArray(state.windows) || state.windows.length > MAX_RETAINED_WINDOWS ||
      !Array.isArray(state.callups) || state.callups.length > MAX_RETAINED_CALLUPS ||
      !validDate(currentDate)) return false;

  const knownWindows = new Map();
  for (const window of state.windows) {
    if (!isRecord(window) || !Number.isSafeInteger(window.year) ||
        !["spring", "summer", "autumn", "winter"].includes(window.key) ||
        !["active", "completed"].includes(window.status)) return false;
    const expected = getInternationalWindows(window.year).find((item) => item.key === window.key);
    if (!expected || window.id !== expected.id ||
        window.startDate !== expected.startDate || window.endDate !== expected.endDate ||
        window.label !== expected.label || knownWindows.has(window.id) ||
        window.startDate > currentDate) return false;
    if (window.status === "active" && currentDate > window.endDate) return false;
    if (window.status === "completed" && currentDate <= window.endDate) return false;
    knownWindows.set(window.id, window);
  }

  const countries = new Map(database.countries.map((country) => [country.id, country]));
  const playerById = new Map(getWorldSquadPlayers(database).map((player) => [player.id, player]));
  const callupKeys = new Set();
  let highestSequence = 0;

  for (const callup of state.callups) {
    if (!isRecord(callup) || !sequenceOf(callup.id, "national-callup") ||
        !knownWindows.has(callup.windowId) ||
        !countries.has(callup.countryId) ||
        typeof callup.teamName !== "string" || !callup.teamName.trim() ||
        !validDate(callup.createdDate) ||
        callup.createdDate !== knownWindows.get(callup.windowId).startDate ||
        !["active", "completed"].includes(callup.status) ||
        !Array.isArray(callup.players) || callup.players.length !== 23 ||
        !Array.isArray(callup.changes) || callup.changes.length > MAX_CALLUP_CHANGES) return false;

    const key = callup.windowId + "::" + callup.countryId;
    if (callupKeys.has(key)) return false;
    callupKeys.add(key);
    highestSequence = Math.max(highestSequence, sequenceOf(callup.id, "national-callup"));

    const ids = new Set();
    const shirts = new Set();
    for (const player of callup.players) {
      const source = playerById.get(player?.playerId);
      if (!isRecord(player) || !source || ids.has(player.playerId) ||
          source.countryId !== callup.countryId || player.countryId !== callup.countryId ||
          source.name !== player.playerName || source.role !== player.role ||
          !["حراسة", "دفاع", "وسط", "هجوم"].includes(player.role) ||
          !Number.isInteger(player.age) || player.age !== source.age ||
          !Number.isFinite(player.rating) || player.rating < 1 || player.rating > 99 ||
          !Number.isFinite(player.potential) || player.potential < player.rating || player.potential > 99 ||
          !Number.isFinite(player.fitness) || player.fitness < 0 || player.fitness > 100 ||
          typeof player.currentClubId !== "string" || !player.currentClubId.trim() ||
          !Number.isInteger(player.shirtNumber) || player.shirtNumber < 1 || player.shirtNumber > 23 ||
          shirts.has(player.shirtNumber) || !["called", "withdrawn"].includes(player.status)) return false;
      ids.add(player.playerId);
      shirts.add(player.shirtNumber);
    }

    const changesIds = new Set();
    for (const change of callup.changes) {
      if (!isRecord(change) || typeof change.id !== "string" || !change.id.trim() ||
          changesIds.has(change.id) || !["injury-withdrawal", "replacement"].includes(change.type) ||
          !validDate(change.date) || change.date < callup.createdDate ||
          change.date > currentDate ||
          typeof change.playerId !== "string" || !change.playerId.trim() ||
          typeof change.playerName !== "string" || !change.playerName.trim() ||
          !["حراسة", "دفاع", "وسط", "هجوم"].includes(change.role) ||
          (change.replacementPlayerId !== null &&
            (typeof change.replacementPlayerId !== "string" || !change.replacementPlayerId.trim()))) return false;
      changesIds.add(change.id);
    }
  }

  if (callupKeys.size !== state.callups.length || state.nextCallupSequence <= highestSequence) return false;
  return state.windows.every((window) =>
    window.status === "completed" || window.status === "active"
  );
}

/**
 * Processes one career date. Every window and country pair is issued exactly
 * once. Injured called players are withdrawn and replaced by a fit player of
 * the same nationality and role when a valid replacement exists.
 */
export function advanceInternationalWindows(save, database = WORLD_DATABASE) {
  const currentDate = save?.world?.currentDate;
  if (!validDate(currentDate) || !isRecord(save?.world)) {
    throw new TypeError("حالة المسيرة غير صالحة لتحديث التوقف الدولي.");
  }

  const currentState = isRecord(save.world.nationalTeams)
    ? save.world.nationalTeams
    : createInitialNationalTeamState();
  if (!isValidNationalTeamState(currentState, currentDate, database)) {
    throw new TypeError("سجل المنتخبات الوطنية غير صالح.");
  }
  if (currentState.lastProcessedDate && currentDate <= currentState.lastProcessedDate) {
    return save;
  }

  const year = Number(currentDate.slice(0, 4));
  const windowStartingToday = getInternationalWindows(year)
    .find((window) => window.startDate === currentDate);
  let windows = [...currentState.windows];
  let callups = [...currentState.callups];
  let nextCallupSequence = currentState.nextCallupSequence;
  let nextState = currentState;
  let nextSave = save;

  if (windowStartingToday && !windows.some((window) => window.id === windowStartingToday.id)) {
    const window = { ...windowStartingToday, status: "active" };
    windows.push(window);
    const playerDevelopment = save.world.football?.playerDevelopment ?? null;
    const transferState = save.world.transfers ?? null;

    for (const country of [...database.countries].sort((a, b) => compareText(a.id, b.id))) {
      const selected = selectNationalTeamSquad(country.id, {
        database,
        playerDevelopment
      });
      const players = selected.players.map((player) => {
        const source = findSourcePlayer(player.playerId, database);
        return toCallupPlayer(
          { ...source, ...player, id: player.playerId, name: player.playerName },
          player.shirtNumber,
          transferState,
          currentDate,
          database
        );
      });
      callups.push({
        id: "national-callup-" + nextCallupSequence,
        windowId: window.id,
        countryId: country.id,
        teamName: selected.nameAr,
        createdDate: currentDate,
        status: "active",
        players,
        changes: []
      });
      nextCallupSequence += 1;
    }

    nextState = { ...nextState, windows, callups, nextCallupSequence };
    nextSave = appendWindowEvent(nextSave, window, database.countries.length);
  }

  const playerDevelopment = save.world.football?.playerDevelopment ?? null;
  const developmentById = getDevelopmentById(playerDevelopment);
  const activeWindowIds = new Set(windows
    .filter((window) => currentDate >= window.startDate && currentDate <= window.endDate)
    .map((window) => window.id));

  callups = callups.map((callup) => {
    if (!activeWindowIds.has(callup.windowId) || callup.status !== "active") return callup;
    const window = windows.find((item) => item.id === callup.windowId);
    const players = [...callup.players];
    const changes = [...callup.changes];
    const alreadyChanged = new Set(changes.map((change) => change.id));
    let changed = false;

    for (let index = 0; index < players.length; index += 1) {
      const called = players[index];
      if (called.status === "called" && (developmentById.get(called.playerId)?.injuryDays ?? 0) > 0) {
        const changeId = callup.id + "-withdrawal-" + called.playerId + "-" + currentDate;
        if (!alreadyChanged.has(changeId)) {
          changes.push({
            id: changeId,
            type: "injury-withdrawal",
            date: currentDate,
            playerId: called.playerId,
            playerName: called.playerName,
            role: called.role,
            replacementPlayerId: null
          });
          alreadyChanged.add(changeId);
        }
        players[index] = { ...called, status: "withdrawn" };
        changed = true;
      }

      if (players[index].status !== "withdrawn") continue;
      const withdrawn = players[index];
      const excludedPlayerIds = players
        .filter((item, itemIndex) => itemIndex !== index && item.status === "called")
        .map((item) => item.playerId);
      excludedPlayerIds.push(withdrawn.playerId);
      const replacement = getEligibleNationalTeamPlayers(callup.countryId, {
        database,
        playerDevelopment,
        excludedPlayerIds
      }).find((candidate) => candidate.role === withdrawn.role);

      if (!replacement) continue;
      const transferState = save.world.transfers ?? null;
      const replacementPlayer = toCallupPlayer(
        replacement,
        withdrawn.shirtNumber,
        transferState,
        currentDate,
        database
      );
      players[index] = replacementPlayer;
      const changeId = callup.id + "-replacement-" + withdrawn.playerId + "-" + replacement.id + "-" + currentDate;
      if (!alreadyChanged.has(changeId)) {
        changes.push({
          id: changeId,
          type: "replacement",
          date: currentDate,
          playerId: withdrawn.playerId,
          playerName: withdrawn.playerName,
          role: withdrawn.role,
          replacementPlayerId: replacement.id
        });
        alreadyChanged.add(changeId);
      }
      changed = true;
    }

    return changed
      ? { ...callup, players, changes: changes.slice(-MAX_CALLUP_CHANGES) }
      : callup;
  });

  const completedWindowIds = new Set(windows
    .filter((window) => currentDate > window.endDate && window.status !== "completed")
    .map((window) => window.id));
  if (completedWindowIds.size > 0) {
    windows = windows.map((window) => completedWindowIds.has(window.id)
      ? { ...window, status: "completed" }
      : window);
    callups = callups.map((callup) => completedWindowIds.has(callup.windowId)
      ? { ...callup, status: "completed" }
      : callup);
  }

  const keepAfterYear = year - (MAX_HISTORY_YEARS - 1);
  windows = windows
    .filter((window) => window.year >= keepAfterYear)
    .slice(-MAX_RETAINED_WINDOWS);
  callups = callups
    .filter((callup) => Number(callup.createdDate.slice(0, 4)) >= keepAfterYear)
    .slice(-MAX_RETAINED_CALLUPS);

  nextState = {
    ...nextState,
    windows,
    callups,
    nextCallupSequence,
    lastProcessedDate: currentDate
  };

  if (!isValidNationalTeamState(nextState, currentDate, database)) {
    throw new TypeError("تعذر اعتماد سجل التوقف الدولي الناتج.");
  }
  return {
    ...nextSave,
    world: { ...nextSave.world, nationalTeams: nextState }
  };
}
