import { createInitialCareerCalendar } from "../engines/career-calendar.js";
import { createInitialScoutingState, SCOUTING_MISSION_TYPES, SCOUTING_SCOUTS, SCOUTING_SOURCES } from "../engines/scouting.js";
import { createInitialRepresentationState, isValidRepresentationState } from "../engines/representation.js";
import { createInitialTalentPipelineState, isValidTalentPipelineState } from "../engines/talent-pipeline.js";
import { createInitialFootballState, isValidFootballState } from "../engines/football-season.js";
import { mergePlayerDevelopmentRoster } from "../engines/player-development.js";
import { createInitialTransferState, isValidTransferState } from "../engines/transfers.js";
import { getWorldSquadPlayers } from "../data/world-database.js";

export const STORAGE_KEY = "football-agent.save";
export const SAVE_VERSION = 7;
export const WATCHLIST_KEY = "football-agent.watchlist";

export function createInitialSave(now = new Date().toISOString()) {
  const initialCalendar = createInitialCareerCalendar("2026-07-01", 1);
  return {
    meta: {
      version: SAVE_VERSION,
      createdAt: now,
      updatedAt: now
    },
    career: {
      day: 1,
      week: 1,
      season: 1
    },
    agency: {
      id: "agency-player",
      name: "وكالتك الجديدة",
      balance: 100000,
      reputation: 1,
      clients: [],
      representation: createInitialRepresentationState(),
      talentPipeline: createInitialTalentPipelineState()
    },
    world: {
      currentDate: "2026-07-01",
      players: [],
      clubs: [],
      competitions: [],
      activeOffers: [],
      ...initialCalendar,
      scouting: createInitialScoutingState(),
      football: createInitialFootballState(1, "2026-07-01"),
      transfers: createInitialTransferState()
    }
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isValidCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}


function hasUniqueIds(items) {
  const ids = items.map((item) => isRecord(item) ? item.id : null);
  return ids.every((id) => typeof id === "string" && id.trim()) && new Set(ids).size === ids.length;
}

function hasUniqueStringIds(items) {
  return items.every((id) => typeof id === "string" && id.trim()) &&
    new Set(items).size === items.length;
}

function isValidActivityCollections(world) {
  const { events, inbox, tasks, currentDate } = world;
  if (![events, inbox, tasks].every(Array.isArray)) return false;
  if (!hasUniqueIds(events) || !hasUniqueIds(inbox) || !hasUniqueIds(tasks)) return false;

  if (!events.every((event) =>
    isRecord(event) &&
    isValidCalendarDate(event.date) &&
    typeof event.type === "string" && event.type.trim() &&
    typeof event.title === "string" && event.title.trim() &&
    typeof event.description === "string" &&
    ["low", "normal", "high"].includes(event.priority)
  )) return false;

  const eventsById = new Map(events.map((event) => [event.id, event]));
  if (!inbox.every((message) => {
    if (!isRecord(message) ||
      typeof message.eventId !== "string" ||
      !isValidCalendarDate(message.date) ||
      typeof message.title !== "string" || !message.title.trim() ||
      typeof message.body !== "string" ||
      typeof message.read !== "boolean") return false;
    const linkedEvent = eventsById.get(message.eventId);
    return Boolean(linkedEvent) && linkedEvent.date === message.date;
  })) return false;

  return tasks.every((task) => {
    if (!isRecord(task) ||
      typeof task.title !== "string" || !task.title.trim() ||
      typeof task.description !== "string" ||
      !isValidCalendarDate(task.createdDate) ||
      !isValidCalendarDate(task.dueDate) ||
      typeof task.category !== "string" || !task.category.trim() ||
      !["open", "overdue", "completed"].includes(task.status) ||
      (task.completedLate !== undefined && typeof task.completedLate !== "boolean")) {
      return false;
    }

    if (task.createdDate > currentDate || task.createdDate > task.dueDate) return false;

    if (task.status === "open") {
      return task.dueDate >= currentDate &&
        task.overdueDate === undefined &&
        task.completedDate === undefined &&
        task.completedLate === undefined;
    }

    if (task.status === "overdue") {
      return task.dueDate < currentDate &&
        isValidCalendarDate(task.overdueDate) &&
        task.overdueDate > task.dueDate &&
        task.overdueDate <= currentDate &&
        task.completedDate === undefined &&
        task.completedLate === undefined;
    }

    if (!isValidCalendarDate(task.completedDate) ||
      task.completedDate < task.createdDate ||
      task.completedDate > currentDate) return false;

    if (task.completedLate === true && task.completedDate <= task.dueDate) return false;
    if (task.completedLate === false && task.completedDate > task.dueDate) return false;

    if (task.overdueDate !== undefined) {
      return isValidCalendarDate(task.overdueDate) &&
        task.overdueDate > task.dueDate &&
        task.overdueDate <= task.completedDate;
    }
    return true;
  });
}


function isValidScoutingState(scouting, currentDate) {
  if (!isRecord(scouting) ||
      !Number.isSafeInteger(scouting.nextMissionSequence) ||
      scouting.nextMissionSequence < 1 ||
      !Array.isArray(scouting.activeMissions) ||
      !Array.isArray(scouting.reports) ||
      scouting.activeMissions.length > 3 ||
      scouting.reports.length > 50 ||
      !hasUniqueIds(scouting.activeMissions) ||
      !hasUniqueIds(scouting.reports)) return false;

  const missionTypes = Object.keys(SCOUTING_MISSION_TYPES);
  const roles = ["all", "هجوم", "وسط", "دفاع", "حراسة"];
  const recommendations = ["أولوية", "متابعة", "مراقبة فقط"];
  const knownScoutIds = new Set(SCOUTING_SCOUTS.map((scout) => scout.id));
  const knownSourceIds = new Set(SCOUTING_SOURCES.map((source) => source.id));
  const knownDiscoverySourceIds = new Set(SCOUTING_SOURCES.filter((source) => source.id !== "all").map((source) => source.id));
  const sequenceOf = (id, prefix) => {
    const match = new RegExp("^" + prefix + "-(\\d+)$").exec(id);
    return match ? Number(match[1]) : 0;
  };
  const dateAfter = (date, days) => {
    const value = new Date(date + "T00:00:00.000Z");
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };

  if (scouting.scouts !== undefined) {
    if (!Array.isArray(scouting.scouts) ||
        scouting.scouts.length > SCOUTING_SCOUTS.length ||
        !hasUniqueIds(scouting.scouts) ||
        !SCOUTING_SCOUTS.filter((profile) => profile.startingStaff).every((profile) => scouting.scouts.some((scout) => scout.id === profile.id)) ||
        !scouting.scouts.every((scout) => {
          if (!isRecord(scout) || !knownScoutIds.has(scout.id) || !Number.isSafeInteger(scout.experience) || scout.experience < 0 || scout.experience > 1000000 || !Number.isSafeInteger(scout.missionsCompleted) || scout.missionsCompleted < 0 || scout.missionsCompleted > 100000) return false;
          const profile = SCOUTING_SCOUTS.find((item) => item.id === scout.id);
          const fields = ["contractStartedOn", "contractExpiresOn", "contractCost", "contractRenewals"];
          if (profile.startingStaff) return fields.every((field) => scout[field] === undefined);
          return isValidCalendarDate(scout.contractStartedOn) && isValidCalendarDate(scout.contractExpiresOn) && scout.contractStartedOn <= currentDate && scout.contractExpiresOn === dateAfter(scout.contractStartedOn, profile.contractDays) && Number.isSafeInteger(scout.contractCost) && [profile.contractCost, profile.renewalCost].includes(scout.contractCost) && Number.isSafeInteger(scout.contractRenewals) && scout.contractRenewals >= 0 && scout.contractRenewals <= 100000;
        })) return false;
  }

  let highestSequence = 0;
  const assignedScoutIds = new Set();
  for (const mission of scouting.activeMissions) {
    if (!isRecord(mission) ||
        !missionTypes.includes(mission.type) ||
        typeof mission.name !== "string" || !mission.name.trim() ||
        typeof mission.countryId !== "string" || !mission.countryId.trim() ||
        !roles.includes(mission.role) ||
        !isValidCalendarDate(mission.startDate) ||
        !isValidCalendarDate(mission.dueDate) ||
        !Number.isSafeInteger(mission.durationDays) || mission.durationDays < 1 || mission.durationDays > 60 ||
        mission.dueDate !== dateAfter(mission.startDate, mission.durationDays) ||
        typeof mission.cost !== "number" || !Number.isFinite(mission.cost) || mission.cost < 0 ||
        typeof mission.accuracy !== "number" || !Number.isFinite(mission.accuracy) || mission.accuracy < 0 || mission.accuracy > 1 ||
        !Number.isSafeInteger(mission.targetCount) || mission.targetCount < 1 ||
        mission.startDate > currentDate || mission.dueDate <= currentDate ||
        mission.reportId !== "scout-report-" + sequenceOf(mission.id, "scout-mission") ||
        (mission.sourceId !== undefined && (!knownSourceIds.has(mission.sourceId) ||
          mission.sourceLabel !== SCOUTING_SOURCES.find((source) => source.id === mission.sourceId)?.label)) ||
        (mission.sourceId === undefined && mission.sourceLabel !== undefined)) return false;

    if (mission.scoutId !== undefined) {
      const baseAccuracy = SCOUTING_MISSION_TYPES[mission.type].accuracy;
      if (!knownScoutIds.has(mission.scoutId) ||
          typeof mission.scoutName !== "string" || !mission.scoutName.trim() ||
          !Number.isSafeInteger(mission.scoutLevel) || mission.scoutLevel < 1 || mission.scoutLevel > 5 ||
          typeof mission.scoutAccuracyBonus !== "number" || !Number.isFinite(mission.scoutAccuracyBonus) ||
          mission.scoutAccuracyBonus < 0 || mission.scoutAccuracyBonus > 0.1 ||
          mission.baseAccuracy !== baseAccuracy ||
          mission.accuracy < mission.baseAccuracy || mission.accuracy > 0.97 ||
          Math.abs((mission.accuracy - mission.baseAccuracy) - mission.scoutAccuracyBonus) > 0.001 ||
          (scouting.scouts !== undefined && !scouting.scouts.some((scout) => scout.id === mission.scoutId)) ||
          assignedScoutIds.has(mission.scoutId)) return false;
      assignedScoutIds.add(mission.scoutId);
    } else if (
      mission.scoutName !== undefined ||
      mission.scoutLevel !== undefined ||
      mission.scoutAccuracyBonus !== undefined ||
      mission.baseAccuracy !== undefined
    ) {
      return false;
    }

    const sequence = sequenceOf(mission.id, "scout-mission");
    if (!sequence) return false;
    highestSequence = Math.max(highestSequence, sequence);
  }

  for (const report of scouting.reports) {
    if (!isRecord(report) ||
        !missionTypes.includes(report.missionType) ||
        typeof report.missionName !== "string" || !report.missionName.trim() ||
        typeof report.missionId !== "string" ||
        !isValidCalendarDate(report.startDate) ||
        !isValidCalendarDate(report.completedDate) ||
        !Number.isSafeInteger(report.durationDays) || report.durationDays < 1 || report.durationDays > 60 ||
        report.completedDate !== dateAfter(report.startDate, report.durationDays) ||
        report.completedDate > currentDate ||
        typeof report.countryId !== "string" || !report.countryId.trim() ||
        !roles.includes(report.role) ||
        typeof report.cost !== "number" || !Number.isFinite(report.cost) || report.cost < 0 ||
        typeof report.accuracy !== "number" || !Number.isFinite(report.accuracy) || report.accuracy < 0 || report.accuracy > 1 ||
        !Number.isSafeInteger(report.candidateCount) || report.candidateCount < 0 ||
        !Array.isArray(report.findings) || report.findings.length > 6 ||
        report.missionId !== "scout-mission-" + sequenceOf(report.id, "scout-report") ||
        !sequenceOf(report.id, "scout-report") ||
        (report.sourceId !== undefined && (!knownSourceIds.has(report.sourceId) ||
          report.sourceLabel !== SCOUTING_SOURCES.find((source) => source.id === report.sourceId)?.label)) ||
        (report.sourceId === undefined && report.sourceLabel !== undefined)) return false;

    if (report.scoutId !== undefined) {
      if (!knownScoutIds.has(report.scoutId) ||
          typeof report.scoutName !== "string" || !report.scoutName.trim() ||
          !Number.isSafeInteger(report.scoutLevel) || report.scoutLevel < 1 || report.scoutLevel > 5 ||
          typeof report.accuracyBonus !== "number" || !Number.isFinite(report.accuracyBonus) ||
          report.accuracyBonus < 0 || report.accuracyBonus > 0.1 ||
          !Number.isSafeInteger(report.experienceAwarded) || report.experienceAwarded < 1 || report.experienceAwarded > 100 ||
          (scouting.scouts !== undefined && !scouting.scouts.some((scout) => scout.id === report.scoutId))) return false;
    } else if (
      report.scoutName !== undefined ||
      report.scoutLevel !== undefined ||
      report.accuracyBonus !== undefined
    ) {
      return false;
    }
    if (report.experienceAwarded !== undefined &&
        (!Number.isSafeInteger(report.experienceAwarded) || report.experienceAwarded < 0 || report.experienceAwarded > 100)) {
      return false;
    }

    const findingIds = report.findings.map((finding) => isRecord(finding) ? finding.playerId : null);
    if (!findingIds.every((id) => typeof id === "string" && id.trim()) ||
        new Set(findingIds).size !== findingIds.length) return false;
    if (!report.findings.every((finding) =>
      isRecord(finding) &&
      typeof finding.playerName === "string" && finding.playerName.trim() &&
      Number.isInteger(finding.age) && finding.age >= 15 && finding.age <= 45 &&
      typeof finding.club === "string" &&
      typeof finding.country === "string" &&
      typeof finding.position === "string" &&
      Number.isInteger(finding.estimatedRating) && finding.estimatedRating >= 1 && finding.estimatedRating <= 99 &&
      Number.isInteger(finding.estimatedPotential) && finding.estimatedPotential >= finding.estimatedRating && finding.estimatedPotential <= 99 &&
      Number.isInteger(finding.confidence) && finding.confidence >= 40 && finding.confidence <= 99 &&
      Number.isInteger(finding.upside) && finding.upside === finding.estimatedPotential - finding.estimatedRating &&
      recommendations.includes(finding.recommendation) &&
      typeof finding.rationale === "string" && finding.rationale.trim() &&
      (finding.discoverySourceIds === undefined ||
        (Array.isArray(finding.discoverySourceIds) && finding.discoverySourceIds.length > 0 &&
          new Set(finding.discoverySourceIds).size === finding.discoverySourceIds.length &&
          finding.discoverySourceIds.every((sourceId) => knownDiscoverySourceIds.has(sourceId))))
    )) return false;

    highestSequence = Math.max(highestSequence, sequenceOf(report.id, "scout-report"));
  }

  if (scouting.observations !== undefined) {
    const observations = scouting.observations;
    if (!Array.isArray(observations) || observations.length > 300 || !hasUniqueIds(observations)) return false;
    if (!observations.every((observation) => {
      if (!isRecord(observation) ||
          typeof observation.playerId !== "string" || !observation.playerId.trim() ||
          typeof observation.playerName !== "string" || !observation.playerName.trim() ||
          typeof observation.missionId !== "string" ||
          typeof observation.reportId !== "string" ||
          !isValidCalendarDate(observation.observedAt) || observation.observedAt > currentDate ||
          !Array.isArray(observation.sourceIds) || observation.sourceIds.length === 0 ||
          new Set(observation.sourceIds).size !== observation.sourceIds.length ||
          !observation.sourceIds.every((sourceId) => knownDiscoverySourceIds.has(sourceId)) ||
          !Number.isInteger(observation.estimatedRating) || observation.estimatedRating < 1 || observation.estimatedRating > 99 ||
          !Number.isInteger(observation.estimatedPotential) || observation.estimatedPotential < observation.estimatedRating || observation.estimatedPotential > 99 ||
          !Number.isInteger(observation.confidence) || observation.confidence < 40 || observation.confidence > 99 ||
          !recommendations.includes(observation.recommendation)) return false;
      const sequence = sequenceOf(observation.missionId, "scout-mission");
      if (!sequence || observation.reportId !== "scout-report-" + sequence ||
          observation.id !== "scout-observation-" + sequence + "-" + observation.playerId) return false;
      if (observation.scoutId !== undefined &&
          (!knownScoutIds.has(observation.scoutId) || typeof observation.scoutName !== "string" || !observation.scoutName.trim())) return false;
      return observation.scoutId === undefined || observation.scoutName !== undefined;
    })) return false;
  }

  return scouting.nextMissionSequence > highestSequence;
}

export function isValidSave(value) {
  if (!isRecord(value) || !isRecord(value.meta) || !isRecord(value.career)) return false;
  if (!isRecord(value.agency) || !isRecord(value.world)) return false;
  if (value.meta.version !== SAVE_VERSION) return false;
  if (!isValidTimestamp(value.meta.createdAt) || !isValidTimestamp(value.meta.updatedAt)) return false;

  const { day, week, season } = value.career;
  if (![day, week, season].every((item) => Number.isSafeInteger(item) && item >= 1)) return false;
  if (week !== Math.ceil(day / 7)) return false;

  const { id, name, balance, reputation, clients } = value.agency;
  if (typeof id !== "string" || !id.trim()) return false;
  if (typeof name !== "string" || !name.trim()) return false;
  if (typeof balance !== "number" || !Number.isFinite(balance) || balance < 0) return false;
  if (!Number.isInteger(reputation) || reputation < 0 || reputation > 100) return false;
  if (!Array.isArray(clients) || !hasUniqueStringIds(clients)) return false;

  const { currentDate, players, clubs, competitions, activeOffers } = value.world;
  if (!isValidCalendarDate(currentDate)) return false;
  if (![players, clubs, competitions, activeOffers].every(Array.isArray)) return false;
  if (![players, clubs, competitions, activeOffers].every(hasUniqueIds)) return false;
  return isValidActivityCollections(value.world) &&
    isValidScoutingState(value.world.scouting, currentDate) &&
    isValidFootballState(value.world.football, currentDate, season) &&
    isValidTransferState(value.world.transfers, currentDate, clients, value.agency.representation) &&
    isValidRepresentationState(value.agency.representation, currentDate, clients) &&
    isValidTalentPipelineState(value.agency.talentPipeline, currentDate);
}

export function readWatchlist(storage) {
  try {
    const target = resolveStorage(storage);
    const raw = target.getItem(WATCHLIST_KEY);
    if (raw === null) return { status: "new", ids: [], error: null };

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { status: "corrupt", ids: [], error };
    }

    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string" && id.trim())) {
      return { status: "corrupt", ids: [], error: null };
    }
    return { status: "loaded", ids: [...new Set(parsed)], error: null };
  } catch (error) {
    return { status: "unavailable", ids: [], error };
  }
}

