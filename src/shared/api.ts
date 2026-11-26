import type { FactionId } from './game/factions';
import type { Build, Tax } from './game/mech';
import type { TournamentResult } from './game/tournament';

export type Champion = {
  day: string;
  dayNumber: number;
  name: string;
  pilot: string;
  build: Build;
};

export type Profile = {
  entries: number;
  wins: number;
  titles: number;
  streak: number;
  bestStreak: number;
  chalWins: number;
  chalLosses: number;
};

export type LastResult = {
  day: string;
  dayNumber: number;
  postId: string | null;
  championName: string;
  championPilot: string;
  /** null if you didn't enter that day */
  mine: { wins: number; rounds: number; champion: boolean } | null;
};

export type ChallengeRecord = {
  seed: string;
  arenaId: string;
  aPilot: string;
  bPilot: string;
  aBuild: Build;
  bBuild: Build;
  winner: 0 | 1;
  at: number;
};
export type ChallengeResponse = { type: 'challenge'; record: ChallengeRecord; left: number };
export type ChallengesResponse = { type: 'challenges'; list: ChallengeRecord[] };

export type RaidState = {
  bossId: string;
  hp: number;
  max: number;
  killedBy: string | null;
  attemptsLeft: number;
  myDamage: number;
  top: { username: string; damage: number }[];
  factions: Record<FactionId, number>;
};

export type RaidResponse = {
  type: 'raid';
  seed: string;
  attempt: number;
  damage: number;
  hp: number;
  max: number;
  lastHit: boolean;
};

export type InitResponse = {
  type: 'init';
  username: string | null;
  day: string;
  dayNumber: number;
  /** Which day this post belongs to. Old posts show their results. */
  postDay: string;
  postDayNumber: number;
  todayPostId: string | null;
  arenaId: string;
  nextRolloverIso: string;
  tax: Tax;
  myBuild: Build | null;
  myEntry: Build | null;
  entryCount: number;
  faction: FactionId | null;
  factionTotals: Record<FactionId, number>;
  factionToday: Record<FactionId, number>;
  profile: Profile;
  champions: Champion[];
  last: LastResult | null;
  raid: RaidState;
  reel: SharedFight[];
};

/** A replay someone shared to the comments. Everything needed to re-run it exactly. */
export type ShareRequest = {
  kind: 'duel' | 'raid';
  a: Build;
  b: Build;
  aLabel: string;
  bLabel: string;
  arenaId: string;
  seed: string;
  tax: Tax;
  /** raid: which day's boss */
  day?: string;
};
export type SharedFight = ShareRequest & {
  id: string;
  by: string;
  at: number;
  headline: string;
};
export type ShareResponse = { type: 'share'; fight: SharedFight; left: number };

export type SaveRequest = { build: Build };
export type EnterResponse = {
  type: 'enter';
  entryCount: number;
  streak: number;
};
export type FactionRequest = { faction: FactionId };

export type ResultsResponse = {
  type: 'results';
  dayNumber: number;
  result: TournamentResult;
};

export type LeaderboardResponse = {
  type: 'leaderboard';
  pilots: { username: string; wins: number }[];
};

export type ErrorResponse = { status: 'error'; message: string };
