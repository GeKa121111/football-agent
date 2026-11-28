import {
  SLOT_COUNT, exportSaveText, exportRawSaveText, importSaveText, saveToSlot,
  loadFromSlot, describeSlot, restorePreImportSave, hasPreImportSave
} from "../core/backup.js";
import { attachDialogBehavior } from "./dialog.js";

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
    box.setAttribute("tabindex", "-1");
    let restoreFocus = () => {};
    const closeDialog = () => {
      if (!overlay.isConnected) return;
      overlay.remove();
      restoreFocus();
    };
    const msg = el("p", "backup-msg");
    const close = el("button", "backup-btn", "إغلاق");
    close.type = "button";
    close.addEventListener("click", closeDialog);

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

    const rawExp = btn("تصدير خام للتشخيص", () => {
      try {
        const blob = new Blob([exportRawSaveText()], { type: "application/json" });
        const a = el("a");
        a.href = URL.createObjectURL(blob);
        a.download = "football-agent-save-raw.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        msg.textContent = "تم تصدير الملف الخام.";
      } catch (e) {
        msg.textContent = e.message || "تعذر تصدير الحفظ.";
      }
    });

    box.append(
      el("h2", "", "الحفظ والنسخ الاحتياطي"),
      el("p", "", "الحفظ يُخزَّن في متصفحك فقط. صدّر نسخة بانتظام حتى لا تضيع."),
      exp, imp, rawExp, file
    );

    if (hasPreImportSave()) {
      box.append(btn("استعادة الحفظ السابق قبل الاستيراد", () => {
        if (!confirm("سيتم استبدال الحفظ الحالي بنسخة الأمان السابقة. متابعة؟")) return;
        act(() => restorePreImportSave(), "تمت الاستعادة.", true)();
      }));
    }

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
      if (e.target === overlay) closeDialog();
    });
    doc.body.append(overlay);
    restoreFocus = attachDialogBehavior(box, { onClose: closeDialog });
    close.focus();
  }
}
