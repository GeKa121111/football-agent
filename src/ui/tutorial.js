const KEY = "football-agent.tutorial.done";
const STEPS = [
  ["دورك إيه في اللعبة؟", "أنت وكيل لاعبين، مش مدرب. مش هتختار تشكيل أو تدير ماتش؛ هتكتشف المواهب، تمثّل اللاعبين، وتساعدهم يلاقوا فرص أفضل."],
  ["اكتشف موهبة", "افتح شاشة الكشافين، اختار بعثة مناسبة، واستنى لحد ما التقرير يكتمل. التقرير بيساعدك تقرر مين يستحق المتابعة."],
  ["وقّع عقد تمثيل", "افتح ملف اللاعب من التقرير أو قاعدة اللاعبين، واضغط بدء عرض تمثيل. تابع العرض ورد اللاعب من شاشة الوكالة."],
  ["سوّق للاعب", "بعد ما اللاعب يبقى عميل عندك بعقد ساري، افتح سوق الانتقالات. راجع اهتمام الأندية ومواعيد النوافذ، وقدّم عرضًا لما الشروط تسمح."],
  ["حرّك الوقت واحفظ", "ارجع للرئيسية واضغط ابدأ يوم جديد عشان الأحداث والبعثات والمواعيد تتحدث. استخدم حفظ المسيرة والنسخة الاحتياطية لحماية تقدمك."]
];

export function mountTutorial(doc = document, storage = globalThis.localStorage) {
  try {
    if (storage.getItem(KEY)) return;
  } catch {
    return;
  }

  let i = 0;
  const overlay = doc.createElement("div");
  overlay.className = "tutorial-overlay";
  const box = doc.createElement("div");
  box.className = "tutorial-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "شرح بداية اللعبة");

  const h = doc.createElement("h2");
  const p = doc.createElement("p");
  const next = doc.createElement("button");
  const skip = doc.createElement("button");
  next.type = skip.type = "button";
  next.className = skip.className = "backup-btn";
  skip.textContent = "تخطي";

  const done = () => {
    try { storage.setItem(KEY, "1"); } catch {}
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
  next.focus();
}
