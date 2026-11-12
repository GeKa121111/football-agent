const SKILL_KEYS = Object.freeze([
  "finishing",
  "pace",
  "passing",
  "dribbling",
  "defending",
  "stamina",
  "handling",
  "reflexes",
  "positioning"
]);

const OUTFIELD_KEYS = Object.freeze([
  "finishing", "pace", "passing", "dribbling", "defending", "stamina"
]);
const GOALKEEPER_KEYS = Object.freeze([
  "handling", "reflexes", "positioning", "passing", "stamina", "pace"
]);

export const TRAINING_FOCUSES = Object.freeze({
  balanced: { label: "متوازن", outfield: OUTFIELD_KEYS, goalkeeper: GOALKEEPER_KEYS },
  attacking: { label: "هجومي", outfield: ["finishing", "dribbling", "pace"], goalkeeper: ["passing", "positioning"] },
  technical: { label: "مهاري", outfield: ["passing", "dribbling", "finishing"], goalkeeper: ["passing", "handling"] },
  defending: { label: "دفاعي", outfield: ["defending", "positioning", "stamina"], goalkeeper: ["positioning", "reflexes"] },
  physical: { label: "بدني", outfield: ["pace", "stamina"], goalkeeper: ["stamina", "pace"] },
  goalkeeping: { label: "حراسة المرمى", outfield: [], goalkeeper: ["handling", "reflexes", "positioning"] },
  recovery: { label: "استشفاء", outfield: [], goalkeeper: [] }
});

const INTENSITY_FACTORS = Object.freeze({
  light: 0.65,
  normal: 1,
  intense: 1.3
});

const MAX_TRAINING_HISTORY = 6000;

