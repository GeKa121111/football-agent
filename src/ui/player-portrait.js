const SVG_NS = "http://www.w3.org/2000/svg";

const HAIR_STYLES = new Set(["curly", "fade", "wavy", "short", "buzz"]);
const FACE_SHAPES = new Set(["oval", "round", "angular", "square"]);
const FACIAL_HAIR = new Set(["none", "stubble", "short-beard", "full-beard"]);
const KIT_PATTERNS = new Set(["solid", "stripes", "sash", "chevron"]);

const FACE_PATHS = {
  oval: "M120 65 C91 65 78 89 81 123 C84 153 99 177 120 184 C141 177 156 153 159 123 C162 89 149 65 120 65 Z",
  round: "M120 67 C90 67 76 91 80 125 C83 153 100 176 120 181 C140 176 157 153 160 125 C164 91 150 67 120 67 Z",
  angular: "M120 62 C91 62 79 88 83 123 L92 157 Q103 176 120 184 Q137 176 148 157 L157 123 C161 88 149 62 120 62 Z",
  square: "M120 64 C91 64 78 88 81 120 L86 153 Q98 178 120 183 Q142 178 154 153 L159 120 C162 88 149 64 120 64 Z"
};

const HAIR_PATHS = {
  curly: "M78 108 C69 86 82 55 101 49 C107 34 126 34 135 43 C155 37 171 63 163 86 L158 109 L149 93 C140 82 132 76 117 78 C103 77 92 86 85 101 Z",
  fade: "M80 105 C76 79 88 54 111 49 C132 43 153 55 160 75 L157 94 C145 82 135 76 120 77 C104 76 92 83 84 96 Z",
  wavy: "M78 108 C70 91 78 69 90 58 C101 48 111 49 118 43 C133 34 153 46 160 59 C171 73 166 94 158 108 L151 91 C142 80 128 78 116 81 C102 82 91 91 84 105 Z",
  short: "M80 105 C76 79 91 54 113 51 C136 46 155 62 160 84 L155 100 C143 86 133 82 120 82 C104 81 93 91 85 102 Z",
  buzz: "M82 102 C80 76 98 55 120 55 C143 55 158 75 158 101 L151 91 C139 81 130 78 120 78 C105 78 95 86 87 99 Z"
};

let portraitSequence = 0;

function safeHex(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function safeChoice(value, choices, fallback) {
  return choices.has(value) ? value : fallback;
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

  return Object.freeze({
    skin: safeHex(player.skin, "#bd8468"),
    hair: safeHex(player.hair, "#29221f"),
    kit: safeHex(player.kit, "#553c91"),
    kitLight: safeHex(player.kitLight, "#c3a6ed"),
    eyeColor: safeHex(appearance.eyeColor, "#382820"),
    faceShape: safeChoice(appearance.faceShape, FACE_SHAPES, "oval"),
    hairStyle: safeChoice(appearance.haircut ?? legacyHair, HAIR_STYLES, "short"),
    facialHair: safeChoice(appearance.facialHair, FACIAL_HAIR, "none"),
    kitPattern: safeChoice(appearance.kitPattern, KIT_PATTERNS, "solid"),
    shirtNumber
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
    ry: 5.1,
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
  const shirtClipId = `portrait-shirt-${sequence}`;

  const wrapper = document.createElement("div");
  wrapper.className = featured
    ? "player-portrait is-featured"
    : "player-portrait";
  wrapper.setAttribute("role", "img");
  wrapper.setAttribute("aria-label", "رسم اللاعب " + (player?.name || "لاعب"));
  wrapper.dataset.hairStyle = profile.hairStyle;
  wrapper.dataset.faceShape = profile.faceShape;
  wrapper.dataset.facialHair = profile.facialHair;
  wrapper.dataset.kitPattern = profile.kitPattern;

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
    ["0%", "#34445f"], ["52%", "#1d2b45"], ["100%", "#111a2d"]
  ], { x1: "0", y1: "0", x2: "0.8", y2: "1" });
  addGradient(defs, faceId, [
    ["0%", profile.skin], ["55%", profile.skin], ["100%", "#7f4e3d", 0.95]
  ], { x1: "0", y1: "0", x2: "1", y2: "0.7" });

  const shirtPath = "M82 183 Q94 178 105 180 L120 190 L135 180 Q148 178 158 183 C181 188 198 199 209 221 L231 300 H9 L31 221 C42 199 59 188 82 183 Z";
  const shirtClip = svgElement("clipPath", defs, { id: shirtClipId });
  svgElement("path", shirtClip, { d: shirtPath });

  svgElement("rect", svg, { width: 240, height: 300, fill: `url(#${gradientId})` });
  svgElement("ellipse", svg, {
    cx: 120, cy: 104, rx: 106, ry: 117,
    fill: profile.kitLight, opacity: 0.1
  });
  svgElement("path", svg, {
    d: "M0 228 Q48 194 91 216 T180 213 T240 221 V300 H0 Z",
    fill: "#0c1526",
    opacity: 0.62
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

  svgElement("path", athlete, {
    d: "M103 183 L120 198 L137 183",
    fill: "none",
    stroke: profile.kitLight,
    "stroke-width": 5,
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  });
  svgElement("path", athlete, {
    d: "M89 194 L100 300 M151 194 L140 300",
    fill: "none",
    stroke: profile.kitLight,
    "stroke-width": 2,
    opacity: 0.34
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

  addEye(athlete, 102, 119, profile);
  addEye(athlete, 138, 119, profile);
  svgElement("path", athlete, {
    d: "M90 108 Q101 101 112 107 M128 107 Q140 101 150 108",
    fill: "none",
    stroke: profile.hair,
    "stroke-width": 4,
    "stroke-linecap": "round"
  });
  svgElement("path", athlete, {
    d: "M120 122 Q114 139 119 143 Q123 145 127 142",
    fill: "none",
    stroke: "#794f41",
    "stroke-opacity": 0.66,
    "stroke-width": 2.6,
    "stroke-linecap": "round"
  });
  svgElement("path", athlete, {
    d: "M108 155 Q120 161 132 155",
    fill: "none",
    stroke: "#713a3b",
    "stroke-width": 2.8,
    "stroke-linecap": "round"
  });

  addFacialHair(athlete, profile);
  addHair(athlete, profile);

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
