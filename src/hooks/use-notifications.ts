"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AlarmLimits } from "@/lib/sound";
import type { ResolvedOccurrence, Settings } from "@/types";
import { dateKey, nowMinutes } from "@/lib/time";
import { startAlarm, stopAlarm, isAlarmActive } from "@/lib/sound";

type Permission = "default" | "granted" | "denied" | "unsupported";

function getPermission(): Permission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission as Permission;
}

/** Same tag as the push service worker uses, so both never show twice. */
export function notificationTag(occKey: string, kind: "start" | "end"): string {
  return `${kind}:${occKey}`;
}

function notify(tag: string, title: string, body: string, sound: boolean, alarm: AlarmLimits) {
  if (sound) {
    startAlarm(alarm);
  }

  if (getPermission() !== "granted") {
    return;
  }

  try {
    const n = new Notification(title, { body, tag, icon: "/icon-192.png" });
    setTimeout(() => n.close(), 8000);
  } catch {
    // Some mobile browsers only allow notifications from the service worker.
    void navigator.serviceWorker?.ready.then((reg) => reg.showNotification(title, { body, tag, icon: "/icon-192.png" }));
  }
}

function firedKey() {
  return `planner.fired.${dateKey(new Date())}`;
}

function loadFired(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(firedKey()) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Only one tab rings/notifies at a time. */
function useLeader(): boolean {
  const [leader, setLeader] = useState(false);
  useEffect(() => {
    if (!navigator.locks) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLeader(true);
      return;
    }

    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request("planner-notify", () => {
      setLeader(true);
      return held;
    });
    return () => release();
  }, []);
  return leader;
}

/**
 * Fires a notification (and optional alarm) when a task of today is about to
 * start or end, using per-task lead times (falling back to settings).
 */
export function useNotifications(occurrences: ResolvedOccurrence[], now: Date, settings: Settings) {
  const [permission, setPermission] = useState<Permission>("default");
  const [alarmActive, setAlarmActive] = useState(false);
  const firedRef = useRef<Set<string> | null>(null);
  const leader = useLeader();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(getPermission());
    const id = setInterval(() => setAlarmActive(isAlarmActive()), 500);
    return () => clearInterval(id);
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      return;
    }

    setPermission((await Notification.requestPermission()) as Permission);
  }, []);

  const dismissAlarm = useCallback(() => {
    stopAlarm();
    setAlarmActive(false);
  }, []);

  useEffect(() => {
    if (!settings.notificationsEnabled || !leader) {
      return;
    }

    if (!firedRef.current) {
      firedRef.current = loadFired();
    }

    const fired = firedRef.current;
    const minute = nowMinutes(now);
    const alarm: AlarmLimits = { maxSeconds: settings.alarmMaxSeconds, maxBeeps: settings.alarmMaxBeeps };
    let changed = false;

    for (const occ of occurrences) {
      if (occ.completed || occ.skipped || !occ.scheduled) {
        continue;
      }

      const leadStart = occ.task.notifyBeforeStart ?? settings.notifyBeforeStart;
      const leadEnd = occ.task.notifyBeforeEnd ?? settings.notifyBeforeEnd;
      const sound = settings.soundEnabled && (occ.task.soundEnabled ?? false);

      const startTag = notificationTag(occ.key, "start");
      if (!fired.has(startTag) && minute >= occ.startMinute - leadStart && minute <= occ.startMinute) {
        fired.add(startTag);
        changed = true;
        const remaining = occ.startMinute - minute;
        notify(startTag, remaining <= 0 ? "Começando agora" : `Começa em ${remaining} min`, occ.title, sound, alarm);
      }

      if (!occ.openEnded) {
        const endTag = notificationTag(occ.key, "end");
        if (!fired.has(endTag) && minute >= occ.endMinute - leadEnd && minute <= occ.endMinute) {
          fired.add(endTag);
          changed = true;
          const remaining = occ.endMinute - minute;
          notify(endTag, remaining <= 0 ? "Terminando agora" : `Termina em ${remaining} min`, occ.title, sound, alarm);
        }
      }
    }

    if (changed) {
      try {
        sessionStorage.setItem(firedKey(), JSON.stringify([...fired]));
      } catch {
        // ignore
      }
    }
  }, [occurrences, now, settings, leader]);

  return { permission, requestPermission, alarmActive, dismissAlarm };
}
