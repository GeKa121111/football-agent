// أدوات Accessibility — المرحلة 3 (UXUI §4).
// حسابات تباين WCAG 2.1 النقية + تدقيق أزواج توكنز وكيل (فاتح وداكن)
// + حد هدف اللمس 48px. لا DOM هنا؛ مواصفة المتصفح
// (tests/e2e/wakil-a11y.spec.js) تقرأ القيم المحسوبة من المتصفح نفسه.
export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AA_LARGE = 3;
export const WCAG_AAA_NORMAL = 7;
export const MIN_TOUCH_TARGET_PX = 48;

// أزواج نص/خلفية التي يجب أن تحقق WCAG AA في كل ثيم — أسماء متغيرات
// --wakil-* كما في src/styles/wakil.css (الفاتح) وتجاوز .wakil-dark.
export const WAKIL_CONTRAST_PAIRS = Object.freeze([
  Object.freeze({ foreground: "--wakil-ink", background: "--wakil-surface", minRatio: WCAG_AA_NORMAL, label: "نص على سطح" }),
  Object.freeze({ foreground: "--wakil-ink", background: "--wakil-paper", minRatio: WCAG_AA_NORMAL, label: "نص على ورق" }),
  Object.freeze({ foreground: "--wakil-ink-soft", background: "--wakil-surface", minRatio: WCAG_AA_NORMAL, label: "نص صامت على سطح" }),
  Object.freeze({ foreground: "--wakil-ink-soft", background: "--wakil-surface-muted", minRatio: WCAG_AA_NORMAL, label: "نص صامت على سطح صامت" }),
  Object.freeze({ foreground: "--wakil-green", background: "--wakil-surface", minRatio: WCAG_AA_NORMAL, label: "أخضر على سطح" }),
  Object.freeze({ foreground: "--wakil-green-deep", background: "--wakil-surface", minRatio: WCAG_AA_NORMAL, label: "أخضر داكن على سطح" }),
  // ملاحظة: الذهبي ليس في القائمة عمدًا — نسبة #c9972b على الأبيض 2.64:1
  // (لا 2.9:1 كما ورد في UXUI §1.2 — قيست هنا)، فهو زخرفي فقط
  // (نجوم/مونوجرام) ولا يُستخدم كنص أبدًا. الذهبي الداكن #e3b94e
  // على سطح داكن يحقق 4.5:1+، لكنه يبقى زخرفيًا في الفاتح.
  Object.freeze({ foreground: "--wakil-danger", background: "--wakil-surface", minRatio: WCAG_AA_NORMAL, label: "أحمر على سطح" }),
  Object.freeze({ foreground: "--wakil-danger-dark", background: "--wakil-danger-bg", minRatio: WCAG_AA_NORMAL, label: "أحمر داكن على خلفية خطر" }),
  Object.freeze({ foreground: "--wakil-success", background: "--wakil-surface", minRatio: WCAG_AA_NORMAL, label: "أخضر نجاح على سطح" }),
  Object.freeze({ foreground: "--wakil-success-dark", background: "--wakil-success-bg", minRatio: WCAG_AA_NORMAL, label: "أخضر داكن على خلفية نجاح" }),
  Object.freeze({ foreground: "--wakil-warning", background: "--wakil-surface", minRatio: WCAG_AA_NORMAL, label: "كهرماني على سطح" }),
  Object.freeze({ foreground: "--wakil-warning-dark", background: "--wakil-warning-bg", minRatio: WCAG_AA_NORMAL, label: "كهرماني داكن على خلفية تحذير" }),
  Object.freeze({ foreground: "--wakil-info-dark", background: "--wakil-info-bg", minRatio: WCAG_AA_NORMAL, label: "أزرق داكن على خلفية معلومات" }),
  Object.freeze({ foreground: "--wakil-surface", background: "--wakil-green", minRatio: WCAG_AA_NORMAL, label: "أبيض على زر أخضر" }),
  Object.freeze({ foreground: "--wakil-ink", background: "--wakil-green-light", minRatio: WCAG_AA_NORMAL, label: "نص على خلفية خضراء فاتحة" })
]);

