import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave } from "../src/core/storage.js";
import {
  getAgencyFinancialLedger,
  getAgencyFinancialSummary
} from "../src/engines/agency-financial-ledger.js";

function buildSave() {
  const save = createInitialSave();
  save.agency.management.ledger = [
    {
      id: "agency-ledger-1", date: "2026-07-06", type: "sponsorship-income",
      direction: "income", incomeKind: "weekly", amountEgp: 3000, paidEgp: 3000,
      referenceId: "agency-sponsorship-1", note: "دخل رعاية أسبوعي"
    },
    {
      id: "agency-ledger-2", date: "2026-07-06", type: "weekly-operations",
      amountEgp: 2500, paidEgp: 2000, referenceId: null, note: "تشغيل أسبوعي"
    },
    {
      id: "agency-ledger-3", date: "2026-07-06", type: "credit-drawdown",
      direction: "financing", amountEgp: 50000, paidEgp: 50000,
      referenceId: "agency-credit-1", note: "صرف تمويل"
    },
    {
      id: "agency-ledger-4", date: "2026-07-13", type: "credit-repayment",
      direction: "expense", amountEgp: 5000, paidEgp: 3000,
      referenceId: "agency-credit-1", note: "سداد قسط تمويل"
    }
  ];
  save.world.playerIncome.ledger = [
    {
      id: "player-income-1", sourceId: "salary|transfer-move-1|2026-07-13",
      moveId: "transfer-move-1", playerId: "player-1", playerName: "لاعب تجريبي",
      kind: "salary", date: "2026-07-13", agencyCommissionEur: 120,
      grossEur: 1200, playerNetEur: 1080
    }
  ];
  save.world.transfers.ledger = [
    {
      id: "transfer-ledger-1", type: "agent-commission", offerId: "transfer-offer-1",
      moveId: "transfer-move-legacy", playerId: "player-legacy", playerName: "لاعب تاريخي",
      date: "2026-07-01", amountEur: 400, currency: "EUR"
    }
  ];
  return save;
}

test("builds one chronological journal while preserving original currencies", () => {
  const ledger = getAgencyFinancialLedger(buildSave());
  assert.equal(ledger.length, 6);
  assert.deepEqual(ledger.map((entry) => entry.date), [
    "2026-07-13", "2026-07-13", "2026-07-06", "2026-07-06", "2026-07-06", "2026-07-01"
  ]);
  assert.equal(ledger.find((entry) => entry.source === "player-income").currency, "EUR");
  assert.equal(ledger.find((entry) => entry.source === "agency-management").currency, "EGP");
});

test("keeps commissions as receivables, not agency cash", () => {
  const summary = getAgencyFinancialSummary(buildSave());
  assert.equal(summary.eur.commissionReceivableEur, 120);
  assert.equal(summary.eur.commissionEntryCount, 1);
  assert.equal(summary.eur.historicalCommissionUnreconciledEur, 400);
  assert.equal(summary.eur.historicalCommissionUnreconciledCount, 1);
  assert.equal(summary.eur.commissionCollectedEur, 0);
  const commission = summary.ledger.find((entry) => entry.category === "representation-commission");
  assert.equal(commission.status, "receivable");
  assert.equal(commission.paidAmount, 0);
  assert.equal(commission.outstandingAmount, commission.amount);
  const legacy = summary.ledger.find((entry) => entry.category === "historical-commission-unreconciled");
  assert.equal(legacy.status, "historical-unreconciled");
  assert.equal(legacy.paidAmount, null);
  assert.equal(legacy.outstandingAmount, null);
});

test("excludes financing from operating revenue and separates debt repayment", () => {
  const summary = getAgencyFinancialSummary(buildSave());
  assert.equal(summary.egp.operatingIncomePaidEgp, 3000);
  assert.equal(summary.egp.operatingExpensesPaidEgp, 2000);
  assert.equal(summary.egp.netOperatingCashFlowEgp, 1000);
  assert.equal(summary.egp.financingDrawdownEgp, 50000);
  assert.equal(summary.egp.financingRepaymentEgp, 3000);
  assert.equal(summary.egp.netFinancingCashFlowEgp, 47000);
  assert.equal(summary.egp.totalCashFlowEgp, 48000);
});

test("does not mutate the saved finance sources", () => {
  const save = buildSave();
  const before = structuredClone(save);
  getAgencyFinancialSummary(save);
  assert.deepEqual(save, before);
});
