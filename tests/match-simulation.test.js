import test from "node:test";
import assert from "node:assert/strict";
import { simulateMatch } from "../src/engines/match-simulation.js";

const roles = [
  "حراسة",
  "دفاع", "دفاع", "دفاع", "دفاع",
  "وسط", "وسط", "وسط",
  "هجوم", "هجوم", "هجوم"
];

function makeTeam(clubId, name, baseRating, strength = baseRating) {
  return {
    clubId,
    name,
    strength,
    lineup: roles.map((role, index) => ({
      id: clubId + "-player-" + (index + 1),
      name: name + " لاعب " + (index + 1),
      role,
      rating: Math.max(45, Math.min(99, baseRating + (
        role === "حراسة" ? -2 : role === "هجوم" ? 2 : role === "وسط" ? 1 : 0
      )))
    }))
  };
}

function fixture(overrides = {}) {
  return {
    id: "match-2026-07-04-ahly-zamalek",
    date: "2026-07-04",
    competitionId: "competition-eg-premier",
    seed: "phase-5-match-test",
    home: makeTeam("club-al-ahly", "الأهلي", 82, 88),
    away: makeTeam("club-zamalek", "الزمالك", 80, 84),
    ...overrides
  };
}

test("simulates a complete match with two valid starting XIs", () => {
  const result = simulateMatch(fixture());

  assert.equal(result.status, "played");
  assert.equal(result.simulationVersion, 1);
  assert.equal(result.home.clubId, "club-al-ahly");
  assert.equal(result.away.clubId, "club-zamalek");
  assert.equal(result.playerPerformances.length, 22);
  assert.ok(result.durationMinutes >= 92 && result.durationMinutes <= 95);
  assert.ok(result.events.every((event) =>
    event.minute >= 1 && event.minute <= result.durationMinutes
  ));
  assert.ok(["home-win", "away-win", "draw"].includes(result.result));
});

test("is deterministic for the same fixture and seed", () => {
  const input = fixture();
  assert.deepEqual(simulateMatch(input), simulateMatch(input));
});

test("does not mutate fixture or supplied lineups", () => {
  const input = fixture();
  const before = structuredClone(input);
  simulateMatch(input);
  assert.deepEqual(input, before);
});

test("goal score agrees with goal events and player records", () => {
  const result = simulateMatch(fixture());
  const goals = result.events.filter((event) => event.type === "goal");
  const homeGoals = goals.filter((event) => event.teamId === result.home.clubId).length;
  const awayGoals = goals.filter((event) => event.teamId === result.away.clubId).length;

  assert.equal(result.home.goals, homeGoals);
  assert.equal(result.away.goals, awayGoals);
  assert.equal(
    result.playerPerformances.reduce((sum, player) => sum + player.goals, 0),
    goals.length
  );
  assert.ok(goals.every((goal) => !goal.assistPlayerId || goal.assistPlayerId !== goal.playerId));
});

test("team possession always totals 100 percent", () => {
  const result = simulateMatch(fixture());
  assert.equal(result.home.possession + result.away.possession, 100);
});

test("player match ratings and minutes stay within supported ranges", () => {
  const result = simulateMatch(fixture());
  for (const player of result.playerPerformances) {
    assert.ok(player.rating >= 4 && player.rating <= 10);
    assert.ok(player.minutesPlayed >= 1 && player.minutesPlayed <= result.durationMinutes);
    assert.ok(player.shotsOnTarget <= player.shots);
    assert.ok(player.injuryDays === 0 || (player.injuryDays >= 3 && player.injuryDays <= 27));
  }
});

test("injury and card events are linked to an appearing player", () => {
  const result = simulateMatch(fixture({ seed: "event-heavy-regression-seed" }));
  const performances = new Map(result.playerPerformances.map((player) => [player.playerId, player]));
  for (const event of result.events.filter((item) => ["injury", "yellow-card"].includes(item.type))) {
    assert.ok(performances.has(event.playerId));
    assert.equal(performances.get(event.playerId).clubId, event.teamId);
    if (event.type === "injury") {
      assert.ok(event.daysOut >= 3 && event.daysOut <= 27);
    }
  }
});

test("rejects incomplete or invalid starting lineups", () => {
  const badHome = makeTeam("club-al-ahly", "الأهلي", 82);
  badHome.lineup.pop();
  assert.throws(() => simulateMatch(fixture({ home: badHome })), /11 لاعبًا/);

  const duplicateHome = makeTeam("club-al-ahly", "الأهلي", 82);
  duplicateHome.lineup[1].id = duplicateHome.lineup[0].id;
  assert.throws(() => simulateMatch(fixture({ home: duplicateHome })), /تكرار اللاعب/);

  const noKeeper = makeTeam("club-al-ahly", "الأهلي", 82);
  noKeeper.lineup[0].role = "دفاع";
  assert.throws(() => simulateMatch(fixture({ home: noKeeper })), /حارس مرمى واحدًا/);
});

test("rejects players duplicated across the two teams", () => {
  const away = makeTeam("club-zamalek", "الزمالك", 80);
  away.lineup[0].id = "club-al-ahly-player-1";
  assert.throws(() => simulateMatch(fixture({ away })), /تشكيلتي الفريقين/);
});

test("rejects invalid match dates and a club playing itself", () => {
  assert.throws(() => simulateMatch(fixture({ date: "2026-02-30" })), /تاريخها غير صالح/);
  const home = makeTeam("club-al-ahly", "الأهلي", 82);
  const away = makeTeam("club-al-ahly", "الأهلي", 82);
  assert.throws(() => simulateMatch(fixture({ home, away })), /مواجهة نفسه/);
});

test("keeps all generated match data internally consistent across many seeds", () => {
  for (let index = 0; index < 120; index += 1) {
    const result = simulateMatch(fixture({ id: "stress-match-" + index, seed: "stress-" + index }));
    const goals = result.events.filter((event) => event.type === "goal");
    const injuries = result.events.filter((event) => event.type === "injury");
    assert.equal(result.home.goals + result.away.goals, goals.length);
    assert.equal(result.home.possession + result.away.possession, 100);
    assert.ok(result.playerPerformances.length === 22);
    assert.ok(injuries.length <= 22);
    assert.ok(result.events.every((event) => event.id));
  }
});
