import test from "node:test";
import assert from "node:assert/strict";
import {
  WORLD_DATABASE,
  findWorldPlayer,
  getWorldPlayerProfiles,
  getWorldSummary,
  validateWorldDatabase
} from "../src/data/world-database.js";

test("ships a compact but connected multi-country world seed", () => {
  assert.deepEqual(getWorldSummary(), {
    countries: 8,
    leagues: 8,
    competitions: 10,
    clubs: 16,
    players: 16
  });
  assert.equal(validateWorldDatabase().valid, true);
});

test("each entity collection has stable unique IDs", () => {
  for (const collection of ["countries", "leagues", "competitions", "clubs", "players"]) {
    const ids = WORLD_DATABASE[collection].map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length, collection + " IDs must be unique");
    assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));
  }
});

test("leagues and clubs resolve to the same known country", () => {
  const countries = new Map(WORLD_DATABASE.countries.map((country) => [country.id, country]));
  const leagues = new Map(WORLD_DATABASE.leagues.map((league) => [league.id, league]));
  for (const league of WORLD_DATABASE.leagues) {
    assert.ok(countries.has(league.countryId), league.id);
  }
  for (const club of WORLD_DATABASE.clubs) {
    const league = leagues.get(club.leagueId);
    assert.ok(countries.has(club.countryId), club.id);
    assert.ok(league, club.id);
    assert.equal(league.countryId, club.countryId, club.id);
  }
});

test("domestic competitions only contain clubs from their linked league", () => {
  const clubs = new Map(WORLD_DATABASE.clubs.map((club) => [club.id, club]));
  const leagues = new Map(WORLD_DATABASE.leagues.map((league) => [league.id, league]));
  for (const competition of WORLD_DATABASE.competitions.filter((item) => item.type === "league")) {
    const league = leagues.get(competition.leagueId);
    assert.ok(league);
    assert.equal(competition.countryId, league.countryId);
    for (const clubId of competition.clubIds) {
      assert.equal(clubs.get(clubId)?.leagueId, league.id);
    }
  }
});

test("continental competitions contain only known clubs and no domestic league link", () => {
  const clubIds = new Set(WORLD_DATABASE.clubs.map((club) => club.id));
  for (const competition of WORLD_DATABASE.competitions.filter((item) => item.type === "continental")) {
    assert.equal(competition.countryId, null);
    assert.equal(competition.leagueId, null);
    assert.ok(competition.clubIds.length > 1);
    assert.ok(competition.clubIds.every((id) => clubIds.has(id)));
  }
});

test("players resolve nationality and current club and keep simulation attributes in bounds", () => {
  const countryIds = new Set(WORLD_DATABASE.countries.map((country) => country.id));
  const clubs = new Map(WORLD_DATABASE.clubs.map((club) => [club.id, club]));
  for (const player of WORLD_DATABASE.players) {
    assert.ok(countryIds.has(player.countryId), player.id);
    assert.ok(clubs.has(player.clubId), player.id);
    assert.ok(player.age >= 15 && player.age <= 45, player.id);
    assert.ok(player.rating >= 1 && player.rating <= 99, player.id);
    assert.ok(player.potential >= player.rating && player.potential <= 99, player.id);
    assert.ok(Number.isFinite(player.marketValueEur) && player.marketValueEur >= 0, player.id);
    assert.match(player.contractUntil, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(["هجوم", "وسط", "دفاع", "حراسة"].includes(player.role), player.id);
  }
});

test("player profiles are enriched from related club, league and nationality records", () => {
  const profiles = getWorldPlayerProfiles();
  assert.equal(profiles.length, WORLD_DATABASE.players.length);
  assert.equal(profiles[0].id, "demo-yassin-adel");
  assert.equal(profiles[0].club, "الأهلي");
  assert.equal(profiles[0].country, "مصر");
  assert.equal(profiles[0].league, "الدوري المصري الممتاز");
  assert.equal(profiles[0].value, "€1.2M");
  assert.ok(profiles.every((player) => player.appearance && player.kit && player.hair));
});

test("findWorldPlayer returns the stable record or null", () => {
  assert.equal(findWorldPlayer("demo-yassin-adel")?.name, "ياسين عادل");
  assert.equal(findWorldPlayer("missing-player"), null);
});

test("validation catches duplicate IDs and broken foreign keys", () => {
  const duplicate = structuredClone(WORLD_DATABASE);
  duplicate.clubs[1].id = duplicate.clubs[0].id;
  assert.equal(validateWorldDatabase(duplicate).valid, false);

  const brokenLink = structuredClone(WORLD_DATABASE);
  brokenLink.players[0].clubId = "missing-club";
  const validation = validateWorldDatabase(brokenLink);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("يشير إلى نادٍ غير موجود")));
});

test("seed data is immutable to protect shared simulation definitions", () => {
  assert.equal(Object.isFrozen(WORLD_DATABASE), true);
  assert.equal(Object.isFrozen(WORLD_DATABASE.players), true);
  assert.equal(Object.isFrozen(WORLD_DATABASE.players[0]), true);
});
