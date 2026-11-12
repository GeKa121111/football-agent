import { SCOUTING_SCOUTS, getScoutingRoster } from "./scouting.js";

const VALID_SOURCES = new Set(["scouting", "watchlist", "manual"]);
const VALID_STAGES = new Set(["discovered", "shortlisted", "contacted", "archived"]);
const MAX_ENTRIES = 300;
const MAX_NOTE_LENGTH = 500;
const MAX_ACTIVITY_EVENTS = 200;
const VALID_CONTACT_KINDS = new Set(["call", "message", "meeting"]);
const VALID_CONTACT_OUTCOMES = new Set(["pending", "positive", "neutral", "negative", "no_response"]);
const FOLLOW_UP_TASK_CATEGORY = "talent-follow-up";
export const MAX_PROSPECTS_PER_SCOUT = 6;
const VALID_ASSIGNMENT_REASONS = new Set(["manual", "contract-signed"]);
const VALID_SCOUT_IDS = new Set(SCOUTING_SCOUTS.map((scout) => scout.id));

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function sequenceOf(id) {
  const match = /^talent-prospect-(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

function activitySequenceOf(id) {
  const match = /^talent-activity-(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

function nextActivityId(activity = []) {
  return "talent-activity-" + (activity.reduce((highest, event) =>
    Math.max(highest, activitySequenceOf(event.id)), 0) + 1);
}

function appendStageActivity(activity, currentDate, fromStage, toStage, note = "") {
  return [...activity, {
    id: nextActivityId(activity),
    type: "stage",
    date: currentDate,
    fromStage: fromStage ?? null,
    toStage,
    note
  }].slice(-MAX_ACTIVITY_EVENTS);
}

function isValidActivityEvent(event, entry, currentDate) {
  if (!isRecord(event) ||
      typeof event.id !== "string" || !activitySequenceOf(event.id) ||
      !isCalendarDate(event.date) || event.date < entry.addedOn ||
      event.date > entry.updatedOn || event.date > currentDate ||
      typeof event.note !== "string" || event.note.length > MAX_NOTE_LENGTH) return false;

  if (event.type === "stage") {
    return (event.fromStage === null || VALID_STAGES.has(event.fromStage)) &&
      VALID_STAGES.has(event.toStage) &&
      event.fromStage !== event.toStage;
  }
  if (event.type === "contact") {
    return VALID_CONTACT_KINDS.has(event.kind) &&
      VALID_CONTACT_OUTCOMES.has(event.outcome) &&
      (event.followUpDate === null || event.followUpDate === undefined ||
        (isCalendarDate(event.followUpDate) && event.followUpDate >= event.date));
  }
  if (event.type === "follow-up-reviewed") {
    return typeof event.taskId === "string" &&
      /^talent-follow-up-task-\d+$/.test(event.taskId);
  }
  if (event.type === "match-performance") {
    return typeof event.matchId === "string" && event.matchId.trim() &&
      typeof event.competitionId === "string" && event.competitionId.trim() &&
      typeof event.competitionName === "string" && event.competitionName.trim() &&
      Number.isSafeInteger(event.season) && event.season >= 1 &&
      Number.isSafeInteger(event.round) && event.round >= 1 &&
      [1, 2].includes(event.leg) &&
      (event.groupName === null || typeof event.groupName === "string") &&
      typeof event.clubId === "string" && event.clubId.trim() &&
      typeof event.clubName === "string" && event.clubName.trim() &&
      typeof event.opponentClubId === "string" && event.opponentClubId.trim() &&
      event.opponentClubId !== event.clubId &&
      typeof event.opponentClubName === "string" && event.opponentClubName.trim() &&
      Number.isSafeInteger(event.minutesPlayed) && event.minutesPlayed > 0 && event.minutesPlayed <= 130 &&
      Number.isFinite(event.rating) && event.rating >= 4 && event.rating <= 10 &&
      ["goals", "assists", "yellowCards"].every((field) =>
        Number.isSafeInteger(event[field]) && event[field] >= 0);
  }
  if (event.type === "assignment") {
    return (event.fromScoutId === null || VALID_SCOUT_IDS.has(event.fromScoutId)) &&
      (event.toScoutId === null || VALID_SCOUT_IDS.has(event.toScoutId)) &&
      event.fromScoutId !== event.toScoutId &&
      VALID_ASSIGNMENT_REASONS.has(event.reason);
  }
  return false;
}

function formatPerformanceNote(event) {
  const contribution = [];
  if (event.goals > 0) contribution.push(event.goals + " هدف");
  if (event.assists > 0) contribution.push(event.assists + " صناعة");
  const contributionText = contribution.length > 0 ? " · " + contribution.join(" · ") : "";
  return "شارك " + event.minutesPlayed + " دقيقة مع " + event.clubName +
    " أمام " + event.opponentClubName + ". التقييم " + event.rating.toFixed(1) +
    contributionText + ".";
}

/**
 * Adds real match appearances to existing prospect files only. Replaying the
 * same result is idempotent, and anonymous simulation fillers are ignored.
 */
export function recordTalentProspectMatchPerformances(save, results, currentDate = save?.world?.currentDate) {
  if (!save?.agency || !save?.world || !isCalendarDate(currentDate) || !Array.isArray(results)) {
    return { changed: false, save, recordedCount: 0, error: "بيانات أداء المواجهات غير صالحة." };
  }
  const pipeline = save.agency.talentPipeline;
  if (!pipeline) return { changed: false, save, recordedCount: 0 };
  if (!isValidTalentPipelineState(pipeline, currentDate)) {
    return { changed: false, save, recordedCount: 0, error: "سجل صندوق المواهب غير صالح." };
  }

  const entriesByPlayerId = new Map(pipeline.entries
    .filter((entry) => entry.stage !== "archived")
    .map((entry) => [entry.playerId, entry]));
  if (entriesByPlayerId.size === 0 || results.length === 0) {
    return { changed: false, save, recordedCount: 0 };
  }

  let recordedCount = 0;
  const updatedEntries = new Map();
  for (const result of results) {
    if (!isRecord(result) || typeof result.id !== "string" || !result.id.trim() ||
        !isCalendarDate(result.date) || result.date > currentDate ||
        !Array.isArray(result.playerPerformances) || !isRecord(result.home) || !isRecord(result.away)) continue;

    for (const performance of result.playerPerformances) {
      if (!isRecord(performance) || performance.simulationOnly === true ||
          typeof performance.playerId !== "string" || !performance.playerId.trim() ||
          !Number.isSafeInteger(performance.minutesPlayed) || performance.minutesPlayed <= 0 ||
          !Number.isFinite(performance.rating) || performance.rating < 4 || performance.rating > 10) continue;
      const entry = updatedEntries.get(performance.playerId) ?? entriesByPlayerId.get(performance.playerId);
      if (!entry) continue;
      const club = result.home.clubId === performance.clubId ? result.home
        : result.away.clubId === performance.clubId ? result.away
          : null;
      if (!club) continue;
      const opponent = club === result.home ? result.away : result.home;
      const activity = entry.activity ?? [];
      if (activity.some((event) => event.type === "match-performance" && event.matchId === result.id)) continue;
      if (activity.length >= MAX_ACTIVITY_EVENTS) continue;

      const event = {
        id: nextActivityId(activity),
        type: "match-performance",
        date: result.date,
        matchId: result.id,
        competitionId: result.competitionId ?? "unknown-competition",
        competitionName: result.competitionName ?? result.competitionId ?? "منافسة",
        season: result.season,
        round: result.round,
        leg: result.leg,
        groupName: result.groupName ?? null,
        clubId: club.clubId,
        clubName: club.name,
        opponentClubId: opponent.clubId,
        opponentClubName: opponent.name,
        minutesPlayed: performance.minutesPlayed,
        rating: Math.round(performance.rating * 10) / 10,
        goals: Number.isSafeInteger(performance.goals) ? performance.goals : 0,
        assists: Number.isSafeInteger(performance.assists) ? performance.assists : 0,
        yellowCards: Number.isSafeInteger(performance.yellowCards) ? performance.yellowCards : 0,
        note: ""
      };
      event.note = formatPerformanceNote(event);
      updatedEntries.set(performance.playerId, {
        ...entry,
        club: club.name,
        updatedOn: currentDate,
        activity: [...activity, event].slice(-MAX_ACTIVITY_EVENTS)
      });
      recordedCount += 1;
    }
  }

  if (recordedCount === 0) return { changed: false, save, recordedCount: 0 };
  const entries = pipeline.entries.map((entry) => updatedEntries.get(entry.playerId) ?? entry);
  const nextSave = {
    ...save,
    agency: {
      ...save.agency,
      talentPipeline: { ...pipeline, entries }
    }
  };
  return { changed: true, save: nextSave, recordedCount };
}

/** Aggregates match form from the retained activity trail without storing duplicate totals. */
export function getTalentProspectPerformanceSummary(entry) {
  const performances = (entry?.activity ?? []).filter((event) => event.type === "match-performance");
  const recent = performances.slice(-5);
  const total = (field) => performances.reduce((sum, event) => sum + event[field], 0);
  const average = (items) => items.length > 0
    ? Math.round(items.reduce((sum, event) => sum + event.rating, 0) / items.length * 100) / 100
    : null;
  return {
    appearances: performances.length,
    minutesPlayed: total("minutesPlayed"),
    goals: total("goals"),
    assists: total("assists"),
    yellowCards: total("yellowCards"),
    averageMatchRating: average(performances),
    recentFormRating: average(recent),
    lastAppearanceDate: performances.at(-1)?.date ?? null,
    latestPerformance: performances.at(-1) ?? null
  };
}

export function createInitialTalentPipelineState() {
  return { nextSequence: 1, nextFollowUpTaskSequence: 1, entries: [] };
}

/**
 * The pipeline is optional for existing v4 saves. This validator lets old
 * saves remain readable while refusing malformed newly persisted entries.
 */
export function isValidTalentPipelineState(state, currentDate) {
  if (state === undefined) return true;
  if (!isRecord(state) || !isCalendarDate(currentDate) ||
      !Number.isSafeInteger(state.nextSequence) || state.nextSequence < 1 ||
      (state.nextFollowUpTaskSequence !== undefined &&
        (!Number.isSafeInteger(state.nextFollowUpTaskSequence) || state.nextFollowUpTaskSequence < 1)) ||
      !Array.isArray(state.entries) || state.entries.length > MAX_ENTRIES) return false;

  const ids = new Set();
  const playerIds = new Set();
  let highestSequence = 0;
  for (const entry of state.entries) {
    if (!isRecord(entry) ||
        typeof entry.id !== "string" ||
        typeof entry.playerId !== "string" || !entry.playerId.trim() ||
        typeof entry.playerName !== "string" || !entry.playerName.trim() ||
        typeof entry.club !== "string" || !entry.club.trim() ||
        typeof entry.position !== "string" || !entry.position.trim() ||
        !Number.isInteger(entry.age) || entry.age < 15 || entry.age > 45 ||
        !Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 99 ||
        !Number.isInteger(entry.potential) || entry.potential < entry.rating || entry.potential > 99 ||
        !Array.isArray(entry.sourceIds) || entry.sourceIds.length < 1 ||
        entry.sourceIds.length > VALID_SOURCES.size ||
        entry.sourceIds.some((source) => !VALID_SOURCES.has(source)) ||
        new Set(entry.sourceIds).size !== entry.sourceIds.length ||
        !VALID_STAGES.has(entry.stage) ||
        !isCalendarDate(entry.addedOn) ||
        !isCalendarDate(entry.updatedOn) ||
        entry.updatedOn < entry.addedOn || entry.updatedOn > currentDate ||
        (entry.nextFollowUpDate !== null && entry.nextFollowUpDate !== undefined &&
          (!isCalendarDate(entry.nextFollowUpDate) || entry.nextFollowUpDate < entry.addedOn)) ||
        (entry.lastContactDate !== null && entry.lastContactDate !== undefined &&
          (!isCalendarDate(entry.lastContactDate) || entry.lastContactDate < entry.addedOn || entry.lastContactDate > entry.updatedOn)) ||
        typeof entry.note !== "string" || entry.note.length > MAX_NOTE_LENGTH ||
        (entry.assignedScoutId !== undefined && !VALID_SCOUT_IDS.has(entry.assignedScoutId)) ||
        (entry.stage === "archived" && entry.assignedScoutId !== undefined) ||
        (entry.activity !== undefined &&
          (!Array.isArray(entry.activity) || entry.activity.length > MAX_ACTIVITY_EVENTS ||
            !entry.activity.every((event) => isValidActivityEvent(event, entry, currentDate)) ||
            new Set(entry.activity.map((event) => event.id)).size !== entry.activity.length ||
            entry.activity.some((event, index, events) =>
              index > 0 && (event.date < events[index - 1].date ||
                activitySequenceOf(event.id) <= activitySequenceOf(events[index - 1].id)))))) return false;

    const sequence = sequenceOf(entry.id);
    if (!sequence || sequence >= state.nextSequence || ids.has(entry.id) || playerIds.has(entry.playerId)) return false;
    ids.add(entry.id);
    playerIds.add(entry.playerId);
    highestSequence = Math.max(highestSequence, sequence);
  }
  return highestSequence < state.nextSequence;
}

function syncTalentFollowUpTask(save, entry, completionReason = "rescheduled") {
  const tasks = [...(save.world.tasks ?? [])];
  const pipeline = { ...(save.agency.talentPipeline ?? createInitialTalentPipelineState()) };
  const activeIndex = tasks.findIndex((task) =>
    task.category === FOLLOW_UP_TASK_CATEGORY &&
    task.prospectId === entry.id &&
    ["open", "overdue"].includes(task.status)
  );

  if (entry.nextFollowUpDate && entry.stage !== "archived") {
    const taskDetails = {
      title: "متابعة اللاعب: " + entry.playerName,
      description: "راجع التواصل مع " + entry.playerName + " (" + entry.club + ") وحدد الخطوة التالية من صندوق المواهب.",
      dueDate: entry.nextFollowUpDate,
      category: FOLLOW_UP_TASK_CATEGORY,
      status: "open",
      playerId: entry.playerId,
      prospectId: entry.id,
      playerName: entry.playerName
    };

    if (activeIndex >= 0) {
      const currentTask = tasks[activeIndex];
      const { overdueDate, completedDate, completedLate, completionReason, ...retained } = currentTask;
      tasks[activeIndex] = { ...retained, ...taskDetails };
    } else {
      const usedTaskIds = new Set(tasks.map((task) => task.id));
      let sequence = pipeline.nextFollowUpTaskSequence ?? 1;
      let taskId = "talent-follow-up-task-" + sequence;
      while (usedTaskIds.has(taskId)) {
        sequence += 1;
        taskId = "talent-follow-up-task-" + sequence;
      }
      tasks.push({
        id: taskId,
        ...taskDetails,
        createdDate: save.world.currentDate
      });
      pipeline.nextFollowUpTaskSequence = sequence + 1;
    }
  } else if (activeIndex >= 0) {
    const task = tasks[activeIndex];
    tasks[activeIndex] = {
      ...task,
      status: "completed",
      completedDate: save.world.currentDate,
      completedLate: save.world.currentDate > task.dueDate,
      completionReason: entry.stage === "archived" ? "archived" : completionReason
    };
  }

  return {
    ...save,
    agency: { ...save.agency, talentPipeline: pipeline },
    world: { ...save.world, tasks }
  };
}

export function getTalentProspect(pipeline, playerId) {
  if (typeof playerId !== "string" || !playerId.trim()) return null;
  return (Array.isArray(pipeline?.entries) ? pipeline.entries : [])
    .find((entry) => entry?.playerId === playerId) ?? null;
}

/**
 * Adds a player to the shared agency pipeline or updates their tracking data.
 * Sources are merged by stable player ID, so multiple scouting reports do not
 * create duplicate cards. A newly tracked player is shortlisted by default.
 */
export function upsertTalentProspect(save, player, options = {}) {
  const currentDate = save?.world?.currentDate;
  if (!save?.agency || !save?.world || !isCalendarDate(currentDate)) {
    return { changed: false, save, error: "بيانات المسيرة الحالية غير صالحة." };
  }
  if (!isRecord(player) || typeof player.id !== "string" || !player.id.trim() ||
      typeof player.name !== "string" || !player.name.trim() ||
      typeof player.club !== "string" || !player.club.trim() ||
      typeof player.position !== "string" || !player.position.trim() ||
      !Number.isInteger(player.age) || player.age < 15 || player.age > 45 ||
      !Number.isFinite(player.rating) || player.rating < 1 || player.rating > 99 ||
      !Number.isFinite(player.potential) || player.potential < player.rating || player.potential > 99) {
    return { changed: false, save, error: "ملف اللاعب غير مكتمل ولا يمكن إضافته لصندوق المواهب." };
  }

  const pipeline = save.agency.talentPipeline ?? createInitialTalentPipelineState();
  if (!isValidTalentPipelineState(pipeline, currentDate)) {
    return { changed: false, save, error: "سجل صندوق المواهب غير صالح؛ لم يتم تغييره." };
  }
  const existing = getTalentProspect(pipeline, player.id);
  const suppliedSources = Array.isArray(options.sourceIds) ? options.sourceIds : [options.sourceId ?? "manual"];
  if (suppliedSources.length === 0 || suppliedSources.some((source) => !VALID_SOURCES.has(source))) {
    return { changed: false, save, error: "مصدر إضافة اللاعب لصندوق المواهب غير صالح." };
  }
  const sourceIds = [...new Set([...(existing?.sourceIds ?? []), ...suppliedSources])];
  const stage = options.stage ?? existing?.stage ?? "shortlisted";
  const note = options.note ?? existing?.note ?? "";
  const requestedFollowUpDate = Object.hasOwn(options, "nextFollowUpDate")
    ? (options.nextFollowUpDate || null)
    : (existing?.nextFollowUpDate ?? null);
  const nextFollowUpDate = stage === "archived" ? null : requestedFollowUpDate;
  if (!VALID_STAGES.has(stage) || typeof note !== "string" || note.length > MAX_NOTE_LENGTH ||
      (nextFollowUpDate !== null && (!isCalendarDate(nextFollowUpDate) || nextFollowUpDate < currentDate))) {
    return { changed: false, save, error: "مرحلة المتابعة أو الملاحظة أو الموعد المحدد غير صالح." };
  }

  const isNew = !existing;
  if (isNew && pipeline.entries.length >= MAX_ENTRIES) {
    return { changed: false, save, error: "وصل صندوق المواهب إلى الحد الأقصى للملفات المحفوظة." };
  }
  if (isNew && (!Number.isSafeInteger(pipeline.nextSequence) || pipeline.nextSequence < 1)) {
    return { changed: false, save, error: "تسلسل صندوق المواهب غير صالح." };
  }
  const entry = {
    id: existing?.id ?? "talent-prospect-" + pipeline.nextSequence,
    playerId: player.id,
    playerName: player.name,
    club: player.club,
    position: player.position,
    age: player.age,
    // Player development keeps fractional OVR internally; prospect records use
    // the integer rating contract shared by validation and presentation.
    rating: Math.round(player.rating),
    potential: Math.round(player.potential),
    sourceIds,
    stage,
    addedOn: existing?.addedOn ?? currentDate,
    updatedOn: currentDate,
    nextFollowUpDate,
    lastContactDate: stage === "contacted"
      ? (existing?.lastContactDate ?? currentDate)
      : (existing?.lastContactDate ?? null),
    note,
    activity: existing?.activity ?? []
  };
  entry.assignedScoutId = stage === "archived" ? undefined : existing?.assignedScoutId;
  const stageChanged = isNew || existing.stage !== stage;
  if (stageChanged) {
    entry.activity = appendStageActivity(
      entry.activity,
      currentDate,
      existing?.stage ?? null,
      stage,
      typeof options.stageNote === "string" ? options.stageNote.slice(0, MAX_NOTE_LENGTH) : ""
    );
  }
  if (stage === "archived" && existing?.assignedScoutId) {
    entry.activity = [...entry.activity, {
      id: nextActivityId(entry.activity),
      type: "assignment",
      date: currentDate,
      fromScoutId: existing.assignedScoutId,
      toScoutId: null,
      reason: "manual",
      note: "تم إلغاء تكليف الكشاف بعد أرشفة الملف."
    }].slice(-MAX_ACTIVITY_EVENTS);
  }
  const entries = isNew
    ? [entry, ...pipeline.entries]
    : pipeline.entries.map((item) => item.playerId === player.id ? entry : item);
  const nextPipeline = {
    ...pipeline,
    nextSequence: pipeline.nextSequence + (isNew ? 1 : 0),
    entries
  };
  const nextSave = {
    ...save,
    agency: { ...save.agency, talentPipeline: nextPipeline }
  };
  return {
    changed: true,
    entry,
    save: syncTalentFollowUpTask(nextSave, entry, options.taskCompletionReason ?? "rescheduled")
  };
}


/**
 * Assigns one active scout to a prospect. Each scout can own up to six active
 * prospect files; assignment changes are retained in the player's activity log.
 * Pass null to release the current owner.
 */
export function assignTalentProspectStaff(save, playerId, scoutId, reason = "manual") {
  const currentDate = save?.world?.currentDate;
  const pipeline = save?.agency?.talentPipeline;
  const entry = getTalentProspect(pipeline, playerId);
  if (!isCalendarDate(currentDate) || !entry || !isValidTalentPipelineState(pipeline, currentDate)) {
    return { changed: false, save, error: "ملف الموهبة أو بيانات المسيرة غير صالحة." };
  }
  if (scoutId !== null && !VALID_SCOUT_IDS.has(scoutId)) {
    return { changed: false, save, error: "الكشاف المحدد غير موجود في طاقم الوكالة." };
  }
  if (!VALID_ASSIGNMENT_REASONS.has(reason) || (reason === "contract-signed" && scoutId !== null)) {
    return { changed: false, save, error: "سبب تغيير المسؤول غير صالح." };
  }
  const currentScoutId = entry.assignedScoutId ?? null;
  if (currentScoutId === scoutId) return { changed: false, save, entry };
  if (entry.stage === "archived") {
    return { changed: false, save, error: "لا يمكن تكليف كشاف بملف مؤرشف." };
  }
  if (scoutId !== null) {
    if (reason !== "manual" ||
        save.agency.clients?.includes(playerId) ||
        save.agency.representation?.contracts?.some((contract) =>
          contract.playerId === playerId && contract.status === "active"
        )) {
      return { changed: false, save, error: "ملفات العملاء النشطين تُدار من شاشة العلاقات، وليس من طاقم الاستقطاب." };
    }
    const roster = getScoutingRoster(save.world.scouting, currentDate);
    const scout = roster.find((item) => item.id === scoutId);
    if (!scout || scout.isContractExpired) {
      return { changed: false, save, error: "الكشاف غير متاح؛ جدّد عقده أو اختر عضوًا نشطًا من الطاقم." };
    }
    const assignedCount = pipeline.entries.filter((item) =>
      item.playerId !== playerId &&
      item.assignedScoutId === scoutId &&
      item.stage !== "archived" &&
      !save.agency.clients?.includes(item.playerId) &&
      !save.agency.representation?.contracts?.some((contract) =>
        contract.playerId === item.playerId && contract.status === "active"
      )
    ).length;
    if (assignedCount >= MAX_PROSPECTS_PER_SCOUT) {
      return { changed: false, save, error: "وصل الكشاف إلى الحد الأقصى: 6 ملفات مواهب نشطة." };
    }
  }
  if ((entry.activity?.length ?? 0) >= MAX_ACTIVITY_EVENTS && reason !== "contract-signed") {
    return { changed: false, save, error: "وصل سجل نشاط اللاعب إلى الحد الأقصى." };
  }

  const event = {
    id: nextActivityId(entry.activity ?? []),
    type: "assignment",
    date: currentDate,
    fromScoutId: currentScoutId,
    toScoutId: scoutId,
    reason,
    note: reason === "contract-signed"
      ? "تم تسليم الملف إلى إدارة العملاء بعد توقيع عقد التمثيل."
      : scoutId
        ? "تم تعيين مسؤول استقطاب لهذا الملف."
        : "تم إلغاء تكليف مسؤول الاستقطاب."
  };
  const updatedEntry = {
    ...entry,
    ...(scoutId ? { assignedScoutId: scoutId } : { assignedScoutId: undefined }),
    updatedOn: currentDate,
    activity: [...(entry.activity ?? []), event].slice(-MAX_ACTIVITY_EVENTS)
  };
  const entries = pipeline.entries.map((item) =>
    item.id === entry.id ? updatedEntry : item
  );
  const nextPipeline = { ...pipeline, entries };
  return {
    changed: true,
    entry: updatedEntry,
    save: { ...save, agency: { ...save.agency, talentPipeline: nextPipeline } }
  };
}

/**
 * Moves a signed prospect from acquisition into client management. Any
 * pre-contract follow-up task is closed, and scouting ownership is released.
 */
export function handoffTalentProspectToClientManagement(save, playerId) {
  const entry = getTalentProspect(save?.agency?.talentPipeline, playerId);
  const hasActiveContract = save?.agency?.clients?.includes(playerId) ||
    save?.agency?.representation?.contracts?.some((contract) =>
      contract.playerId === playerId && contract.status === "active"
    );
  if (!entry || !hasActiveContract) {
    return { changed: false, save, error: "لا يمكن تسليم الملف قبل توقيع عقد تمثيل نشط." };
  }

  let nextSave = save;
  if (entry.nextFollowUpDate) {
    const player = {
      id: entry.playerId,
      name: entry.playerName,
      age: entry.age,
      club: entry.club,
      position: entry.position,
      rating: entry.rating,
      potential: entry.potential
    };
    const cleared = upsertTalentProspect(nextSave, player, {
      nextFollowUpDate: null,
      taskCompletionReason: "contract-signed"
    });
    if (!cleared.changed) return cleared;
    nextSave = cleared.save;
  }

  const released = assignTalentProspectStaff(nextSave, playerId, null, "contract-signed");
  if (released.error) return released;
  return {
    changed: Boolean(entry.nextFollowUpDate || released.changed),
    entry: getTalentProspect(released.save.agency.talentPipeline, playerId),
    save: released.save
  };
}

/**
 * Records an initial contact with a prospect before any representation contract
 * exists. This is deliberately isolated from representation interactions,
 * contracts, offers, and client membership.
 */
export function recordTalentProspectContact(save, player, options = {}) {
  const currentDate = save?.world?.currentDate;
  if (!isCalendarDate(currentDate)) {
    return { changed: false, save, error: "تاريخ المسيرة غير صالح." };
  }
  const kind = options.kind;
  const outcome = options.outcome;
  const note = options.note ?? "";
  const followUpDate = options.followUpDate || null;
  if (!VALID_CONTACT_KINDS.has(kind) || !VALID_CONTACT_OUTCOMES.has(outcome) ||
      typeof note !== "string" || note.length > MAX_NOTE_LENGTH ||
      (followUpDate !== null &&
        (!isCalendarDate(followUpDate) || followUpDate < currentDate)) ||
      (outcome === "pending" && (!followUpDate || followUpDate <= currentDate))) {
    return { changed: false, save, error: "بيانات التواصل أو نتيجة الاتصال أو موعد المتابعة غير صالحة." };
  }

  const representation = save?.agency?.representation;
  if (!representation || save.agency.clients?.includes(player?.id) ||
      representation.contracts?.some((contract) => contract.playerId === player?.id && contract.status === "active") ||
      representation.offers?.some((offer) => offer.playerId === player?.id && ["pending", "countered"].includes(offer.status))) {
    return { changed: false, save, error: "هذا اللاعب لديه عقد أو عرض تمثيل مفتوح بالفعل؛ استخدم مسار التفاوض الحالي." };
  }

  const existing = getTalentProspect(save?.agency?.talentPipeline, player?.id);
  if ((existing?.activity?.length ?? 0) >= MAX_ACTIVITY_EVENTS) {
    return { changed: false, save, error: "وصل سجل نشاط اللاعب إلى الحد الأقصى." };
  }
  const sourceIds = Array.isArray(options.sourceIds) && options.sourceIds.length > 0
    ? [...new Set([...(existing?.sourceIds ?? []), ...options.sourceIds])]
    : [...(existing?.sourceIds ?? ["manual"])];
  const tracked = upsertTalentProspect(save, player, {
    sourceIds,
    stage: "contacted",
    note: existing?.note ?? note,
    nextFollowUpDate: followUpDate,
    stageNote: "تم تسجيل أول تواصل مع اللاعب."
  });
  if (!tracked.changed) return tracked;

  const entry = tracked.entry;
  if ((entry.activity?.length ?? 0) >= MAX_ACTIVITY_EVENTS) {
    return { changed: false, save, error: "وصل سجل نشاط اللاعب إلى الحد الأقصى." };
  }
  const contact = {
    id: nextActivityId(entry.activity ?? []),
    type: "contact",
    date: currentDate,
    kind,
    outcome,
    followUpDate,
    note
  };
  const updatedEntry = {
    ...entry,
    lastContactDate: currentDate,
    nextFollowUpDate: followUpDate,
    note: entry.note,
    activity: [...(entry.activity ?? []), contact]
  };
  const entries = tracked.save.agency.talentPipeline.entries.map((item) =>
    item.playerId === player.id ? updatedEntry : item
  );
  const nextSave = {
    ...tracked.save,
    agency: {
      ...tracked.save.agency,
      talentPipeline: {
        ...tracked.save.agency.talentPipeline,
        entries
      }
    }
  };
  return { changed: true, entry: updatedEntry, contact, save: nextSave };
}

/**
 * Completes the agency-side review of a scheduled prospect follow-up.
 * The task is completed by the career calendar first; this records the review
 * in the prospect history and clears the matching due date without contacting
 * the player or changing representation/client status.
 */
export function completeTalentProspectFollowUp(save, taskId) {
  if (!isCalendarDate(save?.world?.currentDate) || typeof taskId !== "string") {
    return { changed: false, save };
  }
  const task = (save.world.tasks ?? []).find((item) =>
    item.id === taskId &&
    item.category === FOLLOW_UP_TASK_CATEGORY &&
    item.status === "completed"
  );
  if (!task || typeof task.prospectId !== "string") return { changed: false, save };

  const pipeline = save.agency?.talentPipeline;
  const entry = getTalentProspect(pipeline, task.playerId);
  if (!entry || entry.id !== task.prospectId || entry.nextFollowUpDate !== task.dueDate) {
    return { changed: false, save };
  }
  const event = {
    id: nextActivityId(entry.activity ?? []),
    type: "follow-up-reviewed",
    date: save.world.currentDate,
    taskId,
    note: "تمت مراجعة موعد المتابعة من أجندة الوكالة."
  };
  const updatedEntry = {
    ...entry,
    updatedOn: save.world.currentDate,
    nextFollowUpDate: null,
    activity: [...(entry.activity ?? []), event].slice(-MAX_ACTIVITY_EVENTS)
  };
  const nextPipeline = {
    ...pipeline,
    entries: pipeline.entries.map((item) => item.id === entry.id ? updatedEntry : item)
  };
  return {
    changed: true,
    entry: updatedEntry,
    save: { ...save, agency: { ...save.agency, talentPipeline: nextPipeline } }
  };
}
