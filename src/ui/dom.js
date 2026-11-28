// أدوات DOM مشتركة — مستخرجة حرفيًا من src/app.js (أول خطوة في تقسيمه).
export function node(tag, className = "", text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

export function actionButton(label, className, callback, title = "") {
  const button = node("button", className, label);
  button.type = "button";
  if (title) {
    button.title = title;
    // قارئ الشاشة كان يعلن حرف "×" نفسه لزر الإغلاق؛ العنوان هو الاسم المفهوم.
    button.setAttribute("aria-label", title);
  }
  button.addEventListener("click", callback);
  return button;
}
