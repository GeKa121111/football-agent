import { mulberry32 } from "../data/player-portrait-catalog.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const HAIR_STYLES = new Set(["curly", "fade", "wavy", "short", "buzz", "long", "bald", "flat-top"]);
const FACE_SHAPES = new Set(["oval", "round", "angular", "square", "long"]);
const FACIAL_HAIR = new Set(["none", "stubble", "short-beard", "full-beard"]);
const KIT_PATTERNS = new Set(["solid", "stripes", "sash", "chevron"]);
const NOSES = new Set(["small", "medium", "wide"]);
const MOUTHS = new Set(["slight-smile", "neutral", "wide-smile", "serious"]);
const EYEBROWS = new Set(["thin", "medium", "thick"]);
const EYE_SHAPES = new Set(["normal", "narrow", "wide"]);
const ACCESSORIES = new Set(["none", "headband", "earring"]);
const COLLARS = new Set(["round", "v", "polo"]);

// خلفية البورتريه حسب المركز (UXUI §3.2): لون فاتح ثابت للمركز،
// مش حسب النادي، عشان الخلفية متتغيرش لما اللاعب ينتقل.
export const POSITION_BACKGROUNDS = Object.freeze({
  goalkeeper: Object.freeze({ tint: "#fef3c7", deep: "#fde68a", label: "حارس" }),
  defence: Object.freeze({ tint: "#dbeafe", deep: "#bfdbfe", label: "دفاع" }),
  midfield: Object.freeze({ tint: "#e6f4ec", deep: "#bbf7d0", label: "وسط" }),
  attack: Object.freeze({ tint: "#fee2e2", deep: "#fecaca", label: "هجوم" })
});

export function positionKeyForRole(role) {
  const text = String(role ?? "").trim();
  if (/goalkeeper|حارس|GK/i.test(text)) return "goalkeeper";
  if (/defen|دفاع|مدافع/i.test(text)) return "defence";
  if (/midfield|وسط/i.test(text)) return "midfield";
  if (/attack|forward|striker|هجوم|مهاجم|جناح/i.test(text)) return "attack";
  return "midfield";
}

const FACE_PATHS = {
  oval: "M120 65 C91 65 78 89 81 123 C84 153 99 177 120 184 C141 177 156 153 159 123 C162 89 149 65 120 65 Z",
  round: "M120 67 C90 67 76 91 80 125 C83 153 100 176 120 181 C140 176 157 153 160 125 C164 91 150 67 120 67 Z",
  angular: "M120 62 C91 62 79 88 83 123 L92 157 Q103 176 120 184 Q137 176 148 157 L157 123 C161 88 149 62 120 62 Z",
  square: "M120 64 C91 64 78 88 81 120 L86 153 Q98 178 120 183 Q142 178 154 153 L159 120 C162 88 149 64 120 64 Z",
  long: "M120 60 C93 60 81 86 84 122 C86 152 99 180 120 190 C141 180 154 152 156 122 C159 86 147 60 120 60 Z"
};

const HAIR_PATHS = {
  curly: "M78 108 C69 86 82 55 101 49 C107 34 126 34 135 43 C155 37 171 63 163 86 L158 109 L149 93 C140 82 132 76 117 78 C103 77 92 86 85 101 Z",
  fade: "M80 105 C76 79 88 54 111 49 C132 43 153 55 160 75 L157 94 C145 82 135 76 120 77 C104 76 92 83 84 96 Z",
  wavy: "M78 108 C70 91 78 69 90 58 C101 48 111 49 118 43 C133 34 153 46 160 59 C171 73 166 94 158 108 L151 91 C142 80 128 78 116 81 C102 82 91 91 84 105 Z",
  short: "M80 105 C76 79 91 54 113 51 C136 46 155 62 160 84 L155 100 C143 86 133 82 120 82 C104 81 93 91 85 102 Z",
  buzz: "M82 102 C80 76 98 55 120 55 C143 55 158 75 158 101 L151 91 C139 81 130 78 120 78 C105 78 95 86 87 99 Z",
  long: "M76 112 C68 82 80 52 104 46 C128 40 154 52 162 78 L164 112 L156 108 L154 84 C146 70 132 66 120 66 C104 66 90 74 84 92 L82 110 Z",
  bald: "",
  "flat-top": "M84 96 L86 58 Q120 44 154 58 L156 96 L146 84 Q120 76 94 84 Z"
};

