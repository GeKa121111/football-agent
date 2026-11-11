import test from "node:test";
import assert from "node:assert/strict";
import {
  createInitialPlayerDevelopmentState,
  setPlayerTrainingPlan,
  advancePlayerDevelopmentDay,
  recordPlayerMatchPerformances,
  isValidPlayerDevelopmentState,
  getPlayerDevelopmentRecord,
  mergePlayerDevelopmentRoster,
  TRAINING_BALANCE
} from "../src/engines/player-development.js";
import { WORLD_DATABASE, getWorldSquadPlayers } from "../src/data/world-database.js";

test("creates stable development records for the fictional world-player database", () => {
  const state = createInitialPlayerDevelopmentState(WORLD_DATABASE.players);
  assert.equal(state.players.length, WORLD_DATABASE.players.length);
  assert.equal(new Set(state.players.map((player) => player.playerId)).size, state.players.length);
  assert.equal(isValidPlayerDevelopmentState(state, 1), true);
});

test("accepts compatible individual training plans and rejects goalkeeper-only plans for field players", () => {
  const state = createInitialPlayerDevelopmentState(WORLD_DATABASE.players);
  const fieldPlayer = WORLD_DATABASE.players.find((player) => player.role !== "حراسة");
  const goalkeeper = WORLD_DATABASE.players.find((player) => player.role === "حراسة");

  const rejected = setPlayerTrainingPlan(state, fieldPlayer.id, "goalkeeping", "intense");
  assert.equal(rejected.changed, false);
  assert.equal(rejected.reason, "role-mismatch");

  const changed = setPlayerTrainingPlan(state, fieldPlayer.id, "attacking", "normal");
  assert.equal(changed.changed, true);
  assert.equal(getPlayerDevelopmentRecord(changed.state, fieldPlayer.id).trainingFocus, "attacking");

  const keeperPlan = setPlayerTrainingPlan(changed.state, goalkeeper.id, "goalkeeping", "light");
  assert.equal(keeperPlan.changed, true);
  assert.equal(getPlayerDevelopmentRecord(keeperPlan.state, goalkeeper.id).trainingIntensity, "light");
});

test("trains players on Mondays and respects potential and age growth limits", () => {
  const state = createInitialPlayerDevelopmentState(WORLD_DATABASE.players);
  const trained = advancePlayerDevelopmentDay(state, "2026-07-06", 1);
  assert.equal(trained.trainingHistory.length, state.players.length);
  assert.ok(trained.players.some((player, index) => player.rating > state.players[index].rating));
  assert.ok(trained.players.every((player) => player.rating <= player.potential));
  assert.equal(state.trainingHistory.length, 0);
  assert.equal(isValidPlayerDevelopmentState(trained, 1), true);
});

test("recovery plans reduce fatigue and restore fitness without inventing skill growth", () => {
  let state = createInitialPlayerDevelopmentState(WORLD_DATABASE.players);
  const playerId = state.players[0].playerId;
  state = {
    ...state,
    players: state.players.map((player) => player.playerId === playerId
      ? { ...player, trainingFocus: "recovery", fatigue: 40, fitness: 50 }
      : player)
  };
  const next = advancePlayerDevelopmentDay(state, "2026-07-06", 1);
  const recovered = getPlayerDevelopmentRecord(next, playerId);
  assert.equal(recovered.fatigue, 25);
  assert.equal(recovered.fitness, 64);
  assert.equal(next.trainingHistory.find((session) => session.playerId === playerId).outcome, "recovery");
});

test("ages players once at a new season and applies gradual veteran decline", () => {
  const state = createInitialPlayerDevelopmentState(WORLD_DATABASE.players);
  const veteranId = state.players[0].playerId;
  const older = {
    ...state,
    players: state.players.map((player) => player.playerId === veteranId
      ? { ...player, age: 34 }
      : player)
  };
  const next = advancePlayerDevelopmentDay(older, "2027-07-01", 2);
  const veteran = getPlayerDevelopmentRecord(next, veteranId);
  assert.equal(veteran.age, 35);
  assert.ok(veteran.rating <= getPlayerDevelopmentRecord(older, veteranId).rating);
  assert.equal(advancePlayerDevelopmentDay(next, "2027-07-02", 2).players.find((player) => player.playerId === veteranId).age, 35);
  assert.equal(isValidPlayerDevelopmentState(next, 2), true);
});

