export const NAV_ITEMS = Object.freeze([
  Object.freeze({ id: "dashboard", label: "الرئيسية", icon: "⌂", hint: "ملخص الوكالة" }),
  Object.freeze({ id: "players", label: "اللاعبون", icon: "◉", hint: "قاعدة المواهب" }),
  Object.freeze({ id: "scouting", label: "الكشافون", icon: "⌕", hint: "اكتشاف اللاعبين" }),
  Object.freeze({ id: "market", label: "الانتقالات", icon: "⇄", hint: "فرص السوق" }),
  Object.freeze({ id: "agency", label: "الوكالة", icon: "▦", hint: "إدارة العملاء" })
]);

export function isPrimaryView(view) {
  return NAV_ITEMS.some((item) => item.id === view);
}