const NOSE_PATHS = {
  small: "M120 124 Q117 136 120 139",
  medium: "M120 122 Q114 139 119 143 Q123 145 127 142",
  wide: "M118 122 Q110 138 116 144 Q120 147 128 143 Q132 138 128 124"
};

const MOUTH_PATHS = {
  "slight-smile": "M108 155 Q120 161 132 155",
  neutral: "M109 157 L131 157",
  "wide-smile": "M104 154 Q120 165 136 154",
  serious: "M109 158 Q120 154 131 158"
};

const EYEBROW_WIDTHS = { thin: 2.5, medium: 4, thick: 6 };
const EYE_SHAPE_RY = { normal: 5.1, narrow: 3.4, wide: 6.6 };

let portraitSequence = 0;

// FNV-1a hash — حتمي، من غير Math.random، حتى يبقى وجه اللاعب ثابتًا
// عبر الجلسات والأجهزة حتى لو لم يُحفظ portraitSeed مع اللاعب.
// نفس اللاعب = نفس الـ seed = نفس البورتريه دائمًا (قاعدة UXUI.md §3.4).
export function derivePortraitSeed(value) {
  const text = String(value ?? "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function safeHex(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function safeChoice(value, choices, fallback) {
  return choices.has(value) ? value : fallback;
}

// الملامح الجديدة في المرحلة 3 (أنف/فم/حواجب/شكل عين/إكسسوار/ياقة):
// لاعب قديم بلا هذه الحقول تُشتق ملامحه حتميًا من الـ seed بنفس الترتيب
// الثابت — من غير Math.random، ومن غير كسر الحفظ.
function deriveMissingFeatures(seed) {
  const rng = mulberry32(seed);
  const pickFrom = (set) => {
    const list = [...set];
    return list[Math.floor(rng() * list.length)];
  };
  const accessoryRoll = rng();
  return {
    nose: pickFrom(NOSES),
    mouth: pickFrom(MOUTHS),
    eyebrows: pickFrom(EYEBROWS),
    eyeShape: pickFrom(EYE_SHAPES),
    accessory: accessoryRoll < 0.92 ? "none" : (accessoryRoll < 0.97 ? "headband" : "earring"),
    collar: pickFrom(COLLARS)
  };
}

/**
 * Produces a stable, sanitized portrait profile from a player's presentation data.
 * This is intentionally presentation-only and does not affect player attributes.
 */
export function getPortraitProfile(player = {}) {
  const appearance = player.appearance && typeof player.appearance === "object"
    ? player.appearance
    : {};
  const legacyHair = typeof player.hairStyle === "string"
    ? player.hairStyle.replace(/^hair-/, "")
    : "short";
  const shirtNumber = Number.isInteger(player.shirtNumber)
    ? Math.min(99, Math.max(1, player.shirtNumber))
    : 10;
  const seed = Number.isInteger(player.portraitSeed)
    ? player.portraitSeed
    : (typeof player.id === "string" ? derivePortraitSeed(player.id) : null);
  const derived = seed === null ? null : deriveMissingFeatures(seed);
  const pickField = (value, set, fallback) =>
    (typeof value === "string" && set.has(value)) ? value : (derived ? derived[fallback] : fallback);

  return Object.freeze({
    skin: safeHex(player.skin, "#bd8468"),
    hair: safeHex(player.hair, "#29221f"),
    kit: safeHex(player.kit, "#553c91"),
    kitLight: safeHex(player.kitLight, "#c3a6ed"),
    eyeColor: safeHex(appearance.eyeColor, "#382820"),
    eyeShape: pickField(appearance.eyeShape, EYE_SHAPES, "eyeShape"),
    faceShape: safeChoice(appearance.faceShape, FACE_SHAPES, "oval"),
    hairStyle: safeChoice(appearance.haircut ?? legacyHair, HAIR_STYLES, "short"),
    facialHair: safeChoice(appearance.facialHair, FACIAL_HAIR, "none"),
    kitPattern: safeChoice(appearance.kitPattern, KIT_PATTERNS, "solid"),
    nose: pickField(appearance.nose, NOSES, "nose"),
    mouth: pickField(appearance.mouth, MOUTHS, "mouth"),
    eyebrows: pickField(appearance.eyebrows, EYEBROWS, "eyebrows"),
    accessory: pickField(appearance.accessory, ACCESSORIES, "accessory"),
    collar: pickField(appearance.collar, COLLARS, "collar"),
    background: positionKeyForRole(player.role ?? player.position),
    shirtNumber,
    portraitAssetId: typeof player.portraitAssetId === "string"
      ? player.portraitAssetId
      : (typeof player.id === "string" ? "portrait-" + player.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-") : null),
    portraitVersion: Number.isInteger(player.portraitVersion) && player.portraitVersion > 0
      ? player.portraitVersion
      : 1,
    portraitStyle: typeof player.portraitStyle === "string" ? player.portraitStyle : "illustrated-pro",
    portraitSeed: seed
  });
}

function svgElement(tag, parent, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) element.setAttribute(name, String(value));
  }
  if (parent) parent.append(element);
  return element;
}

