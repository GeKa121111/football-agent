// اختبارات المرحلة 2 من وكيل — الدوال النقية في src/ui/wakil-screens.js.
// دوال العرض (DOM) تُغطى باختبارات المتصفح؛ هنا المنطق فقط.
import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave } from "../src/core/storage.js";
import {
  starsForRating,
  getPotentialRange,
  getPlayerTrust,
  getDualCommission,
  getPlayerTimeline,
  getStarPlan,
  getTodayDecisions,
  getWeekFinance,
  filterMarketPlayers,
  sortMarketPlayers,
  getMarketOffers,
  createNegotiation,
  getCollapseRisk,
  buildCounterTerms,
  applyNegotiationCounter,
  getCalendarData,
  getAgencyLevel,
  getStaffEffects,
  readTransferRoomListings,
  writeTransferRoomListings,
  createTransferRoomListing,
  resolveTransferRoomResponses,
  TRANSFER_ROOM_KEY,
  WAKIL_NEGOTIATION_MAX_ROUNDS
} from "../src/ui/wakil-screens.js";

const PLAYER = {
  id: "demo-yassin-adel",
  name: "ياسين عادل",
  rating: 72,
  potential: 85,
  age: 22,
  position: "هجوم",
  role: "attack",
  club: "النادي الأهلي",
  country: "مصر",
  marketValueEur: 2500000,
  contractUntil: "2028-06-30",
  seasonPerformance: { appearances: 10, goals: 4, assists: 2 },
  honors: [{ awardType: "topScorer", competitionName: "الدوري المصري", season: 1, value: 12 }]
};

function memStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
  };
}

test("stars map ratings 1-99 onto 1-6 stars", () => {
  assert.equal(starsForRating(99), 6);
  assert.equal(starsForRating(72), 5);
  assert.equal(starsForRating(50), 3);
  assert.equal(starsForRating(1), 1);
});

test("potential range never reveals a single potential number and narrows with scouting", () => {
  const wide = getPotentialRange(PLAYER, 0);
  assert.equal(wide.current, 72);
  assert.ok(wide.low <= 85 && wide.high >= 85);
  assert.equal(wide.certaintyLabel, "تقدير واسع");
  const narrow = getPotentialRange(PLAYER, 3);
  assert.equal(narrow.spread, 4);
  assert.equal(narrow.certaintyLabel, "مؤكد");
  assert.ok(narrow.low >= wide.low && narrow.high <= wide.high);
});

test("player trust derives loyalty and departure risk without new save fields", () => {
  const trust = getPlayerTrust(PLAYER, null, "2026-07-01");
  assert.ok(trust.trust >= 0 && trust.trust <= 100);
  assert.ok(["بيثق فيك", "متردد", "فقد الثقة"].includes(trust.trustLabel));
  assert.ok(["منخفض", "متوسط", "عالي"].includes(trust.departureRisk));
  assert.equal(typeof trust.needsAction, "boolean");
  const expiring = getPlayerTrust(PLAYER, {
    relationshipScore: 30, expiresOn: "2026-07-10", renewals: []
  }, "2026-07-01");
  assert.ok(expiring.trust < trust.trust);
  assert.equal(expiring.daysToExpiry, 9);
});

test("dual commission keeps the stored transfer rate and derives a salary rate", () => {
  const commission = getDualCommission({ commissionRate: 10, renewals: [] }, "2026-07-01");
  assert.equal(commission.transferRate, 10);
  assert.equal(commission.salaryRate, 5);
  assert.deepEqual(getDualCommission({}, null), { transferRate: 0, salaryRate: 0 });
});

test("player timeline and star plan come from recorded performance", () => {
  const timeline = getPlayerTimeline(PLAYER);
  assert.ok(timeline.length >= 2);
  assert.ok(timeline.some((entry) => entry.kind === "honor"));
  const plan = getStarPlan(PLAYER);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].target, 10);
  assert.equal(plan[0].current, 4);
  assert.equal(plan[0].progressPct, 40);
});

test("today decisions sort overdue tasks and open offers first", () => {
  const save = createInitialSave();
  save.world.tasks = [
    { id: "t1", status: "open", title: "مهمة عادية", description: "", dueDate: "2026-07-05" },
    { id: "t2", status: "overdue", title: "مهمة متأخرة", description: "", dueDate: "2026-06-28", overdueDate: "2026-06-28" }
  ];
  save.world.transfers.offers = [{
    id: "tr-1", playerId: PLAYER.id, playerName: PLAYER.name,
    toClubId: "club-1", toClubName: "نادي الهلال", fromClubId: "club-2",
    status: "pending", round: 1, type: "permanent",
    createdDate: "2026-07-01", expiresDate: "2026-07-20",
    terms: { feeEur: 1000000, weeklyWageEur: 5000, contractYears: 3, signingBonusEur: 0 }
  }];
  const decisions = getTodayDecisions(save, [PLAYER]);
  assert.equal(decisions[0].kind, "task");
  assert.equal(decisions[0].overdue, true);
  assert.ok(decisions.some((item) => item.kind === "offer"));
});

