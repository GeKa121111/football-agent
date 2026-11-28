// اختبارات Accessibility — المرحلة 3 (UXUI §4).
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseHexColor,
  relativeLuminance,
  contrastRatio,
  meetsContrastRatio,
  auditContrastPairs,
  isTouchTargetBigEnough,
  WAKIL_TOKENS_LIGHT,
  WAKIL_TOKENS_DARK,
  WCAG_AA_NORMAL,
  MIN_TOUCH_TARGET_PX
} from "../src/ui/a11y.js";

test("contrast math matches the WCAG reference values", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
  assert.ok(Math.abs(contrastRatio("#767676", "#ffffff") - 4.54) < 0.05);
  assert.deepEqual(parseHexColor("#abc"), [170, 187, 204]);
  assert.equal(parseHexColor("red"), null);
  assert.equal(contrastRatio("red", "#ffffff"), null);
  assert.equal(relativeLuminance([255, 255, 255]), 1);
  assert.equal(relativeLuminance([0, 0, 0]), 0);
  assert.equal(meetsContrastRatio("#1a2420", "#ffffff", WCAG_AA_NORMAL), true);
  assert.equal(meetsContrastRatio("#c9972b", "#ffffff", WCAG_AA_NORMAL), false);
});

test("every WAKIL token pair passes its WCAG AA bar in the light theme", () => {
  const results = auditContrastPairs(WAKIL_TOKENS_LIGHT);
  for (const result of results) {
    assert.equal(result.pass, true,
      result.label + ": " + result.foregroundValue + " on " + result.backgroundValue +
      " = " + (result.ratio === null ? "?" : result.ratio.toFixed(2)) +
      " (needs " + result.minRatio + ")");
  }
});

test("every WAKIL token pair passes its WCAG AA bar in the dark theme", () => {
  const results = auditContrastPairs(WAKIL_TOKENS_DARK);
  for (const result of results) {
    assert.equal(result.pass, true,
      result.label + ": " + result.foregroundValue + " on " + result.backgroundValue +
      " = " + (result.ratio === null ? "?" : result.ratio.toFixed(2)) +
      " (needs " + result.minRatio + ")");
  }
});

test("gold is decorative only, never body text (measured 2.64:1, not 2.9:1)", () => {
  // الذهبي #c9972b على الأبيض 2.64:1 — تحت 4.5:1، وتحت 3:1 أيضًا، لذلك
  // التصميم يمنع استخدامه كنص إطلاقًا (UXUI §1.2 ذكر 2.9:1 خطأً؛
  // القياس هنا 2.64:1). الذهبي الداكن في الوضع الداكن يحقق 4.5:1+.
  const goldOnWhite = contrastRatio(WAKIL_TOKENS_LIGHT["--wakil-gold"], "#ffffff");
  assert.ok(Math.abs(goldOnWhite - 2.64) < 0.05, "gold on white = " + goldOnWhite.toFixed(2));
  assert.ok(goldOnWhite < WCAG_AA_NORMAL);
  const goldDark = contrastRatio(WAKIL_TOKENS_DARK["--wakil-gold"], WAKIL_TOKENS_DARK["--wakil-surface"]);
  assert.ok(goldDark >= WCAG_AA_NORMAL, "dark gold on dark surface = " + goldDark.toFixed(2));
});

test("touch targets meet the 48px minimum", () => {
  assert.equal(MIN_TOUCH_TARGET_PX, 48);
  assert.equal(isTouchTargetBigEnough(48, 48), true);
  assert.equal(isTouchTargetBigEnough(60, 48), true);
  assert.equal(isTouchTargetBigEnough(47, 48), false);
  assert.equal(isTouchTargetBigEnough(48, 32), false);
  assert.equal(isTouchTargetBigEnough("wide", 48), false);
});
