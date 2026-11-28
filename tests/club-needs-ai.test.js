import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave } from "../src/core/storage.js";
import { WORLD_DATABASE, getWorldPlayerProfiles, getWorldSquadPlayers } from "../src/data/world-database.js";
import { advanceAgencyManagementDay } from "../src/engines/agency-management.js";
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

test("existing club interest is recalculated weekly after injuries change positional depth", () => {
  const player = getWorldPlayerProfiles()[0];
  let save = createInitialSave();
  save = {
    ...save,
    agency: { ...save.agency, clients: [player.id] },
    world: { ...save.world, currentDate: "2026-07-06" }
  };

  const firstTick = advanceAgencyManagementDay(save, "2026-07-06", [player]);
  assert.equal(firstTick.error, undefined);
  const firstInterest = firstTick.save.agency.management.clubInterests.find((interest) =>
    interest.playerId === player.id && ["monitoring", "enquiry"].includes(interest.status)
  );
  assert.ok(firstInterest);
  const targetRoster = getWorldSquadPlayers(WORLD_DATABASE).filter((item) =>
    item.clubId === firstInterest.clubId &&
    getPlayerPositionGroup(item).key === firstInterest.needsSnapshot.positionKey
  );
  assert.ok(targetRoster.length > 0);

  const injuredIds = new Set(targetRoster.map((item) => item.id));
  save = {
    ...firstTick.save,
    world: {
      ...firstTick.save.world,
      currentDate: "2026-07-13",
      football: {
        ...firstTick.save.world.football,
        playerDevelopment: {
          ...firstTick.save.world.football.playerDevelopment,
          players: firstTick.save.world.football.playerDevelopment.players.map((item) =>
            injuredIds.has(item.playerId) ? { ...item, injuryDays: 10 } : item
          )
        }
      }
    }
  };
  const secondTick = advanceAgencyManagementDay(save, "2026-07-13", [player]);
  assert.equal(secondTick.error, undefined);
  const refreshed = secondTick.save.agency.management.clubInterests.find((interest) =>
    interest.id === firstInterest.id
  );
  assert.ok(refreshed);
  assert.equal(refreshed.needsSnapshot.injuredDepth, targetRoster.length);
  assert.equal(refreshed.needsSnapshot.availableDepth, 0);
  assert.equal(refreshed.needsSnapshot.level, "critical");
  assert.ok(refreshed.clubNeedBonus > firstInterest.clubNeedBonus);
});
