// Pixel-art renderer for a battle replay. Everything is drawn at a low
// internal resolution and scaled up with nearest-neighbour by CSS.
import type { Arena } from '../../shared/game/arenas';
import { FRAME_EVERY, SPECIALS, type BattleResult, type ShotEvent } from '../../shared/game/battle';
import { computeStats, type Build } from '../../shared/game/mech';
import { getPart } from '../../shared/game/parts';
import { createRng } from '../../shared/game/rng';
import { sfx } from './sfx';

export const RES_W = 360;
export const SPRITE_W = 42;
export const BOSS_SPRITE_W = 68;
const SPRITE_H = Math.round((SPRITE_W * 220) / 200);

type Theme = { floor: string; speck: string; dark: string; text: string };
export const THEMES: Record<string, Theme> = {
  yard: {
    floor: '#cfc4ae',
    speck: '#b9ad95',
    dark: '#9c9079',
    text: '#1b1a17',
  },
  fog: { floor: '#c3c7c2', speck: '#adb2ac', dark: '#8f958e', text: '#1b1a17' },
  mud: { floor: '#7d6447', speck: '#6a533a', dark: '#4f3d2a', text: '#f4ead8' },
  heat: {
    floor: '#e2a466',
    speck: '#cf8a4c',
    dark: '#a9632d',
    text: '#1b1a17',
  },
  storm: {
    floor: '#3f4360',
    speck: '#4f5577',
    dark: '#2c2f45',
    text: '#efe8da',
  },
  moon: {
    floor: '#2b2d34',
    speck: '#3a3d46',
    dark: '#1a1b20',
    text: '#efe8da',
  },
  alley: {
    floor: '#aaa294',
    speck: '#958d7f',
    dark: '#6f685c',
    text: '#1b1a17',
  },
  plains: {
    floor: '#e6e0cf',
    speck: '#d6cfba',
    dark: '#bdb59d',
    text: '#1b1a17',
  },
  scrap: {
    floor: '#9a9384',
    speck: '#857e70',
    dark: '#625c50',
    text: '#1b1a17',
  },
};

type Fx =
  | 'tracer'
  | 'bullet'
  | 'pellets'
  | 'beam'
  | 'rail'
  | 'pulse'
  | 'drone'
  | 'flame'
  | 'missiles'
  | 'shell'
  | 'spike'
  | 'slash';

const FX_BY_PART: Record<string, Fx> = {
  'r-rifle': 'tracer',
  'lw-pistol': 'tracer',
  'r-buzz': 'bullet',
  'r-scatter': 'pellets',
  'r-beam': 'beam',
  'r-rail': 'rail',
  'lw-lance': 'pulse',
  'bk-orbit': 'drone',
  'lw-flamer': 'flame',
  'bk-swarm': 'missiles',
  'bk-howitzer': 'shell',
  'r-pile': 'spike',
  'lw-saber': 'slash',
};

const FALLBACK: Record<ShotEvent['type'], Fx> = {
  kinetic: 'tracer',
  energy: 'beam',
  explosive: 'missiles',
  melee: 'slash',
};

/** How many ticks the projectile is in the air (0 = instant). */
const flightOf = (fx: Fx, dist: number): number => {
  switch (fx) {
    case 'tracer':
    case 'bullet':
    case 'pellets':
      return Math.max(1, dist / 70);
    case 'pulse':
      return Math.max(1.5, dist / 45);
    case 'missiles':
      return Math.max(3, dist / 30);
    case 'shell':
      return Math.max(5, dist / 22);
    case 'flame':
      return 2;
    default:
      return 0;
  }
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  colors: string[]; // gradient over lifetime, first = young
  size: number;
  grow?: number;
};

type Frame = {
  x: number;
  y: number;
  hp: number;
  heat: number;
  energy: number;
  moving: boolean;
}[];

export const frameAt = (r: BattleResult, tick: number): Frame => {
  const n = r.frames.length / 10;
  const f = Math.min(n - 1, Math.max(0, tick / FRAME_EVERY));
  const i0 = Math.floor(f);
  const i1 = Math.min(n - 1, i0 + 1);
  const k = f - i0;
  const get = (i: number, j: number) => r.frames[i * 10 + j]!;
  const lerp = (j: number) => get(i0, j) + (get(i1, j) - get(i0, j)) * k;
  return [0, 1].map((m) => ({
    x: lerp(m * 5),
    y: lerp(m * 5 + 1),
    hp: get(i0, m * 5 + 2),
    heat: get(i0, m * 5 + 3),
    energy: get(i0, m * 5 + 4),
    moving: Math.abs(get(i1, m * 5) - get(i0, m * 5)) + Math.abs(get(i1, m * 5 + 1) - get(i0, m * 5 + 1)) > 0.5,
  }));
};

