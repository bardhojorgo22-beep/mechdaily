import type { Arena } from './arenas';
import { computeStats, type Build, type MechStats, type MountedWeapon, type Tax } from './mech';
import { clamp, createRng } from './rng';

export const TICKS_PER_SECOND = 10;
export const MAX_TICKS = 90 * TICKS_PER_SECOND;
export const FRAME_EVERY = 1;
const DT = 1 / TICKS_PER_SECOND;
/** Global damage knob: tunes how long fights last. */
const DAMAGE_SCALE = 1.7;

export type ShotEvent = {
  t: number; // tick
  by: 0 | 1;
  slot: MountedWeapon['slot'];
  type: MountedWeapon['type'];
  hit: boolean;
  dmg: number;
  blocked: boolean;
  crit?: boolean; // charged sniper shot
  dodged?: boolean; // missed because the target was mid quick-boost
  stagger?: boolean; // a big ranged hit stopped a charging target in its tracks
  ram?: boolean; // Velocity: a full-speed crash, not a weapon
};

/** Once-per-fight pilot chip special moves. */
export const SPECIALS: Record<MechStats['behavior'], { name: string; blurb: string }> = {
  rush: {
    name: 'Overdrive',
    blurb: 'Opens with a 4s burst of extra speed and +20% damage to close the gap.',
  },
  kite: {
    name: 'Smoke Screen',
    blurb: 'When cornered: 4s of smoke, much harder to hit.',
  },
  turtle: {
    name: 'Fortress',
    blurb: 'Below 60% HP: locks down for 5s and takes half damage.',
  },
  sniper: {
    name: 'Charged Shot',
    blurb: 'Once planted: next long-range shot hits for 2.5x (max 35% of their HP) and rarely misses.',
  },
  berserk: {
    name: 'Rage',
    blurb: 'Below 40% HP: 5s of +50% damage and double fire rate.',
  },
  flank: {
    name: 'Afterburner',
    blurb: 'Below 80% HP: 3.6s sprint around the enemy, very hard to hit, +20% damage.',
  },
  velocity: {
    name: 'Terminal Velocity',
    blurb:
      'Momentum builds while you move and drains when you get hit: more speed, dodge and fire rate. At full momentum: a crash ram that staggers, then you start slow again.',
  },
  redshift: {
    name: 'Redshift',
    blurb:
      'Below 75% HP: 3.6s where the pilot moves and shoots twice as fast, leaving light trails. Then the frame crashes: overheats and freezes for a second.',
  },
};

/** Ticks a Redshift crash lasts after the burst ends. */
export const REDSHIFT_CRASH = 6;

/** After this tick, damage keeps rising so stalemates end. */
export const OVERTIME_TICK = 500;

/** Movement bursts, for visuals: quick boost (sideways dash) or overboost (long charge). */
export type MoveEvent = { t: number; by: 0 | 1; kind: 'qb' | 'ob'; dx: number; dy: number };

/** Last Stand: a killing blow instead purges the armor. 1 HP, brief invulnerability, then fast and fragile. */
export const LAST_STAND_INVULN = 15;
/** Odds a killing blow triggers a last stand instead. Rare enough to be a moment. */
export const LAST_STAND_CHANCE = 0.25;
export type LastStandEvent = { t: number; by: 0 | 1 };

export type SpecialEvent = {
  t: number;
  by: 0 | 1;
  kind: MechStats['behavior'];
  until: number;
};

export type BattleResult = {
  winner: 0 | 1;
  reason: 'ko' | 'time';
  ticks: number;
  maxHp: [number, number];
  /** Every FRAME_EVERY ticks: x0,y0,hp0,heat0,energy0,x1,y1,hp1,heat1,energy1 */
  frames: number[];
  events: ShotEvent[];
  damage: [number, number];
  hazardHits: number[]; // ticks where scrap fell
  specials: SpecialEvent[];
  moves: MoveEvent[];
  lastStands: LastStandEvent[];
};

type MechState = {
  s: MechStats;
  x: number;
  y: number;
  hp: number;
  energy: number;
  heat: number;
  overheated: boolean;
  planted: number; // ticks left standing still
  moving: boolean;
  cooldown: number[];
  ammo: (number | null)[];
  strafeSign: number;
  vx: number; // velocity, m/s
  vy: number;
  dealt: number;
  specialUsed: boolean;
  specialUntil: number;
  charged: boolean; // sniper: next long-range shot is charged
  dmgMult: number;
  moveFrac: number; // current speed / top speed, drives evasion
  want: number;
  wantUntil: number;
  qbCd: number; // ticks until next quick boost
  qbUntil: number; // dodge window from a quick boost
  ob: boolean; // overboosting
  obReady: number; // tick when overboost can fire again
  staggerImmune: number; // tick until which this mech can't be staggered again
  threat: number; // tick when a big enemy shot was telegraphed
  lastStand: number; // tick the armor was purged, -1 = not yet
  momentum: number; // Velocity chip, 0..1
  ramUntil: number; // Velocity ram in progress
};

