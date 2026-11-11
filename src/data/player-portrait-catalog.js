const SKIN_TONES = [
  "#f0c6a2", "#e5b18d", "#d59a75", "#c88966", "#b97857",
  "#a96e50", "#935b43", "#7d4b39", "#643b2e"
];
const HAIR_TONES = ["#17191e", "#211a19", "#302221", "#3a2d25", "#5a4030", "#866142", "#b6a27f"];
const HAIR_STYLES = ["curly", "fade", "wavy", "short", "buzz"];
const FACE_SHAPES = ["oval", "round", "angular", "square"];
const FACIAL_HAIR = ["none", "stubble", "short-beard", "full-beard"];
const EYE_COLORS = ["#211713", "#2b1d18", "#38271f", "#493528", "#43564d"];
const KIT_ACCENTS = ["#f2f0e9", "#f4d66d", "#b6d8f1", "#d9b6e8", "#8ed0b0", "#f0a0a7"];
const KIT_PATTERNS = ["solid", "stripes", "sash", "chevron"];

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
  const haircut = pick(seed, 0x452a31e8, HAIR_STYLES);
  const age = Number.isInteger(player.age) ? player.age : 20;
  const facialHair = age < 21
    ? pick(seed, 0x85ebca6b, ["none", "none", "none", "stubble"])
    : pick(seed, 0xc2b2ae35, FACIAL_HAIR);
  const kit = safeClubColor(club.primaryColor);

  return Object.freeze({
    portraitAssetId: getPortraitAssetId(player.id),
    portraitVersion: PORTRAIT_LIBRARY_VERSION,
    portraitStyle: PORTRAIT_RENDER_STYLE,
    portraitSeed: seed,
    skin: pick(seed, 0xc60c64e8, SKIN_TONES),
    hair: pick(seed, 0xb8eb80a5, HAIR_TONES),
    hairStyle: "hair-" + haircut,
    kit,
    kitLight: pick(seed, 0xd3a2646c, KIT_ACCENTS),
    appearance: Object.freeze({
      faceShape: pick(seed, 0xa8c09e2f, FACE_SHAPES),
      haircut,
      facialHair,
      eyeColor: pick(seed, 0xb55a4f09, EYE_COLORS),
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
  }

  return { valid: errors.length === 0, errors };
}