/** Little pixel props so the arenas don't look empty. Drawn once onto the floor layer. */
const drawProps = (g: CanvasRenderingContext2D, arena: Arena, w: number, h: number, theme: Theme) => {
  const rng = createRng(`props:${arena.id}`);
  const px = (x: number, y: number, ww: number, hh: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), ww, hh);
  };
  // keep the middle-ish lane clear where the fight usually happens
  const spot = () => {
    for (;;) {
      const x = 8 + rng.next() * (w - 16);
      const y = 8 + rng.next() * (h - 16);
      if (Math.abs(y - h / 2) > h * 0.22 || rng.chance(0.25)) return { x, y };
    }
  };
  for (let i = 0; i < 160; i++) px(rng.next() * w, rng.next() * h, 1, 1, theme.speck);
  for (let i = 0; i < 40; i++) px(rng.next() * w, rng.next() * h, 2, 1, theme.dark);

  const crate = (x: number, y: number) => {
    px(x, y, 10, 9, '#1b1a17');
    px(x + 1, y + 1, 8, 7, '#a0703f');
    px(x + 1, y + 4, 8, 1, '#7a5230');
    px(x + 4, y + 1, 1, 7, '#7a5230');
  };
  const barrel = (x: number, y: number, c: string) => {
    px(x, y, 7, 9, '#1b1a17');
    px(x + 1, y + 1, 5, 7, c);
    px(x + 1, y + 3, 5, 1, '#1b1a17');
    px(x + 2, y + 1, 1, 7, 'rgba(255,255,255,0.35)');
  };
  const tire = (x: number, y: number) => {
    px(x, y + 1, 9, 5, '#1b1a17');
    px(x + 1, y, 7, 7, '#1b1a17');
    px(x + 3, y + 2, 3, 3, theme.floor);
  };
  const rock = (x: number, y: number, c: string) => {
    px(x + 1, y, 6, 1, '#1b1a17');
    px(x, y + 1, 8, 4, '#1b1a17');
    px(x + 1, y + 1, 6, 3, c);
    px(x + 2, y + 1, 2, 1, 'rgba(255,255,255,0.3)');
  };

  switch (arena.id) {
    case 'yard':
    case 'scrap':
      for (let i = 0; i < 7; i++) {
        const s = spot();
        const r = rng.int(3);
        if (r === 0) crate(s.x, s.y);
        else if (r === 1) barrel(s.x, s.y, rng.pick(['#c0392b', '#2f4858', '#d9a441']));
        else tire(s.x, s.y);
      }
      if (arena.id === 'scrap') for (let i = 0; i < 14; i++) px(rng.next() * w, rng.next() * h, 3, 2, '#4a453d');
      break;
    case 'mud':
      for (let i = 0; i < 10; i++) {
        const s = spot();
        const pw = 10 + rng.int(18);
        px(s.x, s.y, pw, 4, theme.dark);
        px(s.x + 2, s.y - 1, pw - 4, 1, theme.dark);
        px(s.x + 3, s.y + 1, 3, 1, 'rgba(255,255,255,0.25)');
      }
      break;
    case 'heat':
      for (let i = 0; i < 12; i++) {
        let x = rng.next() * w;
        let y = rng.next() * h;
        for (let k = 0; k < 8; k++) {
          px(x, y, 1, 1, theme.dark);
          x += rng.int(3) - 1;
          y += 1;
        }
      }
      for (let i = 0; i < 4; i++) {
        const s = spot();
        rock(s.x, s.y, '#b8743a');
      }
      break;
    case 'storm':
      for (let i = 0; i < 5; i++) {
        const s = spot();
        px(s.x + 3, s.y - 10, 1, 14, '#1b1a17');
        px(s.x, s.y + 3, 7, 2, '#1b1a17');
        px(s.x + 2, s.y - 12, 3, 2, '#ffd23f');
      }
      break;
    case 'moon':
      for (let i = 0; i < 9; i++) {
        const s = spot();
        const r = 4 + rng.int(6);
        g.fillStyle = theme.dark;
        g.beginPath();
        g.ellipse(Math.round(s.x), Math.round(s.y), r, Math.round(r * 0.6), 0, 0, Math.PI * 2);
        g.fill();
        px(s.x - r + 1, s.y + Math.round(r * 0.6) - 1, r * 2 - 2, 1, '#4a4d58');
      }
      for (let i = 0; i < 30; i++) px(rng.next() * w, rng.next() * h, 1, 1, '#6b6f7c');
      break;
    case 'alley':
      for (let x = 0; x < w; x += 8) {
        for (const y of [0, h - 6]) {
          px(x, y, 7, 3, '#7a4a3a');
          px(x + 4, y + 3, 7, 3, '#7a4a3a');
        }
      }
      for (let i = 0; i < 4; i++) {
        const s = spot();
        barrel(s.x, s.y, '#2f4858');
      }
      break;
    case 'plains':
      for (let i = 0; i < 22; i++) {
        const x = rng.next() * w;
        const y = rng.next() * h;
        px(x, y, 6 + rng.int(8), 1, theme.dark);
      }
      for (let i = 0; i < 3; i++) {
        const s = spot();
        rock(s.x, s.y, '#bfb59b');
      }
      break;
    case 'fog':
      for (let i = 0; i < 6; i++) {
        const s = spot();
        px(s.x + 3, s.y - 10, 2, 14, '#4a453d');
        px(s.x, s.y - 8, 3, 1, '#4a453d');
        px(s.x + 5, s.y - 6, 3, 1, '#4a453d');
      }
      break;
  }
};

export type Renderer = {
  draw: (t: number, dt: number) => boolean;
  /** Seconds of hit-stop requested by big impacts; the caller pauses sim time. */
  takeFreeze: () => number;
};

