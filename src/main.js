import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/rebuild-shell.css";
import "./styles/rebuild-dashboard.css";
import "./styles/rebuild-screens.css";
import "./styles/rebuild-components.css";
import "./styles/backup.css";
import { mountApp } from "./app.js";
import { mountBackup } from "./ui/backup.js";
import { mountTutorial } from "./ui/tutorial.js";
import { mountFeedback } from "./ui/feedback.js";

const root = document.querySelector("#app");

if (!root) {
  throw new Error('لم يتم العثور على عنصر التطبيق الرئيسي "#app".');
}

mountApp(root);
mountBackup();
mountFeedback();
mountTutorial();

if ("serviceWorker" in navigator && import.meta.env?.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