const newState = (s: MechStats, x: number, y: number, seedOffset: number): MechState => ({
  s,
  x,
  y,
  hp: s.hp,
  energy: s.energyCap,
  heat: 0,
  overheated: false,
  planted: 0,
  moving: false,
  // stagger first shots so both mechs don't open on the same frame
  cooldown: s.weapons.map((_, i) => 3 + i * 2 + seedOffset),
  ammo: s.weapons.map((wp) => wp.ammo),
  strafeSign: seedOffset % 2 === 0 ? 1 : -1,
  vx: 0,
  vy: 0,
  dealt: 0,
  specialUsed: false,
  specialUntil: 0,
  charged: false,
  dmgMult: 1,
  moveFrac: 0,
  want: 400,
  wantUntil: 0,
  qbCd: 10 + seedOffset * 5,
  qbUntil: 0,
  ob: false,
  obReady: 30,
  staggerImmune: 0,
  threat: -99,
  lastStand: -1,
  momentum: 0,
  ramUntil: 0,
});

const reach = (m: MechState, wp: MountedWeapon, arena: Arena) =>
  arena.fog ? Math.min(wp.maxRange, Math.max(250, m.s.sensor)) : wp.maxRange;

const usable = (m: MechState, i: number) => {
  const wp = m.s.weapons[i]!;
  const ammo = m.ammo[i];
  return (ammo === null || (ammo !== undefined && ammo > 0)) && (wp.energyCost === 0 || m.s.energyCap >= wp.energyCost);
};

/** The distance this pilot wants to fight at. */
/** Expected damage per second `a` deals to `b` at distance d (rough, for pilot decisions). */
const dpsAt = (a: MechState, b: MechState, d: number, arena: Arena): number => {
  let total = 0;
  a.s.weapons.forEach((wp, i) => {
    if (!usable(a, i)) return;
    if (d < wp.minRange || d > reach(a, wp, arena)) return;
    const perSec = (wp.damage * DAMAGE_SCALE) / (wp.cooldown / TICKS_PER_SECOND);
    const acc = wp.accuracy * a.s.accuracy * (1 - 0.25 * (d / wp.maxRange));
    const ev = b.s.evasion * 0.75 * (0.5 + 0.5 * (d / wp.maxRange)) * (wp.homing ? 0.6 : 1);
    const hit = clamp(acc * (1 - ev), 0.05, 0.97);
    total += perSec * hit * (1 - armorAgainst(b.s, wp.type));
  });
  return total;
};

/**
 * The distance this pilot wants to fight at, against this particular enemy.
 * Every candidate distance is scored by how fast I'd kill them there minus how
 * fast they'd kill me (using current HP, so hurt pilots get careful). The
 * pilot chip is personality: which of the good distances it prefers.
 */
