const MATCH_MINUTES = 90;

export const MATCH_SIMULATION_BALANCE = Object.freeze({
  attackChancePerMinute: 0.33,
  shotChancePerAttack: 0.60,
  targetShotBaseChance: 0.43,
  goalConversionBaseChance: 0.34,
  foulChancePerAttack: 0.48,
  yellowCardChancePerAttack: 0.05,
  injuryChancePerMinute: 0.0026
});
const REQUIRED_LINEUP_SIZE = 11;
const MATCH_ROLES = new Set(["هجوم", "وسط", "دفاع", "حراسة"]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function roundTo(value, decimals = 1) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function isValidDate(value) {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
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

function validateTeam(team, label) {
  if (!team || typeof team !== "object" ||
      typeof team.clubId !== "string" || !team.clubId.trim() ||
      typeof team.name !== "string" || !team.name.trim() ||
      !Array.isArray(team.lineup) || team.lineup.length !== REQUIRED_LINEUP_SIZE) {
    throw new TypeError(label + " يجب أن يحتوي على نادٍ وتشكيلة أساسية من 11 لاعبًا.");
  }

  if (team.strength !== undefined &&
      (!Number.isFinite(team.strength) || team.strength < 1 || team.strength > 99)) {
    throw new TypeError("قوة النادي يجب أن تكون بين 1 و99.");
  }

  const playerIds = new Set();
  let goalkeeperCount = 0;
  for (const player of team.lineup) {
    if (!player || typeof player !== "object" ||
        typeof player.id !== "string" || !player.id.trim() ||
        typeof player.name !== "string" || !player.name.trim() ||
        !Number.isFinite(player.rating) || player.rating < 1 || player.rating > 99 ||
        !MATCH_ROLES.has(player.role)) {
      throw new TypeError("بيانات لاعب التشكيلة غير صالحة.");
    }
    if (playerIds.has(player.id)) {
      throw new TypeError("لا يمكن تكرار اللاعب داخل التشكيلة.");
    }
    playerIds.add(player.id);
    if (player.role === "حراسة") goalkeeperCount += 1;
  }

  if (goalkeeperCount !== 1) {
    throw new TypeError("يجب أن تضم التشكيلة حارس مرمى واحدًا بالضبط.");
  }
}

function teamStrength(team) {
  const averageRating = team.lineup.reduce((sum, player) => sum + player.rating, 0) /
    team.lineup.length;
  const clubProfile = team.strength ?? averageRating;
  return roundTo(averageRating * 0.75 + clubProfile * 0.25, 2);
}

function weightedPick(players, weightFor, random) {
  const eligible = players.filter((player) => !player.injured);
  const totalWeight = eligible.reduce((sum, player) => sum + weightFor(player), 0);
  if (eligible.length === 0 || totalWeight <= 0) return null;

  let threshold = random() * totalWeight;
  for (const player of eligible) {
    threshold -= weightFor(player);
    if (threshold <= 0) return player;
  }
  return eligible[eligible.length - 1];
}

function scorerWeight(player) {
  return player.role === "هجوم" ? 4.2
    : player.role === "وسط" ? 2.5
      : player.role === "دفاع" ? 1.0
        : 0.03;
}

function assistWeight(player) {
  return player.role === "وسط" ? 3.4
    : player.role === "هجوم" ? 2.2
      : player.role === "دفاع" ? 0.7
        : 0;
}

function createTeamRuntime(team, durationMinutes) {
  const players = team.lineup.map((player) => ({
    ...player,
    clubId: team.clubId,
    minutesPlayed: durationMinutes,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    yellowCards: 0,
    injuryDays: 0,
    injured: false
  }));
  const stats = {
    attacks: 0,
    shots: 0,
    shotsOnTarget: 0,
    fouls: 0,
    yellowCards: 0,
    possession: 0
  };
  return {
    clubId: team.clubId,
    name: team.name,
    strength: teamStrength(team),
    players,
    goalkeeper: players.find((player) => player.role === "حراسة"),
    stats,
    goals: 0
  };
}

function addEvent(events, event) {
  events.push(event);
}

function createPlayerPerformance(player, random) {
  const formSwing = (random() * 0.8) - 0.4;
  const score = clamp(
    6.25 +
      player.goals * 1.0 +
      player.assists * 0.65 +
      player.shotsOnTarget * 0.08 -
      player.yellowCards * 0.4 -
      (player.injuryDays > 0 ? 0.5 : 0) +
      formSwing,
    4,
    10
  );
  return {
    playerId: player.id,
    playerName: player.name,
    clubId: player.clubId,
    role: player.role,
    minutesPlayed: player.minutesPlayed,
    goals: player.goals,
    assists: player.assists,
    shots: player.shots,
    shotsOnTarget: player.shotsOnTarget,
    yellowCards: player.yellowCards,
    injuryDays: player.injuryDays,
    simulationOnly: player.simulationOnly === true,
    rating: roundTo(score, 1)
  };
}

/**
 * Simulates a single match without mutating the supplied fixture or lineups.
 *
 * Both clubs must supply a complete starting XI. The engine intentionally does
 * not invent missing players; roster generation and persisted career state are
 * handled by later Phase 5 slices.
 */
export function simulateMatch(fixture) {
  if (!fixture || typeof fixture !== "object" ||
      typeof fixture.id !== "string" || !fixture.id.trim() ||
      !isValidDate(fixture.date)) {
    throw new TypeError("بيانات المباراة أو تاريخها غير صالح.");
  }
  validateTeam(fixture.home, "الفريق صاحب الأرض");
  validateTeam(fixture.away, "الفريق الضيف");
  if (fixture.home.clubId === fixture.away.clubId) {
    throw new TypeError("لا يمكن للنادي مواجهة نفسه.");
  }

  const allPlayerIds = [
    ...fixture.home.lineup.map((player) => player.id),
    ...fixture.away.lineup.map((player) => player.id)
  ];
  if (new Set(allPlayerIds).size !== allPlayerIds.length) {
    throw new TypeError("لا يمكن للاعب الظهور في تشكيلتي الفريقين.");
  }

  const seed = fixture.seed === undefined || fixture.seed === null
    ? [fixture.id, fixture.date ?? "", fixture.home.clubId, fixture.away.clubId].join("|")
    : String(fixture.seed);
  const random = createRandom(seed);
  const stoppageMinutes = 2 + Math.floor(random() * 4);
  const durationMinutes = MATCH_MINUTES + stoppageMinutes;
  const home = createTeamRuntime(fixture.home, durationMinutes);
  const away = createTeamRuntime(fixture.away, durationMinutes);
  const events = [];
  const homePossessionShare = clamp(
    0.5 + (home.strength - away.strength) / 180 + 0.025,
    0.35,
    0.65
  );

  for (let minute = 1; minute <= durationMinutes; minute += 1) {
    if (random() < MATCH_SIMULATION_BALANCE.attackChancePerMinute) {
      const attacking = random() < homePossessionShare ? home : away;
      const defending = attacking === home ? away : home;
      attacking.stats.attacks += 1;

      if (random() < MATCH_SIMULATION_BALANCE.shotChancePerAttack) {
        const scorer = weightedPick(attacking.players, scorerWeight, random);
        if (scorer) {
          scorer.shots += 1;
          attacking.stats.shots += 1;

          const targetChance = clamp(
            MATCH_SIMULATION_BALANCE.targetShotBaseChance + (scorer.rating - defending.goalkeeper.rating) * 0.006,
            0.28,
            0.60
          );
          if (random() < targetChance) {
            scorer.shotsOnTarget += 1;
            attacking.stats.shotsOnTarget += 1;
            const goalChance = clamp(
              MATCH_SIMULATION_BALANCE.goalConversionBaseChance + (scorer.rating - defending.goalkeeper.rating) * 0.005,
              0.18,
              0.48
            );

            if (random() < goalChance) {
              const assistCandidates = attacking.players.filter((player) =>
                player.id !== scorer.id && !player.injured
              );
              const assist = random() < 0.72
                ? weightedPick(assistCandidates, assistWeight, random)
                : null;
              scorer.goals += 1;
              if (assist) assist.assists += 1;
              attacking.goals += 1;
              addEvent(events, {
                minute,
                type: "goal",
                teamId: attacking.clubId,
                playerId: scorer.id,
                playerName: scorer.name,
                assistPlayerId: assist?.id ?? null,
                assistPlayerName: assist?.name ?? null
              });
            }
          }
        }
      }

      if (random() < MATCH_SIMULATION_BALANCE.foulChancePerAttack) {
        defending.stats.fouls += 1;
      }

      if (random() < MATCH_SIMULATION_BALANCE.yellowCardChancePerAttack) {
        const carded = weightedPick(
          defending.players.filter((player) => player.role !== "حراسة"),
          (player) => player.role === "دفاع" ? 2.2 : player.role === "وسط" ? 1.8 : 1,
          random
        );
        if (carded && carded.yellowCards === 0) {
          carded.yellowCards = 1;
          defending.stats.yellowCards += 1;
          addEvent(events, {
            minute,
            type: "yellow-card",
            teamId: defending.clubId,
            playerId: carded.id,
            playerName: carded.name
          });
        }
      }
    }

    if (random() < MATCH_SIMULATION_BALANCE.injuryChancePerMinute) {
      const injuredTeam = random() < homePossessionShare ? home : away;
      const injured = weightedPick(
        injuredTeam.players.filter((player) => player.role !== "حراسة"),
        (player) => player.role === "دفاع" ? 1.4 : 1,
        random
      );
      if (injured) {
        injured.injured = true;
        injured.minutesPlayed = minute;
        injured.injuryDays = 3 + Math.floor(random() * 25);
        addEvent(events, {
          minute,
          type: "injury",
          teamId: injuredTeam.clubId,
          playerId: injured.id,
          playerName: injured.name,
          daysOut: injured.injuryDays,
          severity: injured.injuryDays <= 10 ? "minor" : "moderate"
        });
      }
    }
  }

  home.stats.possession = home.stats.attacks;
  away.stats.possession = away.stats.attacks;
  const totalPossession = home.stats.possession + away.stats.possession;
  const homePossession = totalPossession === 0 ? 50
    : Math.round((home.stats.possession / totalPossession) * 100);
  const awayPossession = 100 - homePossession;

  const performances = [
    ...home.players.map((player) => createPlayerPerformance(player, random)),
    ...away.players.map((player) => createPlayerPerformance(player, random))
  ].sort((a, b) => a.clubId.localeCompare(b.clubId) || a.playerId.localeCompare(b.playerId));

  const manOfTheMatch = [...performances].sort((a, b) =>
    b.rating - a.rating ||
    b.goals - a.goals ||
    b.assists - a.assists ||
    compareText(a.playerId, b.playerId)
  )[0];

  const timeline = events
    .sort((a, b) => a.minute - b.minute || compareText(a.type, b.type) ||
      compareText(String(a.playerId), String(b.playerId)))
    .map((event, index) => ({ id: fixture.id + "-event-" + (index + 1), ...event }));

  const toTeamSummary = (team, possession) => ({
    clubId: team.clubId,
    name: team.name,
    goals: team.goals,
    possession,
    attacks: team.stats.attacks,
    shots: team.stats.shots,
    shotsOnTarget: team.stats.shotsOnTarget,
    fouls: team.stats.fouls,
    yellowCards: team.stats.yellowCards
  });

  return {
    id: fixture.id,
    date: fixture.date ?? null,
    competitionId: fixture.competitionId ?? null,
    simulationVersion: 2,
    status: "played",
    durationMinutes,
    home: toTeamSummary(home, homePossession),
    away: toTeamSummary(away, awayPossession),
    result: home.goals > away.goals ? "home-win"
      : away.goals > home.goals ? "away-win"
        : "draw",
    events: timeline,
    playerPerformances: performances,
    manOfTheMatchPlayerId: manOfTheMatch?.playerId ?? null
  };
}
