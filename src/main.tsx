import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    // --- Nuke any old SW registration and all caches to force a clean state ---
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) {
      await existing.unregister();
    }
    // Wipe every cache the old SW created
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    // -------------------------------------------------------------------------

    // Now register fresh — the new SW starts from a clean slate
    const registration = await navigator.serviceWorker
      .register("/sw.js")
      .catch(() => undefined);

    if (!registration) return;

    // When a new SW is detected and installed, refresh immediately
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          newWorker.postMessage({ type: "SKIP_WAITING" });
          window.location.reload();
        }
      });
    });

    // Periodically check for SW updates (every 5 min)
    setInterval(() => {
      registration.update().catch(() => undefined);
    }, 5 * 60 * 1000);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

