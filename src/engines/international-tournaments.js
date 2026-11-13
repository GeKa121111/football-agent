import { WORLD_DATABASE } from "../data/world-database.js";
import { selectNationalTeamSquad } from "./national-teams.js";

const CONFEDERATION_NAMES = Object.freeze({
  CAF: "كأس الأمم الأفريقية",
  UEFA: "بطولة أمم أوروبا",
  CONMEBOL: "كوبا أمريكا",
  AFC: "كأس آسيا",
  CONCACAF: "الكأس الذهبية",
  OFC: "كأس أمم أوقيانوسيا"
});
const MAX_TOURNAMENT_TEAMS = 32;
const MAX_FIXTURES = 500;

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
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

function teamStrength(countryId, database, playerDevelopment) {
  const squad = selectNationalTeamSquad(countryId, { database, playerDevelopment });
  const starters = [...squad.players]
    .sort((left, right) => right.rating - left.rating || compareText(left.playerId, right.playerId))
    .slice(0, 11);
  return Number((starters.reduce((sum, player) => sum + player.rating, 0) / starters.length).toFixed(2));
}

function makeTeam(country, strength, seed) {
  return {
    id: "national-team-" + country.id,
    countryId: country.id,
    countryCode: country.code,
    nameAr: "منتخب " + country.nameAr,
    confederation: country.confederation,
    strength,
    seed
  };
}

function seededGroups(teams) {
  const groups = [[], []];
  teams.forEach((team, index) => groups[index % 2].push(team.id));
  return groups.map((teamIds, index) => ({
    id: "group-" + String.fromCharCode(65 + index),
    nameAr: "المجموعة " + String.fromCharCode(65 + index),
    teamIds
  })).filter((group) => group.teamIds.length > 0);
}

function roundRobin(teamIds) {
  const rotation = [...teamIds].sort(compareText);
  if (rotation.length % 2) rotation.push(null);
  const rounds = [];
  for (let round = 0; round < rotation.length - 1; round += 1) {
    const pairings = [];
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const home = rotation[index];
      const away = rotation[rotation.length - 1 - index];
      if (home && away) pairings.push({
        homeTeamId: round % 2 ? away : home,
        awayTeamId: round % 2 ? home : away
      });
    }
    rounds.push(pairings);
    const fixed = rotation[0];
    const rest = rotation.slice(1);
    rest.unshift(rest.pop());
    rotation.splice(0, rotation.length, fixed, ...rest);
  }
  return rounds;
}

function createFixture(tournament, stage, round, date, pairing, groupId = null, index = 0) {
  return {
    id: [
      "international", tournament.season, tournament.id, stage,
      "round-" + round, groupId ?? "knockout", String(index + 1).padStart(2, "0"),
      pairing.homeTeamId, pairing.awayTeamId
    ].join("-"),
    tournamentId: tournament.id,
    season: tournament.season,
    stage,
    round,
    groupId,
    date,
    homeTeamId: pairing.homeTeamId,
    awayTeamId: pairing.awayTeamId,
    status: "scheduled"
  };
}

function createGroupFixtures(tournament, startDate) {
  const fixtures = [];
  for (const group of tournament.groups) {
    const rounds = roundRobin(group.teamIds);
    rounds.forEach((pairings, roundIndex) => {
      pairings.forEach((pairing, pairingIndex) => {
        fixtures.push(createFixture(
          tournament, "groups", roundIndex + 1,
          addDays(startDate, roundIndex * 4),
          pairing, group.id, pairingIndex
        ));
      });
    });
  }
  return fixtures;
}

function createKnockoutFixtures(tournament, stage, pairings, startDate) {
  return pairings.map((pairing, index) =>
    createFixture(tournament, "knockout", stage === "final" ? 99 : stage === "semi-final" ? 98 : 97,
      startDate, pairing, null, index)
  ).map((fixture) => ({ ...fixture, phase: stage }));
}