const desiredRange = (m: MechState, foe: MechState, arena: Arena, tick: number, idx: number): number => {
  if (tick < m.wantUntil) return m.want;
  const maxD = Math.min(1500, Math.sqrt(arena.width * arena.width + arena.height * arena.height) * 0.8);
  const myHp = Math.max(1, m.hp);
  const foeHp = Math.max(1, foe.hp);
  // Melee-heavy builds commit: shield up, charge, land the hit.
  const meleeDps = m.s.weapons.reduce(
    (a, wp, i) => (wp.type === 'melee' && usable(m, i) ? a + wp.damage / wp.cooldown : a),
    0
  );
  const allDps = m.s.weapons.reduce((a, wp, i) => (usable(m, i) ? a + wp.damage / wp.cooldown : a), 0);
  if (meleeDps > 0 && meleeDps >= allDps * 0.45) {
    m.want = 50;
    m.wantUntil = tick + 5;
    return 50;
  }
  const cands: { d: number; score: number }[] = [];
  for (let d = 60; d <= maxD; d += 40) {
    const myDps = dpsAt(m, foe, d, arena);
    // Hiding out of range is never a plan: only distances where I can hurt them count.
    if (myDps <= 0) continue;
    const mine = myDps / foeHp;
    const theirs = dpsAt(foe, m, d, arena) / myHp;
    cands.push({ d, score: mine - theirs * 0.9 });
  }
  if (cands.length === 0) {
    // nothing in range anywhere (out of ammo etc.): close in and hope
    m.want = 60;
    m.wantUntil = tick + 5;
    return 60;
  }
  const best = cands.reduce((a, b) => (b.score > a.score ? b : a));
  // "good enough" distances: within reach of the best score
  const slack = Math.abs(best.score) * 0.15 + 0.0005;
  const good = cands.filter((c) => c.score >= best.score - slack);
  let want: number;
  switch (m.s.behavior) {
    case 'rush':
    case 'berserk':
      want = Math.min(...good.map((c) => c.d));
      break;
    case 'kite':
    case 'sniper':
      want = Math.max(...good.map((c) => c.d));
      break;
    default:
      want = best.d;
  }
  // Hybrid blade builds hit-and-run: lunge when the blade is ready, back off while it recharges.
  const melee = m.s.weapons.findIndex((wp, i) => wp.type === 'melee' && usable(m, i));
  if (melee >= 0 && want < 160) {
    const rangedHelp = dpsAt(m, foe, 300, arena);
    const bladeReady = m.cooldown[melee]! <= 4;
    if (!bladeReady && rangedHelp > 0) want = 300;
    else want = 50;
  }
  // a little ebb and flow so fights don't lock into one spot
  const phase = ((tick + idx * 37) % 80) / 40 - 1;
  want *= 1 + 0.08 * (Math.abs(phase) * 2 - 1);
  m.want = want;
  m.wantUntil = tick + 5;
  return want;
};

/** Stacked armor has diminishing returns, so nothing gets close to immune. */
const soften = (a: number) => a * (1 - a * 0.6);

const armorAgainst = (target: MechStats, type: MountedWeapon['type']) => {
  switch (type) {
    case 'kinetic':
      return soften(target.armorK);
    case 'energy':
      return soften(target.armorE);
    case 'explosive':
      return soften((target.armorK + target.armorE) * 0.3);
    case 'melee':
      return soften(target.armorK * 0.5);
  }
};

/** mods: used for raid bosses (hp and damage multipliers). */
/** How much each pilot likes to circle the target (0 = stands, 1 = full orbit). */
const ORBIT: Record<MechStats['behavior'], number> = {
  rush: 0.45,
  kite: 0.75,
  turtle: 0.15,
  sniper: 0.3,
  berserk: 0.35,
  flank: 0.95,
  redshift: 0.7,
  velocity: 0.85,
};

export type Fighter = {
  build: Build;
  tax?: Tax;
  mods?: { hp?: number; damage?: number; /** never fires: a target dummy */ passive?: boolean };
};

