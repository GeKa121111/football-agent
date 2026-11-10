import "./styles/base.css";
import { mountApp } from "./app.js";

const root = document.querySelector("#app");

if (!root) {
  throw new Error('لم يتم العثور على عنصر التطبيق الرئيسي "#app".');
}

mountApp(root);
