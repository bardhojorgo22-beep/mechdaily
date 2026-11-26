// Pixel-art renderer for a battle replay. Everything is drawn at a low
// internal resolution and scaled up with nearest-neighbour by CSS.
import type { Arena } from '../../shared/game/arenas';
import {
  FRAME_EVERY,
  LAST_STAND_INVULN,
  REDSHIFT_CRASH,
  SPECIALS,
  type BattleResult,
  type ShotEvent,
} from '../../shared/game/battle';
import { computeStats, type Build } from '../../shared/game/mech';
import { getPart } from '../../shared/game/parts';
import type { MechLayer } from '../components/mechLayers';
import { createRng } from '../../shared/game/rng';
import { sfx } from './sfx';
import type { Highlight } from './highlights';

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
  | 'pistol'
  | 'arrow'
  | 'ram'
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
  | 'thrust'
  | 'punch'
  | 'slash';

const FX_BY_PART: Record<string, Fx> = {
  'r-rifle': 'tracer',
  'lw-pistol': 'pistol',
  'r-bow': 'arrow',
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
  'r-lance': 'thrust',
  'lw-knuckle': 'punch',
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
    case 'pistol':
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
    case 'arrow':
      return Math.max(1.5, dist / 55);
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

export type MechSprites = {
  normal: HTMLCanvasElement;
  white: HTMLCanvasElement;
  layers: Partial<Record<MechLayer, HTMLCanvasElement>>;
};

type Piece = {
  img: HTMLCanvasElement;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  flip: boolean;
  life: number;
};

export type Renderer = {
  draw: (t: number, dt: number) => boolean;
  /** Seconds of hit-stop requested by big impacts; the caller pauses sim time. */
  takeFreeze: () => number;
  /** Slow-motion factor requested by highlight moments (1 = normal). */
  timeScale: () => number;
};

export const createRenderer = (
  canvas: HTMLCanvasElement,
  result: BattleResult,
  builds: [Build, Build],
  arena: Arena,
  sprites: { current: MechSprites[] },
  getTags: () => [string, string],
  getSpeed: () => number,
  bossSide: 0 | 1 | null = null,
  highlights: Highlight[] = [],
  onHighlight: (h: Highlight) => void = () => undefined
): Renderer | null => {
  const sw = [0, 1].map((i) => (i === bossSide ? BOSS_SPRITE_W : SPRITE_W));
  const sh = sw.map((w) => Math.round((w * 220) / 200));
  const W = RES_W;
  const H = Math.round((RES_W * arena.height) / arena.width);
  canvas.width = W;
  canvas.height = H;
  const out = canvas.getContext('2d');
  if (!out) return null;
  out.imageSmoothingEnabled = false;
  // Everything is drawn to an offscreen scene, then blitted through a camera
  // that can zoom in on big moments.
  const scene = document.createElement('canvas');
  scene.width = W;
  scene.height = H;
  const g = scene.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  const cam = { zoom: 1, x: W / 2, y: H / 2, target: 1, until: 0, focus: 0 as 0 | 1 };
  let slowUntil = 0; // performance.now() ms
  let slowFactor = 1;
  let nextHighlight = 0;
  let ring = 0; // colored screen-edge pulse
  let ringColor = '#ffc914';
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
  // animation state
  const slotKick: Record<ShotEvent['slot'], number>[] = [
    { weaponR: 0, weaponL: 0, back: 0 },
    { weaponR: 0, weaponL: 0, back: 0 },
  ];
  const lastShot = [-99, -99];
  const flinch = [
    { until: 0, dir: 0 },
    { until: 0, dir: 0 },
  ];
  const pieces: Piece[] = [];
  const dazedUntil = [0, 0];
  // melee strikes per mech, for the charge-up telegraph
  const meleeTimes: number[][] = [[], []];
  for (const ev of result.events) if (ev.type === 'melee' && !ev.ram) meleeTimes[ev.by]!.push(ev.t);
  const meleeSlotAt: Record<string, ShotEvent['slot']> = {};
  for (const ev of result.events) if (ev.type === 'melee') meleeSlotAt[`${ev.by}:${ev.t}`] = ev.slot;
  const chargeSounded = new Set<string>();
  // each melee weapon has its own rhythm: jabs snap, pile bunkers wind up long and slam
  const MELEE_STYLE: Record<string, { windup: number; back: number; out: number; hold: number }> = {
    punch: { windup: 2, back: 3, out: 11, hold: 0.7 },
    slash: { windup: 4, back: 5, out: 8, hold: 1.2 },
    thrust: { windup: 5, back: 6, out: 14, hold: 1.8 },
    spike: { windup: 9, back: 7, out: 12, hold: 2.4 },
  };
  // rail shots telegraph with a charge glow; drones orbit their owner all fight
  const railTimes: number[][] = [[], []];
  const bowTimes: number[][] = [[], []];
  const bowSounded = new Set<string>();
  const stuck: { by: number; dx: number; dy: number; until: number; dir: number }[][] = [[], []]; // arrows stuck in a mech
  const isVelocity = builds.map((b) => b.parts.chip === 'p-velocity');
  const firstFire = new Map<string, number>(); // `${side}:${slot}` -> tick it first fired
  for (const ev of result.events) {
    const pid = builds[ev.by].parts[ev.slot];
    if (pid === 'r-rail' && !ev.ram) railTimes[ev.by]!.push(ev.t);
    if (pid === 'r-bow' && !ev.ram) bowTimes[ev.by]!.push(ev.t);
    const k = `${ev.by}:${ev.slot}`;
    if (!firstFire.has(k)) firstFire.set(k, ev.t);
  }
  const railSounded = new Set<string>();
  const hasDrone = builds.map((b) => b.parts.back === 'bk-orbit');
  const dronePos = (i: number, p: { x: number; y: number }, t: number) => {
    const a = t * 0.35 + i * 3;
    return { x: p.x + Math.cos(a) * 14, y: p.y - SPRITE_H * 0.55 + Math.sin(a) * 4 };
  };
  const burnUntil = [0, 0];
  const zaps: { x0: number; y0: number; x1: number; y1: number; until: number }[] = [];
  const ringFx: { x: number; y: number; t: number }[] = [];
  const lastPunch = [-99, -99];
  const bursts: { x: number; y: number; t: number; word: string; big: boolean }[] = [];
  const brokenUp = [false, false];
  const vel = [
    { x: 0, y: 0, ratio: 0 },
    { x: 0, y: 0, ratio: 0 },
  ];
  const qbUntil = [0, 0];
  const topSpeed = builds.map((b) => Math.max(40, computeStats(b, arena).speed));
  const trail: { x: number; y: number }[][] = [[], []];
  // Redshift: rainbow light-trail afterimages + world slow-mo
  const RS_COLORS = ['#ff2e63', '#ffd23f', '#3cf0ec', '#9b5cff'];
  const tintCache = new Map<string, HTMLCanvasElement>();
  const tinted = (src: HTMLCanvasElement, color: string, key: string) => {
    const k = `${key}:${color}`;
    let c = tintCache.get(k);
    if (!c) {
      c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      const cg = c.getContext('2d')!;
      cg.drawImage(src, 0, 0);
      cg.globalCompositeOperation = 'source-in';
      cg.fillStyle = color;
      cg.fillRect(0, 0, c.width, c.height);
      tintCache.set(k, c);
    }
    return c;
  };
  const rsTrail: { x: number; y: number }[][] = [[], []];
  let redshiftUntilT = -1;
  let curT = 0;
  const crashed = new Set<number>();
  const lsSeen = new Set<number>();
  const magnetOf = builds.map((b) => b.parts.back === 'bk-magnet');
  let lastT = 0;
  const legTypes = builds.map((b) => {
    const p = getPart(b.parts.legs);
    return p.slot === 'legs' ? p.legType : 'biped';
  });

  const fxOf = (ev: ShotEvent): Fx =>
    ev.ram ? 'ram' : (FX_BY_PART[builds[ev.by].parts[ev.slot]] ?? FALLBACK[ev.type]);
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
    curT = t;
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

    // ── highlight moments: callouts, zoom, slow-mo, crowd ──
    while (nextHighlight < highlights.length && highlights[nextHighlight]!.t <= t) {
      const h = highlights[nextHighlight++]!;
      if (t - h.t > 15 && h.tier < 3) continue;
      const mine = getTags()[h.by] === 'YOU';
      onHighlight(h);
      if (h.tier >= 2) {
        cam.target = h.tier === 3 ? 2 : 1.6;
        cam.focus = h.focus;
        cam.until = t + (h.tier === 3 ? 40 : 9);
        slowFactor = h.tier === 3 ? 0.3 : 0.35;
        slowUntil = performance.now() + (h.tier === 3 ? 1400 : 850);
      }
      ring = h.tier === 1 ? 0.35 : 0.8;
      ringColor = mine
        ? '#ffc914'
        : getTags()[h.by] === 'BOSS' || getTags()[1 - h.by] === 'YOU'
          ? '#e4572e'
          : '#f8f4ec';
      if (!quiet || h.tier === 3) sfx.hype(h.tier, mine || getTags()[0] !== 'YOU');
    }

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
        vel[i] = { x: vx * 10, y: vy * 10, ratio: v / topSpeed[i]! };
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
      if (sp.kind === 'redshift') {
        redshiftUntilT = sp.until;
        sfx.redshift();
        spawn(p.x, p.y, 40, RS_COLORS, 70, 0.6, 2);
        shake = Math.max(shake, 4);
      }
      shake = Math.max(shake, 2);
    }
    // Last Stand: armor blows off, time nearly stops
    for (const ls of result.lastStands) {
      const key = ls.t * 2 + ls.by;
      if (lsSeen.has(key) || t < ls.t) continue;
      lsSeen.add(key);
      if (t - ls.t > 5) continue;
      const p = pos[ls.by]!;
      sfx.lastStand();
      flash = Math.max(flash, 0.35);
      shake = Math.max(shake, 7);
      slowFactor = 0.22;
      slowUntil = performance.now() + 1400;
      // armor plates flying off
      spawn(p.x, p.y, 22, ['#c9c4b8', '#8a8578', '#f4f0e6', '#1b1a17'], 130, 1.3, 4, 0, -0.3, 1);
      spawn(p.x, p.y, 30, ['#ffffff', '#ffd23f', '#ff6b4a'], 90, 0.5, 2);
      bursts.push({ x: p.x, y: p.y - 6, t, word: 'PURGE!', big: true });
    }
    // Redshift crash: the overclock comes due
    for (const sp of result.specials) {
      if (sp.kind !== 'redshift' || crashed.has(sp.t) || t < sp.until) continue;
      crashed.add(sp.t);
      if (t - sp.until > 5) continue;
      const p = pos[sp.by]!;
      sfx.crash();
      bursts.push({ x: p.x, y: p.y - 6, t, word: 'CRASH!', big: true });
      spawn(p.x, p.y, 26, ['#f4f0e6', '#c9c4b8', '#ff6b4a'], 30, 1.4, 3, 0, -1, 0.6, 2);
      shake = Math.max(shake, 3);
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
      if (!quiet || ev.dmg > 140) sfx.weapon(fx, ev.by);
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
      slotKick[ev.by]![ev.slot] = t + (kick > 2 ? 1.6 : 0.9);
      lastShot[ev.by] = t;
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
      if (fx === 'missiles') spawn(m.x, m.y - 4, 6, ['#ffd23f', '#ff7a2f'], 30, 0.3, 1, 0, -1, 0.4); // launch flare upward
      if (fx === 'rail') shake = Math.max(shake, 2);
      if (fx === 'pellets') {
        // shotgun: a fat cone of muzzle fire and a shove back
        const dx = foe.x - m.x;
        const d = Math.abs(dx) || 1;
        spawn(m.x, m.y, 10, ['#ffffff', '#fff3b0', '#ffd23f', '#ff7a2f'], 70, 0.18, 2, dx / d, 0, 0.45);
        spawn(me.x, me.y + 10, 4, [theme.speck, theme.dark], 20, 0.4, 2, -dx / d, -0.2, 0.5);
        shake = Math.max(shake, 2);
      }
      if (fx === 'spike') {
        // pile bunker blows its steam after slamming
        spawn(
          me.x - (foe.x > me.x ? 8 : -8),
          me.y - 4,
          10,
          ['#ffffff', '#e8e2d4', '#c9c4b8'],
          22,
          0.9,
          2,
          foe.x > me.x ? -0.8 : 0.8,
          -0.6,
          0.5,
          2
        );
      }
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
      if (ev.syn === 'guardian') {
        // the guardian drone zaps the shot out of the air
        const dp = dronePos(victim, foe, t);
        const mid = { x: (me.x + foe.x) / 2 + (foe.x - me.x) * 0.3, y: (me.y + foe.y) / 2 };
        zaps.push({ x0: dp.x, y0: dp.y, x1: mid.x, y1: mid.y, until: t + 3 });
        spawn(mid.x, mid.y, 10, ['#ffffff', '#3cf0ec', '#bffcfb'], 40, 0.3, 1);
        continue;
      }
      if (ev.syn && ev.hit) {
        // synergy hits get a gold flourish
        spawn(at.x, at.y, 14, ['#ffffff', '#ffd23f', '#ffc914'], 55, 0.45, 1);
        ringFx.push({ x: at.x, y: at.y, t });
      }
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
      flinch[victim] = { until: t + (big ? 1.4 : 0.8), dir: foe.x >= me.x ? 1 : -1 };
      if (ev.stagger) dazedUntil[victim] = t + 7;
      if (!quiet)
        freeze = Math.max(freeze, ev.type === 'melee' ? (big ? 0.16 : 0.1) : ev.dmg > 300 ? 0.13 : big ? 0.07 : 0);
      if (ev.type === 'melee') {
        const words: Record<string, string[]> = {
          ram: ['CRASH!', 'WHAM!', 'IMPACT!'],
          spike: ['CRACK!', 'KA-CHUNK!'],
          thrust: ['SKEWER!', 'IMPALE!'],
          punch: big ? ['POW!', 'HAYMAKER!'] : ['JAB!', 'JAB!'],
          slash: ['SLASH!', 'SHING!'],
        };
        const opts = words[fx] ?? ['POW!'];
        let word = opts[(i + ev.t) % opts.length]!;
        if (fx === 'punch' && !big && ev.t - lastPunch[ev.by]! < 25) word = '1-2!';
        if (fx === 'punch') lastPunch[ev.by] = ev.t;
        bursts.push({ x: at.x, y: at.y - 6, t, word, big: big || fx === 'spike' || fx === 'ram' });
        sfx.pow(big);
        shake = Math.max(shake, big ? 6 : 3);
      }
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
          burnUntil[victim] = t + 15; // set on fire
          break;
        case 'pellets':
          // shotgun pellets pepper the whole body
          for (let k = 0; k < 5; k++)
            spawn(
              at.x + (rng.next() - 0.5) * 18,
              at.y + (rng.next() - 0.5) * 18,
              2,
              ['#ffffff', '#ffd23f'],
              20,
              0.25,
              1
            );
          break;
        case 'arrow': {
          // the arrow punches through and stays stuck in the armor
          spawn(at.x, at.y, 6, ['#ffffff', '#e8e2d4', '#c9c4b8'], 30, 0.25, 1, foe.x > me.x ? 0.6 : -0.6, 0, 0.5);
          const list = stuck[victim]!;
          list.push({
            by: ev.by,
            dx: (rng.next() - 0.5) * 12,
            dy: (rng.next() - 0.6) * 14,
            until: t + 40,
            dir: foe.x > me.x ? 1 : -1,
          });
          if (list.length > 6) list.shift();
          bursts.push({ x: at.x, y: at.y - 6, t, word: 'PIERCE!', big: false });
          break;
        }
        case 'ram':
          spawn(at.x, at.y, 30, ['#ffffff', '#fff3b0', '#ffd23f', '#ff7a2f'], 80, 0.5, 2);
          spawn(at.x, at.y + 8, 12, [theme.speck, theme.dark], 40, 0.8, 3, 0, -0.3, 1, 1);
          shake = 8;
          flash = Math.max(flash, 0.15);
          break;
        case 'punch':
          spawn(
            at.x,
            at.y,
            big ? 12 : 6,
            ['#ffffff', '#ffd23f'],
            big ? 45 : 30,
            0.25,
            2,
            foe.x > me.x ? 0.8 : -0.8,
            0,
            0.5
          );
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
        const li: 0 | 1 = result.winner === 0 ? 1 : 0;
        const lsp = sprites.current[li];
        if (lsp) {
          brokenUp[li] = true;
          const names: MechLayer[] = ['back', 'legs', 'armR', 'armL', 'body'];
          const away = loser.x >= pos[result.winner]!.x ? 1 : -1;
          names.forEach((name, k) => {
            const img = lsp.layers[name];
            if (!img) return;
            pieces.push({
              img,
              x: loser.x,
              y: loser.y + (name === 'legs' ? 4 : 0),
              z: 0,
              vx: (rng.next() - 0.5) * 70 + away * (name === 'legs' ? 5 : 35),
              vy: (rng.next() - 0.5) * 40,
              vz: name === 'legs' ? 20 : 70 + rng.next() * 90 + k * 10,
              flip: facing[li] === -1,
              life: 6,
            });
          });
        }
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
      if ((act && (act.kind === 'rush' || act.kind === 'flank' || act.kind === 'velocity')) || t < qbUntil[i]!) {
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
      // Redshift: long rainbow smear of past positions
      if (act && act.kind === 'redshift') {
        const tr = rsTrail[i]!;
        tr.unshift({ x, y: y + bobY });
        if (tr.length > 20) tr.pop();
        if (sp) {
          for (let k = tr.length - 1; k >= 1; k--) {
            if (k % 4 !== 0) continue;
            const pt = tr[k]!;
            g.save();
            g.globalAlpha = 0.7 - k * 0.03;
            g.translate(pt.x, pt.y);
            if (facing[i] === -1) g.scale(-1, 1);
            g.drawImage(tinted(sp.white, RS_COLORS[(k / 4 + Math.floor(t * 2)) % 4]!, `rs${i}`), -SW / 2, -SH / 2);
            g.restore();
          }
        }
        if (rng.chance(0.5)) spawn(x, y, 1, RS_COLORS, 6, 0.5, 1);
      } else rsTrail[i] = [];
      // Redshift crash: steaming, sparking, frozen
      const crash = result.specials.find(
        (s2) => s2.by === i && s2.kind === 'redshift' && t >= s2.until && t < s2.until + REDSHIFT_CRASH
      );
      if (crash && rng.chance(0.6)) {
        spawn(x + (rng.next() - 0.5) * SW * 0.6, y - SH * 0.2, 1, ['#f4f0e6', '#c9c4b8'], 10, 0.8, 2, 0, -1, 0.4, 1);
        if (rng.chance(0.3)) spawn(x, y, 2, ['#ffd23f', '#ffffff'], 30, 0.2, 1);
      }
      if (act && act.kind === 'berserk' && Math.floor(t * 3) % 2 === 0) {
        g.fillStyle = 'rgba(228,87,46,0.35)';
        g.fillRect(x - SW / 2 - 2, y - SH / 2 - 2, SW + 4, SH + 4);
      }
      if (!brokenUp[i]) {
        g.save();
        const rc = recoil[i]!;
        const kickBack = t < rc.until ? Math.round(rc.px * ((rc.until - t) / (rc.px > 2 ? 1.5 : 0.7))) : 0;
        const fl = flinch[i]!;
        const flinchPx = t < fl.until ? Math.round(5 * ((fl.until - t) / 1.4) + 0.5) * fl.dir : 0;
        g.translate(x - facing[i]! * kickBack + flinchPx, y + bobY);
        if (facing[i] === -1) g.scale(-1, 1);
        if (t < qbUntil[i]! && qbUntil[i]! - t > 2) g.scale(1.18, 0.88); // squash-and-stretch on the dash
        if (m.hp <= 0) g.globalAlpha = 0.35;
        const lsNow = result.lastStands.find((l) => l.by === i && t >= l.t);
        const flashing =
          (t < flashUntil[i]! && Math.floor(t * 4) % 2 === 0) ||
          (!!lsNow && t < lsNow.t + LAST_STAND_INVULN && Math.floor(t * 5) % 2 === 0);
        if (!sp) {
          g.fillStyle = '#888';
          g.fillRect(-8, -12, 16, 24);
        } else if (flashing || !sp.layers.body) {
          g.drawImage(flashing ? sp.white : sp.normal, -SW / 2, -SH / 2);
        } else {
          // ── layered, animated mech (local +x = toward the enemy) ──
          const L = sp.layers;
          const ox = -SW / 2;
          const oy = -SH / 2;
          const v = vel[i]!;
          const fwd = (v.x * facing[i]!) / Math.max(1, topSpeed[i]!);
          const lean = m.moving ? Math.max(-2, Math.min(5, Math.round(fwd * (v.ratio > 1.3 ? 5 : 3)))) : 0;
          const step = Math.floor(walked[i]! / 6) % 2;
          const walking = m.moving && (leg === 'biped' || leg === 'reverse' || leg === 'quad');
          const torsoBob = walking && step === 1 ? -2 : 0;
          const aiming = t - lastShot[i]! < 14 ? -3 : 0;
          const kickOf = (slot: ShotEvent['slot']) => {
            const k = slotKick[i]![slot] - t;
            return k > 0 ? Math.ceil(Math.min(6, k * 4)) : 0;
          };
          // melee charge-up (pull back) and strike (thrust forward)
          let windR = 0;
          let windL = 0;
          let crouch = 0;
          const next = meleeTimes[i]!.find((mt) => mt > t - 2.5);
          if (next !== undefined) {
            const slot = meleeSlotAt[`${i}:${next}`];
            const mfx = FX_BY_PART[builds[i]!.parts[slot ?? 'weaponR']] ?? 'slash';
            const st = MELEE_STYLE[mfx] ?? MELEE_STYLE.slash!;
            const until = next - t;
            let off = 0;
            if (until > 0 && until <= st.windup) {
              const k = 1 - until / st.windup;
              off = -Math.round(k * st.back); // pull back
              crouch = Math.round(k * (mfx === 'spike' ? 3 : mfx === 'punch' ? 1 : 2));
              const key = `${i}:${next}`;
              if (!chargeSounded.has(key) && !quiet && mfx !== 'punch') {
                chargeSounded.add(key);
                if (mfx === 'spike') sfx.pileCharge();
                else sfx.charge();
              }
              // pile bunker: red-hot glow and venting steam while it locks
              if (mfx === 'spike' && rng.chance(0.7))
                spawn(
                  x - facing[i]! * SW * 0.2,
                  y - SH * 0.1,
                  1,
                  ['#ffffff', '#e8e2d4'],
                  14,
                  0.5,
                  1,
                  -facing[i]! * 0.6,
                  -0.8,
                  0.4,
                  1
                );
              // energy gathering at the fist
              if (mfx !== 'punch' && rng.chance(0.6)) {
                const fx2 = x + facing[i]! * (SW * 0.35);
                const fy2 = y + SH * 0.12;
                const a = rng.next() * 6.283;
                particles.push({
                  x: fx2 + Math.cos(a) * 10,
                  y: fy2 + Math.sin(a) * 10,
                  vx: -Math.cos(a) * 40,
                  vy: -Math.sin(a) * 40,
                  life: 0.25,
                  max: 0.25,
                  colors: ['#ffffff', '#ffd23f'],
                  size: 1,
                });
              }
            } else if (until <= 0 && until > -st.hold) {
              off = Math.round(st.out * (1 + until / st.hold)); // strike out, then recover
            }
            if (slot === 'weaponL') windL = off;
            else windR = off;
          }
          const backK = kickOf('back');
          const rK = kickOf('weaponR');
          const lK = kickOf('weaponL');
          if (L.back) g.drawImage(L.back, ox + lean - backK, oy + torsoBob + Math.min(3, backK));
          if (L.legs) {
            if (walking) {
              // left and right halves step out of phase
              const half = Math.floor(L.legs.width / 2);
              const lh = L.legs.height;
              g.drawImage(L.legs, 0, 0, half, lh, ox - (step === 0 ? 1 : 0), oy + (step === 0 ? -2 : 0), half, lh);
              g.drawImage(
                L.legs,
                half,
                0,
                L.legs.width - half,
                lh,
                ox + half + (step === 1 ? 1 : 0),
                oy + (step === 1 ? -2 : 0),
                L.legs.width - half,
                lh
              );
            } else if (leg === 'tank' && m.moving) {
              g.drawImage(L.legs, ox + (Math.floor(walked[i]! / 3) % 2), oy);
            } else g.drawImage(L.legs, ox, oy);
          }
          if (L.armL) g.drawImage(L.armL, ox + lean - lK + windL, oy + torsoBob + aiming + crouch);
          if (L.armR) g.drawImage(L.armR, ox + lean - rK + windR, oy + torsoBob + aiming + crouch);
          if (L.body)
            g.drawImage(
              L.body,
              ox + lean + Math.sign(windR + windL) * Math.min(2, Math.abs(windR + windL) / 3),
              oy + torsoBob + crouch
            );
        }
        g.restore();
      }

      if (m.hp > 0) {
        // rail gun charging: a growing cyan glow at the barrel right before it fires
        const rail = railTimes[i]!.find((rt) => rt > t && rt - t <= 6);
        if (rail !== undefined) {
          const gp = gun({ x, y }, pos[1 - i]!, 'weaponR');
          const k = 1 - (rail - t) / 6;
          const r = 1 + Math.round(k * 4);
          g.fillStyle = '#127475';
          g.fillRect(Math.round(gp.x) - r - 1, Math.round(gp.y) - r - 1, r * 2 + 3, r * 2 + 3);
          g.fillStyle = Math.floor(t * 8) % 2 === 0 ? '#3cf0ec' : '#ffffff';
          g.fillRect(Math.round(gp.x) - r, Math.round(gp.y) - r, r * 2 + 1, r * 2 + 1);
          if (rng.chance(0.7)) {
            const a = rng.next() * 6.283;
            particles.push({
              x: gp.x + Math.cos(a) * 14,
              y: gp.y + Math.sin(a) * 14,
              vx: -Math.cos(a) * 60,
              vy: -Math.sin(a) * 60,
              life: 0.22,
              max: 0.22,
              colors: ['#ffffff', '#3cf0ec'],
              size: 1,
            });
          }
          const key = `${i}:${rail}`;
          if (!railSounded.has(key) && !quiet) {
            railSounded.add(key);
            sfx.railCharge();
          }
        }
        // gearbow: string draws back before the shot
        const bow = bowTimes[i]!.find((bt) => bt > t && bt - t <= 7);
        if (bow !== undefined) {
          const gp = gun({ x, y }, pos[1 - i]!, 'weaponR');
          const k = 1 - (bow - t) / 7;
          const pull = Math.round(2 + k * 6);
          const bx = Math.round(gp.x - facing[i]! * pull);
          line(gp.x, gp.y - 7, bx, gp.y, '#f8f4ec');
          line(gp.x, gp.y + 7, bx, gp.y, '#f8f4ec');
          g.fillStyle = '#5b4636';
          g.fillRect(Math.min(bx, bx + facing[i]! * 10), Math.round(gp.y), 10, 1);
          const key = `${i}:${bow}`;
          if (!bowSounded.has(key) && !quiet) {
            bowSounded.add(key);
            sfx.bowDraw();
          }
        }
        // arrows stuck in this mech
        for (const a of stuck[i]!) {
          if (t > a.until) continue;
          const sx = Math.round(x + a.dx);
          const sy = Math.round(y + a.dy);
          line(sx, sy, sx - a.dir * 7, sy - 2, '#5b4636');
          g.fillStyle = '#e4572e';
          g.fillRect(sx - a.dir * 7, sy - 3, 2, 2);
        }
        // velocity: speed streaks as momentum builds
        if (isVelocity[i] && vel[i]!.ratio > 0.85 && rng.chance(0.6)) {
          const v = vel[i]!;
          const mag = Math.hypot(v.x, v.y) || 1;
          spawn(
            x - (v.x / mag) * SW * 0.5,
            y + (rng.next() - 0.5) * SH * 0.6,
            1,
            ['#ffffff', '#ffd23f'],
            30,
            0.25,
            1,
            -v.x / mag,
            -v.y / mag,
            0.1
          );
        }
        // orbit drone: always circling its owner
        if (hasDrone[i]) {
          const dp = dronePos(i, pos[i]!, t);
          g.fillStyle = '#1b1a17';
          g.fillRect(Math.round(dp.x) - 2, Math.round(dp.y) - 2, 5, 4);
          g.fillStyle = Math.floor(t * 3) % 2 === 0 ? '#3cf0ec' : '#bffcfb';
          g.fillRect(Math.round(dp.x) - 1, Math.round(dp.y) - 1, 3, 2);
        }
        // set on fire by a flamer
        if (t < burnUntil[i]! && rng.chance(0.6))
          spawn(
            x + (rng.next() - 0.5) * SW * 0.6,
            y + (rng.next() - 0.2) * SH * 0.5,
            1,
            ['#ffd23f', '#ff7a2f', '#c0392b'],
            12,
            0.4,
            2,
            0,
            -1,
            0.3,
            1
          );
        // the first time each weapon fires, name it so you learn what it looks like
        let row = 0;
        for (const slot of ['weaponR', 'weaponL', 'back'] as const) {
          const f = firstFire.get(`${i}:${slot}`);
          if (f === undefined || t < f || t > f + 14) continue;
          const name = getPart(builds[i]!.parts[slot]).name.toUpperCase();
          g.font = '8px Silkscreen, monospace';
          g.textAlign = 'center';
          g.textBaseline = 'top';
          const w2 = Math.ceil(g.measureText(name).width) + 4;
          const ty = Math.round(y + SH / 2 + 3 + row * 11);
          g.fillStyle = '#1b1a17';
          g.fillRect(Math.round(x - w2 / 2), ty - 1, w2, 10);
          g.fillStyle = '#f8f4ec';
          g.fillText(name, Math.round(x), ty);
          row++;
        }
      }
      // Last Stand: golden invulnerability ring, then a stripped, sparking frame at 1 HP
      const ls = result.lastStands.find((l) => l.by === i && t >= l.t);
      if (ls && m.hp > 0) {
        if (t < ls.t + LAST_STAND_INVULN) {
          g.strokeStyle = Math.floor(t * 6) % 2 === 0 ? '#ffd23f' : '#ffffff';
          g.lineWidth = 1;
          g.beginPath();
          g.arc(Math.round(x), Math.round(y), SW * 0.75 + Math.sin(t * 3) * 2, 0, Math.PI * 2);
          g.stroke();
        } else {
          if (Math.floor(t * 3) % 2 === 0) {
            g.strokeStyle = '#ff2e2e';
            g.lineWidth = 1;
            g.strokeRect(x - SW / 2 - 2.5, y - SH / 2 - 2.5, SW + 5, SH + 5);
          }
          if (rng.chance(0.35))
            spawn(
              x + (rng.next() - 0.5) * SW * 0.7,
              y + (rng.next() - 0.5) * SH * 0.6,
              2,
              ['#ffd23f', '#ffffff'],
              35,
              0.2,
              1
            );
        }
        if (Math.floor(t * 4) % 2 === 0) {
          g.font = '8px Silkscreen, monospace';
          g.textAlign = 'center';
          g.textBaseline = 'top';
          const ty = Math.round(y + SH / 2 + 2);
          g.fillStyle = '#1b1a17';
          g.fillRect(Math.round(x) - 13, ty - 1, 26, 10);
          g.fillStyle = '#ff2e2e';
          g.fillText('1 HP', Math.round(x), ty);
        }
      }
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
      if (t < dazedUntil[i]!) {
        // little stars circling the head
        for (let k = 0; k < 3; k++) {
          const a = t * 1.3 + (k * 6.283) / 3;
          const sx = Math.round(x + Math.cos(a) * 9);
          const sy = Math.round(y - SH / 2 - 2 + Math.sin(a) * 3);
          g.fillStyle = k % 2 ? '#ffffff' : '#ffd23f';
          g.fillRect(sx - 1, sy, 3, 1);
          g.fillRect(sx, sy - 1, 1, 3);
        }
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

    // KO wreckage flying apart
    for (let k = pieces.length - 1; k >= 0; k--) {
      const pc = pieces[k]!;
      pc.life -= dt;
      pc.vz -= 300 * dt;
      pc.z += pc.vz * dt;
      if (pc.z < 0) {
        pc.z = 0;
        if (Math.abs(pc.vz) > 30) {
          spawn(pc.x, pc.y + SPRITE_H / 2 - 2, 3, [theme.speck, theme.dark], 14, 0.4, 2);
          shake = Math.max(shake, 1);
        }
        pc.vz = -pc.vz * 0.3;
        pc.vx *= 0.6;
        pc.vy *= 0.6;
      }
      pc.x += pc.vx * dt;
      pc.y += pc.vy * dt;
      if (rng.chance(0.25)) spawn(pc.x, pc.y - pc.z, 1, ['#6e675c', '#3d3a34'], 6, 0.9, 2, 0, -0.4, 0.4, 1.5);
      g.save();
      g.globalAlpha = Math.min(1, pc.life / 1.5) * 0.9;
      g.translate(Math.round(pc.x), Math.round(pc.y - pc.z));
      if (pc.flip) g.scale(-1, 1);
      g.drawImage(pc.img, -pc.img.width / 2, -pc.img.height / 2);
      g.restore();
      if (pc.life <= 0) pieces.splice(k, 1);
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
        case 'arrow': {
          if (age > flight) break;
          const p = at(age / flight);
          line(p.x - ux * 10, p.y - uy * 10, p.x, p.y, '#5b4636');
          g.fillStyle = '#e8e2d4';
          g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2); // steel tip
          // fletching
          g.fillStyle = '#e4572e';
          g.fillRect(Math.round(p.x - ux * 10 - uy * 2), Math.round(p.y - uy * 10 + ux * 2), 2, 1);
          g.fillRect(Math.round(p.x - ux * 10 + uy * 2), Math.round(p.y - uy * 10 - ux * 2), 2, 1);
          break;
        }
        case 'pistol': {
          // double tap: two quick rounds
          for (const lag of [0, 0.6]) {
            const a2 = age - lag;
            if (a2 < 0 || a2 > flight) continue;
            const p = at(a2 / flight);
            line(p.x - ux * 5, p.y - uy * 5, p.x, p.y, '#fff3b0');
            g.fillStyle = '#ffffff';
            g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
          }
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
          const src = fx === 'drone' ? dronePos(ev.by, me, t) : from;
          g.globalAlpha = fade;
          if (fx === 'beam') line(src.x, src.y, to.x, to.y, '#127475', Math.floor(age * 10) % 2 === 0 ? 4 : 3);
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
        case 'thrust': {
          if (age > 2) break;
          const reach = Math.min(1, age * 4);
          g.globalAlpha = 1 - age / 2;
          const ex = from.x + (to.x - from.x) * reach;
          const ey = from.y + (to.y - from.y) * reach;
          line(from.x, from.y, ex, ey, '#1b1a17', 4);
          line(from.x, from.y, ex, ey, '#ffffff', 2);
          // speed lines behind the charge
          for (let k = 1; k <= 3; k++)
            line(
              from.x - ux * (6 + k * 6),
              from.y - uy * (6 + k * 6) + (k - 2) * 4,
              from.x - ux * (14 + k * 6),
              from.y - uy * (14 + k * 6) + (k - 2) * 4,
              '#ffffff',
              1
            );
          g.globalAlpha = 1;
          break;
        }
        case 'punch': {
          if (age > 1.2) break;
          g.globalAlpha = 1 - age / 1.2;
          for (let k = 1; k <= 3; k++)
            line(
              to.x - ux * (8 + k * 5),
              to.y - uy * (8 + k * 5) + (k - 2) * 5,
              to.x - ux * (16 + k * 5),
              to.y - uy * (16 + k * 5) + (k - 2) * 5,
              '#ffffff',
              1
            );
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

    // guardian zaps + synergy rings
    for (let k = zaps.length - 1; k >= 0; k--) {
      const z = zaps[k]!;
      if (t > z.until) {
        zaps.splice(k, 1);
        continue;
      }
      line(z.x0, z.y0, z.x1, z.y1, Math.floor(t * 8) % 2 === 0 ? '#ffffff' : '#3cf0ec');
    }
    for (let k = ringFx.length - 1; k >= 0; k--) {
      const rf = ringFx[k]!;
      const age = t - rf.t;
      if (age > 5) {
        ringFx.splice(k, 1);
        continue;
      }
      g.globalAlpha = 1 - age / 5;
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(Math.round(rf.x), Math.round(rf.y), 4 + age * 4, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }

    // grav anchor: field lines between the magnet and its target
    for (let i = 0; i < 2; i++) {
      if (!magnetOf[i]) continue;
      const a = pos[i]!;
      const b = pos[1 - i]!;
      const ddx = b.x - a.x;
      const ddy = b.y - a.y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d * (1 / sc) < 110 || d * (1 / sc) > 620) continue;
      // pulling or pushing? compare to a moment ago
      const before = frameAt(result, Math.max(0, t - 0.6));
      const d0 = Math.hypot((before[1]!.x - before[0]!.x) * sc, (before[1]!.y - before[0]!.y) * sc);
      const pulling = d <= d0;
      const flow = ((t * 1.6) % 1) * (pulling ? -1 : 1);
      g.globalAlpha = 0.6;
      for (let k = 0; k < 6; k++) {
        let f = (k / 6 + flow + 1) % 1;
        if (f < 0) f += 1;
        const wob = Math.sin(f * Math.PI * 3 + t * 6) * 4 * Math.sin(f * Math.PI);
        const px2 = a.x + ddx * f + (-ddy / d) * wob;
        const py2 = a.y + ddy * f + (ddx / d) * wob;
        g.fillStyle = k % 2 === 0 ? '#3cf0ec' : '#9b5cff';
        g.fillRect(Math.round(px2) - 1, Math.round(py2) - 1, 2, 2);
      }
      g.globalAlpha = 1;
    }

    // comic impact words + shockwave rings for melee hits
    for (let k = bursts.length - 1; k >= 0; k--) {
      const b = bursts[k]!;
      const age = t - b.t;
      if (age > 7 || age < 0) {
        if (age > 7) bursts.splice(k, 1);
        continue;
      }
      const r = Math.round(4 + age * (b.big ? 7 : 5));
      g.globalAlpha = Math.max(0, 1 - age / 4);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(Math.round(b.x), Math.round(b.y + 10), r, Math.round(r * 0.45), 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
      const size = b.big ? 16 : 12;
      const pop = age < 1 ? 1.25 : 1;
      g.font = `${Math.round(size * pop)}px Silkscreen, monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const wy = Math.round(b.y + 4 - Math.min(age, 3) * 2);
      const wx = Math.round(b.x + 26);
      if (age < 5 || Math.floor(t * 4) % 2 === 0) {
        g.fillStyle = '#1b1a17';
        for (const [ox2, oy2] of [
          [2, 2],
          [-1, -1],
          [1, -1],
          [-1, 1],
          [2, 0],
          [0, 2],
        ] as const)
          g.fillText(b.word, wx + ox2, wy + oy2);
        g.fillStyle = b.big ? '#ff6b4a' : '#ffd23f';
        g.fillText(b.word, wx, wy);
      }
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
          sp.kind === 'redshift'
            ? RS_COLORS[Math.floor(t * 3) % 4]!
            : sp.kind === 'turtle' || sp.kind === 'flank'
              ? '#3cf0ec'
              : sp.kind === 'kite'
                ? '#f4f0e6'
                : '#ffc914';
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

    // ── camera ──
    if (t > cam.until) cam.target = 1;
    const f = pos[cam.focus]!;
    const k = Math.min(1, dt * (cam.target > cam.zoom ? 9 : 3));
    cam.zoom += (cam.target - cam.zoom) * k;
    cam.x += ((cam.zoom > 1.02 ? f.x : W / 2) - cam.x) * k;
    cam.y += ((cam.zoom > 1.02 ? f.y - 6 : H / 2) - cam.y) * k;
    const vw = W / cam.zoom;
    const vh = H / cam.zoom;
    const sx = Math.max(0, Math.min(W - vw, cam.x - vw / 2));
    const sy = Math.max(0, Math.min(H - vh, cam.y - vh / 2));
    out.clearRect(0, 0, W, H);
    out.drawImage(scene, sx, sy, vw, vh, 0, 0, W, H);
    if (ring > 0) {
      out.globalAlpha = Math.min(1, ring);
      out.fillStyle = ringColor;
      const b = 3;
      out.fillRect(0, 0, W, b);
      out.fillRect(0, H - b, W, b);
      out.fillRect(0, 0, b, H);
      out.fillRect(W - b, 0, b, H);
      out.globalAlpha = 1;
      ring -= dt * 1.6;
    }

    lastT = t;
    return (
      particles.length > 0 || pieces.length > 0 || shake > 0.2 || flash > 0 || Math.abs(cam.zoom - 1) > 0.01 || ring > 0
    );
  };

  return {
    draw,
    takeFreeze: () => {
      const f = freeze;
      freeze = 0;
      return f;
    },
    timeScale: () => Math.min(performance.now() < slowUntil ? slowFactor : 1, curT < redshiftUntilT ? 0.5 : 1),
  };
};
