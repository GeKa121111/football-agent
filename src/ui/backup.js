import {
  SLOT_COUNT, exportSaveText, importSaveText, saveToSlot, loadFromSlot, describeSlot
} from "../core/backup.js";

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function mountBackup(doc = document) {
  const fab = el("button", "backup-fab", "💾 حفظ ونسخ احتياطي");
  fab.type = "button";
  fab.addEventListener("click", open);
  doc.body.append(fab);

  function open() {
    const overlay = el("div", "backup-overlay");
    const box = el("div", "backup-box");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "الحفظ والنسخ الاحتياطي");
    const msg = el("p", "backup-msg");
    const close = el("button", "backup-btn", "إغلاق");
    close.type = "button";
    close.addEventListener("click", () => overlay.remove());

    const act = (fn, done, reload) => () => {
      try {
        fn();
        msg.textContent = done;
        if (reload) setTimeout(() => location.reload(), 600);
      } catch (e) {
        msg.textContent = e.message || "تعذر تنفيذ العملية.";
      }
    };
    const btn = (label, fn) => {
      const b = el("button", "backup-btn", label);
      b.type = "button";
      b.addEventListener("click", fn);
      return b;
    };

    const exp = btn("تصدير الحفظ كملف", () => {
      try {
        const blob = new Blob([exportSaveText()], { type: "application/json" });
        const a = el("a");
        a.href = URL.createObjectURL(blob);
        a.download = "football-agent-save.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        msg.textContent = "تم تصدير الملف.";
      } catch (e) {
        msg.textContent = e.message || "تعذر تصدير الحفظ.";
      }
    });

    const file = el("input");
    file.type = "file";
    file.accept = "application/json,.json";
    file.hidden = true;
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      if (!confirm("سيتم استبدال الحفظ الحالي. متابعة؟")) {
        file.value = "";
        return;
      }
      try {
        importSaveText(await f.text());
        msg.textContent = "تم الاستيراد، جارٍ إعادة التحميل.";
        setTimeout(() => location.reload(), 600);
      } catch (e) {
        msg.textContent = e.message || "تعذر استيراد ملف الحفظ.";
      } finally {
        file.value = "";
      }
    });
    const imp = btn("استيراد حفظ من ملف", () => file.click());

    box.append(
      el("h2", "", "الحفظ والنسخ الاحتياطي"),
      el("p", "", "الحفظ يُخزَّن في متصفحك فقط. صدّر نسخة بانتظام حتى لا تضيع."),
      exp, imp, file
    );

    for (let i = 1; i <= SLOT_COUNT; i++) {
      const info = describeSlot(i);
      const row = el("div", "backup-slot");
      const status = info?.invalid
        ? "بيانات غير صالحة"
        : info
          ? `موسم ${info.season ?? "?"}${info.updatedAt ? " - " + info.updatedAt.slice(0, 10) : ""}`
          : "فارغة";
      row.append(el("span", "", `خانة ${i}: ${status}`));
      row.append(btn("حفظ هنا", () => {
        if (!info || confirm("استبدال الخانة؟")) {
          act(() => saveToSlot(i), "تم الحفظ في الخانة.", false)();
        }
      }));
      if (info && !info.invalid) {
        row.append(btn("تحميل", () => {
          if (confirm("سيتم استبدال الحفظ الحالي. متابعة؟")) {
            act(() => loadFromSlot(i), "تم التحميل.", true)();
          }
        }));
      }
      box.append(row);
    }

    box.append(msg, close);
    overlay.append(box);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    doc.body.append(overlay);
    close.focus();
  }
}
