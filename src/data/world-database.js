// Curated playable seed for phase 4.
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
  { id: "country-it", code: "IT", nameAr: "إيطاليا", nameEn: "Italy", confederation: "UEFA" }
];

const LEAGUES = [
  { id: "league-eg-premier", nameAr: "الدوري المصري الممتاز", nameEn: "Egyptian Premier League", countryId: "country-eg", tier: 1 },
  { id: "league-ma-botola", nameAr: "البطولة الاحترافية", nameEn: "Botola Pro", countryId: "country-ma", tier: 1 },
  { id: "league-tn-ligue1", nameAr: "الرابطة التونسية المحترفة الأولى", nameEn: "Tunisian Ligue 1", countryId: "country-tn", tier: 1 },
  { id: "league-eng-premier", nameAr: "الدوري الإنجليزي الممتاز", nameEn: "Premier League", countryId: "country-gb", tier: 1 },
  { id: "league-es-laliga", nameAr: "الدوري الإسباني", nameEn: "LaLiga", countryId: "country-es", tier: 1 },
  { id: "league-de-bundesliga", nameAr: "الدوري الألماني", nameEn: "Bundesliga", countryId: "country-de", tier: 1 },
  { id: "league-fr-ligue1", nameAr: "الدوري الفرنسي", nameEn: "Ligue 1", countryId: "country-fr", tier: 1 },
  { id: "league-it-seriea", nameAr: "الدوري الإيطالي", nameEn: "Serie A", countryId: "country-it", tier: 1 }
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
  { id: "club-juventus", nameAr: "يوفنتوس", nameEn: "Juventus", countryId: "country-it", leagueId: "league-it-seriea", shortName: "يوفنتوس", simulationProfile: 89, primaryColor: "#eeeeef" }
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
  { id: "competition-caf-champions", nameAr: "دوري أبطال أفريقيا", nameEn: "CAF Champions League", type: "continental", countryId: null, leagueId: null, season: "2026-2027", clubIds: ["club-al-ahly", "club-zamalek", "club-wydad", "club-raja", "club-etoile", "club-es-tunis"] },
  { id: "competition-uefa-champions", nameAr: "دوري أبطال أوروبا", nameEn: "UEFA Champions League", type: "continental", countryId: null, leagueId: null, season: "2026-2027", clubIds: ["club-arsenal", "club-liverpool", "club-real-madrid", "club-barcelona", "club-bayern", "club-dortmund", "club-psg", "club-marseille", "club-inter", "club-juventus"] }
];

const PORTRAIT_PRESETS = [
  { skin: "#b97857", hair: "#211a19", hairStyle: "hair-curly", kit: "#7138a8", kitLight: "#c7a2ef", appearance: { faceShape: "oval", haircut: "curly", facialHair: "none", eyeColor: "#2b1d18", kitPattern: "stripes" } },
  { skin: "#e0aa82", hair: "#302221", hairStyle: "hair-fade", kit: "#174d85", kitLight: "#77c9ef", appearance: { faceShape: "round", haircut: "fade", facialHair: "none", eyeColor: "#38271f", kitPattern: "sash" } },
  { skin: "#8b543b", hair: "#17191e", hairStyle: "hair-wavy", kit: "#9b273f", kitLight: "#e78a9c", appearance: { faceShape: "angular", haircut: "wavy", facialHair: "short-beard", eyeColor: "#211713", kitPattern: "chevron" } },
  { skin: "#c88d6d", hair: "#28201d", hairStyle: "hair-curly", kit: "#d6d7df", kitLight: "#8a8fa4", appearance: { faceShape: "square", haircut: "short", facialHair: "full-beard", eyeColor: "#31231d", kitPattern: "solid" } },
  { skin: "#d39a75", hair: "#3a2d25", hairStyle: "hair-short", kit: "#376d54", kitLight: "#9ed0ac", appearance: { faceShape: "oval", haircut: "short", facialHair: "stubble", eyeColor: "#493528", kitPattern: "stripes" } },
  { skin: "#a96e50", hair: "#17191e", hairStyle: "hair-buzz", kit: "#b63e43", kitLight: "#e5a1a2", appearance: { faceShape: "angular", haircut: "buzz", facialHair: "none", eyeColor: "#2b211b", kitPattern: "solid" } }
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
  { id: "seed-youssef-amrani", name: "يوسف العمراني", age: 19, countryId: "country-ma", clubId: "club-raja", position: "قلب دفاع", role: "دفاع", rating: 72, potential: 85, marketValueEur: 1400000, status: "موهبة صاعدة", shirtNumber: 13, contractUntil: "2029-06-30", foot: "right" , discoverySourceIds: ["academy","youth-tournament"]}
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
  { id: "seed-it-juventus-midfielder", name: "Andrea Moretti", age: 18, countryId: "country-it", clubId: "club-juventus", position: "وسط مركزي", role: "وسط", rating: 70, potential: 89, marketValueEur: 2000000, status: "متاح للكشف", shirtNumber: 18, contractUntil: "2029-06-30", foot: "left", discoverySourceIds: ["club-network", "agent-referral"] }
];
\nconst players = PLAYER_SEEDS.map((player, index) => ({
  ...player,
  ...PORTRAIT_PRESETS[index % PORTRAIT_PRESETS.length]
}));

