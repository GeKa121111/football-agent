// هوية «وَكِيل — WAKIL» — Feature Flag + ملخص شاشة "اليوم".
// الـ Flag: localStorage "football-agent.wakil-ui" — القيمة "0"/"false" توقف
// هوية وكيل، وأي قيمة أخرى (أو غياب القيمة) تفعّلها. الإيقاف يعيد الواجهة
// القديمة دون أي تغيير في الحفظ أو المحركات.
export const WAKIL_FLAG_KEY = "football-agent.wakil-ui";

export function isWakilEnabled(storage) {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(WAKIL_FLAG_KEY);
    return value !== "0" && value !== "false";
  } catch {
    return true;
  }
}

export function setWakilEnabled(enabled, storage) {
  try {
    (storage ?? globalThis.localStorage)?.setItem(WAKIL_FLAG_KEY, enabled ? "1" : "0");
  } catch {
    // التخزين غير متاح — يبقى الوضع الافتراضي (مفعّل).
  }
  return Boolean(enabled);
}

// الثيم — Dark Mode (المرحلة 3، UXUI §1.2):
// localStorage "football-agent.theme": ‏"auto" (افتراضي — يتبع النظام) أو
// "light" أو "dark". القيمة الفاسدة تُعامل كـ auto. التطبيق على
// documentElement بكلاس "wakil-dark" بجانب "wakil-ui".
export const WAKIL_THEME_KEY = "football-agent.theme";
export const WAKIL_THEMES = Object.freeze(["auto", "light", "dark"]);

export function getWakilTheme(storage) {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(WAKIL_THEME_KEY);
    return WAKIL_THEMES.includes(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

export function setWakilTheme(theme, storage) {
  const value = WAKIL_THEMES.includes(theme) ? theme : "auto";
  try {
    (storage ?? globalThis.localStorage)?.setItem(WAKIL_THEME_KEY, value);
  } catch {
    // التخزين غير متاح — يبقى الوضع الافتراضي (auto).
  }
  return value;
}

export function prefersDarkColorScheme(doc = globalThis.document) {
  try {
    return Boolean(doc?.defaultView?.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
  } catch {
    return false;
  }
}

export function resolveWakilTheme(theme, doc = globalThis.document) {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  return prefersDarkColorScheme(doc) ? "dark" : "light";
}

export function applyWakilTheme(theme, doc = globalThis.document, storage) {
  const resolved = resolveWakilTheme(theme ?? getWakilTheme(storage), doc);
  const classList = doc?.documentElement?.classList;
  if (!classList) return resolved;
  if (resolved === "dark") classList.add("wakil-dark");
  else classList.remove("wakil-dark");
  return resolved;
}

// يعيد الوضع الحقيقي للتبديل (للأيقونة): auto→ ما يتبعه النظام الآن.
export function toggleWakilTheme(storage, doc = globalThis.document) {
  const current = getWakilTheme(storage);
  const next = resolveWakilTheme(current, doc) === "dark" ? "light" : "dark";
  setWakilTheme(next, storage);
  applyWakilTheme(next, doc, storage);
  return next;
}

// مستمع لتغير إعداد النظام — يعمل فقط حين الثيم "auto".
// يعيد دالة إلغاء الاشتراك (أو null إن لم يكن matchMedia متاحًا).
export function watchSystemTheme(storage, doc = globalThis.document, onChange) {
  try {
    const media = doc?.defaultView?.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return null;
    const listener = () => {
      if (getWakilTheme(storage) !== "auto") return;
      const resolved = applyWakilTheme("auto", doc, storage);
      if (typeof onChange === "function") onChange(resolved);
    };
    if (typeof media.addEventListener === "function") media.addEventListener("change", listener);
    else if (typeof media.addListener === "function") media.addListener(listener);
    return () => {
      if (typeof media.removeEventListener === "function") media.removeEventListener("change", listener);
      else if (typeof media.removeListener === "function") media.removeListener(listener);
    };
  } catch {
    return null;
  }
}

export function mountWakil(doc = globalThis.document, storage) {
  if (!isWakilEnabled(storage)) return false;
  doc.documentElement.classList.add("wakil-ui");
  applyWakilTheme(getWakilTheme(storage), doc, storage);
  return true;
}

// ملخص بيانات شاشة "اليوم" — دالة pure بلا DOM، لتستخدمها شاشة اليوم
// في المرحلة 2. القرار قبل المعلومة: كم قرار معلّق، وكم عرض نشط.
export function getTodaySummary(save = {}) {
  const career = save.career ?? {};
  const agency = save.agency ?? {};
  const world = save.world ?? {};
  const activeOffers = Array.isArray(world.activeOffers) ? world.activeOffers.length : 0;
  const clients = Array.isArray(agency.clients) ? agency.clients.length : 0;
  return {
    currentDate: world.currentDate ?? null,
    season: career.season ?? 1,
    week: career.week ?? 1,
    day: career.day ?? 1,
    balance: typeof agency.balance === "number" ? agency.balance : 0,
    clientsCount: clients,
    activeOffersCount: activeOffers,
    hasDecisions: activeOffers > 0
  };
}
