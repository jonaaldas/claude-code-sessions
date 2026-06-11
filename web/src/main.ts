import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";

// Follow the OS color scheme.
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("dark");
}

createApp(App).mount("#app");
