/** One alarm burst: two layered oscillators (sine 440Hz + square 880Hz) for a
 *  louder, more attention-grabbing sound. `times` controls how many pulses. */
export function beep(times = 3) {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    let start = ctx.currentTime;
    for (let i = 0; i < times; i++) {
      for (const [freq, type, peakGain] of [
        [440, "sine", 1.0],
        [880, "square", 0.25],
      ] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = type;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
        osc.start(start);
        osc.stop(start + 0.31);
      }
      start += 0.45;
    }
    setTimeout(() => ctx.close(), times * 500 + 200);
  } catch {
    // audio unavailable — ignore.
  }
}

let _alarmInterval: ReturnType<typeof setInterval> | null = null;
let _alarmTimeout: ReturnType<typeof setTimeout> | null = null;

const ALARM_BEEP_GAP_MS = 4000; // gap between alarm bursts

export interface AlarmLimits {
  /** Auto-stop after this many seconds (0 = no time limit). */
  maxSeconds?: number;
  /** Auto-stop after this many bursts (0 = no count limit). */
  maxBeeps?: number;
}

/**
 * Start a repeating alarm (a burst every ~4 s). It stops automatically when
 * either the time limit or the beep-count limit is reached (whichever first);
 * `0`/omitted on a limit disables that limit. When both are disabled the alarm
 * rings until dismissed manually. As a safety net (e.g. a stuck tab) a hard cap
 * of 30 minutes always applies.
 */
export function startAlarm(limits: AlarmLimits = {}) {
  if (_alarmInterval !== null) return; // already running
  const maxSeconds = Math.max(0, limits.maxSeconds ?? 0);
  const maxBeeps = Math.max(0, Math.floor(limits.maxBeeps ?? 0));
  const HARD_CAP_MS = 30 * 60 * 1000;

  let count = 1;
  beep(3);
  if (maxBeeps === 1) return; // single burst requested — nothing repeats

  _alarmInterval = setInterval(() => {
    count += 1;
    beep(3);
    if (maxBeeps > 0 && count >= maxBeeps) stopAlarm();
  }, ALARM_BEEP_GAP_MS);

  const timeCap = maxSeconds > 0 ? maxSeconds * 1000 : HARD_CAP_MS;
  _alarmTimeout = setTimeout(() => stopAlarm(), Math.min(timeCap, HARD_CAP_MS));
}

/** Stop the repeating alarm started by `startAlarm()`. */
export function stopAlarm() {
  if (_alarmInterval !== null) {
    clearInterval(_alarmInterval);
    _alarmInterval = null;
  }
  if (_alarmTimeout !== null) {
    clearTimeout(_alarmTimeout);
    _alarmTimeout = null;
  }
}

export function isAlarmActive() {
  return _alarmInterval !== null;
}
