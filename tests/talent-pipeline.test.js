import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave, isValidSave } from "../src/core/storage.js";
import {
  createInitialTalentPipelineState,
  getTalentProspect,
  isValidTalentPipelineState,
  upsertTalentProspect
} from "../src/engines/talent-pipeline.js";

function player(overrides = {}) {
  return {
    id: "pipeline-player-1",
    name: "لاعب صندوق المواهب",
    age: 19,
    club: "نادي تجريبي",
    position: "مهاجم",
    rating: 72,
    potential: 88,
    ...overrides
  };
}

test("creates a persistent empty pipeline in each new career save", () => {
  const save = createInitialSave();
  assert.deepEqual(save.agency.talentPipeline, createInitialTalentPipelineState());
  assert.equal(isValidTalentPipelineState(save.agency.talentPipeline, save.world.currentDate), true);
  assert.equal(isValidSave(save), true);
});

test("tracks one player by stable ID and merges scouting and watchlist sources", () => {
  const save = createInitialSave();
  const first = upsertTalentProspect(save, player(), {
    sourceIds: ["scouting"],
    stage: "discovered"
  });
  assert.equal(first.changed, true);
  assert.equal(first.entry.id, "talent-prospect-1");
  assert.deepEqual(first.entry.sourceIds, ["scouting"]);
  assert.equal(first.save.agency.balance, save.agency.balance);
  assert.deepEqual(first.save.agency.clients, []);

  const second = upsertTalentProspect(first.save, player(), {
    sourceIds: ["watchlist"]
  });
  assert.equal(second.changed, true);
  assert.equal(second.save.agency.talentPipeline.entries.length, 1);
  assert.equal(second.entry.id, first.entry.id);
  assert.deepEqual(second.entry.sourceIds, ["scouting", "watchlist"]);
  assert.equal(second.entry.stage, "discovered");
  assert.equal(isValidSave(second.save), true);
});

test("stores follow-up stage, note, and a future date without changing client or offer state", () => {
  const save = createInitialSave();
  const result = upsertTalentProspect(save, player(), {
    sourceIds: ["scouting"],
    stage: "contacted",
    note: "تمت مكالمة أولية مع اللاعب",
    nextFollowUpDate: "2026-07-10"
  });
  assert.equal(result.changed, true);
  assert.equal(result.entry.lastContactDate, "2026-07-01");
  assert.equal(result.entry.nextFollowUpDate, "2026-07-10");
  assert.equal(result.entry.note, "تمت مكالمة أولية مع اللاعب");
  assert.equal(result.save.agency.clients.length, 0);
  assert.equal(result.save.agency.representation.offers.length, 0);
  assert.equal(isValidSave(result.save), true);
});

test("preserves the pipeline when a new scouting source is added and permits archiving", () => {
  const save = createInitialSave();
  const added = upsertTalentProspect(save, player(), { sourceId: "manual" });
  const archived = upsertTalentProspect(added.save, player(), {
    stage: "archived",
    note: "تم إيقاف المتابعة مؤقتًا"
  });
  assert.equal(archived.entry.stage, "archived");
  assert.equal(archived.entry.note, "تم إيقاف المتابعة مؤقتًا");
  assert.equal(archived.save.agency.talentPipeline.entries.length, 1);
  assert.equal(isValidSave(archived.save), true);
});

test("rejects invalid player details, stages, sources, dates, and malformed saved records", () => {
  const save = createInitialSave();
  assert.equal(upsertTalentProspect(save, player({ potential: 60 }), { sourceId: "scouting" }).changed, false);
  assert.equal(upsertTalentProspect(save, player(), { sourceId: "untrusted-source" }).changed, false);
  assert.equal(upsertTalentProspect(save, player(), { stage: "negotiating" }).changed, false);
  assert.equal(upsertTalentProspect(save, player(), { nextFollowUpDate: "2026-02-31" }).changed, false);

  const added = upsertTalentProspect(save, player(), { sourceId: "scouting" });
  const invalidSource = structuredClone(added.save.agency.talentPipeline);
  invalidSource.entries[0].sourceIds = ["scouting", "made-up"];
  assert.equal(isValidTalentPipelineState(invalidSource, save.world.currentDate), false);

  const duplicatePlayer = structuredClone(added.save.agency.talentPipeline);
  duplicatePlayer.entries.push({ ...duplicatePlayer.entries[0], id: "talent-prospect-2" });
  duplicatePlayer.nextSequence = 3;
  assert.equal(isValidTalentPipelineState(duplicatePlayer, save.world.currentDate), false);

  const invalidFollowUp = structuredClone(added.save);
  invalidFollowUp.agency.talentPipeline.entries[0].nextFollowUpDate = "2026-02-31";
  assert.equal(isValidSave(invalidFollowUp), false);
});

test("keeps older v4 saves valid when they do not yet contain a talent pipeline", () => {
  const legacy = createInitialSave();
  delete legacy.agency.talentPipeline;
  assert.equal(isValidSave(legacy), true);
});
