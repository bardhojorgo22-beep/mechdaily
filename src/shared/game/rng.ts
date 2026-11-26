// Deterministic helpers. The battle sim must give identical results on the
// server and on every player's device, so we only use integer hashing,
// + - * / and Math.sqrt (which IEEE-754 guarantees). No sin/cos/random.

export type Rng = {
  next: () => number; // [0, 1)
  int: (maxExclusive: number) => number;
  chance: (p: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
};

export const hashString = (input: string): number => {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

export const createRng = (seed: number | string): Rng => {
  let a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  // mulberry32
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (maxExclusive: number) => Math.floor(next() * maxExclusive);
  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: <T,>(items: readonly T[]): T => {
      const item = items[int(items.length)];
      if (item === undefined) throw new Error('pick from empty list');
      return item;
    },
  };
};

export const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
