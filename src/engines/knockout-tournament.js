import { COMPETITION_FORMATS, buildCompetitionGroups, getCompetitionRules } from "../data/competition-rules.js";

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function addDays(value, amount) {
  const date = dateValue(value);
  if (!date) throw new TypeError("تاريخ دور الكأس غير صالح.");
  date.setUTCDate(date.getUTCDate() + amount);
  return dateKey(date);
}

function daysBetween(left, right) {
  return Math.round((dateValue(left).getTime() - dateValue(right).getTime()) / 86400000);
}

function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed) {
  let state = hashSeed(String(seed)) || 0x6d2b79f5;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function averageRating(result, clubId) {
  const players = (result.playerPerformances ?? []).filter((player) => player.clubId === clubId);
  if (players.length === 0) return 70;
  return players.reduce((total, player) => total + player.rating, 0) / players.length;
}

function simulateExtraTime(result, fixture, random) {
  const homeRating = averageRating(result, fixture.homeClubId);
  const awayRating = averageRating(result, fixture.awayClubId);
  let homeGoals = 0;
  let awayGoals = 0;

  for (let minute = 0; minute < 30; minute += 1) {
    const homeChance = clamp(0.009 + (homeRating - awayRating) * 0.00035, 0.004, 0.02);
    const awayChance = clamp(0.009 + (awayRating - homeRating) * 0.00035, 0.004, 0.02);
    if (random() < homeChance) homeGoals += 1;
    if (random() < awayChance) awayGoals += 1;
  }

  return { homeGoals, awayGoals };
}

function simulatePenaltyShootout(homeRating, awayRating, random) {
  const homeChance = clamp(0.75 + (homeRating - awayRating) * 0.002, 0.66, 0.84);
  const awayChance = clamp(0.75 + (awayRating - homeRating) * 0.002, 0.66, 0.84);
  const homeKicks = [];
  const awayKicks = [];

  for (let kick = 0; kick < 5; kick += 1) {
    homeKicks.push(random() < homeChance);
    awayKicks.push(random() < awayChance);
  }

  let suddenDeathPairs = 0;
  while (homeKicks.filter(Boolean).length === awayKicks.filter(Boolean).length && suddenDeathPairs < 12) {
    homeKicks.push(random() < homeChance);
    awayKicks.push(random() < awayChance);
    suddenDeathPairs += 1;
  }

  if (homeKicks.filter(Boolean).length === awayKicks.filter(Boolean).length) {
    homeKicks.push(random() < 0.5);
    awayKicks.push(false);
    suddenDeathPairs += 1;
  }

  const home = homeKicks.filter(Boolean).length;
  const away = awayKicks.filter(Boolean).length;
  return { home, away, homeKicks, awayKicks, suddenDeathPairs };
}

/** Returns a persisted winner without changing the regulation-time score. */
export function resolveKnockoutOutcome(result, fixture) {
  if (!result || !result.home || !result.away || !fixture ||
      typeof fixture.id !== "string" || !fixture.id.trim() ||
      !dateValue(fixture.date) ||
      typeof fixture.homeClubId !== "string" || !fixture.homeClubId.trim() ||
      typeof fixture.awayClubId !== "string" || !fixture.awayClubId.trim() ||
      fixture.homeClubId === fixture.awayClubId) {
    throw new TypeError("نتيجة أو مباراة الكأس غير صالحة.");
  }

  if (result.home.goals > result.away.goals) {
    return {
      decidedBy: "regular-time",
      winnerClubId: fixture.homeClubId,
      extraTime: null,
      penalties: null
    };
  }
  if (result.away.goals > result.home.goals) {
    return {
      decidedBy: "regular-time",
      winnerClubId: fixture.awayClubId,
      extraTime: null,
      penalties: null
    };
  }

  const random = createRandom(fixture.id + "|" + fixture.date + "|knockout");
  const extraTime = simulateExtraTime(result, fixture, random);
  if (extraTime.homeGoals !== extraTime.awayGoals) {
    return {
      decidedBy: "extra-time",
      winnerClubId: extraTime.homeGoals > extraTime.awayGoals
        ? fixture.homeClubId
        : fixture.awayClubId,
      extraTime,
      penalties: null
    };
  }

  const penalties = simulatePenaltyShootout(
    averageRating(result, fixture.homeClubId),
    averageRating(result, fixture.awayClubId),
    random
  );
  return {
    decidedBy: "penalties",
    winnerClubId: penalties.home > penalties.away
      ? fixture.homeClubId
      : fixture.awayClubId,
    extraTime,
    penalties
  };
}

/** Seeded opening round: strongest seed meets lowest seed, without duplicates. */
export function buildKnockoutOpeningPairings(competition, database) {
  const rules = getCompetitionRules(competition);
  if (rules.format !== COMPETITION_FORMATS.KNOCKOUT) return [];

  const clubById = new Map((database?.clubs ?? []).map((club) => [club.id, club]));
  const seeded = competition.clubIds
    .map((clubId) => clubById.get(clubId))
    .filter(Boolean)
    .sort((left, right) =>
      (right.simulationProfile ?? 0) - (left.simulationProfile ?? 0) ||
      compareText(left.id, right.id)
    );

  if (seeded.length !== competition.clubIds.length || seeded.length < 2 ||
      (seeded.length & (seeded.length - 1)) !== 0) {
    throw new TypeError("قائمة أندية الكأس لا تسمح بإنشاء دور إقصائي متوازن.");
  }

  const pairings = [];
  for (let index = 0; index < seeded.length / 2; index += 1) {
    pairings.push({
      homeClubId: seeded[index].id,
      awayClubId: seeded[seeded.length - 1 - index].id
    });
  }
  return pairings;
}

/**
 * Advances a completed knockout round exactly once. It returns the new round
 * fixtures, or the champion when the completed round was the final.
 */
function buildGroupStandings(competition, group, season, fixtures, results, rules) {
  const rows = new Map(group.clubIds.map((clubId) => [clubId, {
    clubId, played: 0, wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0
  }]));
  const resultById = new Map(results.map((result) => [result.id, result]));
  const groupFixtures = fixtures.filter((fixture) =>
    fixture.competitionId === competition.id &&
    fixture.season === season &&
    fixture.groupId === group.id
  );
  const expectedPerGroup = rules.legs === 2
    ? group.clubIds.length * (group.clubIds.length - 1)
    : group.clubIds.length * (group.clubIds.length - 1) / 2;
  if (groupFixtures.length !== expectedPerGroup ||
      groupFixtures.some((fixture) => fixture.status !== "played" || !resultById.has(fixture.id))) {
    return null;
  }

  for (const fixture of groupFixtures) {
    const result = resultById.get(fixture.id);
    const home = rows.get(fixture.homeClubId);
    const away = rows.get(fixture.awayClubId);
    if (!home || !away || result.competitionId !== competition.id ||
        result.season !== season || result.groupId !== group.id ||
        result.home?.clubId !== fixture.homeClubId ||
        result.away?.clubId !== fixture.awayClubId ||
        !Number.isSafeInteger(result.home.goals) || result.home.goals < 0 ||
        !Number.isSafeInteger(result.away.goals) || result.away.goals < 0) return null;
    home.played += 1;
    away.played += 1;
    home.goalsFor += result.home.goals;
    home.goalsAgainst += result.away.goals;
    away.goalsFor += result.away.goals;
    away.goalsAgainst += result.home.goals;
    if (result.home.goals > result.away.goals) {
      home.wins += 1;
      away.losses += 1;
      home.points += rules.points.win;
      away.points += rules.points.loss;
    } else if (result.away.goals > result.home.goals) {
      away.wins += 1;
      home.losses += 1;
      away.points += rules.points.win;
      home.points += rules.points.loss;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += rules.points.draw;
      away.points += rules.points.draw;
    }
  }

  return [...rows.values()]
    .map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort((left, right) => {
      for (const key of rules.tieBreakers) {
        const difference = key === "points" ? right.points - left.points
          : key === "goalDifference" ? right.goalDifference - left.goalDifference
            : key === "goalsFor" ? right.goalsFor - left.goalsFor
              : key === "wins" ? right.wins - left.wins
                : key === "goalsAgainst" ? left.goalsAgainst - right.goalsAgainst
                  : key === "clubId" ? compareText(left.clubId, right.clubId)
                    : 0;
        if (difference !== 0) return difference;
      }
      return compareText(left.clubId, right.clubId);
    });
}

/** Creates the continental semi-finals from the first and second of both completed groups. */
export function buildGroupStageSemifinalFixtures(competition, season, fixtures, results, database) {
  const rules = getCompetitionRules(competition);
  if (competition.type !== "continental" ||
      rules.format !== COMPETITION_FORMATS.GROUP_STAGE ||
      rules.groupCount !== 2 || rules.qualifiersPerGroup !== 2) return [];

  const groups = buildCompetitionGroups(competition, database);
  if (groups.length !== 2) return [];
  const standings = groups.map((group) =>
    buildGroupStandings(competition, group, season, fixtures, results, rules)
  );
  if (standings.some((table) => !table || table.length < 2)) return [];

  const qualifiers = [
    standings[0][0].clubId,
    standings[1][1].clubId,
    standings[1][0].clubId,
    standings[0][1].clubId
  ];
  if (new Set(qualifiers).size !== 4 ||
      !qualifiers.every((clubId) => competition.clubIds.includes(clubId))) {
    throw new TypeError("قائمة المتأهلين القاريين غير صالحة أو تحتوي على نادٍ مكرر.");
  }

  const groupFixtures = fixtures.filter((fixture) =>
    fixture.competitionId === competition.id &&
    fixture.season === season &&
    fixture.groupId !== null &&
    fixture.groupId !== undefined
  );
  if (groupFixtures.length === 0) return [];
  const latestDate = groupFixtures.reduce((latest, fixture) =>
    fixture.date > latest ? fixture.date : latest, groupFixtures[0].date);
  let semifinalDate = addDays(latestDate, 7);
  while (qualifiers.some((clubId) => fixtures.some((fixture) =>
    fixture.season === season &&
    [fixture.homeClubId, fixture.awayClubId].includes(clubId) &&
    Math.abs(daysBetween(semifinalDate, fixture.date)) < 3
  ))) {
    semifinalDate = addDays(semifinalDate, 1);
  }

  const pairings = [
    { homeClubId: standings[0][0].clubId, awayClubId: standings[1][1].clubId },
    { homeClubId: standings[1][0].clubId, awayClubId: standings[0][1].clubId }
  ];
  return pairings.map((pairing) => ({
    id: [
      "match", season, competition.id, "knockout", "round-1",
      "leg-1", pairing.homeClubId, pairing.awayClubId
    ].join("-"),
    season,
    competitionId: competition.id,
    competitionName: competition.nameAr,
    groupId: null,
    groupName: null,
    stage: "knockout",
    phase: "semi-final",
    phaseNameAr: "نصف النهائي",
    date: semifinalDate,
    round: 1,
    leg: 1,
    homeClubId: pairing.homeClubId,
    awayClubId: pairing.awayClubId,
    status: "scheduled",
    resultId: null
  }));
}

/**
 * Advances a completed cup or continental knockout round exactly once. A
 * continental group stage first creates cross-group semi-finals; winners then
 * meet in a single final.
 */
export function advanceKnockoutRound(competition, season, fixtures, results, database) {
  const rules = getCompetitionRules(competition);
  const isCup = rules.format === COMPETITION_FORMATS.KNOCKOUT;
  const isContinentalGroups = competition.type === "continental" &&
    rules.format === COMPETITION_FORMATS.GROUP_STAGE;
  if (!isCup && !isContinentalGroups) {
    return { fixtures: [], championClubId: null, advanced: false };
  }

  const competitionFixtures = fixtures.filter((fixture) =>
    fixture.competitionId === competition.id && fixture.season === season
  );
  const knockoutFixtures = competitionFixtures.filter((fixture) =>
    fixture.stage === "knockout" || (isCup && fixture.groupId == null)
  );

  if (isContinentalGroups && knockoutFixtures.length === 0) {
    const semifinals = buildGroupStageSemifinalFixtures(
      competition, season, fixtures, results, database
    );
    return {
      fixtures: semifinals,
      championClubId: null,
      advanced: semifinals.length > 0
    };
  }
  if (knockoutFixtures.length === 0) {
    return { fixtures: [], championClubId: null, advanced: false };
  }

  const currentRound = Math.max(...knockoutFixtures.map((fixture) => fixture.round));
  const roundFixtures = knockoutFixtures
    .filter((fixture) => fixture.round === currentRound)
    .sort((left, right) => compareText(left.id, right.id));

  if (roundFixtures.length === 0 ||
      roundFixtures.some((fixture) => fixture.status !== "played")) {
    return { fixtures: [], championClubId: null, advanced: false };
  }

  const resultById = new Map(results.map((result) => [result.id, result]));
  const winners = roundFixtures.map((fixture) => {
    const winner = resultById.get(fixture.id)?.knockoutDecision?.winnerClubId ?? null;
    return [fixture.homeClubId, fixture.awayClubId].includes(winner) ? winner : null;
  });
  if (winners.some((clubId) => !clubId) ||
      new Set(winners).size !== winners.length) {
    throw new TypeError("نتائج الدور الإقصائي غير مكتملة أو تحتوي على تأهل مكرر.");
  }

  if (winners.length === 1) {
    return { fixtures: [], championClubId: winners[0], advanced: true };
  }
  if (winners.length % 2 !== 0) {
    throw new TypeError("عدد المتأهلين للدور التالي غير متوازن.");
  }

  const clubById = new Map(database.clubs.map((club) => [club.id, club]));
  const seededWinners = [...winners].sort((leftId, rightId) =>
    (clubById.get(rightId)?.simulationProfile ?? 0) -
      (clubById.get(leftId)?.simulationProfile ?? 0) ||
    compareText(leftId, rightId)
  );
  const latestDate = roundFixtures.reduce((latest, fixture) =>
    fixture.date > latest ? fixture.date : latest, roundFixtures[0].date);
  let nextDate = addDays(latestDate, 7);
  while (seededWinners.some((clubId) => fixtures.some((existing) =>
    existing.season === season &&
    [existing.homeClubId, existing.awayClubId].includes(clubId) &&
    Math.abs(daysBetween(nextDate, existing.date)) < 3
  ))) {
    nextDate = addDays(nextDate, 1);
  }

  const nextRound = currentRound + 1;
  const phase = seededWinners.length === 2 ? "final"
    : seededWinners.length === 4 ? "semi-final"
      : "knockout-round";
  const phaseNameAr = phase === "final" ? "النهائي"
    : phase === "semi-final" ? "نصف النهائي"
      : "الدور " + nextRound;
  const nextFixtures = [];
  for (let index = 0; index < seededWinners.length / 2; index += 1) {
    const homeClubId = seededWinners[index];
    const awayClubId = seededWinners[seededWinners.length - 1 - index];
    nextFixtures.push({
      id: [
        "match", season, competition.id, "knockout", "round-" + nextRound,
        "leg-1", homeClubId, awayClubId
      ].join("-"),
      season,
      competitionId: competition.id,
      competitionName: competition.nameAr,
      groupId: null,
      groupName: null,
      stage: "knockout",
      phase,
      phaseNameAr,
      date: nextDate,
      round: nextRound,
      leg: 1,
      homeClubId,
      awayClubId,
      status: "scheduled",
      resultId: null
    });
  }

  return { fixtures: nextFixtures, championClubId: null, advanced: true };
}