/**
 * Creates deterministic continental national-team tournaments and a World Cup
 * qualification plan from the countries represented in the game world.
 * Every current-world country is eligible for its confederation event; the
 * World Cup takes the top two by published squad-strength seeding per confederation.
 */
export function createInternationalTournamentPlan({
  season = 1,
  startDate = "2027-06-01",
  database = WORLD_DATABASE,
  playerDevelopment = null,
  worldCupSlotsPerConfederation = 2
} = {}) {
  if (!Number.isSafeInteger(season) || season < 1 || !isDate(startDate) ||
      !Number.isSafeInteger(worldCupSlotsPerConfederation) ||
      worldCupSlotsPerConfederation < 1 || worldCupSlotsPerConfederation > 8 ||
      !Array.isArray(database?.countries) || database.countries.length < 2) {
    throw new TypeError("مدخلات خطة البطولات الدولية غير صالحة.");
  }

  const teamsByConfederation = new Map();
  for (const country of database.countries) {
    if (!CONFEDERATION_NAMES[country.confederation]) continue;
    const list = teamsByConfederation.get(country.confederation) ?? [];
    list.push(makeTeam(country, teamStrength(country.id, database, playerDevelopment), 0));
    teamsByConfederation.set(country.confederation, list);
  }

  const continental = [];
  const qualifiedByConfederation = [];
  for (const [confederation, unsorted] of [...teamsByConfederation.entries()]
    .sort(([left], [right]) => compareText(left, right))) {
    const ranked = unsorted
      .sort((left, right) => right.strength - left.strength || compareText(left.countryId, right.countryId))
      .map((team, index) => ({ ...team, seed: index + 1 }));
    if (ranked.length < 2 || ranked.length > MAX_TOURNAMENT_TEAMS) continue;

    const groups = ranked.length >= 4 ? seededGroups(ranked) : ranked.length === 3
      ? [{ id: "group-A", nameAr: "المجموعة A", teamIds: ranked.map((team) => team.id) }]
      : [];
    const tournament = {
      id: "continental-" + confederation.toLowerCase() + "-" + season,
      nameAr: CONFEDERATION_NAMES[confederation],
      type: "continental",
      confederation,
      season,
      status: "scheduled",
      stage: groups.length ? "groups" : "final",
      teams: ranked,
      groups,
      qualifiersPerGroup: 2,
      qualificationRule: "جميع منتخبات الاتحاد الموجودة في قاعدة العالم مؤهلة؛ الترتيب الأولي حسب قوة أفضل 11 لاعبًا.",
      championTeamId: null,
      fixtures: []
    };
    tournament.fixtures = groups.length
      ? createGroupFixtures(tournament, startDate)
      : createKnockoutFixtures(tournament, "final", [{
          homeTeamId: ranked[0].id,
          awayTeamId: ranked[1].id
        }], startDate);
    continental.push(tournament);
    qualifiedByConfederation.push(...ranked.slice(0, worldCupSlotsPerConfederation));
  }

  const worldTeams = qualifiedByConfederation
    .sort((left, right) =>
      compareText(left.confederation, right.confederation) ||
      left.seed - right.seed || compareText(left.countryId, right.countryId)
    )
    .map((team, index) => ({ ...team, worldCupSeed: index + 1 }));
  if (worldTeams.length < 4 || worldTeams.length > MAX_TOURNAMENT_TEAMS) {
    throw new RangeError("عدد المتأهلين إلى كأس العالم غير كافٍ أو يتجاوز الحد المسموح.");
  }
  const worldGroups = seededGroups(worldTeams);
  const worldCup = {
    id: "national-world-cup-" + season,
    nameAr: "كأس العالم للمنتخبات",
    type: "world",
    confederation: "FIFA",
    season,
    status: "scheduled",
    stage: "groups",
    teams: worldTeams,
    groups: worldGroups,
    qualifiersPerGroup: 2,
    qualificationRule: "يتأهل أفضل " + worldCupSlotsPerConfederation +
      " منتخبًا من كل اتحاد وفق ترتيب قوة التشكيلة المعلن؛ لا توجد قرعة تأهل عشوائية.",
    championTeamId: null,
    fixtures: []
  };
  worldCup.fixtures = createGroupFixtures(worldCup, addDays(startDate, 90));

  const plan = { season, generatedAt: startDate, continental, worldCup };
  if (!isValidInternationalTournamentPlan(plan)) {
    throw new TypeError("خطة البطولات الدولية الناتجة غير سليمة.");
  }
  return plan;
}