// قيم التوكنز كما في wakil.css — مرجع للاختبارات (المتصفح هو مصدر الحقيقة
// في مواصفة e2e؛ هذه القيم للتدقيق دون متصفح).
export const WAKIL_TOKENS_LIGHT = Object.freeze({
  "--wakil-green": "#0e7a4d",
  "--wakil-green-deep": "#0a5c3a",
  "--wakil-green-light": "#e6f4ec",
  "--wakil-gold": "#c9972b",
  "--wakil-gold-light": "#fdf3d7",
  "--wakil-paper": "#f7f8f5",
  "--wakil-surface": "#ffffff",
  "--wakil-surface-muted": "#eef0ec",
  "--wakil-ink": "#1a2420",
  "--wakil-ink-soft": "#5c6b64",
  "--wakil-border": "#dde3de",
  "--wakil-success": "#15803d",
  "--wakil-success-dark": "#14532d",
  "--wakil-success-bg": "#dcfce7",
  "--wakil-warning": "#b45309",
  "--wakil-warning-dark": "#78350f",
  "--wakil-warning-bg": "#fef3c7",
  "--wakil-danger": "#b91c1c",
  "--wakil-danger-dark": "#7f1d1d",
  "--wakil-danger-bg": "#fee2e2",
  "--wakil-info": "#1d4ed8",
  "--wakil-info-dark": "#1e3a8a",
  "--wakil-info-bg": "#dbeafe"
});

export const WAKIL_TOKENS_DARK = Object.freeze({
  "--wakil-green": "#2fbf7f",
  "--wakil-green-deep": "#7ee2ae",
  "--wakil-green-light": "#1d3a2c",
  "--wakil-gold": "#e3b94e",
  "--wakil-gold-light": "#3a2f10",
  "--wakil-paper": "#0f1713",
  "--wakil-surface": "#182420",
  "--wakil-surface-muted": "#223129",
  "--wakil-ink": "#edf2ee",
  "--wakil-ink-soft": "#9aa8a0",
  "--wakil-border": "#2e3d34",
  "--wakil-success": "#4ade80",
  "--wakil-success-dark": "#86efac",
  "--wakil-success-bg": "#14331f",
  "--wakil-warning": "#fbbf24",
  "--wakil-warning-dark": "#fcd34d",
  "--wakil-warning-bg": "#3a2a10",
  "--wakil-danger": "#f87171",
  "--wakil-danger-dark": "#fca5a5",
  "--wakil-danger-bg": "#3f1d1d",
  "--wakil-info": "#60a5fa",
  "--wakil-info-dark": "#93c5fd",
  "--wakil-info-bg": "#17233f"
});

export function parseHexColor(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) hex = [...hex].map((digit) => digit + digit).join("");
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ];
}

// الإضاءة النسبية WCAG 2.1 (sRGB).
export function relativeLuminance(rgb) {
  if (!Array.isArray(rgb) || rgb.length !== 3) return null;
  const linear = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastRatio(foreground, background) {
  const fg = parseHexColor(foreground);
  const bg = parseHexColor(background);
  if (!fg || !bg) return null;
  const lumFg = relativeLuminance(fg);
  const lumBg = relativeLuminance(bg);
  if (lumFg === null || lumBg === null) return null;
  return (Math.max(lumFg, lumBg) + 0.05) / (Math.min(lumFg, lumBg) + 0.05);
}

export function meetsContrastRatio(foreground, background, minRatio = WCAG_AA_NORMAL) {
  const ratio = contrastRatio(foreground, background);
  return ratio !== null && ratio >= minRatio;
}

// تدقيق كل أزواج وكيل على خريطة قيم {--var: "#hex"} — يعيد نتيجة لكل زوج.
export function auditContrastPairs(values = {}) {
  return WAKIL_CONTRAST_PAIRS.map((pair) => {
    const foreground = values[pair.foreground] ?? null;
    const background = values[pair.background] ?? null;
    const ratio = foreground && background ? contrastRatio(foreground, background) : null;
    return {
      ...pair,
      foregroundValue: foreground,
      backgroundValue: background,
      ratio,
      pass: ratio !== null && ratio >= pair.minRatio
    };
  });
}

export function isTouchTargetBigEnough(width, height, minPx = MIN_TOUCH_TARGET_PX) {
  const w = Number(width);
  const h = Number(height);
  return Number.isFinite(w) && Number.isFinite(h) && w >= minPx && h >= minPx;
}
