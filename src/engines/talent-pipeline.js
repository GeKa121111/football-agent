const VALID_SOURCES = new Set(["scouting", "watchlist", "manual"]);
const VALID_STAGES = new Set(["discovered", "shortlisted", "contacted", "archived"]);
const MAX_ENTRIES = 300;
const MAX_NOTE_LENGTH = 500;
const MAX_ACTIVITY_EVENTS = 200;
const VALID_CONTACT_KINDS = new Set(["call", "message", "meeting"]);
const VALID_CONTACT_OUTCOMES = new Set(["pending", "positive", "neutral", "negative", "no_response"]);

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
  }];
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
  return false;
}

export function createInitialTalentPipelineState() {
  return { nextSequence: 1, entries: [] };
}

/**
 * The pipeline is optional for existing v4 saves. This validator lets old
 * saves remain readable while refusing malformed newly persisted entries.
 */
export function isValidTalentPipelineState(state, currentDate) {
  if (state === undefined) return true;
  if (!isRecord(state) || !isCalendarDate(currentDate) ||
      !Number.isSafeInteger(state.nextSequence) || state.nextSequence < 1 ||
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
      !Number.isInteger(player.rating) || player.rating < 1 || player.rating > 99 ||
      !Number.isInteger(player.potential) || player.potential < player.rating || player.potential > 99) {
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
  const nextFollowUpDate = Object.hasOwn(options, "nextFollowUpDate")
    ? (options.nextFollowUpDate || null)
    : (existing?.nextFollowUpDate ?? null);
  if (!VALID_STAGES.has(stage) || typeof note !== "string" || note.length > MAX_NOTE_LENGTH ||
      (nextFollowUpDate !== null && !isCalendarDate(nextFollowUpDate)) ||
      (nextFollowUpDate !== null && nextFollowUpDate < (existing?.addedOn ?? currentDate))) {
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
    rating: player.rating,
    potential: player.potential,
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
  const entries = isNew
    ? [entry, ...pipeline.entries]
    : pipeline.entries.map((item) => item.playerId === player.id ? entry : item);
  const nextPipeline = {
    nextSequence: pipeline.nextSequence + (isNew ? 1 : 0),
    entries
  };
  return {
    changed: true,
    entry,
    save: { ...save, agency: { ...save.agency, talentPipeline: nextPipeline } }
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
    note,
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
    note,
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
