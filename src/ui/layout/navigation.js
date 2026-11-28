export const NAV_ITEMS = Object.freeze([
  Object.freeze({ id: "dashboard", label: "اليوم", icon: "⌂", hint: "قرارات اليوم" }),
  Object.freeze({ id: "players", label: "اللاعبون", icon: "◉", hint: "قاعدة المواهب" }),
  Object.freeze({ id: "scouting", label: "الكشافون", icon: "⌕", hint: "اكتشاف اللاعبين" }),
  Object.freeze({ id: "football", label: "المباريات", icon: "⚽", hint: "الموسم والتدريب" }),
  Object.freeze({ id: "market", label: "الانتقالات", icon: "⇄", hint: "فرص السوق" }),
  Object.freeze({ id: "agency", label: "الوكالة", icon: "▦", hint: "إدارة العملاء" }),
  Object.freeze({ id: "calendar", label: "التقويم", icon: "◷", hint: "الموسم والعقود" })
]);

export function isPrimaryView(view) {
  return NAV_ITEMS.some((item) => item.id === view);
}