function normalizeResults(results) {
  if (!Array.isArray(results)) throw new TypeError("سجل نتائج البطولة غير صالح.");
  const normalized = new Map();
  for (const result of results) {
    if (!isRecord(result) || typeof result.fixtureId !== "string" || !result.fixtureId.trim()) {
      throw new TypeError("سجل نتيجة مباراة دولية غير صالح.");
    }
    if (normalized.has(result.fixtureId)) {
      throw new TypeError("تم تسجيل نتيجة مكررة للمباراة الدولية نفسها.");
    }
    normalized.set(result.fixtureId, result);
  }
  return normalized;
}

function standingsForGroup(tournament, group, results) {
  const rows = new Map(group.teamIds.map((teamId) => [teamId, {
    teamId, played: 0, wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0
  }]));
  const groupFixtures = tournament.fixtures.filter((fixture) =>
    fixture.stage === "groups" && fixture.groupId === group.id
  );
  for (const fixture of groupFixtures) {
    const result = results.get(fixture.id);
    if (!result) return null;
    if (result.homeTeamId !== fixture.homeTeamId || result.awayTeamId !== fixture.awayTeamId ||
        !Number.isSafeInteger(result.homeGoals) || result.homeGoals < 0 ||
        !Number.isSafeInteger(result.awayGoals) || result.awayGoals < 0) {
      throw new TypeError("نتيجة مباراة دولية لا تطابق المباراة المجدولة.");
    }
    const home = rows.get(fixture.homeTeamId);
    const away = rows.get(fixture.awayTeamId);
    if (!home || !away) throw new TypeError("مباراة تشير إلى منتخب خارج المجموعة.");
    home.played += 1;
    away.played += 1;
    home.goalsFor += result.homeGoals;
    home.goalsAgainst += result.awayGoals;
    away.goalsFor += result.awayGoals;
    away.goalsAgainst += result.homeGoals;
    if (result.homeGoals > result.awayGoals) {
      home.wins += 1; away.losses += 1; home.points += 3;
    } else if (result.awayGoals > result.homeGoals) {
      away.wins += 1; home.losses += 1; away.points += 3;
    } else {
      home.draws += 1; away.draws += 1; home.points += 1; away.points += 1;
    }
  }
  const teamById = new Map(tournament.teams.map((team) => [team.id, team]));
  return [...rows.values()].map((row) => ({
    ...row,
    goalDifference: row.goalsFor - row.goalsAgainst,
    strength: teamById.get(row.teamId)?.strength ?? 0
  })).sort((left, right) =>
    right.points - left.points ||
    right.goalDifference - left.goalDifference ||
    right.goalsFor - left.goalsFor ||
    right.wins - left.wins ||
    right.strength - left.strength ||
    compareText(left.teamId, right.teamId)
  );
}

/** Returns live group tables; a table is null until all its fixtures are played. */
export function getInternationalTournamentStandings(tournament, results = []) {
  if (!isRecord(tournament) || !Array.isArray(tournament.groups)) return [];
  const resultMap = normalizeResults(results);
  return tournament.groups.map((group) => ({
    groupId: group.id,
    nameAr: group.nameAr,
    standings: standingsForGroup(tournament, group, resultMap)
  }));
}

