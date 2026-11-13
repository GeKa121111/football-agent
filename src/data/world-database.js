// Curated fictional player seed for Phase 3. Club names are reference entities; player identities are fictional.
import { createPortraitAssignment, validatePortraitAssignments } from "./player-portrait-catalog.js";
import { validateCompetitionDefinition } from "./competition-rules.js";
// Club and competition labels are reference entities; every player profile is fictional.
// This is a compact prototype database, not a live or complete global roster feed.

const COUNTRIES = [
  { id: "country-eg", code: "EG", nameAr: "مصر", nameEn: "Egypt", confederation: "CAF" },
  { id: "country-ma", code: "MA", nameAr: "المغرب", nameEn: "Morocco", confederation: "CAF" },
  { id: "country-tn", code: "TN", nameAr: "تونس", nameEn: "Tunisia", confederation: "CAF" },
  { id: "country-gb", code: "GB", nameAr: "إنجلترا", nameEn: "England", confederation: "UEFA" },
  { id: "country-es", code: "ES", nameAr: "إسبانيا", nameEn: "Spain", confederation: "UEFA" },
  { id: "country-de", code: "DE", nameAr: "ألمانيا", nameEn: "Germany", confederation: "UEFA" },
  { id: "country-fr", code: "FR", nameAr: "فرنسا", nameEn: "France", confederation: "UEFA" },
  { id: "country-it", code: "IT", nameAr: "إيطاليا", nameEn: "Italy", confederation: "UEFA" },
  { id: "country-nl", code: "NL", nameAr: "هولندا", nameEn: "Netherlands", confederation: "UEFA" },
  { id: "country-pt", code: "PT", nameAr: "البرتغال", nameEn: "Portugal", confederation: "UEFA" },
  { id: "country-br", code: "BR", nameAr: "البرازيل", nameEn: "Brazil", confederation: "CONMEBOL" },
  { id: "country-ar", code: "AR", nameAr: "الأرجنتين", nameEn: "Argentina", confederation: "CONMEBOL" }
];

const LEAGUES = [
  { id: "league-eg-premier", nameAr: "الدوري المصري الممتاز", nameEn: "Egyptian Premier League", countryId: "country-eg", tier: 1 },
  { id: "league-ma-botola", nameAr: "البطولة الاحترافية", nameEn: "Botola Pro", countryId: "country-ma", tier: 1 },
  { id: "league-tn-ligue1", nameAr: "الرابطة التونسية المحترفة الأولى", nameEn: "Tunisian Ligue 1", countryId: "country-tn", tier: 1 },
  { id: "league-eng-premier", nameAr: "الدوري الإنجليزي الممتاز", nameEn: "Premier League", countryId: "country-gb", tier: 1 },
  { id: "league-es-laliga", nameAr: "الدوري الإسباني", nameEn: "LaLiga", countryId: "country-es", tier: 1 },
  { id: "league-de-bundesliga", nameAr: "الدوري الألماني", nameEn: "Bundesliga", countryId: "country-de", tier: 1 },
  { id: "league-fr-ligue1", nameAr: "الدوري الفرنسي", nameEn: "Ligue 1", countryId: "country-fr", tier: 1 },
  { id: "league-it-seriea", nameAr: "الدوري الإيطالي", nameEn: "Serie A", countryId: "country-it", tier: 1 },
  { id: "league-nl-eredivisie", nameAr: "الدوري الهولندي", nameEn: "Eredivisie", countryId: "country-nl", tier: 1 },
  { id: "league-pt-primeira", nameAr: "الدوري البرتغالي", nameEn: "Primeira Liga", countryId: "country-pt", tier: 1 },
  { id: "league-br-serie-a", nameAr: "الدوري البرازيلي", nameEn: "Brasileirão", countryId: "country-br", tier: 1 },
  { id: "league-ar-primera", nameAr: "الدوري الأرجنتيني", nameEn: "Primera División", countryId: "country-ar", tier: 1 }
];

