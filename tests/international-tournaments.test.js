import test from "node:test";
import assert from "node:assert/strict";
import { WORLD_DATABASE } from "../src/data/world-database.js";
import {
  advanceInternationalTournament,
  createInternationalTournamentPlan,
  getInternationalTournamentStandings,
  isValidInternationalTournamentPlan
} from "../src/engines/international-tournaments.js";

function resultsFor(fixtures, homeGoals = 2, awayGoals = 0) {
  return fixtures.map((fixture) => ({
    fixtureId: fixture.id,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeGoals,
    awayGoals
  }));
}

test("builds deterministic continental tournaments and a qualified World Cup", () => {
  const first = createInternationalTournamentPlan({ season: 3, startDate: "2028-06-01" });
  const second = createInternationalTournamentPlan({ season: 3, startDate: "2028-06-01" });

  assert.deepEqual(first, second);
  assert.equal(first.continental.length, 3);
  assert.deepEqual(first.continental.map((item) => item.confederation), ["CAF", "CONMEBOL", "UEFA"]);
  assert.equal(first.worldCup.teams.length, 6);
  assert.equal(first.worldCup.groups.length, 2);
  assert.ok(first.worldCup.teams.every((team) => team.worldCupSeed >= 1));
  assert.equal(isValidInternationalTournamentPlan(first), true);
});

test("group fixtures are unique and every team meets each group opponent once", () => {
  const plan = createInternationalTournamentPlan({ season: 4 });
  for (const tournament of [...plan.continental, plan.worldCup]) {
    for (const group of tournament.groups) {
      const fixtures = tournament.fixtures.filter((fixture) => fixture.groupId === group.id);
      const pairs = fixtures.map((fixture) =>
        [fixture.homeTeamId, fixture.awayTeamId].sort().join("::")
      );
      assert.equal(new Set(pairs).size, pairs.length);
      assert.equal(pairs.length, group.teamIds.length * (group.teamIds.length - 1) / 2);
    }
  }
});

test("group standings wait for all matches and use points and goal difference", () => {
  const plan = createInternationalTournamentPlan({ season: 5 });
  const tournament = plan.worldCup;
  assert.ok(getInternationalTournamentStandings(tournament, []).every((group) => group.standings === null));

  const results = resultsFor(tournament.fixtures);
  const tables = getInternationalTournamentStandings(tournament, results);
  assert.equal(tables.length, 2);
  assert.ok(tables.every((group) => Array.isArray(group.standings) && group.standings.length === 3));
  assert.ok(tables.every((group) => group.standings[0].points >= group.standings[1].points));
});

test("World Cup progresses groups to cross semi-finals, final and one champion", () => {
  const plan = createInternationalTournamentPlan({ season: 6 });
  let tournament = plan.worldCup;
  tournament = advanceInternationalTournament(tournament, resultsFor(tournament.fixtures));
  assert.equal(tournament.stage, "semi-final");
  assert.equal(tournament.fixtures.filter((fixture) => fixture.phase === "semi-final").length, 2);

  const afterSemiFinals = advanceInternationalTournament(
    tournament,
    resultsFor(tournament.fixtures.filter((fixture) => fixture.phase === "semi-final"))
  );
  assert.equal(afterSemiFinals.stage, "final");
  const finalFixture = afterSemiFinals.fixtures.find((fixture) => fixture.phase === "final");
  assert.ok(finalFixture);

  const completed = advanceInternationalTournament(afterSemiFinals, resultsFor([finalFixture], 1, 0));
  assert.equal(completed.status, "completed");
  assert.equal(completed.stage, "completed");
  assert.ok(completed.teams.some((team) => team.id === completed.championTeamId));
  assert.equal(advanceInternationalTournament(completed, []).advanced, false);
});

test("two-team confederation tournament starts with a final and archives its winner", () => {
  const plan = createInternationalTournamentPlan({ season: 7 });
  const tournament = plan.continental.find((item) => item.confederation === "CONMEBOL");
  assert.equal(tournament.teams.length, 2);
  assert.equal(tournament.stage, "final");
  assert.equal(tournament.fixtures.length, 1);

  const completed = advanceInternationalTournament(tournament, resultsFor(tournament.fixtures, 0, 1));
  assert.equal(completed.status, "completed");
  assert.equal(completed.championTeamId, tournament.fixtures[0].awayTeamId);
});

test("a tied knockout match requires an explicit extra-time or shootout winner", () => {
  const plan = createInternationalTournamentPlan({ season: 8 });
  const tournament = plan.continental.find((item) => item.confederation === "CONMEBOL");
  const fixture = tournament.fixtures[0];
  const tied = [{
    fixtureId: fixture.id,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeGoals: 1,
    awayGoals: 1
  }];
  assert.throws(() => advanceInternationalTournament(tournament, tied), /فائز موثق/);
  const completed = advanceInternationalTournament(tournament, [{
    ...tied[0],
    winnerTeamId: fixture.homeTeamId
  }]);
  assert.equal(completed.championTeamId, fixture.homeTeamId);
});

test("invalid dates, duplicate teams and invalid tournament records are rejected", () => {
  assert.throws(() => createInternationalTournamentPlan({ startDate: "2027-02-30" }), /مدخلات/);
  const plan = createInternationalTournamentPlan({ season: 9 });
  const invalid = structuredClone(plan);
  invalid.worldCup.teams[1].id = invalid.worldCup.teams[0].id;
  assert.equal(isValidInternationalTournamentPlan(invalid), false);
});

test("malformed groups, teams and duplicate result records fail closed", () => {
  const plan = createInternationalTournamentPlan({ season: 10 });
  const nullTeam = structuredClone(plan);
  nullTeam.worldCup.teams[0] = null;
  assert.equal(isValidInternationalTournamentPlan(nullTeam), false);

  const nullGroup = structuredClone(plan);
  nullGroup.worldCup.groups[0] = null;
  assert.equal(isValidInternationalTournamentPlan(nullGroup), false);

  const tournament = plan.worldCup;
  const duplicateResults = resultsFor(tournament.fixtures);
  duplicateResults.push(duplicateResults[0]);
  assert.throws(
    () => getInternationalTournamentStandings(tournament, duplicateResults),
    /نتيجة مكررة/
  );
});
