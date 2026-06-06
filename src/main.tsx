import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// Polyfill crypto.randomUUID() for older WebViews (e.g. WeChat < 8.0 on old Android).
if (!globalThis.crypto?.randomUUID) {
  const getRandomHex = (len: number) =>
    Array.from(
      (globalThis.crypto?.getRandomValues?.(new Uint8Array(len)) ?? new Uint8Array(len).map(() => Math.random() * 256)),
      (b) => (b % 16).toString(16),
    ).join("");
  (globalThis.crypto as unknown as Record<string, unknown>).randomUUID = () =>
    `${getRandomHex(4)}${getRandomHex(2)}-4${getRandomHex(3)}-${(8 + Math.random() * 4) | 0}${getRandomHex(3)}-${getRandomHex(6)}${getRandomHex(6)}`;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    // Try to nuke old SW / caches but NEVER block the page on it.
    // Stale registrations can hang on some devices — we race them against
    // a short timeout and register the new SW regardless.
    const timed = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
      Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

    const existing = await timed(navigator.serviceWorker.getRegistration(), 2000, undefined);
    if (existing) {
      await timed(existing.unregister(), 2000, false).catch(() => {});
    }
    await timed(Promise.all((await timed(caches.keys(), 1500, [])).map((key) => caches.delete(key))), 2000, undefined).catch(() => {});

    // Register fresh — the new SW starts from a clean slate.
    const registration = await navigator.serviceWorker
      .register("/sw.js")
      .catch(() => undefined);

    if (!registration) return;

    // When a new SW is detected and installed, refresh immediately.
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

    // Periodically check for SW updates (every 5 min).
    setInterval(() => {
      registration.update().catch(() => undefined);
    }, 5 * 60 * 1000);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