function addGradient(defs, id, stops, attributes = {}) {
  const gradient = svgElement("linearGradient", defs, { id, ...attributes });
  stops.forEach(([offset, color, opacity]) => {
    svgElement("stop", gradient, {
      offset,
      "stop-color": color,
      "stop-opacity": opacity ?? 1
    });
  });
  return gradient;
}

function addEye(svg, x, y, profile, id) {
  const ry = EYE_SHAPE_RY[profile.eyeShape] ?? EYE_SHAPE_RY.normal;
  svgElement("path", svg, {
    d: `M ${x - 12} ${y - 3} Q ${x} ${y - 10} ${x + 12} ${y - 3}`,
    fill: "none",
    stroke: "#38251f",
    "stroke-width": 3.1,
    "stroke-linecap": "round"
  });
  svgElement("ellipse", svg, {
    cx: x,
    cy: y + 1,
    rx: 9,
    ry,
    fill: "#f5e9d9"
  });
  svgElement("circle", svg, {
    cx: x + 0.7,
    cy: y + 1,
    r: 3.7,
    fill: profile.eyeColor
  });
  svgElement("circle", svg, {
    cx: x + 1.5,
    cy: y,
    r: 1.55,
    fill: "#17151a"
  });
  svgElement("circle", svg, {
    cx: x - 0.3,
    cy: y - 0.5,
    r: 1.15,
    fill: "#fff",
    opacity: 0.9
  });
}

function addHair(svg, profile) {
  if (profile.hairStyle === "bald") {
    // أصلع: بلا غطاء شعر — لمعة خفيفة على فروة الرأس فقط.
    svgElement("path", svg, {
      d: "M100 62 Q120 52 140 62",
      fill: "none",
      stroke: "#ffffff",
      "stroke-opacity": 0.22,
      "stroke-width": 3,
      "stroke-linecap": "round"
    });
    return;
  }

  if (profile.hairStyle === "curly") {
    for (const [cx, cy, radius] of [
      [91, 62, 12], [105, 50, 13], [120, 46, 13], [136, 50, 13],
      [151, 61, 12], [82, 79, 9], [158, 80, 9]
    ]) {
      svgElement("circle", svg, {
        cx, cy, r: radius, fill: profile.hair
      });
    }
  } else if (profile.hairStyle === "fade") {
    svgElement("path", svg, {
      d: "M81 86 Q91 68 108 66 L133 66 Q150 70 159 87 L155 111 L146 103 L142 85 Q120 74 98 87 L91 107 L84 113 Z",
      fill: profile.hair,
      opacity: 0.78
    });
  }

  svgElement("path", svg, {
    d: HAIR_PATHS[profile.hairStyle],
    fill: profile.hair
  });

  if (profile.hairStyle === "long") {
    // خصلتان جانبيتان تنزلان على جانبي الوجه.
    svgElement("path", svg, {
      d: "M78 100 Q74 140 80 168 L88 166 Q84 136 86 106 Z",
      fill: profile.hair
    });
    svgElement("path", svg, {
      d: "M162 100 Q166 140 160 168 L152 166 Q156 136 154 106 Z",
      fill: profile.hair
    });
  }

  if (profile.hairStyle === "wavy") {
    svgElement("path", svg, {
      d: "M88 67 Q99 54 108 65 T130 64 T151 69",
      fill: "none",
      stroke: "#ffffff",
      "stroke-opacity": 0.12,
      "stroke-width": 3,
      "stroke-linecap": "round"
    });
  }

  if (profile.hairStyle === "buzz") {
    svgElement("path", svg, {
      d: "M91 72 Q120 54 149 72",
      fill: "none",
      stroke: "#ffffff",
      "stroke-opacity": 0.1,
      "stroke-width": 2
    });
  }
}

