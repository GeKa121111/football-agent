import {
  createInitialSave,
  readSave,
  writeSave
} from "./core/storage.js";

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function mountApp(root) {
  const result = readSave();
  root.replaceChildren();

  const shell = createElement("main", "app-shell");
  const header = createElement("header", "topbar");
  header.append(
    createElement("span", "brand-mark", "FA"),
    createElement("span", "brand-name", "FOOTBALL AGENT"),
    createElement("span", "build-label", "تأسيس الوكالة")
  );

  const hero = createElement("section", "hero-panel");
  hero.append(
    createElement("p", "eyebrow", "مسيرتك تبدأ من هنا"),
    createElement("h1", "hero-title", "ابنِ وكالة كرة القدم الخاصة بك"),
    createElement(
      "p",
      "hero-copy",
      "اكتشف المواهب، اكسب ثقة اللاعبين، تفاوض مع الأندية، واصنع مستقبل نجومك."
    )
  );

  const status = createElement("p", "save-status");
  const action = createElement("button", "primary-button");

  if (result.status === "new") {
    status.textContent = "لا يوجد ملف مسيرة محفوظ حتى الآن.";
    action.textContent = "تأسيس وكالتي";
    action.addEventListener("click", () => {
      try {
        const saved = writeSave(createInitialSave());
        renderStartedState(shell, saved);
      } catch {
        status.textContent = "تعذر إنشاء ملف الحفظ. تأكد من إعدادات المتصفح.";
      }
    });
  } else if (result.status === "loaded") {
    status.textContent = "تم العثور على ملف مسيرة محفوظ.";
    action.textContent = "متابعة المسيرة";
    action.addEventListener("click", () => renderStartedState(shell, result.save));
  } else {
    status.textContent =
      result.status === "unsupported"
        ? "ملف الحفظ أحدث من إصدار اللعبة الحالي. لن نكتب فوقه."
        : result.status === "corrupt"
          ? "ملف الحفظ غير صالح. احتفظنا به ولم نحذفه."
          : "التخزين المحلي غير متاح. افتح اللعبة في متصفح يدعم Local Storage.";
    action.disabled = true;
    action.textContent = "الحفظ غير متاح";
  }

  hero.append(status, action);

  const footer = createElement(
    "footer",
    "app-footer",
    "نسخة تأسيسية — المرحلة 1 من 10"
  );

  shell.append(header, hero, footer);
  root.append(shell);
}

function renderStartedState(shell, save) {
  const hero = shell.querySelector(".hero-panel");
  if (!hero) return;

  const status = createElement(
    "p",
    "save-status success",
    "تم حفظ بداية مسيرتك بنجاح."
  );
  const details = createElement(
    "p",
    "career-summary",
    `${save.agency.name} · الرصيد ${save.agency.balance.toLocaleString("en-US")} · العملاء 0`
  );

  const action = createElement("button", "secondary-button", "ملف الحفظ جاهز");
  action.disabled = true;

  hero.replaceChildren(
    createElement("p", "eyebrow", "تم تأسيس الوكالة"),
    createElement("h1", "hero-title", save.agency.name),
    createElement("p", "hero-copy", "البنية الأساسية جاهزة. المرحلة التالية هي بناء الهوية البصرية وشاشات اللعبة."),
    status,
    details,
    action
  );
}
