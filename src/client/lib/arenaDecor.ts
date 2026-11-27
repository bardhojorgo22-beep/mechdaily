// Arena dressing: a detailed floor texture per arena (drawn once), ambient weather
// that drifts over the fight, color grading and a vignette for the final frame.
import { createRng } from '../../shared/game/rng';

type Theme = { floor: string; speck: string; dark: string; text: string };
type G = CanvasRenderingContext2D;

const INK = '#1b1a17';

/** Things on the floor that ambient effects hang off (manholes steam, puddles ripple...). */
export type FloorAnchors = { vents: { x: number; y: number }[]; puddles: { x: number; y: number; r: number }[] };

export const drawFloorTexture = (g: G, arenaId: string, w: number, h: number, theme: Theme): FloorAnchors => {
  const rng = createRng(`floor:${arenaId}`);
  const anchors: FloorAnchors = { vents: [], puddles: [] };
  const px = (x: number, y: number, ww: number, hh: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(ww)), Math.max(1, Math.round(hh)));
  };
  const blob = (x: number, y: number, rx: number, ry: number, c: string) => {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(Math.round(x), Math.round(y), Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    g.fill();
  };
  // big soft blotches so the ground isn't one flat color
  for (let i = 0; i < 26; i++) {
    const r = 20 + rng.next() * 50;
    blob(rng.next() * w, rng.next() * h, r, r * 0.55, rng.chance(0.5) ? `${theme.dark}22` : `${theme.speck}55`);
  }
  // dithered grain
  for (let i = 0; i < (w * h) / 40; i++)
    px(rng.next() * w, rng.next() * h, 1, 1, rng.chance(0.6) ? theme.speck : `${theme.dark}aa`);

  const crack = (x: number, y: number, len: number, c: string) => {
    let dir = rng.next() * 6.283;
    for (let k = 0; k < len; k++) {
      px(x, y, 1, 1, c);
      dir += (rng.next() - 0.5) * 0.9;
      x += Math.cos(dir);
      y += Math.sin(dir) * 0.6;
      if (rng.chance(0.06)) crack(x, y, Math.floor(len / 3), c);
    }
  };
  const puddle = (x: number, y: number, r: number, water: string, shine: string) => {
    blob(x, y + 1, r + 1, r * 0.45 + 1, `${INK}55`);
    blob(x, y, r, r * 0.45, water);
    px(x - r * 0.5, y - r * 0.15, r * 0.5, 1, shine);
    px(x + r * 0.1, y + r * 0.1, r * 0.25, 1, shine);
    anchors.puddles.push({ x, y, r });
  };
  const hazard = (x: number, y: number, ww: number, hh: number) => {
    px(x - 1, y - 1, ww + 2, hh + 2, INK);
    for (let k = 0; k < ww; k++)
      for (let j = 0; j < hh; j++) px(x + k, y + j, 1, 1, Math.floor((k + j) / 4) % 2 ? INK : '#e0b028');
  };
  const slabs = (size: number, line: string, hi: string, offsetRows: boolean) => {
    for (let y = 0; y < h; y += size) {
      px(0, y, w, 1, line);
      px(0, y + 1, w, 1, hi);
      const off = offsetRows && (y / size) % 2 ? size / 2 : 0;
      for (let x = off; x < w; x += size) {
        px(x, y, 1, size, line);
        px(x + 1, y, 1, size, hi);
      }
    }
  };

  switch (arenaId) {
    case 'yard': {
      slabs(64, `${theme.dark}99`, '#ffffff22', true);
      for (let i = 0; i < 6; i++) {
        const x = rng.next() * w;
        const y = rng.next() * h;
        blob(x, y, 8 + rng.next() * 10, 4 + rng.next() * 4, '#2a262066'); // oil
        blob(x - 2, y - 1, 3, 1.5, '#6a5f9a44'); // rainbow sheen
      }
      for (let i = 0; i < 8; i++) crack(rng.next() * w, rng.next() * h, 18 + rng.int(20), `${theme.dark}cc`);
      hazard(6, 6, 34, 4);
      hazard(w - 40, h - 10, 34, 4);
      break;
    }
    case 'scrap': {
      slabs(40, `${INK}66`, '#ffffff1a', false);
      for (let y = 0; y < h; y += 40)
        for (let x = 0; x < w; x += 40)
          for (const [a, b] of [
            [4, 4],
            [35, 4],
            [4, 35],
            [35, 35],
          ] as const)
            px(x + a, y + b, 2, 2, `${INK}88`);
      for (let i = 0; i < 14; i++) {
        const x = rng.next() * w;
        const y = rng.next() * h;
        blob(x, y, 6 + rng.next() * 12, 3 + rng.next() * 5, '#8a4a2a55'); // rust
        px(x, y, 2, 1, '#b8693a88');
      }
      for (let i = 0; i < 20; i++) px(rng.next() * w, rng.next() * h, 4 + rng.int(6), 1, '#d8d2c444'); // scratches
      break;
    }
    case 'mud': {
      for (let i = 0; i < 4; i++) {
        // tire ruts across the field
        const y0 = rng.next() * h;
        for (let x = 0; x < w; x += 2) {
          const y = y0 + Math.sin(x / 60 + i) * 14;
          px(x, y, 2, 2, `${theme.dark}aa`);
          px(x, y + 9, 2, 2, `${theme.dark}aa`);
          if (x % 8 === 0) px(x, y - 1, 1, 1, '#ffffff22');
        }
      }
      for (let i = 0; i < 7; i++) puddle(rng.next() * w, rng.next() * h, 9 + rng.next() * 14, '#3b3a3a', '#9fb3b8');
      break;
    }
    case 'heat': {
      // sand ripples + cracked earth
      for (let y = 6; y < h; y += 9)
        for (let x = 0; x < w; x += 2) {
          const yy = y + Math.round(Math.sin((x + y * 3) / 17) * 2);
          px(x, yy, 2, 1, `${theme.dark}66`);
          px(x, yy - 1, 2, 1, '#ffffff1f');
        }
      for (let i = 0; i < 22; i++) crack(rng.next() * w, rng.next() * h, 14 + rng.int(26), `${theme.dark}`);
      for (let i = 0; i < 5; i++) blob(rng.next() * w, rng.next() * h, 4 + rng.next() * 4, 2, '#f5e3b8'); // bleached bones/rocks
      break;
    }
    case 'storm': {
      // wet steel grating
      for (let y = 0; y < h; y += 6) px(0, y, w, 1, `${INK}44`);
      for (let x = 0; x < w; x += 24) px(x, 0, 2, h, `${INK}55`);
      for (let i = 0; i < 9; i++) puddle(rng.next() * w, rng.next() * h, 10 + rng.next() * 18, '#2c3050', '#8a94c8');
      hazard(0, 0, w, 3);
      hazard(0, h - 3, w, 3);
      break;
    }
    case 'moon': {
      for (let i = 0; i < 14; i++) {
        const x = rng.next() * w;
        const y = rng.next() * h;
        const r = 6 + rng.next() * 18;
        blob(x, y, r + 2, r * 0.55 + 1, '#3d404b'); // rim
        blob(x, y + 1, r, r * 0.5, '#1d1e24');
        blob(x + r * 0.15, y + 2, r * 0.7, r * 0.3, '#24262e');
        px(x - r * 0.6, y - r * 0.45, r * 0.8, 1, '#5a5e6c');
      }
      for (let i = 0; i < 120; i++) px(rng.next() * w, rng.next() * h, 1, 1, rng.chance(0.2) ? '#8a8fa0' : '#44485466');
      break;
    }
    case 'alley': {
      // asphalt with a dashed center line and manholes
      for (let i = 0; i < 400; i++) px(rng.next() * w, rng.next() * h, 1, 1, rng.chance(0.5) ? '#7e776a' : '#c2baa9');
      for (let x = 8; x < w; x += 28) px(x, h / 2 - 1, 14, 2, '#e0b02899');
      for (let i = 0; i < 2; i++) {
        const x = w * (0.25 + i * 0.5) + (rng.next() - 0.5) * 40;
        const y = h * (i === 0 ? 0.3 : 0.72);
        blob(x, y, 9, 5, INK);
        blob(x, y, 8, 4, '#5a554c');
        for (let k = -6; k <= 6; k += 3) px(x + k, y - 2, 1, 4, INK);
        anchors.vents.push({ x, y });
      }
      for (let i = 0; i < 6; i++) crack(rng.next() * w, rng.next() * h, 20, '#6f685c');
      break;
    }
    case 'plains': {
      for (let i = 0; i < 160; i++) {
        // grass tufts
        const x = rng.next() * w;
        const y = rng.next() * h;
        const c = rng.pick(['#a8a27a', '#9a9468', '#b9b38a']);
        px(x, y, 1, 3, c);
        px(x - 1, y + 1, 1, 2, c);
        px(x + 1, y + 1, 1, 2, c);
        if (rng.chance(0.08)) px(x, y - 1, 2, 2, rng.pick(['#e0b028', '#d9705a', '#f4f0e6']));
      }
      for (let i = 0; i < 3; i++) {
        // worn dirt path
        const y0 = rng.next() * h;
        for (let x = 0; x < w; x += 3) blob(x, y0 + Math.sin(x / 50) * 10, 4, 2, `${theme.dark}44`);
      }
      break;
    }
    case 'fog': {
      for (let i = 0; i < 8; i++) puddle(rng.next() * w, rng.next() * h, 10 + rng.next() * 16, '#7f8a84', '#d8e0da');
      for (let i = 0; i < 50; i++) {
        // reeds
        const x = rng.next() * w;
        const y = rng.next() * h;
        px(x, y - 5, 1, 6, '#5d6a5c');
        px(x + 2, y - 3, 1, 4, '#5d6a5c');
        if (rng.chance(0.4)) px(x, y - 7, 1, 2, '#7a5a3a');
      }
      break;
    }
  }
  return anchors;
};

