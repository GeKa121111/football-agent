const SKIN_TONES = [
  "#f5d7b8", "#e8b88a", "#c68e5e", "#9c6b43", "#6f4423", "#4a2c17"
];
const HAIR_TONES = ["#17191e", "#211a19", "#302221", "#5a4030", "#866142"];
const HAIR_GREY = "#b6a27f";
const HAIR_STYLES = ["curly", "fade", "wavy", "short", "buzz", "long", "bald", "flat-top"];
const FACE_SHAPES = ["oval", "round", "angular", "square", "long"];
const FACIAL_HAIR = ["none", "stubble", "short-beard", "full-beard"];
const EYE_COLORS = ["#211713", "#2b1d18", "#38271f", "#493528", "#43564d"];
const KIT_ACCENTS = ["#f2f0e9", "#f4d66d", "#b6d8f1", "#d9b6e8", "#8ed0b0", "#f0a0a7"];
const KIT_PATTERNS = ["solid", "stripes", "sash", "chevron"];
const NOSES = ["small", "medium", "wide"];
const MOUTHS = ["slight-smile", "neutral", "wide-smile", "serious"];
const EYEBROWS = ["thin", "medium", "thick"];
const EYE_SHAPES = ["normal", "narrow", "wide"];
const ACCESSORIES = ["none", "headband", "earring"];
const COLLARS = ["round", "v", "polo"];

// درجات البشرة والشعر في UXUI.md §3.3 — مطابقة للجنسية (درس NG_Regens):
// لاعب مصري ≠ لاعب سويدي في توزيع لون البشرة والشعر. الأوزان مرتبة من
// الأفتح للأغمق، حسب منطقة جنسية اللاعب.
const REGION_BY_COUNTRY = {
  "country-eg": "mena", "country-ma": "mena", "country-tn": "mena",
  "country-gb": "north-europe", "country-de": "north-europe", "country-nl": "north-europe",
  "country-es": "med", "country-fr": "med", "country-it": "med", "country-pt": "med",
  "country-br": "latam", "country-ar": "latam"
};
const COUNTRY_NAME_REGION = {
  "مصر": "mena", "المغرب": "mena", "تونس": "mena", "الجزائر": "mena",
  "إنجلترا": "north-europe", "ألمانيا": "north-europe", "هولندا": "north-europe",
  "إسبانيا": "med", "فرنسا": "med", "إيطاليا": "med", "البرتغال": "med",
  "البرازيل": "latam", "الأرجنتين": "latam"
};
const SKIN_WEIGHTS = {
  "mena": [2, 8, 22, 30, 26, 12],
  "north-europe": [34, 30, 18, 10, 5, 3],
  "med": [16, 26, 28, 18, 9, 3],
  "latam": [6, 14, 26, 28, 18, 8],
  "mixed": [16, 18, 20, 20, 15, 11]
};
const HAIR_WEIGHTS = {
  "mena": [34, 30, 20, 10, 6],
  "north-europe": [12, 18, 24, 22, 24],
  "med": [26, 28, 24, 14, 8],
  "latam": [30, 28, 22, 12, 8],
  "mixed": [24, 24, 22, 16, 14]
};

export function portraitRegionForPlayer(player = {}) {
  const byId = REGION_BY_COUNTRY[player.countryId];
  if (byId) return byId;
  const byName = COUNTRY_NAME_REGION[player.country] ?? COUNTRY_NAME_REGION[player.nationality];
  if (byName) return byName;
  const code = typeof player.countryCode === "string" ? player.countryCode.toUpperCase() : "";
  const byCode = { EG: "mena", MA: "mena", TN: "mena", GB: "north-europe", DE: "north-europe", NL: "north-europe", ES: "med", FR: "med", IT: "med", PT: "med", BR: "latam", AR: "latam" }[code];
  return byCode ?? "mixed";
}

