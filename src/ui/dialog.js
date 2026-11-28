// سلوك حوار مشترك: Escape للإغلاق + فخ تركيز + إرجاع التركيز.
// مستخرج كما هو من openModal في src/app.js حتى تستخدمه كل الحوارات
// (المودال الرئيسي، والـ tutorial، والنسخ الاحتياطي) بنفس السلوك.
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function attachDialogBehavior(dialog, { onClose }) {
  const previousFocus = document.activeElement;
  const onKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)];
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  dialog.addEventListener("keydown", onKeydown);
  return function restoreFocus() {
    dialog.removeEventListener("keydown", onKeydown);
    if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
  };
}
