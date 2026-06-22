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

/** Start a repeating alarm (beep every 4 s) until `stopAlarm()` is called. */
export function startAlarm() {
  if (_alarmInterval !== null) return; // already running
  beep(3);
  _alarmInterval = setInterval(() => beep(3), 4000);
}

/** Stop the repeating alarm started by `startAlarm()`. */
export function stopAlarm() {
  if (_alarmInterval !== null) {
    clearInterval(_alarmInterval);
    _alarmInterval = null;
  }
}

export function isAlarmActive() {
  return _alarmInterval !== null;
}