export const WORLD_DATABASE = deepFreeze({
  meta: {
    id: "football-agent-world-seed",
    version: 1,
    season: "2026-2027",
    sourceType: "curated-prototype-seed",
    sourceNote: "أندية ومسابقات مرجعية مختارة، و32 ملف لاعب خياليًا موزعة بواقع أربعة لاعبين لكل دولة ولاعبين لكل نادٍ مع تغطية المراكز العامة الأربعة. ليست قوائم فرق كاملة أو بيانات مباشرة."
  },
  countries: COUNTRIES,
  leagues: LEAGUES,
  competitions: COMPETITIONS,
  clubs: CLUBS,
  players
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
  if (!database || typeof database !== "object") return { valid: false, errors: ["قاعدة البيانات غير صالحة."] };
  for (const name of collections) {
    if (!Array.isArray(database[name])) errors.push("المجموعة غير موجودة أو ليست مصفوفة: " + name);
  }
  if (errors.length) return { valid: false, errors };

  const [countries, leagues, competitions, clubs, players] = collections.map((name) => database[name]);
  for (const [name, items] of Object.entries({ countries, leagues, competitions, clubs, players })) {
    if (!hasUniqueIds(items)) errors.push("معرفات " + name + " مفقودة أو مكررة.");
  }

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
  }

  for (const competition of competitions) {
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
    } else {
      errors.push("نوع مسابقة غير مدعوم: " + competition.id);
    }
  }

  const allowedRoles = new Set(["هجوم", "وسط", "دفاع", "حراسة"]);
  const allowedDiscoverySources = new Set(["academy", "club-network", "youth-tournament", "agent-referral"]);
  for (const player of players) {
    if (!countryById.has(player.countryId)) errors.push("اللاعب " + player.id + " يشير إلى جنسية غير موجودة.");
    if (!clubById.has(player.clubId)) errors.push("اللاعب " + player.id + " يشير إلى نادٍ غير موجود.");
    if (!Number.isInteger(player.age) || player.age < 15 || player.age > 45) errors.push("عمر اللاعب خارج النطاق: " + player.id);
    if (!Number.isInteger(player.rating) || player.rating < 1 || player.rating > 99) errors.push("تقييم اللاعب غير صالح: " + player.id);
    if (!Number.isInteger(player.potential) || player.potential < player.rating || player.potential > 99) errors.push("إمكانية اللاعب غير صالحة: " + player.id);
    if (!Number.isFinite(player.marketValueEur) || player.marketValueEur < 0) errors.push("القيمة السوقية غير صالحة: " + player.id);
    if (!Number.isInteger(player.shirtNumber) || player.shirtNumber < 1 || player.shirtNumber > 99) errors.push("رقم القميص غير صالح: " + player.id);
    if (!allowedRoles.has(player.role)) errors.push("مركز اللاعب العام غير معروف: " + player.id);
    if (typeof player.position !== "string" || !player.position.trim()) errors.push("المركز التفصيلي مفقود: " + player.id);
    if (!isCalendarDate(player.contractUntil)) errors.push("تاريخ انتهاء العقد غير صالح: " + player.id);
    if (!Array.isArray(player.discoverySourceIds) || player.discoverySourceIds.length === 0 ||
        new Set(player.discoverySourceIds).size !== player.discoverySourceIds.length ||
        !player.discoverySourceIds.every((sourceId) => allowedDiscoverySources.has(sourceId))) {
      errors.push("قنوات اكتشاف المواهب غير صالحة: " + player.id);
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
      league: league.nameAr,
      leagueId: league.id,
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
    players: database.players.length
  };
}

export function findWorldPlayer(playerId, database = WORLD_DATABASE) {
  return database.players.find((player) => player.id === playerId) ?? null;
}