export const simulateBattle = (a: Fighter, b: Fighter, arena: Arena, seed: string): BattleResult => {
  const rng = createRng(`battle:${seed}`);
  const W = arena.width;
  const H = arena.height;
  const statsOf = (f: Fighter) => {
    const st = computeStats(f.build, arena, f.tax);
    return f.mods?.hp ? { ...st, hp: Math.round(st.hp * f.mods.hp) } : st;
  };
  const mechs: [MechState, MechState] = [
    newState(statsOf(a), W * 0.12, H * 0.5, 0),
    newState(statsOf(b), W * 0.88, H * 0.5, 1),
  ];
  mechs[0].dmgMult = a.mods?.damage ?? 1;
  mechs[1].dmgMult = b.mods?.damage ?? 1;
  const passive = [!!a.mods?.passive, !!b.mods?.passive];
  const specials: SpecialEvent[] = [];
  const moves: MoveEvent[] = [];
  const lastStands: LastStandEvent[] = [];
  const invuln = (m: MechState) => m.lastStand >= 0 && tick < m.lastStand + LAST_STAND_INVULN;
  const stripped = (m: MechState) => m.lastStand >= 0;
  const active = (m: MechState, kind: MechStats['behavior']) => m.s.behavior === kind && m.specialUntil > tick;
  const frames: number[] = [];
  const events: ShotEvent[] = [];
  const hazardHits: number[] = [];
  const pushFrame = () => {
    for (const m of mechs) {
      frames.push(
        Math.round(m.x),
        Math.round(m.y),
        Math.max(0, Math.round(m.hp)),
        Math.round(m.heat),
        Math.round(m.energy)
      );
    }
  };
  pushFrame();

  let tick = 0;
  for (tick = 1; tick <= MAX_TICKS; tick++) {
    // ── hazards ──
    if (arena.hazard && tick % arena.hazard.every === 0) {
      hazardHits.push(tick);
      for (const m of mechs) {
        if (rng.chance(0.5) && !invuln(m)) m.hp -= arena.hazard.damage * (stripped(m) ? 1 : 1 - m.s.armorK);
      }
    }

    // ── movement ──
    for (let i = 0; i < 2; i++) {
      const me = mechs[i]!;
      const foe = mechs[1 - i]!;
      const dx = foe.x - me.x;
      const dy = foe.y - me.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const want = desiredRange(me, foe, arena, tick, i);
      const band = 30;

      // ── pilot chip special: once per fight ──
      if (!me.specialUsed) {
        let dur = 0;
        const hpPct = me.hp / me.s.hp;
        switch (me.s.behavior) {
          case 'rush':
            if (tick >= 12 && dist > want + band) dur = 40;
            break;
          case 'kite':
            if (dist < want * 0.6) dur = 40;
            break;
          case 'turtle':
            if (hpPct < 0.6) dur = 50;
            break;
          case 'sniper':
            if (tick >= 25 && !me.moving && dist <= want + band) {
              me.charged = true;
              dur = 1;
            }
            break;
          case 'berserk':
            if (hpPct < 0.35) dur = 45;
            break;
          case 'flank':
            if (hpPct < 0.8) dur = 36;
            break;
          case 'redshift':
            if (hpPct < 0.75) dur = 36;
            break;
        }
        if (dur > 0) {
          me.specialUsed = true;
          me.specialUntil = tick + dur;
          specials.push({
            t: tick,
            by: i === 0 ? 0 : 1,
            kind: me.s.behavior,
            until: tick + dur,
          });
        }
      }
      // ── AC-style movement ──
      // Circle-strafe around the target at the preferred range, quick boost
      // sideways to dodge, overboost in a straight line to close big gaps.
      const by: 0 | 1 = i === 0 ? 0 : 1;
      if (me.s.behavior === 'redshift' && me.specialUsed && tick === me.specialUntil) {
        // the crash: everything the overclock borrowed comes due
        me.heat += 80;
        me.energy *= 0.3;
        me.planted = Math.max(me.planted, REDSHIFT_CRASH);
        me.vx *= 0.2;
        me.vy *= 0.2;
      }
      const boostCost = me.s.boostDrain * DT;
      let speed = me.energy >= boostCost ? me.s.speed : me.s.walkSpeed;
      if (active(me, 'rush')) speed = me.s.speed * 1.8;
      if (active(me, 'flank')) speed = me.s.speed * 1.6;
      if (active(me, 'redshift')) speed = me.s.speed * 2;
      if (stripped(me)) speed *= 1.2; // nothing left to carry
      if (me.s.behavior === 'velocity') {
        // momentum: crawl at first, build up while moving, ram at full speed
        if (me.moving && tick >= me.ramUntil) me.momentum = Math.min(1, me.momentum + DT / 6);
        speed *= 0.7 + 0.55 * me.momentum;
        if (me.momentum >= 1 && tick >= me.ramUntil && dist < 750 && dist > 90) {
          me.ramUntil = tick + 14;
          me.momentum = 0;
          specials.push({ t: tick, by: i === 0 ? 0 : 1, kind: 'velocity', until: tick + 14 });
        }
      }
      const ramming = tick < me.ramUntil;
      const turtleLock = active(me, 'turtle');
      const sniperSet = me.s.behavior === 'sniper' && Math.abs(dist - want) < band * 2;

      // overboost: long, fast, straight charge when way out of range
      const holdsGround = me.s.behavior === 'turtle' || me.s.behavior === 'sniper';
      if (!me.ob && !holdsGround && tick >= me.obReady && dist > want * 1.6 + 150 && me.energy > me.s.energyCap * 0.5) {
        me.ob = true;
        moves.push({ t: tick, by, kind: 'ob', dx: ux, dy: uy });
      }
      if (me.ob && (dist < want * 1.15 + 40 || me.energy < me.s.energyCap * 0.12)) {
        me.ob = false;
        me.obReady = tick + 120; // ~12s before the next one
      }

      let tvx = 0;
      let tvy = 0;
      if (me.planted > 0) {
        me.planted--;
      } else if (turtleLock) {
        // dug in
      } else if (ramming) {
        const rs = Math.max(me.s.speed, 90) * 2.4;
        tvx = ux * rs;
        tvy = uy * rs;
      } else if (me.ob) {
        tvx = ux * speed * 1.8;
        tvy = uy * speed * 1.8;
        me.energy -= me.s.boostDrain * 1.8 * DT;
      } else {
        const radial = clamp((dist - want) / 140, -1, 1);
        let orbit = ORBIT[me.s.behavior];
        if (active(me, 'flank')) orbit = 1.2;
        if (active(me, 'redshift')) orbit = 1;
        if (sniperSet) orbit = 0;
        // don't orbit into a wall: look ahead and switch direction
        let tx = -uy * me.strafeSign;
        let ty = ux * me.strafeSign;
        const ax = me.x + tx * 90;
        const ay = me.y + ty * 90;
        if (ax < 30 || ax > W - 30 || ay < 30 || ay > H - 30) {
          me.strafeSign *= -1;
          tx = -tx;
          ty = -ty;
        }
        const nearWall = me.x < 120 || me.x > W - 120 || me.y < 90 || me.y > H - 90;
        if (radial < 0 && nearWall) orbit = Math.max(orbit, 0.95);
        else if (radial < -0.3) orbit = Math.max(orbit, 0.8); // kite in an arc, not a straight line
        // walls push back: the closer the wall, the harder the pilot steers off it
        const WALL = 220;
        let wx = 0;
        let wy = 0;
        if (me.x < WALL) wx += (WALL - me.x) / WALL;
        if (me.x > W - WALL) wx -= (me.x - (W - WALL)) / WALL;
        if (me.y < WALL * 0.75) wy += (WALL * 0.75 - me.y) / (WALL * 0.75);
        if (me.y > H - WALL * 0.75) wy -= (me.y - (H - WALL * 0.75)) / (WALL * 0.75);
        const wallPush = Math.sqrt(wx * wx + wy * wy);
        let rad = radial;
        if (wallPush > 0.05) {
          // circle toward open space, not along the wall into a corner
          const open = tx * (W / 2 - me.x) + ty * (H / 2 - me.y);
          if (open < 0) {
            me.strafeSign *= -1;
            tx = -tx;
            ty = -ty;
          }
          // backing straight into a wall gains nothing: stop retreating that way
          const intoWall = -(ux * wx + uy * wy) / wallPush; // >0 when retreating pushes into the wall
          if (rad < 0 && intoWall > 0) rad *= 1 - Math.min(1, wallPush) * intoWall;
        }
        let mx = ux * rad + tx * orbit + wx * 1.4;
        let my = uy * rad + ty * orbit + wy * 1.4;
        const mag = Math.sqrt(mx * mx + my * my);
        if (mag > 1) {
          mx /= mag;
          my /= mag;
        }
        if (sniperSet && Math.abs(dist - want) < band) {
          mx = 0;
          my = 0;
        }
        tvx = mx * speed;
        tvy = my * speed;
        if (mag > 0.4 && me.energy >= boostCost) me.energy -= boostCost;
      }

      // quick boost: a sudden sideways burst. Fired to dodge a telegraphed
      // big shot, or on a rhythm while circling.
      me.qbCd--;
      const rhythm = Math.round(14 + me.s.weight / 8);
      const dodging = me.threat >= tick - 1;
      const rhythmic = ORBIT[me.s.behavior] >= 0.3 && (tick + i * 9) % rhythm === 0;
      if (
        me.qbCd <= 0 &&
        !turtleLock &&
        me.planted <= 0 &&
        !me.ob &&
        !sniperSet &&
        me.energy >= me.s.qbCost &&
        (dodging || rhythmic)
      ) {
        if (dodging && rng.chance(0.4)) me.strafeSign *= -1;
        let qx = -uy * me.strafeSign;
        let qy = ux * me.strafeSign;
        if ((me.s.behavior === 'rush' || me.s.behavior === 'berserk') && dist > want + band) {
          // aggressive pilots dash in at an angle
          qx = (qx + ux) * 0.7071;
          qy = (qy + uy) * 0.7071;
        }
        me.vx += qx * me.s.qbSpeed;
        me.vy += qy * me.s.qbSpeed;
        me.energy -= me.s.qbCost;
        me.qbCd = me.s.qbCooldown;
        me.qbUntil = tick + 3;
        moves.push({ t: tick, by, kind: 'qb', dx: qx, dy: qy });
      }

      // mass: how quickly velocity bends toward the target velocity
      const timeToTop = 0.15 + me.s.weight / 150;
      const accel = (Math.max(me.s.speed, 60) / timeToTop) * DT;
      let dvx = tvx - me.vx;
      let dvy = tvy - me.vy;
      const dv = Math.sqrt(dvx * dvx + dvy * dvy);
      // bursts (quick boost, knockback) bleed off a bit faster than normal steering
      const cur = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
      const tgt = Math.sqrt(tvx * tvx + tvy * tvy);
      const limit = cur > tgt + 40 ? accel * 1.4 : accel;
      if (dv > limit) {
        dvx = (dvx / dv) * limit;
        dvy = (dvy / dv) * limit;
      }
      me.vx += dvx;
      me.vy += dvy;
      // grav anchor: the enemy's magnet drags this mech in
      let px = 0;
      let py = 0;
      // polarity flips to suit its owner: pull when they want closer, repel when they want space
      const gap = dist - foe.want;
      if (foe.s.pull > 0 && dist > 110 && dist < 620 && Math.abs(gap) > 40 && !active(me, 'redshift')) {
        const drag = (foe.s.pull / (1 + me.s.weight / 120)) * (gap > 0 ? 1 : -0.8);
        px = -ux * drag * DT;
        py = -uy * drag * DT;
      }
      const nx = me.x + me.vx * DT - px;
      const ny = me.y + me.vy * DT - py;
      me.x = clamp(nx, 20, W - 20);
      me.y = clamp(ny, 20, H - 20);
      if (me.x !== nx) me.vx = 0;
      if (me.y !== ny) me.vy = 0;
      // personal space: mechs bump off each other instead of overlapping
      {
        const sx = me.x - foe.x;
        const sy = me.y - foe.y;
        const sd = Math.sqrt(sx * sx + sy * sy) || 1;
        const space = 60;
        if (sd < space) {
          const shove = (space - sd) * 5;
          me.vx += (sx / sd) * shove;
          me.vy += (sy / sd) * shove;
        }
      }
      const sp = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
      me.moving = sp > 8;
      me.moveFrac = clamp(sp / Math.max(1, me.s.speed), 0, 1.5);
    }

    // ── energy + heat ──
    for (const m of mechs) {
      m.energy = clamp(m.energy + m.s.energyRegen * DT, 0, m.s.energyCap);
      m.heat = Math.max(0, m.heat - m.s.cooling * DT);
      if (m.heat >= 100) m.overheated = true;
      else if (m.overheated && m.heat < 40) m.overheated = false;
      if (m.s.behavior === 'berserk' && m.heat > 100 && !stripped(m)) {
        // meltdown: running redline slowly cooks the pilot, but hits harder
        m.heat = Math.min(m.heat, 170);
        m.hp -= m.s.hp * 0.0032;
      }
    }

    // ── firing (resolved simultaneously) ──
    const pending: { target: 0 | 1; dmg: number; kx: number; ky: number; stagger: number }[] = [];
    for (let i = 0; i < 2; i++) {
      if (passive[i]) continue;
      const me = mechs[i]!;
      const foe = mechs[1 - i]!;
      const dx = foe.x - me.x;
      const dy = foe.y - me.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Velocity ram connects: a crash, not a weapon
      if (tick < me.ramUntil && dist < 90) {
        me.ramUntil = tick;
        let dmg = (foe.s.hp * 0.035 + me.s.weight * 4) * me.dmgMult;
        if (invuln(foe)) dmg = 0;
        const d = dist || 1;
        const shove = 220 / (1 + foe.s.weight / 100);
        const stag = active(foe, 'turtle') ? 0 : 7;
        pending.push({ target: i === 0 ? 1 : 0, dmg, kx: (dx / d) * shove, ky: (dy / d) * shove, stagger: stag });
        me.vx *= 0.1;
        me.vy *= 0.1;
        me.dealt += dmg;
        events.push({
          t: tick,
          by: i === 0 ? 0 : 1,
          slot: 'weaponR',
          type: 'melee',
          hit: true,
          dmg: Math.round(dmg),
          blocked: false,
          ram: true,
          ...(stag ? { stagger: true } : {}),
        });
      }
      const longest = me.s.weapons.reduce(
        (best, wp, w) => (wp.maxRange > (me.s.weapons[best]?.maxRange ?? 0) ? w : best),
        0
      );
      me.s.weapons.forEach((wp, w) => {
        me.cooldown[w] =
          me.cooldown[w]! -
          (active(me, 'berserk') && tick % 2 === 0 ? 2 : 1) -
          (active(me, 'redshift') ? 1 : 0) -
          (stripped(me) && tick % 2 === 0 ? 1 : 0) -
          (me.s.behavior === 'velocity' && me.momentum > 0.6 && tick % 3 === 0 ? 1 : 0);
        const big = wp.heavy || wp.type === 'explosive' || wp.damage >= 150 || (me.charged && w === longest);
        if (big && me.cooldown[w]! === 2 && dist <= reach(me, wp, arena) + 50) foe.threat = tick;
        if (me.cooldown[w]! > 0) return;
        const ammo = me.ammo[w];
        if (ammo !== null && ammo !== undefined && ammo <= 0) return;
        if (dist < wp.minRange || dist > reach(me, wp, arena)) return;
        if (me.energy < wp.energyCost) return;
        if (me.overheated && me.s.behavior !== 'berserk' && !active(me, 'berserk')) return;
        const crit = me.charged && w === longest;
        if (crit) me.charged = false;

        me.cooldown[w] = wp.cooldown;
        // melee strikes lunge: the attacker jumps forward into the blow
        const closingSpeed = (me.vx * (foe.x - me.x) + me.vy * (foe.y - me.y)) / Math.max(1, dist);
        if (wp.type === 'melee') {
          me.vx += ((foe.x - me.x) / Math.max(1, dist)) * 160;
          me.vy += ((foe.y - me.y) / Math.max(1, dist)) * 160;
        }
        me.heat += wp.heat * arena.heatGen;
        me.energy -= wp.energyCost;
        if (ammo !== null && ammo !== undefined) me.ammo[w] = ammo - 1;
        if (wp.heavy && me.s.legType !== 'tank') me.planted = Math.max(me.planted, 6);

        let acc = wp.accuracy * me.s.accuracy * (1 - foe.s.jam);
        if (me.s.behavior === 'sniper' && !me.moving) acc *= 1.42;
        if (me.s.behavior === 'turtle') acc *= 1.05;
        if (wp.type === 'explosive') acc *= arena.explosiveAccuracy;
        acc *= 1 - 0.25 * (dist / wp.maxRange);
        let ev = foe.s.evasion * (0.3 + 0.7 * Math.min(1, foe.moveFrac)) * (0.5 + 0.5 * (dist / wp.maxRange));
        if (foe.s.behavior === 'kite' && foe.moving) ev *= 1.1;
        if (foe.s.behavior === 'flank' && foe.moving) ev *= 1.1;
        if (active(foe, 'kite')) {
          ev += 0.3;
          acc *= 0.7;
        }
        if (active(foe, 'flank')) ev += 0.5;
        if (active(foe, 'redshift')) ev += 0.5;
        if (stripped(foe)) ev += 0.1;
        if (foe.s.behavior === 'velocity') ev += 0.08 * foe.momentum;
        if (active(me, 'redshift')) acc *= 1.15;
        if (foe.qbUntil > tick) ev += 0.3;
        if (wp.homing) ev *= 0.6;
        let p = clamp(acc * (1 - ev), 0.05, 0.97);
        if (crit) p = Math.min(0.97, p + 0.35);
        const hit = rng.chance(p);

        let dmg = 0;
        let blocked = false;
        let staggerFlag = false;
        if (hit) {
          dmg = wp.damage * DAMAGE_SCALE * (wp.type === 'energy' ? arena.energyDamage : 1);
          if (foe.s.behavior === 'turtle' && !foe.moving) dmg *= 0.9; // braced
          if (me.s.behavior === 'rush' && dist < 320) dmg *= 1.12; // up close and committed
          dmg *= me.dmgMult;
          if (crit) dmg *= 2.5;
          if (wp.charge) dmg *= 1 + Math.max(0, Math.min(1.2, closingSpeed / Math.max(60, me.s.speed)));
          if (active(me, 'berserk')) dmg *= 1.15;
          if (active(me, 'rush') || active(me, 'flank')) dmg *= 1.2; // hits land harder at full tilt
          if (tick > OVERTIME_TICK) dmg *= 1 + (tick - OVERTIME_TICK) / 150; // sudden death
          if (me.s.behavior === 'berserk' && me.heat > 100) dmg *= 1 + Math.min(0.25, (me.heat - 100) / 200);
          if (active(foe, 'turtle')) dmg *= 0.6;
          if (!stripped(foe) && !wp.pierce) dmg *= 1 - armorAgainst(foe.s, wp.type);
          const sh = foe.s.shield;
          // shields come up more while the holder is charging in
          const closing = (foe.vx * (me.x - foe.x) + foe.vy * (me.y - foe.y)) / Math.max(1, dist) > foe.s.speed * 0.3;
          if (sh && rng.chance(closing ? 0.75 : 0.6)) {
            const canAfford = foe.energy >= sh.energyPerHit;
            if (canAfford) {
              foe.energy -= sh.energyPerHit;
              dmg *= 1 - (wp.type === 'melee' && sh.energyPerHit > 0 ? sh.block * 0.4 : sh.block);
              blocked = true;
            }
          }
          // a charged shot is a big moment, never a one-shot
          if (crit) dmg = Math.min(dmg, foe.s.hp * 0.35);
          // stopping power: a big ranged hit stops a charging mech in its tracks
          const charging = (foe.vx * (me.x - foe.x) + foe.vy * (me.y - foe.y)) / Math.max(1, dist) > foe.s.speed * 0.2;
          const staggerTicks =
            wp.type !== 'melee' &&
            (charging || dist < 220) &&
            wp.damage * DAMAGE_SCALE >= 120 &&
            tick >= foe.staggerImmune &&
            !active(foe, 'turtle')
              ? Math.min(9, Math.round(3 + (wp.damage * DAMAGE_SCALE * 4) / Math.max(40, foe.s.weight) / 8))
              : 0;
          staggerFlag = staggerTicks > 0;
          if (invuln(foe)) {
            dmg = 0; // shots pass through the purge flash
            staggerFlag = false;
          }
          // knockback: big, slow hits shove the target; heavy mechs barely budge
          const kb = { kinetic: 1, energy: 0.5, explosive: 2.2, melee: 3 }[wp.type];
          const push = Math.min(170, (dmg * kb * 18) / Math.max(30, foe.s.weight));
          const d = dist || 1;
          pending.push({
            stagger: staggerTicks,
            target: i === 0 ? 1 : 0,
            dmg,
            kx: ((foe.x - me.x) / d) * push,
            ky: ((foe.y - me.y) / d) * push,
          });
          me.dealt += dmg;
        }
        events.push({
          t: tick,
          by: i === 0 ? 0 : 1,
          slot: wp.slot,
          type: wp.type,
          hit,
          dmg: Math.round(dmg),
          blocked,
          ...(crit ? { crit: true } : {}),
          ...(!hit && foe.qbUntil > tick ? { dodged: true } : {}),
          ...(hit && staggerFlag ? { stagger: true } : {}),
        });
      });
    }
    for (const p of pending) {
      const t = mechs[p.target]!;
      if (invuln(t)) continue;
      t.hp -= p.dmg;
      if (t.s.behavior === 'velocity' && p.dmg > 0)
        t.momentum = Math.max(0, t.momentum - 0.06 - (p.dmg / t.s.hp) * 1.2);
      if (p.stagger > 0) {
        t.planted = Math.max(t.planted, p.stagger);
        t.ob = false;
        t.vx *= 0.3;
        t.vy *= 0.3;
        t.staggerImmune = tick + p.stagger + 18;
      }
      if (!active(t, 'turtle')) {
        t.vx += p.kx;
        t.vy += p.ky;
      }
    }

    // ── last stand: the first killing blow purges the armor instead ──
    for (let i = 0; i < 2; i++) {
      const m = mechs[i]!;
      if (m.hp > 0 || m.lastStand >= 0) continue;
      if (!rng.chance(LAST_STAND_CHANCE)) continue;
      const o = mechs[1 - i]!;
      m.hp = 1;
      m.lastStand = tick;
      m.overheated = false;
      m.heat = 0;
      m.planted = 0;
      lastStands.push({ t: tick, by: i === 0 ? 0 : 1 });
      // the plates blow off like shrapnel and shove the enemy back
      const sx = o.x - m.x;
      const sy = o.y - m.y;
      const sd = Math.sqrt(sx * sx + sy * sy) || 1;
      if (sd < 320) {
        const shove = 260 / (1 + o.s.weight / 100);
        o.vx += (sx / sd) * shove;
        o.vy += (sy / sd) * shove;
        if (!invuln(o)) o.hp = Math.max(Math.min(o.hp, 1), o.hp - o.s.hp * 0.04); // shrapnel never kills
        o.ob = false;
      }
    }

    if (tick % FRAME_EVERY === 0) pushFrame();
    if (mechs[0].hp <= 0 || mechs[1].hp <= 0) break;
  }

  const [m0, m1] = mechs;
  const ko = m0.hp <= 0 || m1.hp <= 0;
  let winner: 0 | 1;
  if (m0.hp <= 0 && m1.hp > 0) winner = 1;
  else if (m1.hp <= 0 && m0.hp > 0) winner = 0;
  else {
    const r0 = m0.hp / m0.s.hp;
    const r1 = m1.hp / m1.s.hp;
    winner = r0 === r1 ? (rng.chance(0.5) ? 0 : 1) : r0 > r1 ? 0 : 1;
  }
  if (tick % FRAME_EVERY !== 0) pushFrame();

  return {
    winner,
    reason: ko ? 'ko' : 'time',
    ticks: Math.min(tick, MAX_TICKS),
    maxHp: [m0.s.hp, m1.s.hp],
    frames,
    events,
    damage: [Math.round(m0.dealt), Math.round(m1.dealt)],
    hazardHits,
    specials,
    moves,
    lastStands,
  };
};