export function writeWatchlist(ids, storage) {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && id.trim())) {
    throw new TypeError("قائمة المتابعة تحتوي على معرفات غير صالحة.");
  }
  const normalized = [...new Set(ids)];
  const target = resolveStorage(storage);
  target.setItem(WATCHLIST_KEY, JSON.stringify(normalized));
  return normalized;
}

function resolveStorage(storage) {
  const target = storage ?? globalThis.localStorage;
  if (!target || typeof target.getItem !== "function" || typeof target.setItem !== "function") {
    throw new Error("التخزين المحلي غير متاح في البيئة الحالية.");
  }
  return target;
}


function migrateSave(value) {
  if (!isRecord(value) || !isRecord(value.meta) || !isRecord(value.world)) return value;
  if (![1, 2, 3, 4, 5, 6].includes(value.meta.version)) return value;

  return {
    ...value,
    meta: {
      ...value.meta,
      version: SAVE_VERSION
    },
    agency: {
      ...value.agency,
      representation: isRecord(value.agency?.representation)
        ? value.agency.representation
        : createInitialRepresentationState(),
      talentPipeline: isRecord(value.agency?.talentPipeline)
        ? value.agency.talentPipeline
        : createInitialTalentPipelineState()
    },
    world: {
      ...value.world,
      events: Array.isArray(value.world.events) ? value.world.events : [],
      inbox: Array.isArray(value.world.inbox) ? value.world.inbox : [],
      tasks: Array.isArray(value.world.tasks) ? value.world.tasks : [],
      scouting: isRecord(value.world.scouting) ? value.world.scouting : { nextMissionSequence: 1, activeMissions: [], reports: [] },
      football: isRecord(value.world.football)
        ? {
            ...value.world.football,
            playerDevelopment: mergePlayerDevelopmentRoster(
              value.world.football.playerDevelopment,
              getWorldSquadPlayers()
            )
          }
        : createInitialFootballState(value.career?.season ?? 1, value.world.currentDate),
      transfers: isRecord(value.world.transfers) ? value.world.transfers : createInitialTransferState()
    }
  };
}

