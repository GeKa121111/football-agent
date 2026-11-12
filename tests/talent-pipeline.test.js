import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave, isValidSave } from "../src/core/storage.js";
import {
  createInitialTalentPipelineState,
  getTalentProspect,
  getTalentProspectPerformanceSummary,
  recordTalentProspectMatchPerformances,
  isValidTalentPipelineState,
  upsertTalentProspect,
  recordTalentProspectContact,
  completeTalentProspectFollowUp,
  assignTalentProspectStaff,
  handoffTalentProspectToClientManagement
} from "../src/engines/talent-pipeline.js";
import {
  createRepresentationOffer,
  evaluateRepresentationOffer,
  getPlayerRepresentationProfile
} from "../src/engines/representation.js";
import { completeCareerTask } from "../src/engines/career-calendar.js";

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

test("normalizes fractional development ratings when saving a talent prospect", () => {
  const save = createInitialSave();
  const result = upsertTalentProspect(save, player({
    rating: 70.4,
    potential: 88.7
  }), { sourceId: "scouting" });

  assert.equal(result.changed, true);
  assert.equal(result.entry.rating, 70);
  assert.equal(result.entry.potential, 89);
  assert.equal(isValidSave(result.save), true);
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
  assert.equal(upsertTalentProspect(save, player(), {
    nextFollowUpDate: "2026-06-30"
  }).changed, false);
});

test("records real match performances in a prospect activity trail and ignores replays and fillers", () => {
  const save = createInitialSave();
  const tracked = upsertTalentProspect(save, player(), { sourceId: "scouting" });
  const result = {
    id: "match-prospect-performance-1",
    date: "2026-07-04",
    season: 1,
    competitionId: "competition-eg-premier",
    competitionName: "الدوري المصري الممتاز",
    round: 1,
    leg: 1,
    groupId: null,
    groupName: null,
    home: { clubId: "club-al-ahly", name: "الأهلي" },
    away: { clubId: "club-zamalek", name: "الزمالك" },
    playerPerformances: [
      {
        playerId: player().id,
        playerName: player().name,
        clubId: "club-al-ahly",
        minutesPlayed: 90,
        rating: 8.4,
        goals: 1,
        assists: 1,
        yellowCards: 0,
        simulationOnly: false
      },
      {
        playerId: "simulation-only-player",
        playerName: "لاعب محاكاة",
        clubId: "club-al-ahly",
        minutesPlayed: 90,
        rating: 9.1,
        goals: 2,
        assists: 0,
        yellowCards: 0,
        simulationOnly: true
      }
    ]
  };

  const matchdaySave = {
    ...tracked.save,
    world: { ...tracked.save.world, currentDate: "2026-07-04" }
  };
  const recorded = recordTalentProspectMatchPerformances(
    matchdaySave,
    [result],
    "2026-07-04"
  );
  assert.equal(recorded.changed, true);
  assert.equal(recorded.recordedCount, 1);
  assert.equal(isValidSave(recorded.save), true);

  const entry = getTalentProspect(recorded.save.agency.talentPipeline, player().id);
  const event = entry.activity.find((item) => item.type === "match-performance");
  assert.equal(event.matchId, result.id);
  assert.equal(event.opponentClubId, "club-zamalek");
  assert.equal(event.minutesPlayed, 90);
  assert.equal(event.rating, 8.4);
  assert.match(event.note, /1 هدف/);
  assert.match(event.note, /1 صناعة/);

  const summary = getTalentProspectPerformanceSummary(entry);
  assert.equal(summary.appearances, 1);
  assert.equal(summary.minutesPlayed, 90);
  assert.equal(summary.goals, 1);
  assert.equal(summary.assists, 1);
  assert.equal(summary.averageMatchRating, 8.4);
  assert.equal(summary.recentFormRating, 8.4);
  assert.equal(summary.lastAppearanceDate, "2026-07-04");

  const replay = recordTalentProspectMatchPerformances(
    recorded.save,
    [result],
    "2026-07-04"
  );
  assert.equal(replay.changed, false);
  assert.equal(replay.recordedCount, 0);
  assert.equal(replay.save, recorded.save);
});

