import {
  calculateRepresentationCommission,
  getRepresentationContractCommission,
  getRepresentationContractExpiry
} from "./representation.js";

export const PLAYER_INCOME_COMMISSION_MODEL = "realized-income-v1";
export const MAX_PLAYER_INCOME_ENTRIES = 20000;

const MAX_EUR = 2_000_000_000;
const INCOME_KINDS = new Set(["salary", "signing-bonus", "appearance-bonus", "goal-bonus"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validMoney(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_EUR;
}

export function isPlayerIncomeDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addPlayerIncomeDays(value, days) {
  const date = new Date(value + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sequenceOf(id) {
  const match = /^player-income-(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

export function createInitialPlayerIncomeState(currentDate = "2026-07-01", settledThroughCurrentDate = false) {
  const safeDate = isPlayerIncomeDate(currentDate) ? currentDate : "2026-07-01";
  return {
    nextEntrySequence: 1,
    lastWageSettlementDate: settledThroughCurrentDate
      ? safeDate
      : addPlayerIncomeDays(safeDate, -1),
    wagePaidThroughDate: settledThroughCurrentDate
      ? safeDate
      : addPlayerIncomeDays(safeDate, -1),
    ledger: []
  };
}

function resolveIncomeState(save, currentDate) {
  if (isRecord(save?.world?.playerIncome)) return save.world.playerIncome;
  return createInitialPlayerIncomeState(save?.world?.currentDate ?? currentDate);
}

function activeRepresentationContract(save, playerId, date) {
  const contracts = Array.isArray(save?.agency?.representation?.contracts)
    ? save.agency.representation.contracts
    : [];
  return contracts
    .filter((contract) => {
      if (contract.playerId !== playerId ||
          !["active", "terminated"].includes(contract.status) ||
          !isPlayerIncomeDate(contract.signedOn ?? date) ||
          date < (contract.signedOn ?? date) ||
          date >= getRepresentationContractExpiry(contract)) return false;
      return !contract.endedOn || date <= contract.endedOn;
    })
    .sort((left, right) =>
      dateCompare(right.signedOn ?? date, left.signedOn ?? date)
    )[0] ?? null;
}

function commissionForIncome(save, playerId, date, grossEur) {
  const contract = activeRepresentationContract(save, playerId, date);
  if (!contract) {
    return {
      representationContractId: null,
      commissionRate: null,
      agencyCommissionEur: 0
    };
  }
  const commissionRate = getRepresentationContractCommission(contract, date);
  return {
    representationContractId: contract.id,
    commissionRate,
    agencyCommissionEur: calculateRepresentationCommission(grossEur, commissionRate)
  };
}

function appendIncome(save, state, record) {
  if (state.ledger.some((entry) => entry.sourceId === record.sourceId)) {
    return { save, state, added: false, addedCommissionEur: 0 };
  }
  if (state.ledger.length >= MAX_PLAYER_INCOME_ENTRIES ||
      !Number.isSafeInteger(state.nextEntrySequence) || state.nextEntrySequence < 1) {
    return { save, state, added: false, addedCommissionEur: 0, error: "سجل دخل اللاعبين ممتلئ أو غير صالح." };
  }
  const entry = {
    id: "player-income-" + state.nextEntrySequence,
    currency: "EUR",
    ...record,
    playerNetEur: record.grossEur - record.agencyCommissionEur
  };
  const next = {
    ...state,
    nextEntrySequence: state.nextEntrySequence + 1,
    ledger: [...state.ledger, entry]
  };
  return {
    save: { ...save, world: { ...save.world, playerIncome: next } },
    state: next,
    added: true,
    addedCommissionEur: entry.agencyCommissionEur
  };
}

function getMoveServiceEndDate(move) {
  const dates = move.type === "permanent"
    ? [move.contractEndDate]
    : [
        move.returnDate,
        move.recallReturnDate,
        move.returnedDate,
        move.purchasedDate
      ];
  return dates.filter(isPlayerIncomeDate).sort()[0] ?? null;
}

function isMoveEmployedOn(move, date) {
  if (!isPlayerIncomeDate(move.effectiveDate) || date < move.effectiveDate) return false;
  const endDate = getMoveServiceEndDate(move);
  return isPlayerIncomeDate(endDate) && date < endDate;
}

function moveSequence(move) {
  const match = /-(\d+)$/.exec(move.id ?? "");
  return match ? Number(match[1]) : 0;
}

function resolveSalaryMove(moves, playerId, date) {
  return moves
    .filter((move) => move.playerId === playerId && isMoveEmployedOn(move, date))
    .sort((left, right) =>
      dateCompare(left.effectiveDate, right.effectiveDate) ||
      moveSequence(left) - moveSequence(right)
    )
    .at(-1) ?? null;
}

/**
 * Settles one weekly wage period on Monday. Partial weeks are prorated by the
 * number of contract days in the period. Loan wage-share terms split the club
 * funding between the borrowing and parent clubs, while the player receives
 * the full gross wage once.
 */
export function settleWeeklyPlayerWages(save, currentDate) {
  const transfers = save?.world?.transfers;
  if (!isRecord(transfers) || !Array.isArray(transfers.moves) ||
      !isPlayerIncomeDate(currentDate) ||
      new Date(currentDate + "T00:00:00.000Z").getUTCDay() !== 1) {
    return { save, entriesAdded: [], grossPaidEur: 0, agencyCommissionEur: 0 };
  }

  let state = resolveIncomeState(save, currentDate);
  const lastSettlementDate = state.lastWageSettlementDate;
  if (!isPlayerIncomeDate(lastSettlementDate) || currentDate <= lastSettlementDate) {
    return { save, entriesAdded: [], grossPaidEur: 0, agencyCommissionEur: 0 };
  }

  const paidThroughDate = isPlayerIncomeDate(state.wagePaidThroughDate)
    ? state.wagePaidThroughDate
    : lastSettlementDate;
  const periodStart = addPlayerIncomeDays(paidThroughDate, 1);
  const periodEnd = addPlayerIncomeDays(currentDate, -1);
  if (periodStart > periodEnd) {
    const next = {
      ...state,
      lastWageSettlementDate: currentDate,
      wagePaidThroughDate: periodEnd
    };
    return {
      save: { ...save, world: { ...save.world, playerIncome: next } },
      entriesAdded: [],
      grossPaidEur: 0,
      agencyCommissionEur: 0
    };
  }

  const days = [];
  for (let cursor = periodStart; cursor <= periodEnd; cursor = addPlayerIncomeDays(cursor, 1)) {
    days.push(cursor);
  }
  if (days.length > 7) {
    return { save, entriesAdded: [], grossPaidEur: 0, agencyCommissionEur: 0,
      error: "تجاوزت فترة تسوية الرواتب أسبوعًا واحدًا؛ يلزم تسوية الفترات بالتتابع." };
  }

  const moves = transfers.moves;
  const playerIds = [...new Set(moves.map((move) => move.playerId))];
  const activeDaysByMove = new Map();
  for (const playerId of playerIds) {
    for (const date of days) {
      const move = resolveSalaryMove(moves, playerId, date);
      if (!move) continue;
      activeDaysByMove.set(move.id, {
        move,
        activeDays: (activeDaysByMove.get(move.id)?.activeDays ?? 0) + 1
      });
    }
  }

  let nextSave = save;
  const entriesAdded = [];
  let grossPaidEur = 0;
  let agencyCommissionEur = 0;
  for (const { move, activeDays } of activeDaysByMove.values()) {
    const grossEur = Math.round(move.weeklyWageEur * activeDays / 7);
    if (grossEur <= 0) continue;

    const isLoan = move.type === "loan";
    const hostSharePercent = isLoan ? (move.wageSharePercent ?? 100) : 100;
    const hostClubEur = Math.round(grossEur * hostSharePercent / 100);
    const parentClubEur = grossEur - hostClubEur;
    const mandate = move.commissionModel === PLAYER_INCOME_COMMISSION_MODEL
      ? commissionForIncome(nextSave, move.playerId, currentDate, grossEur)
      : { representationContractId: null, commissionRate: null, agencyCommissionEur: 0 };

    const record = {
      sourceId: "salary|" + move.id + "|" + currentDate,
      kind: "salary",
      playerId: move.playerId,
      playerName: move.playerName,
      moveId: move.id,
      date: currentDate,
      periodStart,
      periodEnd,
      activeDays,
      grossEur,
      hostClubEur,
      parentClubEur,
      representationContractId: mandate.representationContractId,
      commissionRate: mandate.commissionRate,
      agencyCommissionEur: mandate.agencyCommissionEur
    };
    const appended = appendIncome(nextSave, state, record);
    if (appended.error) {
      return { save, entriesAdded: [], grossPaidEur: 0, agencyCommissionEur: 0, error: appended.error };
    }
    nextSave = appended.save;
    state = appended.state;
    if (appended.added) {
      entriesAdded.push(appended.state.ledger.at(-1));
      grossPaidEur += grossEur;
      agencyCommissionEur += appended.addedCommissionEur;
    }
  }

  state = {
    ...state,
    lastWageSettlementDate: currentDate,
    wagePaidThroughDate: periodEnd
  };
  nextSave = { ...nextSave, world: { ...nextSave.world, playerIncome: state } };
  return { save: nextSave, entriesAdded, grossPaidEur, agencyCommissionEur };
}

/**
 * Imports actual player signing and performance bonuses from the club finance
 * ledger. Legacy transfers already charged commission on their projected
 * contract value, so only new realized-income contracts charge on signing
 * bonuses. Performance bonuses were never included in that legacy projection.
 */
export function settleTransferBonusIncome(save, currentDate = save?.world?.currentDate) {
  const transfers = save?.world?.transfers;
  if (!isRecord(transfers) || !Array.isArray(transfers.financeLedger) ||
      !Array.isArray(transfers.moves) || !isPlayerIncomeDate(currentDate)) {
    return { save, entriesAdded: [], addedCommissionEur: 0 };
  }

  let nextSave = save;
  let state = resolveIncomeState(save, currentDate);
  const moveById = new Map(transfers.moves.map((move) => [move.id, move]));
  const entriesAdded = [];
  let addedCommissionEur = 0;
  const bonusFinanceEntries = transfers.financeLedger.filter((entry) =>
    ["signing-bonus", "performance-bonus"].includes(entry.type) &&
    Number.isSafeInteger(entry.amountEur) && entry.amountEur < 0 &&
    isPlayerIncomeDate(entry.date) && entry.date <= currentDate
  );

  for (const financeEntry of bonusFinanceEntries) {
    const move = moveById.get(financeEntry.moveId);
    if (!move || financeEntry.playerId !== move.playerId) continue;
    const grossEur = -financeEntry.amountEur;
    const kind = financeEntry.type === "signing-bonus"
      ? "signing-bonus"
      : financeEntry.bonusKind === "appearance" ? "appearance-bonus" : "goal-bonus";
    const shouldChargeCommission = financeEntry.type === "performance-bonus" ||
      move.commissionModel === PLAYER_INCOME_COMMISSION_MODEL;
    const mandate = shouldChargeCommission
      ? commissionForIncome(nextSave, move.playerId, financeEntry.date, grossEur)
      : { representationContractId: null, commissionRate: null, agencyCommissionEur: 0 };
    const record = {
      sourceId: financeEntry.id,
      kind,
      playerId: move.playerId,
      playerName: move.playerName,
      moveId: move.id,
      date: financeEntry.date,
      periodStart: null,
      periodEnd: null,
      activeDays: null,
      grossEur,
      hostClubEur: grossEur,
      parentClubEur: 0,
      representationContractId: mandate.representationContractId,
      commissionRate: mandate.commissionRate,
      agencyCommissionEur: mandate.agencyCommissionEur
    };
    const appended = appendIncome(nextSave, state, record);
    if (appended.error) {
      return { save, entriesAdded: [], addedCommissionEur: 0, error: appended.error };
    }
    nextSave = appended.save;
    state = appended.state;
    if (appended.added) {
      entriesAdded.push(appended.state.ledger.at(-1));
      addedCommissionEur += appended.addedCommissionEur;
    }
  }

  if (nextSave.world.playerIncome === undefined) {
    nextSave = { ...nextSave, world: { ...nextSave.world, playerIncome: state } };
  }
  return { save: nextSave, entriesAdded, addedCommissionEur };
}

export function getPlayerIncomeSummary(save, playerId = null) {
  const ledger = Array.isArray(save?.world?.playerIncome?.ledger)
    ? save.world.playerIncome.ledger
    : [];
  const entries = playerId
    ? ledger.filter((entry) => entry.playerId === playerId)
    : ledger;
  const legacyTransferEntries = (save?.world?.transfers?.ledger ?? []).filter((entry) =>
    entry.type === "agent-commission" && (!playerId || entry.playerId === playerId)
  );
  const grossEur = entries.reduce((total, entry) => total + entry.grossEur, 0);
  const realizedAgencyCommissionEur = entries.reduce((total, entry) => total + entry.agencyCommissionEur, 0);
  const legacyCommissionEur = legacyTransferEntries.reduce((total, entry) => total + entry.amountEur, 0);
  const salaryGrossEur = entries
    .filter((entry) => entry.kind === "salary")
    .reduce((total, entry) => total + entry.grossEur, 0);
  const bonusGrossEur = grossEur - salaryGrossEur;
  const playerNetEur = entries.reduce((total, entry) => total + entry.playerNetEur, 0);
  return {
    entries,
    entryCount: entries.length,
    grossEur,
    salaryGrossEur,
    bonusGrossEur,
    playerNetEur,
    realizedAgencyCommissionEur,
    legacyCommissionEur,
    totalAgencyCommissionEur: realizedAgencyCommissionEur + legacyCommissionEur
  };
}

export function isValidPlayerIncomeState(state, currentDate, representation, transfers) {
  if (!isRecord(state) ||
      !Number.isSafeInteger(state.nextEntrySequence) || state.nextEntrySequence < 1 ||
      !isPlayerIncomeDate(state.lastWageSettlementDate) ||
      state.lastWageSettlementDate > currentDate ||
      !isPlayerIncomeDate(state.wagePaidThroughDate) ||
      state.wagePaidThroughDate > currentDate ||
      state.wagePaidThroughDate > state.lastWageSettlementDate ||
      !Array.isArray(state.ledger) || state.ledger.length > MAX_PLAYER_INCOME_ENTRIES) return false;

  const moves = new Map((transfers?.moves ?? []).map((move) => [move.id, move]));
  const financeEntries = new Map((transfers?.financeLedger ?? []).map((entry) => [entry.id, entry]));
  const sourceIds = new Set();
  const entryIds = new Set();
  const entrySequences = new Set();
  let highestSequence = 0;
  for (const entry of state.ledger) {
    const move = moves.get(entry?.moveId);
    const entrySequence = sequenceOf(entry?.id);
    if (!isRecord(entry) || !entrySequence || !validId(entry.sourceId) ||
        sourceIds.has(entry.sourceId) || entryIds.has(entry.id) || entrySequences.has(entrySequence) ||
        !INCOME_KINDS.has(entry.kind) ||
        !move || move.playerId !== entry.playerId || move.playerName !== entry.playerName ||
        !validId(entry.playerId) || !validId(entry.playerName) ||
        !isPlayerIncomeDate(entry.date) || entry.date > currentDate ||
        entry.currency !== "EUR" || !validMoney(entry.grossEur) || entry.grossEur < 1 ||
        !validMoney(entry.agencyCommissionEur) || entry.agencyCommissionEur > entry.grossEur ||
        !validMoney(entry.playerNetEur) ||
        entry.playerNetEur !== entry.grossEur - entry.agencyCommissionEur ||
        !validMoney(entry.hostClubEur) || !validMoney(entry.parentClubEur) ||
        entry.hostClubEur + entry.parentClubEur !== entry.grossEur ||
        (entry.commissionRate !== null &&
          (!Number.isInteger(entry.commissionRate) || entry.commissionRate < 5 || entry.commissionRate > 15)) ||
        (entry.representationContractId !== null && !validId(entry.representationContractId))) return false;

    if (entry.commissionRate === null) {
      if (entry.representationContractId !== null || entry.agencyCommissionEur !== 0) return false;
    } else {
      const contract = (representation?.contracts ?? []).find((item) =>
        item.id === entry.representationContractId
      );
      if (!contract || contract.playerId !== entry.playerId ||
          entry.date < contract.signedOn ||
          entry.date >= getRepresentationContractExpiry(contract) ||
          (contract.endedOn && entry.date > contract.endedOn) ||
          getRepresentationContractCommission(contract, entry.date) !== entry.commissionRate ||
          entry.agencyCommissionEur !== calculateRepresentationCommission(entry.grossEur, entry.commissionRate)) {
        return false;
      }
    }

    if (entry.kind === "salary") {
      if (entry.sourceId !== "salary|" + move.id + "|" + entry.date ||
          !isPlayerIncomeDate(entry.periodStart) || !isPlayerIncomeDate(entry.periodEnd) ||
          entry.periodEnd !== addPlayerIncomeDays(entry.date, -1) ||
          entry.periodStart > entry.periodEnd ||
          dateCompare(entry.periodStart, addPlayerIncomeDays(entry.periodEnd, -6)) < 0 ||
          !Number.isSafeInteger(entry.activeDays) || entry.activeDays < 1 || entry.activeDays > 7 ||
          entry.grossEur !== Math.round(move.weeklyWageEur * entry.activeDays / 7) ||
          (move.type === "loan"
            ? entry.hostClubEur !== Math.round(entry.grossEur * (move.wageSharePercent ?? 100) / 100)
            : entry.hostClubEur !== entry.grossEur) ||
          (move.type === "permanent" && entry.parentClubEur !== 0) ||
          (move.commissionModel !== PLAYER_INCOME_COMMISSION_MODEL &&
            (entry.commissionRate !== null || entry.representationContractId !== null ||
             entry.agencyCommissionEur !== 0))) return false;
    } else {
      const financeEntry = financeEntries.get(entry.sourceId);
      const expectedKind = financeEntry?.type === "signing-bonus"
        ? "signing-bonus"
        : financeEntry?.type === "performance-bonus" && financeEntry.bonusKind === "appearance"
          ? "appearance-bonus"
          : financeEntry?.type === "performance-bonus" && financeEntry.bonusKind === "goal"
            ? "goal-bonus"
            : null;
      if (!financeEntry || expectedKind !== entry.kind ||
          financeEntry.moveId !== move.id || financeEntry.playerId !== entry.playerId ||
          financeEntry.date !== entry.date || financeEntry.amountEur !== -entry.grossEur ||
          entry.sourceId !== financeEntry.id || entry.periodStart !== null ||
          entry.periodEnd !== null || entry.activeDays !== null ||
          entry.hostClubEur !== entry.grossEur || entry.parentClubEur !== 0 ||
          (entry.kind === "signing-bonus" && move.commissionModel !== PLAYER_INCOME_COMMISSION_MODEL &&
            entry.agencyCommissionEur !== 0)) return false;
    }

    if (entry.agencyCommissionEur > 0 && move.commissionModel !== PLAYER_INCOME_COMMISSION_MODEL &&
        entry.kind !== "appearance-bonus" && entry.kind !== "goal-bonus") return false;
    sourceIds.add(entry.sourceId);
    entryIds.add(entry.id);
    entrySequences.add(entrySequence);
    highestSequence = Math.max(highestSequence, entrySequence);
  }
  return state.nextEntrySequence > highestSequence;
}
