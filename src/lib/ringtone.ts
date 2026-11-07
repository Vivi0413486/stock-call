/** WebAudio로 만드는 전화벨. 오디오 파일 없이 두 음을 번갈아 울린다. 사용자 클릭 뒤에만 시작한다 */
export type Ringtone = { stop: () => void };

export function startRingtone(): Ringtone | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = "sine";
  osc2.type = "sine";
  osc1.frequency.value = 880; // A5
  osc2.frequency.value = 1046.5; // C6
  osc1.connect(master);
  osc2.connect(master);
  osc1.start();
  osc2.start();

  let alive = true;
  // 0.4초 울림 → 0.2초 쉼 ×2 → 1.2초 쉼 (전화벨 리듬)
  const pattern = [
    [0.12, 0.4],
    [0, 0.2],
    [0.12, 0.4],
    [0, 1.4],
  ] as const;
  let i = 0;
  const step = () => {
    if (!alive) return;
    const [gain, dur] = pattern[i % pattern.length];
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(gain, t, 0.02);
    i += 1;
    timer = window.setTimeout(step, dur * 1000);
  };
  let timer = window.setTimeout(step, 0);

  return {
    stop: () => {
      alive = false;
      window.clearTimeout(timer);
      try {
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02);
        osc1.stop(ctx.currentTime + 0.1);
        osc2.stop(ctx.currentTime + 0.1);
        window.setTimeout(() => void ctx.close(), 200);
      } catch {
        /* 이미 닫힘 */
      }
    },
  };
}
