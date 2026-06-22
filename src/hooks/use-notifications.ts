"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolvedOccurrence, Settings } from "@/types";
import { nowMinutes } from "@/lib/time";
import { startAlarm, stopAlarm, isAlarmActive } from "@/lib/sound";

type Permission = "default" | "granted" | "denied" | "unsupported";

function getPermission(): Permission {
  if (typeof window === "undefined" || !("Notification" in window))
    return "unsupported";
  return Notification.permission as Permission;
}

/** Fire browser notification (persistent until dismissed) and optionally start
 *  the repeating alarm sound. */
function notify(title: string, body: string, sound: boolean) {
  if (sound) startAlarm();
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    // requireInteraction keeps the notification visible until the user acts.
    new Notification(title, { body, tag: title + body, requireInteraction: true });
  } catch {
    // ignore
  }
}

/**
 * Watches today's occurrences and fires a notification when a task is about to
 * start or about to end, using per-task lead times (falling back to settings).
 * Each event fires at most once per day via an in-memory dedup set.
 *
 * Returns `alarmActive` (true while the repeating alarm sound is running) and
 * `dismissAlarm()` so the UI can render a "Parar alarme" button.
 */
export function useNotifications(
  occurrences: ResolvedOccurrence[],
  now: Date,
  settings: Settings,
) {
  const [permission, setPermission] = useState<Permission>("default");
  const [alarmActive, setAlarmActive] = useState(false);
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Reading the browser's current Notification permission (external system).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(getPermission());
  }, []);

  // Poll alarm state so the banner updates when the alarm auto-starts.
  useEffect(() => {
    const id = setInterval(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAlarmActive(isAlarmActive());
    }, 500);
    return () => clearInterval(id);
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result as Permission);
  }, []);

  const dismissAlarm = useCallback(() => {
    stopAlarm();
    setAlarmActive(false);
  }, []);

  useEffect(() => {
    if (!settings.notificationsEnabled) return;
    const minute = nowMinutes(now);
    const fired = firedRef.current;

    for (const occ of occurrences) {
      if (occ.completed) continue;
      if (!occ.scheduled) continue; // unscheduled tasks have no time to notify
      const leadStart = occ.task.notifyBeforeStart ?? settings.notifyBeforeStart;
      const leadEnd = occ.task.notifyBeforeEnd ?? settings.notifyBeforeEnd;
      const sound = occ.task.soundEnabled ?? settings.soundEnabled;

      // About to start. With lead 0 this fires exactly at the start minute;
      // with lead N it fires once within the N-minute window before start.
      const startTrigger = occ.startMinute - leadStart;
      const startKey = `start:${occ.key}`;
      if (
        !fired.has(startKey) &&
        minute >= startTrigger &&
        minute <= occ.startMinute
      ) {
        fired.add(startKey);
        const remaining = occ.startMinute - minute;
        notify(
          remaining <= 0 ? "Começando agora" : `Começa em ${remaining} min`,
          occ.task.title,
          sound,
        );
      }

      // About to end (skip open-ended tasks — no fixed end).
      if (!occ.openEnded) {
        const endTrigger = occ.endMinute - leadEnd;
        const endKey = `end:${occ.key}`;
        if (
          !fired.has(endKey) &&
          minute >= endTrigger &&
          minute <= occ.endMinute
        ) {
          fired.add(endKey);
          const remaining = occ.endMinute - minute;
          notify(
            remaining <= 0 ? "Terminando agora" : `Termina em ${remaining} min`,
            occ.task.title,
            sound,
          );
        }
      }
    }
  }, [occurrences, now, settings]);

  return { permission, requestPermission, alarmActive, dismissAlarm };
}
