import test from "node:test";
import assert from "node:assert/strict";
import { WORLD_DATABASE } from "../src/data/world-database.js";
import {
  createPortraitAssignment,
  getPortraitAssetId,
  validatePortraitAssignments
} from "../src/data/player-portrait-catalog.js";

function clubById(clubId) {
  return WORLD_DATABASE.clubs.find((club) => club.id === clubId);
}

test("all world players receive a unique, complete portrait asset identity", () => {
  const assignments = WORLD_DATABASE.players.map((player) => ({
    ...player,
    ...createPortraitAssignment(player, clubById(player.clubId))
  }));
  const validation = validatePortraitAssignments(assignments);
  assert.equal(validation.valid, true, validation.errors.join(" "));
  assert.equal(new Set(assignments.map((player) => player.portraitAssetId)).size, 48);
});

test("portrait identities and visual profiles remain stable independent of object order", () => {
  const player = WORLD_DATABASE.players[9];
  const club = clubById(player.clubId);
  const first = createPortraitAssignment(player, club);
  const reordered = createPortraitAssignment({ ...player }, { ...club });
  assert.deepEqual(first, reordered);
  assert.equal(getPortraitAssetId(player.id), first.portraitAssetId);
  assert.equal(getPortraitAssetId(player.id), getPortraitAssetId(player.id));
});

test("portrait catalog produces varied deterministic illustration traits", () => {
  const assignments = WORLD_DATABASE.players.map((player) => createPortraitAssignment(player, clubById(player.clubId)));
  assert.ok(new Set(assignments.map((item) => item.skin)).size >= 5);
  assert.ok(new Set(assignments.map((item) => item.hair)).size >= 4);
  assert.ok(new Set(assignments.map((item) => item.appearance.haircut)).size >= 4);
  assert.ok(new Set(assignments.map((item) => item.appearance.kitPattern)).size >= 3);
  assert.ok(new Set(assignments.map((item) => item.kit)).size >= 8);
});

test("portrait assignment requires a stable player ID and defaults safely without a club color", () => {
  assert.throws(() => createPortraitAssignment({ name: "No ID" }), /معرف ثابت/);
  const assignment = createPortraitAssignment({ id: "test-player", age: 20 });
  assert.equal(assignment.kit, "#344d78");
  assert.equal(assignment.portraitAssetId, "portrait-test-player");
});


test("portrait catalog rejects an asset ID or seed that belongs to another player", () => {
  const player = WORLD_DATABASE.players[0];
  const valid = createPortraitAssignment(player, clubById(player.clubId));
  const wrongAsset = { ...player, ...valid, portraitAssetId: "portrait-another-player" };
  assert.equal(validatePortraitAssignments([wrongAsset]).valid, false);

  const wrongSeed = { ...player, ...valid, portraitSeed: valid.portraitSeed + 1 };
  assert.equal(validatePortraitAssignments([wrongSeed]).valid, false);

  const unsupportedVersion = { ...player, ...valid, portraitVersion: 99 };
  assert.equal(validatePortraitAssignments([unsupportedVersion]).valid, false);
});

test("all 48 players have visually unique core portrait signatures", () => {
  const assignments = WORLD_DATABASE.players.map((player) => createPortraitAssignment(player, clubById(player.clubId)));
  const signatures = assignments.map((item) => [
    item.skin,
    item.hair,
    item.appearance.haircut,
    item.appearance.faceShape,
    item.appearance.kitPattern
  ].join("|"));
  assert.equal(new Set(signatures).size, signatures.length);
});
