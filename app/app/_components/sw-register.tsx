"use client";

import { useEffect } from "react";

// Hand-rolled SW registration (F-07). Skipped in dev to avoid stale caches.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((e) => {
      // Non-fatal: log only.
      console.warn("[sw] register failed", e);
    });
  }, []);
  return null;
}
