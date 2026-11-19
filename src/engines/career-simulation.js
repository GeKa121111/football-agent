import { advanceCareerDay } from "./career-calendar.js";
import { settleTransferPerformanceBonuses } from "./transfers.js";
import { advanceScoutingMissions } from "./scouting.js";
import { advanceRepresentationState } from "./representation.js";
import { advanceAgencyManagementDay } from "./agency-management.js";
import { advanceInternationalWindows } from "./international-breaks.js";
import { advanceInternationalMatches } from "./international-matches.js";
import { advanceInternationalTournaments } from "./international-tournament-simulation.js";
import { settleWeeklyPlayerWages, settleTransferBonusIncome } from "./player-income.js";
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

  const nextDate = (() => {
    const date = new Date(save.world.currentDate + "T00:00:00.000Z");
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  })();
  // Payroll runs against the pre-transition contract state so a contract
  // ending on Monday still pays the completed Monday-to-Sunday period.
  const wageSettlement = settleWeeklyPlayerWages(save, nextDate);
  if (wageSettlement.error) throw new Error(wageSettlement.error);
  const calendarSave = advanceCareerDay(wageSettlement.save);
  const internationalSave = advanceInternationalWindows(calendarSave);
  const matchdaySave = advanceInternationalMatches(internationalSave);
  const tournamentSave = advanceInternationalTournaments(matchdaySave);
  const currentDate = tournamentSave.world.currentDate;
  const previousResultIds = new Set((save.world.football?.results ?? []).map((result) => result.id));
  const newMatchResults = (calendarSave.world.football?.results ?? []).filter((result) =>
    result.date === currentDate && !previousResultIds.has(result.id)
  );
  const performanceTracking = recordTalentProspectMatchPerformances(
    tournamentSave,
    newMatchResults,
    currentDate
  );
  if (performanceTracking.error) throw new Error(performanceTracking.error);
  const dailyPlayers = typeof players === "function" ? players(tournamentSave) : players;
  if (!Array.isArray(dailyPlayers)) {
    throw new TypeError("مزود قاعدة لاعبي الكشافة لم يُرجع قائمة صالحة.");
  }
  const bonusSettlement = settleTransferPerformanceBonuses(performanceTracking.save, currentDate);
  const bonusIncome = settleTransferBonusIncome(bonusSettlement.save, currentDate);
  if (bonusIncome.error) throw new Error(bonusIncome.error);
  const scouting = advanceScoutingMissions(bonusIncome.save, dailyPlayers, currentDate);
  const representation = advanceRepresentationState(scouting.save, currentDate);
  const agencyOperations = advanceAgencyManagementDay(representation.save, currentDate, dailyPlayers);

  return {
    save: agencyOperations.save,
    completedReports: scouting.completedReports,
    expiredOffers: representation.expiredOffers,
    expiredContracts: representation.expiredContracts,
    paidPerformanceBonuses: bonusSettlement.paidBonuses,
    recordedTalentPerformances: performanceTracking.recordedCount,
    paidPlayerIncome: [...wageSettlement.entriesAdded, ...bonusIncome.entriesAdded],
    playerIncomeCommissionEur: wageSettlement.agencyCommissionEur + bonusIncome.addedCommissionEur,
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
  const paidPlayerIncome = [];
  let playerIncomeCommissionEur = 0;
  let recordedTalentPerformances = 0;

  for (let offset = 0; offset < days; offset += 1) {
    const daily = advanceCareerSimulationDay(nextSave, players);
    nextSave = daily.save;
    completedReports.push(...daily.completedReports);
    expiredOffers.push(...daily.expiredOffers);
    expiredContracts.push(...daily.expiredContracts);
    paidPlayerIncome.push(...daily.paidPlayerIncome);
    playerIncomeCommissionEur += daily.playerIncomeCommissionEur;
    recordedTalentPerformances += daily.recordedTalentPerformances ?? 0;
  }

  return {
    save: nextSave,
    completedReports,
    expiredOffers,
    expiredContracts,
    paidPlayerIncome,
    playerIncomeCommissionEur,
    recordedTalentPerformances
  };
}
