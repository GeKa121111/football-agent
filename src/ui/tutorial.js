import { attachDialogBehavior } from "./dialog.js";

const KEY = "football-agent.tutorial.done";
const STEPS = [
  ["أهلًا بك في Football Agent", "أنت وكيل لاعبين. هدفك: اكتشاف المواهب، توقيع عقود التمثيل، وبيع اللاعبين للأندية، وتنمية وكالتك عبر المواسم."],
  ["اكتشف المواهب", "من شاشة الكشافة أرسل بعثات لاكتشاف لاعبين جدد، ثم أضف المميزين لقائمة المتابعة."],
  ["وقّع واعرض", "وقّع عقد تمثيل مع اللاعب، ثم من سوق الانتقالات قدّم عروضًا للأندية وتفاوض على العمولة."],
  ["أدر الوكالة", "تابع الرعاة والموظفين والفروع من شاشة الوكالة، وراقب الدخل والمصروفات."],
  ["احفظ تقدمك", "الحفظ في متصفحك فقط. استخدم زر النسخ الاحتياطي لتصدير مسيرتك أو حفظها في خانات."]
];

export function mountTutorial(doc = document, storage = globalThis.localStorage) {
  try {
    if (storage.getItem(KEY)) return;
  } catch {
    return;
  }

  let i = 0;
  let restoreFocus = () => {};
  const overlay = doc.createElement("div");
  overlay.className = "tutorial-overlay";
  const box = doc.createElement("div");
  box.className = "tutorial-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "شرح بداية اللعبة");
  box.setAttribute("tabindex", "-1");

  const h = doc.createElement("h2");
  const p = doc.createElement("p");
  const next = doc.createElement("button");
  const skip = doc.createElement("button");
  next.type = skip.type = "button";
  next.className = skip.className = "backup-btn";
  skip.textContent = "تخطي";

  const done = () => {
    try { storage.setItem(KEY, "1"); } catch {}
    restoreFocus();
    overlay.remove();
  };
  const draw = () => {
    h.textContent = STEPS[i][0];
    p.textContent = STEPS[i][1];
    next.textContent = i === STEPS.length - 1
      ? "ابدأ اللعب"
      : "التالي (" + (i + 1) + "/" + STEPS.length + ")";
  };

  next.addEventListener("click", () => {
    if (i === STEPS.length - 1) done();
    else { i += 1; draw(); }
  });
  skip.addEventListener("click", done);
  draw();
  box.append(h, p, next, skip);
  overlay.append(box);
  doc.body.append(overlay);
  restoreFocus = attachDialogBehavior(box, { onClose: done });
  next.focus();
}
