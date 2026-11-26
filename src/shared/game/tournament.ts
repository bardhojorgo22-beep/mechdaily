import type { Arena } from './arenas';
import { simulateBattle } from './battle';
import { botsForDay } from './bots';
import type { FactionId } from './factions';
import type { Build, Tax } from './mech';
import { SLOTS, partsForSlot } from './parts';
import { clamp, createRng } from './rng';

export type Entrant = {
  id: string; // reddit user id, or bot:N
  pilot: string; // reddit username, or '' for bots
  faction: FactionId | null;
  build: Build;
  bot: boolean;
};

export type Match = { a: number; b: number; w: number; seed: string };

export type TournamentResult = {
  day: string;
  arenaId: string;
  tax: Tax;
  entrants: Entrant[];
  rounds: Match[][];
  champion: number;
  factionPoints: Partial<Record<FactionId, number>>;
};

export const MIN_BRACKET = 8;
export const MAX_BRACKET = 256;

export const POINTS = { enter: 1, win: 2, champion: 5 } as const;

/** Single elimination. Empty seats are filled with bots so there's always a bracket. */
export const runTournament = (day: string, arena: Arena, tax: Tax, humans: Entrant[]): TournamentResult => {
  const rng = createRng(`bracket:${day}`);
  const capped = humans.slice(0, MAX_BRACKET);
  let size = MIN_BRACKET;
  while (size < capped.length) size *= 2;
  const bots: Entrant[] = botsForDay(day, size - capped.length).map((build, i) => ({
    id: `bot:${i}`,
    pilot: '',
    faction: null,
    build,
    bot: true,
  }));
  const entrants = [...capped, ...bots];
  // seeded shuffle of seats
  const seats = entrants.map((_, i) => i);
  for (let i = seats.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [seats[i], seats[j]] = [seats[j]!, seats[i]!];
  }

  const rounds: Match[][] = [];
  let alive = seats;
  let r = 0;
  while (alive.length > 1) {
    const round: Match[] = [];
    const next: number[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const a = alive[i]!;
      const b = alive[i + 1]!;
      const seed = `${day}:r${r}:m${i / 2}`;
      const res = simulateBattle({ build: entrants[a]!.build, tax }, { build: entrants[b]!.build, tax }, arena, seed);
      const w = res.winner === 0 ? a : b;
      round.push({ a, b, w, seed });
      next.push(w);
    }
    rounds.push(round);
    alive = next;
    r++;
  }
  const champion = alive[0]!;

  const factionPoints: Partial<Record<FactionId, number>> = {};
  const add = (e: Entrant | undefined, pts: number) => {
    if (!e || e.bot || !e.faction) return;
    factionPoints[e.faction] = (factionPoints[e.faction] ?? 0) + pts;
  };
  for (const e of capped) add(e, POINTS.enter);
  for (const round of rounds) for (const m of round) add(entrants[m.w], POINTS.win);
  add(entrants[champion], POINTS.champion);

  return {
    day,
    arenaId: arena.id,
    tax,
    entrants,
    rounds,
    champion,
    factionPoints,
  };
};

/** How far an entrant got: number of matches won. */
export const winsFor = (t: TournamentResult, idx: number) =>
  t.rounds.reduce((n, round) => n + round.filter((m) => m.w === idx).length, 0);

/**
 * Popularity tax for tomorrow, from today's human entries.
 * 0 when a part is used at the "fair share" rate, rising to 1 if everyone uses it.
 */
export const computeTax = (builds: Build[]): Tax => {
  const tax: Tax = {};
  if (builds.length < 4) return tax;
  for (const slot of SLOTS) {
    const options = partsForSlot(slot);
    const fair = 1 / options.length;
    for (const part of options) {
      const share = builds.filter((b) => b.parts[slot] === part.id).length / builds.length;
      const t = clamp((share - fair) / (1 - fair), 0, 1);
      if (t > 0.02) tax[part.id] = Math.round(t * 100) / 100;
    }
  }
  return tax;
};