test("does not backfill matches played before prospect discovery or alter archived prospects", () => {
  const save = createInitialSave();
  const discovered = upsertTalentProspect(save, player(), { sourceId: "manual" });
  const archived = upsertTalentProspect(discovered.save, player(), { stage: "archived" });
  const result = {
    id: "match-before-prospect",
    date: "2026-06-30",
    season: 1,
    competitionId: "competition-eg-premier",
    competitionName: "الدوري المصري الممتاز",
    round: 1,
    leg: 1,
    groupName: null,
    home: { clubId: "club-al-ahly", name: "الأهلي" },
    away: { clubId: "club-zamalek", name: "الزمالك" },
    playerPerformances: [{
      playerId: player().id,
      clubId: "club-al-ahly",
      minutesPlayed: 90,
      rating: 7,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      simulationOnly: false
    }]
  };
  const ignored = recordTalentProspectMatchPerformances(
    archived.save,
    [result],
    "2026-07-01"
  );
  assert.equal(ignored.changed, false);
  assert.equal(getTalentProspect(ignored.save.agency.talentPipeline, player().id).activity.length, 2);
  assert.equal(isValidSave(ignored.save), true);
});

test("keeps older v4 saves valid when they do not yet contain a talent pipeline", () => {
  const legacy = createInitialSave();
  delete legacy.agency.talentPipeline;
  assert.equal(isValidSave(legacy), true);
});


test("records stage changes as a chronological activity trail without duplicating unchanged stages", () => {
  const save = createInitialSave();
  const first = upsertTalentProspect(save, player(), {
    sourceId: "scouting",
    stage: "discovered",
    stageNote: "ظهر في تقرير الكشاف."
  });
  assert.equal(first.changed, true);
  assert.equal(first.entry.activity.length, 1);
  assert.deepEqual(first.entry.activity[0], {
    id: "talent-activity-1",
    type: "stage",
    date: "2026-07-01",
    fromStage: null,
    toStage: "discovered",
    note: "ظهر في تقرير الكشاف."
  });

  const sameStage = upsertTalentProspect(first.save, player(), { stage: "discovered" });
  assert.equal(sameStage.entry.activity.length, 1);

  const shortlisted = upsertTalentProspect(sameStage.save, player(), { stage: "shortlisted" });
  assert.equal(shortlisted.entry.activity.length, 2);
  assert.equal(shortlisted.entry.activity[1].fromStage, "discovered");
  assert.equal(shortlisted.entry.activity[1].toStage, "shortlisted");
  assert.equal(isValidSave(shortlisted.save), true);
});

test("assigns a prospect to active scouting staff and records ownership changes", () => {
  const first = upsertTalentProspect(createInitialSave(), player(), { sourceId: "scouting" });
  const assigned = assignTalentProspectStaff(first.save, player().id, "scout-north-africa");
  assert.equal(assigned.changed, true);
  assert.equal(assigned.entry.assignedScoutId, "scout-north-africa");
  assert.equal(assigned.entry.activity.at(-1).type, "assignment");
  assert.equal(assigned.entry.activity.at(-1).fromScoutId, null);
  assert.equal(assigned.entry.activity.at(-1).toScoutId, "scout-north-africa");
  assert.equal(isValidSave(assigned.save), true);

  const reassigned = assignTalentProspectStaff(assigned.save, player().id, "scout-western-europe");
  assert.equal(reassigned.changed, true);
  assert.equal(reassigned.entry.assignedScoutId, "scout-western-europe");
  assert.equal(reassigned.entry.activity.at(-1).fromScoutId, "scout-north-africa");
  assert.equal(reassigned.entry.activity.at(-1).toScoutId, "scout-western-europe");

  const released = assignTalentProspectStaff(reassigned.save, player().id, null);
  assert.equal(released.changed, true);
  assert.equal(released.entry.assignedScoutId, undefined);
  assert.equal(released.entry.activity.at(-1).toScoutId, null);
  assert.equal(isValidSave(released.save), true);
});

