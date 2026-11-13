import test from "node:test";
import assert from "node:assert/strict";
import { WORLD_DATABASE, getWorldSquadPlayers } from "../src/data/world-database.js";
import {
  NATIONAL_TEAM_ROLE_QUOTAS,
  NATIONAL_TEAM_SQUAD_SIZE,
  getNationalTeamProfiles,
  getEligibleNationalTeamPlayers,
  selectNationalTeamSquad,
  isValidNationalTeamSquad
} from "../src/engines/national-teams.js";

test("builds one national-team profile for every country with stable unique IDs", () => {
  const teams = getNationalTeamProfiles();
  assert.equal(teams.length, WORLD_DATABASE.countries.length);
  assert.equal(new Set(teams.map((team) => team.id)).size, teams.length);
  assert.deepEqual(
    teams.map((team) => team.countryId).sort(),
    WORLD_DATABASE.countries.map((country) => country.id).sort()
  );
  assert.ok(teams.every((team) => team.squadSize === NATIONAL_TEAM_SQUAD_SIZE));
});

test("selects a complete, position-balanced and nationality-safe squad for every country", () => {
  for (const country of WORLD_DATABASE.countries) {
    const team = selectNationalTeamSquad(country.id);
    assert.equal(team.squadSize, NATIONAL_TEAM_SQUAD_SIZE);
    assert.equal(team.players.length, NATIONAL_TEAM_SQUAD_SIZE);
    assert.equal(new Set(team.players.map((player) => player.playerId)).size, NATIONAL_TEAM_SQUAD_SIZE);
    assert.ok(team.players.every((player) => player.countryId === country.id));
    assert.ok(isValidNationalTeamSquad(team, country.id));

    for (const [role, required] of Object.entries(NATIONAL_TEAM_ROLE_QUOTAS)) {
      assert.equal(team.players.filter((player) => player.role === role).length, required);
    }
    assert.deepEqual(team.players.map((player) => player.shirtNumber), Array.from({ length: 23 }, (_, index) => index + 1));
  }
});

test("nationality remains tied to the player's country rather than their current club", () => {
  const player = getWorldSquadPlayers().find((item) => item.countryId === "country-eg");
  assert.ok(player);
  const team = selectNationalTeamSquad("country-eg");
  assert.ok(team.players.every((member) => member.countryId === "country-eg"));
  assert.ok(team.players.some((member) => member.playerId === player.id) ||
    getEligibleNationalTeamPlayers("country-eg").some((candidate) => candidate.id === player.id));
});

test("uses live development rating and fitness when ranking eligible players", () => {
  const countryId = "country-eg";
  const candidates = getEligibleNationalTeamPlayers(countryId);
  const candidate = [...candidates].reverse().find((player) => player.role === "حراسة");
  assert.ok(candidate);
  const playerDevelopment = {
    players: [{
      playerId: candidate.id,
      rating: 99,
      potential: 99,
      fitness: 100,
      injuryDays: 0
    }]
  };
  const team = selectNationalTeamSquad(countryId, { playerDevelopment });
  const selected = team.players.find((player) => player.playerId === candidate.id);
  assert.ok(selected);
  assert.equal(selected.rating, 99);
});

test("does not select injured or explicitly excluded players", () => {
  const countryId = "country-eg";
  const candidates = getEligibleNationalTeamPlayers(countryId);
  const injured = candidates[0];
  const excluded = candidates[1];
  const playerDevelopment = {
    players: [{ playerId: injured.id, injuryDays: 12, fitness: 100 }]
  };
  const pool = getEligibleNationalTeamPlayers(countryId, {
    playerDevelopment,
    excludedPlayerIds: [excluded.id]
  });
  assert.ok(!pool.some((player) => player.id === injured.id));
  assert.ok(!pool.some((player) => player.id === excluded.id));
  const team = selectNationalTeamSquad(countryId, {
    playerDevelopment,
    excludedPlayerIds: [excluded.id]
  });
  assert.ok(!team.players.some((player) => player.playerId === injured.id));
  assert.ok(!team.players.some((player) => player.playerId === excluded.id));
});

test("rejects invalid national-team squads and wrong-nationality substitutions", () => {
  const team = selectNationalTeamSquad("country-eg");
  const invalid = structuredClone(team);
  const foreignPlayer = getWorldSquadPlayers().find((player) => player.countryId !== "country-eg");
  const replaced = invalid.players[0];
  invalid.players[0] = {
    ...replaced,
    playerId: foreignPlayer.id,
    playerName: foreignPlayer.name,
    countryId: foreignPlayer.countryId,
    clubId: foreignPlayer.clubId,
    role: foreignPlayer.role,
    age: foreignPlayer.age
  };
  assert.equal(isValidNationalTeamSquad(invalid, "country-eg"), false);
  assert.throws(() => selectNationalTeamSquad("country-not-found"), /الدولة غير موجودة/);
});

test("fails safely when an entire required position group is unavailable", () => {
  const goalkeepers = getWorldSquadPlayers()
    .filter((player) => player.countryId === "country-eg" && player.role === "حراسة")
    .map((player) => player.id);
  assert.throws(
    () => selectNationalTeamSquad("country-eg", { excludedPlayerIds: goalkeepers }),
    /لا يوجد عدد كافٍ من اللاعبين المتاحين/
  );
});
