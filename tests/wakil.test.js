import test from "node:test";
import assert from "node:assert/strict";
import {
  isWakilEnabled, setWakilEnabled, mountWakil, getTodaySummary, WAKIL_FLAG_KEY,
  getWakilTheme, setWakilTheme, resolveWakilTheme, applyWakilTheme,
  toggleWakilTheme, watchSystemTheme, WAKIL_THEME_KEY
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
  const doc = { documentElement: { classList: {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name)
  } } };
  assert.equal(mountWakil(doc, storage), true);
  assert.ok(classes.has("wakil-ui"));

  setWakilEnabled(false, storage);
  const classes2 = new Set();
  const doc2 = { documentElement: { classList: {
    add: (name) => classes2.add(name),
    remove: (name) => classes2.delete(name)
  } } };
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

test("wakil theme defaults to auto and rejects invalid values", () => {
  const storage = mem();
  assert.equal(getWakilTheme(storage), "auto");
  setWakilTheme("dark", storage);
  assert.equal(getWakilTheme(storage), "dark");
  setWakilTheme("nonsense", storage);
  assert.equal(getWakilTheme(storage), "auto");
  assert.equal(storage.getItem(WAKIL_THEME_KEY), "auto");
});

test("wakil theme resolves auto from the system preference", () => {
  const darkDoc = { defaultView: { matchMedia: () => ({ matches: true }) } };
  const lightDoc = { defaultView: { matchMedia: () => ({ matches: false }) } };
  assert.equal(resolveWakilTheme("auto", darkDoc), "dark");
  assert.equal(resolveWakilTheme("auto", lightDoc), "light");
  assert.equal(resolveWakilTheme("dark", lightDoc), "dark");
  assert.equal(resolveWakilTheme("light", darkDoc), "light");
  assert.equal(resolveWakilTheme("auto"), "light");
});

test("applyWakilTheme toggles the wakil-dark class on the document element", () => {
  const classes = new Set(["wakil-ui"]);
  const doc = { documentElement: { classList: {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
    contains: (name) => classes.has(name)
  } } };
  const storage = mem();
  setWakilTheme("dark", storage);
  assert.equal(applyWakilTheme(undefined, doc, storage), "dark");
  assert.equal(classes.has("wakil-dark"), true);
  setWakilTheme("light", storage);
  assert.equal(applyWakilTheme(undefined, doc, storage), "light");
  assert.equal(classes.has("wakil-dark"), false);
});

test("toggleWakilTheme flips the resolved theme and persists it", () => {
  const classes = new Set();
  const doc = { documentElement: { classList: {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
    contains: (name) => classes.has(name)
  } } };
  const storage = mem();
  assert.equal(toggleWakilTheme(storage, doc), "dark");
  assert.equal(storage.getItem(WAKIL_THEME_KEY), "dark");
  assert.equal(classes.has("wakil-dark"), true);
  assert.equal(toggleWakilTheme(storage, doc), "light");
  assert.equal(classes.has("wakil-dark"), false);
});

test("watchSystemTheme follows system changes only while the theme is auto", () => {
  let dark = false;
  const listeners = [];
  const media = {
    matches: false,
    addEventListener: (type, fn) => listeners.push(fn),
    removeEventListener: (type, fn) => { const index = listeners.indexOf(fn); if (index >= 0) listeners.splice(index, 1); }
  };
  const doc = {
    defaultView: { matchMedia: () => media },
    documentElement: { classList: {
      add: () => { dark = true; },
      remove: () => { dark = false; },
      contains: () => dark
    } }
  };
  const storage = mem();
  const off = watchSystemTheme(storage, doc);
  assert.equal(typeof off, "function");
  // النظام يتحول للداكن والثيم auto → يطبَّق الداكن.
  media.matches = true;
  listeners.forEach((fn) => fn());
  assert.equal(dark, true);
  // المستخدم يثبّت الفاتح → تغير النظام لا يؤثر.
  setWakilTheme("light", storage);
  applyWakilTheme("light", doc, storage);
  media.matches = false;
  listeners.forEach((fn) => fn());
  assert.equal(dark, false);
  off();
});
