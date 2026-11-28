import test from "node:test";
import assert from "node:assert/strict";
import {
  isWakilEnabled, setWakilEnabled, mountWakil, getTodaySummary, WAKIL_FLAG_KEY
} from "../src/ui/wakil.js";
import { derivePortraitSeed, getPortraitProfile } from "../src/ui/player-portrait.js";

function mem() {
  const m = new Map();
  return {
    getItem: (key) => m.get(key) ?? null,
    setItem: (key, value) => m.set(key, String(value)),
    removeItem: (key) => m.delete(key)
  };
}

test("wakil identity is enabled by default and can be switched off", () => {
  const storage = mem();
  assert.equal(isWakilEnabled(storage), true);
  setWakilEnabled(false, storage);
  assert.equal(storage.getItem(WAKIL_FLAG_KEY), "0");
  assert.equal(isWakilEnabled(storage), false);
  setWakilEnabled(true, storage);
  assert.equal(isWakilEnabled(storage), true);
});

test("mountWakil adds the wakil-ui class when enabled", () => {
  const storage = mem();
  const classes = new Set();
  const doc = { documentElement: { classList: { add: (name) => classes.add(name) } } };
  assert.equal(mountWakil(doc, storage), true);
  assert.ok(classes.has("wakil-ui"));

  setWakilEnabled(false, storage);
  const classes2 = new Set();
  const doc2 = { documentElement: { classList: { add: (name) => classes2.add(name) } } };
  assert.equal(mountWakil(doc2, storage), false);
  assert.equal(classes2.size, 0);
});

test("getTodaySummary counts decisions from the save", () => {
  const summary = getTodaySummary({
    career: { season: 2, week: 5, day: 29 },
    agency: { balance: 120000, clients: ["a", "b"] },
    world: { currentDate: "2026-08-15", activeOffers: [{ id: "o1" }] }
  });
  assert.equal(summary.season, 2);
  assert.equal(summary.clientsCount, 2);
  assert.equal(summary.activeOffersCount, 1);
  assert.equal(summary.hasDecisions, true);
  assert.equal(getTodaySummary({}).hasDecisions, false);
});

test("portrait seed is deterministic per player id", () => {
  assert.equal(derivePortraitSeed("player-1"), derivePortraitSeed("player-1"));
  assert.notEqual(derivePortraitSeed("player-1"), derivePortraitSeed("player-2"));
  assert.equal(Number.isSafeInteger(derivePortraitSeed("player-1")), true);
  assert.equal(getPortraitProfile({ id: "player-1" }).portraitSeed, derivePortraitSeed("player-1"));
  assert.equal(getPortraitProfile({ id: "player-1", portraitSeed: 42 }).portraitSeed, 42);
});
