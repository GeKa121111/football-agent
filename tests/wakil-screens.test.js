// اختبارات المرحلة 2 من وكيل — الدوال النقية في src/ui/wakil-screens.js.
// دوال العرض (DOM) تُغطى باختبارات المتصفح؛ هنا المنطق فقط.
import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave } from "../src/core/storage.js";
import { WORLD_DATABASE } from "../src/data/world-database.js";
import { createInitialPlayerDevelopmentState } from "../src/engines/player-development.js";
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
  migrateTransferRoomToSave,
  getNextFixtureForPlayer,
  getMediaPrediction,
  getAgentMatchAdvice,
  setMatchDecision,
  getMatchDecision,
  clearMatchDecisions,
  getPreMatchBrief,
  recommendTrainingFocus,
  recommendLoanOrStay,
  getDevelopmentHub,
  applyTrainingPlan,
  getStarPlanRewards,
  getStarPlanSummary,
  getCareerBoard,
  getSeasonReview,
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

test("pre-match hub finds the player's next fixture with opponent and media prediction", () => {
  const clubA = WORLD_DATABASE.clubs[0].id;
  const clubB = WORLD_DATABASE.clubs[1].id;
  const player = { ...PLAYER, clubId: clubA };
  const save = createInitialSave();
  save.world.currentDate = "2026-07-01";
  save.world.football.fixtures = [
    { id: "fx-next", date: "2026-07-10", homeClubId: clubA, awayClubId: clubB, competitionName: "الدوري", round: 2, status: "scheduled" },
    { id: "fx-past", date: "2026-06-28", homeClubId: clubB, awayClubId: clubA, competitionName: "الكأس", round: 1, status: "played" }
  ];
  const next = getNextFixtureForPlayer(player, save);
  assert.equal(next.fixtureId, "fx-next");
  assert.equal(next.opponentId, clubB);
  assert.equal(next.isHome, true);
  assert.equal(next.daysUntil, 9);
  assert.equal(next.competitionName, "الدوري");
  assert.ok(typeof getMediaPrediction(next) === "string" && getMediaPrediction(next).length > 0);
  assert.ok(typeof getAgentMatchAdvice(player, next) === "string");
  const brief = getPreMatchBrief(player, save);
  assert.equal(brief.hasFixture, true);
  assert.equal(brief.next.fixtureId, "fx-next");
  assert.equal(brief.decision, null);
  // بلا مباريات مجدولة → لا إحاطة.
  save.world.football.fixtures = [];
  assert.equal(getPreMatchBrief(player, save).hasFixture, false);
  assert.equal(getNextFixtureForPlayer(player, save), null);
});

test("match decisions are session-only, validated, and never persisted", () => {
  clearMatchDecisions();
  assert.equal(getMatchDecision(PLAYER.id), null);
  assert.equal(setMatchDecision(PLAYER.id, "confident"), true);
  assert.equal(getMatchDecision(PLAYER.id), "confident");
  assert.equal(setMatchDecision(PLAYER.id, "nonsense"), false);
  assert.equal(getMatchDecision(PLAYER.id), "confident");
  clearMatchDecisions();
  assert.equal(getMatchDecision(PLAYER.id), null);
});

test("development hub recommends a focus from the weakest skill and a loan verdict by age and minutes", () => {
  const player = { ...PLAYER, clubId: WORLD_DATABASE.clubs[0].id };
  const devState = createInitialPlayerDevelopmentState([player]);
  const record = devState.players[0];
  record.skills.finishing = 40;
  record.skills.passing = 80;
  const save = createInitialSave();
  save.world.football.playerDevelopment = devState;
  const hub = getDevelopmentHub(player, save);
  assert.equal(hub.hasRecord, true);
  assert.equal(hub.currentFocus, "balanced");
  assert.equal(recommendTrainingFocus(player, record), "attacking");
  assert.equal(hub.recommendedFocus, "attacking");
  assert.equal(hub.focusChanged, true);
  // حارس المرمى دائمًا حراسة.
  const keeper = { ...PLAYER, id: "keeper-1", role: "حارس" };
  assert.equal(recommendTrainingFocus(keeper, record), "goalkeeping");
  // إعارة للصغير قليل المشاركات، بقاء للأساسي.
  assert.equal(recommendLoanOrStay({ age: 19, seasonPerformance: { appearances: 3 } }).verdict, "loan");
  assert.equal(recommendLoanOrStay({ age: 24, seasonPerformance: { appearances: 25 } }).verdict, "stay");
  assert.equal(recommendLoanOrStay({ age: 23, rating: 78, seasonPerformance: { appearances: 8 } }).verdict, "stay-ask");
});

