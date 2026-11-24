import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave } from "../src/core/storage.js";
import { WORLD_DATABASE, getWorldSquadPlayers } from "../src/data/world-database.js";
import {
  getClubNeedFitBonus,
  getClubNeedSnapshot,
  getPlayerPositionGroup
} from "../src/engines/club-needs-ai.js";

const CLUB_ID = "club-al-ahly";
const CENTRE_BACK = { position: "قلب دفاع", role: "دفاع" };

function withInjuries(save, playerIds, injuryDays = 14) {
  const injured = new Set(playerIds);
  return {
    ...save,
    world: {
      ...save.world,
      football: {
        ...save.world.football,
        playerDevelopment: {
          ...save.world.football.playerDevelopment,
          players: save.world.football.playerDevelopment.players.map((player) =>
            injured.has(player.playerId) ? { ...player, injuryDays } : player
          )
        }
      }
    }
  };
}

test("position classification distinguishes specialist roles from broad squad roles", () => {
  assert.equal(getPlayerPositionGroup({ position: "حارس مرمى", role: "حراسة" }).key, "goalkeeper");
  assert.equal(getPlayerPositionGroup({ position: "قلب دفاع", role: "دفاع" }).key, "centreBack");
  assert.equal(getPlayerPositionGroup({ position: "ظهير أيمن", role: "دفاع" }).key, "fullBack");
  assert.equal(getPlayerPositionGroup({ position: "وسط دفاعي", role: "وسط" }).key, "defensiveMidfield");
  assert.equal(getPlayerPositionGroup({ position: "جناح أيسر", role: "هجوم" }).key, "winger");
  assert.equal(getPlayerPositionGroup({ position: "غير معروف", role: "وسط" }).key, "midfield");
});

test("injured players are excluded from available centre-back depth and raise club need", () => {
  const save = createInitialSave();
  const centreBacks = getWorldSquadPlayers(WORLD_DATABASE).filter((player) =>
    player.clubId === CLUB_ID && getPlayerPositionGroup(player).key === "centreBack"
  );
  assert.equal(centreBacks.length, 2, "the seed squad should provide the expected two centre-backs");

  const baseline = getClubNeedSnapshot(CLUB_ID, CENTRE_BACK, save);
  assert.equal(baseline.availableDepth, 2);
  assert.equal(baseline.injuredDepth, 0);

  const injuredSave = withInjuries(save, centreBacks.map((player) => player.id));
  const injured = getClubNeedSnapshot(CLUB_ID, CENTRE_BACK, injuredSave);
  assert.equal(injured.availableDepth, 0);
  assert.equal(injured.injuredDepth, 2);
  assert.equal(injured.level, "critical");
  assert.ok(injured.needScore > baseline.needScore);
  assert.ok(getClubNeedFitBonus(injured) > getClubNeedFitBonus(baseline));
  assert.equal(save.world.football.playerDevelopment.players.every((player) => player.injuryDays === 0), true);
});

test("poor recent results raise the need to strengthen a club squad", () => {
  const save = createInitialSave();
  const losses = Array.from({ length: 5 }, (_, index) => ({
    id: "recent-loss-" + index,
    date: "2026-07-" + String(5 + index).padStart(2, "0"),
    home: { clubId: CLUB_ID, goals: 0 },
    away: { clubId: "club-zamalek", goals: 2 }
  }));
  const withResults = {
    ...save,
    world: {
      ...save.world,
      football: { ...save.world.football, results: losses }
    }
  };
  const stable = getClubNeedSnapshot(CLUB_ID, CENTRE_BACK, save);
  const struggling = getClubNeedSnapshot(CLUB_ID, CENTRE_BACK, withResults);
  assert.equal(struggling.recentMatches, 5);
  assert.equal(struggling.recentPoints, 0);
  assert.equal(struggling.recentPointsAvailable, 15);
  assert.equal(struggling.formBonus, 3);
  assert.equal(getClubNeedFitBonus(struggling), getClubNeedFitBonus(stable) + 3);
});

test("missing clubs return a safe, non-mutating fallback snapshot", () => {
  const save = createInitialSave();
  const snapshot = getClubNeedSnapshot("missing-club", CENTRE_BACK, save);
  assert.equal(snapshot.level, "normal");
  assert.equal(snapshot.needScore, 0);
  assert.match(snapshot.summary, /غير موجود/);
  assert.equal(save.world.currentDate, "2026-07-01");
});
