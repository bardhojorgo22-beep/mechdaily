import type { Arena } from './arenas';
import { simulateBattle, type BattleResult, type Fighter } from './battle';
import type { Build, Tax } from './mech';
import { hashString } from './rng';

// The daily raid boss. Everyone in the subreddit attacks the same boss;
// all damage comes off one shared HP pool.

export type Boss = { id: string; title: string; taunt: string; build: Build };

const boss = (id: string, title: string, taunt: string, parts: Build['parts'], paint: Build['paint']): Boss => ({
  id,
  title,
  taunt,
  build: { name: title, parts, paint },
});

export const BOSSES: Boss[] = [
  boss(
    'colossus',
    'The Colossus',
    'Slow. Huge. Brought a cannon.',
    {
      head: 'h-bucket',
      core: 'c-vault',
      arms: 'a-ram',
      legs: 'l-tread',
      booster: 'b-puff',
      generator: 'g-coil',
      weaponR: 'r-rail',
      weaponL: 'lw-door',
      back: 'bk-howitzer',
      chip: 'p-turtle',
    },
    { body: 6, trim: 0, decal: 2 }
  ),
  boss(
    'hen',
    'Mother Hen',
    'Lays missiles. Lots of them.',
    {
      head: 'h-owl',
      core: 'c-ox',
      arms: 'a-brace',
      legs: 'l-crab',
      booster: 'b-jet',
      generator: 'g-battery',
      weaponR: 'r-buzz',
      weaponL: 'lw-pistol',
      back: 'bk-swarm',
      chip: 'p-kite',
    },
    { body: 4, trim: 4, decal: 6 }
  ),
  boss(
    'reaper',
    'The Reaper',
    'Fast, sharp, and it hates you.',
    {
      head: 'h-needle',
      core: 'c-radiator',
      arms: 'a-wire',
      legs: 'l-hopper',
      booster: 'b-rocket',
      generator: 'g-furnace',
      weaponR: 'r-pile',
      weaponL: 'lw-saber',
      back: 'bk-fins',
      chip: 'p-berserk',
    },
    { body: 2, trim: 6, decal: 2 }
  ),
  boss(
    'prism',
    'Lightbreaker',
    'Every laser in the yard, glued together.',
    {
      head: 'h-crown',
      core: 'c-prism',
      arms: 'a-gimbal',
      legs: 'l-strider',
      booster: 'b-drift',
      generator: 'g-furnace',
      weaponR: 'r-beam',
      weaponL: 'lw-lance',
      back: 'bk-orbit',
      chip: 'p-flank',
    },
    { body: 3, trim: 1, decal: 7 }
  ),
  boss(
    'furnace',
    'Old Furnace',
    'Runs hot. Burns hotter.',
    {
      head: 'h-lantern',
      core: 'c-radiator',
      arms: 'a-ram',
      legs: 'l-crab',
      booster: 'b-jet',
      generator: 'g-furnace',
      weaponR: 'r-scatter',
      weaponL: 'lw-flamer',
      back: 'bk-plate',
      chip: 'p-rush',
    },
    { body: 2, trim: 5, decal: 5 }
  ),
  boss(
    'ghost',
    'The Ghost',
    "You'll never pin it down.",
    {
      head: 'h-owl',
      core: 'c-shell',
      arms: 'a-wire',
      legs: 'l-skate',
      booster: 'b-drift',
      generator: 'g-coil',
      weaponR: 'r-rifle',
      weaponL: 'lw-aegis',
      back: 'bk-chaff',
      chip: 'p-flank',
    },
    { body: 7, trim: 1, decal: 6 }
  ),
];

export const bossForDay = (day: string): Boss => BOSSES[hashString(`boss:${day}`) % BOSSES.length]!;

/** Boss is much tougher than a normal mech. */
export const BOSS_MODS = { hp: 7, damage: 0.85 };
export const RAID_ATTEMPTS = 3;

/** Some bosses are much easier to hurt than others; scale their pools so every boss takes similar effort. */
const POOL_SCALE: Record<string, number> = {
  colossus: 2,
  prism: 1.1,
  hen: 0.85,
  furnace: 0.75,
  reaper: 0.7,
  ghost: 0.55,
};
export const raidPoolFor = (players: number, bossId?: string) =>
  Math.round(((12_000 + 7_000 * Math.max(0, players)) * (bossId ? (POOL_SCALE[bossId] ?? 1) : 1)) / 500) * 500;

export const bossFighter = (day: string, tax: Tax): Fighter => ({ build: bossForDay(day).build, tax, mods: BOSS_MODS });

export const raidSeed = (day: string, userId: string, attempt: number) => `raid:${day}:${userId}:${attempt}`;

export const simulateRaid = (day: string, arena: Arena, tax: Tax, build: Build, seed: string): BattleResult =>
  simulateBattle({ build, tax }, bossFighter(day, tax), arena, seed);
