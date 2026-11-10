import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_PLAYERS } from "../src/data/demo-players.js";

test("demo player IDs are unique and stable", () => {
  const ids = DEMO_PLAYERS.map((player) => player.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));
});

test("demo player ratings and ages stay within game bounds", () => {
  for (const player of DEMO_PLAYERS) {
    assert.ok(Number.isInteger(player.age) && player.age >= 15 && player.age <= 50);
    assert.ok(Number.isInteger(player.rating) && player.rating >= 1 && player.rating <= 99);
    assert.ok(Number.isInteger(player.potential) && player.potential >= player.rating && player.potential <= 99);
    assert.ok(Number.isInteger(player.shirtNumber));
  }
});

test("every demo player has display and illustration fields", () => {
  for (const player of DEMO_PLAYERS) {
    assert.ok(player.name);
    assert.ok(player.position);
    assert.ok(player.club);
    assert.match(player.skin, /^#[0-9a-f]{6}$/i);
    assert.match(player.hair, /^#[0-9a-f]{6}$/i);
    assert.match(player.kit, /^#[0-9a-f]{6}$/i);
    assert.match(player.kitLight, /^#[0-9a-f]{6}$/i);
    assert.ok(["hair-curly", "hair-fade", "hair-wavy"].includes(player.hairStyle));
  }
});