test("week finance reads the agency ledger without changing it", () => {
  const finance = getWeekFinance(createInitialSave());
  assert.equal(finance.incomeEgp, 0);
  assert.equal(finance.expensesEgp, 0);
  assert.equal(finance.netEgp, 0);
  assert.equal(finance.commissionReceivableEur, 0);
});

test("market filters combine position, age, stars and sorting", () => {
  const players = [
    { ...PLAYER, id: "a", age: 19, position: "هجوم" },
    { ...PLAYER, id: "b", age: 30, position: "دفاع", rating: 60, potential: 65 },
    { ...PLAYER, id: "c", age: 25, position: "وسط", rating: 80, potential: 88 }
  ];
  assert.equal(filterMarketPlayers(players, { position: "هجوم" }).length, 1);
  assert.equal(filterMarketPlayers(players, { ageBand: "u21" }).length, 1);
  assert.equal(filterMarketPlayers(players, { minStars: 5 }).length, 2);
  assert.equal(sortMarketPlayers(players, "youngest")[0].id, "a");
  assert.equal(sortMarketPlayers(players, "potential")[0].id, "c");
  assert.equal(getMarketOffers(createInitialSave(), players).length, 0);
});

test("negotiation starts from the club counter-offer and measures collapse risk", () => {
  const offer = {
    id: "o1", playerId: PLAYER.id, playerName: PLAYER.name, toClubName: "نادي الهلال",
    type: "permanent", status: "countered", round: 2, expiresDate: "2026-08-01",
    terms: { feeEur: 1000000, weeklyWageEur: 5000, contractYears: 3 },
    counterOffer: { feeEur: 800000, weeklyWageEur: 4500, contractYears: 3 }
  };
  const neg = createNegotiation(offer, PLAYER);
  assert.equal(neg.round, 2);
  assert.equal(neg.clubWageEur, 4500);
  assert.equal(neg.clubFeeEur, 800000);
  const calm = getCollapseRisk(neg);
  assert.equal(calm.level, "low");
  const risky = getCollapseRisk({ ...neg, weeklyWageEur: 6000, feeEur: 1000000, role: "أساسي" });
  assert.equal(risky.level, "high");
  assert.ok(risky.reasons.length >= 2);
  const terms = buildCounterTerms({ ...neg, weeklyWageEur: 5200, feeEur: 900000, contractYears: 4, sellOnPct: 10, role: "أساسي" });
  assert.equal(terms.feeEur, 900000);
  assert.equal(terms.contractYears, 4);
  assert.equal(terms.weeklyWageEur, 5200);
  assert.equal(terms.sellOnPct, 10);
  const next = applyNegotiationCounter(neg, { role: "أساسي", contractYears: 4, weeklyWageEur: 5200, feeEur: 900000 });
  assert.equal(next.round, 3);
  assert.equal(next.log.length, 2);
  assert.ok(next.round <= WAKIL_NEGOTIATION_MAX_ROUNDS);
});

test("calendar data covers season progress, expiring contracts and archives", () => {
  const data = getCalendarData(createInitialSave(), [PLAYER]);
  assert.equal(data.season, 1);
  assert.equal(data.week, 1);
  assert.equal(data.seasonProgressPct, 0);
  assert.ok(Array.isArray(data.upcoming));
  assert.ok(Array.isArray(data.contractsExpiring));
  assert.ok(Array.isArray(data.archives));
  assert.equal(typeof data.transferWindow.activeCount, "number");
});

test("agency level and staff effects are derived from clients, balance and roles", () => {
  const fresh = getAgencyLevel(createInitialSave());
  assert.equal(fresh.level, 1);
  assert.equal(fresh.title, "محلية");
  assert.equal(fresh.clientCap, 3);
  const save = createInitialSave();
  save.agency.clients = ["a", "b", "c"];
  save.agency.balance = 30000;
  const grown = getAgencyLevel(save);
  assert.equal(grown.level, 2);
  assert.equal(grown.clientCap, 5);
  const effects = getStaffEffects(save);
  assert.ok(effects.negotiator.includes("مفاوض تعاقدات"));
  assert.ok(effects.analyst.includes("محلل أداء"));
});

test("transfer room listings persist in their own storage key and replies are deterministic", () => {
  const storage = memStorage();
  assert.deepEqual(readTransferRoomListings(storage), []);
  const listing = {
    id: "transfer-room-1-demo-yassin-adel",
    playerId: PLAYER.id,
    clubIds: ["club-1", "club-2"],
    status: "pending",
    createdDate: "2026-07-01",
    responses: []
  };
  assert.equal(writeTransferRoomListings([listing], storage), true);
  assert.equal(storage.getItem(TRANSFER_ROOM_KEY), JSON.stringify([listing]));
  assert.deepEqual(readTransferRoomListings(storage), [listing]);
  const first = resolveTransferRoomResponses(listing, [PLAYER]);
  const second = resolveTransferRoomResponses(listing, [PLAYER]);
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  assert.ok(first.every((response) => typeof response.interested === "boolean"));
  const fresh = createTransferRoomListing(createInitialSave(), PLAYER.id, ["club-1", "club-2", "club-3", "club-4"]);
  assert.equal(fresh.clubIds.length, 3);
  assert.equal(fresh.status, "pending");
  assert.equal(fresh.playerId, PLAYER.id);
});