export const createRenderer = (
  canvas: HTMLCanvasElement,
  result: BattleResult,
  builds: [Build, Build],
  arena: Arena,
  sprites: {
    current: { normal: HTMLCanvasElement; white: HTMLCanvasElement }[];
  },
  getTags: () => [string, string],
  getSpeed: () => number,
  bossSide: 0 | 1 | null = null
): Renderer | null => {
  const sw = [0, 1].map((i) => (i === bossSide ? BOSS_SPRITE_W : SPRITE_W));
  const sh = sw.map((w) => Math.round((w * 220) / 200));
  const W = RES_W;
  const H = Math.round((RES_W * arena.height) / arena.width);
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  const sc = W / arena.width;
  const theme = THEMES[arena.id] ?? THEMES.yard!;
  const rng = createRng('fx');

  // floor layer: props + scorch marks accumulate here
  const floor = document.createElement('canvas');
  floor.width = W;
  floor.height = H;
  const fg = floor.getContext('2d');
  if (!fg) return null;
  fg.fillStyle = theme.floor;
  fg.fillRect(0, 0, W, H);
  drawProps(fg, arena, W, H, theme);

  const scorch = (x: number, y: number, r: number) => {
    for (let i = 0; i < r * 5; i++) {
      const ox = Math.round((rng.next() - 0.5) * r * 2);
      const oy = Math.round((rng.next() - 0.5) * r * 1.2);
      fg.fillStyle = rng.chance(0.5) ? 'rgba(27,26,23,0.35)' : 'rgba(27,26,23,0.18)';
      fg.fillRect(Math.round(x) + ox, Math.round(y) + oy + 6, 1, 1);
    }
  };

  const particles: Particle[] = [];
  const spawn = (
    x: number,
    y: number,
    n: number,
    colors: string[],
    spd: number,
    life: number,
    size = 1,
    dirX = 0,
    dirY = 0,
    spread = 1,
    grow = 0
  ) => {
    for (let i = 0; i < n; i++) {
      const a = rng.next() * 6.283;
      const v = spd * (0.35 + rng.next());
      const vx = Math.cos(a) * v * spread + dirX * spd;
      const vy = Math.sin(a) * v * spread + dirY * spd;
      const l = life * (0.6 + rng.next() * 0.6);
      particles.push({ x, y, vx, vy, life: l, max: l, colors, size, grow });
    }
  };

  const flashUntil = [0, 0];
  const muzzle: { until: number; color: string; size: number }[] = [
    { until: 0, color: '#fff', size: 2 },
    { until: 0, color: '#fff', size: 2 },
  ];
  const shieldUntil = [0, 0];
  const heatWarned = [false, false];
  const impacted = new Set<number>();
  let shake = 0;
  let nextEvent = 0;
  let koPlayed = false;
  let flash = 0;
  const debrisDone = new Set<number>();
  let sepOffset = 0;
  let freeze = 0;
  const recoil = [
    { until: 0, px: 0 },
    { until: 0, px: 0 },
  ];
  const facing: (1 | -1)[] = [1, -1];
  const walked = [0, 0];
  const lastPos: { x: number; y: number }[] = [];
  let nextSpecial = 0;
  let nextMove = 0;
  const qbUntil = [0, 0];
  const topSpeed = builds.map((b) => Math.max(40, computeStats(b, arena).speed));
  const trail: { x: number; y: number }[][] = [[], []];
  let lastT = 0;
  const legTypes = builds.map((b) => {
    const p = getPart(b.parts.legs);
    return p.slot === 'legs' ? p.legType : 'biped';
  });

  const fxOf = (ev: ShotEvent): Fx => FX_BY_PART[builds[ev.by].parts[ev.slot]] ?? FALLBACK[ev.type];
  const gun = (p: { x: number; y: number }, o: { x: number; y: number }, slot: ShotEvent['slot']) => {
    const dir = o.x < p.x ? -1 : 1;
    if (slot === 'back') return { x: p.x - dir * 6, y: p.y - SPRITE_H * 0.32 };
    const front = slot === 'weaponR' ? 1 : -1; // which hand faces the camera side
    return { x: p.x + dir * 12, y: p.y + 2 + front };
  };
  const aimPoint = (ev: ShotEvent, to: { x: number; y: number }, i: number) => {
    if (ev.hit) return { x: to.x, y: to.y - 2 };
    const side = (ev.t * 13 + i) % 2 === 0 ? 1 : -1;
    return { x: to.x + side * 14, y: to.y + side * 9 };
  };

  const line = (x0: number, y0: number, x1: number, y1: number, color: string, width = 1) => {
    // Bresenham-ish pixel line so beams stay crisp
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    g.fillStyle = color;
    const off = Math.floor(width / 2);
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x0 + (dx * s) / steps) - off;
      const y = Math.round(y0 + (dy * s) / steps) - off;
      g.fillRect(x, y, width, width);
    }
  };

  const draw = (t: number, dt: number): boolean => {
    const fr = frameAt(result, t);
    const pos = fr.map((m) => ({ x: m.x * sc, y: m.y * sc }));
    // Melee fights put mechs on top of each other; ease them apart visually
    // (eased so mechs passing each other glide instead of snapping).
    {
      const rawDx = pos[1]!.x - pos[0]!.x;
      const gap = ((sw[0]! + sw[1]!) / 2) * 0.7;
      const target = Math.abs(rawDx) < gap ? ((rawDx >= 0 ? 1 : -1) * (gap - Math.abs(rawDx))) / 2 : 0;
      const step = 90 * dt * Math.max(1, getSpeed());
      sepOffset += Math.max(-step, Math.min(step, target - sepOffset));
      pos[0]!.x = Math.max(SPRITE_W / 2, Math.min(W - SPRITE_W / 2, pos[0]!.x - sepOffset));
      pos[1]!.x = Math.max(SPRITE_W / 2, Math.min(W - SPRITE_W / 2, pos[1]!.x + sepOffset));
    }
    // keep whole sprites (incl. name tags) inside the arena
    for (let i = 0; i < 2; i++) pos[i]!.y = Math.max(sh[i]! / 2 + 14, Math.min(H - sh[i]! / 2 - 1, pos[i]!.y));
    const hopAt = (i: number, tt: number) => {
      // reverse-joint legs move in visible hops: a little parabola every 0.45s
      if (legTypes[i] !== 'reverse' || !fr[i]!.moving) return 0;
      const ph = (tt / 4.5 + i * 0.37) % 1;
      return 4 * ph * (1 - ph) * 9;
    };
    const quiet = getSpeed() > 2;

    // ── boosting: quick boosts, overboost, exhaust ──
    while (nextMove < result.moves.length && result.moves[nextMove]!.t <= t) {
      const mv = result.moves[nextMove++]!;
      if (t - mv.t > 20) continue;
      const p = pos[mv.by]!;
      if (mv.kind === 'qb') {
        qbUntil[mv.by] = t + 3.5;
        if (!quiet) sfx.qb(mv.by);
        // flame blast out the back of the dash, plus a dust ring
        spawn(
          p.x - mv.dx * 8,
          p.y - mv.dy * 8 + 2,
          10,
          ['#ffffff', '#bffcfb', '#ffd23f', '#ff7a2f', '#8a8478'],
          70,
          0.35,
          2,
          -mv.dx,
          -mv.dy,
          0.35,
          1
        );
        spawn(p.x, p.y + sh[mv.by]! * 0.42, 6, [theme.speck, theme.dark], 26, 0.45, 2, 0, 0, 1, 1);
      } else {
        if (!quiet) sfx.ob();
        flash = Math.max(flash, 0.05);
        spawn(
          p.x - mv.dx * 10,
          p.y - mv.dy * 10,
          22,
          ['#ffffff', '#bffcfb', '#3cf0ec', '#ffd23f', '#ff7a2f'],
          90,
          0.5,
          2,
          -mv.dx,
          -mv.dy,
          0.4,
          1.5
        );
        shake = Math.max(shake, 2);
      }
    }
    {
      const prev = frameAt(result, Math.max(0, t - 1));
      for (let i = 0; i < 2; i++) {
        const vx = fr[i]!.x - prev[i]!.x; // metres per tick
        const vy = fr[i]!.y - prev[i]!.y;
        const v = Math.sqrt(vx * vx + vy * vy) * 10; // m/s
        if (v < 15 || t >= result.ticks) continue;
        const ratio = v / topSpeed[i]!;
        const p = pos[i]!;
        const ux = vx / (v / 10);
        const uy = vy / (v / 10);
        const bx = p.x - ux * (sw[i]! * 0.32);
        const by = p.y - uy * 4 - sh[i]! * 0.1;
        const hot = ratio > 1.4; // overboost or quick-boost glide
        const n = hot ? 3 : ratio > 0.5 && rng.chance(0.6) ? 1 : 0;
        if (n)
          spawn(
            bx,
            by,
            n,
            hot
              ? ['#ffffff', '#bffcfb', '#3cf0ec', '#ffd23f', '#ff7a2f']
              : ['#fff3b0', '#ffd23f', '#ff7a2f', '#8a8478'],
            hot ? 55 : 28,
            hot ? 0.35 : 0.22,
            hot ? 2 : 1,
            -ux,
            -uy,
            0.25,
            0.5
          );
      }
    }

    // ── chip specials ──
    while (nextSpecial < result.specials.length && result.specials[nextSpecial]!.t <= t) {
      const sp = result.specials[nextSpecial++]!;
      if (t - sp.t > 20) continue;
      const p = pos[sp.by]!;
      sfx.special();
      const cols =
        sp.kind === 'turtle' || sp.kind === 'flank'
          ? ['#ffffff', '#3cf0ec']
          : sp.kind === 'kite'
            ? ['#f4f0e6', '#c9c4b8']
            : ['#ffffff', '#ffd23f', '#e4572e'];
      spawn(p.x, p.y, 18, cols, 45, 0.5, 2);
      if (sp.kind === 'kite') spawn(p.x, p.y, 30, ['#f4f0e6', '#d6d1c4', '#a9a497'], 22, 2.2, 4, 0, 0, 1, 3);
      shake = Math.max(shake, 2);
    }
    const specialActive = (i: number) =>
      result.specials.find((sp) => sp.by === i && t >= sp.t && t < Math.max(sp.until, sp.t + 1)) ?? null;

    // ── weapons fired ──
    while (nextEvent < result.events.length && result.events[nextEvent]!.t <= t) {
      const idx = nextEvent++;
      const ev = result.events[idx]!;
      if (t - ev.t > 20) {
        impacted.add(idx);
        continue;
      }
      const me = pos[ev.by]!;
      const foe = pos[1 - ev.by]!;
      const fx = fxOf(ev);
      const m = gun(me, foe, ev.slot);
      if (!quiet || ev.dmg > 140) sfx.shoot(ev.type, ev.by);
      if (ev.crit) {
        sfx.crit();
        flash = Math.max(flash, 0.1);
        shake = Math.max(shake, 5);
      }
      const mc = ev.type === 'energy' ? '#bffcfb' : ev.type === 'explosive' ? '#ffb36b' : '#fff3b0';
      muzzle[ev.by] = {
        until: t + 0.8,
        color: mc,
        size: fx === 'rail' || fx === 'shell' ? 4 : 2,
      };
      const kick =
        fx === 'rail' || fx === 'shell' ? 4 : fx === 'pellets' || fx === 'spike' ? 3 : fx === 'missiles' ? 2 : 1;
      if (kick >= recoil[ev.by]!.px || t > recoil[ev.by]!.until)
        recoil[ev.by] = { until: t + (kick > 2 ? 1.5 : 0.7), px: kick };
      if (fx === 'tracer' || fx === 'bullet' || fx === 'pellets') {
        // ejected shell casing
        spawn(me.x, me.y, 1, ['#d9a441', '#8a6a2a'], 18, 0.5, 1, foe.x < me.x ? 0.8 : -0.8, -0.6, 0.3);
      }
      if (fx === 'flame') {
        const dx = foe.x - m.x;
        const dy = foe.y - m.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        spawn(
          m.x,
          m.y,
          7,
          ['#ffffff', '#ffd23f', '#ff7a2f', '#c0392b', '#5b5148'],
          95,
          0.45,
          2,
          dx / d,
          dy / d,
          0.25,
          1.5
        );
      }
      if (fx === 'missiles' || fx === 'shell') spawn(m.x, m.y, 5, ['#d8d2c4', '#8a8478'], 12, 0.6, 2);
      if (fx === 'rail') shake = Math.max(shake, 2);
    }

    // ── projectiles landing ──
    for (let i = nextEvent - 1; i >= 0; i--) {
      const ev = result.events[i]!;
      if (ev.t < t - 30) break;
      if (impacted.has(i)) continue;
      const fx = fxOf(ev);
      const me = pos[ev.by]!;
      const foe = pos[1 - ev.by]!;
      const dist = Math.hypot(foe.x - me.x, foe.y - me.y);
      if (t < ev.t + flightOf(fx, dist)) continue;
      impacted.add(i);
      const at = aimPoint(ev, foe, i);
      const victim = 1 - ev.by;
      if (!ev.hit) {
        spawn(at.x, at.y + 4, 3, [theme.speck, theme.dark], 14, 0.4, 1);
        if (fx === 'missiles' || fx === 'shell') {
          spawn(
            at.x,
            at.y,
            fx === 'shell' ? 20 : 8,
            ['#ffffff', '#ffd23f', '#ff7a2f', '#5b5148'],
            fx === 'shell' ? 45 : 28,
            0.5,
            2
          );
          scorch(at.x, at.y, fx === 'shell' ? 7 : 4);
        }
        continue;
      }
      const big = ev.dmg > 140;
      flashUntil[victim] = t + 1.2;
      if (!quiet) freeze = Math.max(freeze, ev.dmg > 300 ? 0.13 : big ? 0.07 : ev.type === 'melee' ? 0.05 : 0);
      if (ev.blocked) {
        shieldUntil[victim] = t + 2;
        sfx.block();
      } else sfx.hit(big);
      switch (fx) {
        case 'missiles':
          spawn(at.x, at.y, 14, ['#ffffff', '#ffd23f', '#ff7a2f', '#c0392b', '#5b5148'], 34, 0.55, 2, 0, -0.2, 1, 1);
          spawn(at.x, at.y, 6, ['#6e675c', '#3d3a34'], 10, 1.1, 2, 0, -0.4, 0.6, 1.5);
          scorch(at.x, at.y, 4);
          shake = Math.max(shake, 2);
          break;
        case 'shell':
          spawn(
            at.x,
            at.y,
            34,
            ['#ffffff', '#fff3b0', '#ffd23f', '#ff7a2f', '#c0392b', '#5b5148'],
            60,
            0.8,
            2,
            0,
            -0.2,
            1,
            1.5
          );
          spawn(at.x, at.y, 14, ['#6e675c', '#3d3a34'], 14, 1.6, 3, 0, -0.5, 0.6, 2);
          scorch(at.x, at.y, 9);
          shake = 6;
          flash = 0.12;
          break;
        case 'rail':
          spawn(at.x, at.y, 22, ['#ffffff', '#bffcfb', '#3cf0ec', '#127475'], 55, 0.6, 1);
          shake = Math.max(shake, 4);
          break;
        case 'spike':
        case 'slash':
          spawn(at.x, at.y, 16, ['#ffffff', '#ffd23f', '#ff7a2f'], 50, 0.35, 1, foe.x > me.x ? 0.7 : -0.7, -0.2, 0.7);
          shake = Math.max(shake, big ? 4 : 2);
          break;
        case 'flame':
          spawn(at.x, at.y, 3, ['#ffd23f', '#ff7a2f', '#5b5148'], 14, 0.5, 2, 0, -0.6, 0.5, 1);
          break;
        case 'beam':
        case 'pulse':
        case 'drone':
          spawn(at.x, at.y, big ? 10 : 5, ['#ffffff', '#3cf0ec', '#127475'], 30, 0.35, 1);
          break;
        default:
          spawn(at.x, at.y, big ? 10 : 4, ['#ffffff', '#ffd23f', '#ff7a2f'], 32, 0.3, 1);
      }
      if (big) shake = Math.max(shake, 3);
    }

    fr.forEach((m, i) => {
      if (m.heat >= 100 && !heatWarned[i]) {
        heatWarned[i] = true;
        sfx.overheat();
      }
      if (m.heat < 60) heatWarned[i] = false;
      const p = pos[i]!;
      // steam when hot, dust when walking
      if (m.heat > 85 && rng.chance(0.35))
        spawn(p.x + (rng.next() - 0.5) * 10, p.y - sh[i]! * 0.3, 1, ['#f4f0e6', '#c9c4b8'], 8, 0.9, 2, 0, -1, 0.3, 1);
      if (m.moving && rng.chance(0.3))
        spawn(
          p.x + (rng.next() - 0.5) * 8,
          p.y + sh[i]! * 0.42,
          1,
          [theme.speck, theme.dark],
          6,
          0.5,
          2,
          0,
          -0.3,
          0.6,
          0.5
        );
    });

    if (t >= result.ticks && !koPlayed) {
      koPlayed = true;
      const loser = pos[1 - result.winner]!;
      if (result.reason === 'ko') {
        freeze = 0.25;
        sfx.ko();
        shake = 8;
        flash = 0.2;
        spawn(
          loser.x,
          loser.y,
          50,
          ['#ffffff', '#fff3b0', '#ffd23f', '#ff7a2f', '#c0392b', '#3d3a34'],
          75,
          1.2,
          2,
          0,
          -0.2,
          1,
          2
        );
        spawn(loser.x, loser.y, 22, ['#1b1a17', '#4a453d'], 40, 1.8, 2, 0, -0.3, 1, 1);
        spawn(loser.x, loser.y, 16, ['#6e675c', '#3d3a34', '#2a2823'], 10, 2.4, 3, 0, -0.6, 0.5, 2.5);
        scorch(loser.x, loser.y, 12);
      }
      setTimeout(() => (result.winner === 0 || getTags()[0] !== 'YOU' ? sfx.win() : sfx.lose()), 650);
    }

    // ── draw ──
    g.save();
    if (shake > 0.2) {
      g.translate(Math.round((rng.next() - 0.5) * shake * 2), Math.round((rng.next() - 0.5) * shake * 2));
      shake *= Math.pow(0.02, dt);
    }
    g.drawImage(floor, 0, 0);

    // falling scrap (with warning shadows)
    if (arena.hazard) {
      const hr = createRng(`debris:${result.ticks}`);
      for (const ht of result.hazardHits) {
        const x = hr.next() * W;
        const y = hr.next() * H;
        if (ht > t + 10 || ht < t - 3) continue;
        if (ht > t) {
          const k = 1 - (ht - t) / 10;
          g.fillStyle = 'rgba(27,26,23,0.3)';
          g.fillRect(Math.round(x - 2 - k * 3), Math.round(y), Math.round(4 + k * 6), 2);
          g.fillStyle = '#4a453d';
          g.fillRect(Math.round(x - 2), Math.round(y - (ht - t) * 12), 4, 4);
        } else if (!debrisDone.has(ht)) {
          debrisDone.add(ht);
          spawn(x, y, 8, ['#a59e90', '#4a453d'], 20, 0.5, 1);
        }
      }
    }

    for (let i = 0; i < 2; i++) {
      const p = pos[i]!;
      const o = pos[1 - i]!;
      if (o.x < p.x - 6) facing[i] = -1;
      else if (o.x > p.x + 6) facing[i] = 1;
      const lp = lastPos[i];
      if (lp) walked[i] = walked[i]! + Math.hypot(p.x - lp.x, p.y - lp.y);
      lastPos[i] = { x: p.x, y: p.y };
    }

    // mechs, back to front
    const order = pos[0]!.y < pos[1]!.y ? [0, 1] : [1, 0];
    for (const i of order) {
      const SW = sw[i]!;
      const SH = sh[i]!;
      const m = fr[i]!;
      const p = pos[i]!;
      const other = pos[1 - i]!;
      const leg = legTypes[i];
      const hop = hopAt(i, t);
      let bobY = 0;
      if (leg === 'reverse') bobY = -Math.round(hop);
      else if (leg === 'hover') bobY = Math.floor(t / 3 + i) % 2 === 0 ? -2 : -1;
      else if (m.moving) bobY = Math.floor(walked[i]! / 7) % 2 === 0 ? -1 : 0; // a step every few pixels walked
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      const shadowW = Math.max(12, 24 - Math.round(hop));
      g.fillStyle = 'rgba(27,26,23,0.28)';
      g.fillRect(x - shadowW / 2, y + SH / 2 - 3, shadowW, 3);
      g.fillRect(x - shadowW / 2 + 3, y + SH / 2 - 4, shadowW - 6, 1);
      if (leg === 'hover') {
        g.fillStyle = Math.floor(t * 3) % 2 === 0 ? 'rgba(60,240,236,0.5)' : 'rgba(60,240,236,0.25)';
        g.fillRect(x - 8, y + SH / 2 - 5, 16, 1);
      }
      // landing puff at the end of each hop
      if (leg === 'reverse' && m.moving && hop < 1.2 && hopAt(i, lastT) >= 1.2) {
        spawn(x - 5, y + SH / 2 - 2, 2, [theme.speck, theme.dark], 10, 0.4, 2, -0.5, -0.2, 0.4);
        spawn(x + 5, y + SH / 2 - 2, 2, [theme.speck, theme.dark], 10, 0.4, 2, 0.5, -0.2, 0.4);
      }
      const sp = sprites.current[i];
      const act = specialActive(i);
      // afterimages while dashing
      if ((act && (act.kind === 'rush' || act.kind === 'flank')) || t < qbUntil[i]!) {
        const tr = trail[i]!;
        tr.unshift({ x, y: y + bobY });
        if (tr.length > 6) tr.pop();
        if (sp) {
          tr.forEach((pt, k) => {
            if (k % 2 === 1) return;
            g.save();
            g.globalAlpha = 0.35 - k * 0.05;
            g.translate(pt.x, pt.y);
            if (facing[i] === -1) g.scale(-1, 1);
            g.drawImage(sp.white, -SW / 2, -SH / 2);
            g.restore();
          });
        }
      } else trail[i] = [];
      if (act && act.kind === 'berserk' && Math.floor(t * 3) % 2 === 0) {
        g.fillStyle = 'rgba(228,87,46,0.35)';
        g.fillRect(x - SW / 2 - 2, y - SH / 2 - 2, SW + 4, SH + 4);
      }
      g.save();
      const rc = recoil[i]!;
      const kickBack = t < rc.until ? Math.round(rc.px * ((rc.until - t) / (rc.px > 2 ? 1.5 : 0.7))) : 0;
      g.translate(x - facing[i]! * kickBack, y + bobY);
      if (facing[i] === -1) g.scale(-1, 1);
      if (m.hp <= 0) g.globalAlpha = 0.35;
      if (sp) g.drawImage(t < flashUntil[i]! && Math.floor(t * 4) % 2 === 0 ? sp.white : sp.normal, -SW / 2, -SH / 2);
      else {
        g.fillStyle = '#888';
        g.fillRect(-8, -12, 16, 24);
      }
      g.restore();

      if (act && act.kind === 'turtle') {
        g.strokeStyle = Math.floor(t * 4) % 2 === 0 ? '#3cf0ec' : '#bffcfb';
        g.lineWidth = 1;
        g.strokeRect(x - SW / 2 - 3.5, y - SH / 2 - 3.5, SW + 7, SH + 7);
      }
      if (act && act.kind === 'kite' && rng.chance(0.5)) {
        spawn(
          x + (rng.next() - 0.5) * 30,
          y + (rng.next() - 0.5) * 20,
          1,
          ['#f4f0e6', '#c9c4b8'],
          6,
          1.4,
          4,
          0,
          -0.3,
          0.5,
          2
        );
      }
      // sniper: laser sight until the charged shot goes off
      const charge = result.specials.find((s2) => s2.by === i && s2.kind === 'sniper' && t >= s2.t);
      if (charge) {
        const critEv = result.events.find((e) => e.by === i && e.crit && e.t >= charge.t);
        if (critEv && t < critEv.t)
          line(x, y - 4, other.x, other.y - 2, Math.floor(t * 4) % 2 === 0 ? '#e4572e' : '#ff9b7a');
      }
      if (t < shieldUntil[i]!) {
        g.strokeStyle = Math.floor(t * 6) % 2 === 0 ? '#3cf0ec' : '#bffcfb';
        g.lineWidth = 1;
        const dir = other.x < p.x ? -1 : 1;
        const sx = x + dir * 16;
        for (let k = -10; k <= 10; k += 2) g.strokeRect(sx + (Math.abs(k) > 6 ? -dir : 0), y + k, 1, 1);
      }

      // name plate
      const tag = getTags()[i]!;
      g.font = '8px Silkscreen, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      const tw = Math.ceil(g.measureText(tag).width) + 4;
      const ty = y - SH / 2 - 11;
      g.fillStyle = '#1b1a17';
      g.fillRect(x - Math.ceil(tw / 2) - 1, ty - 1, tw + 2, 10);
      g.fillStyle = i === 0 ? '#ffc914' : '#f8f4ec';
      g.fillRect(x - Math.ceil(tw / 2), ty, tw, 8);
      g.fillStyle = '#1b1a17';
      g.fillText(tag, x, ty);
      if (m.heat >= 100 && Math.floor(t) % 2 === 0) {
        g.fillStyle = '#e4572e';
        g.fillText('HOT', x, ty - 10);
      }
    }

    // projectiles in flight + beams
    for (let i = nextEvent - 1; i >= 0; i--) {
      const ev = result.events[i]!;
      if (ev.t < t - 30) break;
      const fx = fxOf(ev);
      const me = pos[ev.by]!;
      const foe = pos[1 - ev.by]!;
      const from = gun(me, foe, ev.slot);
      const to = aimPoint(ev, foe, i);
      const dist = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const flight = flightOf(fx, dist);
      const age = t - ev.t;
      const ux = (to.x - from.x) / dist;
      const uy = (to.y - from.y) / dist;
      const at = (p: number) => ({
        x: from.x + (to.x - from.x) * p,
        y: from.y + (to.y - from.y) * p,
      });

      switch (fx) {
        case 'tracer': {
          if (age > flight) break;
          const p = at(age / flight);
          line(p.x - ux * 7, p.y - uy * 7, p.x, p.y, '#ffd23f');
          g.fillStyle = '#ffffff';
          g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
          break;
        }
        case 'bullet': {
          if (age > flight) break;
          const p = at(age / flight);
          line(p.x - ux * 3, p.y - uy * 3, p.x, p.y, '#ffe27a');
          break;
        }
        case 'pellets': {
          if (age > flight) break;
          for (let k = -2; k <= 2; k++) {
            const p = at(age / flight);
            const off = k * 3 * (age / flight + 0.2);
            g.fillStyle = k === 0 ? '#ffffff' : '#ffd23f';
            g.fillRect(Math.round(p.x - uy * off), Math.round(p.y + ux * off), 2, 2);
          }
          break;
        }
        case 'beam':
        case 'drone': {
          const dur = fx === 'beam' ? 2.2 : 1.4;
          if (age > dur) break;
          const fade = 1 - age / dur;
          const src = fx === 'drone' ? { x: me.x + (foe.x < me.x ? 8 : -8), y: me.y - SPRITE_H * 0.55 } : from;
          if (fx === 'drone') {
            g.fillStyle = '#1b1a17';
            g.fillRect(Math.round(src.x) - 2, Math.round(src.y) - 2, 5, 5);
            g.fillStyle = '#3cf0ec';
            g.fillRect(Math.round(src.x) - 1, Math.round(src.y) - 1, 3, 3);
          }
          g.globalAlpha = fade;
          if (fx === 'beam') line(src.x, src.y, to.x, to.y, '#127475', 3);
          line(src.x, src.y, to.x, to.y, '#3cf0ec', fx === 'beam' ? 2 : 1);
          if (Math.floor(age * 8) % 2 === 0) line(src.x, src.y, to.x, to.y, '#ffffff', 1);
          g.globalAlpha = 1;
          break;
        }
        case 'rail': {
          const dur = 4;
          if (age > dur) break;
          const fade = 1 - age / dur;
          g.globalAlpha = fade;
          line(from.x, from.y, to.x, to.y, '#127475', 5);
          line(from.x, from.y, to.x, to.y, '#3cf0ec', 3);
          line(from.x, from.y, to.x, to.y, '#ffffff', 1);
          // residue rings along the beam
          for (let s = 0.1; s < 1; s += 0.12) {
            const p = at(s);
            const r = Math.round(2 + age * 2);
            g.fillStyle = '#bffcfb';
            g.fillRect(Math.round(p.x - uy * r), Math.round(p.y + ux * r), 1, 1);
            g.fillRect(Math.round(p.x + uy * r), Math.round(p.y - ux * r), 1, 1);
          }
          g.globalAlpha = 1;
          break;
        }
        case 'pulse': {
          if (age > flight) break;
          const p = at(age / flight);
          line(p.x - ux * 9, p.y - uy * 9, p.x, p.y, '#127475', 3);
          line(p.x - ux * 8, p.y - uy * 8, p.x, p.y, '#3cf0ec', 2);
          g.fillStyle = '#ffffff';
          g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
          break;
        }
        case 'missiles':
        case 'shell': {
          if (age > flight) break;
          const count = fx === 'missiles' ? 3 : 1;
          for (let k = 0; k < count; k++) {
            const prog = Math.min(1, (age - k * 0.4) / flight);
            if (prog < 0) continue;
            const base = at(prog);
            const arcH = fx === 'shell' ? Math.min(60, dist * 0.45) : (k - 1) * 14 + 10;
            const lift = 4 * prog * (1 - prog) * arcH;
            const x = base.x + (fx === 'missiles' ? -uy * lift * 0.6 : 0);
            const y = fx === 'shell' ? base.y - lift : base.y + ux * lift * 0.6;
            if (rng.chance(0.7))
              spawn(x, y, 1, ['#ffd23f', '#d8d2c4', '#8a8478'], 4, fx === 'shell' ? 0.8 : 0.6, 2, 0, 0, 1, 1);
            g.fillStyle = '#1b1a17';
            g.fillRect(Math.round(x) - 2, Math.round(y) - 2, fx === 'shell' ? 5 : 4, fx === 'shell' ? 5 : 3);
            g.fillStyle = fx === 'shell' ? '#5b6b4e' : '#e8e2d4';
            g.fillRect(Math.round(x) - 1, Math.round(y) - 1, fx === 'shell' ? 3 : 2, fx === 'shell' ? 3 : 1);
            if (fx === 'shell' && prog > 0.6) {
              // landing marker
              g.fillStyle = Math.floor(t * 6) % 2 === 0 ? 'rgba(228,87,46,0.8)' : 'rgba(228,87,46,0.3)';
              g.fillRect(Math.round(to.x) - 4, Math.round(to.y) + 6, 9, 1);
            }
          }
          break;
        }
        case 'spike': {
          if (age > 1.6) break;
          const reach = Math.min(1, age * 3);
          g.globalAlpha = 1 - age / 1.6;
          line(from.x, from.y, from.x + (to.x - from.x) * reach, from.y + (to.y - from.y) * reach, '#1b1a17', 3);
          line(from.x, from.y, from.x + (to.x - from.x) * reach, from.y + (to.y - from.y) * reach, '#e8e2d4', 1);
          g.globalAlpha = 1;
          break;
        }
        case 'slash': {
          if (age > 1.8) break;
          const fade = 1 - age / 1.8;
          g.globalAlpha = fade;
          const cx = to.x;
          const cy = to.y;
          const r = 10 + age * 3;
          const dir = foe.x > me.x ? 1 : -1;
          for (let k = -6; k <= 6; k++) {
            const yy = cy + k * (r / 6);
            const xx = cx - dir * (r - (k * k * r) / 40);
            g.fillStyle = Math.abs(k) < 3 ? '#ffffff' : '#3cf0ec';
            g.fillRect(Math.round(xx), Math.round(yy), 2, 2);
          }
          g.globalAlpha = 1;
          break;
        }
        case 'flame':
          break; // pure particles
      }
    }

    // muzzle flashes
    for (let i = 0; i < 2; i++) {
      if (t >= muzzle[i]!.until) continue;
      const me = pos[i]!;
      const foe = pos[1 - i]!;
      const m = gun(me, foe, 'weaponR');
      const s = muzzle[i]!.size;
      g.fillStyle = muzzle[i]!.color;
      g.fillRect(Math.round(m.x) - s, Math.round(m.y) - 1, s * 2 + 1, 3);
      g.fillRect(Math.round(m.x) - 1, Math.round(m.y) - s, 3, s * 2 + 1);
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = Math.pow(0.08, dt);
      p.vx *= drag;
      p.vy *= drag;
      const k = 1 - p.life / p.max;
      const ci = Math.min(p.colors.length - 1, Math.floor(k * p.colors.length));
      const size = Math.max(1, Math.round(p.size + (p.grow ?? 0) * k));
      g.fillStyle = p.colors[ci]!;
      g.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
    }

    // damage numbers (show when the hit lands)
    g.font = '8px Silkscreen, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let i = nextEvent - 1; i >= 0; i--) {
      const ev = result.events[i]!;
      if (ev.t < t - 30) break;
      if (!ev.hit || ev.dmg < 20) continue;
      const fx = fxOf(ev);
      const me = pos[ev.by]!;
      const to = pos[1 - ev.by]!;
      const land = ev.t + flightOf(fx, Math.hypot(to.x - me.x, to.y - me.y));
      const a = (t - land) / 8;
      if (a < 0 || a > 1) continue;
      const jx = (((ev.t * 7 + (ev.slot === 'back' ? 3 : ev.slot === 'weaponL' ? 1 : 0)) % 5) - 2) * 8;
      const yy = Math.round(to.y - sh[1 - ev.by]! / 2 - 22 - a * 12);
      const txt = `${ev.dmg}`;
      g.fillStyle = '#1b1a17';
      for (const [ox, oy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
      ] as const)
        g.fillText(txt, Math.round(to.x + jx) + ox, yy + oy);
      g.fillStyle = ev.blocked ? '#3cf0ec' : ev.dmg > 140 ? '#ffc914' : '#ffffff';
      if (a < 0.7 || Math.floor(t * 4) % 2 === 0) g.fillText(txt, Math.round(to.x + jx), yy);
    }

    // special-move banners
    g.font = '8px Silkscreen, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (const sp of result.specials) {
      const age = t - sp.t;
      if (age < 0 || age > 14) continue;
      const p = pos[sp.by]!;
      const label = `${SPECIALS[sp.kind].name.toUpperCase()}!`;
      const yy = Math.round(p.y - sh[sp.by]! / 2 - 34 - Math.min(age, 4));
      const w2 = Math.ceil(g.measureText(label).width) + 6;
      if (age < 10 || Math.floor(t * 4) % 2 === 0) {
        g.fillStyle = '#1b1a17';
        g.fillRect(Math.round(p.x - w2 / 2) - 1, yy - 2, w2 + 2, 12);
        g.fillStyle =
          sp.kind === 'turtle' || sp.kind === 'flank' ? '#3cf0ec' : sp.kind === 'kite' ? '#f4f0e6' : '#ffc914';
        g.fillRect(Math.round(p.x - w2 / 2), yy - 1, w2, 10);
        g.fillStyle = '#1b1a17';
        g.fillText(label, Math.round(p.x), yy);
      }
    }
    for (const ev of result.events) {
      if (!ev.crit) continue;
      const age = t - ev.t;
      if (age < 0 || age > 10) continue;
      const p = pos[1 - ev.by]!;
      g.fillStyle = Math.floor(t * 6) % 2 === 0 ? '#e4572e' : '#ffc914';
      g.fillText('CRIT!', Math.round(p.x), Math.round(p.y - sh[1 - ev.by]! / 2 - 46));
    }

    if (arena.fog) {
      g.fillStyle = 'rgba(230,232,228,0.25)';
      g.fillRect(0, 0, W, H);
      for (let k = 0; k < 6; k++) {
        const fx = ((t * 3 + k * 70) % (W + 80)) - 40;
        g.fillStyle = 'rgba(240,242,238,0.18)';
        g.fillRect(Math.round(fx), Math.round((k * 37) % H), 60, 10);
      }
    }
    if (arena.id === 'heat') {
      g.fillStyle = 'rgba(255,170,90,0.06)';
      g.fillRect(0, Math.round((t * 2) % H), W, 2);
    }
    if (arena.id === 'storm' && Math.floor(t) % 53 < 1 && t > 1) flash = Math.max(flash, 0.06);
    if (flash > 0) {
      g.fillStyle = `rgba(255,255,255,${Math.min(0.7, flash * 4)})`;
      g.fillRect(0, 0, W, H);
      flash -= dt;
    }
    g.restore();

    lastT = t;
    return particles.length > 0 || shake > 0.2 || flash > 0;
  };

  return {
    draw,
    takeFreeze: () => {
      const f = freeze;
      freeze = 0;
      return f;
    },
  };
};
