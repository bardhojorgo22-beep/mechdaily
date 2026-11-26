import { createRng, hashString } from './rng';
import type { LegType } from './parts';

export type Arena = {
  id: string;
  name: string;
  blurb: string;
  width: number;
  height: number;
  legSpeed: Partial<Record<LegType, number>>;
  heatGen: number;
  cooling: number;
  energyDamage: number;
  genOutput: number;
  boostDrain: number;
  speed: number;
  explosiveAccuracy: number;
  evasion: Partial<Record<LegType, number>>;
  fog: boolean; // weapons can't reach past the head/radar sensor range
  hazard: { damage: number; every: number } | null; // scrap falling on both
};

const base: Omit<Arena, 'id' | 'name' | 'blurb'> = {
  width: 1000,
  height: 600,
  legSpeed: {},
  heatGen: 1,
  cooling: 1,
  energyDamage: 1,
  genOutput: 1,
  boostDrain: 1,
  speed: 1,
  explosiveAccuracy: 1,
  evasion: {},
  fog: false,
  hazard: null,
};

export const ARENAS: Arena[] = [
  { ...base, id: 'yard', name: 'The Yard', blurb: 'No tricks today. Straight fight.' },
  { ...base, id: 'fog', name: 'Fog Bank', blurb: "You can't shoot what you can't see. Sensors matter.", fog: true },
  {
    ...base,
    id: 'mud',
    name: 'Mudflats',
    blurb: 'Legs sink. Treads grind on. Hover floats over it.',
    legSpeed: { biped: 0.55, reverse: 0.5, quad: 0.65, tank: 0.85, hover: 1 },
  },
  { ...base, id: 'heat', name: 'Heatwave', blurb: 'Everything runs hot. Cooling wins.', heatGen: 1.45, cooling: 0.6 },
  {
    ...base,
    id: 'storm',
    name: 'Ion Storm',
    blurb: 'Lasers hit harder. Generators sputter.',
    energyDamage: 1.3,
    genOutput: 0.75,
  },
  {
    ...base,
    id: 'moon',
    name: 'Low Gravity',
    blurb: 'Boosting is cheap and floaty. Missiles drift.',
    boostDrain: 0.55,
    speed: 1.15,
    explosiveAccuracy: 0.8,
    evasion: { reverse: 1.25, biped: 1.1 },
  },
  { ...base, id: 'alley', name: 'Narrow Alley', blurb: 'Tiny map. Nowhere to run.', width: 520, height: 320 },
  { ...base, id: 'plains', name: 'Salt Flats', blurb: 'Huge open map. Long guns rule.', width: 1600, height: 900 },
  { ...base, id: 'scrap', name: 'Scrap Rain', blurb: 'Junk falls from the sky. Bring armor.', hazard: { damage: 70, every: 25 } },
];

export const ARENA_BY_ID: Record<string, Arena> = Object.fromEntries(ARENAS.map((a) => [a.id, a]));

export const getArena = (id: string): Arena => ARENA_BY_ID[id] ?? ARENAS[0]!;

/** "2026-11-26" in UTC. The game day flips at 00:00 UTC. */
export const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

export const previousDay = (day: string): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return dayKey(d);
};

const EPOCH = Date.UTC(2026, 0, 1);

const cycleOrder = (cycle: number): Arena[] => {
  const rng = createRng(hashString(`arena-cycle:${cycle}`));
  const order = [...ARENAS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
};

/**
 * Same arena for everyone on a given day. Arenas are dealt like a shuffled
 * deck, so every arena shows up once every ~9 days and never twice in a row.
 */
export const arenaForDay = (day: string): Arena => {
  const n = Math.floor((Date.parse(`${day}T00:00:00Z`) - EPOCH) / 86_400_000);
  const len = ARENAS.length;
  const cycle = Math.floor(n / len);
  const pos = ((n % len) + len) % len;
  const order = cycleOrder(cycle);
  const prevLast = cycleOrder(cycle - 1)[len - 1]!;
  if (order[0]!.id === prevLast.id) [order[0], order[1]] = [order[1]!, order[0]!];
  return order[pos]!;
};
