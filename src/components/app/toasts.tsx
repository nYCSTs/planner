"use client";

import { X } from "lucide-react";
import { useUI } from "./ui-context";

export function Toasts() {
  const { toasts, dismissToast } = useUI();
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-foreground px-4 py-2.5 text-sm text-background shadow-lg animate-in fade-in-0 slide-in-from-bottom-2"
        >
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.run();
                dismissToast(t.id);
              }}
              className="shrink-0 rounded-md px-2 py-0.5 text-sm font-semibold text-sky-300 hover:bg-background/10 dark:text-sky-600"
            >
              {t.action.label}
            </button>
          )}
          <button type="button" onClick={() => dismissToast(t.id)} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Fechar aviso">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
