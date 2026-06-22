"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolvedOccurrence, Settings } from "@/types";
import { nowMinutes } from "@/lib/time";
import { beep } from "@/lib/sound";

type Permission = "default" | "granted" | "denied" | "unsupported";

function getPermission(): Permission {
  if (typeof window === "undefined" || !("Notification" in window))
    return "unsupported";
  return Notification.permission as Permission;
}

function notify(title: string, body: string, sound: boolean) {
  if (sound) beep(1);
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: title + body });
  } catch {
    // ignore
  }
}

/**
 * Watches today's occurrences and fires a notification when a task is about to
 * start or about to end, using per-task lead times (falling back to settings).
 * Each event fires at most once per day via an in-memory dedup set.
 */
export function useNotifications(
  occurrences: ResolvedOccurrence[],
  now: Date,
  settings: Settings,
) {
  const [permission, setPermission] = useState<Permission>("default");
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setPermission(getPermission());
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result as Permission);
  }, []);

  useEffect(() => {
    if (!settings.notificationsEnabled) return;
    const minute = nowMinutes(now);
    const fired = firedRef.current;

    for (const occ of occurrences) {
      if (occ.completed) continue;
      const leadStart = occ.task.notifyBeforeStart ?? settings.notifyBeforeStart;
      const leadEnd = occ.task.notifyBeforeEnd ?? settings.notifyBeforeEnd;

      // About to start.
      const startTrigger = occ.startMinute - leadStart;
      const startKey = `start:${occ.key}`;
      if (
        !fired.has(startKey) &&
        minute >= startTrigger &&
        minute < occ.startMinute
      ) {
        fired.add(startKey);
        notify(
          `Começa em ${occ.startMinute - minute} min`,
          occ.task.title,
          settings.soundEnabled,
        );
      }

      // About to end (skip open-ended tasks — no fixed end).
      if (!occ.openEnded) {
        const endTrigger = occ.endMinute - leadEnd;
        const endKey = `end:${occ.key}`;
        if (
          !fired.has(endKey) &&
          minute >= endTrigger &&
          minute < occ.endMinute
        ) {
          fired.add(endKey);
          notify(
            `Termina em ${occ.endMinute - minute} min`,
            occ.task.title,
            settings.soundEnabled,
          );
        }
      }
    }
  }, [occurrences, now, settings]);

  return { permission, requestPermission };
}
