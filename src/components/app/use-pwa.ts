"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useUI } from "./ui-context";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) {
    l();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

/** Returns an install function while the browser offers "install app". */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const available = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => deferred !== null,
    () => false,
  );

  if (!available) {
    return null;
  }

  return async () => {
    await deferred?.prompt();
    deferred = null;
    emit();
  };
}

/** Registers the service worker (production) and handles app shortcuts. */
export function usePwa() {
  const ui = useUI();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has("new")) {
      ui.openForm({ initial: { startMinute: null } });
    } else if (params.has("timer")) {
      setTimeout(() => document.querySelector<HTMLInputElement>("[data-timer-input]")?.focus(), 300);
    }

    if (params.has("new") || params.has("timer")) {
      history.replaceState(null, "", location.pathname + location.hash);
    }

    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    const hadController = Boolean(navigator.serviceWorker.controller);
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    const onChange = () => {
      if (hadController) {
        ui.toast("Nova versão do planner disponível", { label: "Recarregar", run: () => location.reload() });
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onChange);
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
