// Tiny chiptune-ish sound effects, synthesized with WebAudio.
// No audio files: nothing to license, nothing to download.

type Wave = OscillatorType;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = (() => {
  try {
    return localStorage.getItem('mech-muted') === '1';
  } catch {
    return false;
  }
})();
const listeners = new Set<(m: boolean) => void>();

const audio = (): AudioContext | null => {
  if (muted) return null;
  try {
    if (!ctx) {
      // iOS: play web audio even when the ring/silent switch is on
      const nav: unknown = navigator;
      const session: unknown =
        nav && typeof nav === 'object'
          ? Reflect.get(nav, 'audioSession')
          : null;
      if (session && typeof session === 'object')
        Reflect.set(session, 'type', 'playback');
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
};

/**
 * Browsers only allow sound after a user gesture *inside this frame*.
 * Unlock on the very first touch/click/key, and keep resuming if the
 * webview suspends us (e.g. app switched to background).
 */
const unlock = () => {
  const a = audio();
  if (!a || !master) return;
  if (a.state !== 'running') void a.resume();
  // a silent blip forces some mobile webviews to actually start the output
  const o = a.createOscillator();
  const g = a.createGain();
  g.gain.value = 0.0001;
  o.connect(g).connect(master);
  o.start();
  o.stop(a.currentTime + 0.02);
};
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx && !muted) void ctx.resume();
  });
}

export const isMuted = () => muted;
export const setMuted = (m: boolean) => {
  muted = m;
  try {
    localStorage.setItem('mech-muted', m ? '1' : '0');
  } catch {
    /* storage can be unavailable in some webviews */
  }
  if (m && ctx) void ctx.suspend();
  if (!m) unlock();
  listeners.forEach((l) => l(m));
};
export const onMuteChange = (l: (m: boolean) => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const tone = (
  freq: number,
  endFreq: number,
  dur: number,
  wave: Wave,
  vol: number,
  delay = 0
) => {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
};

const noise = (dur: number, vol: number, lowpass: number, delay = 0) => {
  const a = audio();
  if (!a || !master || !noiseBuf) return;
  const t = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(lowpass, t);
  f.frequency.exponentialRampToValueAtTime(80, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
};

// Rapid-fire weapons would turn into mush, so each sound has a cooldown.
const last: Record<string, number> = {};
const throttle = (key: string, ms: number) => {
  const now = performance.now();
  if ((last[key] ?? 0) + ms > now) return false;
  last[key] = now;
  return true;
};

export const sfx = {
  click: () => tone(660, 440, 0.05, 'square', 0.12),
  equip: () => {
    tone(330, 330, 0.05, 'square', 0.15);
    tone(660, 660, 0.07, 'square', 0.12, 0.05);
  },
  shoot: (type: 'kinetic' | 'energy' | 'explosive' | 'melee', side: 0 | 1) => {
    if (!throttle(`shoot-${type}-${side}`, type === 'kinetic' ? 70 : 110))
      return;
    const pitch = side === 0 ? 1 : 0.85;
    switch (type) {
      case 'kinetic':
        noise(0.06, 0.25, 3000 * pitch);
        tone(220 * pitch, 90, 0.05, 'square', 0.08);
        break;
      case 'energy':
        tone(1400 * pitch, 300, 0.12, 'sawtooth', 0.09);
        break;
      case 'explosive':
        tone(180 * pitch, 60, 0.25, 'triangle', 0.18);
        noise(0.2, 0.15, 1200);
        break;
      case 'melee':
        noise(0.12, 0.2, 6000);
        tone(900, 200, 0.1, 'square', 0.08);
        break;
    }
  },
  hit: (big: boolean) => {
    if (!throttle('hit', 60)) return;
    if (big) {
      noise(0.35, 0.4, 900);
      tone(120, 40, 0.3, 'square', 0.2);
    } else {
      tone(180, 120, 0.04, 'square', 0.1);
    }
  },
  block: () => {
    if (!throttle('block', 80)) return;
    tone(1200, 1500, 0.06, 'triangle', 0.1);
  },
  overheat: () => {
    if (!throttle('heat', 1500)) return;
    tone(880, 880, 0.08, 'square', 0.1);
    tone(880, 880, 0.08, 'square', 0.1, 0.14);
  },
  count: (go: boolean) =>
    go
      ? tone(880, 1760, 0.3, 'square', 0.18)
      : tone(440, 440, 0.12, 'square', 0.15),
  ko: () => {
    noise(0.9, 0.5, 2500);
    tone(200, 30, 0.9, 'sawtooth', 0.2);
  },
  win: () =>
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(f, f, 0.14, 'square', 0.14, i * 0.11)
    ),
  lose: () =>
    [392, 330, 262, 196].forEach((f, i) =>
      tone(f, f * 0.98, 0.18, 'triangle', 0.16, i * 0.14)
    ),
  enter: () =>
    [262, 392, 523].forEach((f, i) =>
      tone(f, f, 0.1, 'square', 0.14, i * 0.07)
    ),
};
