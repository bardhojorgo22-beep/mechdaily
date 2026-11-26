import type { Arena } from './arenas';
import {
  computeStats,
  type Build,
  type MechStats,
  type MountedWeapon,
  type Tax,
} from './mech';
import { clamp, createRng } from './rng';

export const TICKS_PER_SECOND = 10;
export const MAX_TICKS = 90 * TICKS_PER_SECOND;
export const FRAME_EVERY = 2;
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
  dealt: number;
};

const newState = (
  s: MechStats,
  x: number,
  y: number,
  seedOffset: number
): MechState => ({
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
  dealt: 0,
});

const reach = (m: MechState, wp: MountedWeapon, arena: Arena) =>
  arena.fog ? Math.min(wp.maxRange, Math.max(250, m.s.sensor)) : wp.maxRange;

const usable = (m: MechState, i: number) => {
  const wp = m.s.weapons[i]!;
  const ammo = m.ammo[i];
  return (
    (ammo === null || (ammo !== undefined && ammo > 0)) &&
    (wp.energyCost === 0 || m.s.energyCap >= wp.energyCost)
  );
};

/** The distance this pilot wants to fight at. */
const desiredRange = (m: MechState, arena: Arena): number => {
  const ranges: { min: number; max: number }[] = [];
  m.s.weapons.forEach((wp, i) => {
    if (usable(m, i))
      ranges.push({ min: wp.minRange, max: reach(m, wp, arena) });
  });
  if (ranges.length === 0) return 0; // out of ammo: charge and hope
  const maxes = ranges.map((r) => r.max).sort((a, b) => a - b);
  const longest = maxes[maxes.length - 1]!;
  const shortest = maxes[0]!;
  const minNeeded = Math.max(...ranges.map((r) => r.min));
  switch (m.s.behavior) {
    case 'rush':
    case 'berserk':
      return shortest * 0.55;
    case 'kite':
      return Math.max(longest * 0.85, minNeeded + 40);
    case 'sniper':
      return Math.max(longest * 0.92, minNeeded + 40);
    case 'turtle':
      return longest * 0.7;
    case 'flank':
      return maxes[Math.floor(maxes.length / 2)]! * 0.6;
  }
};

const armorAgainst = (target: MechStats, type: MountedWeapon['type']) => {
  switch (type) {
    case 'kinetic':
      return target.armorK;
    case 'energy':
      return target.armorE;
    case 'explosive':
      return (target.armorK + target.armorE) * 0.3;
    case 'melee':
      return target.armorK * 0.5;
  }
};

export type Fighter = { build: Build; tax?: Tax };