// mulberry32 — مولّد أرقام حتمي: نفس الـ seed = نفس السلسلة دائمًا،
// من غير Math.random، حتى تبقى وجوه اللاعبين ثابتة عبر الجلسات والأجهزة.
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function weightedPick(rng, entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function withWeights(values, weights) {
  return values.map((value, index) => [value, weights[index] ?? 1]);
}

export const PORTRAIT_LIBRARY_VERSION = 1;
export const PORTRAIT_RENDER_STYLE = "illustrated-pro";

function hashIdentity(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(seed, salt, choices) {
  const mixed = Math.imul((seed ^ salt) >>> 0, 2246822519) >>> 0;
  return choices[mixed % choices.length];
}

function safeClubColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : "#344d78";
}

export function getPortraitAssetId(playerId) {
  if (typeof playerId !== "string" || !playerId.trim()) {
    throw new TypeError("معرف اللاعب مطلوب لإنشاء هوية صورته.");
  }
  const slug = playerId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) throw new TypeError("معرف اللاعب لا يصلح لهوية صورة.");
  return "portrait-" + slug;
}

/**
 * Builds a deterministic illustration identity from a stable player ID.
 * The kit follows the player's club palette; appearance never changes player stats.
 */
export function createPortraitAssignment(player, club = {}) {
  if (!player || typeof player.id !== "string" || !player.id.trim()) {
    throw new TypeError("لا يمكن ربط صورة لاعب بلا معرف ثابت.");
  }

  const seed = hashIdentity(player.id);
  // سلسلة حتمية واحدة بالترتيب الثابت: نفس اللاعب = نفس الملامح دائمًا.
  // ترتيب السحب ثابت عمدًا — أي إضافة مستقبلية تكون في نهاية السلسلة
  // حتى لا تتغير ملامح اللاعبين الحاليين.
  const rng = mulberry32(seed);
  const region = portraitRegionForPlayer(player);
  const age = Number.isInteger(player.age) ? player.age : 20;
  const skin = weightedPick(rng, withWeights(SKIN_TONES, SKIN_WEIGHTS[region]));
  let hair = weightedPick(rng, withWeights(HAIR_TONES, HAIR_WEIGHTS[region]));
  // الشعر الرمادي للكبار فقط (30+).
  if (age >= 30 && rng() < 0.15) hair = HAIR_GREY;
  const haircut = (() => {
    const entries = [
      ["short", 22], ["curly", 14], ["fade", 16], ["wavy", 14], ["buzz", 10],
      ["long", 10], ["bald", age >= 26 ? 6 : 0], ["flat-top", 8]
    ].filter(([, weight]) => weight > 0);
    return weightedPick(rng, entries);
  })();
  const facialHair = age < 18
    ? "none"
    : age < 21
      ? weightedPick(rng, [["none", 3], ["stubble", 1]])
      : weightedPick(rng, FACIAL_HAIR.map((value) => [value, 1]));
  const kit = safeClubColor(club.primaryColor);

  return Object.freeze({
    portraitAssetId: getPortraitAssetId(player.id),
    portraitVersion: PORTRAIT_LIBRARY_VERSION,
    portraitStyle: PORTRAIT_RENDER_STYLE,
    portraitSeed: seed,
    skin,
    hair,
    hairStyle: "hair-" + haircut,
    kit,
    kitLight: pick(seed, 0xd3a2646c, KIT_ACCENTS),
    appearance: Object.freeze({
      faceShape: weightedPick(rng, FACE_SHAPES.map((value) => [value, 1])),
      haircut,
      facialHair,
      eyeColor: pick(seed, 0xb55a4f09, EYE_COLORS),
      eyeShape: weightedPick(rng, EYE_SHAPES.map((value) => [value, 1])),
      nose: weightedPick(rng, NOSES.map((value) => [value, 1])),
      mouth: weightedPick(rng, MOUTHS.map((value) => [value, 1])),
      eyebrows: weightedPick(rng, EYEBROWS.map((value) => [value, 1])),
      accessory: weightedPick(rng, [["none", 92], ["headband", 5], ["earring", 3]]),
      collar: weightedPick(rng, COLLARS.map((value) => [value, 1])),
      kitPattern: pick(seed, 0x447e4060, KIT_PATTERNS)
    })
  });
}

