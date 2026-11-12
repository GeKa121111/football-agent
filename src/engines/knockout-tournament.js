import { buildCompetitionGroups, COMPETITION_FORMATS, getCompetitionRules } from "../data/competition-rules.js";

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

function getGroupQualificationStandings(competition, group, fixtures, resultById, database) {
  const rules = getCompetitionRules(competition);
  const clubById = new Map(database.clubs.map((club) => [club.id, club]));
  const rows = new Map(group.clubIds.map((clubId) => [clubId, {
    clubId,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0
  }]));

  for (const fixture of fixtures) {
    if (fixture.groupId !== group.id) continue;
    const result = resultById.get(fixture.id);
    if (!result) continue;
    const home = rows.get(fixture.homeClubId);
    const away = rows.get(fixture.awayClubId);
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

  const compareRows = (left, right) => {
    left.goalDifference = left.goalsFor - left.goalsAgainst;
    right.goalDifference = right.goalsFor - right.goalsAgainst;
    for (const rule of rules.tieBreakers) {
      const difference = rule === "points" ? right.points - left.points
        : rule === "goalDifference" ? right.goalDifference - left.goalDifference
          : rule === "goalsFor" ? right.goalsFor - left.goalsFor
            : rule === "wins" ? right.wins - left.wins
              : rule === "goalsAgainst" ? left.goalsAgainst - right.goalsAgainst
                : rule === "clubId" ? compareText(left.clubId, right.clubId)
                  : 0;
      if (difference !== 0) return difference;
    }
    return compareText(left.clubId, right.clubId);
  };

  return [...rows.values()].sort(compareRows).map((row) => ({
    ...row,
    clubName: clubById.get(row.clubId)?.nameAr ?? row.clubId
  }));
}

function createKnockoutFixtures(competition, season, round, pairings, fixtures, database, baseDate) {
  const clubById = new Map(database.clubs.map((club) => [club.id, club]));
  const seeded = pairings.map((pairing) => ({
    homeClubId: pairing.homeClubId,
    awayClubId: pairing.awayClubId
  }));
  const reserved = [...fixtures];
  const nextFixtures = [];

  for (const pairing of seeded) {
    let date = addDays(baseDate, 7);
    while ([pairing.homeClubId, pairing.awayClubId].some((clubId) =>
      reserved.some((existing) =>
        [existing.homeClubId, existing.awayClubId].includes(clubId) &&
        Math.abs(daysBetween(date, existing.date)) < 3
      )
    )) {
      date = addDays(date, 1);
    }
    const fixture = {
      id: [
        "match", season, competition.id, "round-" + round,
        "leg-1", pairing.homeClubId, pairing.awayClubId
      ].join("-"),
      season,
      competitionId: competition.id,
      competitionName: competition.nameAr,
      groupId: null,
      groupName: null,
      date,
      round,
      leg: 1,
      homeClubId: pairing.homeClubId,
      awayClubId: pairing.awayClubId,
      status: "scheduled",
      resultId: null
    };
    nextFixtures.push(fixture);
    reserved.push(fixture);
  }

  return nextFixtures;
}

function buildGroupQualificationPairings(competition, fixtures, results, database) {
  const rules = getCompetitionRules(competition);
  const groups = buildCompetitionGroups(competition, database);
  if (groups.length !== 2 || rules.qualifiersPerGroup !== 2) {
    throw new TypeError("مسار التأهل الحالي يتطلب مجموعتين ويتأهل أول وثاني كل مجموعة.");
  }
  const resultById = new Map(results.map((result) => [result.id, result]));
  const standings = groups.map((group) =>
    getGroupQualificationStandings(competition, group, fixtures, resultById, database)
  );
  if (standings.some((table) => table.length !== groups[0].clubIds.length ||
      table.length < rules.qualifiersPerGroup)) {
    throw new TypeError("تعذر حساب ترتيب التأهل لإحدى المجموعات.");
  }

  return [
    {
      homeClubId: standings[0][0].clubId,
      awayClubId: standings[1][1].clubId
    },
    {
      homeClubId: standings[1][0].clubId,
      awayClubId: standings[0][1].clubId
    }
  ];
}

/**
 * Advances a completed knockout round exactly once. Continental group
 * competitions may optionally create their semi-finals from the top two clubs
 * in each group before using the same knockout progression.
 */
export function advanceKnockoutRound(competition, season, fixtures, results, database) {
  const rules = getCompetitionRules(competition);
  const isKnockoutCompetition = rules.format === COMPETITION_FORMATS.KNOCKOUT;
  const hasGroupQualification = rules.format === COMPETITION_FORMATS.GROUP_STAGE &&
    competition.knockoutAfterGroups === true;
  if (!isKnockoutCompetition && !hasGroupQualification) {
    return { fixtures: [], championClubId: null, advanced: false };
  }

  const competitionFixtures = fixtures.filter((fixture) =>
    fixture.competitionId === competition.id && fixture.season === season
  );
  if (competitionFixtures.length === 0) {
    return { fixtures: [], championClubId: null, advanced: false };
  }

  const groupFixtures = competitionFixtures.filter((fixture) => fixture.groupId);
  const knockoutFixtures = competitionFixtures.filter((fixture) => !fixture.groupId);

  if (hasGroupQualification && knockoutFixtures.length === 0) {
    if (groupFixtures.length === 0 || groupFixtures.some((fixture) => fixture.status !== "played")) {
      return { fixtures: [], championClubId: null, advanced: false };
    }
    const pairings = buildGroupQualificationPairings(
      competition, groupFixtures, results, database
    );
    const latestGroupDate = groupFixtures.reduce((latest, fixture) =>
      fixture.date > latest ? fixture.date : latest, groupFixtures[0].date);
    const openingRound = Math.max(...groupFixtures.map((fixture) => fixture.round)) + 1;
    const openingFixtures = createKnockoutFixtures(
      competition,
      season,
      openingRound,
      pairings,
      competitionFixtures,
      database,
      latestGroupDate
    );
    return { fixtures: openingFixtures, championClubId: null, advanced: true };
  }

  const currentRound = Math.max(...knockoutFixtures.map((fixture) => fixture.round));
  const roundFixtures = knockoutFixtures
    .filter((fixture) => fixture.round === currentRound)
    .sort((left, right) => compareText(left.id, right.id));

  if (roundFixtures.length === 0 || roundFixtures.some((fixture) => fixture.status !== "played")) {
    return { fixtures: [], championClubId: null, advanced: false };
  }

  const resultById = new Map(results.map((result) => [result.id, result]));
  const winners = roundFixtures.map((fixture) =>
    resultById.get(fixture.id)?.knockoutDecision?.winnerClubId ?? null
  );
  if (winners.some((clubId) => !clubId) || new Set(winners).size !== winners.length) {
    throw new TypeError("نتائج دور الكأس غير مكتملة أو تحتوي على تأهل مكرر.");
  }

  if (winners.length === 1) {
    return { fixtures: [], championClubId: winners[0], advanced: true };
  }

  const clubById = new Map(database.clubs.map((club) => [club.id, club]));
  const seededWinners = winners.sort((leftId, rightId) =>
    (clubById.get(rightId)?.simulationProfile ?? 0) -
      (clubById.get(leftId)?.simulationProfile ?? 0) ||
    compareText(leftId, rightId)
  );
  const pairings = [];
  for (let index = 0; index < seededWinners.length / 2; index += 1) {
    pairings.push({
      homeClubId: seededWinners[index],
      awayClubId: seededWinners[seededWinners.length - 1 - index]
    });
  }

  const latestDate = roundFixtures.reduce((latest, fixture) =>
    fixture.date > latest ? fixture.date : latest, roundFixtures[0].date);
  const nextFixtures = createKnockoutFixtures(
    competition,
    season,
    currentRound + 1,
    pairings,
    competitionFixtures,
    database,
    latestDate
  );
  return { fixtures: nextFixtures, championClubId: null, advanced: true };
}