export const simulateBattle = (
  a: Fighter,
  b: Fighter,
  arena: Arena,
  seed: string
): BattleResult => {
  const rng = createRng(`battle:${seed}`);
  const W = arena.width;
  const H = arena.height;
  const mechs: [MechState, MechState] = [
    newState(computeStats(a.build, arena, a.tax), W * 0.12, H * 0.5, 0),
    newState(computeStats(b.build, arena, b.tax), W * 0.88, H * 0.5, 1),
  ];
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
        if (rng.chance(0.5)) m.hp -= arena.hazard.damage * (1 - m.s.armorK);
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
      const want = desiredRange(me, arena);
      const band = 30;
      let radial = 0;
      if (dist > want + band) radial = 1;
      else if (dist < want - band) radial = -1;

      let strafe = 0.15;
      if (me.s.behavior === 'flank') strafe = 0.85;
      else if (me.s.behavior === 'kite') strafe = 0.4;
      else if (me.s.behavior === 'rush' || me.s.behavior === 'berserk')
        strafe = 0.12;
      if (tick % 45 === 0 && rng.chance(0.5)) me.strafeSign *= -1;

      // Backed into a wall? Slide along it instead of getting pinned.
      const nearWall = me.x < 90 || me.x > W - 90 || me.y < 70 || me.y > H - 70;
      if (radial < 0 && nearWall) {
        strafe = 1;
        radial = -0.2;
        const tx = -uy * me.strafeSign;
        const ty = ux * me.strafeSign;
        if (
          me.x + tx * 60 < 20 ||
          me.x + tx * 60 > W - 20 ||
          me.y + ty * 60 < 20 ||
          me.y + ty * 60 > H - 20
        ) {
          me.strafeSign *= -1;
        }
      }

      let mx = ux * radial + -uy * strafe * me.strafeSign;
      let my = uy * radial + ux * strafe * me.strafeSign;
      const mag = Math.sqrt(mx * mx + my * my);

      const sniperSet =
        me.s.behavior === 'sniper' && radial >= 0 && dist <= want + band;
      const turtleSet = me.s.behavior === 'turtle' && radial <= 0;
      if (me.planted > 0 || sniperSet || turtleSet || mag < 0.001) {
        me.moving = false;
        if (me.planted > 0) me.planted--;
      } else {
        mx /= mag;
        my /= mag;
        const boostCost = me.s.boostDrain * DT;
        let speed = me.s.walkSpeed;
        if (me.energy >= boostCost) {
          speed = me.s.speed;
          me.energy -= boostCost;
        }
        me.x = clamp(me.x + mx * speed * DT, 20, W - 20);
        me.y = clamp(me.y + my * speed * DT, 20, H - 20);
        me.moving = true;
      }
    }

    // ── energy + heat ──
    for (const m of mechs) {
      m.energy = clamp(m.energy + m.s.energyRegen * DT, 0, m.s.energyCap);
      m.heat = Math.max(0, m.heat - m.s.cooling * DT);
      if (m.heat >= 100) m.overheated = true;
      else if (m.overheated && m.heat < 40) m.overheated = false;
      if (m.s.behavior === 'berserk' && m.heat > 100) m.hp -= m.s.hp * 0.004;
    }

    // ── firing (resolved simultaneously) ──
    const pending: { target: 0 | 1; dmg: number }[] = [];
    for (let i = 0; i < 2; i++) {
      const me = mechs[i]!;
      const foe = mechs[1 - i]!;
      const dx = foe.x - me.x;
      const dy = foe.y - me.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      me.s.weapons.forEach((wp, w) => {
        me.cooldown[w] = me.cooldown[w]! - 1;
        if (me.cooldown[w]! > 0) return;
        const ammo = me.ammo[w];
        if (ammo !== null && ammo !== undefined && ammo <= 0) return;
        if (dist < wp.minRange || dist > reach(me, wp, arena)) return;
        if (me.energy < wp.energyCost) return;
        if (me.overheated && me.s.behavior !== 'berserk') return;

        me.cooldown[w] = wp.cooldown;
        me.heat += wp.heat * arena.heatGen;
        me.energy -= wp.energyCost;
        if (ammo !== null && ammo !== undefined) me.ammo[w] = ammo - 1;
        if (wp.heavy && me.s.legType !== 'tank')
          me.planted = Math.max(me.planted, 6);

        let acc = wp.accuracy * me.s.accuracy * (1 - foe.s.jam);
        if (me.s.behavior === 'sniper' && !me.moving) acc *= 1.42;
        if (me.s.behavior === 'turtle') acc *= 1.12;
        if (wp.type === 'explosive') acc *= arena.explosiveAccuracy;
        acc *= 1 - 0.25 * (dist / wp.maxRange);
        let ev =
          foe.s.evasion *
          (foe.moving ? 1 : 0.3) *
          (0.5 + 0.5 * (dist / wp.maxRange));
        if (foe.s.behavior === 'kite' && foe.moving) ev *= 1.2;
        if (wp.homing) ev *= 0.4;
        const p = clamp(acc * (1 - ev), 0.05, 0.97);
        const hit = rng.chance(p);

        let dmg = 0;
        let blocked = false;
        if (hit) {
          dmg =
            wp.damage *
            DAMAGE_SCALE *
            (wp.type === 'energy' ? arena.energyDamage : 1);
          if (foe.s.behavior === 'turtle' && !foe.moving) dmg *= 0.8; // braced
          if (foe.s.behavior === 'rush') dmg *= 1.08; // reckless
          dmg *= 1 - armorAgainst(foe.s, wp.type);
          const sh = foe.s.shield;
          if (sh && rng.chance(0.6)) {
            const canAfford = foe.energy >= sh.energyPerHit;
            if (canAfford) {
              foe.energy -= sh.energyPerHit;
              dmg *=
                1 -
                (wp.type === 'melee' && sh.energyPerHit > 0
                  ? sh.block * 0.4
                  : sh.block);
              blocked = true;
            }
          }
          pending.push({ target: i === 0 ? 1 : 0, dmg });
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
        });
      });
    }
    for (const p of pending) mechs[p.target]!.hp -= p.dmg;

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
  };
};
