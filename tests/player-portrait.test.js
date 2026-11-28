import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_PLAYERS } from "../src/data/demo-players.js";
import { getPortraitProfile } from "../src/ui/player-portrait.js";

test("every demo player has a distinct complete portrait profile", () => {
  const profiles = DEMO_PLAYERS.map(getPortraitProfile);
  assert.equal(new Set(profiles.map((profile) => profile.faceShape)).size, DEMO_PLAYERS.length);
  assert.equal(new Set(profiles.map((profile) => profile.hairStyle)).size, DEMO_PLAYERS.length);
  assert.equal(new Set(profiles.map((profile) => profile.kitPattern)).size, DEMO_PLAYERS.length);

  for (const profile of profiles) {
    assert.ok(["oval", "round", "angular", "square"].includes(profile.faceShape));
    assert.ok(["curly", "fade", "wavy", "short", "buzz"].includes(profile.hairStyle));
    assert.ok(["none", "stubble", "short-beard", "full-beard"].includes(profile.facialHair));
    assert.ok(["solid", "stripes", "sash", "chevron"].includes(profile.kitPattern));
    assert.match(profile.eyeColor, /^#[0-9a-f]{6}$/i);
    assert.ok(profile.shirtNumber >= 1 && profile.shirtNumber <= 99);
  }
});

test("portrait profiles sanitize invalid appearance values safely", () => {
  const profile = getPortraitProfile({
    skin: "url(javascript:alert(1))",
    hair: "#abcdef",
    kit: "#112233",
    kitLight: "#445566",
    shirtNumber: 120,
    appearance: {
      faceShape: "script",
      haircut: "url",
      facialHair: "danger",
      kitPattern: "html",
      eyeColor: "currentColor"
    }
  });

  assert.equal(profile.skin, "#bd8468");
  assert.equal(profile.hair, "#abcdef");
  assert.equal(profile.faceShape, "oval");
  assert.equal(profile.hairStyle, "short");
  assert.equal(profile.facialHair, "none");
  assert.equal(profile.kitPattern, "solid");
  assert.equal(profile.eyeColor, "#382820");
  assert.equal(profile.shirtNumber, 99);
});

test("portrait profile falls back to legacy hairstyle fields for old player records", () => {
  const profile = getPortraitProfile({ hairStyle: "hair-wavy", shirtNumber: 7 });
  assert.equal(profile.hairStyle, "wavy");
  assert.equal(profile.shirtNumber, 7);
});


test("portrait profiles expose stable asset metadata without changing football attributes", () => {
  const player = {
    id: "catalog-test-player",
    name: "اختبار اللاعب",
    rating: 74,
    potential: 88,
    age: 20,
    portraitAssetId: "portrait-catalog-test-player",
    portraitVersion: 1,
    portraitStyle: "illustrated-pro",
    portraitSeed: 12345
  };
  const profile = getPortraitProfile(player);
  assert.equal(profile.portraitAssetId, player.portraitAssetId);
  assert.equal(profile.portraitVersion, 1);
  assert.equal(profile.portraitStyle, "illustrated-pro");
  assert.equal(profile.portraitSeed, 12345);
  assert.equal(player.rating, 74);
  assert.equal(player.potential, 88);
});

test("portrait profile derives missing phase-3 features deterministically from the seed", () => {
  const player = { id: "seed-derived-player", name: "لاعب بلا ملامح", age: 24, role: "وسط", country: "مصر" };
  const first = getPortraitProfile(player);
  const second = getPortraitProfile(player);
  assert.deepEqual(first, second);
  assert.ok(["small", "medium", "wide"].includes(first.nose));
  assert.ok(["slight-smile", "neutral", "wide-smile", "serious"].includes(first.mouth));
  assert.ok(["thin", "medium", "thick"].includes(first.eyebrows));
  assert.ok(["normal", "narrow", "wide"].includes(first.eyeShape));
  assert.ok(["none", "headband", "earring"].includes(first.accessory));
  assert.ok(["round", "v", "polo"].includes(first.collar));
  assert.equal(first.background, "midfield");
});

test("portrait background follows the player position", () => {
  assert.equal(getPortraitProfile({ id: "gk-1", role: "حارس" }).background, "goalkeeper");
  assert.equal(getPortraitProfile({ id: "df-1", role: "دفاع" }).background, "defence");
  assert.equal(getPortraitProfile({ id: "fw-1", role: "مهاجم" }).background, "attack");
  assert.equal(getPortraitProfile({ id: "fw-2", position: "جناح أيسر" }).background, "attack");
  assert.equal(getPortraitProfile({ id: "xx-1" }).background, "midfield");
});

test("portrait profile sanitizes invalid phase-3 values instead of crashing", () => {
  const profile = getPortraitProfile({
    id: "bad-features",
    appearance: { nose: "huge", mouth: "grin", eyebrows: "bushy", eyeShape: "tiny", accessory: "sunglasses", collar: "turtleneck", faceShape: "triangle", haircut: "mohawk" }
  });
  assert.ok(["small", "medium", "wide"].includes(profile.nose));
  assert.ok(["slight-smile", "neutral", "wide-smile", "serious"].includes(profile.mouth));
  assert.ok(["none", "headband", "earring"].includes(profile.accessory));
  assert.ok(["oval", "round", "angular", "square", "long"].includes(profile.faceShape));
  assert.ok(["curly", "fade", "wavy", "short", "buzz", "long", "bald", "flat-top"].includes(profile.hairStyle));
});
