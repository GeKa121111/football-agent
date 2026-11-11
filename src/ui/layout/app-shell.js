import { NAV_ITEMS, isPrimaryView } from "./navigation.js";

export function createAppShell({
  node,
  actionButton,
  view,
  seasonLabel,
  dateLabel,
  saveLabel,
  onSave,
  onNavigate,
  agencyName,
  page
}) {
  const activeView = isPrimaryView(view) ? view : "dashboard";
  const shell = node("div", activeView === "dashboard"
    ? "app-shell dashboard-shell rebuild-shell"
    : "app-shell rebuild-shell");

  const header = node("header", "topbar rebuild-topbar");
  const brand = node("div", "brand-lockup rebuild-brand");
  const mark = node("span", "brand-mark rebuild-brand-mark", "FA");
  const brandCopy = node("span", "rebuild-brand-copy");
  brandCopy.append(
    node("strong", "brand-name", "FOOTBALL AGENT"),
    node("small", "rebuild-brand-subtitle", "CAREER MANAGEMENT")
  );
  brand.append(mark, brandCopy);

  const headerMeta = node("div", "rebuild-header-meta");
  headerMeta.append(
    node("span", "rebuild-date-label", dateLabel),
    node("span", "season-pill rebuild-season-pill", seasonLabel)
  );

  const saveButton = actionButton(saveLabel, "save-chip rebuild-save-chip", onSave);
  saveButton.setAttribute("aria-label", "حفظ المسيرة");
  header.append(brand, headerMeta, saveButton);

  const layout = node("div", "app-layout rebuild-layout");
  const sidebar = node("aside", "sidebar rebuild-sidebar");
  sidebar.setAttribute("aria-label", "القائمة الرئيسية");
  const sidebarHeading = node("div", "rebuild-sidebar-heading");
  sidebarHeading.append(
    node("span", "rebuild-sidebar-kicker", "WORKSPACE"),
    node("strong", "rebuild-sidebar-title", "مساحة الوكالة")
  );
  const nav = node("nav", "rebuild-nav");
  nav.setAttribute("aria-label", "التنقل الرئيسي");
  NAV_ITEMS.forEach((item) => {
    const active = activeView === item.id;
    const button = actionButton(
      "",
      active ? "nav-link rebuild-nav-link is-active" : "nav-link rebuild-nav-link",
      () => onNavigate(item.id)
    );
    if (active) button.setAttribute("aria-current", "page");
    button.append(
      node("span", "nav-icon rebuild-nav-icon", item.icon),
      node("span", "rebuild-nav-copy"),
      node("span", "rebuild-nav-arrow", "‹")
    );
    button.children[1].append(
      node("strong", "nav-label", item.label),
      node("small", "rebuild-nav-hint", item.hint)
    );
    nav.append(button);
  });

  const sidebarFooter = node("div", "sidebar-bottom rebuild-sidebar-footer");
  const footerMark = node("span", "rebuild-footer-pulse");
  const footerCopy = node("span", "rebuild-footer-copy");
  footerCopy.append(
    node("strong", "", agencyName || "وكالتك"),
    node("small", "", "مسيرتك محفوظة على هذا الجهاز")
  );
  sidebarFooter.append(footerMark, footerCopy);
  sidebar.append(sidebarHeading, nav, sidebarFooter);

  const main = node("main", "main-stage rebuild-main");
  main.setAttribute("id", "main-content");
  main.append(page);
  layout.append(sidebar, main);

  const bottomNav = node("nav", "mobile-nav rebuild-mobile-nav");
  bottomNav.setAttribute("aria-label", "التنقل الرئيسي");
  NAV_ITEMS.forEach((item) => {
    const active = activeView === item.id;
    const button = actionButton(
      "",
      active ? "mobile-nav-link rebuild-mobile-nav-link is-active" : "mobile-nav-link rebuild-mobile-nav-link",
      () => onNavigate(item.id)
    );
    if (active) button.setAttribute("aria-current", "page");
    button.append(
      node("span", "mobile-nav-icon", item.icon),
      node("span", "mobile-nav-label", item.label)
    );
    bottomNav.append(button);
  });

  const skipLink = node("a", "rebuild-skip-link", "تخطي إلى المحتوى");
  skipLink.href = "#main-content";

  shell.append(skipLink, header, layout, bottomNav);
  return shell;
}