/** A crater blown into the floor by a big explosion. */
export const crater = (g: G, x: number, y: number, r: number, theme: Theme, rnd: () => number) => {
  g.fillStyle = `${INK}44`;
  g.beginPath();
  g.ellipse(Math.round(x), Math.round(y), r * 1.3, r * 0.65, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = `${INK}88`;
  g.beginPath();
  g.ellipse(Math.round(x), Math.round(y + 1), r * 0.8, r * 0.38, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff22';
  g.fillRect(Math.round(x - r * 0.8), Math.round(y - r * 0.55), Math.round(r * 1.2), 1);
  for (let k = 0; k < r * 3; k++) {
    const a = rnd() * 6.283;
    const d = r * (1.1 + rnd() * 0.9);
    g.fillStyle = rnd() < 0.5 ? theme.dark : `${INK}99`;
    g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.5), 1 + Math.floor(rnd() * 2), 1);
  }
};

/** Ground cracks radiating out from a slam. */
export const slamCracks = (g: G, x: number, y: number, len: number, rnd: () => number) => {
  for (let b = 0; b < 5; b++) {
    let dir = (b / 5) * 6.283 + rnd() * 0.8;
    let cx = x;
    let cy = y;
    for (let k = 0; k < len; k++) {
      g.fillStyle = k < len * 0.6 ? `${INK}bb` : `${INK}66`;
      g.fillRect(Math.round(cx), Math.round(cy), 1, 1);
      dir += (rnd() - 0.5) * 0.7;
      cx += Math.cos(dir);
      cy += Math.sin(dir) * 0.55;
    }
  }
};

