"use client";

import { useState } from "react";
import { CalendarDays, CalendarRange, CalendarClock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useUI, type Scope } from "./ui-context";

const DEFAULTS: Record<Scope, { label: string; hint: string; icon: typeof CalendarDays }> = {
  this: { label: "Só este dia", hint: "Os outros dias ficam como estão.", icon: CalendarDays },
  following: { label: "Este e os próximos", hint: "Dias anteriores ficam como estão.", icon: CalendarClock },
  all: { label: "Todos os dias", hint: "Inclui os dias que já passaram.", icon: CalendarRange },
};

export function ScopeDialog() {
  const { scope: current, resolveScope } = useUI();
  // Keep the last request rendered while the dialog animates out.
  const [last, setLast] = useState(current);
  if (current && current !== last) {
    setLast(current);
  }

  const scope = current ?? last;
  const options = (["this", "following", "all"] as Scope[]).filter((s) => {
    if (!scope) {
      return false;
    }

    if (s === "this") {
      return scope.allowThis !== false;
    }

    if (s === "following") {
      return scope.allowFollowing !== false;
    }

    return scope.allowAll !== false;
  });

  return (
    <Dialog open={current !== null} onOpenChange={(o) => !o && resolveScope(null)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{scope?.title}</DialogTitle>
          {scope?.description && <DialogDescription>{scope.description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-1.5">
          {options.map((s, i) => {
            const meta = DEFAULTS[s];
            const Icon = meta.icon;
            const danger = scope?.destructive && s === "all";
            return (
              <button
                key={s}
                type="button"
                autoFocus={i === 0}
                onClick={() => resolveScope(s)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                  danger && "border-destructive/30 hover:bg-destructive/10",
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground", danger && "text-destructive")} />
                <span>
                  <span className={cn("block text-sm font-medium", danger && "text-destructive")}>
                    {scope?.labels?.[s] ?? meta.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{meta.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
