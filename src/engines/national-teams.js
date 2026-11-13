import { WORLD_DATABASE, getWorldSquadPlayers } from "../data/world-database.js";

export const NATIONAL_TEAM_SQUAD_SIZE = 23;

export const NATIONAL_TEAM_ROLE_QUOTAS = Object.freeze({
  "حراسة": 3,
  "دفاع": 7,
  "وسط": 7,
  "هجوم": 6
});

const ROLE_ORDER = Object.freeze(["حراسة", "دفاع", "وسط", "هجوم"]);
const DEVELOPMENT_MAX_INJURY_DAYS = 3650;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareCandidates(left, right) {
  return right.selectionScore - left.selectionScore ||
    right.rating - left.rating ||
    right.potential - left.potential ||
    left.age - right.age ||
    compareText(left.id, right.id);
}

function developmentByPlayerId(playerDevelopment) {
  return new Map((Array.isArray(playerDevelopment?.players) ? playerDevelopment.players : [])
    .filter((item) => isRecord(item) && typeof item.playerId === "string")
    .map((item) => [item.playerId, item]));
}

function resolveCountry(countryId, database) {
  if (typeof countryId !== "string" || !countryId.trim()) {
    throw new TypeError("معرف الدولة مطلوب لاختيار المنتخب.");
  }
  const country = database.countries.find((item) => item.id === countryId);
  if (!country) throw new TypeError("الدولة غير موجودة في قاعدة العالم: " + countryId);
  return country;
}

function resolveCandidate(player, development) {
  const rating = Number.isFinite(development?.rating) ? development.rating : player.rating;
  const potential = Number.isFinite(development?.potential) ? development.potential : player.potential;
  const injuryDays = Number.isSafeInteger(development?.injuryDays) && development.injuryDays >= 0 &&
    development.injuryDays <= DEVELOPMENT_MAX_INJURY_DAYS ? development.injuryDays : 0;
  const fitness = Number.isFinite(development?.fitness)
    ? Math.max(0, Math.min(100, development.fitness))
    : 100;
  return {
    ...player,
    rating,
    potential,
    injuryDays,
    fitness,
    selectionScore: rating + Math.max(0, potential - rating) * 0.12 + fitness * 0.025
  };
}

/**
 * Builds the national-team directory from the countries already represented
 * in the fictional world database. Nationality is immutable player identity;
 * a club transfer never changes the country a player is eligible to represent.
 */
export function getNationalTeamProfiles(database = WORLD_DATABASE) {
  if (!isRecord(database) || !Array.isArray(database.countries)) {
    throw new TypeError("قاعدة الدول غير متاحة لإنشاء المنتخبات.");
  }
  return [...database.countries]
    .sort((left, right) => compareText(left.id, right.id))
    .map((country) => ({
      id: "national-team-" + country.id,
      countryId: country.id,
      countryCode: country.code,
      nameAr: "منتخب " + country.nameAr,
      nameEn: country.nameEn + " National Team",
      confederation: country.confederation,
      squadSize: NATIONAL_TEAM_SQUAD_SIZE
    }));
}

/**
 * Returns healthy players of one nationality, ranked deterministically using
 * the live development rating, potential and fitness where available.
 */
export function getEligibleNationalTeamPlayers(
  countryId,
  { database = WORLD_DATABASE, playerDevelopment = null, excludedPlayerIds = [] } = {}
) {
  const country = resolveCountry(countryId, database);
  if (!Array.isArray(excludedPlayerIds) ||
      !excludedPlayerIds.every((id) => typeof id === "string" && id.trim())) {
    throw new TypeError("قائمة استبعاد اللاعبين غير صالحة.");
  }

  const excluded = new Set(excludedPlayerIds);
  const development = developmentByPlayerId(playerDevelopment);
  return getWorldSquadPlayers(database)
    .filter((player) => player.countryId === country.id && !excluded.has(player.id))
    .map((player) => resolveCandidate(player, development.get(player.id)))
    .filter((player) =>
      player.injuryDays === 0 &&
      player.fitness > 0 &&
      ROLE_ORDER.includes(player.role) &&
      Number.isFinite(player.rating) && player.rating >= 1 && player.rating <= 99 &&
      Number.isFinite(player.potential) && player.potential >= player.rating && player.potential <= 99
    )
    .sort(compareCandidates);
}