test("limits scout ownership to six active prospects and rejects unavailable staff", () => {
  let save = createInitialSave();
  for (let index = 1; index <= 6; index += 1) {
    const profile = player({ id: "capacity-player-" + index, name: "موهبة " + index });
    const tracked = upsertTalentProspect(save, profile, { sourceId: "scouting" });
    const assigned = assignTalentProspectStaff(tracked.save, profile.id, "scout-north-africa");
    assert.equal(assigned.changed, true);
    save = assigned.save;
  }

  const seventh = player({ id: "capacity-player-7", name: "موهبة 7" });
  const trackedSeventh = upsertTalentProspect(save, seventh, { sourceId: "scouting" });
  const full = assignTalentProspectStaff(trackedSeventh.save, seventh.id, "scout-north-africa");
  assert.equal(full.changed, false);
  assert.match(full.error, /6 ملفات/);
  assert.equal(full.save, trackedSeventh.save);
  assert.equal(isValidSave(save), true);

  const invalidStaff = assignTalentProspectStaff(trackedSeventh.save, seventh.id, "scout-not-hired");
  assert.equal(invalidStaff.changed, false);
});

test("releases the assigned scout when a prospect is archived and logs the handoff", () => {
  const tracked = upsertTalentProspect(createInitialSave(), player(), { sourceId: "manual" });
  const assigned = assignTalentProspectStaff(tracked.save, player().id, "scout-north-africa");
  const archived = upsertTalentProspect(assigned.save, player(), { stage: "archived" });
  assert.equal(archived.entry.assignedScoutId, undefined);
  assert.equal(archived.entry.activity.at(-1).type, "assignment");
  assert.equal(archived.entry.activity.at(-1).toScoutId, null);
  assert.equal(isValidSave(archived.save), true);
});

test("releases a scout after contract signing without creating a second client record", () => {
  const tracked = upsertTalentProspect(createInitialSave(), player(), { sourceId: "scouting" });
  const assigned = assignTalentProspectStaff(tracked.save, player().id, "scout-north-africa");
  const released = assignTalentProspectStaff(assigned.save, player().id, null, "contract-signed");
  assert.equal(released.changed, true);
  assert.equal(released.entry.assignedScoutId, undefined);
  assert.equal(released.entry.activity.at(-1).reason, "contract-signed");
  assert.match(released.entry.activity.at(-1).note, /تسليم الملف إلى إدارة العملاء/);
  assert.equal(released.save.agency.clients.length, 0);
  assert.equal(isValidSave(released.save), true);
});

test("hands an assigned prospect to client management when a representation contract is signed", () => {
  const profile = player();
  const preferences = getPlayerRepresentationProfile(profile);
  const contacted = recordTalentProspectContact(createInitialSave(), profile, {
    kind: "call",
    outcome: "pending",
    followUpDate: "2026-07-04",
    note: "بانتظار الرد الأول."
  });
  const assigned = assignTalentProspectStaff(contacted.save, profile.id, "scout-north-africa");
  const offer = createRepresentationOffer(assigned.save, profile, {
    commissionRate: preferences.preferredCommissionRate,
    termDays: preferences.preferredTermDays,
    representationType: preferences.prefersExclusive ? "exclusive" : "non-exclusive"
  });
  assert.equal(offer.changed, true);
  const signed = evaluateRepresentationOffer(offer.save, offer.offer.id);
  assert.equal(signed.status, "signed");
  assert.ok(signed.save.agency.clients.includes(profile.id));

  const handoff = handoffTalentProspectToClientManagement(signed.save, profile.id);
  assert.equal(handoff.changed, true);
  assert.equal(handoff.entry.assignedScoutId, undefined);
  assert.equal(handoff.entry.nextFollowUpDate, null);
  assert.equal(handoff.entry.activity.at(-1).type, "assignment");
  assert.equal(handoff.entry.activity.at(-1).reason, "contract-signed");
  const followUpTask = handoff.save.world.tasks.find((task) =>
    task.category === "talent-follow-up" && task.prospectId === handoff.entry.id
  );
  assert.equal(followUpTask.status, "completed");
  assert.equal(followUpTask.completionReason, "contract-signed");
  assert.deepEqual(handoff.save.agency.clients, [profile.id]);
  assert.equal(handoff.save.agency.representation.contracts[0].status, "active");
  assert.equal(isValidSave(handoff.save), true);
});

test("refuses client handoff before a valid representation contract is signed", () => {
  const tracked = upsertTalentProspect(createInitialSave(), player(), { sourceId: "scouting" });
  const rejected = handoffTalentProspectToClientManagement(tracked.save, player().id);
  assert.equal(rejected.changed, false);
  assert.match(rejected.error, /قبل توقيع عقد/);
  assert.equal(rejected.save, tracked.save);
});