export const TRAINING_BALANCE = Object.freeze({
  dailyFatigueRecovery: 3,
  dailyFitnessRecovery: 2,
  weeklySkillGainBase: 0.012,
  weeklyPotentialGapGain: 0.0012,
  injuryFatigueThreshold: 55,
  injuryFatigueRange: 35,
  injuryRiskByIntensity: Object.freeze({ light: 0.001, normal: 0.006, intense: 0.022 })
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dateParts(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

function seedRandom(seed) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function developmentRating(player) {
  const keys = player.role === "حراسة" ? GOALKEEPER_KEYS : OUTFIELD_KEYS;
  return roundTo(keys.reduce((sum, key) => sum + player.skills[key], 0) / keys.length, 2);
}

function ageGrowthFactor(age) {
  if (age <= 20) return 1.15;
  if (age <= 24) return 1;
  if (age <= 29) return 0.72;
  if (age <= 32) return 0.4;
  return 0;
}

function focusSkills(player, focus) {
  const configuration = TRAINING_FOCUSES[focus];
  return player.role === "حراسة" ? configuration.goalkeeper : configuration.outfield;
}

function createDevelopmentPlayer(player) {
  const rating = clamp(Number(player.rating) || 50, 1, 99);
  const skills = Object.fromEntries(SKILL_KEYS.map((key) => [key, player.role === "حراسة" &&
    !GOALKEEPER_KEYS.includes(key) ? 20 : player.role !== "حراسة" &&
    !OUTFIELD_KEYS.includes(key) ? 20 : rating]));
  return {
    playerId: player.id,
    playerName: player.name,
    clubId: player.clubId,
    role: player.role,
    age: player.age,
    potential: player.potential,
    rating,
    skills,
    fitness: 100,
    fatigue: 0,
    injuryDays: 0,
    trainingFocus: player.role === "حراسة" ? "goalkeeping" : "balanced",
    trainingIntensity: "normal",
    appearances: 0,
    minutesPlayed: 0,
    goals: 0,
    assists: 0,
    averageMatchRating: null,
    lastTrainingDate: null
  };
}

/** Creates persistent progress records for the real fictional world-player database. */
export function createInitialPlayerDevelopmentState(players = []) {
  if (!Array.isArray(players)) throw new TypeError("قائمة اللاعبين غير صالحة.");
  const ids = players.map((player) => player?.id);
  if (ids.some((id) => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) {
    throw new TypeError("معرفات اللاعبين مفقودة أو مكررة.");
  }
  return {
    season: 1,
    players: players.map(createDevelopmentPlayer),
    trainingHistory: []
  };
}

export function setPlayerTrainingPlan(state, playerId, focus, intensity = "normal") {
  if (!isRecord(state) || !Array.isArray(state.players) ||
      typeof playerId !== "string" || !Object.hasOwn(TRAINING_FOCUSES, focus) ||
      !Object.hasOwn(INTENSITY_FACTORS, intensity)) {
    return { state, changed: false, reason: "invalid-plan" };
  }
  const player = state.players.find((item) => item.playerId === playerId);
  if (!player) return { state, changed: false, reason: "player-not-found" };
  if (focus === "goalkeeping" && player.role !== "حراسة") {
    return { state, changed: false, reason: "role-mismatch" };
  }

  return {
    changed: true,
    reason: null,
    state: {
      ...state,
      players: state.players.map((item) => item.playerId === playerId
        ? { ...item, trainingFocus: focus, trainingIntensity: intensity }
        : item)
    }
  };
}

/**
 * Advances recovery every day, trains once each Monday, and ages players only
 * when a new July-to-June season begins. The input state is never mutated.
 */
export function advancePlayerDevelopmentDay(state, dateKey, season, { deferInjuryRecovery = false } = {}) {
  const date = dateParts(dateKey);
  if (!isRecord(state) || !Array.isArray(state.players) ||
      !Array.isArray(state.trainingHistory) || !date ||
      !Number.isSafeInteger(season) || season < state.season ||
      typeof deferInjuryRecovery !== "boolean") {
    throw new TypeError("بيانات تطور اللاعبين أو تاريخ التقدم غير صالحة.");
  }

  const seasonChanged = season > state.season;
  const isTrainingDay = date.getUTCDay() === 1;
  const sessions = [];
  const players = state.players.map((original) => {
    let player = {
      ...original,
      // Keep an injured player unavailable throughout this day's training and
      // match selection. Full-season simulation recovers them after fixtures.
      injuryDays: original.injuryDays,
      fatigue: roundTo(Math.max(0, original.fatigue - TRAINING_BALANCE.dailyFatigueRecovery), 1),
      fitness: roundTo(Math.min(100, original.fitness + TRAINING_BALANCE.dailyFitnessRecovery), 1)
    };

    if (seasonChanged) {
      player.age = Math.min(45, player.age + 1);
      if (player.age >= 32) {
        const decline = Math.min(0.6, 0.08 * (player.age - 31));
        const keys = player.role === "حراسة" ? GOALKEEPER_KEYS : OUTFIELD_KEYS;
        const skills = { ...player.skills };
        keys.forEach((key) => {
          skills[key] = roundTo(Math.max(1, skills[key] - decline), 2);
        });
        player.skills = skills;
      }
    }

    if (!isTrainingDay || player.injuryDays > 0) return {
      ...player,
      injuryDays: !deferInjuryRecovery && player.injuryDays > 0
        ? player.injuryDays - 1
        : player.injuryDays,
      rating: Math.min(player.potential, developmentRating(player))
    };

    const focus = TRAINING_FOCUSES[player.trainingFocus] ? player.trainingFocus : "balanced";
    if (focus === "recovery") {
      player = {
        ...player,
        fitness: roundTo(Math.min(100, player.fitness + 12), 1),
        fatigue: roundTo(Math.max(0, player.fatigue - 12), 1),
        lastTrainingDate: dateKey
      };
      sessions.push({
        id: "training-" + dateKey + "-" + player.playerId,
        date: dateKey,
        playerId: player.playerId,
        focus,
        intensity: player.trainingIntensity,
        ratingBefore: player.rating,
        ratingAfter: player.rating,
        improvement: 0,
        outcome: "recovery"
      });
      return player;
    }

    const factor = INTENSITY_FACTORS[player.trainingIntensity] ?? 1;
    const ageFactor = ageGrowthFactor(player.age);
    const potentialGap = Math.max(0, player.potential - player.rating);
    const conditionFactor = player.fitness < 40 ? 0.5 : player.fitness < 65 ? 0.75 : 1;
    const gain = ageFactor === 0
      ? 0
      : (TRAINING_BALANCE.weeklySkillGainBase + potentialGap * TRAINING_BALANCE.weeklyPotentialGapGain) * factor * ageFactor * conditionFactor;
    const selectedSkills = focusSkills(player, focus);
    const skills = { ...player.skills };
    selectedSkills.forEach((key) => {
      if (key in skills) skills[key] = roundTo(Math.min(99, skills[key] + gain), 2);
    });

    const ratingBefore = player.rating;
    player = {
      ...player,
      skills,
      rating: roundTo(Math.min(player.potential, developmentRating({ ...player, skills })), 2),
      fatigue: roundTo(Math.min(100, player.fatigue + (player.trainingIntensity === "intense" ? 9 : player.trainingIntensity === "light" ? 3 : 6)), 1),
      fitness: roundTo(Math.max(0, player.fitness - (player.trainingIntensity === "intense" ? 8 : player.trainingIntensity === "light" ? 2 : 5)), 1),
      lastTrainingDate: dateKey
    };

    const random = seedRandom(player.playerId + "|" + dateKey + "|" + focus + "|" + player.trainingIntensity);
    const fatigueRiskFactor = clamp(
      (player.fatigue - TRAINING_BALANCE.injuryFatigueThreshold) / TRAINING_BALANCE.injuryFatigueRange,
      0,
      1
    );
    const injuryRisk = TRAINING_BALANCE.injuryRiskByIntensity[player.trainingIntensity] * fatigueRiskFactor;
    if (injuryRisk > 0 && random() < injuryRisk) {
      player.injuryDays = 3 + Math.floor(random() * 8);
    }

    sessions.push({
      id: "training-" + dateKey + "-" + player.playerId,
      date: dateKey,
      playerId: player.playerId,
      focus,
      intensity: player.trainingIntensity,
      ratingBefore,
      ratingAfter: player.rating,
      improvement: roundTo(player.rating - ratingBefore, 2),
      outcome: player.injuryDays > 0 ? "overload" : "trained"
    });
    return player;
  });

  const trainingHistory = [...state.trainingHistory, ...sessions].slice(-MAX_TRAINING_HISTORY);
  return {
    season,
    players,
    trainingHistory
  };
}

/**
 * Adds newly introduced roster identities to an existing development save
 * without resetting progress for players already present.
 */
export function mergePlayerDevelopmentRoster(state, players = []) {
  if (!Array.isArray(players)) throw new TypeError("قائمة لاعبي التشكيلات غير صالحة.");
  if (!isRecord(state) || !Array.isArray(state.players)) {
    return createInitialPlayerDevelopmentState(players);
  }
  const existingIds = new Set(state.players.map((player) => player?.playerId));
  const additions = players
    .filter((player) => !existingIds.has(player.id))
    .map(createDevelopmentPlayer);
  return additions.length === 0
    ? state
    : { ...state, players: [...state.players, ...additions] };
}

/**
 * Reduces injury counters for players who were already injured at the start
 * of the completed day. Newly injured players are deliberately not included.
 */
export function recoverPlayerInjuries(state, injuredPlayerIds) {
  if (!isRecord(state) || !Array.isArray(state.players) ||
      !Array.isArray(injuredPlayerIds) ||
      !injuredPlayerIds.every((id) => typeof id === "string" && id.trim())) {
    throw new TypeError("بيانات تعافي اللاعبين المصابين غير صالحة.");
  }
  const injuredIds = new Set(injuredPlayerIds);
  if (injuredIds.size === 0) return state;
  let changed = false;
  const players = state.players.map((player) => {
    if (!injuredIds.has(player.playerId) || player.injuryDays <= 0) return player;
    changed = true;
    return { ...player, injuryDays: Math.max(0, player.injuryDays - 1) };
  });
  return changed ? { ...state, players } : state;
}

/** Applies match minutes, output and injuries to real world players in the saved development state. */
export function recordPlayerMatchPerformances(state, result, dateKey) {
  if (!isRecord(state) || !Array.isArray(state.players) ||
      !isRecord(result) || !Array.isArray(result.playerPerformances) || !dateParts(dateKey)) {
    throw new TypeError("بيانات أداء المباراة غير صالحة.");
  }
  const performanceById = new Map(result.playerPerformances
    .filter((item) => item.simulationOnly !== true)
    .map((item) => [item.playerId, item]));
  const injuryById = new Map((result.events ?? [])
    .filter((event) => event.type === "injury")
    .map((event) => [event.playerId, event.daysOut]));
  if (performanceById.size === 0) return state;

  const players = state.players.map((player) => {
    const performance = performanceById.get(player.playerId);
    if (!performance) return player;
    const appearances = player.appearances + (performance.minutesPlayed > 0 ? 1 : 0);
    const minutesPlayed = player.minutesPlayed + performance.minutesPlayed;
    const goals = player.goals + performance.goals;
    const assists = player.assists + performance.assists;
    const ratingTotal = (player.averageMatchRating ?? 0) * player.appearances + performance.rating;
    const averageMatchRating = appearances > 0 ? roundTo(ratingTotal / appearances, 2) : null;
    return {
      ...player,
      appearances,
      minutesPlayed,
      goals,
      assists,
      averageMatchRating,
      injuryDays: Math.max(player.injuryDays, injuryById.get(player.playerId) ?? 0),
      fatigue: roundTo(Math.min(100, player.fatigue + Math.ceil(performance.minutesPlayed / 30)), 1),
      fitness: roundTo(Math.max(0, player.fitness - Math.ceil(performance.minutesPlayed / 25)), 1)
    };
  });
  return { ...state, players };
}

export function isValidPlayerDevelopmentState(state, season) {
  if (!isRecord(state) || !Number.isSafeInteger(state.season) ||
      state.season < 1 || state.season !== season ||
      !Array.isArray(state.players) || state.players.length > 10000 ||
      !Array.isArray(state.trainingHistory) || state.trainingHistory.length > MAX_TRAINING_HISTORY) {
    return false;
  }
  const ids = state.players.map((player) => player?.playerId);
  if (ids.some((id) => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) return false;
  if (!state.players.every((player) =>
    isRecord(player) &&
    typeof player.playerName === "string" && player.playerName.trim() &&
    typeof player.clubId === "string" && player.clubId.trim() &&
    ["هجوم", "وسط", "دفاع", "حراسة"].includes(player.role) &&
    Number.isInteger(player.age) && player.age >= 15 && player.age <= 45 &&
    Number.isInteger(player.potential) && player.potential >= 1 && player.potential <= 99 &&
    Number.isFinite(player.rating) && player.rating >= 1 && player.rating <= player.potential &&
    isRecord(player.skills) && SKILL_KEYS.every((key) =>
      Number.isFinite(player.skills[key]) && player.skills[key] >= 1 && player.skills[key] <= 99) &&
    Number.isFinite(player.fitness) && player.fitness >= 0 && player.fitness <= 100 &&
    Number.isFinite(player.fatigue) && player.fatigue >= 0 && player.fatigue <= 100 &&
    Number.isInteger(player.injuryDays) && player.injuryDays >= 0 && player.injuryDays <= 365 &&
    Object.hasOwn(TRAINING_FOCUSES, player.trainingFocus) &&
    Object.hasOwn(INTENSITY_FACTORS, player.trainingIntensity) &&
    Number.isSafeInteger(player.appearances) && player.appearances >= 0 &&
    Number.isSafeInteger(player.minutesPlayed) && player.minutesPlayed >= 0 &&
    Number.isSafeInteger(player.goals) && player.goals >= 0 &&
    Number.isSafeInteger(player.assists) && player.assists >= 0 &&
    (player.averageMatchRating === null ||
      (Number.isFinite(player.averageMatchRating) && player.averageMatchRating >= 4 && player.averageMatchRating <= 10)) &&
    (player.lastTrainingDate === null || dateParts(player.lastTrainingDate) !== null)
  )) return false;

  const historyIds = state.trainingHistory.map((item) => item?.id);
  return historyIds.every((id) => typeof id === "string" && id.trim()) &&
    new Set(historyIds).size === historyIds.length &&
    state.trainingHistory.every((item) =>
      isRecord(item) &&
      dateParts(item.date) !== null &&
      ids.includes(item.playerId) &&
      Object.hasOwn(TRAINING_FOCUSES, item.focus) &&
      Object.hasOwn(INTENSITY_FACTORS, item.intensity) &&
      Number.isFinite(item.ratingBefore) && item.ratingBefore >= 1 && item.ratingBefore <= 99 &&
      Number.isFinite(item.ratingAfter) && item.ratingAfter >= 1 && item.ratingAfter <= 99 &&
      Number.isFinite(item.improvement) &&
      ["recovery", "trained", "overload"].includes(item.outcome)
    );
}

export function getPlayerDevelopmentRecord(state, playerId) {
  return state?.players?.find((player) => player.playerId === playerId) ?? null;
}
