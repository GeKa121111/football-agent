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

export function mountWakil(doc = document, storage) {
  if (!isWakilEnabled(storage)) return false;
  doc.documentElement.classList.add("wakil-ui");
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