test("records pre-contract outreach, outcome and follow-up without creating a client or mandate", () => {
  const save = createInitialSave();
  const result = recordTalentProspectContact(save, player(), {
    sourceIds: ["scouting"],
    kind: "call",
    outcome: "pending",
    followUpDate: "2026-07-04",
    note: "تم التواصل مع اللاعب وطلب مهلة للرد."
  });

  assert.equal(result.changed, true);
  assert.equal(result.entry.stage, "contacted");
  assert.equal(result.entry.lastContactDate, "2026-07-01");
  assert.equal(result.entry.nextFollowUpDate, "2026-07-04");
  assert.equal(result.entry.activity.length, 2);
  assert.deepEqual(result.contact, {
    id: "talent-activity-2",
    type: "contact",
    date: "2026-07-01",
    kind: "call",
    outcome: "pending",
    followUpDate: "2026-07-04",
    note: "تم التواصل مع اللاعب وطلب مهلة للرد."
  });
  assert.deepEqual(result.save.agency.clients, []);
  assert.deepEqual(result.save.agency.representation.offers, []);
  assert.deepEqual(result.save.agency.representation.contracts, []);
  assert.deepEqual(result.save.agency.representation.interactions, []);
  assert.equal(isValidSave(result.save), true);
});

test("creates and reschedules one agency task per prospect while keeping task IDs unique", () => {
  const first = recordTalentProspectContact(createInitialSave(), player(), {
    kind: "call",
    outcome: "pending",
    followUpDate: "2026-07-04",
    note: "بانتظار الرد."
  });
  const firstTask = first.save.world.tasks.find((task) => task.category === "talent-follow-up");
  assert.ok(firstTask);
  assert.equal(firstTask.dueDate, "2026-07-04");
  assert.equal(firstTask.prospectId, first.entry.id);

  const rescheduled = upsertTalentProspect(first.save, player(), {
    sourceId: "watchlist",
    nextFollowUpDate: "2026-07-05"
  });
  const activeTasks = rescheduled.save.world.tasks.filter((task) =>
    task.category === "talent-follow-up" && ["open", "overdue"].includes(task.status)
  );
  assert.equal(activeTasks.length, 1);
  assert.equal(activeTasks[0].id, firstTask.id);
  assert.equal(activeTasks[0].dueDate, "2026-07-05");

  const secondPlayer = player({ id: "pipeline-player-2", name: "لاعب آخر" });
  const secondProspect = upsertTalentProspect(rescheduled.save, secondPlayer, {
    nextFollowUpDate: "2026-07-06"
  });
  const allFollowUpTasks = secondProspect.save.world.tasks.filter((task) => task.category === "talent-follow-up");
  assert.equal(allFollowUpTasks.length, 2);
  assert.notEqual(allFollowUpTasks[0].id, allFollowUpTasks[1].id);
  assert.equal(isValidSave(secondProspect.save), true);
});

test("avoids task ID collisions when an older v4 pipeline has no task sequence", () => {
  const first = upsertTalentProspect(createInitialSave(), player(), {
    nextFollowUpDate: "2026-07-04"
  });
  const completed = completeCareerTask(
    first.save,
    first.save.world.tasks.find((task) => task.category === "talent-follow-up").id
  );
  const legacy = structuredClone(completed.save);
  delete legacy.agency.talentPipeline.nextFollowUpTaskSequence;
  const secondPlayer = player({ id: "pipeline-player-legacy", name: "لاعب من حفظ قديم" });
  const next = upsertTalentProspect(legacy, secondPlayer, {
    nextFollowUpDate: "2026-07-05"
  });
  const ids = next.save.world.tasks
    .filter((task) => task.category === "talent-follow-up")
    .map((task) => task.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("talent-follow-up-task-1"));
  assert.ok(ids.includes("talent-follow-up-task-2"));
  assert.equal(isValidSave(next.save), true);
});