test("applies real world-player match output and ignores simulation-only generated players", () => {
  const state = createInitialPlayerDevelopmentState(WORLD_DATABASE.players);
  const player = WORLD_DATABASE.players[0];
  const result = {
    events: [{ type: "injury", playerId: player.id, daysOut: 8 }],
    playerPerformances: [
      { playerId: player.id, simulationOnly: false, minutesPlayed: 90, goals: 1, assists: 1, rating: 8.2 },
      { playerId: "sim-generated", simulationOnly: true, minutesPlayed: 90, goals: 4, assists: 0, rating: 9.9 }
    ]
  };
  const next = recordPlayerMatchPerformances(state, result, "2026-07-08");
  const updated = getPlayerDevelopmentRecord(next, player.id);
  assert.equal(updated.appearances, 1);
  assert.equal(updated.minutesPlayed, 90);
  assert.equal(updated.goals, 1);
  assert.equal(updated.assists, 1);
  assert.equal(updated.averageMatchRating, 8.2);
  assert.equal(updated.injuryDays, 8);
  assert.equal(isValidPlayerDevelopmentState(next, 1), true);
});

test("training injury risk scales with intensity under sustained high fatigue", () => {
  const players = [];
  const groupSize = 1200;
  for (const [intensity, index] of [["light", 0], ["normal", 1], ["intense", 2]]) {
    for (let count = 0; count < groupSize; count += 1) {
      players.push({
        playerId: "training-risk-" + index + "-" + count,
        playerName: "اختبار حمل",
        clubId: "club-risk-test",
        role: "وسط",
        age: 20,
        potential: 90,
        rating: 70,
        skills: {
          finishing: 70, pace: 70, passing: 70, dribbling: 70,
          defending: 70, stamina: 70, handling: 20, reflexes: 20, positioning: 20
        },
        fitness: 60,
        fatigue: 90,
        injuryDays: 0,
        trainingFocus: "balanced",
        trainingIntensity: intensity,
        appearances: 0,
        minutesPlayed: 0,
        goals: 0,
        assists: 0,
        averageMatchRating: null,
        lastTrainingDate: null
      });
    }
  }
  const state = advancePlayerDevelopmentDay({ season: 1, players, trainingHistory: [] }, "2026-07-06", 1);
  const injuryCounts = [0, 0, 0];
  state.players.forEach((player, index) => {
    if (player.injuryDays > 0) injuryCounts[Math.floor(index / groupSize)] += 1;
  });
  assert.ok(injuryCounts[2] > injuryCounts[1], "intense injuries must exceed normal: " + injuryCounts);
  assert.ok(injuryCounts[1] > injuryCounts[0], "normal injuries must exceed light: " + injuryCounts);
  assert.ok(injuryCounts[2] >= 12 && injuryCounts[2] <= 48, "intense injury count: " + injuryCounts[2]);
  assert.deepEqual(Object.keys(TRAINING_BALANCE.injuryRiskByIntensity), ["light", "normal", "intense"]);
});

test("merges newly added squad players without resetting existing development progress", () => {
  const initial = createInitialPlayerDevelopmentState(WORLD_DATABASE.players);
  const first = initial.players[0];
  const progressed = {
    ...initial,
    players: initial.players.map((player) => player.playerId === first.playerId
      ? { ...player, rating: Math.min(player.potential, player.rating + 1), appearances: 6, minutesPlayed: 540 }
      : player)
  };
  const merged = mergePlayerDevelopmentRoster(progressed, getWorldSquadPlayers());
  assert.equal(merged.players.length, 432);
  assert.equal(merged.players.find((player) => player.playerId === first.playerId).appearances, 6);
  assert.equal(merged.players.find((player) => player.playerId === first.playerId).minutesPlayed, 540);
  assert.ok(merged.players.some((player) => player.playerId.startsWith("squad-")));
  assert.equal(new Set(merged.players.map((player) => player.playerId)).size, 432);
  assert.equal(mergePlayerDevelopmentRoster(merged, getWorldSquadPlayers()), merged);
});

test("records a complete weekly training session for every member of the expanded roster", () => {
  const players = getWorldSquadPlayers();
  const initial = createInitialPlayerDevelopmentState(players);
  const trained = advancePlayerDevelopmentDay(initial, "2026-07-06", 1);
  assert.equal(players.length, 432);
  assert.equal(trained.trainingHistory.length, 432);
  assert.equal(new Set(trained.trainingHistory.map((session) => session.playerId)).size, 432);
  assert.equal(isValidPlayerDevelopmentState(trained, 1), true);
});
