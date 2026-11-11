import test from "node:test";
import assert from "node:assert/strict";
import { createAppShell } from "../src/ui/layout/app-shell.js";

function fakeNode(tag, className = "", text) {
  return {
    tagName: String(tag).toUpperCase(),
    className,
    textContent: text === undefined ? "" : String(text),
    children: [],
    attributes: {},
    dataset: {},
    append(...children) {
      this.children.push(...children);
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    addEventListener() {},
  };
}

function fakeActionButton(label, className, callback) {
  const button = fakeNode("button", className, label);
  button.type = "button";
  button.callback = callback;
  return button;
}

function descendants(root) {
  return [root, ...(root.children || []).flatMap(descendants)];
}

function byClass(root, className) {
  return descendants(root).find((element) => (
    String(element.className).split(/\s+/).includes(className)
  ));
}

function buildShell(view = "players") {
  return createAppShell({
    node: fakeNode,
    actionButton: fakeActionButton,
    view,
    seasonLabel: "موسم 2026 / 2027",
    dateLabel: "1 يوليو 2026",
    saveLabel: "حفظ المسيرة",
    onSave() {},
    onNavigate() {},
    agencyName: "وكالة الاختبار",
    page: fakeNode("section", "page-content")
  });
}

test("skip link targets a focusable main workspace", () => {
  const shell = buildShell();
  const skipLink = byClass(shell, "rebuild-skip-link");
  const main = byClass(shell, "main-stage");

  assert.ok(skipLink);
  assert.equal(skipLink.href, "#main-content");
  assert.equal(skipLink.attributes["aria-controls"], "main-content");
  assert.equal(main.attributes.id, "main-content");
  assert.equal(main.attributes.tabindex, "-1");
});

test("desktop and mobile navigation expose six named routes and one active route", () => {
  const shell = buildShell("scouting");
  const desktop = byClass(shell, "rebuild-nav");
  const mobile = byClass(shell, "rebuild-mobile-nav");

  for (const nav of [desktop, mobile]) {
    assert.equal(nav.children.length, 6);
    const active = nav.children.filter((button) => button.attributes["aria-current"] === "page");
    assert.equal(active.length, 1);
    assert.equal(active[0].dataset.view, "scouting");
    assert.equal(active[0].attributes["aria-label"], "الكشافون");
    assert.deepEqual(
      nav.children.map((button) => button.dataset.view),
      ["dashboard", "players", "scouting", "football", "market", "agency"]
    );
  }

  assert.equal(desktop.attributes["aria-label"], "التنقل الرئيسي على سطح المكتب");
  assert.equal(mobile.attributes["aria-label"], "التنقل الرئيسي على الهاتف");
  assert.equal(byClass(shell, "rebuild-nav-icon").attributes["aria-hidden"], "true");
  assert.equal(byClass(shell, "mobile-nav-icon").attributes["aria-hidden"], "true");
});

test("unknown views safely fall back to the dashboard route", () => {
  const shell = buildShell("unknown-view");
  const desktop = byClass(shell, "rebuild-nav");

  assert.ok(shell.className.includes("dashboard-shell"));
  assert.equal(
    desktop.children.filter((button) => button.attributes["aria-current"] === "page")[0].dataset.view,
    "dashboard"
  );
});
