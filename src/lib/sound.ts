/** Short beep via Web Audio — no asset needed. Safe to call on the client. */
export function beep(times = 1) {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    let start = ctx.currentTime;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.start(start);
      osc.stop(start + 0.26);
      start += 0.35;
    }
    setTimeout(() => ctx.close(), times * 400 + 200);
  } catch {
    // audio unavailable — ignore.
  }
}