test("applyTrainingPlan writes a new save through the engine and never mutates the original", () => {
  const player = { ...PLAYER, clubId: WORLD_DATABASE.clubs[0].id };
  const save = createInitialSave();
  save.world.football.playerDevelopment = createInitialPlayerDevelopmentState([player]);
  const result = applyTrainingPlan(save, player.id, "attacking", "intense");
  assert.equal(result.changed, true);
  assert.equal(result.save.world.football.playerDevelopment.players[0].trainingFocus, "attacking");
  assert.equal(result.save.world.football.playerDevelopment.players[0].trainingIntensity, "intense");
  assert.equal(save.world.football.playerDevelopment.players[0].trainingFocus, "balanced");
  assert.equal(applyTrainingPlan(save, player.id, "not-a-focus").changed, false);
  const noDev = createInitialSave();
  delete noDev.world.football.playerDevelopment;
  assert.equal(applyTrainingPlan(noDev, player.id, "attacking").changed, false);
});

test("star plan rewards appear only for completed goals", () => {
  const scorer = { ...PLAYER, seasonPerformance: { appearances: 30, goals: 12, assists: 6 } };
  const rewards = getStarPlanRewards(scorer);
  assert.ok(rewards.every((goal) => goal.done));
  assert.ok(rewards.every((goal) => typeof goal.reward === "string" && goal.reward.length > 0));
  const summary = getStarPlanSummary(scorer);
  assert.equal(summary.allDone, true);
  assert.equal(summary.done, 3);
  const rookie = { ...PLAYER, seasonPerformance: { appearances: 2, goals: 0, assists: 0 } };
  assert.ok(getStarPlanRewards(rookie).every((goal) => goal.reward === null));
  assert.equal(getStarPlanSummary(rookie).done, 0);
});

test("career board lists clients by potential with star plan and trust", () => {
  const save = createInitialSave();
  const second = { ...PLAYER, id: "demo-second", name: "لاعب ثانٍ", potential: 90, rating: 70 };
  save.agency.clients = [PLAYER.id, second.id];
  save.agency.representation = { contracts: [] };
  const board = getCareerBoard(save, [PLAYER, second]);
  assert.equal(board.length, 2);
  assert.equal(board[0].playerId, second.id);
  assert.equal(board[0].starPlanTotal, 3);
  assert.ok(["منخفض", "متوسط", "عالي"].includes(board[0].departureRisk));
});

test("season review summarizes the previous season, or says it has not ended yet", () => {
  const save = createInitialSave();
  save.career.season = 1;
  const first = getSeasonReview(save, [PLAYER]);
  assert.equal(first.hasLastSeason, false);
  save.career.season = 2;
  save.world.football.archives = [
    { season: 1, competitionName: "الدوري", championName: "النادي أ" },
    { season: 2, competitionName: "الدوري", championName: "النادي ب" }
  ];
  save.agency.clients = [PLAYER.id];
  const review = getSeasonReview(save, [PLAYER]);
  assert.equal(review.hasLastSeason, true);
  assert.equal(review.season, 1);
  assert.equal(review.archives.length, 1);
  assert.equal(review.archives[0].championName, "النادي أ");
  assert.equal(review.bestClientName, PLAYER.name);
  assert.equal(review.goalsTotal, 3);
});

test("transfer room migrates once from the legacy key into the save (v9 safe)", () => {
  const storage = memStorage();
  const listing = {
    id: "transfer-room-1-demo-yassin-adel",
    playerId: PLAYER.id,
    clubIds: ["club-1"],
    status: "pending",
    createdDate: "2026-07-01",
    responses: []
  };
  writeTransferRoomListings([listing], storage);
  const save = createInitialSave();
  assert.equal(save.world.transferRoom, undefined);
  const result = migrateTransferRoomToSave(save, storage);
  assert.equal(result.migrated, true);
  assert.equal(result.count, 1);
  assert.deepEqual(save.world.transferRoom, [listing]);
  assert.equal(storage.getItem(TRANSFER_ROOM_KEY), null);
  // القراءة الآن من الحفظ أولًا.
  assert.deepEqual(readTransferRoomListings(save), [listing]);
  // الترحيل مرة ثانية لا يكرر.
  assert.equal(migrateTransferRoomToSave(save, storage).migrated, false);
  // الكتابة في الحفظ تمسح المفتاح القديم.
  const second = { ...listing, id: "transfer-room-2-demo-yassin-adel" };
  assert.equal(writeTransferRoomListings([listing, second], save, storage), true);
  assert.equal(save.world.transferRoom.length, 2);
  assert.equal(storage.getItem(TRANSFER_ROOM_KEY), null);
  // حفظ بلا قوائم قديمة: لا ترحيل ولا كسر.
  const emptySave = createInitialSave();
  assert.equal(migrateTransferRoomToSave(emptySave, memStorage()).migrated, false);
  assert.equal(emptySave.world.transferRoom, undefined);
});