function addFacialHair(svg, profile) {
  if (profile.facialHair === "none") return;

  const beardPath = profile.facialHair === "stubble"
    ? "M89 148 Q101 158 120 158 Q139 158 151 148 L147 163 Q120 176 93 163 Z"
    : profile.facialHair === "full-beard"
      ? "M84 132 Q90 153 101 160 Q120 174 139 160 Q150 153 156 132 L151 164 Q139 187 120 190 Q101 187 89 164 Z"
      : "M88 143 Q100 154 120 154 Q140 154 152 143 L147 162 Q137 176 120 177 Q103 176 93 162 Z";

  svgElement("path", svg, {
    d: beardPath,
    fill: profile.hair,
    opacity: profile.facialHair === "stubble" ? 0.3 : 0.92
  });

  if (profile.facialHair === "short-beard" || profile.facialHair === "full-beard") {
    svgElement("path", svg, {
      d: "M105 161 Q120 166 135 161",
      fill: "none",
      stroke: "#ffffff",
      "stroke-opacity": 0.13,
      "stroke-width": 2,
      "stroke-linecap": "round"
    });
  }
}

/**
 * Creates an original inline SVG football portrait.
 * The player identity remains visible to assistive technology through the wrapper.
 */
export function createPlayerPortrait(player, { featured = false } = {}) {
  if (typeof document === "undefined") {
    throw new Error("رسم اللاعب يحتاج إلى بيئة متصفح.");
  }

  const profile = getPortraitProfile(player);
  const sequence = ++portraitSequence;
  const gradientId = `portrait-bg-${sequence}`;
  const faceId = `portrait-face-${sequence}`;
  const faceGlowId = `portrait-face-glow-${sequence}`;
  const shirtClipId = `portrait-shirt-${sequence}`;

  const wrapper = document.createElement("div");
  wrapper.className = featured
    ? "player-portrait is-featured"
    : "player-portrait";
  wrapper.setAttribute("role", "img");
  wrapper.setAttribute("aria-label", "رسم اللاعب " + (player?.name || "لاعب"));
  wrapper.dataset.portraitAssetId = profile.portraitAssetId || "portrait-unassigned";
  wrapper.dataset.portraitVersion = String(profile.portraitVersion);
  wrapper.dataset.portraitStyle = profile.portraitStyle;
  wrapper.dataset.portraitSeed = profile.portraitSeed === null ? "" : String(profile.portraitSeed);
  wrapper.dataset.role = typeof player?.role === "string" ? player.role : "";
  wrapper.dataset.hairStyle = profile.hairStyle;
  wrapper.dataset.faceShape = profile.faceShape;
  wrapper.dataset.facialHair = profile.facialHair;
  wrapper.dataset.kitPattern = profile.kitPattern;
  wrapper.dataset.nose = profile.nose;
  wrapper.dataset.mouth = profile.mouth;
  wrapper.dataset.background = profile.background;
  wrapper.dataset.accessory = profile.accessory;
  // وصف أغنى لقارئ الشاشة (UXUI §4.3): المركز والعمر مع الاسم.
  const positionLabel = POSITION_BACKGROUNDS[profile.background]?.label ?? "";
  const descriptionParts = [positionLabel, Number.isInteger(player?.age) ? player.age + " سنة" : ""].filter(Boolean);
  if (descriptionParts.length > 0) {
    wrapper.setAttribute("aria-description", "بورتريه اللاعب " + (player?.name || "لاعب") + "، " + descriptionParts.join("، "));
  }

  const background = POSITION_BACKGROUNDS[profile.background] ?? POSITION_BACKGROUNDS.midfield;

  const svg = svgElement("svg", wrapper, {
    class: "portrait-svg",
    viewBox: "0 0 240 300",
    role: "presentation",
    "aria-hidden": "true",
    focusable: "false",
    preserveAspectRatio: "xMidYMid slice"
  });

  const defs = svgElement("defs", svg);
  addGradient(defs, gradientId, [
    ["0%", background.tint], ["100%", background.deep]
  ], { x1: "0", y1: "0", x2: "0.8", y2: "1" });
  addGradient(defs, faceId, [
    ["0%", profile.skin], ["55%", profile.skin], ["100%", "#7f4e3d", 0.95]
  ], { x1: "0", y1: "0", x2: "1", y2: "0.7" });
  const faceGlow = svgElement("radialGradient", defs, {
    id: faceGlowId, cx: "34%", cy: "24%", r: "78%"
  });
  svgElement("stop", faceGlow, {
    offset: "0%", "stop-color": "#fff6e9", "stop-opacity": 0.24
  });
  svgElement("stop", faceGlow, {
    offset: "54%", "stop-color": "#fff6e9", "stop-opacity": 0.055
  });
  svgElement("stop", faceGlow, {
    offset: "100%", "stop-color": "#fff6e9", "stop-opacity": 0
  });

  const shirtPath = "M82 183 Q94 178 105 180 L120 190 L135 180 Q148 178 158 183 C181 188 198 199 209 221 L231 300 H9 L31 221 C42 199 59 188 82 183 Z";
  const shirtClip = svgElement("clipPath", defs, { id: shirtClipId });
  svgElement("path", shirtClip, { d: shirtPath });

  svgElement("rect", svg, { width: 240, height: 300, fill: `url(#${gradientId})` });
  svgElement("ellipse", svg, {
    cx: 120, cy: 104, rx: 106, ry: 117,
    fill: "#ffffff", opacity: 0.45
  });
  svgElement("path", svg, {
    d: "M0 228 Q48 194 91 216 T180 213 T240 221 V300 H0 Z",
    fill: background.deep,
    opacity: 0.45
  });

  for (let index = 0; index < 6; index += 1) {
    svgElement("path", svg, {
      d: `M${-38 + index * 16} 0 L${42 + index * 16} 0 L${-12 + index * 16} 182 L${-88 + index * 16} 182 Z`,
      fill: "#ffffff",
      opacity: 0.018
    });
  }

  const athlete = svgElement("g", svg, { class: "portrait-athlete" });

  svgElement("path", athlete, {
    d: "M92 160 L148 160 L153 202 Q120 220 87 202 Z",
    fill: profile.skin
  });
  svgElement("path", athlete, {
    d: "M82 183 Q66 185 53 199 L37 228 L67 242 L91 210 Z",
    fill: profile.skin
  });
  svgElement("path", athlete, {
    d: "M158 183 Q174 185 187 199 L203 228 L173 242 L149 210 Z",
    fill: profile.skin
  });
  svgElement("path", athlete, {
    d: shirtPath,
    fill: profile.kit
  });
  const shirtDetails = svgElement("g", athlete, { "clip-path": `url(#${shirtClipId})` });

  if (profile.kitPattern === "stripes") {
    [-38, 0, 38].forEach((offset) => {
      svgElement("path", shirtDetails, {
        d: `M${120 + offset} 178 L${151 + offset} 178 L${192 + offset} 306 L${161 + offset} 306 Z`,
        fill: profile.kitLight,
        opacity: 0.86
      });
    });
  } else if (profile.kitPattern === "sash") {
    svgElement("path", shirtDetails, {
      d: "M52 186 L82 178 L192 299 L158 306 Z",
      fill: profile.kitLight,
      opacity: 0.9
    });
  } else if (profile.kitPattern === "chevron") {
    svgElement("path", shirtDetails, {
      d: "M78 190 L120 218 L162 190 L177 205 L120 248 L63 205 Z",
      fill: profile.kitLight,
      opacity: 0.86
    });
  } else {
    svgElement("path", shirtDetails, {
      d: "M48 221 Q120 240 192 221",
      fill: "none",
      stroke: profile.kitLight,
      "stroke-width": 3,
      opacity: 0.48
    });
  }

  // الياقة: 3 أنماط (UXUI §3.3 — الطبقة 2).
  if (profile.collar === "polo") {
    svgElement("path", athlete, {
      d: "M100 180 L140 180 L140 193 L100 193 Z",
      fill: profile.kitLight,
      opacity: 0.9
    });
    svgElement("circle", athlete, { cx: 120, cy: 187, r: 1.8, fill: "#ffffff", opacity: 0.9 });
  } else if (profile.collar === "round") {
    svgElement("path", athlete, {
      d: "M102 182 Q120 201 138 182",
      fill: "none",
      stroke: profile.kitLight,
      "stroke-width": 5,
      "stroke-linecap": "round"
    });
  } else {
    svgElement("path", athlete, {
      d: "M103 183 L120 198 L137 183",
      fill: "none",
      stroke: profile.kitLight,
      "stroke-width": 5,
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    svgElement("path", athlete, {
      d: "M108 185 L120 195 L132 185",
      fill: "none",
      stroke: "#ffffff",
      "stroke-opacity": 0.3,
      "stroke-width": 1.25,
      "stroke-linecap": "round"
    });
  }
  svgElement("path", athlete, {
    d: "M55 205 Q67 194 84 193 M185 193 Q202 194 213 205",
    fill: "none",
    stroke: profile.kitLight,
    "stroke-opacity": 0.3,
    "stroke-width": 2,
    "stroke-linecap": "round"
  });
  svgElement("path", athlete, {
    d: "M89 194 L100 300 M151 194 L140 300",
    fill: "none",
    stroke: profile.kitLight,
    "stroke-width": 2,
    opacity: 0.34
  });
  const badge = svgElement("g", athlete, { class: "portrait-shirt-badge" });
  svgElement("path", badge, {
    d: "M151 207 L169 207 L167 225 L160 231 L153 225 Z",
    fill: profile.kitLight,
    stroke: "#ffffff",
    "stroke-opacity": 0.56,
    "stroke-width": 1.2
  });
  svgElement("path", badge, {
    d: "M157 212 L163 212 L162 220 L160 222 L158 220 Z",
    fill: profile.kit
  });
  svgElement("circle", badge, {
    cx: 160, cy: 216, r: 2, fill: "#ffffff", opacity: 0.9
  });

  svgElement("text", athlete, {
    x: 120, y: 265,
    "text-anchor": "middle",
    fill: "#ffffff",
    "fill-opacity": 0.88,
    "font-size": 34,
    "font-family": "Arial, sans-serif",
    "font-weight": 900
  }).textContent = String(profile.shirtNumber);

  svgElement("ellipse", athlete, {
    cx: 120, cy: 121, rx: 46, ry: 66,
    fill: "#0a101c", opacity: 0.12
  });
  svgElement("ellipse", athlete, {
    cx: 78, cy: 126, rx: 9, ry: 16,
    fill: profile.skin
  });
  svgElement("ellipse", athlete, {
    cx: 162, cy: 126, rx: 9, ry: 16,
    fill: profile.skin
  });
  svgElement("path", athlete, {
    d: FACE_PATHS[profile.faceShape],
    fill: `url(#${faceId})`
  });
  svgElement("path", athlete, {
    d: FACE_PATHS[profile.faceShape],
    fill: `url(#${faceGlowId})`
  });
  svgElement("path", athlete, {
    d: "M91 139 Q100 145 109 139 M131 139 Q140 145 149 139",
    fill: "none",
    stroke: "#8d5145",
    "stroke-opacity": 0.13,
    "stroke-width": 4.5,
    "stroke-linecap": "round"
  });
  svgElement("path", athlete, {
    d: "M96 146 Q102 149 108 146 M132 146 Q138 149 144 146",
    fill: "none",
    stroke: "#fff2e2",
    "stroke-opacity": 0.16,
    "stroke-width": 2,
    "stroke-linecap": "round"
  });
  svgElement("path", athlete, {
    d: "M85 119 Q88 151 105 169",
    fill: "none",
    stroke: "#6f453a",
    "stroke-opacity": 0.2,
    "stroke-width": 4,
    "stroke-linecap": "round"
  });
  svgElement("path", athlete, {
    d: "M155 119 Q152 151 135 169",
    fill: "none",
    stroke: "#fff2e2",
    "stroke-opacity": 0.15,
    "stroke-width": 4,
    "stroke-linecap": "round"
  });

  svgElement("path", athlete, {
    d: "M88 137 Q93 150 103 153 M152 137 Q147 150 137 153",
    fill: "none",
    stroke: "#754a3c",
    "stroke-opacity": 0.17,
    "stroke-width": 5,
    "stroke-linecap": "round"
  });
  addEye(athlete, 102, 119, profile);
  addEye(athlete, 138, 119, profile);
  svgElement("path", athlete, {
    d: "M90 108 Q101 101 112 107 M128 107 Q140 101 150 108",
    fill: "none",
    stroke: profile.hair,
    "stroke-width": EYEBROW_WIDTHS[profile.eyebrows] ?? EYEBROW_WIDTHS.medium,
    "stroke-linecap": "round"
  });
  svgElement("path", athlete, {
    d: NOSE_PATHS[profile.nose] ?? NOSE_PATHS.medium,
    fill: "none",
    stroke: "#794f41",
    "stroke-opacity": 0.66,
    "stroke-width": 2.6,
    "stroke-linecap": "round"
  });
  svgElement("path", athlete, {
    d: "M121 125 Q117 137 120 140",
    fill: "none",
    stroke: "#fff3e5",
    "stroke-opacity": 0.34,
    "stroke-width": 1.45,
    "stroke-linecap": "round"
  });
  svgElement("path", athlete, {
    d: MOUTH_PATHS[profile.mouth] ?? MOUTH_PATHS["slight-smile"],
    fill: "none",
    stroke: "#713a3b",
    "stroke-width": 2.8,
    "stroke-linecap": "round"
  });

  addFacialHair(athlete, profile);
  addHair(athlete, profile);

  // إكسسوار نادر فقط (UXUI §3.3 — الطبقة 12): عصابة رأس أو حلق صغير.
  // ممنوع نظارة شمس أو وشم وجه — لا توجد قيمة تنتجهما أصلًا.
  if (profile.accessory === "headband") {
    svgElement("path", athlete, {
      d: "M82 98 Q120 80 158 98 L156 109 Q120 93 84 109 Z",
      fill: profile.kitLight,
      opacity: 0.95
    });
  } else if (profile.accessory === "earring") {
    svgElement("circle", athlete, {
      cx: 78, cy: 141, r: 3, fill: "#e3b94e", stroke: "#ffffff", "stroke-width": 0.8
    });
  }

  svgElement("path", athlete, {
    d: "M101 179 Q120 190 139 179",
    fill: "none",
    stroke: "#fff0df",
    "stroke-opacity": 0.2,
    "stroke-width": 3
  });
  svgElement("path", svg, {
    d: "M0 0 H240 V300 H0 Z",
    fill: "none",
    stroke: "#ffffff",
    "stroke-opacity": 0.08,
    "stroke-width": 2
  });

  return wrapper;
}