function knockoutWinner(fixture, result) {
  if (result.homeGoals > result.awayGoals) return fixture.homeTeamId;
  if (result.awayGoals > result.homeGoals) return fixture.awayTeamId;
  if ([fixture.homeTeamId, fixture.awayTeamId].includes(result.winnerTeamId)) return result.winnerTeamId;
  throw new TypeError("مباراة خروج المغلوب المتعادلة تحتاج إلى فائز موثق بعد الوقت الإضافي أو الترجيح.");
}

/**
 * Advances one tournament stage only when every fixture in that stage has a
 * valid result. Repeated calls are idempotent because the stage changes once.
 */
export function advanceInternationalTournament(tournament, results = []) {
  if (!isRecord(tournament) || !Array.isArray(tournament.fixtures) ||
      !Array.isArray(tournament.teams) || !Array.isArray(tournament.groups)) {
    throw new TypeError("حالة البطولة الدولية غير صالحة.");
  }
  if (tournament.status === "completed") return { ...tournament, advanced: false };
  const resultMap = normalizeResults(results);
  const currentFixtures = tournament.fixtures.filter((fixture) =>
    tournament.stage === "groups" ? fixture.stage === "groups" :
      fixture.stage === "knockout" && fixture.phase === tournament.stage
  );
  if (!currentFixtures.length || currentFixtures.some((fixture) => !resultMap.has(fixture.id))) {
    return { ...tournament, advanced: false };
  }

  let pairings = [];
  let nextStage = tournament.stage;
  let championTeamId = null;
  let nextDate = addDays(currentFixtures.reduce((latest, fixture) =>
    fixture.date > latest ? fixture.date : latest, currentFixtures[0].date), 7);

  if (tournament.stage === "groups") {
    const tables = tournament.groups.map((group) => standingsForGroup(tournament, group, resultMap));
    if (tables.some((table) => !table)) return { ...tournament, advanced: false };
    const qualifiers = tables.map((table) => table.slice(0, tournament.qualifiersPerGroup).map((row) => row.teamId));
    if (qualifiers.some((group) => group.length !== tournament.qualifiersPerGroup)) {
      throw new TypeError("عدد المتأهلين من المجموعات غير مكتمل.");
    }
    if (qualifiers.length === 1) {
      pairings = [{ homeTeamId: qualifiers[0][0], awayTeamId: qualifiers[0][1] }];
      nextStage = "final";
    } else if (qualifiers.length === 2 && qualifiers.every((group) => group.length === 2)) {
      pairings = [
        { homeTeamId: qualifiers[0][0], awayTeamId: qualifiers[1][1] },
        { homeTeamId: qualifiers[1][0], awayTeamId: qualifiers[0][1] }
      ];
      nextStage = "semi-final";
    } else {
      throw new TypeError("صيغة المجموعات الحالية لا تنتج مسار خروج مغلوب متوازنًا.");
    }
  } else {
    const winners = currentFixtures.map((fixture) => {
      const result = resultMap.get(fixture.id);
      if (result.homeTeamId !== fixture.homeTeamId || result.awayTeamId !== fixture.awayTeamId ||
          !Number.isSafeInteger(result.homeGoals) || result.homeGoals < 0 ||
          !Number.isSafeInteger(result.awayGoals) || result.awayGoals < 0) {
        throw new TypeError("نتيجة خروج المغلوب غير صالحة.");
      }
      return knockoutWinner(fixture, result);
    });
    if (new Set(winners).size !== winners.length) {
      throw new TypeError("تم اكتشاف منتخب متأهل أكثر من مرة.");
    }
    if (tournament.stage === "semi-final") {
      pairings = [{ homeTeamId: winners[0], awayTeamId: winners[1] }];
      nextStage = "final";
    } else if (tournament.stage === "final") {
      championTeamId = winners[0];
      nextStage = "completed";
    } else {
      throw new TypeError("مرحلة إقصائية غير معروفة.");
    }
  }

  if (championTeamId) {
    return {
      ...tournament,
      stage: "completed",
      status: "completed",
      championTeamId,
      advanced: true,
      fixtures: tournament.fixtures.map((fixture) => ({
        ...fixture,
        status: resultMap.has(fixture.id) ? "played" : fixture.status
      }))
    };
  }
  const nextFixtures = createKnockoutFixtures(tournament, nextStage, pairings, nextDate);
  if (tournament.fixtures.length + nextFixtures.length > MAX_FIXTURES) {
    throw new RangeError("عدد مباريات البطولة تجاوز الحد الآمن.");
  }
  return {
    ...tournament,
    stage: nextStage,
    fixtures: [
      ...tournament.fixtures.map((fixture) => ({
        ...fixture,
        status: resultMap.has(fixture.id) ? "played" : fixture.status
      })),
      ...nextFixtures
    ],
    advanced: true
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Structural validation used before persisting a generated international plan. */
export function isValidInternationalTournamentPlan(plan) {
  if (!isRecord(plan) || !Number.isSafeInteger(plan.season) || plan.season < 1 ||
      !isDate(plan.generatedAt) || !Array.isArray(plan.continental) ||
      !isRecord(plan.worldCup)) return false;
  const allTournaments = [...plan.continental, plan.worldCup];
  const tournamentIds = new Set();
  for (const tournament of allTournaments) {
    if (!isRecord(tournament) || typeof tournament.id !== "string" ||
        tournamentIds.has(tournament.id) || tournament.season !== plan.season ||
        !Array.isArray(tournament.teams) || tournament.teams.length < 2 ||
        tournament.teams.length > MAX_TOURNAMENT_TEAMS ||
        !Array.isArray(tournament.groups) || !Array.isArray(tournament.fixtures) ||
        tournament.fixtures.length > MAX_FIXTURES ||
        !["scheduled", "completed"].includes(tournament.status) ||
        !["groups", "knockout", "semi-final", "final", "completed"].includes(tournament.stage)) return false;
    tournamentIds.add(tournament.id);
    if (tournament.teams.some((team) => !isRecord(team) ||
        typeof team.id !== "string" || !team.id.trim() ||
        typeof team.countryId !== "string" || !team.countryId.trim() ||
        !Number.isFinite(team.strength) || team.strength < 1 || team.strength > 99)) return false;
    const teamIds = new Set(tournament.teams.map((team) => team.id));
    if (teamIds.size !== tournament.teams.length ||
        tournament.groups.some((group) => !isRecord(group) ||
          typeof group.id !== "string" || !group.id.trim() ||
          !Array.isArray(group.teamIds) || group.teamIds.length < 2 ||
          !group.teamIds.every((id) => typeof id === "string" && teamIds.has(id)))) return false;
    const groupTeamIds = tournament.groups.flatMap((group) => group.teamIds);
    if (new Set(groupTeamIds).size !== groupTeamIds.length) return false;
    const fixtureIds = new Set();
    for (const fixture of tournament.fixtures) {
      if (!isRecord(fixture) || typeof fixture.id !== "string" ||
          fixtureIds.has(fixture.id) || fixture.tournamentId !== tournament.id ||
          fixture.season !== plan.season || !isDate(fixture.date) ||
          !teamIds.has(fixture.homeTeamId) || !teamIds.has(fixture.awayTeamId) ||
          fixture.homeTeamId === fixture.awayTeamId ||
          !["groups", "knockout"].includes(fixture.stage) ||
          !["scheduled", "played"].includes(fixture.status)) return false;
      if (fixture.stage === "groups" &&
          !tournament.groups.some((group) => group.id === fixture.groupId &&
            group.teamIds.includes(fixture.homeTeamId) && group.teamIds.includes(fixture.awayTeamId))) return false;
      fixtureIds.add(fixture.id);
    }
    if (tournament.status === "completed" &&
        (!tournament.championTeamId || !teamIds.has(tournament.championTeamId))) return false;
    if (tournament.status === "scheduled" && tournament.championTeamId !== null) return false;
  }
  return true;
}