/**
 * Selects a deterministic 23-player squad with positional depth. It never
 * fills a national team with players of another nationality or anonymous
 * match-simulation players.
 */
export function selectNationalTeamSquad(
  countryId,
  { database = WORLD_DATABASE, playerDevelopment = null, excludedPlayerIds = [] } = {}
) {
  const country = resolveCountry(countryId, database);
  const candidates = getEligibleNationalTeamPlayers(country.id, {
    database,
    playerDevelopment,
    excludedPlayerIds
  });
  const selected = [];

  for (const role of ROLE_ORDER) {
    const required = NATIONAL_TEAM_ROLE_QUOTAS[role];
    const available = candidates.filter((player) => player.role === role);
    if (available.length < required) {
      throw new RangeError(
        "لا يوجد عدد كافٍ من اللاعبين المتاحين في مركز " + role +
        " لمنتخب " + country.nameAr + ". المطلوب " + required + " والمتاح " + available.length + "."
      );
    }
    selected.push(...available.slice(0, required));
  }

  const squad = selected.map((player, index) => ({
    playerId: player.id,
    playerName: player.name,
    countryId: player.countryId,
    clubId: player.clubId,
    role: player.role,
    age: player.age,
    rating: player.rating,
    potential: player.potential,
    fitness: player.fitness,
    shirtNumber: index + 1
  }));

  const nationalTeam = {
    id: "national-team-" + country.id,
    countryId: country.id,
    countryCode: country.code,
    nameAr: "منتخب " + country.nameAr,
    nameEn: country.nameEn + " National Team",
    confederation: country.confederation,
    squadSize: squad.length,
    players: squad
  };

  if (!isValidNationalTeamSquad(nationalTeam, country.id, database)) {
    throw new TypeError("تعذر إنشاء قائمة منتخب سليمة للدولة: " + country.id);
  }
  return nationalTeam;
}

export function isValidNationalTeamSquad(squad, countryId, database = WORLD_DATABASE) {
  const country = database?.countries?.find((item) => item.id === countryId);
  if (!country || !isRecord(squad) ||
      squad.id !== "national-team-" + country.id ||
      squad.countryId !== country.id ||
      squad.countryCode !== country.code ||
      squad.squadSize !== NATIONAL_TEAM_SQUAD_SIZE ||
      !Array.isArray(squad.players) ||
      squad.players.length !== NATIONAL_TEAM_SQUAD_SIZE) return false;

  const worldPlayers = new Map(getWorldSquadPlayers(database).map((player) => [player.id, player]));
  const ids = new Set();
  const shirtNumbers = new Set();
  const roleCounts = new Map(ROLE_ORDER.map((role) => [role, 0]));

  for (const player of squad.players) {
    const source = worldPlayers.get(player?.playerId);
    if (!isRecord(player) || !source || ids.has(player.playerId) ||
        source.countryId !== country.id || player.countryId !== country.id ||
        player.clubId !== source.clubId ||
        player.playerName !== source.name ||
        !ROLE_ORDER.includes(player.role) || player.role !== source.role ||
        !Number.isInteger(player.age) || player.age !== source.age ||
        !Number.isFinite(player.rating) || player.rating < 1 || player.rating > 99 ||
        !Number.isFinite(player.potential) || player.potential < player.rating || player.potential > 99 ||
        !Number.isFinite(player.fitness) || player.fitness <= 0 || player.fitness > 100 ||
        !Number.isInteger(player.shirtNumber) || player.shirtNumber < 1 ||
        player.shirtNumber > NATIONAL_TEAM_SQUAD_SIZE || shirtNumbers.has(player.shirtNumber)) return false;
    ids.add(player.playerId);
    shirtNumbers.add(player.shirtNumber);
    roleCounts.set(player.role, roleCounts.get(player.role) + 1);
  }

  return ROLE_ORDER.every((role) => roleCounts.get(role) === NATIONAL_TEAM_ROLE_QUOTAS[role]);
}
