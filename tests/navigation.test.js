import test from "node:test";
import assert from "node:assert/strict";
import { NAV_ITEMS, isPrimaryView } from "../src/ui/layout/navigation.js";

test("primary navigation has five unique routes", () => {
  assert.equal(NAV_ITEMS.length, 6);
  assert.equal(new Set(NAV_ITEMS.map((item) => item.id)).size, NAV_ITEMS.length);
  assert.deepEqual(NAV_ITEMS.map((item) => item.id), [
    "dashboard", "players", "scouting", "market", "agency"
  ]);
});

test("primary navigation labels and hints are non-empty", () => {
  for (const item of NAV_ITEMS) {
    assert.ok(item.label.trim());
    assert.ok(item.hint.trim());
    assert.ok(item.icon.trim());
  }
});

test("unknown views fall back instead of being treated as primary routes", () => {
  assert.equal(isPrimaryView("dashboard"), true);
  assert.equal(isPrimaryView("scouting"), true);
  assert.equal(isPrimaryView("settings"), false);
  assert.equal(isPrimaryView(""), false);
});