/**
 * Reads a save without silently replacing corrupt or newer save data.
 * status: "new" | "loaded" | "corrupt" | "unsupported" | "unavailable"
 */
export function readSave(storage) {
  let target;

  try {
    target = resolveStorage(storage);
    const raw = target.getItem(STORAGE_KEY);

    if (raw === null) {
      return { status: "new", save: createInitialSave(), error: null };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { status: "corrupt", save: null, error };
    }

    if (parsed?.meta?.version > SAVE_VERSION) {
      return { status: "unsupported", save: null, error: null };
    }

    const migrated = [1, 2, 3, 4, 5, 6].includes(parsed?.meta?.version);
    if (migrated) parsed = migrateSave(parsed);

    if (!isValidSave(parsed)) {
      return { status: "corrupt", save: null, error: null };
    }

    return { status: "loaded", save: parsed, migrated, error: null };
  } catch (error) {
    return { status: "unavailable", save: null, error };
  }
}

export function writeSave(save, storage, now = new Date().toISOString()) {
  if (!isValidSave(save)) {
    throw new TypeError("بيانات الحفظ غير مطابقة لبنية اللعبة الحالية.");
  }

  const target = resolveStorage(storage);
  const snapshot = {
    ...save,
    meta: {
      ...save.meta,
      version: SAVE_VERSION,
      updatedAt: now
    }
  };

  target.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export function deleteSave(storage) {
  const target = resolveStorage(storage);
  if (typeof target.removeItem !== "function") {
    throw new Error("عملية حذف الحفظ غير مدعومة.");
  }
  target.removeItem(STORAGE_KEY);
}
