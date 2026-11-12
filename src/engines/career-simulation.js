import { advanceCareerDay } from "./career-calendar.js";
import { settleTransferPerformanceBonuses } from "./transfers.js";
import { advanceScoutingMissions } from "./scouting.js";
import { advanceRepresentationState } from "./representation.js";
import { advanceAgencyManagementDay } from "./agency-management.js";
import { recordTalentProspectMatchPerformances } from "./talent-pipeline.js";

/**
 * Runs one complete in-game day across the shared career world.
 *
 * The calendar owns football and transfer transitions; scouting and client
 * representation are then advanced to that exact same date. This keeps every
 * subsystem on one clock without replaying transfer processing in the UI.
 */
export function advanceCareerSimulationDay(save, players) {
  if (!Array.isArray(players) && typeof players !== "function") {
    throw new TypeError("قاعدة لاعبي الكشافة غير متاحة.");
  }

  const calendarSave = advanceCareerDay(save);
  const currentDate = calendarSave.world.currentDate;
  const dailyPlayers = typeof players === "function" ? players(calendarSave) : players;
  if (!Array.isArray(dailyPlayers)) {
    throw new TypeError("مزود قاعدة لاعبي الكشافة لم يُرجع قائمة صالحة.");
  }
  const previousResultIds = new Set((save.world.football?.results ?? []).map((result) => result.id));
  const newMatchResults = (calendarSave.world.football?.results ?? []).filter((result) =>
    result.date === currentDate && !previousResultIds.has(result.id)
  );
  const performanceTracking = recordTalentProspectMatchPerformances(
    calendarSave,
    newMatchResults,
    currentDate
  );
  const bonusSettlement = settleTransferPerformanceBonuses(
    performanceTracking.save,
    currentDate
  );
  const scouting = advanceScoutingMissions(bonusSettlement.save, dailyPlayers, currentDate);
  const representation = advanceRepresentationState(scouting.save, currentDate);
  const agencyOperations = advanceAgencyManagementDay(representation.save, currentDate, dailyPlayers);

  return {
    save: agencyOperations.save,
    completedReports: scouting.completedReports,
    expiredOffers: representation.expiredOffers,
    expiredContracts: representation.expiredContracts,
    paidPerformanceBonuses: bonusSettlement.paidBonuses,
    recordedTalentPerformances: performanceTracking.recordedCount,
    agencyOperations: agencyOperations.processed ? agencyOperations : null
  };
}

/**
 * Advances complete game days in sequence. Weekly progression therefore runs
 * each subsystem on every intermediate date rather than only at week end.
 */
export function advanceCareerSimulationDays(save, days, players) {
  if (!Number.isInteger(days) || days < 1 || days > 31) {
    throw new TypeError("يمكن تقدم المسيرة من يوم واحد إلى 31 يومًا في المرة الواحدة.");
  }
  if (!Array.isArray(players) && typeof players !== "function") {
    throw new TypeError("قاعدة لاعبي الكشافة غير متاحة.");
  }

  let nextSave = save;
  const completedReports = [];
  const expiredOffers = [];
  const expiredContracts = [];
  let recordedTalentPerformances = 0;

  for (let offset = 0; offset < days; offset += 1) {
    const daily = advanceCareerSimulationDay(nextSave, players);
    nextSave = daily.save;
    completedReports.push(...daily.completedReports);
    expiredOffers.push(...daily.expiredOffers);
    expiredContracts.push(...daily.expiredContracts);
    recordedTalentPerformances += daily.recordedTalentPerformances ?? 0;
  }

  return {
    save: nextSave,
    completedReports,
    expiredOffers,
    expiredContracts,
    recordedTalentPerformances
  };
}