type Mote = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: string;
  s: number;
  kind?: 'rain' | 'fog' | 'leaf';
};

/** Weather and ambient life that drifts over the fight. Purely cosmetic, never touches the sim. */
export const createAmbient = (arenaId: string, w: number, h: number, k: number, anchors: FloorAnchors) => {
  const rng = createRng(`amb:${arenaId}`);
  const motes: Mote[] = [];
  let lightning = 0;
  let nextBolt = 3 + rng.next() * 4;
  let wall = 0;
  const rate: Record<string, number> = {
    heat: 10,
    storm: 90,
    fog: 0.8,
    moon: 6,
    yard: 4,
    scrap: 5,
    mud: 18,
    plains: 6,
    alley: 3,
  };

  const emit = () => {
    switch (arenaId) {
      case 'heat': {
        const l = 2 + rng.next() * 2;
        motes.push({
          x: rng.next() * w,
          y: h + 2,
          vx: (rng.next() - 0.5) * 8,
          vy: -(14 + rng.next() * 18),
          life: l,
          max: l,
          c: rng.pick(['#ffd23f', '#ff7a2f', '#ff9a3c']),
          s: 1,
        });
        break;
      }
      case 'storm':
      case 'mud': {
        const l = 0.5;
        const sp = arenaId === 'storm' ? 320 : 170;
        motes.push({
          x: rng.next() * (w + 60) - 30,
          y: -4,
          vx: -sp * 0.3,
          vy: sp,
          life: l,
          max: l,
          c: arenaId === 'storm' ? '#b8c2f0' : '#c9d4d8',
          s: 1,
          kind: 'rain',
        });
        break;
      }
      case 'fog': {
        const l = 14 + rng.next() * 8;
        motes.push({
          x: -60,
          y: rng.next() * h,
          vx: 6 + rng.next() * 6,
          vy: 0,
          life: l,
          max: l,
          c: '#ffffff',
          s: 40 + rng.next() * 40,
          kind: 'fog',
        });
        break;
      }
      case 'moon': {
        const l = 5 + rng.next() * 4;
        motes.push({
          x: rng.next() * w,
          y: rng.next() * h,
          vx: (rng.next() - 0.5) * 3,
          vy: -(2 + rng.next() * 4),
          life: l,
          max: l,
          c: '#c9cde0',
          s: 1,
        });
        break;
      }
      case 'plains': {
        const l = 6;
        motes.push({
          x: -4,
          y: rng.next() * h,
          vx: 30 + rng.next() * 20,
          vy: (rng.next() - 0.5) * 6,
          life: l,
          max: l,
          c: rng.pick(['#e0b028', '#a8a27a', '#f4f0e6']),
          s: 1,
          kind: 'leaf',
        });
        break;
      }
      case 'alley': {
        for (const v of anchors.vents) {
          const l = 2.5 + rng.next();
          motes.push({
            x: v.x + (rng.next() - 0.5) * 8,
            y: v.y,
            vx: (rng.next() - 0.5) * 4,
            vy: -(8 + rng.next() * 6),
            life: l,
            max: l,
            c: '#f4f0e6',
            s: 3,
            kind: 'fog',
          });
        }
        break;
      }
      default: {
        // drifting dust motes
        const l = 4 + rng.next() * 3;
        motes.push({
          x: rng.next() * w,
          y: rng.next() * h,
          vx: 6 + rng.next() * 6,
          vy: (rng.next() - 0.5) * 2,
          life: l,
          max: l,
          c: '#f4f0e6',
          s: 1,
        });
      }
    }
  };

  let acc = 0;
  return {
    /** Advance and draw on top of the scene. Returns the current lightning brightness (0..1). */
    draw(g: G, dt: number, glow: (x: number, y: number, r: number, c: string, a: number) => void): number {
      wall += dt;
      acc += dt * (rate[arenaId] ?? 4);
      while (acc >= 1 && motes.length < 220) {
        acc -= 1;
        emit();
      }
      if (arenaId === 'storm') {
        nextBolt -= dt;
        if (nextBolt <= 0) {
          lightning = 1;
          nextBolt = 4 + rng.next() * 6;
        }
        lightning = Math.max(0, lightning - dt * 3.5);
      }
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i]!;
        m.life -= dt;
        if (m.life <= 0) {
          if (m.kind === 'rain' && rng.chance(0.5)) {
            // splash
            g.fillStyle = m.c;
            g.fillRect(Math.round(m.x) - 1, Math.round(m.y), 1, 1);
            g.fillRect(Math.round(m.x) + 1, Math.round(m.y), 1, 1);
          }
          motes.splice(i, 1);
          continue;
        }
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const a = Math.min(1, (m.life / m.max) * 3, (m.max - m.life) * 3);
        if (m.kind === 'fog') {
          g.save();
          glow(m.x, m.y, m.s * k, m.c, (arenaId === 'fog' ? 0.22 : 0.3) * a);
          g.restore();
          if (arenaId === 'alley') m.s += dt * 4;
          continue;
        }
        g.globalAlpha = a * (m.kind === 'rain' ? 0.55 : 0.8);
        g.fillStyle = m.c;
        if (m.kind === 'rain') {
          g.fillRect(Math.round(m.x), Math.round(m.y), 1, Math.round(4 * k));
          g.fillRect(Math.round(m.x) - 1, Math.round(m.y) + Math.round(4 * k), 1, Math.round(2 * k));
        } else if (m.kind === 'leaf') {
          m.vy = Math.sin(wall * 3 + i) * 10;
          g.fillRect(Math.round(m.x), Math.round(m.y), Math.floor(wall * 6 + i) % 2 ? 2 : 1, 1);
        } else g.fillRect(Math.round(m.x), Math.round(m.y), m.s, m.s);
      }
      g.globalAlpha = 1;
      // puddle ripples in the rain
      if ((arenaId === 'storm' || arenaId === 'mud') && anchors.puddles.length) {
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1;
        for (let j = 0; j < anchors.puddles.length; j++) {
          const p = anchors.puddles[j]!;
          const ph = (wall * 0.9 + j * 0.37) % 1;
          g.globalAlpha = 0.35 * (1 - ph);
          g.beginPath();
          g.ellipse(
            Math.round(p.x + Math.sin(j * 7) * p.r * 0.4),
            Math.round(p.y),
            1 + ph * p.r * 0.5,
            0.5 + ph * p.r * 0.22,
            0,
            0,
            Math.PI * 2
          );
          g.stroke();
        }
        g.globalAlpha = 1;
      }
      return lightning;
    },
  };
};

/** Per-arena color grade: a tint blended with soft-light over the final frame. */
export const GRADE: Record<string, { tint: string; a: number }> = {
  yard: { tint: '#ffb070', a: 0.18 },
  scrap: { tint: '#a0a8b0', a: 0.15 },
  mud: { tint: '#8a6a40', a: 0.22 },
  heat: { tint: '#ff7a2f', a: 0.25 },
  storm: { tint: '#4a5cc0', a: 0.28 },
  moon: { tint: '#6a80d0', a: 0.22 },
  alley: { tint: '#3aa0a0', a: 0.18 },
  plains: { tint: '#ffd870', a: 0.2 },
  fog: { tint: '#9ab0a0', a: 0.2 },
};

/** A darkened-corners overlay, built once per canvas size. */
export const makeVignette = (w: number, h: number, strength = 0.42): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
  grad.addColorStop(0, 'rgba(15,12,10,0)');
  grad.addColorStop(1, `rgba(15,12,10,${strength})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  return c;
};
