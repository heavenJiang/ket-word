import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Andika: a font made for beginning readers (single-storey a and g, clear b/d/p/q), bundled so it works offline
import "@fontsource/andika/latin-400.css";
import "@fontsource/andika/latin-700.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// offline support (public/sw.js); not in development, where a cached app would hide every edit
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
}
