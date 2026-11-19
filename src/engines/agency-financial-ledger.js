const MANAGEMENT_LABELS = Object.freeze({
  "hiring": "تكلفة تعيين",
  "branch-opening": "تكلفة افتتاح فرع",
  "weekly-operations": "رواتب وإيجارات وتشغيل",
  "sponsorship-income": "دخل رعاية",
  "credit-drawdown": "صرف تمويل",
  "credit-repayment": "سداد تمويل"
});

const PLAYER_INCOME_LABELS = Object.freeze({
  "salary": "عمولة تمثيل عن راتب لاعب",
  "signing-bonus": "عمولة تمثيل عن مكافأة توقيع",
  "appearance-bonus": "عمولة تمثيل عن مكافأة مشاركات",
  "goal-bonus": "عمولة تمثيل عن مكافأة أهداف"
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isMoney(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function managementEntry(entry) {
  if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id ||
      !isValidDate(entry.date) || !isMoney(entry.amountEgp) ||
      !isMoney(entry.paidEgp) || entry.paidEgp > entry.amountEgp) return null;

  const isDrawdown = entry.type === "credit-drawdown";
  const isRepayment = entry.type === "credit-repayment";
  const direction = isDrawdown || isRepayment ? "financing"
    : entry.direction === "income" ? "income" : "expense";
  const category = isDrawdown ? "financing"
    : isRepayment ? "financing-repayment"
      : direction === "income" ? "sponsorship" : "operations";
  const status = entry.paidEgp >= entry.amountEgp ? "paid"
    : entry.paidEgp > 0 ? "partial" : "unpaid";

  return {
    id: "management:" + entry.id,
    source: "agency-management",
    sourceId: entry.id,
    date: entry.date,
    description: typeof entry.note === "string" && entry.note.trim()
      ? entry.note : (MANAGEMENT_LABELS[entry.type] ?? "حركة مالية للوكالة"),
    direction,
    category,
    currency: "EGP",
    amount: entry.amountEgp,
    paidAmount: entry.paidEgp,
    outstandingAmount: entry.amountEgp - entry.paidEgp,
    status,
    referenceId: entry.referenceId ?? null,
    note: typeof entry.note === "string" ? entry.note : ""
  };
}

function commissionEntry(entry) {
  if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id ||
      !isValidDate(entry.date) || !isMoney(entry.agencyCommissionEur) ||
      entry.agencyCommissionEur <= 0) return null;

  return {
    id: "player-income:" + entry.id,
    source: "player-income",
    sourceId: entry.sourceId,
    date: entry.date,
    description: (PLAYER_INCOME_LABELS[entry.kind] ?? "عمولة تمثيل") +
      (entry.playerName ? " · " + entry.playerName : ""),
    direction: "income",
    category: "representation-commission",
    currency: "EUR",
    amount: entry.agencyCommissionEur,
    paidAmount: 0,
    outstandingAmount: entry.agencyCommissionEur,
    status: "receivable",
    referenceId: entry.moveId ?? null,
    playerId: entry.playerId ?? null,
    playerName: entry.playerName ?? null,
    note: "عمولة مستحقة على دخل تحقق للاعب؛ لم تُسجل كتحصيل نقدي للوكالة."
  };
}

function legacyCommissionEntry(entry) {
  if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id ||
      entry.type !== "agent-commission" || !isValidDate(entry.date) ||
      !isMoney(entry.amountEur) || entry.amountEur <= 0) return null;

  return {
    id: "legacy-transfer:" + entry.id,
    source: "legacy-transfer",
    sourceId: entry.id,
    date: entry.date,
    description: "عمولة تمثيل تاريخية" + (entry.playerName ? " · " + entry.playerName : ""),
    direction: "income",
    category: "representation-commission",
    currency: "EUR",
    amount: entry.amountEur,
    paidAmount: 0,
    outstandingAmount: entry.amountEur,
    status: "receivable",
    referenceId: entry.moveId ?? entry.offerId ?? null,
    playerId: entry.playerId ?? null,
    playerName: entry.playerName ?? null,
    note: "عمولة من نموذج الصفقات التاريخي؛ لا تُعامل كرصيد محصل."
  };
}

/**
 * Builds a read-only, source-linked agency journal from the existing ledgers.
 * Amounts retain their original currency; accrued player commissions remain
 * receivables until a separate collection flow is implemented.
 */
export function getAgencyFinancialLedger(save) {
  const management = save?.agency?.management?.ledger ?? [];
  const playerIncome = save?.world?.playerIncome?.ledger ?? [];
  const legacyTransfers = save?.world?.transfers?.ledger ?? [];
  const entries = [
    ...(Array.isArray(management) ? management.map(managementEntry) : []),
    ...(Array.isArray(playerIncome) ? playerIncome.map(commissionEntry) : []),
    ...(Array.isArray(legacyTransfers) ? legacyTransfers.map(legacyCommissionEntry) : [])
  ].filter(Boolean);

  const unique = new Map();
  for (const entry of entries) unique.set(entry.id, entry);
  return [...unique.values()].sort((a, b) =>
    b.date.localeCompare(a.date) || a.id.localeCompare(b.id)
  );
}

/**
 * Summarizes agency cash activity in EGP separately from EUR commission
 * receivables. Financing draws and repayments never enter operating revenue.
 */
export function getAgencyFinancialSummary(save) {
  const ledger = getAgencyFinancialLedger(save);
  const egpEntries = ledger.filter((entry) => entry.currency === "EGP");
  const eurCommissionEntries = ledger.filter((entry) =>
    entry.currency === "EUR" && entry.category === "representation-commission"
  );

  const sum = (entries, selector) => entries.reduce((total, entry) => total + selector(entry), 0);
  const operatingIncomePaidEgp = sum(
    egpEntries.filter((entry) => entry.category === "sponsorship" && entry.direction === "income"),
    (entry) => entry.paidAmount
  );
  const operatingExpensesPaidEgp = sum(
    egpEntries.filter((entry) => entry.category === "operations"),
    (entry) => entry.paidAmount
  );
  const financingDrawdownEgp = sum(
    egpEntries.filter((entry) => entry.category === "financing"),
    (entry) => entry.paidAmount
  );
  const financingRepaymentEgp = sum(
    egpEntries.filter((entry) => entry.category === "financing-repayment"),
    (entry) => entry.paidAmount
  );
  const commissionReceivableEur = sum(eurCommissionEntries, (entry) => entry.outstandingAmount);

  return {
    entryCount: ledger.length,
    egp: {
      operatingIncomePaidEgp,
      operatingExpensesPaidEgp,
      netOperatingCashFlowEgp: operatingIncomePaidEgp - operatingExpensesPaidEgp,
      financingDrawdownEgp,
      financingRepaymentEgp,
      netFinancingCashFlowEgp: financingDrawdownEgp - financingRepaymentEgp,
      totalCashFlowEgp: operatingIncomePaidEgp - operatingExpensesPaidEgp +
        financingDrawdownEgp - financingRepaymentEgp
    },
    eur: {
      commissionReceivableEur,
      commissionEntryCount: eurCommissionEntries.length,
      commissionCollectedEur: 0
    },
    ledger
  };
}
