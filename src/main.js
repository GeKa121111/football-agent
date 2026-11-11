import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/rebuild-shell.css";
import "./styles/rebuild-dashboard.css";
import "./styles/rebuild-screens.css";
import { mountApp } from "./app.js";

const root = document.querySelector("#app");

if (!root) {
  throw new Error('لم يتم العثور على عنصر التطبيق الرئيسي "#app".');
}

mountApp(root);
