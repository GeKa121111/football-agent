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

test("portrait assignment includes all 13-layer features within allowed sets", () => {
  const assignments = WORLD_DATABASE.players.map((player) => ({
    ...player,
    ...createPortraitAssignment(player, clubById(player.clubId))
  }));
  for (const item of assignments) {
    const appearance = item.appearance;
    assert.ok(["small", "medium", "wide"].includes(appearance.nose), "nose: " + appearance.nose);
    assert.ok(["slight-smile", "neutral", "wide-smile", "serious"].includes(appearance.mouth));
    assert.ok(["thin", "medium", "thick"].includes(appearance.eyebrows));
    assert.ok(["normal", "narrow", "wide"].includes(appearance.eyeShape));
    assert.ok(["none", "headband", "earring"].includes(appearance.accessory));
    assert.ok(["round", "v", "polo"].includes(appearance.collar));
    assert.ok(["oval", "round", "angular", "square", "long"].includes(appearance.faceShape));
    assert.ok(["curly", "fade", "wavy", "short", "buzz", "long", "bald", "flat-top"].includes(appearance.haircut));
    assert.ok(["#f5d7b8", "#e8b88a", "#c68e5e", "#9c6b43", "#6f4423", "#4a2c17"].includes(item.skin));
  }
  assert.equal(validatePortraitAssignments(assignments).valid, true);
});

test("portrait age rules: no beard under 18, no bald under 26, grey hair only for 30+", () => {
  const young = createPortraitAssignment({ id: "age-17", age: 17, countryId: "country-eg" });
  assert.equal(young.appearance.facialHair, "none");
  for (let age = 16; age < 26; age += 1) {
    const assignment = createPortraitAssignment({ id: "age-" + age, age, countryId: "country-gb" });
    assert.notEqual(assignment.appearance.haircut, "bald", "age " + age);
  }
  const greyHaired = [];
  for (let index = 0; index < 200; index += 1) {
    const assignment = createPortraitAssignment({ id: "grey-check-" + index, age: 20 + (index % 10), countryId: "country-es" });
    if (assignment.hair === "#b6a27f") greyHaired.push(assignment);
  }
  // الأعمار في هذه العينة 20–29، فلا رمادي إطلاقًا قبل الثلاثين.
  assert.equal(greyHaired.length, 0);
});

test("portrait skin tones follow nationality weights (MENA darker on average)", () => {
  const tones = ["#f5d7b8", "#e8b88a", "#c68e5e", "#9c6b43", "#6f4423", "#4a2c17"];
  const mean = (region) => {
    const group = [];
    for (let index = 0; index < 60; index += 1) {
      const player = region === "mena"
        ? { id: "mena-" + index, age: 24, countryId: "country-eg" }
        : { id: "north-" + index, age: 24, countryId: "country-gb" };
      group.push(tones.indexOf(createPortraitAssignment(player).skin));
    }
    return group.reduce((sum, value) => sum + value, 0) / group.length;
  };
  assert.ok(mean("mena") > mean("north-europe"), "MENA mean=" + mean("mena") + " north=" + mean("north-europe"));
});

test("portrait validation rejects invalid new-layer values but tolerates missing ones", () => {
  const player = WORLD_DATABASE.players[0];
  const valid = createPortraitAssignment(player, clubById(player.clubId));
  const badNose = { ...player, ...valid, appearance: { ...valid.appearance, nose: "sunglasses" } };
  assert.equal(validatePortraitAssignments([badNose]).valid, false);
  const legacy = { ...player, ...valid, appearance: { ...valid.appearance } };
  delete legacy.appearance.nose;
  delete legacy.appearance.mouth;
  delete legacy.appearance.accessory;
  assert.equal(validatePortraitAssignments([legacy]).valid, true);
});