test("completes a due prospect review without contacting the player or changing client status", () => {
  const contacted = recordTalentProspectContact(createInitialSave(), player(), {
    kind: "message",
    outcome: "pending",
    followUpDate: "2026-07-04",
    note: "تم إرسال رسالة."
  });
  const task = contacted.save.world.tasks.find((item) => item.category === "talent-follow-up");
  const completedTask = completeCareerTask(contacted.save, task.id);
  assert.equal(completedTask.changed, true);

  const reviewed = completeTalentProspectFollowUp(completedTask.save, task.id);
  assert.equal(reviewed.changed, true);
  assert.equal(reviewed.entry.nextFollowUpDate, null);
  assert.equal(reviewed.entry.activity.at(-1).type, "follow-up-reviewed");
  assert.equal(reviewed.entry.activity.at(-1).taskId, task.id);
  assert.equal(reviewed.entry.activity.filter((event) => event.type === "contact").length, 1);
  assert.deepEqual(reviewed.save.agency.clients, []);
  assert.deepEqual(reviewed.save.agency.representation.offers, []);
  assert.deepEqual(reviewed.save.agency.representation.contracts, []);
  assert.equal(reviewed.save.world.tasks.find((item) => item.id === task.id).status, "completed");
  assert.equal(isValidSave(reviewed.save), true);
});

test("cancels an active follow-up task when the prospect is archived", () => {
  const tracked = upsertTalentProspect(createInitialSave(), player(), {
    sourceId: "manual",
    nextFollowUpDate: "2026-07-06"
  });
  const archived = upsertTalentProspect(tracked.save, player(), { stage: "archived" });
  const task = archived.save.world.tasks.find((item) => item.category === "talent-follow-up");
  assert.equal(archived.entry.nextFollowUpDate, null);
  assert.equal(task.status, "completed");
  assert.equal(task.completionReason, "archived");
  assert.equal(isValidSave(archived.save), true);
});

test("allows later contact outcomes and preserves earlier activity and stable prospect identity", () => {
  const first = recordTalentProspectContact(createInitialSave(), player(), {
    kind: "message",
    outcome: "pending",
    followUpDate: "2026-07-05",
    note: "تم إرسال رسالة."
  });
  const second = recordTalentProspectContact(first.save, player(), {
    kind: "meeting",
    outcome: "positive",
    followUpDate: "2026-07-10",
    note: "اللاعب مهتم بمناقشة التعاون."
  });
  assert.equal(second.changed, true);
  assert.equal(second.entry.id, first.entry.id);
  assert.equal(second.entry.activity.length, 3);
  assert.equal(second.entry.activity[2].outcome, "positive");
  assert.equal(second.entry.lastContactDate, "2026-07-01");
  assert.equal(second.entry.nextFollowUpDate, "2026-07-10");
  assert.equal(isValidSave(second.save), true);
});

test("rejects invalid contact windows and blocks outreach for active clients or open offers", () => {
  const save = createInitialSave();
  assert.equal(recordTalentProspectContact(save, player(), {
    kind: "call", outcome: "pending", followUpDate: "2026-07-01"
  }).changed, false);
  assert.equal(recordTalentProspectContact(save, player(), {
    kind: "fax", outcome: "positive"
  }).changed, false);
  assert.equal(recordTalentProspectContact(save, player(), {
    kind: "call", outcome: "unknown"
  }).changed, false);
  assert.equal(recordTalentProspectContact(save, player(), {
    kind: "call", outcome: "positive", followUpDate: "2026-06-30"
  }).changed, false);

  const clientSave = structuredClone(save);
  clientSave.agency.clients.push(player().id);
  assert.equal(recordTalentProspectContact(clientSave, player(), {
    kind: "call", outcome: "positive"
  }).changed, false);

  const offerSave = structuredClone(save);
  offerSave.agency.representation.offers.push({ playerId: player().id, status: "pending" });
  assert.equal(recordTalentProspectContact(offerSave, player(), {
    kind: "call", outcome: "positive"
  }).changed, false);
});

test("accepts legacy pipeline entries without activity and rejects malformed activity trails", () => {
  const tracked = upsertTalentProspect(createInitialSave(), player(), { sourceId: "scouting" });
  const legacy = structuredClone(tracked.save);
  delete legacy.agency.talentPipeline.entries[0].activity;
  delete legacy.agency.talentPipeline.nextFollowUpTaskSequence;
  assert.equal(isValidSave(legacy), true);

  const invalid = structuredClone(tracked.save);
  invalid.agency.talentPipeline.entries[0].activity[0].toStage = "negotiating";
  assert.equal(isValidSave(invalid), false);
});