const CLUBS = [
  { id: "club-al-ahly", nameAr: "الأهلي", nameEn: "Al Ahly", countryId: "country-eg", leagueId: "league-eg-premier", shortName: "الأهلي", simulationProfile: 88, primaryColor: "#c92536" },
  { id: "club-zamalek", nameAr: "الزمالك", nameEn: "Zamalek", countryId: "country-eg", leagueId: "league-eg-premier", shortName: "الزمالك", simulationProfile: 84, primaryColor: "#f1f1f1" },
  { id: "club-wydad", nameAr: "الوداد الرياضي", nameEn: "Wydad AC", countryId: "country-ma", leagueId: "league-ma-botola", shortName: "الوداد", simulationProfile: 82, primaryColor: "#c9293d" },
  { id: "club-raja", nameAr: "الرجاء الرياضي", nameEn: "Raja CA", countryId: "country-ma", leagueId: "league-ma-botola", shortName: "الرجاء", simulationProfile: 82, primaryColor: "#168c55" },
  { id: "club-etoile", nameAr: "النجم الساحلي", nameEn: "Étoile du Sahel", countryId: "country-tn", leagueId: "league-tn-ligue1", shortName: "النجم", simulationProfile: 76, primaryColor: "#c52b35" },
  { id: "club-es-tunis", nameAr: "الترجي الرياضي", nameEn: "Espérance de Tunis", countryId: "country-tn", leagueId: "league-tn-ligue1", shortName: "الترجي", simulationProfile: 83, primaryColor: "#d72b38" },
  { id: "club-arsenal", nameAr: "أرسنال", nameEn: "Arsenal", countryId: "country-gb", leagueId: "league-eng-premier", shortName: "أرسنال", simulationProfile: 90, primaryColor: "#d8293f" },
  { id: "club-liverpool", nameAr: "ليفربول", nameEn: "Liverpool", countryId: "country-gb", leagueId: "league-eng-premier", shortName: "ليفربول", simulationProfile: 91, primaryColor: "#c8102e" },
  { id: "club-real-madrid", nameAr: "ريال مدريد", nameEn: "Real Madrid", countryId: "country-es", leagueId: "league-es-laliga", shortName: "ريال مدريد", simulationProfile: 94, primaryColor: "#eeeef4" },
  { id: "club-barcelona", nameAr: "برشلونة", nameEn: "FC Barcelona", countryId: "country-es", leagueId: "league-es-laliga", shortName: "برشلونة", simulationProfile: 91, primaryColor: "#a52a52" },
  { id: "club-bayern", nameAr: "بايرن ميونخ", nameEn: "Bayern Munich", countryId: "country-de", leagueId: "league-de-bundesliga", shortName: "بايرن", simulationProfile: 93, primaryColor: "#d6293c" },
  { id: "club-dortmund", nameAr: "بوروسيا دورتموند", nameEn: "Borussia Dortmund", countryId: "country-de", leagueId: "league-de-bundesliga", shortName: "دورتموند", simulationProfile: 86, primaryColor: "#f2dc24" },
  { id: "club-psg", nameAr: "باريس سان جيرمان", nameEn: "Paris Saint-Germain", countryId: "country-fr", leagueId: "league-fr-ligue1", shortName: "باريس", simulationProfile: 92, primaryColor: "#244b83" },
  { id: "club-marseille", nameAr: "أولمبيك مارسيليا", nameEn: "Olympique Marseille", countryId: "country-fr", leagueId: "league-fr-ligue1", shortName: "مارسيليا", simulationProfile: 82, primaryColor: "#e9edf5" },
  { id: "club-inter", nameAr: "إنتر ميلان", nameEn: "Inter", countryId: "country-it", leagueId: "league-it-seriea", shortName: "إنتر", simulationProfile: 91, primaryColor: "#19549b" },
  { id: "club-juventus", nameAr: "يوفنتوس", nameEn: "Juventus", countryId: "country-it", leagueId: "league-it-seriea", shortName: "يوفنتوس", simulationProfile: 89, primaryColor: "#eeeeef" },
  { id: "club-ajax", nameAr: "أياكس", nameEn: "Ajax", countryId: "country-nl", leagueId: "league-nl-eredivisie", shortName: "أياكس", simulationProfile: 82, primaryColor: "#c92f3c" },
  { id: "club-psv", nameAr: "آيندهوفن", nameEn: "PSV Eindhoven", countryId: "country-nl", leagueId: "league-nl-eredivisie", shortName: "PSV", simulationProfile: 82, primaryColor: "#d32f43" },
  { id: "club-benfica", nameAr: "بنفيكا", nameEn: "Benfica", countryId: "country-pt", leagueId: "league-pt-primeira", shortName: "بنفيكا", simulationProfile: 85, primaryColor: "#c92535" },
  { id: "club-porto", nameAr: "بورتو", nameEn: "Porto", countryId: "country-pt", leagueId: "league-pt-primeira", shortName: "بورتو", simulationProfile: 84, primaryColor: "#2863a0" },
  { id: "club-flamengo", nameAr: "فلامنغو", nameEn: "Flamengo", countryId: "country-br", leagueId: "league-br-serie-a", shortName: "فلامنغو", simulationProfile: 86, primaryColor: "#c92b38" },
  { id: "club-palmeiras", nameAr: "بالميراس", nameEn: "Palmeiras", countryId: "country-br", leagueId: "league-br-serie-a", shortName: "بالميراس", simulationProfile: 85, primaryColor: "#16724a" },
  { id: "club-river", nameAr: "ريفر بليت", nameEn: "River Plate", countryId: "country-ar", leagueId: "league-ar-primera", shortName: "ريفر", simulationProfile: 86, primaryColor: "#eeeeef" },
  { id: "club-boca", nameAr: "بوكا جونيورز", nameEn: "Boca Juniors", countryId: "country-ar", leagueId: "league-ar-primera", shortName: "بوكا", simulationProfile: 86, primaryColor: "#24539b" }
];

const COMPETITIONS = [
  { id: "competition-eg-premier", nameAr: "الدوري المصري الممتاز", nameEn: "Egyptian Premier League", type: "league", countryId: "country-eg", leagueId: "league-eg-premier", season: "2026-2027", clubIds: ["club-al-ahly", "club-zamalek"] },
  { id: "competition-ma-botola", nameAr: "البطولة الاحترافية", nameEn: "Botola Pro", type: "league", countryId: "country-ma", leagueId: "league-ma-botola", season: "2026-2027", clubIds: ["club-wydad", "club-raja"] },
  { id: "competition-tn-ligue1", nameAr: "الرابطة التونسية المحترفة الأولى", nameEn: "Tunisian Ligue 1", type: "league", countryId: "country-tn", leagueId: "league-tn-ligue1", season: "2026-2027", clubIds: ["club-etoile", "club-es-tunis"] },
  { id: "competition-eng-premier", nameAr: "الدوري الإنجليزي الممتاز", nameEn: "Premier League", type: "league", countryId: "country-gb", leagueId: "league-eng-premier", season: "2026-2027", clubIds: ["club-arsenal", "club-liverpool"] },
  { id: "competition-es-laliga", nameAr: "الدوري الإسباني", nameEn: "LaLiga", type: "league", countryId: "country-es", leagueId: "league-es-laliga", season: "2026-2027", clubIds: ["club-real-madrid", "club-barcelona"] },
  { id: "competition-de-bundesliga", nameAr: "الدوري الألماني", nameEn: "Bundesliga", type: "league", countryId: "country-de", leagueId: "league-de-bundesliga", season: "2026-2027", clubIds: ["club-bayern", "club-dortmund"] },
  { id: "competition-fr-ligue1", nameAr: "الدوري الفرنسي", nameEn: "Ligue 1", type: "league", countryId: "country-fr", leagueId: "league-fr-ligue1", season: "2026-2027", clubIds: ["club-psg", "club-marseille"] },
  { id: "competition-it-seriea", nameAr: "الدوري الإيطالي", nameEn: "Serie A", type: "league", countryId: "country-it", leagueId: "league-it-seriea", season: "2026-2027", clubIds: ["club-inter", "club-juventus"] },
  { id: "competition-nl-eredivisie", nameAr: "الدوري الهولندي", nameEn: "Eredivisie", type: "league", countryId: "country-nl", leagueId: "league-nl-eredivisie", season: "2026-2027", clubIds: ["club-ajax", "club-psv"] },
  { id: "competition-pt-primeira", nameAr: "الدوري البرتغالي", nameEn: "Primeira Liga", type: "league", countryId: "country-pt", leagueId: "league-pt-primeira", season: "2026-2027", clubIds: ["club-benfica", "club-porto"] },
  { id: "competition-br-serie-a", nameAr: "الدوري البرازيلي", nameEn: "Brasileirão", type: "league", countryId: "country-br", leagueId: "league-br-serie-a", season: "2026-2027", clubIds: ["club-flamengo", "club-palmeiras"] },
  { id: "competition-ar-primera", nameAr: "الدوري الأرجنتيني", nameEn: "Primera División", type: "league", countryId: "country-ar", leagueId: "league-ar-primera", season: "2026-2027", clubIds: ["club-river", "club-boca"] },
  { id: "competition-caf-champions", nameAr: "دوري أبطال أفريقيا", nameEn: "CAF Champions League", type: "continental", countryId: null, leagueId: null, season: "2026-2027", groupCount: 2, qualifiersPerGroup: 2, clubIds: ["club-al-ahly", "club-zamalek", "club-wydad", "club-raja", "club-etoile", "club-es-tunis"] },
  { id: "competition-uefa-champions", nameAr: "دوري أبطال أوروبا", nameEn: "UEFA Champions League", type: "continental", countryId: null, leagueId: null, season: "2026-2027", groupCount: 2, qualifiersPerGroup: 2, clubIds: ["club-arsenal", "club-liverpool", "club-real-madrid", "club-barcelona", "club-bayern", "club-dortmund", "club-psg", "club-marseille", "club-inter", "club-juventus", "club-ajax", "club-psv", "club-benfica", "club-porto"] },
  { id: "competition-conmebol-libertadores", nameAr: "كوبا ليبرتادوريس", nameEn: "CONMEBOL Libertadores", type: "continental", countryId: null, leagueId: null, season: "2026-2027", groupCount: 2, qualifiersPerGroup: 2, clubIds: ["club-flamengo", "club-palmeiras", "club-river", "club-boca"] },
  { id: "competition-club-world-cup", nameAr: "كأس العالم للأندية", nameEn: "Club World Cup", type: "cup", format: "knockout", countryId: null, leagueId: null, season: "2026-2027", clubIds: ["club-al-ahly", "club-wydad", "club-liverpool", "club-real-madrid", "club-bayern", "club-psg", "club-flamengo", "club-river"] }
];

