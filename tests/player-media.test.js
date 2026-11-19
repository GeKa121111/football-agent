import test from "node:test";
import assert from "node:assert/strict";
import { getPlayerMediaProfile } from "../src/engines/player-media.js";

test("starts with a restrained reputation when no verified media achievements exist", () => {
  const profile = getPlayerMediaProfile({ id: "player-1" });
  assert.equal(profile.score, 20);
  assert.equal(profile.tierKey, "limited");
  assert.equal(profile.clubInterestBonus, 0);
  assert.equal(profile.localHonorsCount, 0);
  assert.equal(profile.internationalHonorsCount, 0);
  assert.equal(profile.internationalAppearances, 0);
  assert.deepEqual(profile.headlines, []);
});

test("rewards distinct verified domestic awards and prevents duplicate award inflation", () => {
  const player = {
    honors: [
      { competitionId: "league-1", competitionName: "الدوري المحلي", season: 2, awardType: "bestPlayer" },
      { competitionId: "league-1", competitionName: "الدوري المحلي", season: 2, awardType: "bestPlayer" },
      { competitionId: "cup-1", competitionName: "الكأس", season: 2, awardType: "topScorer" }
    ]
  };
  const profile = getPlayerMediaProfile(player);
  assert.equal(profile.localHonorsCount, 2);
  assert.equal(profile.score, 33);
  assert.equal(profile.headlines.length, 2);
  assert.ok(profile.headlines.some((item) => item.title.includes("أفضل لاعب")));
});

test("combines international awards and appearances into a bounded profile", () => {
  const player = {
    internationalTournamentHonors: [
      { tournamentId: "continental-1", competitionName: "بطولة قارية", season: 3, awardType: "bestPlayer" },
      { tournamentId: "world-cup-1", competitionName: "كأس العالم", season: 4, awardType: "topScorer" }
    ],
    internationalFriendlyStats: { appearances: 7 },
    internationalTournamentStats: [
      { tournamentId: "continental-1", tournamentName: "بطولة قارية", season: 3, appearances: 5 },
      { tournamentId: "continental-1", tournamentName: "بطولة قارية", season: 3, appearances: 5 },
      { tournamentId: "world-cup-1", tournamentName: "كأس العالم", season: 4, appearances: 4 }
    ]
  };
  const profile = getPlayerMediaProfile(player);
  assert.equal(profile.internationalHonorsCount, 2);
  assert.equal(profile.internationalAppearances, 16);
  assert.equal(profile.score, 43);
  assert.equal(profile.clubInterestBonus, 0);
  assert.ok(profile.headlines.some((item) => item.title.includes("إنجاز دولي")));
  assert.ok(profile.headlines.some((item) => item.title.includes("16 مشاركة دولية")));
});

test("recent form adds a limited signal without dominating media reputation", () => {
  const profile = getPlayerMediaProfile({
    seasonPerformance: { appearances: 12, averageMatchRating: 7.8 }
  });
  assert.equal(profile.score, 25);
  assert.equal(profile.recentFormRating, 7.8);
  assert.equal(profile.headlines.length, 1);
  assert.ok(profile.headlines[0].title.includes("7.80/10"));
  assert.equal(profile.clubInterestBonus, 0);
});

test("reputation and club-interest bonus remain capped for high-volume histories", () => {
  const honors = Array.from({ length: 20 }, (_, index) => ({
    competitionId: "league-" + index,
    competitionName: "Competition " + index,
    season: index + 1,
    awardType: "bestPlayer"
  }));
  const internationalTournamentHonors = Array.from({ length: 20 }, (_, index) => ({
    tournamentId: "tournament-" + index,
    competitionName: "Tournament " + index,
    season: index + 1,
    awardType: "bestPlayer"
  }));
  const profile = getPlayerMediaProfile({
    honors,
    internationalTournamentHonors,
    internationalFriendlyStats: { appearances: 80 },
    seasonPerformance: { appearances: 40, averageMatchRating: 9.2 }
  });
  assert.equal(profile.score, 90);
  assert.equal(profile.tierKey, "star");
  assert.equal(profile.clubInterestBonus, 3);
  assert.ok(profile.score <= 100);
});
