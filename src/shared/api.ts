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
};

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