const PLAYER_SEEDS = [
  { id: "demo-yassin-adel", name: "ياسين عادل", age: 19, countryId: "country-eg", clubId: "club-al-ahly", position: "جناح أيسر", role: "هجوم", rating: 72, potential: 88, marketValueEur: 1200000, status: "موهبة صاعدة", shirtNumber: 11, contractUntil: "2028-06-30", foot: "right" , discoverySourceIds: ["academy","youth-tournament"]},
  { id: "demo-ziad-fawzy", name: "زياد فوزي", age: 20, countryId: "country-eg", clubId: "club-zamalek", position: "وسط هجومي", role: "وسط", rating: 75, potential: 90, marketValueEur: 2400000, status: "تحت المراقبة", shirtNumber: 10, contractUntil: "2029-06-30", foot: "left" , discoverySourceIds: ["club-network","agent-referral"]},
  { id: "demo-omar-nabil", name: "عمر نبيل", age: 18, countryId: "country-ma", clubId: "club-wydad", position: "مهاجم", role: "هجوم", rating: 69, potential: 87, marketValueEur: 850000, status: "متاح للكشف", shirtNumber: 9, contractUntil: "2028-06-30", foot: "right" , discoverySourceIds: ["academy","youth-tournament"]},
  { id: "demo-karim-tarek", name: "كريم طارق", age: 22, countryId: "country-tn", clubId: "club-etoile", position: "قلب دفاع", role: "دفاع", rating: 76, potential: 84, marketValueEur: 1900000, status: "جاهز للتفاوض", shirtNumber: 4, contractUntil: "2027-06-30", foot: "right" , discoverySourceIds: ["club-network","agent-referral"]},
  { id: "seed-liam-carter", name: "Liam Carter", age: 19, countryId: "country-gb", clubId: "club-arsenal", position: "وسط مركزي", role: "وسط", rating: 71, potential: 86, marketValueEur: 1600000, status: "موهبة صاعدة", shirtNumber: 8, contractUntil: "2029-06-30", foot: "right" , discoverySourceIds: ["academy","youth-tournament"]},
  { id: "seed-noah-bennett", name: "Noah Bennett", age: 21, countryId: "country-gb", clubId: "club-liverpool", position: "ظهير أيمن", role: "دفاع", rating: 74, potential: 85, marketValueEur: 2100000, status: "تحت المراقبة", shirtNumber: 2, contractUntil: "2028-06-30", foot: "right" , discoverySourceIds: ["club-network","agent-referral"]},
  { id: "seed-iker-navarro", name: "Iker Navarro", age: 20, countryId: "country-es", clubId: "club-real-madrid", position: "قلب دفاع", role: "دفاع", rating: 73, potential: 88, marketValueEur: 2500000, status: "موهبة صاعدة", shirtNumber: 5, contractUntil: "2029-06-30", foot: "right" , discoverySourceIds: ["academy","youth-tournament"]},
  { id: "seed-adrian-vega", name: "Adrián Vega", age: 18, countryId: "country-es", clubId: "club-barcelona", position: "وسط دفاعي", role: "وسط", rating: 70, potential: 89, marketValueEur: 1800000, status: "متاح للكشف", shirtNumber: 6, contractUntil: "2029-06-30", foot: "left" , discoverySourceIds: ["academy","youth-tournament"]},
  { id: "seed-leon-fischer", name: "Leon Fischer", age: 20, countryId: "country-de", clubId: "club-bayern", position: "حارس مرمى", role: "حراسة", rating: 72, potential: 86, marketValueEur: 1300000, status: "تحت المراقبة", shirtNumber: 1, contractUntil: "2028-06-30", foot: "right" , discoverySourceIds: ["club-network","agent-referral"]},
  { id: "seed-jonas-weber", name: "Jonas Weber", age: 19, countryId: "country-de", clubId: "club-dortmund", position: "قلب دفاع", role: "دفاع", rating: 71, potential: 87, marketValueEur: 1500000, status: "موهبة صاعدة", shirtNumber: 15, contractUntil: "2029-06-30", foot: "left" , discoverySourceIds: ["academy","youth-tournament"]},
  { id: "seed-lucas-moreau", name: "Lucas Moreau", age: 21, countryId: "country-fr", clubId: "club-psg", position: "ظهير أيسر", role: "دفاع", rating: 75, potential: 86, marketValueEur: 2800000, status: "جاهز للتطور", shirtNumber: 3, contractUntil: "2028-06-30", foot: "left" , discoverySourceIds: ["club-network","agent-referral"]},
  { id: "seed-hugo-laurent", name: "Hugo Laurent", age: 18, countryId: "country-fr", clubId: "club-marseille", position: "وسط مركزي", role: "وسط", rating: 68, potential: 85, marketValueEur: 950000, status: "متاح للكشف", shirtNumber: 14, contractUntil: "2029-06-30", foot: "right" , discoverySourceIds: ["academy","youth-tournament"]},
  { id: "seed-matteo-rinaldi", name: "Matteo Rinaldi", age: 20, countryId: "country-it", clubId: "club-inter", position: "ظهير أيمن", role: "دفاع", rating: 74, potential: 87, marketValueEur: 2200000, status: "تحت المراقبة", shirtNumber: 7, contractUntil: "2028-06-30", foot: "right" , discoverySourceIds: ["club-network","agent-referral"]},
  { id: "seed-luca-bianchi", name: "Luca Bianchi", age: 19, countryId: "country-it", clubId: "club-juventus", position: "حارس مرمى", role: "حراسة", rating: 70, potential: 84, marketValueEur: 1100000, status: "موهبة صاعدة", shirtNumber: 22, contractUntil: "2029-06-30", foot: "right" , discoverySourceIds: ["academy","youth-tournament"]},
  { id: "seed-anis-ben-salem", name: "أنيس بن سالم", age: 20, countryId: "country-tn", clubId: "club-es-tunis", position: "وسط هجومي", role: "وسط", rating: 73, potential: 86, marketValueEur: 1750000, status: "تحت المراقبة", shirtNumber: 18, contractUntil: "2028-06-30", foot: "left" , discoverySourceIds: ["club-network","agent-referral"]},
  { id: "seed-youssef-amrani", name: "يوسف العمراني", age: 19, countryId: "country-ma", clubId: "club-raja", position: "قلب دفاع", role: "دفاع", rating: 72, potential: 85, marketValueEur: 1400000, status: "موهبة صاعدة", shirtNumber: 13, contractUntil: "2029-06-30", foot: "right" , discoverySourceIds: ["academy","youth-tournament"]},
  { id: "seed-eg-ahly-keeper", name: "مروان السيد", age: 19, countryId: "country-eg", clubId: "club-al-ahly", position: "حارس مرمى", role: "حراسة", rating: 68, potential: 85, marketValueEur: 700000, status: "موهبة صاعدة", shirtNumber: 31, contractUntil: "2029-06-30", foot: "right", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-eg-zamalek-defender", name: "آدم صبري", age: 18, countryId: "country-eg", clubId: "club-zamalek", position: "قلب دفاع", role: "دفاع", rating: 69, potential: 86, marketValueEur: 900000, status: "متاح للكشف", shirtNumber: 15, contractUntil: "2029-06-30", foot: "right", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-ma-wydad-midfielder", name: "أيوب الكتاني", age: 19, countryId: "country-ma", clubId: "club-wydad", position: "وسط دفاعي", role: "وسط", rating: 70, potential: 86, marketValueEur: 950000, status: "موهبة صاعدة", shirtNumber: 6, contractUntil: "2029-06-30", foot: "left", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-ma-raja-keeper", name: "حمزة الإدريسي", age: 21, countryId: "country-ma", clubId: "club-raja", position: "حارس مرمى", role: "حراسة", rating: 73, potential: 82, marketValueEur: 1200000, status: "تحت المراقبة", shirtNumber: 30, contractUntil: "2028-06-30", foot: "right", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-tn-etoile-striker", name: "سيف الدين بن عمر", age: 18, countryId: "country-tn", clubId: "club-etoile", position: "مهاجم", role: "هجوم", rating: 68, potential: 87, marketValueEur: 800000, status: "موهبة صاعدة", shirtNumber: 19, contractUntil: "2029-06-30", foot: "right", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-tn-tunis-keeper", name: "مالك الجبالي", age: 22, countryId: "country-tn", clubId: "club-es-tunis", position: "حارس مرمى", role: "حراسة", rating: 74, potential: 84, marketValueEur: 1600000, status: "جاهز للتطور", shirtNumber: 30, contractUntil: "2028-06-30", foot: "right", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-gb-arsenal-striker", name: "Oliver Hayes", age: 18, countryId: "country-gb", clubId: "club-arsenal", position: "مهاجم", role: "هجوم", rating: 70, potential: 88, marketValueEur: 2000000, status: "موهبة صاعدة", shirtNumber: 19, contractUntil: "2029-06-30", foot: "left", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-gb-liverpool-keeper", name: "Ethan Walsh", age: 20, countryId: "country-gb", clubId: "club-liverpool", position: "حارس مرمى", role: "حراسة", rating: 73, potential: 85, marketValueEur: 2300000, status: "تحت المراقبة", shirtNumber: 56, contractUntil: "2028-06-30", foot: "right", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-es-madrid-forward", name: "Diego Serrano", age: 19, countryId: "country-es", clubId: "club-real-madrid", position: "جناح أيمن", role: "هجوم", rating: 74, potential: 90, marketValueEur: 3100000, status: "موهبة صاعدة", shirtNumber: 27, contractUntil: "2029-06-30", foot: "left", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-es-barca-keeper", name: "Pau Vidal", age: 18, countryId: "country-es", clubId: "club-barcelona", position: "حارس مرمى", role: "حراسة", rating: 69, potential: 88, marketValueEur: 1700000, status: "متاح للكشف", shirtNumber: 13, contractUntil: "2029-06-30", foot: "right", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-de-bayern-midfielder", name: "Felix Hartmann", age: 19, countryId: "country-de", clubId: "club-bayern", position: "وسط هجومي", role: "وسط", rating: 72, potential: 87, marketValueEur: 2400000, status: "موهبة صاعدة", shirtNumber: 24, contractUntil: "2029-06-30", foot: "right", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-de-dortmund-striker", name: "Emil Krüger", age: 18, countryId: "country-de", clubId: "club-dortmund", position: "مهاجم", role: "هجوم", rating: 70, potential: 89, marketValueEur: 2200000, status: "متاح للكشف", shirtNumber: 27, contractUntil: "2029-06-30", foot: "left", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-fr-psg-forward", name: "Mathis Bernard", age: 20, countryId: "country-fr", clubId: "club-psg", position: "جناح أيسر", role: "هجوم", rating: 76, potential: 89, marketValueEur: 3400000, status: "جاهز للتطور", shirtNumber: 29, contractUntil: "2028-06-30", foot: "right", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-fr-marseille-keeper", name: "Noé Girard", age: 19, countryId: "country-fr", clubId: "club-marseille", position: "حارس مرمى", role: "حراسة", rating: 70, potential: 86, marketValueEur: 1400000, status: "موهبة صاعدة", shirtNumber: 30, contractUntil: "2029-06-30", foot: "right", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-it-inter-striker", name: "Lorenzo Conti", age: 19, countryId: "country-it", clubId: "club-inter", position: "مهاجم", role: "هجوم", rating: 73, potential: 88, marketValueEur: 2500000, status: "موهبة صاعدة", shirtNumber: 19, contractUntil: "2029-06-30", foot: "right", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-it-juventus-midfielder", name: "Andrea Moretti", age: 18, countryId: "country-it", clubId: "club-juventus", position: "وسط مركزي", role: "وسط", rating: 70, potential: 89, marketValueEur: 2000000, status: "متاح للكشف", shirtNumber: 18, contractUntil: "2029-06-30", foot: "left", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-nl-ajax-forward", name: "Daan Vermeer", age: 19, countryId: "country-nl", clubId: "club-ajax", position: "مهاجم", role: "هجوم", rating: 72, potential: 88, marketValueEur: 2100000, status: "موهبة صاعدة", shirtNumber: 19, contractUntil: "2029-06-30", foot: "right", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-nl-ajax-keeper", name: "Milan de Groot", age: 20, countryId: "country-nl", clubId: "club-ajax", position: "حارس مرمى", role: "حراسة", rating: 71, potential: 86, marketValueEur: 1500000, status: "تحت المراقبة", shirtNumber: 1, contractUntil: "2028-06-30", foot: "right", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-nl-psv-midfielder", name: "Timo Smit", age: 18, countryId: "country-nl", clubId: "club-psv", position: "وسط مركزي", role: "وسط", rating: 69, potential: 87, marketValueEur: 1300000, status: "متاح للكشف", shirtNumber: 8, contractUntil: "2029-06-30", foot: "left", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-nl-psv-defender", name: "Jesse Bakker", age: 21, countryId: "country-nl", clubId: "club-psv", position: "قلب دفاع", role: "دفاع", rating: 73, potential: 84, marketValueEur: 1900000, status: "جاهز للتطور", shirtNumber: 4, contractUntil: "2028-06-30", foot: "right", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-pt-benfica-winger", name: "Tiago Rocha", age: 19, countryId: "country-pt", clubId: "club-benfica", position: "جناح أيمن", role: "هجوم", rating: 74, potential: 89, marketValueEur: 2900000, status: "موهبة صاعدة", shirtNumber: 17, contractUntil: "2029-06-30", foot: "left", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-pt-benfica-keeper", name: "Rui Matos", age: 22, countryId: "country-pt", clubId: "club-benfica", position: "حارس مرمى", role: "حراسة", rating: 75, potential: 84, marketValueEur: 2600000, status: "تحت المراقبة", shirtNumber: 24, contractUntil: "2028-06-30", foot: "right", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-pt-porto-midfielder", name: "Gonçalo Pires", age: 18, countryId: "country-pt", clubId: "club-porto", position: "وسط هجومي", role: "وسط", rating: 70, potential: 90, marketValueEur: 2400000, status: "متاح للكشف", shirtNumber: 10, contractUntil: "2029-06-30", foot: "left", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-pt-porto-defender", name: "Afonso Lima", age: 20, countryId: "country-pt", clubId: "club-porto", position: "قلب دفاع", role: "دفاع", rating: 73, potential: 86, marketValueEur: 2200000, status: "موهبة صاعدة", shirtNumber: 5, contractUntil: "2028-06-30", foot: "right", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-br-flamengo-striker", name: "Lucas Nascimento", age: 19, countryId: "country-br", clubId: "club-flamengo", position: "مهاجم", role: "هجوم", rating: 75, potential: 91, marketValueEur: 3600000, status: "موهبة صاعدة", shirtNumber: 9, contractUntil: "2029-06-30", foot: "right", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-br-flamengo-defender", name: "Caio Ribeiro", age: 21, countryId: "country-br", clubId: "club-flamengo", position: "قلب دفاع", role: "دفاع", rating: 74, potential: 86, marketValueEur: 2800000, status: "تحت المراقبة", shirtNumber: 3, contractUntil: "2028-06-30", foot: "right", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-br-palmeiras-keeper", name: "Murilo Costa", age: 20, countryId: "country-br", clubId: "club-palmeiras", position: "حارس مرمى", role: "حراسة", rating: 73, potential: 87, marketValueEur: 2400000, status: "جاهز للتطور", shirtNumber: 1, contractUntil: "2029-06-30", foot: "right", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-br-palmeiras-midfielder", name: "Pedro Almeida", age: 18, countryId: "country-br", clubId: "club-palmeiras", position: "وسط مركزي", role: "وسط", rating: 71, potential: 89, marketValueEur: 2500000, status: "متاح للكشف", shirtNumber: 8, contractUntil: "2029-06-30", foot: "left", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-ar-river-winger", name: "Mateo Benítez", age: 19, countryId: "country-ar", clubId: "club-river", position: "جناح أيسر", role: "هجوم", rating: 74, potential: 90, marketValueEur: 3200000, status: "موهبة صاعدة", shirtNumber: 11, contractUntil: "2029-06-30", foot: "right", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-ar-river-keeper", name: "Tomás Rojas", age: 21, countryId: "country-ar", clubId: "club-river", position: "حارس مرمى", role: "حراسة", rating: 72, potential: 85, marketValueEur: 2100000, status: "تحت المراقبة", shirtNumber: 12, contractUntil: "2028-06-30", foot: "right", discoverySourceIds: ["club-network", "agent-referral"] },
  { id: "seed-ar-boca-midfielder", name: "Julián Acosta", age: 18, countryId: "country-ar", clubId: "club-boca", position: "وسط هجومي", role: "وسط", rating: 70, potential: 89, marketValueEur: 2300000, status: "متاح للكشف", shirtNumber: 9, contractUntil: "2029-06-30", foot: "left", discoverySourceIds: ["academy", "youth-tournament"] },
  { id: "seed-ar-boca-defender", name: "Nicolás Duarte", age: 22, countryId: "country-ar", clubId: "club-boca", position: "قلب دفاع", role: "دفاع", rating: 75, potential: 85, marketValueEur: 2700000, status: "جاهز للتطور", shirtNumber: 2, contractUntil: "2028-06-30", foot: "right", discoverySourceIds: ["club-network", "agent-referral"] }
];

const SQUAD_ROLE_TARGETS = [
  { role: "حراسة", count: 2, positions: ["حارس مرمى"] },
  { role: "دفاع", count: 6, positions: ["قلب دفاع", "ظهير أيمن", "ظهير أيسر", "قلب دفاع", "ظهير أيسر", "ظهير أيمن"] },
  { role: "وسط", count: 6, positions: ["وسط دفاعي", "وسط مركزي", "وسط هجومي", "صانع ألعاب", "وسط مركزي", "وسط دفاعي"] },
  { role: "هجوم", count: 4, positions: ["مهاجم", "جناح أيمن", "جناح أيسر", "مهاجم"] }
];

const SQUAD_NAME_POOLS = {
  "country-eg": { first: ["مروان", "عمر", "مصطفى", "أحمد", "حسن", "كريم", "إبراهيم", "حمزة", "محمود", "علي"], last: ["حمدي", "سعيد", "منصور", "النجار", "فتحي", "إسماعيل", "فاروق", "عبدالله", "صالح", "مراد"] },
  "country-ma": { first: ["ياسين", "أيوب", "سفيان", "بلال", "إلياس", "مهدي", "أشرف", "أنس", "زكرياء", "حمزة"], last: ["العلوي", "المرابط", "بناني", "السالمي", "الزهراني", "أيت", "بوخريص", "الحسيني", "الكتاني", "الودغيري"] },
  "country-tn": { first: ["مالك", "سيف", "فارس", "معز", "ريان", "هيثم", "نادر", "بلال", "أمين", "حازم"], last: ["الجبالي", "بن يوسف", "الطرابلسي", "الشابي", "الغربي", "العرفاوي", "الهمامي", "بن عمار", "المهيري", "الزواوي"] },
  "country-gb": { first: ["Jack", "Alfie", "Harry", "Mason", "Theo", "Leo", "Archie", "Finley", "Rory", "Callum"], last: ["Parker", "Cooper", "Fletcher", "Hughes", "Bennett", "Morris", "Reed", "Foster", "Brooks", "Palmer"] },
  "country-es": { first: ["Álvaro", "Sergio", "Pablo", "Mario", "Hugo", "Izan", "Marcos", "Raúl", "Enzo", "Nico"], last: ["Navarro", "Romero", "Castillo", "Santos", "Molina", "Ortega", "Delgado", "Vargas", "Reyes", "Cano"] },
  "country-de": { first: ["Lukas", "Finn", "Paul", "Ben", "Jonas", "Noah", "Max", "Leon", "Elias", "Luca"], last: ["Schneider", "Hoffmann", "Schulz", "Koch", "Bauer", "Richter", "Klein", "Wolf", "Neumann", "Schwarz"] },
  "country-fr": { first: ["Lucas", "Louis", "Jules", "Hugo", "Arthur", "Gabriel", "Raphaël", "Nathan", "Maël", "Evan"], last: ["Roux", "Vincent", "Leroy", "Bonnet", "François", "Garnier", "Chevalier", "Faure", "André", "Mercier"] },
  "country-it": { first: ["Alessio", "Tommaso", "Gabriele", "Riccardo", "Edoardo", "Samuele", "Davide", "Filippo", "Pietro", "Lorenzo"], last: ["Romano", "Gallo", "Costa", "Fontana", "Marino", "Greco", "Conti", "De Luca", "Mancini", "Lombardi"] },
  "country-nl": { first: ["Daan", "Sem", "Bram", "Luuk", "Mees", "Gijs", "Milan", "Thijs", "Jesse", "Ties"], last: ["Visser", "Smit", "Meijer", "Mulder", "Bos", "Vos", "Peters", "Hendriks", "Dekker", "Brouwer"] },
  "country-pt": { first: ["Diogo", "João", "Francisco", "Guilherme", "Martim", "Afonso", "Duarte", "Tomás", "Rodrigo", "David"], last: ["Ferreira", "Gomes", "Carvalho", "Ribeiro", "Martins", "Lopes", "Sousa", "Fernandes", "Pinto", "Teixeira"] },
  "country-br": { first: ["Rafael", "Gabriel", "João", "Pedro", "Matheus", "Enzo", "Breno", "Vitor", "Igor", "Caio"], last: ["Oliveira", "Souza", "Santos", "Lima", "Araújo", "Barbosa", "Cardoso", "Pereira", "Mendes", "Teixeira"] },
  "country-ar": { first: ["Santiago", "Thiago", "Benjamín", "Franco", "Lautaro", "Joaquín", "Facundo", "Agustín", "Bruno", "Valentín"], last: ["Gutiérrez", "Pereyra", "Méndez", "Herrera", "Silva", "Medina", "Castro", "Suárez", "Acosta", "Vega"] }
};

function createSupplementalSquadSeeds() {
  const generated = [];
  CLUBS.forEach((club, clubIndex) => {
    const existing = PLAYER_SEEDS.filter((player) => player.clubId === club.id);
    const usedNumbers = new Set(existing.map((player) => player.shirtNumber));
    const names = SQUAD_NAME_POOLS[club.countryId];
    let serial = 0;

    for (const target of SQUAD_ROLE_TARGETS) {
      const existingCount = existing.filter((player) => player.role === target.role).length;
      for (let slot = existingCount; slot < target.count; slot += 1) {
        const first = names.first[(serial + clubIndex * 2) % names.first.length];
        const surname = names.last[(Math.floor(serial / names.first.length) + clubIndex * 3) % names.last.length];
        const shirtNumber = Array.from({ length: 99 }, (_, index) => index + 1)
          .find((number) => !usedNumbers.has(number));
        if (!shirtNumber) throw new TypeError("لا توجد أرقام قمصان متاحة للنادي: " + club.id);
        usedNumbers.add(shirtNumber);

        const roleAdjustment = target.role === "هجوم" ? 1 : target.role === "حراسة" ? -2 : 0;
        const rating = Math.max(55, Math.min(88,
          club.simulationProfile - 8 - ((clubIndex * 3 + serial * 7) % 12) + roleAdjustment
        ));
        const potential = Math.min(97, rating + 3 + ((serial * 5 + clubIndex) % 15));
        generated.push({
          id: "squad-" + club.id + "-player-" + String(shirtNumber).padStart(2, "0"),
          name: first + " " + surname,
          age: 18 + ((clubIndex * 7 + serial * 5) % 13),
          countryId: club.countryId,
          clubId: club.id,
          position: target.positions[slot % target.positions.length],
          role: target.role,
          rating,
          potential,
          marketValueEur: Math.round(Math.max(150000, rating * rating * 420 + (potential - rating) * 110000)),
          status: ["موهبة صاعدة", "تحت المراقبة", "متاح للكشف", "جاهز للتطور"][(serial + clubIndex) % 4],
          shirtNumber,
          contractUntil: (2027 + (serial % 3)) + "-06-30",
          foot: (serial + clubIndex) % 2 === 0 ? "right" : "left"
        });
        serial += 1;
      }
    }
  });
  return generated;
}

const players = PLAYER_SEEDS.map((player) => {
  const club = CLUBS.find((item) => item.id === player.clubId);
  return {
    ...player,
    ...createPortraitAssignment(player, club)
  };
});

const squadPlayers = createSupplementalSquadSeeds().map((player) => {
  const club = CLUBS.find((item) => item.id === player.clubId);
  return {
    ...player,
    ...createPortraitAssignment(player, club)
  };
});

export const WORLD_DATABASE = deepFreeze({
  meta: {
    id: "football-agent-world-seed",
    version: 3,
    season: "2026-2027",
    sourceType: "curated-fictional-world-seed",
    sourceNote: "12 دولة و12 دوريًا و24 ناديًا و432 لاعبًا خياليًا ضمن قوائم من 18 لاعبًا لكل نادٍ؛ 48 لاعبًا في مكتبة المواهب و384 لاعبًا في قوائم التشكيلات. أسماء الأندية والمسابقات مرجعية، واللاعبون ليسوا قوائم حقيقية أو بيانات مباشرة."
  },
  countries: COUNTRIES,
  leagues: LEAGUES,
  competitions: COMPETITIONS,
  clubs: CLUBS,
  players,
  squadPlayers
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function hasUniqueIds(items) {
  const ids = items.map((item) => item?.id);
  return ids.every((id) => typeof id === "string" && id.trim()) && new Set(ids).size === ids.length;
}

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateWorldDatabase(database = WORLD_DATABASE) {
  const errors = [];
  const collections = ["countries", "leagues", "competitions", "clubs", "players"];
  if (database?.squadPlayers !== undefined && !Array.isArray(database.squadPlayers)) errors.push("قوائم التشكيلات يجب أن تكون مصفوفة.");
  if (!database || typeof database !== "object") return { valid: false, errors: ["قاعدة البيانات غير صالحة."] };
  for (const name of collections) {
    if (!Array.isArray(database[name])) errors.push("المجموعة غير موجودة أو ليست مصفوفة: " + name);
  }
  if (errors.length) return { valid: false, errors };

  const [countries, leagues, competitions, clubs, players] = collections.map((name) => database[name]);
  const squadPlayers = Array.isArray(database.squadPlayers) ? database.squadPlayers : [];
  const allPlayers = [...players, ...squadPlayers];
  for (const [name, items] of Object.entries({ countries, leagues, competitions, clubs, players, squadPlayers })) {
    if (!hasUniqueIds(items)) errors.push("معرفات " + name + " مفقودة أو مكررة.");
  }
  if (!hasUniqueIds(allPlayers)) errors.push("معرفات اللاعبين وقوائم التشكيلات مكررة أو مفقودة.");
  const portraitValidation = validatePortraitAssignments(allPlayers);
  errors.push(...portraitValidation.errors);

  const countryById = new Map(countries.map((item) => [item.id, item]));
  const leagueById = new Map(leagues.map((item) => [item.id, item]));
  const clubById = new Map(clubs.map((item) => [item.id, item]));
  const countryCodes = countries.map((item) => item.code);
  if (countryCodes.some((code) => typeof code !== "string" || !/^[A-Z]{2}$/.test(code)) || new Set(countryCodes).size !== countryCodes.length) {
    errors.push("رموز الدول يجب أن تكون فريدة وتتكون من حرفين كبيرين.");
  }

  for (const league of leagues) {
    if (!countryById.has(league.countryId)) errors.push("الدوري " + league.id + " يشير إلى دولة غير موجودة.");
    if (!Number.isInteger(league.tier) || league.tier < 1) errors.push("درجة الدوري غير صالحة: " + league.id);
  }

  for (const club of clubs) {
    const league = leagueById.get(club.leagueId);
    if (!countryById.has(club.countryId)) errors.push("النادي " + club.id + " يشير إلى دولة غير موجودة.");
    if (!league) errors.push("النادي " + club.id + " يشير إلى دوري غير موجود.");
    else if (league.countryId !== club.countryId) errors.push("دولة النادي لا تطابق دولة دوري النادي: " + club.id);
    if (!Number.isInteger(club.simulationProfile) || club.simulationProfile < 1 || club.simulationProfile > 100) {
      errors.push("تقييم قوة المحاكاة خارج النطاق: " + club.id);
    }
    if (typeof club.shortName !== "string" || !club.shortName.trim()) errors.push("الاسم المختصر للنادي مفقود: " + club.id);
    if (typeof club.primaryColor !== "string" || !/^#[0-9a-f]{6}$/i.test(club.primaryColor)) {
      errors.push("لون النادي غير صالح لربط هوية القميص: " + club.id);
    }
  }

  for (const competition of competitions) {
    const competitionRulesValidation = validateCompetitionDefinition(competition, database);
    errors.push(...competitionRulesValidation.errors);
    if (!Array.isArray(competition.clubIds) || competition.clubIds.length === 0) {
      errors.push("المسابقة بلا أندية مشاركة: " + competition.id);
      continue;
    }
    if (new Set(competition.clubIds).size !== competition.clubIds.length) errors.push("يوجد نادٍ مكرر في المسابقة: " + competition.id);
    for (const clubId of competition.clubIds) {
      if (!clubById.has(clubId)) errors.push("المسابقة " + competition.id + " تشير إلى نادٍ غير موجود: " + clubId);
    }
    if (competition.type === "league") {
      const league = leagueById.get(competition.leagueId);
      if (!league) errors.push("مسابقة الدوري تشير إلى دوري غير موجود: " + competition.id);
      else {
        if (competition.countryId !== league.countryId) errors.push("دولة المسابقة لا تطابق دولة الدوري: " + competition.id);
        for (const clubId of competition.clubIds) {
          const club = clubById.get(clubId);
          if (club && club.leagueId !== league.id) errors.push("نادي مشارك لا ينتمي إلى دوري المسابقة: " + competition.id + " / " + clubId);
        }
      }
    } else if (competition.type === "continental") {
      if (competition.countryId !== null || competition.leagueId !== null) errors.push("المسابقة القارية لا يجب أن ترتبط بدولة أو دوري محلي: " + competition.id);
    } else if (competition.type === "cup") {
      if (competition.countryId !== null || competition.leagueId !== null) errors.push("الكأس المفتوح لا يجب أن يرتبط بدولة أو دوري محلي: " + competition.id);
    } else {
      errors.push("نوع مسابقة غير مدعوم: " + competition.id);
    }
  }

  const allowedRoles = new Set(["هجوم", "وسط", "دفاع", "حراسة"]);
  const allowedDiscoverySources = new Set(["academy", "club-network", "youth-tournament", "agent-referral"]);
  for (const player of allPlayers) {
    if (!countryById.has(player.countryId)) errors.push("اللاعب " + player.id + " يشير إلى جنسية غير موجودة.");
    const currentClub = clubById.get(player.clubId);
    if (!currentClub) errors.push("اللاعب " + player.id + " يشير إلى نادٍ غير موجود.");
    else if (player.kit !== currentClub.primaryColor) errors.push("لون قميص اللاعب لا يطابق النادي المرتبط: " + player.id);
    if (!Number.isInteger(player.age) || player.age < 15 || player.age > 45) errors.push("عمر اللاعب خارج النطاق: " + player.id);
    if (!Number.isInteger(player.rating) || player.rating < 1 || player.rating > 99) errors.push("تقييم اللاعب غير صالح: " + player.id);
    if (!Number.isInteger(player.potential) || player.potential < player.rating || player.potential > 99) errors.push("إمكانية اللاعب غير صالحة: " + player.id);
    if (!Number.isFinite(player.marketValueEur) || player.marketValueEur < 0) errors.push("القيمة السوقية غير صالحة: " + player.id);
    if (!Number.isInteger(player.shirtNumber) || player.shirtNumber < 1 || player.shirtNumber > 99) errors.push("رقم القميص غير صالح: " + player.id);
    if (!allowedRoles.has(player.role)) errors.push("مركز اللاعب العام غير معروف: " + player.id);
    if (typeof player.position !== "string" || !player.position.trim()) errors.push("المركز التفصيلي مفقود: " + player.id);
    if (!isCalendarDate(player.contractUntil)) errors.push("تاريخ انتهاء العقد غير صالح: " + player.id);
    if (players.includes(player) && (!Array.isArray(player.discoverySourceIds) || player.discoverySourceIds.length === 0 ||
        new Set(player.discoverySourceIds).size !== player.discoverySourceIds.length ||
        !player.discoverySourceIds.every((sourceId) => allowedDiscoverySources.has(sourceId)))) {
      errors.push("قنوات اكتشاف المواهب غير صالحة: " + player.id);
    }
  }

  if (database.squadPlayers !== undefined) {
    const expectedRoles = new Map([["حراسة", 2], ["دفاع", 6], ["وسط", 6], ["هجوم", 4]]);
    for (const club of clubs) {
      const roster = allPlayers.filter((player) => player.clubId === club.id);
      if (roster.length !== 18) errors.push("قائمة النادي يجب أن تضم 18 لاعبًا: " + club.id);
      const shirtNumbers = roster.map((player) => player.shirtNumber);
      if (new Set(shirtNumbers).size !== shirtNumbers.length) errors.push("أرقام قمصان مكررة داخل النادي: " + club.id);
      for (const [role, expectedCount] of expectedRoles) {
        if (roster.filter((player) => player.role === role).length !== expectedCount) {
          errors.push("توزيع المراكز غير مكتمل في قائمة النادي: " + club.id + " / " + role);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function formatEuro(value) {
  if (value >= 1000000) return "€" + Number((value / 1000000).toFixed(1)) + "M";
  return "€" + Math.round(value / 1000) + "K";
}

export function getWorldPlayerProfiles(database = WORLD_DATABASE) {
  const validation = validateWorldDatabase(database);
  if (!validation.valid) throw new TypeError("قاعدة بيانات العالم غير سليمة: " + validation.errors.join(" "));
  const countries = new Map(database.countries.map((country) => [country.id, country]));
  const clubs = new Map(database.clubs.map((club) => [club.id, club]));
  const leagues = new Map(database.leagues.map((league) => [league.id, league]));
  return database.players.map((player) => {
    const club = clubs.get(player.clubId);
    const league = leagues.get(club.leagueId);
    return {
      ...player,
      country: countries.get(player.countryId).nameAr,
      club: club.nameAr,
      clubShortName: club.shortName,
      clubId: club.id,
      league: league.nameAr,
      leagueId: league.id,
      clubColor: club.primaryColor,
      value: formatEuro(player.marketValueEur)
    };
  });
}

export function getWorldSummary(database = WORLD_DATABASE) {
  return {
    countries: database.countries.length,
    leagues: database.leagues.length,
    competitions: database.competitions.length,
    clubs: database.clubs.length,
    players: database.players.length,
    squadPlayers: database.squadPlayers?.length ?? 0,
    rosterPlayers: database.players.length + (database.squadPlayers?.length ?? 0),
    portraitAssets: database.players.filter((player) => Boolean(player.portraitAssetId)).length,
    rosterPortraitAssets: [...database.players, ...(database.squadPlayers ?? [])].filter((player) => Boolean(player.portraitAssetId)).length
  };
}

export function getWorldSquadPlayers(database = WORLD_DATABASE) {
  return [...database.players, ...(database.squadPlayers ?? [])];
}

export function findWorldPlayer(playerId, database = WORLD_DATABASE) {
  return database.players.find((player) => player.id === playerId) ?? null;
}