export function validatePortraitAssignments(players) {
  const errors = [];
  if (!Array.isArray(players)) {
    return { valid: false, errors: ["سجل صور اللاعبين يجب أن يكون مصفوفة."] };
  }

  const ids = players.map((player) => player?.portraitAssetId);
  if (ids.some((id) => typeof id !== "string" || !/^portrait-[a-z0-9-]+$/.test(id))) {
    errors.push("هوية صورة لاعب مفقودة أو غير صالحة.");
  }
  if (new Set(ids).size !== ids.length) {
    errors.push("معرفات أصول صور اللاعبين مكررة.");
  }

  for (const player of players) {
    const playerId = player?.id ?? "unknown";
    if (typeof player?.id !== "string" || !player.id.trim()) {
      errors.push("معرف اللاعب مفقود من سجل الصورة.");
    } else {
      let expectedAssetId = null;
      try {
        expectedAssetId = getPortraitAssetId(player.id);
      } catch {
        errors.push("معرف اللاعب لا يصلح لربط أصل الصورة: " + playerId);
      }
      if (expectedAssetId && player.portraitAssetId !== expectedAssetId) {
        errors.push("أصل الصورة لا يطابق معرف اللاعب: " + playerId);
      }
      if (Number.isInteger(player.portraitSeed) && player.portraitSeed !== hashIdentity(player.id)) {
        errors.push("بذرة الصورة لا تطابق هوية اللاعب: " + playerId);
      }
    }
    if (player?.portraitVersion !== PORTRAIT_LIBRARY_VERSION) {
      errors.push("إصدار صورة اللاعب غير مدعوم: " + playerId);
    }
    if (player?.portraitStyle !== PORTRAIT_RENDER_STYLE) {
      errors.push("نمط صورة اللاعب غير معروف: " + playerId);
    }
    if (!Number.isInteger(player?.portraitSeed) || player.portraitSeed < 0) {
      errors.push("بذرة صورة اللاعب غير صالحة: " + playerId);
    }
    for (const [field, value] of [["البشرة", player?.skin], ["الشعر", player?.hair], ["القميص", player?.kit], ["تفاصيل القميص", player?.kitLight]]) {
      if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
        errors.push("لون " + field + " غير صالح في أصل صورة اللاعب: " + playerId);
      }
    }
    // الحقول الجديدة في المرحلة 3: تُفحص إن وُجدت فقط — لاعبون قدامى
    // بلا هذه الحقول يبقون صالحين، وتُشتق ملامحهم حتميًا من الـ seed عند العرض.
    const appearance = player?.appearance;
    if (appearance !== undefined && appearance !== null && typeof appearance === "object") {
      const checks = [
        ["الأنف", appearance.nose, NOSES],
        ["الفم", appearance.mouth, MOUTHS],
        ["الحواجب", appearance.eyebrows, EYEBROWS],
        ["شكل العين", appearance.eyeShape, EYE_SHAPES],
        ["الإكسسوار", appearance.accessory, ACCESSORIES],
        ["الياقة", appearance.collar, COLLARS],
        ["شكل الوجه", appearance.faceShape, FACE_SHAPES],
        ["قصة الشعر", appearance.haircut, HAIR_STYLES]
      ];
      for (const [field, value, allowed] of checks) {
        if (value !== undefined && !allowed.includes(value)) {
          errors.push(field + " غير صالح في أصل صورة اللاعب: " + playerId);
        }
      }
      // قاعدة Checklist §3.6: ممنوع نظارة شمس أو وشم وجه — لا يوجد
      // أي قيمة مسموحة تنتجهما أصلًا؛ أي قيمة خارج القائمة تُرفض أعلاه.
    }
  }

  return { valid: errors.length === 0, errors };
}

// مجموعات قيم ملامح البورتريه — للتدقيق الآلي (scripts/audit-portraits.js)
// وللاختبارات؛ القيم الوحيدة المسموحة في الرسم.
export const PORTRAIT_FEATURE_SETS = Object.freeze({
  skinTones: Object.freeze([...SKIN_TONES]),
  hairTones: Object.freeze([...HAIR_TONES, HAIR_GREY]),
  hairStyles: Object.freeze([...HAIR_STYLES]),
  faceShapes: Object.freeze([...FACE_SHAPES]),
  facialHair: Object.freeze([...FACIAL_HAIR]),
  eyeColors: Object.freeze([...EYE_COLORS]),
  eyeShapes: Object.freeze([...EYE_SHAPES]),
  noses: Object.freeze([...NOSES]),
  mouths: Object.freeze([...MOUTHS]),
  eyebrows: Object.freeze([...EYEBROWS]),
  accessories: Object.freeze([...ACCESSORIES]),
  collars: Object.freeze([...COLLARS]),
  kitPatterns: Object.freeze([...KIT_PATTERNS])
});
